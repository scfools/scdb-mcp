import type { ServerContext } from '../types.js';
import { formatSyncWarnings } from '../sync-check.js';
import type { DbConnection } from '../../bindings/index.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(__filename), '..', '..');
const PKG_VERSION = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf-8')).version;

/** JSON replacer that converts BigInt to string. */
export function bigintReplacer(_key: string, value: any): any {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * On the first tool call of a session, prepend sync warnings to the response.
 * After the first call, returns the text unchanged.
 */
export function prependSyncWarnings(text: string, context: ServerContext): string {
  if (!context.firstToolCall || context.syncWarnings.length === 0) {
    context.firstToolCall = false;
    return text;
  }

  context.firstToolCall = false;
  const warningText = formatSyncWarnings(context.syncWarnings, PKG_VERSION);
  return `${warningText}\n\n---\n\n${text}`;
}

/**
 * One-shot subscribe: subscribe → collect via callback → unsubscribe.
 * Prevents subscription leaks during tool calls.
 */
export async function oneShot(
  conn: DbConnection,
  query: string,
  collect: (ctx: any) => void,
  timeoutMs = 10000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Query timed out after ${timeoutMs}ms: ${query}`)), timeoutMs);
    const sub = conn.subscriptionBuilder()
      .onApplied((ctx) => {
        clearTimeout(timeout);
        collect(ctx);
        try { sub.unsubscribe(); } catch {}
        resolve();
      })
      .subscribe(query);
  });
}

/** Convert snake_case to camelCase for STDB table accessor lookup. */
export function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
