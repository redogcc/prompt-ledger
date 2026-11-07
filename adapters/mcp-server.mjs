#!/usr/bin/env node
/**
 * Prompt Ledger MCP server (stdio, dependency-free).
 *
 * Works with MCP clients such as TRAE, Codex, Claude Desktop, Work Buddy and
 * Doubao work editions. It writes the same local SQLite file as the DSH Host,
 * so every platform feeds one ledger.
 *
 * Configure:
 *   { "mcpServers": { "prompt-ledger": {
 *       "command": "node",
 *       "args": ["/absolute/path/to/prompt-ledger/adapters/mcp-server.mjs"],
 *       "env": { "PROMPT_LEDGER_DB": "/optional/custom/path.sqlite3" }
 *   } } }
 */

import { createInterface } from 'node:readline';
import { openLedger, toCsv } from '../ledger.js';

const ledger = openLedger();
const VERSION = '1.0.0';
const SERVER_INFO = {
  name: 'prompt-ledger',
  version: VERSION,
  instructions: [
    'Before ending a turn on platforms without native Prompt Ledger capture, call log_turn exactly once with the user prompt, your final answer, the model, token counts, tools/Skills/MCP used, and the outcome.',
    'Do not invent token counts; omit them when unknown. Human ratings are user-only: never call rate_turn unless the user explicitly gives a 1-5 star rating.',
    'The ledger is local SQLite and never uploads data. Use search_turns or stats when the user asks to review past prompts.',
  ].join(' '),
};

const TOOL_DEFINITIONS = [
  {
    name: 'log_turn',
    description: 'Archive one finished user/assistant turn in the local Prompt Ledger. Call once at the end of a turn on platforms without native capture.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'chatgpt | codex | workbuddy | doubao | trae | generic, or your own id.' },
        prompt: { type: 'string', description: 'The complete user prompt, verbatim.' },
        response: { type: 'string', description: 'The final assistant answer, verbatim.' },
        model: { type: 'string', description: 'Exact model id.' },
        provider: { type: 'string', description: 'Provider id, for example openai or deepseek.' },
        status: { type: 'string', enum: ['completed', 'failed', 'aborted', 'interrupted'] },
        input_tokens: { type: 'integer', minimum: 0 },
        output_tokens: { type: 'integer', minimum: 0 },
        total_tokens: { type: 'integer', minimum: 0 },
        duration_ms: { type: 'integer', minimum: 0 },
        session_id: { type: 'string' },
        source_key: { type: 'string', description: 'Stable platform turn id; makes retries idempotent.' },
        tools: {
          type: 'array',
          description: 'Tools, Skills and MCP calls used in this turn.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              category: { type: 'string', enum: ['tool', 'skill', 'mcp'] },
              status: { type: 'string', enum: ['ok', 'error'] },
              arguments: {},
              result: {},
              error: { type: 'string' },
            },
            required: ['name'],
          },
        },
        skills: { type: 'array', items: { type: 'string' }, description: 'Skill names used.' },
        mcp: { type: 'array', items: { type: 'string' }, description: 'MCP tool names used.' },
        tags: { type: 'array', items: { type: 'string' } },
        rating: {
          type: 'object',
          description: 'Only when the user explicitly provided a rating.',
          properties: {
            stars: { type: 'integer', minimum: 1, maximum: 5 },
            note: { type: 'string' },
          },
          required: ['stars'],
        },
      },
      required: ['platform', 'prompt'],
    },
  },
  {
    name: 'rate_turn',
    description: 'Save a USER-PROVIDED five-star rating. Never call without an explicit human rating.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        stars: { type: 'integer', minimum: 1, maximum: 5 },
        note: { type: 'string' },
      },
      required: ['id', 'stars'],
    },
  },
  {
    name: 'search_turns',
    description: 'Search the local prompt archive by text, platform, model, tool, rating or time window.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        platform: { type: 'string' },
        model: { type: 'string' },
        tool: { type: 'string' },
        min_rating: { type: 'integer', minimum: 1, maximum: 5 },
        range: { type: 'string', enum: ['today', '7d', '30d', '90d', 'all'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'get_turn',
    description: 'Read one turn with its full prompt, result, token breakdown, tool calls, ratings and evaluations.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'stats',
    description: 'Read KPIs, trend, model performance, tool usage and review signals.',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', enum: ['today', '7d', '30d', '90d', 'all'] },
        platform: { type: 'string' },
        model: { type: 'string' },
      },
    },
  },
  {
    name: 'integrity',
    description: 'Verify the append-only SHA-256 event chain and every sealed prompt snapshot.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'export',
    description: 'Export filtered turns as CSV or JSON text.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['csv', 'json'] },
        range: { type: 'string', enum: ['today', '7d', '30d', '90d', 'all'] },
        platform: { type: 'string' },
        model: { type: 'string' },
        q: { type: 'string' },
      },
    },
  },
];

