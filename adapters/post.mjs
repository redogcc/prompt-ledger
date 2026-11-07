#!/usr/bin/env node
/**
 * Post one normalized turn to a running Prompt Ledger bridge.
 *
 *   node adapters/post.mjs --url http://127.0.0.1:PORT/prompt-ledger/v1/ingest --token TOKEN < turn.json
 *
 * This is the no-dependency HTTP path for platform skills and shell hooks. The
 * MCP server and CLI write SQLite directly and do not need the bridge.
 */

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const url = option('url');
const token = option('token') ?? process.env.PROMPT_LEDGER_TOKEN;
const file = option('file');
if (url === undefined || token === undefined) {
  console.error('usage: node adapters/post.mjs --url <ingest-url> --token <token> [--file turn.json] < turn.json');
  process.exit(1);
}

const body = file === undefined ? await new Promise((resolve) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { data += chunk; });
  process.stdin.on('end', () => resolve(data));
}) : await readFile(file, 'utf8');

let parsed;
try {
  parsed = JSON.parse(body);
} catch (error) {
  console.error(`prompt-ledger: invalid JSON: ${error.message}`);
  process.exit(1);
}

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-prompt-ledger-token': token,
  },
  body: JSON.stringify(parsed),
});
const text = await response.text();
if (!response.ok) {
  console.error(`prompt-ledger: HTTP ${response.status}: ${text}`);
  process.exit(1);
}
process.stdout.write(`${text}\n`);
