import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sqlQuery } from '../connection.js';
import { hashSkillFiles, buildSyncWarnings } from '../sync-check.js';
import type { ServerContext } from '../types.js';
import { bigintReplacer } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);

/** Find package root by walking up from current file until package.json is found. */
function findPackageRoot(): string {
  let dir = dirname(__filename);
  while (dir !== resolve(dir, '..')) {
    try {
      readFileSync(resolve(dir, 'package.json'), 'utf-8');
      return dir;
    } catch {}
    dir = resolve(dir, '..');
  }
  return dirname(__filename); // fallback
}

const PACKAGE_ROOT = findPackageRoot();
const SKILLS_DIR = resolve(PACKAGE_ROOT, 'skills');

export function registerStatusTool(server: McpServer, context: ServerContext): void {
  server.tool(
    'sync_status',
    'Returns data version, per-app sync cursors, and version drift warnings. Re-runs sync check mid-session.',
    {},
    async () => {
      try {
        // Re-run sync check with fresh remote data
        const localSkillHashes = hashSkillFiles(SKILLS_DIR);

        // Run all three queries in parallel
        const [dataVersionRows, syncCursorRows, skillVersionRows] = await Promise.all([
          sqlQuery('SELECT * FROM data_version'),
          sqlQuery('SELECT * FROM app_sync_cursors'),
          sqlQuery('SELECT * FROM skill_versions'),
        ]);

        const result: any = {
          dataVersion: dataVersionRows[0] ?? null,
          syncCursors: syncCursorRows,
          warnings: [],
        };

        // Build warnings (no bindings hash check — no more bindings)
        const remoteDataHash = (result.dataVersion as any)?.hash ?? null;
        const warnings = buildSyncWarnings(
          localSkillHashes, skillVersionRows as any[],
          null, remoteDataHash,
        );
        context.syncWarnings = warnings;
        result.warnings = warnings;

        const text = JSON.stringify(result, bigintReplacer, 2);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] };
      }
    },
  );
}
