/**
 * Prompt Ledger · Host half.
 *
 * Captures every DSH user turn from the durable session log, derives model,
 * token, tool, Skill and MCP metadata, seals the record in local SQLite, and
 * serves the Web panel plus one agent tool. The same ledger file is readable
 * by the MCP/CLI adapters for ChatGPT, Codex, Work Buddy, Doubao and TRAE.
 */

import { fileURLToPath } from 'node:url';

import {
  extractText,
  openLedger,
  PLATFORM_LABELS,
  toCsv,
  tokenMatches,
} from './ledger.js';

export const inject = ['connection', 'tools', 'sessions'];

const PREFIX = '/api/prompt-ledger';
const EXTERNAL_PATH = '/prompt-ledger/v1/ingest';
const EXTERNAL_HEALTH_PATH = '/prompt-ledger/v1/health';
const MAX_BODY = 2_000_000;
const PLUGIN_DIR = fileURLToPath(new URL('./', import.meta.url));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function errorResponse(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : String(error);
  return json({ ok: false, error: { message } }, status);
}

function guarded(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('[prompt-ledger] HTTP error:', error);
      return errorResponse(error);
    }
  };
}

async function readNodeJson(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY) throw new HttpError(413, 'request body is too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'request body must be valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'request body must be a JSON object');
  }
  return parsed;
}

function sendNodeJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  response.end(body);
}

async function readJson(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, 'could not read request body');
  }
  if (text.length > MAX_BODY) throw new HttpError(413, 'request body is too large');
  if (text.trim() === '') return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'request body must be valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'request body must be a JSON object');
  }
  return parsed;
}

function queryObject(request) {
  const result = {};
  const url = new URL(request.url);
  for (const [key, value] of url.searchParams) result[key] = value;
  return result;
}

function settingsView(ledger) {
  const settings = ledger.settings();
  return {
    autoEval: settings.auto_eval === '1',
    modelEval: settings.model_eval === '1',
    backfill: settings.capture_backfill === '1',
  };
}

function ingestInfo(ctx, ledger) {
  let origin = null;
  try {
    origin = ctx.get('webServer')?.getOrigin() ?? null;
  } catch {
    origin = null;
  }
  return {
    url: origin === null ? null : `${origin}${EXTERNAL_PATH}`,
    token: ledger.settings().ingest_token,
    header: 'x-prompt-ledger-token',
  };
}

