#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { connect, getIdentity } from './connection.js';
import { hashSkillFiles, loadBindingsVersion, buildSyncWarnings } from './sync-check.js';
import { checkAuth, type Publisher } from './auth.js';
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ServerContext } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve package root (two levels up from dist/src/)
const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const SKILLS_DIR = resolve(PACKAGE_ROOT, 'skills');
const BINDINGS_DIR = resolve(PACKAGE_ROOT, 'bindings');

/** Extract mcp-servers from SKILL.md frontmatter. */
function parseMcpServers(skillContent: string): Record<string, Record<string, unknown>> {
  const fmMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};

  const frontmatter = fmMatch[1];
  const servers: Record<string, Record<string, unknown>> = {};

  // Find the mcp-servers block
  const lines = frontmatter.split('\n');
  let i = lines.findIndex(l => l.startsWith('mcp-servers:'));
  if (i === -1) return {};
  i++;

  // Parse each server entry (2-space indented block)
  while (i < lines.length) {
    const line = lines[i];
    // Stop at next top-level key or end of frontmatter
    if (line.length > 0 && !line.startsWith(' ')) break;

    const serverMatch = line.match(/^  (\w[\w-]*):\s*$/);
    if (serverMatch) {
      const serverName = serverMatch[1];
      const config: Record<string, unknown> = {};

      i++;
      while (i < lines.length) {
        const propLine = lines[i];
        if (!propLine.startsWith('    ')) break;

        const propMatch = propLine.match(/^\s{4}(\w+):\s*(.+)$/);
        if (propMatch) {
          let value: unknown = propMatch[2];
          // Parse JSON arrays
          if (typeof value === 'string' && value.startsWith('[')) {
            try { value = JSON.parse(value); } catch {}
          }
          config[propMatch[1]] = value;
        }
        i++;
      }
      servers[serverName] = config;
    } else {
      i++;
    }
  }

  return servers;
}

/** Scan installed skills for mcp-servers declarations and merge into .mcp.json. */
function ensureMcpConfig(skillsDir: string): void {
  const collected: Record<string, Record<string, unknown>> = {};

  // Scan all SKILL.md files
  try {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(skillsDir, entry.name, 'SKILL.md');
      try {
        const content = readFileSync(skillFile, 'utf-8');
        const servers = parseMcpServers(content);
        for (const [name, config] of Object.entries(servers)) {
          if (!(name in collected)) collected[name] = config;
        }
      } catch {}
    }
  } catch {}

  if (Object.keys(collected).length === 0) return;

  // Read or create .mcp.json
  const mcpPath = resolve(process.cwd(), '.mcp.json');
  let mcpConfig: { mcpServers: Record<string, unknown> };
  try {
    mcpConfig = existsSync(mcpPath)
      ? JSON.parse(readFileSync(mcpPath, 'utf-8'))
      : { mcpServers: {} };
  } catch {
    mcpConfig = { mcpServers: {} };
  }

  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  const added: string[] = [];
  for (const [name, config] of Object.entries(collected)) {
    if (!(name in mcpConfig.mcpServers)) {
      mcpConfig.mcpServers[name] = config;
      added.push(name);
    }
  }

  if (added.length > 0) {
    writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
    console.log(`MCP servers added to .mcp.json: ${added.join(', ')}`);
  } else {
    console.log('MCP servers already configured in .mcp.json');
  }
}

async function runInstallSkills(): Promise<void> {
  const targetDir = resolve(process.cwd(), '.claude', 'skills');
  mkdirSync(targetDir, { recursive: true });
  cpSync(SKILLS_DIR, targetDir, { recursive: true });
  console.log(`Skills installed to ${targetDir}`);
  ensureMcpConfig(targetDir);
}

async function runMcpServer(): Promise<void> {
  // Connect to scdb
  const conn = await connect();
  const identityHex = getIdentity()!;

  // Check auth
  let isAuthorized = false;
  await new Promise<void>((resolve) => {
    conn.subscriptionBuilder()
      .onApplied((ctx) => {
        const publishers: Publisher[] = [];
        for (const row of ctx.db.authorizedPublishers.iter()) {
          publishers.push(row as Publisher);
        }
        isAuthorized = checkAuth(identityHex, publishers);
        resolve();
      })
      .subscribe('SELECT * FROM authorized_publishers');
  });

  // Run sync check
  const localSkillHashes = hashSkillFiles(SKILLS_DIR);
  const bindingsVersion = loadBindingsVersion(BINDINGS_DIR);

  let remoteSkillVersions: any[] = [];
  let remoteDataHash: string | null = null;

  // Subscribe to each table separately (STDB SDK does not support multi-query subscribes)
  await new Promise<void>((resolve) => {
    conn.subscriptionBuilder()
      .onApplied((ctx) => {
        for (const row of ctx.db.skillVersions.iter()) {
          remoteSkillVersions.push(row);
        }
        resolve();
      })
      .subscribe('SELECT * FROM skill_versions');
  });

  await new Promise<void>((resolve) => {
    conn.subscriptionBuilder()
      .onApplied((ctx) => {
        for (const row of ctx.db.dataVersion.iter()) {
          remoteDataHash = (row as any).hash;
        }
        resolve();
      })
      .subscribe('SELECT * FROM data_version');
  });

  const syncWarnings = buildSyncWarnings(
    localSkillHashes,
    remoteSkillVersions,
    bindingsVersion?.schemaHash ?? null,
    remoteDataHash,
  );

  // Shared context for tool handlers
  const context: ServerContext = {
    isAuthorized,
    identityHex,
    syncWarnings,
    firstToolCall: true,
  };

  const server = createServer(context);

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Subcommand routing
const subcommand = process.argv[2];

switch (subcommand) {
  case 'install-skills':
    runInstallSkills().catch(err => {
      console.error('install-skills failed:', err);
      process.exit(1);
    });
    break;

  case 'update':
    // Phase 1: placeholder — will run spacetime generate + write .bindings-version
    console.log('update subcommand not yet implemented');
    process.exit(0);
    break;

  default:
    // No subcommand = run MCP server
    runMcpServer().catch(err => {
      console.error('scdb-mcp failed:', err);
      process.exit(1);
    });
    break;
}
