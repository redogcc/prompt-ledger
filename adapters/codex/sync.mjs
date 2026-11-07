#!/usr/bin/env node
/**
 * Sync Codex CLI session rollouts into the local ledger.
 *
 *   node adapters/codex/sync.mjs                 # ~/.codex/sessions recursively
 *   node adapters/codex/sync.mjs /path/to/sessions
 *   node adapters/codex/sync.mjs --dry-run
 *
 * Codex writes JSONL rollouts. The exact event set evolves, so this importer
 * accepts the common `response_item` messages plus optional `turn_context`,
 * `token_count`, `function_call` and `function_call_output` records. Unknown
 * records are ignored. Stable session/turn keys make repeated runs idempotent.
 */

import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openLedger } from '../../ledger.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pathArg = args.find((arg) => !arg.startsWith('--'));
const root = pathArg ?? join(homedir(), '.codex', 'sessions');

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (part?.type === 'input_text' || part?.type === 'output_text' || part?.type === 'text') return part.text ?? '';
    return '';
  }).filter(Boolean).join('\n');
}

function usageOf(value) {
  const usage = value?.info?.total_token_usage ?? value?.total_token_usage ?? value?.usage;
  if (usage === null || usage === undefined) return null;
  return {
    input: Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0,
    output: Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0,
    total: Number(usage.total_tokens ?? usage.totalTokens ?? 0) || 0,
    cached: Number(usage.cached_input_tokens ?? usage.cache_read_tokens ?? 0) || 0,
    reasoning: Number(usage.reasoning_output_tokens ?? usage.reasoning_tokens ?? 0) || 0,
  };
}

function delta(current, base) {
  const input = Math.max(0, (current?.input ?? 0) - (base?.input ?? 0));
  const output = Math.max(0, (current?.output ?? 0) - (base?.output ?? 0));
  const total = Math.max(input + output, (current?.total ?? 0) - (base?.total ?? 0));
  const cached = Math.max(0, (current?.cached ?? 0) - (base?.cached ?? 0));
  const reasoning = Math.max(0, (current?.reasoning ?? 0) - (base?.reasoning ?? 0));
  return { input, output, total, cached, reasoning };
}

async function* walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) yield full;
  }
}

function parseRecords(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const record = JSON.parse(trimmed);
      if (record !== null && typeof record === 'object') records.push(record);
    } catch {
      /* damaged line in a rollout */
    }
  }
  return records;
}

function extract(file, records) {
  const turns = [];
  let sessionId = file.replaceAll('\\', '/').split('/').pop()?.replace(/\.jsonl$/, '') ?? file;
  let model = 'codex';
  let cwd = null;
  let current = null;
  let lastUsage = null;
  let usageAtStart = null;
  const toolsByCall = new Map();

  const finalize = (completedAt) => {
    if (current === null) return;
    const usage = delta(lastUsage, usageAtStart);
    const tools = current.tools.map((tool) => {
      const settled = toolsByCall.get(tool.callId);
      return {
        ...tool,
        status: settled?.status ?? 'ok',
        result: settled?.result,
        error: settled?.error,
      };
    });
    turns.push({
      platform: 'codex',
      provider: 'openai',
      sessionId,
      model: current.model ?? model,
      cwd,
      prompt: current.prompt,
      response: current.replies.join('\n\n'),
      status: 'completed',
      startedAt: current.startedAt,
      completedAt: completedAt ?? current.lastAt,
      sourceKey: `${sessionId}:${current.startedAt}:${current.messageId ?? ''}`,
      usage,
      tools,
      tags: [current.model ?? model].filter(Boolean),
      metadata: { importer: 'codex-rollout', file },
    });
    current = null;
  };

  for (const record of records) {
    const payload = record.payload ?? {};
    const type = record.type ?? payload.type;
    const timestamp = record.timestamp ? Date.parse(record.timestamp) : Date.now();
    if (type === 'session_meta') {
      sessionId = payload.id ?? payload.session_id ?? sessionId;
      cwd = payload.cwd ?? cwd;
      model = payload.model ?? model;
      continue;
    }
    if (type === 'turn_context') {
      model = payload.model ?? model;
      continue;
    }
    if (type === 'event_msg' && (payload.type === 'token_count' || payload.type === 'token_usage')) {
      lastUsage = usageOf(payload) ?? lastUsage;
      continue;
    }
    if (type === 'event_msg' && payload.type === 'agent_message' && current !== null && typeof payload.message === 'string') {
      current.replies.push(payload.message);
      current.lastAt = timestamp;
      continue;
    }
    if (type !== 'response_item' && type !== 'message' && type !== 'function_call' && type !== 'function_call_output') {
      continue;
    }

    if (payload.type === 'message' || type === 'message') {
      const role = payload.role;
      const text = textOf(payload.content).trim();
      if (role === 'user' && text !== '') {
        finalize(timestamp);
        current = {
          prompt: text,
          messageId: payload.id ?? record.id ?? null,
          startedAt: timestamp,
          lastAt: timestamp,
          replies: [],
          tools: [],
          model,
        };
        usageAtStart = lastUsage;
      } else if (role === 'assistant' && text !== '' && current !== null) {
        current.replies.push(text);
        current.lastAt = timestamp;
        current.model = payload.model ?? current.model;
      }
      continue;
    }

    if (payload.type === 'function_call' || type === 'function_call') {
      if (current === null) continue;
      const callId = payload.call_id ?? payload.id ?? `${timestamp}`;
      current.tools.push({
        callId,
        name: payload.name ?? 'unknown',
        category: /mcp/i.test(String(payload.name ?? '')) ? 'mcp' : 'tool',
        arguments: payload.arguments ?? payload.input,
      });
      current.lastAt = timestamp;
      continue;
    }

    if (payload.type === 'function_call_output' || type === 'function_call_output') {
      const callId = payload.call_id ?? payload.id ?? '';
      const output = typeof payload.output === 'string' ? payload.output : JSON.stringify(payload.output ?? '');
      const failed = payload.success === false || /error/i.test(output.slice(0, 80));
      toolsByCall.set(callId, {
        status: failed ? 'error' : 'ok',
        result: output,
        error: failed ? output.slice(0, 400) : undefined,
      });
      current && (current.lastAt = timestamp);
    }
  }
  finalize(Date.now());
  return turns;
}

let files = [];
for await (const file of walk(root)) files.push(file);
files.sort();

const ledger = dryRun ? null : openLedger();
let imported = 0;
let duplicates = 0;
let turns = 0;
try {
  for (const file of files) {
    const records = parseRecords(await readFile(file, 'utf8'));
    const extracted = extract(file, records);
    turns += extracted.length;
    for (const turn of extracted) {
      if (ledger === null) {
        imported += 1;
        continue;
      }
      const result = ledger.ingest({
        ...turn,
        usage: {
          inputTokens: turn.usage.input,
          outputTokens: turn.usage.output,
          totalTokens: turn.usage.total,
          cacheReadTokens: turn.usage.cached,
          reasoningTokens: turn.usage.reasoning,
        },
      });
      if (result.duplicate === true) duplicates += 1;
      else imported += 1;
    }
  }
  console.log(JSON.stringify({ ok: true, root, files: files.length, turns, imported, duplicates, dryRun }, null, 2));
} finally {
  ledger?.close();
}
