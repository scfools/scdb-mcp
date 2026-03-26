import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerQueryTool } from './tools/query.js';
import { registerStatusTool } from './tools/status.js';
import { registerFormulasTool } from './tools/formulas.js';
import { registerCoordinationTools } from './tools/coordination.js';
import { registerImportTool } from './tools/import.js';
import { registerCompareTool } from './tools/compare.js';
import { registerInventoryTool } from './tools/inventory.js';
import { registerAdminTools } from './tools/admin.js';
import type { ServerContext } from './types.js';

export function createServer(context: ServerContext): McpServer {
  const server = new McpServer({
    name: 'scdb-mcp',
    version: '2.0.0',
  });

  // Register all tools
  registerQueryTool(server, context);
  registerStatusTool(server, context);
  registerFormulasTool(server, context);
  registerCoordinationTools(server, context);
  registerImportTool(server, context);
  registerCompareTool(server, context);
  registerInventoryTool(server, context);
  registerAdminTools(server, context);

  return server;
}
