#!/usr/bin/env node
/**
 * Repository validation: syntax, manifest, locales, icon, packaging hygiene.
 * Run with `npm run check`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const notes = [];

function read(relative) {
  return readFileSync(join(ROOT, relative), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function parse(relative) {
  try {
    return JSON.parse(read(relative));
  } catch (error) {
    fail(`${relative}: ${error.message}`);
    return null;
  }
}

const pkg = parse('package.json');
if (pkg !== null) {
  for (const field of ['name', 'version', 'type', 'exports', 'dsh']) {
    if (!pkg[field]) fail(`package.json: missing ${field}`);
  }
  if (pkg.type !== 'module') fail('package.json: type must be module');
  if (!pkg.exports?.['.']) fail('package.json: exports["."] is required');
  if (!pkg.exports?.['./client']) fail('package.json: exports["./client"] is required');
  if (!pkg.dsh?.bundle?.patch) fail('package.json: dsh.bundle.patch is required');
  if (!pkg.dsh?.client) fail('package.json: dsh.client is required');
  if (!Array.isArray(pkg.files) || !pkg.files.includes('client.js')) fail('package.json: files must include client.js');
  if (pkg.license !== 'MIT') notes.push('license is not MIT');
}

const zh = parse('locale/zh.json');
const en = parse('locale/en.json');
if (zh?.meta?.title && en?.meta?.title) {
  notes.push(`plugin title: ${zh.meta.title} / ${en.meta.title}`);
}
if (zh && en && zh.meta?.title === en.meta?.title) fail('locale titles should be localized');

const client = read('client.js');
function dictionaryKeys(name) {
  const match = client.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n    \\};`));
  if (match === null) {
    fail(`client.js: ${name} dictionary not found`);
    return new Set();
  }
  return new Set([...match[1].matchAll(/'([^']+)':/g)].map((entry) => entry[1]));
}
const zhKeys = dictionaryKeys('ZH');
const enKeys = dictionaryKeys('EN');
const usedKeys = new Set([...client.matchAll(/\bt\('([a-z0-9_.]+)'\)/g)].map((entry) => entry[1]));
for (const key of usedKeys) {
  if (!zhKeys.has(key)) fail(`client.js: missing zh key "${key}"`);
  if (!enKeys.has(key)) fail(`client.js: missing en key "${key}"`);
}
for (const key of zhKeys) if (!enKeys.has(key)) fail(`client.js: en dictionary missing "${key}"`);
for (const key of enKeys) if (!zhKeys.has(key)) fail(`client.js: zh dictionary missing "${key}"`);
notes.push(`${usedKeys.size} used locale keys, ${zhKeys.size} dictionary keys`);

const icon = statSync(join(ROOT, 'icon.svg'));
if (icon.size > 256 * 1024) fail('icon.svg exceeds 256 KiB');
if (!read('icon.svg').trimStart().startsWith('<svg')) fail('icon.svg is not an SVG');
notes.push(`icon.svg: ${icon.size} bytes`);

const jsFiles = [
  'index.js',
  'ledger.js',
  'actions.js',
  'client.js',
  'adapters/cli.mjs',
  'adapters/mcp-server.mjs',
  'adapters/post.mjs',
  'adapters/chatgpt/import.mjs',
  'adapters/codex/sync.mjs',
  'scripts/check.mjs',
  'scripts/package.mjs',
  'test/ledger.test.mjs',
  'test/actions.test.mjs',
  'test/backfill.test.mjs',
  'test/client.test.mjs',
];
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', join(ROOT, file)], { stdio: 'pipe' });
  } catch (error) {
    fail(`${file}: syntax check failed (${error.stderr?.toString().trim() || error.message})`);
  }
}

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}
const sensitive = [
  /\/Users\/agentic\b/,
  /session-[0-9a-f]{8}-[0-9a-f]{4}/,
  /95664579c2b64137/,
  /prompt-ledger\.sqlite3-(?:wal|shm)/,
];
for (const file of walk(ROOT)) {
  if (file.startsWith(join(ROOT, 'scripts'))) continue;
  const extension = extname(file);
  if (!['.js', '.mjs', '.json', '.md', '.yml', '.yaml', '.toml', '.txt', ''].includes(extension)) continue;
  let body;
  try {
    body = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const pattern of sensitive) {
    if (pattern.test(body)) fail(`${file.slice(ROOT.length + 1)}: contains a personal/local marker (${pattern})`);
  }
  if (/\.sqlite3(?:-wal|-shm)?$/.test(file)) fail(`${file.slice(ROOT.length + 1)}: database artifact must not be committed`);
}

if (failures.length > 0) {
  console.error('\nPrompt Ledger check failed:\n');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('Prompt Ledger check passed');
for (const note of notes) console.log(`  · ${note}`);
console.log(`  · ${jsFiles.length} JavaScript files parsed`);
