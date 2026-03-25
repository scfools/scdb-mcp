import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadToken, saveToken } from '../src/connection.js';

describe('token persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scdb-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns undefined when no token file exists', () => {
    expect(loadToken(tempDir)).toBeUndefined();
  });

  it('saves and loads a token', () => {
    saveToken('test-token-abc', tempDir);
    expect(loadToken(tempDir)).toBe('test-token-abc');
  });

  it('trims whitespace from loaded token', () => {
    saveToken('  token-with-spaces  \n', tempDir);
    expect(loadToken(tempDir)).toBe('token-with-spaces');
  });
});
