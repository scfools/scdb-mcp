import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConnection } from '../connection.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings, oneShot, bigintReplacer } from './helpers.js';

export function registerFormulasTool(server: McpServer, context: ServerContext): void {
  server.tool(
    'formula_lookup',
    'Query shared formulas by name, domain, or list all. Returns expression, variables, implementation, verification status.',
    {
      name: z.string().optional().describe('Formula name or ID to look up'),
      domain: z.string().optional().describe('Filter by domain (e.g. "weapons", "thermal", "cargo")'),
    },
    async ({ name, domain }) => {
      const conn = getConnection();
      if (!conn) {
        return { content: [{ type: 'text' as const, text: 'Error: not connected to scdb' }] };
      }

      try {
        const formulas: any[] = [];
        await oneShot(conn, 'SELECT * FROM formulas', (ctx) => {
          for (const row of ctx.db.formulas.iter()) {
            const r = row as any;
            if (name && r.id !== name && r.name !== name) continue;
            if (domain && r.domain !== domain) continue;
            formulas.push(r);
          }
        });

        const text = prependSyncWarnings(
          formulas.length === 0
            ? `No formulas found${name ? ` matching "${name}"` : ''}${domain ? ` in domain "${domain}"` : ''}.`
            : JSON.stringify(formulas, bigintReplacer, 2),
          context,
        );

        return { content: [{ type: 'text' as const, text }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );
}
