import { describe, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerInventoryTool } from '../../src/tools/inventory.js';
import type { ServerContext } from '../../src/types.js';

describe('self_inventory tool', () => {
  it('registers on the MCP server', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    const context: ServerContext = {
      isAuthorized: false,
      identityHex: 'test',
      syncWarnings: [],
      firstToolCall: false,
    };
    registerInventoryTool(server, context);
  });
});
