import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';

export interface DiscoveredPaths {
  dataDir: string | null;
  p4kDir: string | null;
  pipelineDir: string | null;
  gitRoot: string | null;
}

/** Find the git root by walking up from startDir. */
function findGitRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  const root = resolve('/');
  while (dir !== root) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Search for a directory matching a pattern within the bounded tree. */
function findDir(
  startDir: string,
  boundaryDir: string,
  patterns: string[],
): string | null {
  // Walk from startDir up to boundaryDir
  let dir = resolve(startDir);
  const boundary = resolve(boundaryDir);

  while (true) {
    for (const pattern of patterns) {
      const candidate = join(dir, pattern);
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        return candidate;
      }
    }

    if (dir === boundary) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/** Search for a directory containing files matching a glob pattern. */
function findDirWithFiles(
  startDir: string,
  boundaryDir: string,
  filePatterns: RegExp[],
): string | null {
  let dir = resolve(startDir);
  const boundary = resolve(boundaryDir);

  while (true) {
    try {
      const entries = readdirSync(dir);
      const hasMatch = filePatterns.some(pattern =>
        entries.some(entry => pattern.test(entry))
      );
      if (hasMatch) return dir;
    } catch {}

    // Check subdirectories one level deep
    try {
      for (const sub of readdirSync(dir)) {
        const subPath = join(dir, sub);
        try {
          if (!statSync(subPath).isDirectory()) continue;
          if (sub === 'node_modules' || sub === '.git' || sub === 'dist') continue;
          const subEntries = readdirSync(subPath);
          const hasMatch = filePatterns.some(pattern =>
            subEntries.some(entry => pattern.test(entry))
          );
          if (hasMatch) return subPath;
        } catch {}
      }
    } catch {}

    if (dir === boundary) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

let cachedPaths: DiscoveredPaths | null = null;

/** Discover project paths by convention. Results are cached for the session. */
export function discoverPaths(cwd?: string, forceRefresh = false): DiscoveredPaths {
  if (cachedPaths && !forceRefresh) return cachedPaths;

  const startDir = resolve(cwd ?? process.cwd());
  const gitRoot = findGitRoot(startDir);
  const boundary = gitRoot ?? startDir;

  // Data dir: env override (unbounded) or convention (bounded)
  const envDataDir = process.env.SCDB_DATA_DIR;
  let dataDir: string | null = null;
  if (envDataDir && existsSync(envDataDir)) {
    dataDir = resolve(envDataDir);
  } else if (!envDataDir) {
    dataDir = findDir(startDir, boundary, [
      'sc-data-extracted/parsed/stdb',
      'parsed/stdb',
      'stdb',
    ]);
  }

  // P4K dir: env override (unbounded) or convention (bounded)
  const envP4kDir = process.env.P4K_DIR;
  let p4kDir: string | null = null;
  if (envP4kDir && existsSync(envP4kDir)) {
    p4kDir = resolve(envP4kDir);
  } else if (!envP4kDir) {
    p4kDir = findDir(startDir, boundary, ['sc-data-p4k']);
  }

  // Pipeline dir: env override (unbounded) or convention (bounded)
  const envPipelineDir = process.env.SCDB_PIPELINE_DIR;
  let pipelineDir: string | null = null;
  if (envPipelineDir && existsSync(envPipelineDir)) {
    pipelineDir = resolve(envPipelineDir);
  } else if (!envPipelineDir) {
    pipelineDir = findDirWithFiles(startDir, boundary, [
      /^parse_\w+\.py$/,
      /^build_relationships\.py$/,
    ]);
  }

  cachedPaths = { dataDir, p4kDir, pipelineDir, gitRoot };
  return cachedPaths;
}

/** Clear the discovery cache (for testing or mid-session refresh). */
export function clearDiscoveryCache(): void {
  cachedPaths = null;
}
