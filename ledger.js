/**
 * Prompt Ledger storage engine.
 *
 * This module is intentionally dependency-free: it uses Node's built-in
 * `node:sqlite` (Node 22.5+) and is shared by the DSH Host plugin, the MCP
 * server, the importer CLI and the platform adapters. One SQLite file is the
 * single source of truth; every mutation also appends to a SHA-256 hash chain
 * held in `prompt_events`.
 *
 * Design rules:
 * - A prompt row is mutable only while it is being captured (`sealed = 0`).
 * - Once sealed, triggers reject every UPDATE and every DELETE.
 * - Submissions, tool rows, annotations, evaluations and rubric versions are
 *   append-only. Ratings and favourites are new annotation rows, never edits.
 * - `prompt_events` is a global append-only hash chain. `integrity()` replays
 *   it and compares every sealed prompt against its sealed snapshot.
 */

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { aggregateFiles, describeAction, redactSecrets, summarizeActions } from './actions.js';

export const SCHEMA_VERSION = 1;
export const GENESIS_HASH = '0'.repeat(64);

export const PLATFORM_LABELS = {
  dsh: { zh: 'DeepSeek Harness', en: 'DeepSeek Harness' },
  chatgpt: { zh: 'ChatGPT', en: 'ChatGPT' },
  codex: { zh: 'Codex', en: 'Codex' },
  workbuddy: { zh: 'Work Buddy', en: 'Work Buddy' },
  doubao: { zh: '豆包工作版', en: 'Doubao Work' },
  trae: { zh: 'TRAE', en: 'TRAE' },
  generic: { zh: '通用适配器', en: 'Generic adapter' },
};

export const DEFAULT_DIMENSIONS = [
  {
    id: 'outcome',
    zh: '结果完成度',
    en: 'Outcome',
    weight: 0.3,
    descriptionZh: '任务是否按请求完成，是否以错误或中断结束。',
    descriptionEn: 'Whether the task finished as requested, or ended in error/interruption.',
  },
  {
    id: 'quality',
    zh: '回答质量',
    en: 'Answer quality',
    weight: 0.25,
    descriptionZh: '最终回答是否存在、信息是否充分、能否直接使用。',
    descriptionEn: 'Whether a usable final answer exists and is substantive.',
  },
  {
    id: 'tool',
    zh: '工具效率',
    en: 'Tool efficiency',
    weight: 0.2,
    descriptionZh: '工具、Skill 与 MCP 调用的成功率与必要性。',
    descriptionEn: 'Success rate and necessity of tools, skills and MCP calls.',
  },
  {
    id: 'tokens',
    zh: 'Token 效率',
    en: 'Token efficiency',
    weight: 0.15,
    descriptionZh: '完成同类任务所消耗的上下文与输出 Token。',
    descriptionEn: 'Context and output tokens spent to finish the task.',
  },
  {
    id: 'speed',
    zh: '响应速度',
    en: 'Speed',
    weight: 0.1,
    descriptionZh: '从提交提示词到回合结束的端到端耗时。',
    descriptionEn: 'End-to-end time from prompt submission to turn end.',
  },
];

const DAY = 86_400_000;

/* -------------------------------------------------------------------------- */
/* Hashing and normalisation                                                   */
/* -------------------------------------------------------------------------- */

export function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

/** Deterministic JSON so hashes do not depend on object key insertion order. */
export function canonicalJson(value) {
  const seen = new Set();
  function walk(input) {
    if (input === null || typeof input === 'number' || typeof input === 'boolean') return input;
    if (typeof input === 'string') return input;
    if (typeof input === 'bigint') return Number(input);
    if (input === undefined) return null;
    if (typeof input !== 'object') return String(input);
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    if (Array.isArray(input)) {
      const output = input.map(walk);
      seen.delete(input);
      return output;
    }
    const output = {};
    for (const key of Object.keys(input).sort()) {
      if (input[key] === undefined) continue;
      output[key] = walk(input[key]);
    }
    seen.delete(input);
    return output;
  }
  return JSON.stringify(walk(value));
}

function parseJson(text, fallback) {
  if (typeof text !== 'string' || text === '') return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value !== ''))];
}

function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function toMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function clip(value, max) {
  const text = typeof value === 'string' ? value : '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Text out of a message's content blocks. */
export function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block.type === 'image') parts.push('[图片]');
    else if (block.type === 'file') parts.push(`[文件 ${block.attachment?.name ?? ''}]`);
    else if (block.type === 'tool-call') parts.push(`[工具 ${block.name ?? ''}]`);
  }
  return parts.join('\n').trim();
}

function normalizeUsage(input) {
  const usage = input !== null && typeof input === 'object' ? input : {};
  const inputTokens = toInt(usage.inputTokens ?? usage.promptTokens ?? usage.input_tokens);
  const outputTokens = toInt(usage.outputTokens ?? usage.completionTokens ?? usage.output_tokens);
  const totalTokens = toInt(usage.totalTokens ?? usage.total_tokens) || inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens: toInt(usage.cacheReadTokens ?? usage.cache_read_tokens),
    cacheWriteTokens: toInt(usage.cacheWriteTokens ?? usage.cache_write_tokens),
    reasoningTokens: toInt(usage.reasoningTokens ?? usage.reasoning_tokens),
  };
}

export function classifyTool(name) {
  const lower = typeof name === 'string' ? name.toLowerCase() : '';
  if (lower === 'skill' || lower.startsWith('skill__') || lower.startsWith('skill/')) {
    return 'skill';
  }
  if (
    lower.startsWith('mcp__')
    || lower.startsWith('mcp:')
    || lower.startsWith('mcp-')
    || lower.startsWith('mcp.')
    || lower.includes('__mcp__')
    || lower.startsWith('mcp_')
  ) {
    return 'mcp';
  }
  return 'tool';
}

export function skillNameFromCall(name, rawArguments) {
  if (name !== 'skill') return null;
  const parsed = parseJson(rawArguments, null);
  if (parsed !== null && typeof parsed === 'object') {
    if (typeof parsed.name === 'string') return parsed.name;
    if (typeof parsed.skill === 'string') return parsed.skill;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Time filters                                                                */
/* -------------------------------------------------------------------------- */

export function resolveFilters(input = {}) {
  const now = Date.now();
  const range = typeof input.range === 'string' ? input.range : '';
  let from = Number(input.from);
  let to = Number(input.to);
  if (!Number.isFinite(from) || from <= 0) from = undefined;
  if (!Number.isFinite(to) || to <= 0) to = undefined;
  if (from === undefined && range !== '' && range !== 'all') {
    const match = /^(\d+)([dh])$/.exec(range);
    if (match !== null) {
      from = now - Number(match[1]) * (match[2] === 'd' ? DAY : 3_600_000);
    } else if (range === 'today') {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      from = date.getTime();
    }
  }
  const limitRaw = Number(input.limit);
  const offsetRaw = Number(input.offset);
  return {
    from,
    to,
    range: range === '' ? 'all' : range,
    platform: typeof input.platform === 'string' && input.platform !== '' ? input.platform : undefined,
    model: typeof input.model === 'string' && input.model !== '' ? input.model : undefined,
    tool: typeof input.tool === 'string' && input.tool !== '' ? input.tool : undefined,
    skill: typeof input.skill === 'string' && input.skill !== '' ? input.skill : undefined,
    mcp: typeof input.mcp === 'string' && input.mcp !== '' ? input.mcp : undefined,
    status: typeof input.status === 'string' && input.status !== '' ? input.status : undefined,
    sessionId: typeof input.sessionId === 'string' && input.sessionId !== '' ? input.sessionId : undefined,
    minRating: Number.isFinite(Number(input.minRating)) && Number(input.minRating) > 0
      ? Math.min(5, Math.max(1, Math.round(Number(input.minRating))))
      : undefined,
    q: typeof input.q === 'string' ? input.q.trim().slice(0, 120) : '',
    limit: Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.trunc(limitRaw))) : 40,
    offset: Number.isFinite(offsetRaw) ? Math.max(0, Math.trunc(offsetRaw)) : 0,
    sort: ['newest', 'oldest', 'rating', 'tokens', 'auto'].includes(input.sort) ? input.sort : 'newest',
  };
}

