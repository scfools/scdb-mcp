import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sqlQuery, callReducer } from '../connection.js';
import { requireAuth } from '../auth.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings, bigintReplacer } from './helpers.js';

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
      try {
        const terminalStatuses = new Set(['resolved', 'rejected', 'closed']);

        const [allMessages, stateRows] = await Promise.all([
          sqlQuery('SELECT * FROM coordination_messages'),
          sqlQuery('SELECT * FROM coordination_state'),
        ]);

        const messages = allMessages.filter((r: any) => !terminalStatuses.has(r.status));
        const state = stateRows[0] ?? null;

        const result = { messages, state };
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

      try {
        await callReducer('post_coordination_message', [
          id, sourceApp, messageType, severity, title, body,
          parentId ? { some: parentId } : { none: [] },
        ]);

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
      try {
        const allMessages = await sqlQuery('SELECT * FROM coordination_messages');

        // Build thread: find root + all descendants
        const thread: any[] = [];
        const root = allMessages.find((m: any) => m.id === messageId);
        if (root) thread.push(root);

        const collectReplies = (parentId: string) => {
          const replies = allMessages.filter((m: any) => m.parentId === parentId);
          for (const reply of replies) {
            thread.push(reply);
            collectReplies(reply.id as string);
          }
        };
        collectReplies(messageId);

        thread.sort((a: any, b: any) => Number(a.createdAt) - Number(b.createdAt));

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
