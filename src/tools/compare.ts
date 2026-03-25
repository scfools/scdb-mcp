import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConnection } from '../connection.js';
import { discoverPaths } from '../discovery.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings, oneShot, bigintReplacer, toCamelCase } from './helpers.js';

const TABLE_FILES: Record<string, string> = {
  manufacturers: 'manufacturers.json',
  ships: 'ships.json',
  components: 'components.json',
  ship_hardpoints: 'ship_hardpoints.json',
  hardpoint_compatibility: 'hardpoint_compat.json',
  ship_defaults: 'ship_defaults.json',
  inventory_containers: 'inventory_containers.json',
  ship_cargo: 'ship_cargo.json',
};

/** Get the primary key field for a table. */
function getPkField(tableName: string): string {
  const pkMap: Record<string, string> = {
    manufacturers: 'ref',
    ships: 'id',
    components: 'entityClassName',
    ship_hardpoints: 'id',
    hardpoint_compatibility: 'id',
    ship_defaults: 'id',
    inventory_containers: 'id',
    ship_cargo: 'id',
  };
  return pkMap[tableName] ?? 'id';
}

export function registerCompareTool(server: McpServer, context: ServerContext): void {
  server.tool(
    'compare_local_remote',
    'Diff local parsed JSON against scdb per table. Reports added/removed/changed counts.',
    {
      table: z.string().optional().describe('Specific table to compare (default: all tables)'),
    },
    async ({ table }) => {
      const conn = getConnection();
      if (!conn) {
        return { content: [{ type: 'text' as const, text: 'Error: not connected to scdb' }] };
      }

      const paths = discoverPaths();
      if (!paths.dataDir) {
        return { content: [{ type: 'text' as const, text: 'Error: Could not find parsed STDB data. Expected at `*/parsed/stdb/` or set `SCDB_DATA_DIR`.' }] };
      }

      const tablesToCompare = table ? { [table]: TABLE_FILES[table] } : TABLE_FILES;
      if (table && !TABLE_FILES[table]) {
        return { content: [{ type: 'text' as const, text: `Error: Unknown table "${table}". Available: ${Object.keys(TABLE_FILES).join(', ')}` }] };
      }

      try {
        const results: any[] = [];

        for (const [tableName, fileName] of Object.entries(tablesToCompare)) {
          const filePath = resolve(paths.dataDir, fileName);
          if (!existsSync(filePath)) {
            results.push({ table: tableName, error: `File not found: ${fileName}` });
            continue;
          }

          const localRecords: any[] = JSON.parse(readFileSync(filePath, 'utf-8'));
          const pkField = getPkField(tableName);
          const localByPk = new Map(localRecords.map(r => [String(r[pkField]), r]));

          // Fetch remote
          const remoteRecords: any[] = [];
          await oneShot(conn, `SELECT * FROM ${tableName}`, (ctx) => {
            const accessor = (ctx.db as any)[toCamelCase(tableName)];
            if (accessor) {
              for (const row of accessor.iter()) remoteRecords.push(row);
            }
          });

          const remoteByPk = new Map(remoteRecords.map((r: any) => [String(r[pkField]), r]));

          let added = 0, removed = 0, changed = 0, unchanged = 0;
          for (const [pk] of localByPk) {
            if (!remoteByPk.has(pk)) added++;
            else {
              // Simple JSON comparison for change detection
              const localJson = JSON.stringify(localByPk.get(pk), bigintReplacer);
              const remoteJson = JSON.stringify(remoteByPk.get(pk), bigintReplacer);
              if (localJson !== remoteJson) changed++;
              else unchanged++;
            }
          }
          for (const [pk] of remoteByPk) {
            if (!localByPk.has(pk)) removed++;
          }

          results.push({
            table: tableName,
            local: localRecords.length,
            remote: remoteRecords.length,
            added,
            removed,
            changed,
            unchanged,
          });
        }

        const text = prependSyncWarnings(JSON.stringify(results, null, 2), context);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );
}
