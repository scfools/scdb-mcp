import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { discoverPaths } from '../discovery.js';
import type { ServerContext } from '../types.js';
import { prependSyncWarnings } from './helpers.js';

export function registerInventoryTool(server: McpServer, context: ServerContext): void {
  server.tool(
    'self_inventory',
    'Reports what the local project has: discovered paths, pipeline scripts, parsed data tables + counts, game version.',
    {},
    async () => {
      const paths = discoverPaths();

      const inventory: any = {
        discoveredPaths: {
          dataDir: paths.dataDir,
          p4kDir: paths.p4kDir,
          pipelineDir: paths.pipelineDir,
          gitRoot: paths.gitRoot,
        },
        dataTables: {},
        pipelineScripts: [],
        gameVersion: null,
      };

      // Data tables + counts
      if (paths.dataDir && existsSync(paths.dataDir)) {
        try {
          for (const file of readdirSync(paths.dataDir)) {
            if (!file.endsWith('.json')) continue;
            try {
              const content = readFileSync(resolve(paths.dataDir, file), 'utf-8');
              const records = JSON.parse(content);
              inventory.dataTables[file] = Array.isArray(records) ? records.length : 'not an array';
            } catch {
              inventory.dataTables[file] = 'parse error';
            }
          }
        } catch {}
      }

      // Pipeline scripts
      if (paths.pipelineDir && existsSync(paths.pipelineDir)) {
        try {
          inventory.pipelineScripts = readdirSync(paths.pipelineDir)
            .filter(f => f.endsWith('.py'));
        } catch {}
      }

      // Game version from build manifest
      if (paths.p4kDir && existsSync(paths.p4kDir)) {
        try {
          const entries = readdirSync(paths.p4kDir)
            .map(name => ({ name, stat: statSync(resolve(paths.p4kDir!, name)) }))
            .filter(e => e.stat.isDirectory())
            .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
            .map(e => ({ name: e.name, mtime: e.stat.mtimeMs }));

          if (entries.length > 0) {
            const manifestPath = resolve(paths.p4kDir, entries[0].name, 'build_manifest.id');
            if (existsSync(manifestPath)) {
              const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
              const branch = manifest.Data?.Branch ?? '';
              const version = manifest.Data?.Version ?? '';
              const cl = manifest.Data?.RequestedP4ChangeNum ?? '';
              inventory.gameVersion = `${branch} (${version}) CL#${cl}`;
            } else {
              inventory.gameVersion = entries[0].name;
            }
          }
        } catch {}
      }

      const text = prependSyncWarnings(JSON.stringify(inventory, null, 2), context);
      return { content: [{ type: 'text' as const, text }] };
    },
  );
}
