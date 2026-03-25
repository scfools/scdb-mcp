import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from './types.js';

export function createServer(_context: ServerContext): McpServer {
  const server = new McpServer({
    name: 'scdb-mcp',
    version: '0.1.0',
  });

  // Tool handlers will be registered by individual tool modules in subsequent tasks.
  // Each tool module exports a `register(server, context)` function.
  // registerQueryTool(server, context);
  // registerSyncStatusTool(server, context);
  // registerFormulaLookupTool(server, context);
  // registerImportTool(server, context);
  // registerCoordinationTools(server, context);
  // registerCompareLocalRemoteTool(server, context);
  // registerSelfInventoryTool(server, context);
  // registerAuthorizePublisherTool(server, context);

  return server;
}
