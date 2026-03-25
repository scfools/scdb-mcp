import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { hashSkillFiles, loadBindingsVersion, buildSyncWarnings } from '../src/sync-check.js';

describe('sync-check', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scdb-sync-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('hashSkillFiles', () => {
    it('returns hash map for skill markdown files', () => {
      const skillsDir = join(tempDir, 'skills');
      mkdirSync(skillsDir);
      writeFileSync(join(skillsDir, 'scdb-onboarding.md'), '# Onboarding');
      writeFileSync(join(skillsDir, 'scdb-coordination.md'), '# Coordination');

      const hashes = hashSkillFiles(skillsDir);
      expect(Object.keys(hashes)).toHaveLength(2);
      expect(hashes['scdb-onboarding']).toMatch(/^[a-f0-9]{64}$/);
      expect(hashes['scdb-coordination']).toMatch(/^[a-f0-9]{64}$/);
    });

    it('ignores non-markdown files', () => {
      const skillsDir = join(tempDir, 'skills');
      mkdirSync(skillsDir);
      writeFileSync(join(skillsDir, 'scdb-onboarding.md'), '# Onboarding');
      writeFileSync(join(skillsDir, 'README.txt'), 'not a skill');

      const hashes = hashSkillFiles(skillsDir);
      expect(Object.keys(hashes)).toHaveLength(1);
    });
  });

  describe('loadBindingsVersion', () => {
    it('reads .bindings-version JSON', () => {
      const bindingsDir = join(tempDir, 'bindings');
      mkdirSync(bindingsDir);
      writeFileSync(join(bindingsDir, '.bindings-version'), JSON.stringify({
        schemaHash: 'abc123',
        generatedAt: '2026-03-24T00:00:00Z',
      }));

      const result = loadBindingsVersion(bindingsDir);
      expect(result?.schemaHash).toBe('abc123');
    });

    it('returns null when file missing', () => {
      expect(loadBindingsVersion(join(tempDir, 'nonexistent'))).toBeNull();
    });
  });

  describe('buildSyncWarnings', () => {
    it('returns empty array when everything matches', () => {
      const localHashes = { 'scdb-onboarding': 'aaa' };
      const remoteHashes = [{ skillName: 'scdb-onboarding', contentHash: 'aaa', updatedAt: BigInt(0) }];
      const localBindingsHash = 'bbb';
      const remoteDataHash = 'bbb';

      const warnings = buildSyncWarnings(localHashes, remoteHashes, localBindingsHash, remoteDataHash);
      expect(warnings).toHaveLength(0);
    });

    it('warns on skill hash mismatch', () => {
      const localHashes = { 'scdb-onboarding': 'aaa' };
      const remoteHashes = [{ skillName: 'scdb-onboarding', contentHash: 'bbb', updatedAt: BigInt(0) }];

      const warnings = buildSyncWarnings(localHashes, remoteHashes, 'x', 'x');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('scdb-onboarding');
    });

    it('warns on bindings hash mismatch', () => {
      const warnings = buildSyncWarnings({}, [], 'old', 'new');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('bindings');
    });
  });
});
