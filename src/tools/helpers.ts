import type { ServerContext } from '../types.js';
import { formatSyncWarnings } from '../sync-check.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

/** Find package root by walking up from current file until package.json is found. */
function findPackageRoot(): string {
  let dir = dirname(__filename);
  while (dir !== resolve(dir, '..')) {
    try {
      readFileSync(resolve(dir, 'package.json'), 'utf-8');
      return dir;
    } catch {}
    dir = resolve(dir, '..');
  }
  return dirname(__filename); // fallback
}

const PACKAGE_ROOT = findPackageRoot();
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
