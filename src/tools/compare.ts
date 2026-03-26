import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConnection } from '../connection.js';
import { discoverPaths } from '../discovery.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings, oneShot, toCamelCase } from './helpers.js';

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

/**
 * Normalize a value for comparison: coerce strings/numbers/bigints to a
 * canonical form so that "0" vs 0, "15.0" vs 15, and BigInt(3) vs 3 all
 * compare as equal.
 */
export function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // Try to interpret as a number — handles "0"/"1", "15.0", etc.
    const n = Number(v);
    if (!Number.isNaN(n) && v.trim() !== '') return n;
    return v;
  }
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = normalizeValue(val);
    }
    return out;
  }
  return v;
}

/**
 * Compare two records by the **intersection** of their keys.
 * Returns true if the records match on all shared fields after normalization.
 */
export function recordsMatch(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const sharedKeys = Object.keys(a).filter(k => k in b);
  if (sharedKeys.length === 0) return true;
  for (const k of sharedKeys) {
    const na = normalizeValue(a[k]);
    const nb = normalizeValue(b[k]);
    if (JSON.stringify(na) !== JSON.stringify(nb)) return false;
  }
  return true;
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
              if (recordsMatch(localByPk.get(pk)!, remoteByPk.get(pk)!)) unchanged++;
              else changed++;
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
