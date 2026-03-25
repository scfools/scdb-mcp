import { describe, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerQueryTool } from '../../src/tools/query.js';
import type { ServerContext } from '../../src/types.js';

describe('query_table tool', () => {
  it('registers on the MCP server', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    const context: ServerContext = {
      isAuthorized: false,
      identityHex: 'test',
      syncWarnings: [],
      firstToolCall: false,
    };

    // Should not throw
    registerQueryTool(server, context);
  });
});