function whereClause(filters) {
  const clauses = [];
  const params = [];
  if (filters.from !== undefined) {
    clauses.push('p.created_at >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    clauses.push('p.created_at <= ?');
    params.push(filters.to);
  }
  if (filters.platform !== undefined) {
    clauses.push('p.platform = ?');
    params.push(filters.platform);
  }
  if (filters.model !== undefined) {
    clauses.push('p.model = ?');
    params.push(filters.model);
  }
  if (filters.sessionId !== undefined) {
    clauses.push('p.session_id = ?');
    params.push(filters.sessionId);
  }
  if (filters.status !== undefined) {
    clauses.push('p.status = ?');
    params.push(filters.status);
  }
  if (filters.q !== '') {
    clauses.push(`(
      p.prompt_text LIKE ? OR p.assistant_text LIKE ? OR p.model LIKE ?
      OR EXISTS (
        SELECT 1 FROM prompt_annotations ta
        WHERE ta.prompt_id = p.id AND ta.kind = 'tags' AND ta.value_json LIKE ?
      )
    )`);
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }
  if (filters.minRating !== undefined) {
    clauses.push(`(
      SELECT CAST(json_extract(a.value_json, '$.stars') AS INTEGER)
      FROM prompt_annotations a
      WHERE a.prompt_id = p.id AND a.kind = 'rating'
      ORDER BY a.id DESC LIMIT 1
    ) >= ?`);
    params.push(filters.minRating);
  }
  if (filters.tool !== undefined) {
    clauses.push('EXISTS (SELECT 1 FROM tool_invocations t WHERE t.prompt_id = p.id AND t.name = ?)');
    params.push(filters.tool);
  }
  if (filters.skill !== undefined) {
    clauses.push('EXISTS (SELECT 1 FROM json_each(p.skills_json) WHERE value = ?)');
    params.push(filters.skill);
  }
  if (filters.mcp !== undefined) {
    clauses.push('EXISTS (SELECT 1 FROM json_each(p.mcp_json) WHERE value = ?)');
    params.push(filters.mcp);
  }
  return { sql: clauses.length === 0 ? '1=1' : clauses.join(' AND '), params };
}

/* -------------------------------------------------------------------------- */
/* Prompt snapshots                                                            */
/* -------------------------------------------------------------------------- */

const SNAPSHOT_FIELDS = [
  'id',
  'source_key',
  'platform',
  'session_id',
  'cwd',
  'turn',
  'source_seq',
  'created_at',
  'captured_at',
  'prompt_text',
  'prompt_hash',
  'prompt_chars',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'reasoning_tokens',
  'provider',
  'model',
  'models_json',
  'status',
  'finish_reason',
  'error_text',
  'assistant_text',
  'latency_ms',
  'tool_calls',
  'tool_errors',
  'tools_json',
  'skills_json',
  'mcp_json',
  'meta_json',
  'sealed',
  'finalized_at',
];

function snapshotOfPrompt(row) {
  const snapshot = {};
  for (const field of SNAPSHOT_FIELDS) snapshot[field] = row[field] ?? null;
  return snapshot;
}

function hashSnapshot(row) {
  return sha256(canonicalJson(snapshotOfPrompt(row)));
}

/* -------------------------------------------------------------------------- */
/* Ledger                                                                      */
/* -------------------------------------------------------------------------- */

export function defaultDbPath(env = process.env) {
  if (typeof env.PROMPT_LEDGER_DB === 'string' && env.PROMPT_LEDGER_DB !== '') {
    return env.PROMPT_LEDGER_DB;
  }
  const home = env.DSH_HOME || join(homedir(), '.dsh');
  return join(home, 'prompt-ledger', 'prompt-ledger.sqlite3');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  source_key TEXT UNIQUE,
  platform TEXT NOT NULL DEFAULT 'generic',
  session_id TEXT,
  cwd TEXT,
  turn INTEGER,
  source_seq INTEGER,
  created_at INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  prompt_chars INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  model TEXT,
  models_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running',
  finish_reason TEXT,
  error_text TEXT,
  assistant_text TEXT,
  latency_ms INTEGER,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  tool_errors INTEGER NOT NULL DEFAULT 0,
  tools_json TEXT NOT NULL DEFAULT '[]',
  skills_json TEXT NOT NULL DEFAULT '[]',
  mcp_json TEXT NOT NULL DEFAULT '[]',
  meta_json TEXT NOT NULL DEFAULT '{}',
  sealed INTEGER NOT NULL DEFAULT 0,
  finalized_at INTEGER,
  row_hash TEXT NOT NULL DEFAULT '',
  tags_cache TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS prompt_submissions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  source_key TEXT UNIQUE,
  seq INTEGER,
  created_at INTEGER NOT NULL,
  text TEXT NOT NULL,
  chars INTEGER NOT NULL,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_invocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT NOT NULL,
  call_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'tool',
  args_excerpt TEXT,
  args_hash TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  error_text TEXT,
  result_excerpt TEXT,
  seq INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS tool_invocations_call
  ON tool_invocations(prompt_id, call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tool_invocations_prompt ON tool_invocations(prompt_id);

CREATE TABLE IF NOT EXISTS action_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT NOT NULL,
  call_id TEXT,
  parent_call_id TEXT,
  root_call_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'tool',
  kind TEXT NOT NULL DEFAULT 'other',
  title_zh TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  targets_json TEXT NOT NULL DEFAULT '[]',
  detail_json TEXT NOT NULL DEFAULT '{}',
  args_excerpt TEXT,
  args_hash TEXT,
  result_excerpt TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  error_text TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  seq INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS action_events_call
  ON action_events(prompt_id, call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS action_events_prompt ON action_events(prompt_id);

CREATE TABLE IF NOT EXISTS prompt_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS prompt_annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  event_id INTEGER
);
CREATE INDEX IF NOT EXISTS prompt_annotations_latest ON prompt_annotations(prompt_id, kind, id);

CREATE TABLE IF NOT EXISTS prompt_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT NOT NULL,
  source TEXT NOT NULL,
  evaluator TEXT,
  model TEXT,
  total REAL NOT NULL,
  dimensions_json TEXT NOT NULL,
  notes TEXT,
  rubric_version INTEGER,
  created_at INTEGER NOT NULL,
  event_id INTEGER
);
CREATE INDEX IF NOT EXISTS prompt_evaluations_latest ON prompt_evaluations(prompt_id, id);

CREATE TABLE IF NOT EXISTS rubrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  dimensions_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS prompts_created ON prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS prompts_platform ON prompts(platform);
CREATE INDEX IF NOT EXISTS prompts_model ON prompts(model);
CREATE INDEX IF NOT EXISTS prompts_status ON prompts(status);
CREATE INDEX IF NOT EXISTS prompts_sealed ON prompts(sealed);
CREATE INDEX IF NOT EXISTS events_prompt ON prompt_events(prompt_id);

CREATE TRIGGER IF NOT EXISTS prompts_no_delete
BEFORE DELETE ON prompts
BEGIN SELECT RAISE(ABORT, 'prompts are append-only'); END;

CREATE TRIGGER IF NOT EXISTS prompts_sealed_immutable
BEFORE UPDATE ON prompts
WHEN OLD.sealed = 1
BEGIN SELECT RAISE(ABORT, 'sealed prompt is immutable'); END;

CREATE TRIGGER IF NOT EXISTS submissions_no_update
BEFORE UPDATE ON prompt_submissions
BEGIN SELECT RAISE(ABORT, 'prompt submissions are append-only'); END;

CREATE TRIGGER IF NOT EXISTS submissions_no_delete
BEFORE DELETE ON prompt_submissions
BEGIN SELECT RAISE(ABORT, 'prompt submissions are append-only'); END;

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON prompt_events
BEGIN SELECT RAISE(ABORT, 'prompt event chain is append-only'); END;

CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON prompt_events
BEGIN SELECT RAISE(ABORT, 'prompt event chain is append-only'); END;

CREATE TRIGGER IF NOT EXISTS annotations_no_update
BEFORE UPDATE ON prompt_annotations
BEGIN SELECT RAISE(ABORT, 'annotations are append-only'); END;

CREATE TRIGGER IF NOT EXISTS annotations_no_delete
BEFORE DELETE ON prompt_annotations
BEGIN SELECT RAISE(ABORT, 'annotations are append-only'); END;

CREATE TRIGGER IF NOT EXISTS evaluations_no_update
BEFORE UPDATE ON prompt_evaluations
BEGIN SELECT RAISE(ABORT, 'evaluations are append-only'); END;

CREATE TRIGGER IF NOT EXISTS evaluations_no_delete
BEFORE DELETE ON prompt_evaluations
BEGIN SELECT RAISE(ABORT, 'evaluations are append-only'); END;

CREATE TRIGGER IF NOT EXISTS rubrics_no_update
BEFORE UPDATE ON rubrics
BEGIN SELECT RAISE(ABORT, 'rubric versions are append-only'); END;

CREATE TRIGGER IF NOT EXISTS rubrics_no_delete
BEFORE DELETE ON rubrics
BEGIN SELECT RAISE(ABORT, 'rubric versions are append-only'); END;

CREATE TRIGGER IF NOT EXISTS tools_no_update_after_seal
BEFORE UPDATE ON tool_invocations
WHEN (SELECT sealed FROM prompts WHERE id = OLD.prompt_id) = 1
BEGIN SELECT RAISE(ABORT, 'tool invocation is sealed'); END;

CREATE TRIGGER IF NOT EXISTS tools_no_delete
BEFORE DELETE ON tool_invocations
BEGIN SELECT RAISE(ABORT, 'tool invocations are append-only'); END;

CREATE TRIGGER IF NOT EXISTS actions_no_update_after_seal
BEFORE UPDATE ON action_events
WHEN (SELECT sealed FROM prompts WHERE id = OLD.prompt_id) = 1
BEGIN SELECT RAISE(ABORT, 'action event is sealed'); END;

CREATE TRIGGER IF NOT EXISTS actions_no_delete
BEFORE DELETE ON action_events
BEGIN SELECT RAISE(ABORT, 'action events are append-only'); END;
`;

export class Ledger {
  #db;

  #depth = 0;

  constructor(dbPath = defaultDbPath()) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
    this.#db = new DatabaseSync(dbPath);
    this.#db.exec('PRAGMA journal_mode = WAL;');
    this.#db.exec('PRAGMA synchronous = NORMAL;');
    this.#db.exec('PRAGMA busy_timeout = 5000;');
    this.#db.exec('PRAGMA foreign_keys = ON;');
    this.#db.exec(SCHEMA);
    this.#db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    this.#seed();
  }

  get raw() {
    return this.#db;
  }

  close() {
    try {
      this.#db.close();
    } catch {
      /* already closed */
    }
  }

  #tx(fn) {
    if (this.#depth > 0) return fn();
    this.#db.exec('BEGIN IMMEDIATE');
    this.#depth = 1;
    try {
      const value = fn();
      this.#db.exec('COMMIT');
      return value;
    } catch (error) {
      try {
        this.#db.exec('ROLLBACK');
      } catch {
        /* rollback after a failed BEGIN */
      }
      throw error;
    } finally {
      this.#depth = 0;
    }
  }

  #seed() {
    this.#tx(() => {
      const rubric = this.#db.prepare('SELECT version FROM rubrics ORDER BY version DESC LIMIT 1').get();
      if (rubric === undefined) {
        this.#db.prepare('INSERT INTO rubrics (version, dimensions_json, updated_at, note) VALUES (?, ?, ?, ?)')
          .run(1, JSON.stringify(DEFAULT_DIMENSIONS), Date.now(), 'default rubric');
      }
      const now = Date.now();
      const defaults = {
        auto_eval: '1',
        model_eval: '0',
        ingest_token: randomUUID().replaceAll('-', ''),
        capture_backfill: '1',
      };
      const insert = this.#db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
      for (const [key, value] of Object.entries(defaults)) insert.run(key, value, now);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Event chain                                                             */
  /* ---------------------------------------------------------------------- */

  #lastHash() {
    const row = this.#db.prepare('SELECT hash FROM prompt_events ORDER BY id DESC LIMIT 1').get();
    return row?.hash ?? GENESIS_HASH;
  }

  #appendEvent(promptId, kind, payload, at = Date.now()) {
    const prevHash = this.#lastHash();
    const payloadJson = canonicalJson(payload);
    const hash = sha256(`${prevHash}\n${kind}\n${promptId ?? ''}\n${at}\n${payloadJson}`);
    const result = this.#db.prepare(
      'INSERT INTO prompt_events (prompt_id, kind, payload_json, created_at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(promptId ?? null, kind, payloadJson, at, prevHash, hash);
    return { id: Number(result.lastInsertRowid), hash, prevHash, payloadJson, at };
  }

  appendEvent(promptId, kind, payload, at = Date.now()) {
    return this.#tx(() => this.#appendEvent(promptId, kind, payload, at));
  }

  /* ---------------------------------------------------------------------- */
  /* Settings and rubrics                                                    */
  /* ---------------------------------------------------------------------- */

  settings() {
    const rows = this.#db.prepare('SELECT key, value FROM settings').all();
    const values = {};
    for (const row of rows) values[row.key] = row.value;
    return values;
  }

  setSettings(patch) {
    const allowed = new Set(['auto_eval', 'model_eval', 'capture_backfill']);
    const now = Date.now();
    return this.#tx(() => {
      const statement = this.#db.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      );
      for (const [key, value] of Object.entries(patch ?? {})) {
        if (!allowed.has(key)) continue;
        statement.run(key, String(value), now);
      }
      this.#appendEvent(null, 'settings.updated', { patch }, now);
      return this.settings();
    });
  }

  rubric() {
    const row = this.#db.prepare('SELECT version, dimensions_json, updated_at, note FROM rubrics ORDER BY version DESC LIMIT 1').get();
    const dimensions = parseJson(row?.dimensions_json, DEFAULT_DIMENSIONS);
    return {
      version: row?.version ?? 1,
      updatedAt: row?.updated_at ?? null,
      note: row?.note ?? null,
      dimensions: Array.isArray(dimensions) && dimensions.length > 0 ? dimensions : DEFAULT_DIMENSIONS,
    };
  }

  updateRubric(dimensions, note = '') {
    if (!Array.isArray(dimensions) || dimensions.length < 3 || dimensions.length > 8) {
      throw new Error('rubric needs 3-8 dimensions');
    }
    const normalized = dimensions.map((dimension, index) => {
      const id = typeof dimension?.id === 'string' && /^[a-z][a-z0-9_]{1,31}$/.test(dimension.id)
        ? dimension.id
        : `dim_${index + 1}`;
      const weight = Number(dimension?.weight);
      return {
        id,
        zh: typeof dimension?.zh === 'string' && dimension.zh !== '' ? dimension.zh.slice(0, 40) : id,
        en: typeof dimension?.en === 'string' && dimension.en !== '' ? dimension.en.slice(0, 40) : id,
        weight: Number.isFinite(weight) ? Math.min(1, Math.max(0.01, weight)) : 0.2,
        descriptionZh: typeof dimension?.descriptionZh === 'string' ? dimension.descriptionZh.slice(0, 160) : '',
        descriptionEn: typeof dimension?.descriptionEn === 'string' ? dimension.descriptionEn.slice(0, 160) : '',
      };
    });
    const total = normalized.reduce((sum, dimension) => sum + dimension.weight, 0);
    if (!(total > 0)) throw new Error('rubric weights must sum to more than zero');
    for (const dimension of normalized) dimension.weight = Number((dimension.weight / total).toFixed(4));
    return this.#tx(() => {
      const latest = this.#db.prepare('SELECT version FROM rubrics ORDER BY version DESC LIMIT 1').get();
      const version = (latest?.version ?? 0) + 1;
      const now = Date.now();
      this.#db.prepare('INSERT INTO rubrics (version, dimensions_json, updated_at, note) VALUES (?, ?, ?, ?)')
        .run(version, JSON.stringify(normalized), now, String(note).slice(0, 160));
      this.#appendEvent(null, 'rubric.updated', { version, dimensions: normalized }, now);
      return this.rubric();
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Capture                                                                 */
  /* ---------------------------------------------------------------------- */

  #promptRow(id) {
    return this.#db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
  }

  isSealed(id) {
    const row = this.#db.prepare('SELECT sealed FROM prompts WHERE id = ?').get(id);
    return row === undefined || row.sealed === 1;
  }

  #eventSequenceSeen(promptId, kind, seq) {
    if (!Number.isFinite(seq)) return false;
    return this.#db.prepare(`
      SELECT 1 AS seen FROM prompt_events
      WHERE prompt_id = ? AND kind = ? AND json_extract(payload_json, '$.seq') = ?
      LIMIT 1
    `).get(promptId, kind, Math.trunc(seq)) !== undefined;
  }

  openPromptForSession(sessionId) {
    return this.#db.prepare(
      'SELECT id FROM prompts WHERE session_id = ? AND sealed = 0 ORDER BY created_at DESC LIMIT 1',
    ).get(sessionId)?.id;
  }

  openPromptsForSession(sessionId) {
    return this.#db.prepare(
      'SELECT id FROM prompts WHERE session_id = ? AND sealed = 0 ORDER BY created_at DESC',
    ).all(sessionId).map((row) => row.id);
  }

  openPromptIds() {
    return this.#db.prepare('SELECT id FROM prompts WHERE sealed = 0').all().map((row) => row.id);
  }

  openPromptRows() {
    return this.#db.prepare('SELECT id, session_id, created_at FROM prompts WHERE sealed = 0').all();
  }

  /**
   * Record one user submission. Reuses the open prompt for a session, so a
   * steering message inside the same turn appends to the same run.
   */
  recordSubmission(input) {
    const text = String(input.text ?? '').trim();
    if (text === '') return null;
    const now = Date.now();
    const at = toMs(input.at ?? now);
    const sourceKey = input.sourceKey ?? null;
    if (sourceKey !== null) {
      const duplicate = this.#db.prepare(
        'SELECT prompt_id FROM prompt_submissions WHERE source_key = ?',
      ).get(sourceKey);
      if (duplicate !== undefined) return duplicate.prompt_id;
    }

    let promptId = input.promptId ?? null;
    if (promptId !== null && this.isSealed(promptId)) promptId = null;
    if (promptId === null && input.sessionId) promptId = this.openPromptForSession(input.sessionId) ?? null;
    if (promptId !== null && this.isSealed(promptId)) promptId = null;

    return this.#tx(() => {
      let existing = promptId === null ? undefined : this.#promptRow(promptId);
      if (existing === undefined) {
        promptId = randomUUID();
        const promptHash = sha256(text);
        this.#db.prepare(`
          INSERT INTO prompts (
            id, source_key, platform, session_id, cwd, turn, source_seq,
            created_at, captured_at, prompt_text, prompt_hash, prompt_chars, meta_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          promptId,
          input.promptSourceKey ?? (sourceKey === null ? null : `run:${sourceKey}`),
          input.platform ?? 'generic',
          input.sessionId ?? null,
          input.cwd ?? null,
          Number.isFinite(input.turn) ? Math.trunc(input.turn) : null,
          Number.isFinite(input.seq) ? Math.trunc(input.seq) : null,
          at,
          now,
          text,
          promptHash,
          text.length,
          JSON.stringify(input.meta ?? {}),
        );
        existing = this.#promptRow(promptId);
        this.#appendEvent(promptId, 'prompt.created', {
          platform: existing.platform,
          sessionId: existing.session_id,
          seq: existing.source_seq,
          at,
          textHash: promptHash,
          chars: text.length,
        }, now);
      }

      const submissionId = randomUUID();
      this.#db.prepare(`
        INSERT INTO prompt_submissions (id, prompt_id, source_key, seq, created_at, text, chars, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        submissionId,
        promptId,
        sourceKey,
        Number.isFinite(input.seq) ? Math.trunc(input.seq) : null,
        at,
        text,
        text.length,
        sha256(text),
      );

      const combined = existing.prompt_text === text
        ? existing.prompt_text
        : `${existing.prompt_text}\n\n— — —\n\n${text}`;
      this.#db.prepare(`
        UPDATE prompts SET prompt_text = ?, prompt_hash = ?, prompt_chars = ? WHERE id = ? AND sealed = 0
      `).run(combined, sha256(combined), combined.length, promptId);

      this.#appendEvent(promptId, 'prompt.submission', {
        submissionId,
        seq: Number.isFinite(input.seq) ? Math.trunc(input.seq) : null,
        at,
        text,
        chars: text.length,
        hash: sha256(text),
      }, now);

      return promptId;
    });
  }

  recordTurn(promptId, turn, at = Date.now(), seq = null) {
    if (promptId === null || promptId === undefined || this.isSealed(promptId)) return;
    if (this.#eventSequenceSeen(promptId, 'turn.started', seq)) return;
    this.#tx(() => {
      this.#db.prepare('UPDATE prompts SET turn = ? WHERE id = ? AND sealed = 0').run(Math.trunc(turn), promptId);
      this.#appendEvent(promptId, 'turn.started', { turn, seq }, at);
    });
  }

  recordAssistant(promptId, input) {
    if (promptId === null || promptId === undefined || this.isSealed(promptId)) return;
    if (this.#eventSequenceSeen(promptId, 'assistant.message', input.seq)) return;
    const usage = normalizeUsage(input.usage);
    const at = toMs(input.at);
    this.#tx(() => {
      const row = this.#promptRow(promptId);
      if (row === undefined || row.sealed === 1) return;
      const models = uniqueStrings([
        ...parseJson(row.models_json, []),
        typeof input.model === 'string' ? input.model : '',
      ]);
      const text = typeof input.text === 'string' && input.text.trim() !== '' ? input.text : row.assistant_text;
      this.#db.prepare(`
        UPDATE prompts SET
          input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?,
          total_tokens = total_tokens + ?,
          cache_read_tokens = cache_read_tokens + ?,
          cache_write_tokens = cache_write_tokens + ?,
          reasoning_tokens = reasoning_tokens + ?,
          provider = COALESCE(?, provider),
          model = COALESCE(?, model),
          models_json = ?,
          assistant_text = ?
        WHERE id = ? AND sealed = 0
      `).run(
        usage.inputTokens,
        usage.outputTokens,
        usage.totalTokens,
        usage.cacheReadTokens,
        usage.cacheWriteTokens,
        usage.reasoningTokens,
        input.provider ?? null,
        input.model ?? null,
        JSON.stringify(models),
        text ?? null,
        promptId,
      );
      this.#appendEvent(promptId, 'assistant.message', {
        at,
        seq: input.seq ?? null,
        turn: input.turn ?? null,
        step: input.step ?? null,
        provider: input.provider ?? null,
        model: input.model ?? null,
        usage,
        text: text ?? null,
        textHash: text === null ? null : sha256(text),
      }, at);
    });
  }

  recordToolCall(promptId, input) {
    if (promptId === null || promptId === undefined || this.isSealed(promptId)) return;
    const name = String(input.name ?? 'unknown');
    const category = input.category ?? classifyTool(name);
    const rawArguments = typeof input.arguments === 'string'
      ? input.arguments
      : canonicalJson(input.arguments ?? null);
    const at = toMs(input.at);
    const skill = input.skill ?? skillNameFromCall(name, rawArguments);
    this.#tx(() => {
      const row = this.#promptRow(promptId);
      if (row === undefined || row.sealed === 1) return;
      const tools = uniqueStrings([...parseJson(row.tools_json, []), category === 'tool' ? name : '']);
      const skills = uniqueStrings([...parseJson(row.skills_json, []), category === 'skill' ? (skill ?? name) : (skill ?? '')]);
      const mcp = uniqueStrings([...parseJson(row.mcp_json, []), category === 'mcp' ? name : '']);
      const existingCall = input.callId === undefined || input.callId === null
        ? undefined
        : this.#db.prepare('SELECT id FROM tool_invocations WHERE prompt_id = ? AND call_id = ?').get(promptId, input.callId);
      if (existingCall !== undefined) {
        this.#db.prepare(`
          UPDATE tool_invocations SET
            name = ?, category = ?, args_excerpt = ?, args_hash = ?, started_at = ?
          WHERE id = ?
        `).run(name, category, clip(rawArguments, 20_000), sha256(rawArguments), at, existingCall.id);
        return;
      }
      if (this.#eventSequenceSeen(promptId, 'tool.call', input.seq)) return;
      this.#db.prepare(`
        INSERT INTO tool_invocations (prompt_id, call_id, name, category, args_excerpt, args_hash, started_at, seq)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        promptId,
        input.callId ?? null,
        name,
        category,
        clip(rawArguments, 20_000),
        sha256(rawArguments),
        at,
        Number.isFinite(input.seq) ? Math.trunc(input.seq) : null,
      );
      this.#db.prepare(`
        UPDATE prompts SET tool_calls = tool_calls + 1, tools_json = ?, skills_json = ?, mcp_json = ?
        WHERE id = ? AND sealed = 0
      `).run(JSON.stringify(tools), JSON.stringify(skills), JSON.stringify(mcp), promptId);
      this.#appendEvent(promptId, 'tool.call', {
        at,
        seq: input.seq ?? null,
        callId: input.callId ?? null,
        name,
        category,
        skill,
        argumentsHash: sha256(rawArguments),
        arguments: clip(rawArguments, 20_000),
      }, at);
    });
  }

  recordToolResult(promptId, input) {
    if (promptId === null || promptId === undefined || this.isSealed(promptId)) return;
    if (this.#eventSequenceSeen(promptId, 'tool.result', input.seq)) return;
    const at = toMs(input.at);
    const failed = input.isError === true
      || (input.error !== undefined && input.error !== null)
      || input.status === 'error';
    this.#tx(() => {
      const row = this.#promptRow(promptId);
      if (row === undefined || row.sealed === 1) return;
      const resultText = clip(
        typeof input.result === 'string' ? input.result : canonicalJson(input.result ?? null),
        20_000,
      );
      const errorText = input.error === undefined || input.error === null
        ? null
        : typeof input.error === 'string'
          ? input.error
          : canonicalJson(input.error);
      this.#db.prepare(`
        UPDATE tool_invocations SET
          ended_at = ?, status = ?, error_text = ?, result_excerpt = ?
        WHERE prompt_id = ? AND (call_id = ? OR (? IS NULL AND id = (
          SELECT id FROM tool_invocations WHERE prompt_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1
        )))
      `).run(
        at,
        failed ? 'error' : 'ok',
        errorText === null ? null : clip(errorText, 2_000),
        resultText,
        promptId,
        input.callId ?? null,
        input.callId ?? null,
        promptId,
      );
      if (failed) {
        this.#db.prepare('UPDATE prompts SET tool_errors = tool_errors + 1 WHERE id = ? AND sealed = 0').run(promptId);
      }
      this.#appendEvent(promptId, 'tool.result', {
        at,
        seq: input.seq ?? null,
        callId: input.callId ?? null,
        name: input.name ?? null,
        status: failed ? 'error' : 'ok',
        error: errorText === null ? null : clip(errorText, 2_000),
        resultHash: sha256(resultText),
        result: resultText,
      }, at);
    });
  }

  /**
   * Record a user-facing action. Nested run_code / PTC calls, direct tool calls
   * and adapter-provided actions all land here; run_code itself is hidden so
   * the timeline shows the actual reads, edits, commands and deliveries.
   */
  recordActionStart(promptId, input = {}) {
    if (promptId === null || promptId === undefined || this.isSealed(promptId)) return;
    const name = String(input.name ?? 'unknown');
    const rawArguments = typeof input.arguments === 'string'
      ? input.arguments
      : canonicalJson(input.arguments ?? null);
    const at = toMs(input.at);
    const prompt = this.#promptRow(promptId);
    if (prompt === undefined || prompt.sealed === 1) return;
    const action = describeAction(name, rawArguments, { cwd: input.cwd ?? prompt.cwd ?? '' });
    const callId = input.callId ?? null;
    const hidden = input.hidden === true || action.hidden === true;
    const argsExcerpt = clip(redactSecrets(rawArguments), 8_000);
    this.#tx(() => {
      const row = this.#promptRow(promptId);
      if (row === undefined || row.sealed === 1) return;
      const existing = callId === null
        ? undefined
        : this.#db.prepare('SELECT id FROM action_events WHERE prompt_id = ? AND call_id = ?').get(promptId, callId);
      if (existing !== undefined) {
        this.#db.prepare(
          "UPDATE action_events SET "
          + "name = ?, category = ?, kind = ?, title_zh = ?, title_en = ?, "
          + "targets_json = ?, detail_json = ?, args_excerpt = ?, args_hash = ?, "
          + "started_at = ?, hidden = ?, meta_json = ? "
          + "WHERE id = ?"
        ).run(
          name, action.category, action.kind, action.titleZh, action.titleEn,
          JSON.stringify(action.targets), JSON.stringify(action.detail),
          argsExcerpt, sha256(rawArguments), at, hidden ? 1 : 0,
          JSON.stringify(input.meta ?? {}), existing.id,
        );
        return;
      }
      this.#db.prepare(
        "INSERT INTO action_events ("
        + "prompt_id, call_id, parent_call_id, root_call_id, name, category, kind, "
        + "title_zh, title_en, targets_json, detail_json, args_excerpt, args_hash, "
        + "started_at, seq, hidden, meta_json"
        + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        promptId, callId, input.parentCallId ?? null, input.rootCallId ?? null,
        name, action.category, action.kind, action.titleZh, action.titleEn,
        JSON.stringify(action.targets), JSON.stringify(action.detail),
        argsExcerpt, sha256(rawArguments), at,
        Number.isFinite(input.seq) ? Math.trunc(input.seq) : null,
        hidden ? 1 : 0, JSON.stringify(input.meta ?? {}),
      );
      this.#appendEvent(promptId, 'action.call', {
        at,
        seq: input.seq ?? null,
        callId,
        parentCallId: input.parentCallId ?? null,
        rootCallId: input.rootCallId ?? null,
        name,
        kind: action.kind,
        targets: action.targets,
      }, at);
    });
  }

  recordActionResult(promptId, input = {}) {
    if (promptId === null || promptId === undefined || this.isSealed(promptId)) return;
    const callId = input.callId ?? null;
    if (callId !== null) {
      const existing = this.#db.prepare('SELECT id FROM action_events WHERE prompt_id = ? AND call_id = ?').get(promptId, callId);
      if (existing === undefined && typeof input.name === 'string') {
        this.recordActionStart(promptId, {
          at: input.at,
          seq: input.seq,
          callId,
          name: input.name,
          arguments: input.arguments ?? {},
        });
      }
    }
    const at = toMs(input.at);
    const resultText = clip(
      typeof input.result === 'string' ? input.result : canonicalJson(input.result ?? null),
      20_000,
    );
    const errorText = input.error === undefined || input.error === null
      ? null
      : typeof input.error === 'string'
        ? input.error
        : canonicalJson(input.error);
    const failed = input.isError === true
      || errorText !== null
      || input.status === 'error';
    this.#tx(() => {
      const row = this.#promptRow(promptId);
      if (row === undefined || row.sealed === 1) return;
      const updated = this.#db.prepare(
        "UPDATE action_events SET "
        + "ended_at = ?, status = ?, error_text = ?, result_excerpt = ? "
        + "WHERE prompt_id = ? AND call_id = ?"
      ).run(
        at,
        failed ? 'error' : 'ok',
        errorText === null ? null : clip(redactSecrets(errorText), 2_000),
        clip(redactSecrets(resultText), 8_000),
        promptId,
        callId,
      );
      if (Number(updated.changes ?? 0) === 0) return;
      this.#appendEvent(promptId, 'action.result', {
        at,
        seq: input.seq ?? null,
        callId,
        status: failed ? 'error' : 'ok',
        error: errorText === null ? null : clip(redactSecrets(errorText), 2_000),
        resultHash: sha256(resultText),
      }, at);
    });
  }

  finalizePrompt(promptId, input = {}) {
    if (promptId === null || promptId === undefined) return null;
    if (this.isSealed(promptId)) return this.#promptRow(promptId);
    const at = toMs(input.at);
    const status = input.status ?? 'completed';
    const now = Date.now();
    return this.#tx(() => {
      const row = this.#promptRow(promptId);
      if (row === undefined) return null;
      if (row.sealed === 1) return row;
      const latency = row.created_at > 0 ? Math.max(0, at - row.created_at) : null;
      const errorText = input.error === undefined || input.error === null
        ? null
        : typeof input.error === 'string'
          ? input.error
          : canonicalJson(input.error);
      this.#db.prepare(`
        UPDATE prompts SET
          status = ?, finish_reason = ?, error_text = ?, latency_ms = ?,
          assistant_text = COALESCE(?, assistant_text),
          finalized_at = ?
        WHERE id = ? AND sealed = 0
      `).run(
        status,
        input.finishReason ?? null,
        errorText === null ? null : clip(errorText, 4_000),
        latency,
        typeof input.assistantText === 'string' && input.assistantText !== '' ? input.assistantText : null,
        at,
        promptId,
      );
      const updated = this.#promptRow(promptId);
      const rowHash = hashSnapshot({ ...updated, sealed: 1 });
      this.#db.prepare('UPDATE prompts SET sealed = 1, row_hash = ? WHERE id = ? AND sealed = 0')
        .run(rowHash, promptId);
      const sealed = this.#promptRow(promptId);
      this.#appendEvent(promptId, 'prompt.sealed', {
        at,
        rowHash,
        snapshot: snapshotOfPrompt(sealed),
      }, now);
      return sealed;
    });
  }

  finalizeOpenForSession(sessionId, input = {}) {
    const row = this.#db.prepare(
      'SELECT id FROM prompts WHERE session_id = ? AND sealed = 0 ORDER BY created_at DESC',
    ).all(sessionId);
    for (const item of row) this.finalizePrompt(item.id, input);
  }

  /* ---------------------------------------------------------------------- */
  /* Evaluations and annotations                                             */
  /* ---------------------------------------------------------------------- */

  evaluateRule(promptId, rubric = this.rubric()) {
    const row = this.#promptRow(promptId);
    if (row === undefined) return null;
    const dimensions = {};
    const status = row.status;
    dimensions.outcome = status === 'completed' ? 5 : status === 'interrupted' ? 3 : status === 'aborted' ? 2 : 1;
    const answer = typeof row.assistant_text === 'string' ? row.assistant_text.trim() : '';
    const errors = Number(row.tool_errors ?? 0);
    const calls = Number(row.tool_calls ?? 0);
    if (answer.length >= 120 && errors === 0) dimensions.quality = 5;
    else if (answer.length >= 30 && errors <= 1) dimensions.quality = 4;
    else if (answer.length > 0) dimensions.quality = 3;
    else dimensions.quality = status === 'completed' ? 2 : 1;
    if (calls === 0) dimensions.tool = 4;
    else if (errors === 0) dimensions.tool = 5;
    else if (errors / calls < 0.2) dimensions.tool = 4;
    else if (errors / calls < 0.5) dimensions.tool = 3;
    else dimensions.tool = 1;
    const tokens = Number(row.total_tokens ?? 0);
    dimensions.tokens = tokens === 0
      ? 3
      : tokens <= 8_000
        ? 5
        : tokens <= 24_000
          ? 4
          : tokens <= 64_000
            ? 3
            : tokens <= 160_000
              ? 2
              : 1;
    const latency = Number(row.latency_ms ?? 0);
    dimensions.speed = latency === 0
      ? 3
      : latency <= 15_000
        ? 5
        : latency <= 45_000
          ? 4
          : latency <= 120_000
            ? 3
            : latency <= 300_000
              ? 2
              : 1;
    const totalWeight = rubric.dimensions.reduce((sum, dimension) => sum + (Number(dimension.weight) || 0), 0) || 1;
    let total = 0;
    for (const dimension of rubric.dimensions) {
      total += (Number(dimensions[dimension.id] ?? 3) || 3) * (Number(dimension.weight) || 0);
    }
    total = Number((total / totalWeight).toFixed(2));
    const notes = [
      `status=${status}`,
      `tools=${calls}/${errors} errors`,
      `tokens=${tokens}`,
      `latency=${latency}ms`,
    ].join('; ');
    const result = this.#tx(() => {
      const event = this.#appendEvent(promptId, 'evaluation.auto', {
        source: 'auto_rule',
        total,
        dimensions,
        notes,
        rubricVersion: rubric.version,
      });
      const inserted = this.#db.prepare(`
        INSERT INTO prompt_evaluations
          (prompt_id, source, evaluator, model, total, dimensions_json, notes, rubric_version, created_at, event_id)
        VALUES (?, 'auto_rule', 'local-rubric', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        promptId,
        row.model ?? null,
        total,
        JSON.stringify(dimensions),
        notes,
        rubric.version,
        Date.now(),
        event.id,
      );
      return Number(inserted.lastInsertRowid);
    });
    return { id: result, total, dimensions, notes, rubricVersion: rubric.version };
  }

  evaluateModel(promptId, evaluation) {
    const rubric = this.rubric();
    const dimensions = {};
    for (const dimension of rubric.dimensions) {
      const value = Number(evaluation?.dimensions?.[dimension.id]);
      dimensions[dimension.id] = Number.isFinite(value) ? Math.min(5, Math.max(1, value)) : 3;
    }
    const totalWeight = rubric.dimensions.reduce((sum, dimension) => sum + (Number(dimension.weight) || 0), 0) || 1;
    let total = 0;
    for (const dimension of rubric.dimensions) {
      total += dimensions[dimension.id] * (Number(dimension.weight) || 0);
    }
    total = Number((total / totalWeight).toFixed(2));
    return this.#tx(() => {
      const event = this.#appendEvent(promptId, 'evaluation.model', {
        source: 'auto_model',
        total,
        dimensions,
        notes: evaluation?.notes ?? '',
        model: evaluation?.model ?? null,
        rubricVersion: rubric.version,
      });
      this.#db.prepare(`
        INSERT INTO prompt_evaluations
          (prompt_id, source, evaluator, model, total, dimensions_json, notes, rubric_version, created_at, event_id)
        VALUES (?, 'auto_model', 'model-judge', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        promptId,
        evaluation?.model ?? null,
        total,
        JSON.stringify(dimensions),
        typeof evaluation?.notes === 'string' ? evaluation.notes.slice(0, 2_000) : '',
        rubric.version,
        Date.now(),
        event.id,
      );
      return { total, dimensions };
    });
  }

  addAnnotation(promptId, kind, value, at = Date.now()) {
    const allowed = new Set(['rating', 'favorite', 'tags', 'note']);
    if (!allowed.has(kind)) throw new Error(`unknown annotation kind "${kind}"`);
    const row = this.#promptRow(promptId);
    if (row === undefined) throw new Error('prompt not found');
    return this.#tx(() => {
      const event = this.#appendEvent(promptId, `annotation.${kind}`, { kind, value, at });
      const inserted = this.#db.prepare(`
        INSERT INTO prompt_annotations (prompt_id, kind, value_json, created_at, event_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(promptId, kind, JSON.stringify(value), at, event.id);
      return Number(inserted.lastInsertRowid);
    });
  }

  ratePrompt(promptId, stars, note = '') {
    const value = Number(stars);
    if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error('stars must be 1-5');
    if (this.#promptRow(promptId) === undefined) throw new Error('prompt not found');
    return this.#tx(() => {
      const event = this.#appendEvent(promptId, 'annotation.rating', {
        stars: Math.round(value),
        note: typeof note === 'string' ? note.slice(0, 4_000) : '',
      });
      this.#db.prepare(`
        INSERT INTO prompt_annotations (prompt_id, kind, value_json, created_at, event_id)
        VALUES (?, 'rating', ?, ?, ?)
      `).run(promptId, JSON.stringify({ stars: Math.round(value), note: typeof note === 'string' ? note.slice(0, 4_000) : '' }), Date.now(), event.id);
      return { stars: Math.round(value), note };
    });
  }

  setFavorite(promptId, favorite) {
    return this.addAnnotation(promptId, 'favorite', { value: favorite === true });
  }

  setTags(promptId, tags) {
    const normalized = uniqueStrings(Array.isArray(tags) ? tags.map((tag) => String(tag).trim().slice(0, 24)) : []);
    return this.addAnnotation(promptId, 'tags', { tags: normalized });
  }

  setNote(promptId, note) {
    return this.addAnnotation(promptId, 'note', { note: String(note ?? '').slice(0, 4_000) });
  }

  /* ---------------------------------------------------------------------- */
  /* Ingestion for external platforms                                        */
  /* ---------------------------------------------------------------------- */

  ingest(input) {
    const now = Date.now();
    const promptText = String(input.prompt ?? input.text ?? '').trim();
    if (promptText === '') throw new Error('prompt is required');
    const completedAt = toMs(input.completedAt ?? input.at ?? now);
    const startedAt = toMs(input.startedAt ?? completedAt);
    const platform = typeof input.platform === 'string' && input.platform !== '' ? input.platform : 'generic';
    const sourceKey = typeof input.sourceKey === 'string' && input.sourceKey !== ''
      ? `external:${platform}:${input.sourceKey}`
      : `external:${platform}:${sha256(`${promptText}\n${startedAt}`)}`;
    const duplicate = this.#db.prepare('SELECT id FROM prompts WHERE source_key = ?').get(sourceKey);
    if (duplicate !== undefined) return { ...this.getPrompt(duplicate.id), duplicate: true };

    const usage = normalizeUsage(input.usage ?? input);
    const tools = Array.isArray(input.tools) ? input.tools : [];
    const promptHash = sha256(promptText);
    const promptId = randomUUID();
    this.#tx(() => {
      this.#db.prepare(`
        INSERT INTO prompts (
          id, source_key, platform, session_id, cwd, created_at, captured_at,
          prompt_text, prompt_hash, prompt_chars, input_tokens, output_tokens,
          total_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
          provider, model, models_json, status, assistant_text, meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)
      `).run(
        promptId,
        sourceKey,
        platform,
        input.sessionId ?? null,
        input.cwd ?? null,
        startedAt,
        now,
        promptText,
        promptHash,
        promptText.length,
        usage.inputTokens,
        usage.outputTokens,
        usage.totalTokens,
        usage.cacheReadTokens,
        usage.cacheWriteTokens,
        usage.reasoningTokens,
        input.provider ?? null,
        input.model ?? null,
        JSON.stringify(uniqueStrings([input.model ?? ''])),
        typeof input.response === 'string' ? input.response : null,
        JSON.stringify({ ...(input.metadata ?? {}), adapter: 'external' }),
      );
      this.#db.prepare(`
        INSERT INTO prompt_submissions (id, prompt_id, source_key, seq, created_at, text, chars, hash)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
      `).run(randomUUID(), promptId, `submission:${sourceKey}`, startedAt, promptText, promptText.length, promptHash);
      this.#appendEvent(promptId, 'prompt.created', {
        platform,
        at: startedAt,
        textHash: promptHash,
        chars: promptText.length,
        adapter: 'external',
      }, now);
      for (const tool of tools) {
        const name = String(tool.name ?? 'unknown');
        const category = tool.category ?? classifyTool(name);
        const rawArguments = typeof tool.arguments === 'string' ? tool.arguments : canonicalJson(tool.arguments ?? null);
        this.#db.prepare(`
          INSERT INTO tool_invocations
            (prompt_id, call_id, name, category, args_excerpt, args_hash, started_at, ended_at, status, error_text, result_excerpt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          promptId,
          tool.callId ?? randomUUID(),
          name,
          category,
          clip(rawArguments, 20_000),
          sha256(rawArguments),
          startedAt,
          completedAt,
          tool.status === 'error' || tool.error ? 'error' : 'ok',
          tool.error ? clip(String(tool.error), 2_000) : null,
          clip(typeof tool.result === 'string' ? tool.result : canonicalJson(tool.result ?? null), 20_000),
        );
      }
    });

    const toolNames = uniqueStrings(tools.map((tool) => tool.category === 'tool' ? tool.name : ''));
    const skillNames = uniqueStrings(tools.flatMap((tool) => {
      const category = tool.category ?? classifyTool(tool.name);
      if (category !== 'skill') return [];
      return [tool.skill ?? tool.name];
    }));
    const mcpNames = uniqueStrings(tools.map((tool) => (tool.category ?? classifyTool(tool.name)) === 'mcp' ? tool.name : ''));
    const toolErrors = tools.filter((tool) => tool.status === 'error' || tool.error).length;
    this.#tx(() => {
      this.#db.prepare(`
        UPDATE prompts SET
          tool_calls = ?, tool_errors = ?, tools_json = ?, skills_json = ?, mcp_json = ?,
          status = ?, finish_reason = ?, error_text = ?, latency_ms = ?,
          assistant_text = COALESCE(?, assistant_text), finalized_at = ?
        WHERE id = ? AND sealed = 0
      `).run(
        tools.length,
        toolErrors,
        JSON.stringify(toolNames),
        JSON.stringify(skillNames),
        JSON.stringify(mcpNames),
        input.status === 'failed' ? 'failed' : input.status === 'aborted' ? 'aborted' : 'completed',
        input.finishReason ?? null,
        input.error ? clip(String(input.error), 4_000) : null,
        Math.max(0, completedAt - startedAt),
        typeof input.response === 'string' ? input.response : null,
        completedAt,
        promptId,
      );
      const row = this.#promptRow(promptId);
      const rowHash = hashSnapshot({ ...row, sealed: 1 });
      this.#db.prepare('UPDATE prompts SET sealed = 1, row_hash = ? WHERE id = ? AND sealed = 0')
        .run(rowHash, promptId);
      const sealed = this.#promptRow(promptId);
      this.#appendEvent(promptId, 'prompt.sealed', {
        at: completedAt,
        rowHash,
        snapshot: snapshotOfPrompt(sealed),
        adapter: 'external',
      }, completedAt);
    });

    if (this.settings().auto_eval === '1') this.evaluateRule(promptId);
    if (input.rating !== undefined) {
      const stars = Number(input.rating?.stars ?? input.rating);
      if (Number.isFinite(stars) && stars >= 1 && stars <= 5) {
        this.ratePrompt(promptId, stars, input.rating?.note ?? input.note ?? '');
      }
    }
    if (Array.isArray(input.tags) && input.tags.length > 0) this.setTags(promptId, input.tags);
    if (input.favorite === true) this.setFavorite(promptId, true);
    return this.getPrompt(promptId);
  }

  /* ---------------------------------------------------------------------- */
  /* Read models                                                             */
  /* ---------------------------------------------------------------------- */

  #latestAnnotation(promptId, kind) {
    const row = this.#db.prepare(`
      SELECT value_json FROM prompt_annotations
      WHERE prompt_id = ? AND kind = ? ORDER BY id DESC LIMIT 1
    `).get(promptId, kind);
    return row === undefined ? null : parseJson(row.value_json, null);
  }

  #mapPrompt(row, { detail = false } = {}) {
    if (row === undefined) return null;
    const rating = this.#latestAnnotation(row.id, 'rating');
    const favorite = this.#latestAnnotation(row.id, 'favorite');
    const tags = this.#latestAnnotation(row.id, 'tags');
    const note = this.#latestAnnotation(row.id, 'note');
    const auto = this.#db.prepare(`
      SELECT id, source, evaluator, model, total, dimensions_json, notes, rubric_version, created_at
      FROM prompt_evaluations WHERE prompt_id = ? ORDER BY id DESC LIMIT 1
    `).get(row.id);
    const item = {
      id: row.id,
      platform: row.platform,
      sessionId: row.session_id,
      cwd: row.cwd,
      turn: row.turn,
      sourceSeq: row.source_seq,
      createdAt: row.created_at,
      capturedAt: row.captured_at,
      finalizedAt: row.finalized_at,
      prompt: row.prompt_text,
      promptHash: row.prompt_hash,
      chars: row.prompt_chars,
      provider: row.provider,
      model: row.model,
      models: parseJson(row.models_json, []),
      status: row.status,
      finishReason: row.finish_reason,
      error: row.error_text,
      response: row.assistant_text,
      latencyMs: row.latency_ms,
      tokens: {
        input: row.input_tokens,
        output: row.output_tokens,
        total: row.total_tokens,
        cacheRead: row.cache_read_tokens,
        cacheWrite: row.cache_write_tokens,
        reasoning: row.reasoning_tokens,
      },
      toolCalls: row.tool_calls,
      toolErrors: row.tool_errors,
      tools: parseJson(row.tools_json, []),
      skills: parseJson(row.skills_json, []),
      mcp: parseJson(row.mcp_json, []),
      sealed: row.sealed === 1,
      rowHash: row.row_hash,
      meta: parseJson(row.meta_json, {}),
      rating: rating && Number.isFinite(Number(rating.stars))
        ? { stars: Number(rating.stars), note: typeof rating.note === 'string' ? rating.note : '' }
        : null,
      favorite: favorite?.value === true,
      tags: Array.isArray(tags?.tags) ? tags.tags : [],
      note: typeof note?.note === 'string' ? note.note : '',
      auto: auto === undefined
        ? null
        : {
          id: auto.id,
          source: auto.source,
          evaluator: auto.evaluator,
          model: auto.model,
          total: auto.total,
          dimensions: parseJson(auto.dimensions_json, {}),
          notes: auto.notes,
          rubricVersion: auto.rubric_version,
          createdAt: auto.created_at,
        },
    };
    if (!detail) {
      item.promptPreview = clip(item.prompt.replaceAll('\n', ' '), 240);
      item.responsePreview = clip((item.response ?? '').replaceAll('\n', ' '), 180);
      delete item.prompt;
      delete item.response;
      delete item.meta;
    }
    return item;
  }

  #orderBy(sort) {
    if (sort === 'oldest') return 'p.created_at ASC';
    if (sort === 'rating') {
      return `(SELECT CAST(json_extract(a.value_json, '$.stars') AS INTEGER) FROM prompt_annotations a WHERE a.prompt_id = p.id AND a.kind = 'rating' ORDER BY a.id DESC LIMIT 1) DESC NULLS LAST, p.created_at DESC`;
    }
    if (sort === 'tokens') return 'p.total_tokens DESC';
    if (sort === 'auto') {
      return `(SELECT total FROM prompt_evaluations e WHERE e.prompt_id = p.id ORDER BY e.id DESC LIMIT 1) DESC NULLS LAST, p.created_at DESC`;
    }
    return 'p.created_at DESC';
  }

  listPrompts(input = {}) {
    const filters = resolveFilters(input);
    const where = whereClause(filters);
    const totalRow = this.#db.prepare(`SELECT COUNT(*) AS n FROM prompts p WHERE ${where.sql}`).get(...where.params);
    const rows = this.#db.prepare(`
      SELECT p.* FROM prompts p
      WHERE ${where.sql}
      ORDER BY ${this.#orderBy(filters.sort)}
      LIMIT ? OFFSET ?
    `).all(...where.params, filters.limit, filters.offset);
    return {
      items: rows.map((row) => this.#mapPrompt(row)),
      total: totalRow?.n ?? 0,
      limit: filters.limit,
      offset: filters.offset,
      filters,
    };
  }

  getPrompt(id) {
    const row = this.#promptRow(id);
    if (row === undefined) return null;
    const item = this.#mapPrompt(row, { detail: true });
    item.submissions = this.#db.prepare(
      'SELECT id, source_key, seq, created_at, text, chars, hash FROM prompt_submissions WHERE prompt_id = ? ORDER BY created_at ASC, rowid ASC',
    ).all(id).map((submission) => ({
      id: submission.id,
      sourceKey: submission.source_key,
      seq: submission.seq,
      createdAt: submission.created_at,
      text: submission.text,
      chars: submission.chars,
      hash: submission.hash,
    }));
    item.toolInvocations = this.#db.prepare(`
      SELECT id, call_id, name, category, args_excerpt, args_hash, started_at, ended_at,
             status, error_text, result_excerpt, seq
      FROM tool_invocations WHERE prompt_id = ? ORDER BY id ASC
    `).all(id).map((tool) => ({
      id: tool.id,
      callId: tool.call_id,
      name: tool.name,
      category: tool.category,
      arguments: tool.args_excerpt,
      argsHash: tool.args_hash,
      startedAt: tool.started_at,
      endedAt: tool.ended_at,
      status: tool.status,
      error: tool.error_text,
      result: tool.result_excerpt,
      seq: tool.seq,
    }));
    item.actions = this.#db.prepare(
      "SELECT id, call_id, parent_call_id, root_call_id, name, category, kind, "
      + "title_zh, title_en, targets_json, detail_json, args_excerpt, args_hash, "
      + "result_excerpt, status, error_text, started_at, ended_at, seq, hidden, meta_json "
      + "FROM action_events WHERE prompt_id = ? ORDER BY COALESCE(seq, 0) ASC, id ASC"
    ).all(id).map((action) => ({
      id: action.id,
      callId: action.call_id,
      parentCallId: action.parent_call_id,
      rootCallId: action.root_call_id,
      name: action.name,
      category: action.category,
      kind: action.kind,
      titleZh: action.title_zh,
      titleEn: action.title_en,
      targets: parseJson(action.targets_json, []),
      detail: parseJson(action.detail_json, {}),
      arguments: action.args_excerpt,
      argsHash: action.args_hash,
      result: action.result_excerpt,
      status: action.status,
      error: action.error_text,
      startedAt: action.started_at,
      endedAt: action.ended_at,
      seq: action.seq,
      hidden: action.hidden === 1,
      temporary: Array.isArray(parseJson(action.targets_json, []))
        && parseJson(action.targets_json, []).length > 0
        && parseJson(action.targets_json, []).every((target) => target?.temporary === true),
      meta: parseJson(action.meta_json, {}),
    })).filter((action) => action.hidden !== true && action.temporary !== true);
    item.actionSummary = summarizeActions(item.actions);
    item.files = aggregateFiles(item.actions);

    item.evaluations = this.#db.prepare(`
      SELECT id, source, evaluator, model, total, dimensions_json, notes, rubric_version, created_at
      FROM prompt_evaluations WHERE prompt_id = ? ORDER BY id DESC
    `).all(id).map((evaluation) => ({
      id: evaluation.id,
      source: evaluation.source,
      evaluator: evaluation.evaluator,
      model: evaluation.model,
      total: evaluation.total,
      dimensions: parseJson(evaluation.dimensions_json, {}),
      notes: evaluation.notes,
      rubricVersion: evaluation.rubric_version,
      createdAt: evaluation.created_at,
    }));
    item.events = this.#db.prepare(`
      SELECT id, kind, payload_json, created_at, prev_hash, hash
      FROM prompt_events WHERE prompt_id = ? ORDER BY id ASC
    `).all(id).map((event) => ({
      id: event.id,
      kind: event.kind,
      payload: parseJson(event.payload_json, {}),
      createdAt: event.created_at,
      prevHash: event.prev_hash,
      hash: event.hash,
    }));
    return item;
  }

  promptIdForSourceKey(sourceKey) {
    if (typeof sourceKey !== 'string' || sourceKey === '') return null;
    const row = this.#db.prepare('SELECT id FROM prompts WHERE source_key = ?').get(sourceKey);
    return row?.id ?? null;
  }

  promptIdForSessionSeq(sessionId, seq) {
    if (typeof sessionId !== 'string' || !Number.isFinite(Number(seq))) return null;
    const row = this.#db.prepare('SELECT id FROM prompts WHERE session_id = ? AND source_seq = ? ORDER BY created_at ASC LIMIT 1').get(sessionId, Math.trunc(Number(seq)));
    return row?.id ?? null;
  }

  /**
   * Import completed actions for a prompt, including sealed historical prompts.
   * This is the backfill path: it never updates the prompt row, is idempotent by
   * callId, and appends an action.backfill event per inserted action.
   */
  importActions(promptId, items = []) {
    const prompt = this.#promptRow(promptId);
    if (prompt === undefined || !Array.isArray(items)) return { inserted: 0, skipped: 0 };
    const cwd = prompt.cwd ?? '';
    const result = { inserted: 0, skipped: 0 };
    this.#tx(() => {
      for (const item of items) {
        if (item === null || typeof item !== 'object') continue;
        const name = String(item.name ?? 'unknown');
        const rawArguments = typeof item.arguments === 'string'
          ? item.arguments
          : canonicalJson(item.arguments ?? null);
        const callId = typeof item.callId === 'string' && item.callId !== ''
          ? item.callId
          : 'bf:' + sha256(promptId + '\\n' + name + '\\n' + (item.seq ?? '') + '\\n' + (item.startedAt ?? '') + '\\n' + rawArguments);
        const existing = this.#db.prepare('SELECT id FROM action_events WHERE prompt_id = ? AND call_id = ?').get(promptId, callId);
        if (existing !== undefined) {
          result.skipped += 1;
          continue;
        }
        const action = describeAction(name, rawArguments, { cwd });
        const at = toMs(item.startedAt ?? Date.now());
        const ended = item.endedAt === undefined || item.endedAt === null ? null : toMs(item.endedAt);
        const failed = item.status === 'error' || item.isError === true;
        const status = item.status ?? (ended === null ? 'running' : (failed ? 'error' : 'ok'));
        const resultText = item.result === undefined || item.result === null
          ? ''
          : (typeof item.result === 'string' ? item.result : canonicalJson(item.result));
        const errorText = item.error === undefined || item.error === null
          ? null
          : (typeof item.error === 'string' ? item.error : canonicalJson(item.error));
        const hidden = item.hidden === true || action.hidden === true;
        this.#db.prepare(
          "INSERT INTO action_events ("
          + "prompt_id, call_id, parent_call_id, root_call_id, name, category, kind, "
          + "title_zh, title_en, targets_json, detail_json, args_excerpt, args_hash, "
          + "result_excerpt, status, error_text, started_at, ended_at, seq, hidden, meta_json"
          + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          promptId, callId, item.parentCallId ?? null, item.rootCallId ?? null,
          name, action.category, action.kind, action.titleZh, action.titleEn,
          JSON.stringify(action.targets), JSON.stringify(action.detail),
          clip(redactSecrets(rawArguments), 8_000), sha256(rawArguments),
          resultText === '' ? null : clip(redactSecrets(resultText), 8_000),
          status, errorText === null ? null : clip(redactSecrets(errorText), 2_000),
          at, ended, Number.isFinite(item.seq) ? Math.trunc(item.seq) : null,
          hidden ? 1 : 0,
          JSON.stringify({ ...(item.meta ?? {}), transport: 'backfill' }),
        );
        this.#appendEvent(promptId, 'action.backfill', {
          at,
          seq: item.seq ?? null,
          callId,
          name,
          kind: action.kind,
          status,
          targets: action.targets,
        }, at);
        result.inserted += 1;
      }
    });
    return result;
  }

  /**
   * Resolve a UI-visible file target back to an action for this prompt.
   * Only exact targets already captured in action_events are readable/openable;
   * the panel can never ask the Host to serve an arbitrary local path.
   */
  resolveActionTarget(promptId, filePath) {
    const prompt = this.#promptRow(promptId);
    if (prompt === undefined || typeof filePath !== 'string' || filePath === '') return null;
    const wanted = isAbsolute(filePath) ? filePath : resolve(prompt.cwd ?? '', filePath);
    const rows = this.#db.prepare(
      "SELECT call_id, kind, title_zh, targets_json FROM action_events WHERE prompt_id = ? AND hidden = 0 ORDER BY id ASC"
    ).all(promptId);
    for (const row of rows) {
      for (const target of parseJson(row.targets_json, [])) {
        if (target === null || typeof target.path !== 'string') continue;
        const absolute = isAbsolute(target.path) ? target.path : resolve(prompt.cwd ?? '', target.path);
        if (absolute === wanted) {
          return {
            path: absolute,
            label: target.label || basename(absolute),
            action: target.action ?? row.kind,
            cwd: prompt.cwd ?? '',
            callId: row.call_id,
            title: row.title_zh,
          };
        }
      }
    }
    return null;
  }

  sessions(limit = 20) {
    const rows = this.#db.prepare(
      "SELECT p.session_id, COUNT(DISTINCT p.id) AS prompts, MIN(p.created_at) AS first_at, MAX(p.created_at) AS last_at "
      + "FROM prompts p WHERE p.session_id IS NOT NULL AND p.session_id <> '' "
      + "GROUP BY p.session_id ORDER BY last_at DESC LIMIT ?"
    ).all(Math.min(100, Math.max(1, Number(limit) || 20)));
    return rows.map((row) => {
      const latest = this.#db.prepare(
        "SELECT turn, prompt_text, model, meta_json, created_at FROM prompts WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
      ).get(row.session_id);
      const count = this.#db.prepare(
        "SELECT COUNT(*) AS n FROM action_events a JOIN prompts p ON p.id = a.prompt_id WHERE p.session_id = ? AND a.hidden = 0"
      ).get(row.session_id);
      const meta = parseJson(latest?.meta_json, {});
      return {
        sessionId: row.session_id,
        promptCount: Number(row.prompts) || 0,
        actionCount: Number(count?.n) || 0,
        firstAt: row.first_at,
        lastAt: row.last_at,
        title: typeof meta.title === 'string' && meta.title !== '' ? meta.title : null,
        lastPrompt: clip(String(latest?.prompt_text ?? '').replaceAll('\\n', ' '), 120),
        model: latest?.model ?? null,
      };
    });
  }

  sessionActions(sessionId, limit = 2000) {
    if (typeof sessionId !== 'string' || sessionId === '') return null;
    const promptRows = this.#db.prepare(
      "SELECT id, turn, prompt_text, assistant_text, created_at, model, status, meta_json FROM prompts WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId);
    if (promptRows.length === 0) return null;
    const rows = this.#db.prepare(
      "SELECT a.*, p.turn, p.created_at AS prompt_created_at FROM action_events a "
      + "JOIN prompts p ON p.id = a.prompt_id "
      + "WHERE p.session_id = ? AND a.hidden = 0 "
      + "ORDER BY p.created_at ASC, COALESCE(a.seq, 0) ASC, a.id ASC LIMIT ?"
    ).all(sessionId, Math.min(5000, Math.max(1, Number(limit) || 500)));
    const actionsByPrompt = new Map();
    for (const action of rows) {
      const targets = parseJson(action.targets_json, []);
      const temporary = targets.length > 0 && targets.every((target) => target?.temporary === true);
      if (temporary) continue;
      const item = {
        id: action.id,
        callId: action.call_id,
        parentCallId: action.parent_call_id,
        rootCallId: action.root_call_id,
        name: action.name,
        category: action.category,
        kind: action.kind,
        titleZh: action.title_zh,
        titleEn: action.title_en,
        targets,
        detail: parseJson(action.detail_json, {}),
        arguments: action.args_excerpt,
        argsHash: action.args_hash,
        result: action.result_excerpt,
        status: action.status,
        error: action.error_text,
        startedAt: action.started_at,
        endedAt: action.ended_at,
        seq: action.seq,
        meta: parseJson(action.meta_json, {}),
      };
      const list = actionsByPrompt.get(action.prompt_id) ?? [];
      list.push(item);
      actionsByPrompt.set(action.prompt_id, list);
    }
    const allActions = [];
    const turns = promptRows.map((prompt) => {
      const actions = actionsByPrompt.get(prompt.id) ?? [];
      allActions.push(...actions);
      const meta = parseJson(prompt.meta_json, {});
      return {
        promptId: prompt.id,
        turn: prompt.turn,
        prompt: String(prompt.prompt_text ?? '').replaceAll('\\n', ' ').slice(0, 240),
        response: String(prompt.assistant_text ?? ''),
        title: typeof meta.title === 'string' && meta.title !== '' ? meta.title : null,
        createdAt: prompt.created_at,
        model: prompt.model,
        status: prompt.status,
        actions,
        summary: summarizeActions(actions),
        files: aggregateFiles(actions),
      };
    });
    return {
      sessionId,
      promptCount: promptRows.length,
      firstAt: promptRows[0]?.created_at ?? null,
      lastAt: promptRows[promptRows.length - 1]?.created_at ?? null,
      summary: summarizeActions(allActions),
      files: aggregateFiles(allActions),
      turns: turns.filter((turn) => turn.actions.length > 0),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Aggregations                                                            */
  /* ---------------------------------------------------------------------- */

  #filtersAndWhere(input) {
    const filters = resolveFilters(input);
    return { filters, where: whereClause(filters) };
  }

  overview(input = {}) {
    const { filters, where } = this.#filtersAndWhere({ ...input, limit: 8 });
    const kpis = this.#db.prepare(`
      SELECT
        COUNT(*) AS prompts,
        COALESCE(SUM(p.total_tokens), 0) AS tokens,
        COALESCE(SUM(p.tool_calls), 0) AS toolCalls,
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
        COALESCE(AVG((
          SELECT CAST(json_extract(a.value_json, '$.stars') AS INTEGER)
          FROM prompt_annotations a
          WHERE a.prompt_id = p.id AND a.kind = 'rating'
          ORDER BY a.id DESC LIMIT 1
        )), 0) AS avgRating,
        COALESCE(AVG((
          SELECT e.total FROM prompt_evaluations e
          WHERE e.prompt_id = p.id ORDER BY e.id DESC LIMIT 1
        )), 0) AS avgAuto
      FROM prompts p WHERE ${where.sql}
    `).get(...where.params);

    const days = Math.min(90, Math.max(7, Number(input.days) || 14));
    const trendRows = this.#db.prepare(`
      SELECT date(p.created_at / 1000, 'unixepoch', 'localtime') AS day,
             COUNT(*) AS count,
             COALESCE(SUM(p.total_tokens), 0) AS tokens,
             COALESCE(AVG((
               SELECT CAST(json_extract(a.value_json, '$.stars') AS INTEGER)
               FROM prompt_annotations a
               WHERE a.prompt_id = p.id AND a.kind = 'rating'
               ORDER BY a.id DESC LIMIT 1
             )), 0) AS rating
      FROM prompts p
      WHERE ${where.sql} AND p.created_at >= ?
      GROUP BY day ORDER BY day ASC
    `).all(...where.params, Date.now() - days * DAY);
    const byDay = new Map(trendRows.map((row) => [row.day, row]));
    const trend = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.now() - offset * DAY);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const row = byDay.get(key);
      trend.push({
        day: key,
        count: row?.count ?? 0,
        tokens: row?.tokens ?? 0,
        rating: row?.rating ?? 0,
      });
    }

    const models = this.#db.prepare(`
      SELECT p.model AS model, COUNT(*) AS count,
             COALESCE(SUM(p.total_tokens), 0) AS tokens,
             COALESCE(AVG((
               SELECT CAST(json_extract(a.value_json, '$.stars') AS INTEGER)
               FROM prompt_annotations a
               WHERE a.prompt_id = p.id AND a.kind = 'rating'
               ORDER BY a.id DESC LIMIT 1
             )), 0) AS rating,
             COALESCE(AVG((
               SELECT e.total FROM prompt_evaluations e
               WHERE e.prompt_id = p.id ORDER BY e.id DESC LIMIT 1
             )), 0) AS auto
      FROM prompts p
      WHERE ${where.sql} AND p.model IS NOT NULL AND p.model != ''
      GROUP BY p.model ORDER BY count DESC LIMIT 6
    `).all(...where.params);

    const tools = this.#db.prepare(`
      SELECT t.name AS name, COUNT(*) AS calls,
             SUM(CASE WHEN t.status = 'error' THEN 1 ELSE 0 END) AS errors,
             COUNT(DISTINCT p.id) AS prompts
      FROM tool_invocations t JOIN prompts p ON p.id = t.prompt_id
      WHERE ${where.sql}
      GROUP BY t.name ORDER BY calls DESC LIMIT 8
    `).all(...where.params);

    const recent = this.listPrompts({ ...input, limit: 7, offset: 0 }).items;

    const insights = [];
    const bestModel = [...models].filter((model) => model.count >= 2 && model.rating > 0)
      .sort((a, b) => b.rating - a.rating)[0];
    if (bestModel) {
      insights.push({ code: 'bestModel', tone: 'positive', data: { model: bestModel.model, rating: Number(bestModel.rating.toFixed(2)), count: bestModel.count } });
    }
    const worstTool = [...tools].filter((tool) => tool.calls >= 2 && tool.errors / tool.calls > 0.15)
      .sort((a, b) => b.errors / b.calls - a.errors / a.calls)[0];
    if (worstTool) {
      insights.push({ code: 'toolErrors', tone: 'warning', data: { tool: worstTool.name, errors: worstTool.errors, calls: worstTool.calls } });
    }
    const lowRating = recent.filter((prompt) => prompt.rating !== null && prompt.rating.stars <= 2).length;
    if (lowRating > 0) {
      insights.push({ code: 'lowRated', tone: 'warning', data: { count: lowRating } });
    }
    const highRated = recent.filter((prompt) => prompt.rating !== null && prompt.rating.stars >= 4).length;
    if (highRated > 0) {
      insights.push({ code: 'highRated', tone: 'positive', data: { count: highRated } });
    }
    if (kpis.prompts === 0) insights.push({ code: 'empty', tone: 'neutral', data: {} });
    if (kpis.tokens > 0) {
      insights.push({ code: 'avgTokens', tone: 'neutral', data: { avg: Math.round(kpis.tokens / Math.max(1, kpis.prompts)) } });
    }

    return {
      filters,
      kpis: {
        prompts: kpis.prompts,
        tokens: kpis.tokens,
        toolCalls: kpis.toolCalls,
        completed: kpis.completed,
        successRate: kpis.prompts === 0 ? 0 : Number(((kpis.completed / kpis.prompts) * 100).toFixed(1)),
        avgRating: Number((kpis.avgRating ?? 0).toFixed(2)),
        avgAuto: Number((kpis.avgAuto ?? 0).toFixed(2)),
        rated: this.#db.prepare(`
          SELECT COUNT(*) AS n FROM (
            SELECT p.id FROM prompts p WHERE ${where.sql}
            AND EXISTS (SELECT 1 FROM prompt_annotations a WHERE a.prompt_id = p.id AND a.kind = 'rating')
          )
        `).get(...where.params).n,
      },
      trend,
      models,
      tools,
      recent,
      insights,
    };
  }

  analytics(input = {}) {
    const { filters, where } = this.#filtersAndWhere({ ...input, limit: 1 });
    const ratingOf = `(
      SELECT CAST(json_extract(a.value_json, '$.stars') AS INTEGER)
      FROM prompt_annotations a WHERE a.prompt_id = p.id AND a.kind = 'rating'
      ORDER BY a.id DESC LIMIT 1
    )`;
    const autoOf = `(
      SELECT e.total FROM prompt_evaluations e WHERE e.prompt_id = p.id ORDER BY e.id DESC LIMIT 1
    )`;
    const models = this.#db.prepare(`
      SELECT p.model AS name, p.provider AS provider, COUNT(*) AS count,
             COALESCE(SUM(p.total_tokens), 0) AS tokens,
             COALESCE(AVG(p.latency_ms), 0) AS latency,
             COALESCE(AVG(${ratingOf}), 0) AS rating,
             COALESCE(AVG(${autoOf}), 0) AS auto,
             COALESCE(AVG(CASE WHEN p.status = 'completed' THEN 1.0 ELSE 0 END), 0) AS success
      FROM prompts p WHERE ${where.sql} AND p.model IS NOT NULL AND p.model != ''
      GROUP BY p.model, p.provider ORDER BY count DESC
    `).all(...where.params);

    const toolRows = this.#db.prepare(`
      SELECT t.id AS invocation_id, t.name AS name, t.category AS category,
             t.status AS tool_status, p.id AS prompt_id, p.model AS model,
             p.status AS prompt_status, p.total_tokens AS tokens,
             ${ratingOf} AS rating, ${autoOf} AS auto
      FROM tool_invocations t JOIN prompts p ON p.id = t.prompt_id
      WHERE ${where.sql}
    `).all(...where.params);

    const toolMap = new Map();
    const comboMap = new Map();
    for (const row of toolRows) {
      const toolKey = `${row.category}\u0000${row.name}`;
      let tool = toolMap.get(toolKey);
      if (tool === undefined) {
        tool = {
          name: row.name,
          category: row.category,
          calls: 0,
          errors: 0,
          promptIds: new Set(),
          ratingSum: 0,
          ratingCount: 0,
          successSum: 0,
          successCount: 0,
        };
        toolMap.set(toolKey, tool);
      }
      tool.calls += 1;
      if (row.tool_status === 'error') tool.errors += 1;
      if (!tool.promptIds.has(row.prompt_id)) {
        tool.promptIds.add(row.prompt_id);
        if (row.rating !== null && row.rating !== undefined) {
          tool.ratingSum += Number(row.rating);
          tool.ratingCount += 1;
        }
        tool.successSum += row.prompt_status === 'completed' ? 1 : 0;
        tool.successCount += 1;
      }

      if (row.model === null || row.model === '') continue;
      const comboKey = `${row.model}\u0000${row.name}`;
      let combo = comboMap.get(comboKey);
      if (combo === undefined) {
        combo = {
          model: row.model,
          tool: row.name,
          promptIds: new Set(),
          ratingSum: 0,
          ratingCount: 0,
          autoSum: 0,
          autoCount: 0,
          successSum: 0,
          successCount: 0,
          tokens: 0,
        };
        comboMap.set(comboKey, combo);
      }
      if (!combo.promptIds.has(row.prompt_id)) {
        combo.promptIds.add(row.prompt_id);
        combo.tokens += Number(row.tokens ?? 0);
        if (row.rating !== null && row.rating !== undefined) {
          combo.ratingSum += Number(row.rating);
          combo.ratingCount += 1;
        }
        if (row.auto !== null && row.auto !== undefined) {
          combo.autoSum += Number(row.auto);
          combo.autoCount += 1;
        }
        combo.successSum += row.prompt_status === 'completed' ? 1 : 0;
        combo.successCount += 1;
      }
    }

    const tools = [...toolMap.values()]
      .map((tool) => ({
        name: tool.name,
        category: tool.category,
        calls: tool.calls,
        errors: tool.errors,
        prompts: tool.promptIds.size,
        rating: tool.ratingCount === 0 ? 0 : Number((tool.ratingSum / tool.ratingCount).toFixed(2)),
        success: tool.successCount === 0 ? 0 : Number((tool.successSum / tool.successCount).toFixed(3)),
      }))
      .sort((left, right) => right.calls - left.calls);

    const platforms = this.#db.prepare(`
      SELECT p.platform AS name, COUNT(*) AS count,
             COALESCE(SUM(p.total_tokens), 0) AS tokens,
             COALESCE(AVG(${ratingOf}), 0) AS rating,
             COALESCE(AVG(CASE WHEN p.status = 'completed' THEN 1.0 ELSE 0 END), 0) AS success
      FROM prompts p WHERE ${where.sql}
      GROUP BY p.platform ORDER BY count DESC
    `).all(...where.params);

    const skills = this.#db.prepare(`
      SELECT value AS name, COUNT(*) AS count,
             COALESCE(AVG(${ratingOf}), 0) AS rating,
             COALESCE(AVG(CASE WHEN p.status = 'completed' THEN 1.0 ELSE 0 END), 0) AS success
      FROM prompts p, json_each(p.skills_json)
      WHERE ${where.sql} GROUP BY value ORDER BY count DESC
    `).all(...where.params);

    const mcp = this.#db.prepare(`
      SELECT value AS name, COUNT(*) AS count,
             COALESCE(AVG(${ratingOf}), 0) AS rating,
             COALESCE(AVG(CASE WHEN p.status = 'completed' THEN 1.0 ELSE 0 END), 0) AS success
      FROM prompts p, json_each(p.mcp_json)
      WHERE ${where.sql} GROUP BY value ORDER BY count DESC
    `).all(...where.params);

    const combos = [...comboMap.values()]
      .map((combo) => ({
        model: combo.model,
        tool: combo.tool,
        count: combo.promptIds.size,
        rating: combo.ratingCount === 0 ? 0 : Number((combo.ratingSum / combo.ratingCount).toFixed(2)),
        auto: combo.autoCount === 0 ? 0 : Number((combo.autoSum / combo.autoCount).toFixed(2)),
        success: combo.successCount === 0 ? 0 : Number((combo.successSum / combo.successCount).toFixed(3)),
        tokens: combo.tokens,
      }))
      .sort((left, right) => (right.rating - left.rating) || (right.count - left.count))
      .slice(0, 20);

    const distributionRows = this.#db.prepare(`
      SELECT CAST(json_extract(a.value_json, '$.stars') AS INTEGER) AS stars, COUNT(*) AS count
      FROM prompt_annotations a JOIN prompts p ON p.id = a.prompt_id
      WHERE a.kind = 'rating' AND ${where.sql}
      GROUP BY stars
    `).all(...where.params);
    const distribution = [1, 2, 3, 4, 5].map((stars) => ({
      stars,
      count: distributionRows.find((row) => row.stars === stars)?.count ?? 0,
    }));

    const autoRows = this.#db.prepare(`
      SELECT ${autoOf} AS auto, ${ratingOf} AS human
      FROM prompts p WHERE ${where.sql} AND ${autoOf} IS NOT NULL AND ${ratingOf} IS NOT NULL
      LIMIT 500
    `).all(...where.params);
    const buckets = new Map();
    for (const row of autoRows) {
      const bucket = Math.min(5, Math.max(1, Math.round(row.auto)));
      const current = buckets.get(bucket) ?? { auto: bucket, count: 0, human: 0 };
      current.count += 1;
      current.human += row.human;
      buckets.set(bucket, current);
    }
    const calibration = [...buckets.values()]
      .sort((a, b) => a.auto - b.auto)
      .map((bucket) => ({ auto: bucket.auto, count: bucket.count, human: Number((bucket.human / bucket.count).toFixed(2)) }));

    return {
      filters,
      models,
      tools,
      platforms,
      skills,
      mcp,
      combos,
      distribution,
      calibration,
      rubric: this.rubric(),
      totals: {
        models: models.length,
        tools: tools.length,
        skills: skills.length,
        mcp: mcp.length,
        rated: distribution.reduce((sum, item) => sum + item.count, 0),
      },
    };
  }

  facets() {
    const models = this.#db.prepare(
      "SELECT model AS value, COUNT(*) AS count FROM prompts WHERE model IS NOT NULL AND model != '' GROUP BY model ORDER BY count DESC",
    ).all();
    const platforms = this.#db.prepare(
      'SELECT platform AS value, COUNT(*) AS count FROM prompts GROUP BY platform ORDER BY count DESC',
    ).all();
    const tools = this.#db.prepare(
      'SELECT name AS value, category, COUNT(*) AS count FROM tool_invocations GROUP BY name, category ORDER BY count DESC',
    ).all();
    const skills = this.#db.prepare(
      'SELECT value, COUNT(*) AS count FROM prompts, json_each(prompts.skills_json) GROUP BY value ORDER BY count DESC',
    ).all();
    const mcp = this.#db.prepare(
      'SELECT value, COUNT(*) AS count FROM prompts, json_each(prompts.mcp_json) GROUP BY value ORDER BY count DESC',
    ).all();
    return { models, platforms, tools, skills, mcp };
  }

  counts() {
    const row = this.#db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM prompts) AS prompts,
        (SELECT COUNT(*) FROM prompt_events) AS events,
        (SELECT COUNT(*) FROM prompt_annotations) AS annotations,
        (SELECT COUNT(*) FROM prompt_evaluations) AS evaluations
    `).get();
    return row;
  }

  integrity() {
    const issues = [];
    const events = this.#db.prepare('SELECT id, prompt_id, kind, payload_json, created_at, prev_hash, hash FROM prompt_events ORDER BY id ASC').all();
    let previous = GENESIS_HASH;
    for (const event of events) {
      const expected = sha256(`${previous}\n${event.kind}\n${event.prompt_id ?? ''}\n${event.created_at}\n${event.payload_json}`);
      if (event.prev_hash !== previous) {
        issues.push({ kind: 'chain-prev', eventId: event.id, expected: previous, actual: event.prev_hash });
      }
      if (event.hash !== expected) {
        issues.push({ kind: 'chain-hash', eventId: event.id, expected, actual: event.hash });
      }
      previous = event.hash;
    }
    const sealedEvents = new Map();
    for (const event of events) {
      if (event.kind === 'prompt.sealed' && event.prompt_id !== null) {
        const payload = parseJson(event.payload_json, {});
        sealedEvents.set(event.prompt_id, payload);
      }
    }
    const sealed = this.#db.prepare('SELECT * FROM prompts WHERE sealed = 1').all();
    for (const row of sealed) {
      const currentHash = hashSnapshot(row);
      if (row.row_hash !== currentHash) {
        issues.push({ kind: 'row-hash', promptId: row.id, expected: row.row_hash, actual: currentHash });
      }
      const sealedEvent = sealedEvents.get(row.id);
      if (sealedEvent === undefined) {
        issues.push({ kind: 'missing-seal-event', promptId: row.id });
      } else if (sealedEvent.rowHash !== row.row_hash) {
        issues.push({ kind: 'seal-row-mismatch', promptId: row.id });
      }
    }
    const fk = this.#db.prepare('PRAGMA foreign_key_check').all();
    for (const row of fk) issues.push({ kind: 'foreign-key', row });
    return {
      ok: issues.length === 0,
      checkedAt: Date.now(),
      checkedEvents: events.length,
      checkedPrompts: sealed.length,
      lastHash: previous,
      dbPath: this.dbPath,
      issues: issues.slice(0, 30),
    };
  }

  exportRows(input = {}) {
    const filters = resolveFilters({ ...input, limit: 10_000, offset: 0 });
    const where = whereClause(filters);
    const rows = this.#db.prepare(`
      SELECT p.*,
        (SELECT CAST(json_extract(a.value_json, '$.stars') AS INTEGER) FROM prompt_annotations a
          WHERE a.prompt_id = p.id AND a.kind = 'rating' ORDER BY a.id DESC LIMIT 1) AS user_rating,
        (SELECT json_extract(a.value_json, '$.note') FROM prompt_annotations a
          WHERE a.prompt_id = p.id AND a.kind = 'rating' ORDER BY a.id DESC LIMIT 1) AS user_note,
        (SELECT total FROM prompt_evaluations e WHERE e.prompt_id = p.id ORDER BY e.id DESC LIMIT 1) AS auto_score,
        (SELECT json_extract(a.value_json, '$.tags') FROM prompt_annotations a
          WHERE a.prompt_id = p.id AND a.kind = 'tags' ORDER BY a.id DESC LIMIT 1) AS user_tags,
        (SELECT json_extract(a.value_json, '$.value') FROM prompt_annotations a
          WHERE a.prompt_id = p.id AND a.kind = 'favorite' ORDER BY a.id DESC LIMIT 1) AS user_favorite
      FROM prompts p WHERE ${where.sql} ORDER BY p.created_at DESC LIMIT ?
    `).all(...where.params, filters.limit);
    return rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      createdAt: new Date(row.created_at).toISOString(),
      sessionId: row.session_id,
      model: row.model,
      provider: row.provider,
      status: row.status,
      prompt: row.prompt_text,
      response: row.assistant_text,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      cacheReadTokens: row.cache_read_tokens,
      reasoningTokens: row.reasoning_tokens,
      latencyMs: row.latency_ms,
      toolCalls: row.tool_calls,
      toolErrors: row.tool_errors,
      tools: parseJson(row.tools_json, []).join('|'),
      skills: parseJson(row.skills_json, []).join('|'),
      mcp: parseJson(row.mcp_json, []).join('|'),
      userRating: row.user_rating,
      userNote: row.user_note,
      userTags: parseJson(row.user_tags, []).join('|'),
      userFavorite: row.user_favorite === 1 ? 'yes' : '',
      autoScore: row.auto_score,
      promptHash: row.prompt_hash,
      rowHash: row.row_hash,
    }));
  }
}

export function openLedger(dbPath = defaultDbPath()) {
  return new Ledger(dbPath);
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

export function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '\uFEFF';
  const columns = Object.keys(rows[0]);
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((column) => escape(row[column])).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

/* -------------------------------------------------------------------------- */
/* Auth helper for the local HTTP ingest endpoint                              */
/* -------------------------------------------------------------------------- */

export function tokenMatches(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
