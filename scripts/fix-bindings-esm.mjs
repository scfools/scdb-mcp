#!/usr/bin/env node
/**
 * Post-build: add .js extensions to relative imports in dist/bindings/*.js
 *
 * TypeScript with moduleResolution:bundler emits extensionless imports, but
 * Node.js ESM requires explicit .js extensions. The SpacetimeDB-generated
 * bindings use extensionless relative imports, so we fix them after compilation.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bindingsDir = resolve(__dirname, '../dist/bindings');

let filesFixed = 0;
let importsFixed = 0;

for (const file of readdirSync(bindingsDir)) {
  if (!file.endsWith('.js')) continue;
  const filePath = resolve(bindingsDir, file);
  const original = readFileSync(filePath, 'utf8');

  // Add .js to relative imports that lack a file extension
  let count = 0;
  const fixed = original.replace(/from (["'])(\.[^"']+)\1/g, (match, q, specifier) => {
    const hasExt = /\.[a-zA-Z]+$/.test(specifier);
    if (hasExt) return match;
    count++;
    return `from ${q}${specifier}.js${q}`;
  });

  if (fixed !== original) {
    writeFileSync(filePath, fixed, 'utf8');
    importsFixed += count;
    filesFixed++;
  }
}

console.log(`fix-bindings-esm: fixed ${filesFixed} files, ${importsFixed} imports`);
