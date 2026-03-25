import { describe, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerImportTool } from '../../src/tools/import.js';
import type { ServerContext } from '../../src/types.js';

describe('import_to_scdb tool', () => {
  it('registers on the MCP server', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    const context: ServerContext = {
      isAuthorized: true,
      identityHex: 'test',
      syncWarnings: [],
      firstToolCall: false,
    };
    registerImportTool(server, context);
  });
});
