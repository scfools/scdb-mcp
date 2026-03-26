import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sqlQuery } from '../connection.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings, bigintReplacer } from './helpers.js';

export function registerFormulasTool(server: McpServer, context: ServerContext): void {
  server.tool(
    'formula_lookup',
    'Query shared formulas by name, domain, or list all. Returns expression, variables, implementation, verification status.',
    {
      name: z.string().optional().describe('Formula name or ID to look up'),
      domain: z.string().optional().describe('Filter by domain (e.g. "weapons", "thermal", "cargo")'),
    },
    async ({ name, domain }) => {
      try {
        const allFormulas = await sqlQuery('SELECT * FROM formulas');

        const formulas = allFormulas.filter((r: any) => {
          if (name && r.id !== name && r.name !== name) return false;
          if (domain && r.domain !== domain) return false;
          return true;
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
