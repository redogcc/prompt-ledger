#!/usr/bin/env node
/**
 * Prompt Ledger CLI.
 *
 *   node adapters/cli.mjs stats [--range 30d] [--json]
 *   node adapters/cli.mjs list [--q text] [--model id] [--limit 20] [--json]
 *   node adapters/cli.mjs get --id <prompt-id>
 *   node adapters/cli.mjs rate --id <prompt-id> --stars 5 [--note "…"]
 *   node adapters/cli.mjs ingest < turn.json
 *   node adapters/cli.mjs export --out prompt-ledger.csv
 *   node adapters/cli.mjs integrity
 *
 * Set PROMPT_LEDGER_DB to use a database outside the default DSH data dir.
 */

import { writeFile } from 'node:fs/promises';
import { openLedger, toCsv } from '../ledger.js';

function parseArgs(argv) {
  const options = {};
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = next;
        index += 1;
      }
    } else {
      rest.push(arg);
    }
  }
  return { options, rest };
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function print(value, json = false) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === 'string') {
    process.stdout.write(`${value}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const { options, rest } = parseArgs(process.argv.slice(2));
const command = rest[0] ?? 'stats';
const ledger = openLedger();

try {
  if (command === 'stats') {
    const result = ledger.overview({ range: options.range ?? '30d' });
    if (options.json) print(result, true);
    else {
      const { kpis, models, tools } = result;
      print(`Prompts: ${kpis.prompts} · tokens: ${kpis.tokens} · success: ${kpis.successRate}% · human: ${kpis.avgRating || '—'} · auto: ${kpis.avgAuto || '—'}`);
      if (models.length > 0) print(`Top models: ${models.slice(0, 3).map((model) => `${model.model} (${model.count})`).join(', ')}`);
      if (tools.length > 0) print(`Top tools: ${tools.slice(0, 3).map((tool) => `${tool.name} (${tool.calls})`).join(', ')}`);
    }
  } else if (command === 'list') {
    const result = ledger.listPrompts({
      range: options.range,
      q: options.q ?? '',
      model: options.model ?? '',
      platform: options.platform ?? '',
      tool: options.tool ?? '',
      limit: options.limit ?? 20,
      sort: options.sort ?? 'newest',
    });
    if (options.json || !options.plain) print(result, true);
    else {
      for (const item of result.items) {
        const rating = item.rating?.stars ?? '—';
        print(`${item.id}  ${rating}★  ${item.model ?? '—'}  ${item.promptPreview}`);
      }
    }
  } else if (command === 'get') {
    if (typeof options.id !== 'string') throw new Error('--id is required');
    const prompt = ledger.getPrompt(options.id);
    if (prompt === null) throw new Error('prompt not found');
    print(prompt, true);
  } else if (command === 'rate') {
    if (typeof options.id !== 'string') throw new Error('--id is required');
    const stars = Number(options.stars);
    if (!Number.isFinite(stars) || stars < 1 || stars > 5) throw new Error('--stars must be 1-5');
    print(ledger.ratePrompt(options.id, stars, typeof options.note === 'string' ? options.note : ''), true);
  } else if (command === 'tag') {
    if (typeof options.id !== 'string') throw new Error('--id is required');
    const tags = String(options.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
    print(ledger.setTags(options.id, tags), true);
  } else if (command === 'ingest') {
    const text = await readStdin();
    if (text.trim() === '') throw new Error('stdin must contain a JSON object');
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new Error('stdin is not valid JSON');
    }
    const prompt = ledger.ingest(input);
    print({ ok: true, id: prompt.id, duplicate: prompt.duplicate === true, auto: prompt.auto?.total ?? null });
  } else if (command === 'export') {
    const rows = ledger.exportRows({
      range: options.range,
      platform: options.platform,
      model: options.model,
      tool: options.tool,
      q: options.q,
    });
    if (typeof options.out === 'string') {
      await writeFile(options.out, toCsv(rows), 'utf8');
      print(`Wrote ${rows.length} rows to ${options.out}`);
    } else {
      process.stdout.write(toCsv(rows));
    }
  } else if (command === 'integrity') {
    const result = ledger.integrity();
    print(result, true);
    if (!result.ok) process.exitCode = 2;
  } else if (command === 'db') {
    print(ledger.dbPath);
  } else {
    throw new Error(`unknown command "${command}"`);
  }
} catch (error) {
  console.error(`prompt-ledger: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  ledger.close();
}
