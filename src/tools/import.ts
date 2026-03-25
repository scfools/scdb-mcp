import { z } from 'zod';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConnection } from '../connection.js';
import { requireAuth } from '../auth.js';
import { discoverPaths } from '../discovery.js';
import type { ServerContext } from '../types.js';
import { oneShot } from './helpers.js';

const TABLES = [
  { file: 'manufacturers.json',          reducer: 'importManufacturers',          stdbTable: 'manufacturers' },
  { file: 'ships.json',                  reducer: 'importShips',                  stdbTable: 'ships' },
  { file: 'components.json',             reducer: 'importComponents',             stdbTable: 'components' },
  { file: 'ship_hardpoints.json',        reducer: 'importShipHardpoints',         stdbTable: 'ship_hardpoints' },
  { file: 'hardpoint_compat.json',       reducer: 'importHardpointCompatibility', stdbTable: 'hardpoint_compatibility' },
  { file: 'ship_defaults.json',          reducer: 'importShipDefaults',           stdbTable: 'ship_defaults' },
  { file: 'inventory_containers.json',   reducer: 'importInventoryContainers',    stdbTable: 'inventory_containers' },
  { file: 'ship_cargo.json',             reducer: 'importShipCargo',              stdbTable: 'ship_cargo' },
] as const;

function getGameVersion(p4kDir: string | null): string {
  if (!p4kDir) return 'unknown';
  try {
    const entries = readdirSync(p4kDir)
      .map(name => ({ name, stat: statSync(resolve(p4kDir, name)) }))
      .filter(e => e.stat.isDirectory())
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    if (!entries.length) return 'unknown';
    const versionDir = resolve(p4kDir, entries[0].name);
    const manifestPath = resolve(versionDir, 'build_manifest.id');
    if (!existsSync(manifestPath)) return entries[0].name;

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const branch = manifest.Data?.Branch ?? '';
    const version = manifest.Data?.Version ?? '';
    const changelist = manifest.Data?.RequestedP4ChangeNum ?? '';
    return `${branch} (${version}) CL#${changelist}`;
  } catch {
    return 'unknown';
  }
}

export function registerImportTool(server: McpServer, context: ServerContext): void {
  server.tool(
    'import_to_scdb',
    'Push pre-parsed JSON to scdb. Reads from discovered data dir, computes hash, calls import reducers. Requires auth.',
    {
      gameVersion: z.string().optional().describe('Override game version string (auto-detected from build_manifest.id if omitted)'),
    },
    async ({ gameVersion }) => {
      const authError = requireAuth(context.identityHex!, context.isAuthorized);
      if (authError) {
        return { content: [{ type: 'text' as const, text: authError }] };
      }

      const conn = getConnection();
      if (!conn) {
        return { content: [{ type: 'text' as const, text: 'Error: not connected to scdb' }] };
      }

      const paths = discoverPaths();
      if (!paths.dataDir) {
        return { content: [{ type: 'text' as const, text: 'Error: Could not find parsed STDB data. Expected at `*/parsed/stdb/` or set `SCDB_DATA_DIR`.' }] };
      }

      try {
        // Read all JSON files and compute hash
        const fileContents = new Map<string, string>();
        const counts: Record<string, number> = {};
        const report: string[] = [];

        for (const t of TABLES) {
          const path = resolve(paths.dataDir, t.file);
          if (!existsSync(path)) {
            return { content: [{ type: 'text' as const, text: `Error: Missing file ${t.file} in ${paths.dataDir}` }] };
          }
          const content = readFileSync(path, 'utf-8');
          fileContents.set(t.file, content);
          const records = JSON.parse(content);
          counts[t.stdbTable] = records.length;
          report.push(`  ${t.stdbTable}: ${records.length} records`);
        }

        // Deterministic hash
        const sortedContent = [...fileContents.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, content]) => content)
          .join('');
        const hash = createHash('sha256').update(sortedContent).digest('hex');

        // Get current versionSeq
        let currentSeq = BigInt(0);
        await oneShot(conn, 'SELECT * FROM data_version', (ctx) => {
          for (const row of ctx.db.dataVersion.iter()) {
            currentSeq = (row as any).versionSeq;
          }
        });

        const newSeq = currentSeq + BigInt(1);

        // Call import reducers
        for (const t of TABLES) {
          const data = fileContents.get(t.file)!;
          (conn.reducers as any)[t.reducer]({ data, expectedSeq: newSeq });
        }

        // Set data version
        const resolvedGameVersion = gameVersion ?? getGameVersion(paths.p4kDir);
        conn.reducers.setDataVersion({
          hash,
          gameVersion: resolvedGameVersion,
          expectedSeq: newSeq,
          counts: JSON.stringify(counts),
          changeCount: BigInt(0),
        });

        // Prune changelog
        conn.reducers.pruneChangelog({ keepVersions: BigInt(4) });

        // Wait for reducers to process
        await new Promise(r => setTimeout(r, 3000));

        const text = [
          `Import complete (versionSeq: ${newSeq})`,
          `Data hash: ${hash.slice(0, 12)}...`,
          `Game version: ${resolvedGameVersion}`,
          '',
          'Records:',
          ...report,
        ].join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );
}
