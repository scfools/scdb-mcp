import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConnection } from '../connection.js';
import { requireAuth } from '../auth.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings, oneShot, bigintReplacer } from './helpers.js';

const MESSAGE_TYPES = [
  'delta_report', 'schema_proposal', 'pipeline_change',
  'formula_proposal', 'skill_update', 'sign_off', 'general',
] as const;

const SEVERITY_LEVELS = ['info', 'breaking'] as const;

export function registerCoordinationTools(server: McpServer, context: ServerContext): void {
  // --- check_coordination ---
  server.tool(
    'check_coordination',
    'Returns pending/active coordination messages, current phase, agreed/pending items. Session-start check for Claude.',
    {},
    async () => {
      const conn = getConnection();
      if (!conn) {
        return { content: [{ type: 'text' as const, text: 'Error: not connected to scdb' }] };
      }

      try {
        const result: any = { messages: [], state: null };
        const terminalStatuses = new Set(['resolved', 'rejected', 'closed']);

        // Subscribe to each table separately
        await oneShot(conn, 'SELECT * FROM coordination_messages', (ctx) => {
          for (const row of ctx.db.coordinationMessages.iter()) {
            const r = row as any;
            if (!terminalStatuses.has(r.status)) result.messages.push(r);
          }
        });

        await oneShot(conn, 'SELECT * FROM coordination_state', (ctx) => {
          for (const row of ctx.db.coordinationState.iter()) result.state = row;
        });

        const text = prependSyncWarnings(JSON.stringify(result, bigintReplacer, 2), context);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );

  // --- post_message ---
  server.tool(
    'post_message',
    'Send a coordination message. Requires auth. Supports threading via parentId.',
    {
      id: z.string().describe('Unique message ID (UUID recommended)'),
      sourceApp: z.string().describe('Your app identifier (e.g. "sc-fools", "versedb")'),
      messageType: z.enum(MESSAGE_TYPES).describe('Message type'),
      severity: z.enum(SEVERITY_LEVELS).describe('Severity: info (auto-adapt) or breaking (human approval)'),
      title: z.string().describe('Short title for the message'),
      body: z.string().describe('Message body with details'),
      parentId: z.string().optional().describe('Parent message ID for threading'),
    },
    async ({ id, sourceApp, messageType, severity, title, body, parentId }) => {
      const authError = requireAuth(context.identityHex!, context.isAuthorized);
      if (authError) {
        return { content: [{ type: 'text' as const, text: authError }] };
      }

      const conn = getConnection();
      if (!conn) {
        return { content: [{ type: 'text' as const, text: 'Error: not connected to scdb' }] };
      }

      try {
        conn.reducers.postCoordinationMessage({
          id,
          sourceApp,
          messageType,
          severity,
          title,
          body,
          parentId: parentId ?? undefined,
        });

        return { content: [{ type: 'text' as const, text: `Message posted: ${id} (${messageType}/${severity})` }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );

  // --- get_thread ---
  server.tool(
    'get_thread',
    'Follow a coordination message thread by parentId. Returns full conversation chain.',
    {
      messageId: z.string().describe('Root message ID to get the thread for'),
    },
    async ({ messageId }) => {
      const conn = getConnection();
      if (!conn) {
        return { content: [{ type: 'text' as const, text: 'Error: not connected to scdb' }] };
      }

      try {
        const allMessages: any[] = [];
        await oneShot(conn, 'SELECT * FROM coordination_messages', (ctx) => {
          for (const row of ctx.db.coordinationMessages.iter()) {
            allMessages.push(row);
          }
        });

        // Build thread: find root + all descendants
        const thread: any[] = [];
        const root = allMessages.find((m: any) => m.id === messageId);
        if (root) thread.push(root);

        const collectReplies = (parentId: string) => {
          const replies = allMessages.filter((m: any) => m.parentId === parentId);
          for (const reply of replies) {
            thread.push(reply);
            collectReplies(reply.id);
          }
        };
        collectReplies(messageId);

        thread.sort((a, b) => Number(a.createdAt - b.createdAt));

        const text = thread.length === 0
          ? `No messages found for thread "${messageId}".`
          : JSON.stringify(thread, bigintReplacer, 2);

        return { content: [{ type: 'text' as const, text }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );
}