function compactPrompt(prompt) {
  if (prompt === null) return null;
  return {
    id: prompt.id,
    platform: prompt.platform,
    createdAt: prompt.createdAt,
    model: prompt.model,
    provider: prompt.provider,
    status: prompt.status,
    prompt: prompt.prompt,
    response: prompt.response,
    tokens: prompt.tokens,
    latencyMs: prompt.latencyMs,
    tools: prompt.tools,
    skills: prompt.skills,
    mcp: prompt.mcp,
    toolCalls: prompt.toolCalls,
    toolErrors: prompt.toolErrors,
    rating: prompt.rating,
    favorite: prompt.favorite,
    tags: prompt.tags,
    auto: prompt.auto,
    toolInvocations: (prompt.toolInvocations ?? []).map((tool) => ({
      name: tool.name,
      category: tool.category,
      status: tool.status,
      error: tool.error,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Heuristic and model evaluation                                              */
/* -------------------------------------------------------------------------- */

function parseJudgeJson(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function modelJudge(ctx, ledger, row, rubric) {
  const llm = ctx.get('llm');
  if (llm === undefined) throw new Error('llm service is unavailable');
  if (typeof row.provider !== 'string' || row.provider === '' || typeof row.model !== 'string' || row.model === '') {
    throw new Error('captured provider/model is missing');
  }
  const dimensions = rubric.dimensions.map((dimension) => `"${dimension.id}"`).join(', ');
  const system = [
    'You are an impartial evaluator for AI assistant turns.',
    'Score the turn on each requested dimension from 1 (poor) to 5 (excellent).',
    'Return ONLY one JSON object, with no prose or markdown, in the form:',
    `{"dimensions":{${dimensions}},"notes":"one or two concrete observations"}`,
    'Judge the result, not the prompt author. Do not reward verbosity.',
  ].join('\n');
  const prompt = [
    `Platform: ${row.platform}`,
    `Model: ${row.provider ?? '?'} / ${row.model ?? '?'}`,
    `Status: ${row.status}; tool calls: ${row.tool_calls}; tool errors: ${row.tool_errors}`,
    `Tokens: input ${row.input_tokens}, output ${row.output_tokens}`,
    `Latency: ${row.latency_ms ?? 0} ms`,
    '',
    'USER PROMPT:',
    String(row.prompt_text ?? '').slice(0, 6_000),
    '',
    'ASSISTANT RESULT:',
    String(row.assistant_text ?? '').slice(0, 6_000),
  ].join('\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let output = '';
  try {
    const stream = llm.stream({
      provider: row.provider,
      model: row.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      temperature: 0,
      maxTokens: 500,
      signal: controller.signal,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') output += chunk.text;
      if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
        throw new Error(chunk.reason.failure?.message ?? 'model judge request failed');
      }
      if (chunk.type === 'finish' && chunk.reason?.kind === 'aborted') {
        throw new Error('model judge request aborted');
      }
    }
  } finally {
    clearTimeout(timer);
  }
  const parsed = parseJudgeJson(output);
  if (parsed === null || typeof parsed.dimensions !== 'object' || parsed.dimensions === null) {
    throw new Error('model judge returned no usable JSON');
  }
  const result = ledger.evaluateModel(row.id, {
    dimensions: parsed.dimensions,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    model: `${row.provider}/${row.model}`,
  });
  return result;
}

/* -------------------------------------------------------------------------- */
/* Session capture                                                             */
/* -------------------------------------------------------------------------- */

class Capture {
  constructor(ctx, ledger) {
    this.ctx = ctx;
    this.ledger = ledger;
    this.trackers = new Map();
    this.timers = new Set();
    this.warned = new Set();
  }

  tracker(session) {
    let tracker = this.trackers.get(session.id);
    if (tracker === undefined) {
      tracker = { promptId: null, turn: null };
      this.trackers.set(session.id, tracker);
    }
    return tracker;
  }

  warn(message, error) {
    const key = `${message}:${error instanceof Error ? error.message : String(error)}`;
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn('[prompt-ledger]', message, error);
  }

  statusOf(reason) {
    const kind = reason?.kind;
    if (kind === 'completed') return { status: 'completed', finishReason: 'completed' };
    if (kind === 'aborted') return { status: 'aborted', finishReason: 'aborted', error: reason.reason };
    if (kind === 'error') return { status: 'failed', finishReason: 'error', error: reason.error };
    if (kind === 'max-tokens') return { status: 'failed', finishReason: 'max-tokens' };
    if (kind === 'blocked') return { status: 'failed', finishReason: 'blocked' };
    if (kind === 'interrupted') return { status: 'interrupted', finishReason: 'interrupted' };
    if (kind === 'forked') return { status: 'interrupted', finishReason: 'forked' };
    return { status: 'completed', finishReason: kind ?? 'completed' };
  }

  onSealed(row, { live = false } = {}) {
    if (row === null || row === undefined) return;
    try {
      if (this.ledger.settings().auto_eval === '1') this.ledger.evaluateRule(row.id);
    } catch (error) {
      this.warn('rule evaluation failed', error);
    }
    if (!live) return;
    if (this.ledger.settings().model_eval !== '1') return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      modelJudge(this.ctx, this.ledger, row, this.ledger.rubric())
        .catch((error) => this.warn('model evaluation failed', error));
    }, 300);
    this.timers.add(timer);
  }

  handle(session, event, options = {}) {
    const live = options.live !== false;
    try {
      const tracker = this.tracker(session);
      if (event.type === 'user/message') {
        const text = extractText(event.data?.content);
        if (text === '') return;
        const promptId = this.ledger.recordSubmission({
          promptId: tracker.promptId,
          platform: 'dsh',
          sessionId: session.id,
          cwd: session.header?.cwd ?? null,
          turn: tracker.turn,
          seq: event.seq,
          at: event.data?.time ?? event.time,
          text,
          sourceKey: `dsh:${session.id}:u:${event.seq}`,
          promptSourceKey: `dsh:${session.id}:run:${event.seq}`,
          meta: {
            origin: session.header?.origin ?? 'session',
            agentPreset: session.header?.agentPreset ?? null,
            title: session.header?.title ?? null,
          },
        });
        if (promptId !== null) tracker.promptId = promptId;
        return;
      }

      if (event.type === 'turn/start') {
        tracker.turn = event.data?.turn ?? null;
        if (tracker.promptId !== null) this.ledger.recordTurn(tracker.promptId, tracker.turn ?? 0, event.time, event.seq);
        return;
      }

      if (tracker.promptId === null) return;

      if (event.type === 'assistant/message') {
        const message = event.data?.message ?? {};
        const source = message.source ?? {};
        const text = extractText(message.content)
          .split('\n')
          .filter((line) => !/^\[工具 .+\]$/.test(line.trim()))
          .join('\n')
          .trim();
        this.ledger.recordAssistant(tracker.promptId, {
          at: event.time,
          seq: event.seq,
          turn: event.data?.turn,
          step: event.data?.step,
          provider: source.provider ?? null,
          model: source.model ?? null,
          usage: event.data?.usage,
          text,
        });
        return;
      }

      if (event.type === 'tool/call') {
        this.ledger.recordToolCall(tracker.promptId, {
          at: event.time,
          seq: event.seq,
          callId: event.data?.callId ?? null,
          name: event.data?.name ?? 'unknown',
          arguments: event.data?.arguments ?? '',
        });
        this.ledger.recordActionStart(tracker.promptId, {
          at: event.time,
          seq: event.seq,
          callId: event.data?.callId ?? null,
          parentCallId: null,
          rootCallId: event.data?.callId ?? null,
          name: event.data?.name ?? 'unknown',
          arguments: event.data?.arguments ?? '',
          hidden: (event.data?.name ?? '') === 'run_code',
          meta: { transport: 'direct' },
        });
        return;
      }

      if (event.type === 'tool/result') {
        const message = event.data?.message ?? {};
        const resultError = event.data?.error;
        const failed = message.isError === true || (resultError !== undefined && resultError !== null);
        this.ledger.recordToolResult(tracker.promptId, {
          at: event.time,
          seq: event.seq,
          callId: message.toolCallId ?? null,
          name: event.data?.name ?? null,
          result: extractText(message.content),
          isError: failed,
          error: resultError ?? (message.isError === true ? 'tool returned an error' : null),
        });
        this.ledger.recordActionResult(tracker.promptId, {
          at: event.time,
          seq: event.seq,
          callId: message.toolCallId ?? null,
          name: event.data?.name ?? null,
          result: extractText(message.content),
          isError: failed,
          error: resultError ?? (message.isError === true ? 'tool returned an error' : null),
        });
        return;
      }

      if (event.type === 'tool/ptc-dispatch-start') {
        const data = event.data ?? {};
        this.ledger.recordActionStart(tracker.promptId, {
          at: event.time,
          seq: event.seq,
          callId: data.subCallId ?? null,
          parentCallId: data.parentCallId ?? null,
          rootCallId: data.rootCallId ?? null,
          name: data.name ?? 'unknown',
          arguments: data.arguments ?? {},
          meta: { transport: 'ptc' },
        });
        return;
      }

      if (event.type === 'tool/ptc-dispatch') {
        const data = event.data ?? {};
        const result = extractText(data.content);
        const error = data.isError === true
          ? (typeof data.meta?.error === 'string' ? data.meta.error : 'tool returned an error')
          : null;
        this.ledger.recordActionResult(tracker.promptId, {
          at: event.time,
          seq: event.seq,
          callId: data.subCallId ?? null,
          name: data.name ?? null,
          arguments: data.arguments ?? {},
          result,
          isError: data.isError === true,
          error,
        });
        return;
      }

      if (event.type === 'turn/end') {
        const promptId = tracker.promptId;
        tracker.promptId = null;
        tracker.turn = null;
        const wasSealed = this.ledger.isSealed(promptId);
        const status = this.statusOf(event.data?.reason);
        const sealed = this.ledger.finalizePrompt(promptId, {
          at: event.time,
          status: status.status,
          finishReason: status.finishReason,
          error: status.error ?? null,
        });
        if (!wasSealed) this.onSealed(sealed, { live });
      }
    } catch (error) {
      this.warn(`capture failed for ${event.type}`, error);
    }
  }

  backfill() {
    if (this.ledger.settings().capture_backfill !== '1') return;
    const sessions = this.ctx.sessions.list();
    for (const session of sessions) {
      try {
        for (const event of session.snapshotEvents()) this.handle(session, event, { live: false });
      } catch (error) {
        this.warn('backfill failed', error);
      }
    }
  }

  finalizeDisposed(session) {
    try {
      for (const promptId of this.ledger.openPromptsForSession(session.id)) {
        const wasSealed = this.ledger.isSealed(promptId);
        const sealed = this.ledger.finalizePrompt(promptId, {
          at: Date.now(),
          status: 'interrupted',
          finishReason: 'session-disposed',
        });
        if (!wasSealed) this.onSealed(sealed, { live: false });
      }
      this.trackers.delete(session.id);
    } catch (error) {
      this.warn('finalize on session disposal failed', error);
    }
  }

  /**
   * Seal prompts whose Session is no longer live (the plugin was offline when
   * the Session ended). Live open prompts are left alone so a plugin reload can
   * resume the same turn instead of truncating it.
   */
  finalizeStale() {
    const live = new Set(this.ctx.sessions.list().map((session) => session.id));
    for (const row of this.ledger.openPromptRows()) {
      if (row.session_id !== null && live.has(row.session_id)) continue;
      try {
        const wasSealed = this.ledger.isSealed(row.id);
        const sealed = this.ledger.finalizePrompt(row.id, {
          at: Date.now(),
          status: 'interrupted',
          finishReason: 'plugin-offline',
        });
        if (!wasSealed) this.onSealed(sealed, { live: false });
      } catch (error) {
        this.warn('finalize stale prompt failed', error);
      }
    }
  }

  /** Stop timers before the database closes; open turns are deliberately kept. */
  flush() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP API                                                                    */
/* -------------------------------------------------------------------------- */

function findSession(ctx, sessionId) {
  return ctx.sessions.list().find((session) => session.id === sessionId) ?? null;
}

/**
 * Rebuild action traces for one historical Session from its durable event log.
 * The collector pairs nested PTC starts/results and direct tool calls, then
 * imports completed rows into the ledger. It is idempotent by callId, so a
 * second run only skips existing actions.
 */
export function backfillSessionActions(ctx, ledger, sessionId) {
  const session = findSession(ctx, sessionId);
  if (session === null) return null;
  const events = session.snapshotEvents();
  let currentPromptId = null;
  let active = new Map();
  const stats = { sessionId, prompts: 0, inserted: 0, skipped: 0, actions: 0, unmapped: 0 };
  const flush = () => {
    if (currentPromptId === null || active.size === 0) {
      active = new Map();
      return;
    }
    const actions = [...active.values()];
    const imported = ledger.importActions(currentPromptId, actions);
    stats.prompts += 1;
    stats.actions += actions.length;
    stats.inserted += imported.inserted;
    stats.skipped += imported.skipped;
    active = new Map();
  };
  const ensure = (callId, input) => {
    const key = callId ?? ('seq:' + input.seq + ':' + input.name);
    let record = active.get(key);
    if (record === undefined) {
      record = {
        callId: callId ?? null,
        parentCallId: input.parentCallId ?? null,
        rootCallId: input.rootCallId ?? null,
        name: input.name ?? 'unknown',
        arguments: input.arguments ?? {},
        startedAt: input.startedAt ?? null,
        endedAt: null,
        status: 'running',
        result: '',
        error: null,
        seq: input.seq ?? null,
        hidden: input.hidden === true,
      };
      active.set(key, record);
    } else if (input.arguments !== undefined) {
      record.arguments = input.arguments;
      record.name = input.name ?? record.name;
    }
    return record;
  };
  const finish = (callId, input) => {
    if (callId === null || callId === undefined) return;
    const record = ensure(callId, input);
    record.endedAt = input.endedAt ?? Date.now();
    record.status = input.isError === true ? 'error' : 'ok';
    record.result = input.result ?? '';
    record.error = input.error ?? null;
  };
  for (const event of events) {
    if (event.type === 'user/message') {
      flush();
      const sourceKey = 'dsh:' + session.id + ':u:' + event.seq;
      currentPromptId = ledger.promptIdForSourceKey(sourceKey) ?? ledger.promptIdForSessionSeq(session.id, event.seq);
      if (currentPromptId === null) stats.unmapped += 1;
      continue;
    }
    if (currentPromptId === null) continue;
    if (event.type === 'tool/call') {
      const data = event.data ?? {};
      ensure(data.callId ?? null, {
        name: data.name ?? 'unknown',
        arguments: data.arguments ?? '',
        rootCallId: data.callId ?? null,
        parentCallId: null,
        startedAt: event.time,
        seq: event.seq,
        hidden: (data.name ?? '') === 'run_code',
      });
      continue;
    }
    if (event.type === 'tool/ptc-dispatch-start') {
      const data = event.data ?? {};
      ensure(data.subCallId ?? null, {
        name: data.name ?? 'unknown',
        arguments: data.arguments ?? {},
        rootCallId: data.rootCallId ?? null,
        parentCallId: data.parentCallId ?? null,
        startedAt: event.time,
        seq: event.seq,
      });
      continue;
    }
    if (event.type === 'tool/ptc-dispatch') {
      const data = event.data ?? {};
      const result = extractText(data.content);
      finish(data.subCallId ?? null, {
        name: data.name ?? 'unknown',
        arguments: data.arguments ?? {},
        rootCallId: data.rootCallId ?? null,
        parentCallId: data.parentCallId ?? null,
        startedAt: event.time,
        endedAt: event.time,
        seq: event.seq,
        result,
        isError: data.isError === true,
        error: data.isError === true ? (typeof data.meta?.error === 'string' ? data.meta.error : 'tool returned an error') : null,
      });
      continue;
    }
    if (event.type === 'tool/result') {
      const message = event.data?.message ?? {};
      finish(message.toolCallId ?? null, {
        name: event.data?.name ?? 'unknown',
        startedAt: event.time,
        endedAt: event.time,
        seq: event.seq,
        result: extractText(message.content),
        isError: message.isError === true || (event.data?.error !== undefined && event.data?.error !== null),
        error: event.data?.error ?? (message.isError === true ? 'tool returned an error' : null),
      });
      continue;
    }
    if (event.type === 'turn/end') {
      flush();
    }
  }
  flush();
  return stats;
}

function apiRoutes(ctx, ledger) {
  const routes = [];

  routes.push({
    path: `${PREFIX}/bootstrap`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async () => json({
      ok: true,
      generatedAt: Date.now(),
      dbPath: ledger.dbPath,
      bundleDir: PLUGIN_DIR,
      counts: ledger.counts(),
      settings: settingsView(ledger),
      ingest: ingestInfo(ctx, ledger),
      rubric: ledger.rubric(),
      facets: ledger.facets(),
      platforms: PLATFORM_LABELS,
    })),
  });

  routes.push({
    path: `${PREFIX}/overview`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => json({
      ok: true,
      ...ledger.overview(queryObject(request)),
    })),
  });

  routes.push({
    path: `${PREFIX}/prompts`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => json({
      ok: true,
      ...ledger.listPrompts(queryObject(request)),
    })),
  });

  routes.push({
    path: `${PREFIX}/prompt`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      const id = new URL(request.url).searchParams.get('id') ?? '';
      if (id === '') throw new HttpError(400, 'id is required');
      const prompt = ledger.getPrompt(id);
      if (prompt === null) throw new HttpError(404, 'prompt not found');
      return json({ ok: true, prompt });
    }),
  });

  routes.push({
    path: `${PREFIX}/rate`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      const body = await readJson(request);
      if (typeof body.id !== 'string' || body.id === '') throw new HttpError(400, 'id is required');
      const rating = ledger.ratePrompt(body.id, body.stars, body.note ?? '');
      return json({ ok: true, id: body.id, rating });
    }),
  });

  routes.push({
    path: `${PREFIX}/annotate`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      const body = await readJson(request);
      if (typeof body.id !== 'string' || body.id === '') throw new HttpError(400, 'id is required');
      if (body.favorite !== undefined) ledger.setFavorite(body.id, body.favorite === true);
      if (Array.isArray(body.tags)) ledger.setTags(body.id, body.tags);
      if (typeof body.note === 'string') ledger.setNote(body.id, body.note);
      return json({ ok: true, prompt: ledger.getPrompt(body.id) });
    }),
  });


  routes.push({
    path: PREFIX + '/sessions',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async () => json({ ok: true, sessions: ledger.sessions(30) })),
  });

  routes.push({
    path: PREFIX + '/session-actions',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      const sessionId = new URL(request.url).searchParams.get('sessionId') ?? '';
      if (sessionId === '') throw new HttpError(400, 'sessionId is required');
      const data = ledger.sessionActions(sessionId);
      if (data === null) throw new HttpError(404, 'session not found');
      return json({ ok: true, session: data });
    }),
  });

  routes.push({
    path: PREFIX + '/actions/backfill',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      const body = await readJson(request);
      if (typeof body.sessionId !== 'string' || body.sessionId === '') throw new HttpError(400, 'sessionId is required');
      const stats = backfillSessionActions(ctx, ledger, body.sessionId);
      if (stats === null) throw new HttpError(404, 'session not found');
      return json({ ok: true, ...stats, session: ledger.sessionActions(body.sessionId) });
    }),
  });

  routes.push({
    path: `${PREFIX}/analytics`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => json({
      ok: true,
      ...ledger.analytics(queryObject(request)),
    })),
  });

  routes.push({
    path: `${PREFIX}/facets`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async () => json({ ok: true, ...ledger.facets() })),
  });

  routes.push({
    path: `${PREFIX}/settings`,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      if (request.method === 'GET') {
        return json({ ok: true, settings: settingsView(ledger), raw: ledger.settings() });
      }
      const body = await readJson(request);
      const patch = {};
      if (typeof body.autoEval === 'boolean') patch.auto_eval = body.autoEval ? '1' : '0';
      if (typeof body.modelEval === 'boolean') patch.model_eval = body.modelEval ? '1' : '0';
      if (typeof body.backfill === 'boolean') patch.capture_backfill = body.backfill ? '1' : '0';
      ledger.setSettings(patch);
      return json({ ok: true, settings: settingsView(ledger) });
    }),
  });

  routes.push({
    path: `${PREFIX}/rubric`,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      if (request.method === 'GET') return json({ ok: true, rubric: ledger.rubric() });
      const body = await readJson(request);
      const rubric = ledger.updateRubric(body.dimensions, body.note ?? '');
      return json({ ok: true, rubric });
    }),
  });

  routes.push({
    path: `${PREFIX}/integrity`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async () => json({ ok: true, integrity: ledger.integrity() })),
  });

  routes.push({
    path: `${PREFIX}/export`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      const query = queryObject(request);
      const rows = ledger.exportRows(query);
      if (query.format === 'json') return json({ ok: true, count: rows.length, rows });
      const stamp = new Date().toISOString().slice(0, 10);
      return new Response(toCsv(rows), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="prompt-ledger-${stamp}.csv"`,
          'cache-control': 'no-store',
        },
      });
    }),
  });

  routes.push({
    path: `${PREFIX}/ingest`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: guarded(async (request) => {
      const body = await readJson(request);
      const prompt = ledger.ingest(body);
      return json({ ok: true, id: prompt.id, duplicate: prompt.duplicate === true, prompt });
    }),
  });

  return routes;
}

function registerExternalIngest(ctx, ledger) {
  const webServer = ctx.get('webServer');
  if (webServer === undefined) return;
  ctx.effect(() => {
    const disposers = [];
    disposers.push(webServer.register({
      kind: 'exact',
      path: EXTERNAL_HEALTH_PATH,
      resource: async () => json({
        ok: true,
        service: 'prompt-ledger',
        version: 1,
        counts: ledger.counts(),
      }),
    }));
    disposers.push(webServer.register({
      kind: 'exact',
      path: EXTERNAL_PATH,
      handler: async (request, response) => {
        const cors = {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type, x-prompt-ledger-token, authorization',
          'access-control-allow-methods': 'POST, OPTIONS',
        };
        if (request.method === 'OPTIONS') {
          response.writeHead(204, cors);
          response.end();
          return;
        }
        if (request.method !== 'POST') {
          sendNodeJson(response, 405, { ok: false, error: { message: 'POST only' } }, { ...cors, allow: 'POST, OPTIONS' });
          return;
        }
        const expected = ledger.settings().ingest_token;
        const authorization = request.headers.authorization ?? '';
        const supplied = request.headers['x-prompt-ledger-token']
          ?? (authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
        if (!tokenMatches(expected, supplied)) {
          sendNodeJson(response, 401, { ok: false, error: { message: 'invalid ingest token' } }, cors);
          return;
        }
        try {
          const body = await readNodeJson(request);
          const prompt = ledger.ingest(body);
          sendNodeJson(response, 200, {
            ok: true,
            id: prompt.id,
            duplicate: prompt.duplicate === true,
            autoScore: prompt.auto?.total ?? null,
          }, cors);
        } catch (error) {
          const status = error instanceof HttpError ? error.status : 400;
          sendNodeJson(response, status, {
            ok: false,
            error: { message: error instanceof Error ? error.message : String(error) },
          }, cors);
        }
      },
    }));
    return () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          /* already disposed */
        }
      }
    };
  }, 'prompt-ledger: external ingest endpoint');
}

/* -------------------------------------------------------------------------- */
/* Agent tool                                                                  */
/* -------------------------------------------------------------------------- */

const TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['overview', 'search', 'get', 'analytics', 'integrity'],
      description:
        'overview = KPIs, trend, recent turns and insights; search = filtered prompt archive; get = one turn with its full prompt, result, tool calls and evaluations; analytics = model/tool/Skill/MCP breakdowns; integrity = verify the append-only hash chain.',
    },
    id: {
      type: 'string',
      description: 'get: exact prompt id (see search results).',
    },
    q: {
      type: 'string',
      description: 'search: free-text query over prompt, result, model and tags.',
    },
    range: {
      type: 'string',
      enum: ['today', '7d', '30d', '90d', 'all'],
      description: 'Time window. Default all for search, 30d for overview.',
    },
    platform: {
      type: 'string',
      description: 'Filter by platform id, for example dsh, chatgpt, codex, workbuddy, doubao, trae.',
    },
    model: {
      type: 'string',
      description: 'Filter by exact model id.',
    },
    tool: {
      type: 'string',
      description: 'Filter by an exact tool, Skill or MCP name used in the turn.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      description: 'Maximum rows for search (default 10).',
    },
  },
  required: ['action'],
};

function toolResult(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}

/** The tool output contract is lossless JSON: drop undefined/NaN/functions. */
function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') return null;
    if (typeof item === 'number' && !Number.isFinite(item)) return null;
    return item;
  }));
}

function buildTool(ledger) {
  return {
    name: 'prompt_ledger',
    description: [
      'Read the local Prompt Ledger: an append-only archive of user prompts, results, model/token/tool/Skill/MCP metadata, five-star human ratings and automatic rubric evaluations.',
      'Use it to review past turns, compare models or tools, find highly rated prompts, and verify archive integrity.',
      'Ratings and annotations are user-only: never invent or change a human rating through this tool.',
      'All data stays in the local SQLite file; nothing is uploaded.',
    ].join(' '),
    parameters: TOOL_PARAMETERS,
    output: {
      schema: {},
      render: (_args, value) => toolResult(value),
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `prompt ledger · ${typeof args?.action === 'string' ? args.action : 'overview'}`,
      rawInput: args,
    }),
    async execute(args) {
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new Error('arguments must be an object');
      }
      const action = String(args.action ?? '');
      let value;
      if (action === 'overview') {
        value = { ok: true, ...ledger.overview({ ...args }) };
      } else if (action === 'search') {
        const result = ledger.listPrompts({ ...args, limit: args.limit ?? 10 });
        value = { ok: true, total: result.total, items: result.items };
      } else if (action === 'get') {
        if (typeof args.id !== 'string' || args.id === '') throw new Error('action="get" requires id');
        const prompt = ledger.getPrompt(args.id);
        if (prompt === null) throw new Error('prompt not found');
        value = { ok: true, prompt: compactPrompt(prompt) };
      } else if (action === 'analytics') {
        value = { ok: true, ...ledger.analytics({ ...args }) };
      } else if (action === 'integrity') {
        value = { ok: true, integrity: ledger.integrity() };
      } else {
        throw new Error(`unknown action "${action}"`);
      }
      return jsonSafe(value);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                       */
/* -------------------------------------------------------------------------- */

export function apply(ctx) {
  let ledger;
  try {
    ledger = openLedger();
  } catch (error) {
    console.error('[prompt-ledger] could not open the local database:', error);
  }

  const capture = ledger === undefined ? null : new Capture(ctx, ledger);

  if (ledger !== undefined && capture !== null) {
    ctx.effect(() => {
      const offEvent = ctx.on('session/event', (session, event) => capture.handle(session, event));
      const offDisposed = ctx.on('session/disposed', (session) => capture.finalizeDisposed(session));
      return () => {
        offEvent();
        offDisposed();
        capture.flush();
        ledger.close();
      };
    }, 'prompt-ledger: session capture');

    ctx.effect(() => {
      const disposers = apiRoutes(ctx, ledger).map((route) => ctx.connection.fetch.register(route));
      return async () => {
        await Promise.all(disposers.map((dispose) => dispose()));
      };
    }, 'prompt-ledger: HTTP API');

    registerExternalIngest(ctx, ledger);

    ctx.effect(() => ctx.tools.register(buildTool(ledger)), 'prompt-ledger: agent tool');

    try {
      capture.backfill();
      capture.finalizeStale();
    } catch (error) {
      console.error('[prompt-ledger] backfill failed:', error);
    }
  }
}
