import { describe, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCompareTool } from '../../src/tools/compare.js';
import type { ServerContext } from '../../src/types.js';

describe('compare_local_remote tool', () => {
  it('registers on the MCP server', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    const context: ServerContext = {
      isAuthorized: false,
      identityHex: 'test',
      syncWarnings: [],
      firstToolCall: false,
    };
    registerCompareTool(server, context);
  });
});
