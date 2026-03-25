import { readFileSync, readdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename } from 'path';

export interface BindingsVersion {
  schemaHash: string;
  generatedAt: string;
  cliVersion?: string;
}

export interface SkillVersion {
  skillName: string;
  contentHash: string;
  updatedAt: bigint;
}

/** Hash all .md files in a skills directory. Returns { skillName: sha256hex }. */
export function hashSkillFiles(skillsDir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  try {
    for (const file of readdirSync(skillsDir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(skillsDir, file), 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex');
      const skillName = basename(file, '.md');
      hashes[skillName] = hash;
    }
  } catch {}
  return hashes;
}

/** Load the .bindings-version file from the bindings directory. */
export function loadBindingsVersion(bindingsDir: string): BindingsVersion | null {
  const versionPath = join(bindingsDir, '.bindings-version');
  try {
    if (!existsSync(versionPath)) return null;
    return JSON.parse(readFileSync(versionPath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Compare local state against remote state and return warning strings. */
export function buildSyncWarnings(
  localSkillHashes: Record<string, string>,
  remoteSkillVersions: SkillVersion[],
  localBindingsHash: string | null,
  remoteDataHash: string | null,
): string[] {
  const warnings: string[] = [];

  // Check skill hash mismatches
  const remoteMap = new Map(remoteSkillVersions.map(s => [s.skillName, s.contentHash]));
  for (const [name, localHash] of Object.entries(localSkillHashes)) {
    const remoteHash = remoteMap.get(name);
    if (remoteHash && remoteHash !== localHash) {
      warnings.push(
        `skill "${name}" local hash differs from scdb (local: ${localHash.slice(0, 8)}, remote: ${remoteHash.slice(0, 8)})`
      );
    }
  }

  // Check bindings version
  if (localBindingsHash && remoteDataHash && localBindingsHash !== remoteDataHash) {
    warnings.push(
      `bindings may be stale: generated for schema "${localBindingsHash.slice(0, 8)}", scdb is at "${remoteDataHash.slice(0, 8)}"`
    );
  }

  return warnings;
}

/** Format warnings into a single diagnostic string. */
export function formatSyncWarnings(warnings: string[], packageVersion: string): string {
  if (warnings.length === 0) return '';
  const lines = warnings.map(w => `  - ${w}`);
  return `⚠ scdb-mcp v${packageVersion} sync warnings:\n${lines.join('\n')}\n\nRun \`npx @sc-fools/scdb-mcp update\` to pull latest.`;
}
