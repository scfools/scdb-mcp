import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sqlQuery } from '../connection.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings, bigintReplacer } from './helpers.js';

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
      const maxRows = limit ?? 100;
      let query = `SELECT * FROM ${table}`;
      if (where) query += ` WHERE ${where}`;

      try {
        let rows = await sqlQuery(query);
        rows = rows.slice(0, maxRows);

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
