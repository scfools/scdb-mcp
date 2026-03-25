import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { DbConnection } from '../bindings/index.js';

const DEFAULT_TOKEN_DIR = resolve(homedir(), '.config', 'scdb-mcp');
const TOKEN_FILENAME = 'token';

export function getTokenDir(): string {
  return process.env.SCDB_TOKEN_DIR ?? DEFAULT_TOKEN_DIR;
}

export function loadToken(tokenDir?: string): string | undefined {
  const dir = tokenDir ?? getTokenDir();
  const tokenPath = resolve(dir, TOKEN_FILENAME);
  try {
    if (existsSync(tokenPath)) {
      return readFileSync(tokenPath, 'utf-8').trim();
    }
  } catch {}
  return undefined;
}

export function saveToken(token: string, tokenDir?: string): void {
  const dir = tokenDir ?? getTokenDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, TOKEN_FILENAME), token, 'utf-8');
}

export interface ConnectionConfig {
  uri?: string;
  module?: string;
}

export function getConnectionConfig(): ConnectionConfig {
  return {
    uri: process.env.SCDB_URI ?? 'https://maincloud.spacetimedb.com',
    module: process.env.SCDB_MODULE ?? 'scdb',
  };
}

/** Shared connection state for the MCP server session. */
let activeConnection: DbConnection | null = null;
let activeIdentity: string | null = null;

export function getConnection(): DbConnection | null {
  return activeConnection;
}

export function getIdentity(): string | null {
  return activeIdentity;
}

export async function connect(config?: ConnectionConfig): Promise<DbConnection> {
  if (activeConnection) return activeConnection;

  const { uri, module: moduleName } = config ?? getConnectionConfig();
  const storedToken = loadToken();

  return new Promise<DbConnection>((resolve, reject) => {
    const builder = DbConnection.builder()
      .withUri(uri!)
      .withDatabaseName(moduleName!);

    if (storedToken) {
      builder.withToken(storedToken);
    }

    builder
      .onConnect((ctx, identity, token) => {
        saveToken(token);
        activeIdentity = identity.toHexString();
        activeConnection = ctx;
        resolve(ctx);
      })
      .onConnectError((_ctx, error) => {
        reject(error);
      })
      .build();
  });
}

export function disconnect(): void {
  if (activeConnection) {
    activeConnection.disconnect();
    activeConnection = null;
    activeIdentity = null;
  }
}
