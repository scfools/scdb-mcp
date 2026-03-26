import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

export interface SkillVersion {
  skillName: string;
  contentHash: string;
  updatedAt: bigint;
}

/** Hash SKILL.md files in skill subdirectories. Returns { skillName: sha256hex }. */
export function hashSkillFiles(skillsDir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  try {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(skillsDir, entry.name, 'SKILL.md');
      try {
        const content = readFileSync(skillFile, 'utf-8');
        const hash = createHash('sha256').update(content).digest('hex');
        hashes[entry.name] = hash;
      } catch {}
    }
  } catch {}
  return hashes;
}

/** Compare local state against remote state and return warning strings. */
export function buildSyncWarnings(
  localSkillHashes: Record<string, string>,
  remoteSkillVersions: SkillVersion[],
  _localBindingsHash: string | null,
  _remoteDataHash: string | null,
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

  return warnings;
}

/** Format warnings into a single diagnostic string. */
export function formatSyncWarnings(warnings: string[], packageVersion: string): string {
  if (warnings.length === 0) return '';
  const lines = warnings.map(w => `  - ${w}`);
  return `⚠ scdb-mcp v${packageVersion} sync warnings:\n${lines.join('\n')}\n\nRun \`npx @scfools/scdb-mcp update\` to pull latest.`;
}
