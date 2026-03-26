import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadToken, saveToken, parseIdentityFromToken } from '../src/connection.js';

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

describe('parseIdentityFromToken', () => {
  it('extracts hex_identity from a valid JWT payload', () => {
    // Create a fake JWT: header.payload.signature
    const payload = { hex_identity: 'abc123def456' };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const fakeJwt = `eyJ0eXAiOiJKV1QifQ.${encoded}.fakesig`;

    expect(parseIdentityFromToken(fakeJwt)).toBe('abc123def456');
  });

  it('returns null for invalid token', () => {
    expect(parseIdentityFromToken('not-a-jwt')).toBeNull();
  });

  it('returns null when hex_identity is missing from payload', () => {
    const payload = { sub: 'something-else' };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const fakeJwt = `eyJ0eXAiOiJKV1QifQ.${encoded}.fakesig`;

    expect(parseIdentityFromToken(fakeJwt)).toBeNull();
  });
});
