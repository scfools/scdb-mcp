#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { connect, getIdentity } from './connection.js';
import { hashSkillFiles, loadBindingsVersion, buildSyncWarnings } from './sync-check.js';
import { checkAuth, type Publisher } from './auth.js';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ServerContext } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve package root (two levels up from dist/src/)
const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const SKILLS_DIR = resolve(PACKAGE_ROOT, 'skills');
const BINDINGS_DIR = resolve(PACKAGE_ROOT, 'bindings');

async function runInstallSkills(): Promise<void> {
  const targetDir = resolve(process.cwd(), '.claude', 'skills', 'scdb');
  mkdirSync(targetDir, { recursive: true });
  cpSync(SKILLS_DIR, targetDir, { recursive: true });
  console.log(`Skills installed to ${targetDir}`);
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
