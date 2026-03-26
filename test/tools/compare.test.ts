import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCompareTool, normalizeValue, recordsMatch } from '../../src/tools/compare.js';
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

describe('normalizeValue', () => {
  it('coerces string booleans to numbers', () => {
    expect(normalizeValue('0')).toBe(0);
    expect(normalizeValue('1')).toBe(1);
  });

  it('coerces string floats to numbers', () => {
    expect(normalizeValue('15.0')).toBe(15);
    expect(normalizeValue('1.0')).toBe(1);
    expect(normalizeValue('3.14')).toBe(3.14);
  });

  it('leaves plain strings as strings', () => {
    expect(normalizeValue('hello')).toBe('hello');
    expect(normalizeValue('AEGS')).toBe('AEGS');
  });

  it('converts bigints to numbers', () => {
    expect(normalizeValue(BigInt(42))).toBe(42);
  });

  it('passes through regular numbers', () => {
    expect(normalizeValue(15)).toBe(15);
    expect(normalizeValue(0)).toBe(0);
  });

  it('normalizes null/undefined to empty string', () => {
    expect(normalizeValue(null)).toBe('');
    expect(normalizeValue(undefined)).toBe('');
  });

  it('joins flat string arrays into sorted CSV', () => {
    expect(normalizeValue(['FlightController'])).toBe('FlightController');
    expect(normalizeValue(['WeaponGun', 'FlightController'])).toBe('FlightController,WeaponGun');
  });

  it('joins flat numeric arrays into sorted CSV', () => {
    expect(normalizeValue([3, 1, 2])).toBe('1,2,3');
  });

  it('recursively normalizes arrays of objects', () => {
    expect(normalizeValue([{ a: '1' }])).toEqual([{ a: 1 }]);
  });

  it('recursively normalizes objects', () => {
    expect(normalizeValue({ a: '1', b: 'hello' })).toEqual({ a: 1, b: 'hello' });
  });
});

describe('recordsMatch', () => {
  it('matches identical records', () => {
    const a = { id: '1', name: 'foo', size: 3 };
    const b = { id: '1', name: 'foo', size: 3 };
    expect(recordsMatch(a, b)).toBe(true);
  });

  it('ignores extra fields in STDB (second record)', () => {
    const local = { id: '1', name: 'Aegis' };
    const remote = { id: '1', name: 'Aegis', logoFullColor: '', logoSimplifiedWhite: '' };
    expect(recordsMatch(local, remote)).toBe(true);
  });

  it('ignores extra fields in local (first record)', () => {
    const local = { id: '1', name: 'Aurora', thrusters: 4 };
    const remote = { id: '1' };
    expect(recordsMatch(local, remote)).toBe(true);
  });

  it('treats string "0" and number 0 as equal', () => {
    const local = { id: '1', isHidden: '0' };
    const remote = { id: '1', isHidden: 0 };
    expect(recordsMatch(local, remote)).toBe(true);
  });

  it('treats string "15.0" and number 15 as equal', () => {
    const local = { id: '1', mass: '15.0' };
    const remote = { id: '1', mass: 15 };
    expect(recordsMatch(local, remote)).toBe(true);
  });

  it('detects actual value differences', () => {
    const local = { id: '1', name: 'Aurora' };
    const remote = { id: '1', name: 'Gladius' };
    expect(recordsMatch(local, remote)).toBe(false);
  });

  it('treats array and CSV string as equal', () => {
    const local = { id: '1', types: ['FlightController'], categories: ['controller'] };
    const remote = { id: '1', types: 'FlightController', categories: 'controller' };
    expect(recordsMatch(local, remote)).toBe(true);
  });

  it('treats multi-element array and CSV string as equal regardless of order', () => {
    const local = { id: '1', categories: ['WeaponGun', 'FlightController'] };
    const remote = { id: '1', categories: 'FlightController,WeaponGun' };
    expect(recordsMatch(local, remote)).toBe(true);
  });

  it('returns true when records have no shared keys', () => {
    const local = { name: 'Aurora' };
    const remote = { ref: 'AEGS' };
    expect(recordsMatch(local, remote)).toBe(true);
  });
});
