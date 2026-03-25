import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConnection } from '../connection.js';
import { hashSkillFiles, loadBindingsVersion, buildSyncWarnings } from '../sync-check.js';
import type { ServerContext } from '../types.js';
import { oneShot, bigintReplacer } from './helpers.js';

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
const BINDINGS_DIR = resolve(PACKAGE_ROOT, 'bindings');

export function registerStatusTool(server: McpServer, context: ServerContext): void {
  server.tool(
    'sync_status',
    'Returns data version, per-app sync cursors, and version drift warnings. Re-runs sync check mid-session.',
    {},
    async () => {
      const conn = getConnection();
      if (!conn) {
        return { content: [{ type: 'text' as const, text: 'Error: not connected to scdb' }] };
      }

      try {
        // Re-run sync check with fresh remote data
        const localSkillHashes = hashSkillFiles(SKILLS_DIR);
        const bindingsVersion = loadBindingsVersion(BINDINGS_DIR);

        const result: any = { dataVersion: null, syncCursors: [], warnings: [] };
        const remoteSkillVersions: any[] = [];

        // Subscribe to each table separately (STDB SDK does not support multi-query subscribes)
        await oneShot(conn, 'SELECT * FROM data_version', (ctx) => {
          for (const row of ctx.db.dataVersion.iter()) result.dataVersion = row;
        });

        await oneShot(conn, 'SELECT * FROM app_sync_cursors', (ctx) => {
          for (const row of ctx.db.appSyncCursors.iter()) result.syncCursors.push(row);
        });

        await oneShot(conn, 'SELECT * FROM skill_versions', (ctx) => {
          for (const row of ctx.db.skillVersions.iter()) remoteSkillVersions.push(row);
        });

        // Build warnings
        const remoteDataHash = result.dataVersion?.hash ?? null;
        const warnings = buildSyncWarnings(
          localSkillHashes, remoteSkillVersions,
          bindingsVersion?.schemaHash ?? null, remoteDataHash,
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
