import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callReducer } from '../connection.js';
import { requireAuth } from '../auth.js';
import type { ServerContext } from '../types.js';

export function registerAdminTools(server: McpServer, context: ServerContext): void {
  server.tool(
    'authorize_publisher',
    'Add a new collaborator identity to authorized_publishers. Requires auth.',
    {
      identity: z.string().describe('Hex-encoded SpacetimeDB identity of the new collaborator'),
      label: z.string().describe('Human-readable label (e.g. "versedb-dev", "sc-fools")'),
    },
    async ({ identity, label }) => {
      const authError = requireAuth(context.identityHex!, context.isAuthorized);
      if (authError) {
        return { content: [{ type: 'text' as const, text: authError }] };
      }

      try {
        await callReducer('add_authorized_publisher', [identity, label]);

        return {
          content: [{
            type: 'text' as const,
            text: `Authorized publisher added:\n  Identity: ${identity}\n  Label: ${label}\n\nThe collaborator should restart their MCP server to pick up the new auth.`,
          }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );
}
