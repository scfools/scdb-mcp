import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConnection } from '../connection.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings, oneShot, bigintReplacer, toCamelCase } from './helpers.js';

export function registerQueryTool(server: McpServer, context: ServerContext): void {
  server.tool(
    'query_table',
    'One-shot read against scdb. Returns rows as JSON. Read-only, works without auth.',
    {
      table: z.string().describe('Table name (snake_case, e.g. "ships", "components", "formulas")'),
      where: z.string().optional().describe('Optional SQL WHERE clause (e.g. "type = \'WeaponGun\'")'),
      limit: z.number().optional().describe('Max rows to return (default: 100)'),
    },
    async ({ table, where, limit }) => {
      const conn = getConnection();
      if (!conn) {
        return { content: [{ type: 'text' as const, text: 'Error: not connected to scdb' }] };
      }

      const maxRows = limit ?? 100;
      let query = `SELECT * FROM ${table}`;
      if (where) query += ` WHERE ${where}`;

      try {
        const rows: any[] = [];
        await oneShot(conn, query, (ctx) => {
          const tableAccessor = (ctx.db as any)[toCamelCase(table)];
          if (!tableAccessor) throw new Error(`Table "${table}" not found.`);
          let count = 0;
          for (const row of tableAccessor.iter()) {
            if (count >= maxRows) break;
            rows.push(row);
            count++;
          }
        });

        const text = prependSyncWarnings(
          JSON.stringify(rows, bigintReplacer, 2),
          context,
        );

        return { content: [{ type: 'text' as const, text }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );
}
