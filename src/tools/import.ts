import { z } from 'zod';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sqlQuery, callReducer } from '../connection.js';
import { requireAuth } from '../auth.js';
import { discoverPaths } from '../discovery.js';
import type { ServerContext } from '../types.js';

const TABLES = [
  { file: 'manufacturers.json',          reducer: 'import_manufacturers',          stdbTable: 'manufacturers' },
  { file: 'ships.json',                  reducer: 'import_ships',                  stdbTable: 'ships' },
  { file: 'components.json',             reducer: 'import_components',             stdbTable: 'components' },
  { file: 'ship_hardpoints.json',        reducer: 'import_ship_hardpoints',        stdbTable: 'ship_hardpoints' },
  { file: 'hardpoint_compat.json',       reducer: 'import_hardpoint_compatibility', stdbTable: 'hardpoint_compatibility' },
  { file: 'ship_defaults.json',          reducer: 'import_ship_defaults',          stdbTable: 'ship_defaults' },
  { file: 'inventory_containers.json',   reducer: 'import_inventory_containers',   stdbTable: 'inventory_containers' },
  { file: 'ship_cargo.json',             reducer: 'import_ship_cargo',             stdbTable: 'ship_cargo' },
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
        const dataVersionRows = await sqlQuery('SELECT * FROM data_version');
        let currentSeq = 0;
        if (dataVersionRows.length > 0) {
          currentSeq = Number((dataVersionRows[0] as any).versionSeq ?? 0);
        }

        const newSeq = currentSeq + 1;

        // Call import reducers (chunk large payloads to stay under HTTP body limit)
        const MAX_PAYLOAD_BYTES = 900_000; // ~900KB safe limit
        for (const t of TABLES) {
          const data = fileContents.get(t.file)!;
          if (data.length <= MAX_PAYLOAD_BYTES) {
            await callReducer(t.reducer, [data, newSeq]);
          } else {
            const records = JSON.parse(data);
            let chunk: any[] = [];
            let chunkSize = 2; // account for []
            for (const rec of records) {
              const recStr = JSON.stringify(rec);
              if (chunkSize + recStr.length + 1 > MAX_PAYLOAD_BYTES && chunk.length > 0) {
                await callReducer(t.reducer, [JSON.stringify(chunk), newSeq]);
                chunk = [];
                chunkSize = 2;
              }
              chunk.push(rec);
              chunkSize += recStr.length + 1;
            }
            if (chunk.length > 0) {
              await callReducer(t.reducer, [JSON.stringify(chunk), newSeq]);
            }
          }
        }

        // Set data version
        const resolvedGameVersion = gameVersion ?? getGameVersion(paths.p4kDir);
        await callReducer('set_data_version', [hash, resolvedGameVersion, newSeq, JSON.stringify(counts), 0]);

        // Prune changelog
        await callReducer('prune_changelog', [4]);

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
