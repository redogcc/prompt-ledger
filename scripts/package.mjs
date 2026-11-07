#!/usr/bin/env node
/**
 * Build a clean release zip. The staging directory is outside the repository so
 * no database, .git directory, node_modules or previous artifact can leak in.
 *
 *   npm run pack:release
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const name = 'prompt-ledger';
const dist = join(ROOT, 'dist');
const stage = mkdtempSync(join(tmpdir(), 'prompt-ledger-release-'));
const excluded = new Set([
  '.git', 'node_modules', 'dist', '.DS_Store', 'Thumbs.db',
  'prompt-ledger.sqlite3', 'prompt-ledger.sqlite3-wal', 'prompt-ledger.sqlite3-shm',
]);

function copy(source, target) {
  if (!existsSync(source)) return;
  const base = basename(source);
  if (excluded.has(base)) return;
  cpSync(source, target, {
    recursive: true,
    filter: (path) => {
      const leaf = basename(path);
      return !excluded.has(leaf) && !leaf.endsWith('.sqlite3') && !leaf.endsWith('.sqlite3-wal') && !leaf.endsWith('.sqlite3-shm');
    },
  });
}

for (const entry of readdirSync(ROOT)) {
  if (excluded.has(entry)) continue;
  if (entry.endsWith('.sqlite3') || entry.endsWith('.sqlite3-wal') || entry.endsWith('.sqlite3-shm')) continue;
  copy(join(ROOT, entry), join(stage, entry));
}

rmSync(dist, { recursive: true, force: true });
cpSync(stage, join(dist, `${name}-${version}`), { recursive: true });
rmSync(stage, { recursive: true, force: true });

const folder = join(dist, `${name}-${version}`);
const zipPath = join(dist, `${name}-${version}.zip`);
execFileSync('zip', ['-qr', zipPath, `${name}-${version}`], { cwd: dist, stdio: 'inherit' });
rmSync(folder, { recursive: true, force: true });

const bytes = readFileSync(zipPath);
const sha = createHash('sha256').update(bytes).digest('hex');
writeFileSync(join(dist, `${name}-${version}.sha256`), `${sha}  ${name}-${version}.zip\n`, 'utf8');
const files = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n').length;
console.log(`\nBuilt ${zipPath}`);
console.log(`  files: ${files}`);
console.log(`  bytes: ${bytes.length}`);
console.log(`  sha256: ${sha}`);