function text(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

function normalizeTools(args) {
  const tools = Array.isArray(args.tools) ? [...args.tools] : [];
  for (const skill of Array.isArray(args.skills) ? args.skills : []) {
    tools.push({ name: String(skill), category: 'skill', status: 'ok' });
  }
  for (const name of Array.isArray(args.mcp) ? args.mcp : []) {
    tools.push({ name: String(name), category: 'mcp', status: 'ok' });
  }
  return tools;
}

function runTool(name, args) {
  if (name === 'log_turn') {
    if (typeof args.prompt !== 'string' || args.prompt.trim() === '') throw new Error('prompt is required');
    const duration = Number.isFinite(Number(args.duration_ms)) ? Math.max(0, Number(args.duration_ms)) : 0;
    const completedAt = Date.now();
    const prompt = ledger.ingest({
      platform: typeof args.platform === 'string' ? args.platform : 'generic',
      sessionId: args.session_id,
      prompt: args.prompt,
      response: args.response,
      model: args.model,
      provider: args.provider,
      status: args.status ?? 'completed',
      startedAt: completedAt - duration,
      completedAt,
      usage: {
        inputTokens: args.input_tokens,
        outputTokens: args.output_tokens,
        totalTokens: args.total_tokens,
      },
      tools: normalizeTools(args),
      tags: args.tags,
      rating: args.rating,
      sourceKey: args.source_key,
    });
    return {
      ok: true,
      id: prompt.id,
      duplicate: prompt.duplicate === true,
      auto: prompt.auto?.total ?? null,
      note: 'Stored locally. Ask the user for a 1-5 star rating, then call rate_turn only if they provide one.',
    };
  }
  if (name === 'rate_turn') {
    if (typeof args.id !== 'string' || args.id === '') throw new Error('id is required');
    const stars = Number(args.stars);
    if (!Number.isFinite(stars) || stars < 1 || stars > 5) throw new Error('stars must be 1-5');
    return { ok: true, rating: ledger.ratePrompt(args.id, stars, args.note ?? '') };
  }
  if (name === 'search_turns') {
    return ledger.listPrompts({
      q: args.q,
      platform: args.platform,
      model: args.model,
      tool: args.tool,
      minRating: args.min_rating,
      range: args.range ?? 'all',
      limit: args.limit ?? 20,
    });
  }
  if (name === 'get_turn') {
    if (typeof args.id !== 'string') throw new Error('id is required');
    const prompt = ledger.getPrompt(args.id);
    if (prompt === null) throw new Error('prompt not found');
    return prompt;
  }
  if (name === 'stats') {
    return ledger.overview({ range: args.range ?? '30d', platform: args.platform, model: args.model });
  }
  if (name === 'integrity') return ledger.integrity();
  if (name === 'export') {
    const rows = ledger.exportRows({
      range: args.range ?? 'all',
      platform: args.platform,
      model: args.model,
      q: args.q,
    });
    return args.format === 'json' ? rows : toCsv(rows);
  }
  throw new Error(`unknown tool "${name}"`);
}

function reply(id, result) {
  if (id === undefined || id === null) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function replyError(id, code, message) {
  if (id === undefined || id === null) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

async function handle(message) {
  if (message === null || typeof message !== 'object') return;
  const { id, method, params } = message;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'ping') {
    reply(id, {});
    return;
  }
  if (method === 'tools/list') {
    reply(id, { tools: TOOL_DEFINITIONS });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments !== null && typeof params?.arguments === 'object' ? params.arguments : {};
    try {
      const value = runTool(String(name), args);
      reply(id, { content: text(value), isError: false });
    } catch (error) {
      reply(id, {
        content: text(`Error: ${error instanceof Error ? error.message : String(error)}`),
        isError: true,
      });
    }
    return;
  }
  if (method === 'resources/list') {
    reply(id, { resources: [] });
    return;
  }
  replyError(id, -32601, `method not found: ${method}`);
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  const trimmed = line.trim();
  if (trimmed === '') return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    process.stderr.write('[prompt-ledger] ignored non-JSON input\n');
    return;
  }
  handle(message).catch((error) => {
    process.stderr.write(`[prompt-ledger] ${error instanceof Error ? error.stack : String(error)}\n`);
  });
});

function shutdown() {
  try {
    ledger.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
lines.on('close', shutdown);
