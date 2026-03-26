import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

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

// --- HTTP API client ---

interface StdbConfig {
  baseUrl: string;
  module: string;
  token: string | undefined;
  identityHex: string | undefined;
}

let config: StdbConfig | null = null;

/** Parse identity from JWT token without external deps. */
export function parseIdentityFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.hex_identity ?? null;
  } catch { return null; }
}

/** Initialize the HTTP config from env vars and stored token. */
export function initConfig(connConfig?: ConnectionConfig): StdbConfig {
  const { uri, module: moduleName } = connConfig ?? getConnectionConfig();
  const token = loadToken();
  const identityHex = token ? parseIdentityFromToken(token) : undefined;

  config = {
    baseUrl: uri!,
    module: moduleName!,
    token: token ?? undefined,
    identityHex: identityHex ?? undefined,
  };

  return config;
}

export function getConfig(): StdbConfig {
  if (!config) throw new Error('initConfig() must be called before getConfig()');
  return config;
}

export function getIdentity(): string | null {
  return config?.identityHex ?? null;
}

// --- Snake to camelCase ---

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// --- STDB response parsing ---

function parseStdbResponse(response: any[]): Record<string, unknown>[] {
  if (!response.length) return [];
  const { schema, rows } = response[0];
  if (!rows || !rows.length) return [];
  const columns: string[] = schema.elements.map((e: any) => snakeToCamel(e.name.some));
  return rows.map((row: any[]) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

/** Execute a SQL query against STDB, returns array of objects with camelCase keys. */
export async function sqlQuery(query: string): Promise<Record<string, unknown>[]> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}/v1/database/${cfg.module}/sql`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`STDB SQL query failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  return parseStdbResponse(json);
}

/** Call a reducer with positional args. */
export async function callReducer(name: string, args: unknown[]): Promise<void> {
  const cfg = getConfig();
  if (!cfg.token) {
    throw new Error('No token available. Cannot call reducer without authentication.');
  }

  const url = `${cfg.baseUrl}/v1/database/${cfg.module}/call/${name}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`STDB reducer "${name}" failed (${res.status}): ${body}`);
  }
}
