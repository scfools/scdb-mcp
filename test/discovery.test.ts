import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discoverPaths, clearDiscoveryCache, type DiscoveredPaths } from '../src/discovery.js';

describe('discoverPaths', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scdb-discovery-'));
    // Create a fake git root
    mkdirSync(join(tempDir, '.git'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    clearDiscoveryCache();
  });

  it('finds parsed stdb data by convention', () => {
    const stdbDir = join(tempDir, 'sc-data-extracted', 'parsed', 'stdb');
    mkdirSync(stdbDir, { recursive: true });
    writeFileSync(join(stdbDir, 'ships.json'), '[]');

    const result = discoverPaths(tempDir);
    expect(result.dataDir).toBe(stdbDir);
  });

  it('returns null when no data dir found', () => {
    const result = discoverPaths(tempDir);
    expect(result.dataDir).toBeNull();
  });

  it('respects SCDB_DATA_DIR env override', () => {
    const customDir = join(tempDir, 'custom-data');
    mkdirSync(customDir, { recursive: true });
    vi.stubEnv('SCDB_DATA_DIR', customDir);

    const result = discoverPaths(tempDir);
    expect(result.dataDir).toBe(customDir);
  });

  it('stops walking at git root', () => {
    // Create data dir above git root — should NOT be found
    const aboveGit = join(tempDir, '..');
    const stdbDir = join(aboveGit, 'parsed', 'stdb');
    mkdirSync(stdbDir, { recursive: true });

    const subdir = join(tempDir, 'subproject');
    mkdirSync(subdir);

    const result = discoverPaths(subdir);
    expect(result.dataDir).toBeNull();
  });

  it('env overrides are not bounded by git root', () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'scdb-outside-'));
    mkdirSync(join(outsideDir, 'stdb'), { recursive: true });
    vi.stubEnv('SCDB_DATA_DIR', join(outsideDir, 'stdb'));

    const result = discoverPaths(tempDir);
    expect(result.dataDir).toBe(join(outsideDir, 'stdb'));

    rmSync(outsideDir, { recursive: true, force: true });
  });

  it('finds p4k directory by convention', () => {
    const p4kDir = join(tempDir, 'sc-data-p4k');
    mkdirSync(p4kDir);

    const result = discoverPaths(tempDir);
    expect(result.p4kDir).toBe(p4kDir);
  });

  it('finds pipeline scripts', () => {
    mkdirSync(join(tempDir, 'scripts'), { recursive: true });
    writeFileSync(join(tempDir, 'scripts', 'parse_vehicles.py'), '');
    writeFileSync(join(tempDir, 'scripts', 'build_relationships.py'), '');

    const result = discoverPaths(tempDir);
    expect(result.pipelineDir).toBe(join(tempDir, 'scripts'));
  });
});
