import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openLedger, toCsv } from '../ledger.js';

function temporaryLedger(t, name) {
  const directory = mkdtempSync(join(tmpdir(), `prompt-ledger-${name}-`));
  const path = join(directory, 'ledger.sqlite3');
  const ledger = openLedger(path);
  t.after(() => {
    try {
      ledger.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  return ledger;
}

test('captures a full turn, evaluates it, rates it and exports it', (t) => {
  const ledger = temporaryLedger(t, 'capture');
  const now = Date.now();
  const promptId = ledger.recordSubmission({
    platform: 'dsh',
    sessionId: 'session-test',
    seq: 1,
    at: now - 4_000,
    text: 'Build a pricing page with a comparison table.',
    sourceKey: 'dsh:session-test:u:1',
  });
  assert.equal(typeof promptId, 'string');
  assert.equal(
    ledger.recordSubmission({
      platform: 'dsh',
      sessionId: 'session-test',
      seq: 1,
      at: now - 4_000,
      text: 'Build a pricing page with a comparison table.',
      sourceKey: 'dsh:session-test:u:1',
    }),
    promptId,
    'duplicate source keys are idempotent',
  );
  ledger.recordTurn(promptId, 1, now - 3_900, 2);
  ledger.recordAssistant(promptId, {
    at: now - 3_000,
    seq: 3,
    provider: 'deepseek',
    model: 'deepseek-v4',
    usage: { inputTokens: 1_200, outputTokens: 800, cacheReadTokens: 400 },
    text: 'The pricing page is ready with responsive comparison columns.',
  });
  ledger.recordToolCall(promptId, {
    at: now - 2_800,
    seq: 4,
    callId: 'call-1',
    name: 'write',
    arguments: '{"path":"pricing.html"}',
  });
  ledger.recordToolResult(promptId, {
    at: now - 2_700,
    seq: 5,
    callId: 'call-1',
    name: 'write',
    result: 'written',
    error: null,
  });
  ledger.recordToolCall(promptId, {
    at: now - 2_600,
    seq: 6,
    callId: 'call-2',
    name: 'skill',
    arguments: '{"name":"frontend-design"}',
  });
  ledger.recordToolResult(promptId, {
    at: now - 2_500,
    seq: 7,
    callId: 'call-2',
    name: 'skill',
    result: 'loaded',
    error: null,
  });
  const sealed = ledger.finalizePrompt(promptId, {
    at: now,
    status: 'completed',
    finishReason: 'completed',
  });
  assert.equal(sealed.status, 'completed');
  assert.equal(sealed.tool_errors, 0);
  assert.equal(sealed.total_tokens, 2_000);

  const evaluation = ledger.evaluateRule(promptId);
  assert.ok(evaluation.total >= 1 && evaluation.total <= 5);
  ledger.ratePrompt(promptId, 5, 'Clean structure and complete answer.');
  ledger.setTags(promptId, ['pricing', 'frontend']);
  ledger.setFavorite(promptId, true);

  const prompt = ledger.getPrompt(promptId);
  assert.equal(prompt.rating.stars, 5);
  assert.equal(prompt.favorite, true);
  assert.deepEqual(prompt.tags, ['pricing', 'frontend']);
  assert.deepEqual(prompt.skills, ['frontend-design']);
  assert.deepEqual(prompt.tools, ['write']);
  assert.equal(prompt.toolInvocations.length, 2);
  assert.equal(prompt.auto.total, evaluation.total);

  const listed = ledger.listPrompts({ sessionId: 'session-test', minRating: 5 });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].id, promptId);

  const analytics = ledger.analytics({ sessionId: 'session-test' });
  assert.ok(analytics.tools.some((tool) => tool.name === 'skill' && tool.category === 'skill'));
  assert.equal(analytics.distribution.find((entry) => entry.stars === 5).count, 1);

  const rows = ledger.exportRows({ sessionId: 'session-test' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userRating, 5);
  assert.equal(rows[0].userFavorite, 'yes');
  assert.equal(rows[0].userTags, 'pricing|frontend');
  assert.match(toCsv(rows), /Build a pricing page/);

  assert.equal(ledger.integrity().ok, true);
});

test('rejects updates and detects a forced sealed-row tamper', (t) => {
  const ledger = temporaryLedger(t, 'tamper');
  const id = ledger.recordSubmission({ platform: 'test', text: 'immutable row' });
  ledger.finalizePrompt(id, { status: 'completed' });

  assert.throws(
    () => ledger.raw.exec(`UPDATE prompts SET prompt_text = 'changed' WHERE id = '${id}'`),
    /immutable/,
  );
  assert.throws(
    () => ledger.raw.exec(`DELETE FROM prompts WHERE id = '${id}'`),
    /append-only/,
  );
  assert.throws(
    () => ledger.raw.exec('UPDATE prompt_events SET kind = \'changed\' WHERE id = 1'),
    /append-only/,
  );

  ledger.raw.exec('DROP TRIGGER prompts_sealed_immutable');
  ledger.raw.prepare('UPDATE prompts SET prompt_text = ? WHERE id = ?').run('forced tamper', id);
  const report = ledger.integrity();
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.kind === 'row-hash'));
});

test('ingests external platform turns idempotently', (t) => {
  const ledger = temporaryLedger(t, 'external');
  const input = {
    platform: 'codex',
    prompt: 'Why does this test fail?',
    response: 'The fixture was missing a null check.',
    model: 'gpt-5-codex',
    provider: 'openai',
    status: 'completed',
    usage: { inputTokens: 500, outputTokens: 100 },
    tools: [
      { name: 'bash', category: 'tool', status: 'ok', result: 'npm test' },
      { name: 'mcp__search', category: 'mcp', status: 'error', error: 'timeout' },
    ],
    tags: ['debugging'],
    favorite: true,
    rating: { stars: 4, note: 'Useful fix.' },
    sourceKey: 'external-test-1',
  };
  const first = ledger.ingest(input);
  const second = ledger.ingest(input);
  assert.equal(first.id, second.id);
  assert.equal(second.duplicate, true);
  assert.equal(first.model, 'gpt-5-codex');
  assert.equal(first.rating.stars, 4);
  assert.equal(first.favorite, true);
  assert.deepEqual(first.tags, ['debugging']);
  assert.equal(first.toolCalls, 2);
  assert.equal(first.toolErrors, 1);
  assert.ok(first.auto.total > 0);
  assert.equal(ledger.integrity().ok, true);
});
