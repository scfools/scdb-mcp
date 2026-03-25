import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCoordinationTools } from '../../src/tools/coordination.js';
import type { ServerContext } from '../../src/types.js';

describe('coordination tools', () => {
  it('registers all three tools on the MCP server', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    const context: ServerContext = {
      isAuthorized: true,
      identityHex: 'test-identity',
      syncWarnings: [],
      firstToolCall: false,
    };
    // Should not throw
    registerCoordinationTools(server, context);
  });
});
