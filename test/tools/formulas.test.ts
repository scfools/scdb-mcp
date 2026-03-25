import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFormulasTool } from '../../src/tools/formulas.js';
import type { ServerContext } from '../../src/types.js';

describe('formula_lookup tool', () => {
  it('registers on the MCP server', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    const context: ServerContext = {
      isAuthorized: false,
      identityHex: 'test',
      syncWarnings: [],
      firstToolCall: false,
    };
    registerFormulasTool(server, context);
  });
});
