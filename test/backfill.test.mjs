import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openLedger } from '../ledger.js';
import { backfillSessionActions } from '../index.js';

function temporaryLedger(t, name) {
  const directory = mkdtempSync(join(tmpdir(), 'prompt-ledger-' + name + '-'));
  const ledger = openLedger(join(directory, 'ledger.sqlite3'));
  t.after(() => {
    try { ledger.close(); } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  return ledger;
}

function historicalSession() {
  const now = Date.now();
  return {
    id: 's-history',
    snapshotEvents() {
      return [
        { type: 'user/message', seq: 1, time: now - 3000, data: { content: [{ type: 'text', text: 'Fix the UI' }] } },
        { type: 'turn/start', seq: 2, time: now - 2900, data: { turn: 1 } },
        { type: 'tool/call', seq: 3, time: now - 2800, data: { callId: 'root-1', name: 'run_code', arguments: '{}' } },
        { type: 'tool/ptc-dispatch-start', seq: 4, time: now - 2700, data: { rootCallId: 'root-1', parentCallId: 'root-1', subCallId: 'root-1:ptc:1', name: 'write', arguments: { file_path: '/repo/out/app.js', content: 'export const x = 1;' } } },
        { type: 'tool/ptc-dispatch', seq: 5, time: now - 2600, data: { rootCallId: 'root-1', parentCallId: 'root-1', subCallId: 'root-1:ptc:1', name: 'write', arguments: { file_path: '/repo/out/app.js', content: 'export const x = 1;' }, content: [{ type: 'text', text: 'Created file' }], isError: false } },
        { type: 'turn/end', seq: 6, time: now - 2500, data: { turn: 1, reason: { kind: 'completed' } } },
      ];
    },
  };
}

test('backfills sealed historical turns idempotently and aggregates a session', (t) => {
  const ledger = temporaryLedger(t, 'backfill');
  const promptId = ledger.recordSubmission({
    sourceKey: 'dsh:s-history:u:1',
    sessionId: 's-history',
    seq: 1,
    cwd: '/repo',
    text: 'Fix the UI',
  });
  ledger.finalizePrompt(promptId, { status: 'completed' });
  assert.equal(ledger.getPrompt(promptId).actions.length, 0);

  const ctx = { sessions: { list: () => [historicalSession()] } };
  const first = backfillSessionActions(ctx, ledger, 's-history');
  assert.equal(first.inserted, 2);
  assert.equal(first.skipped, 0);
  assert.equal(first.unmapped, 0);

  const prompt = ledger.getPrompt(promptId);
  assert.equal(prompt.actions.length, 1);
  assert.equal(prompt.actions[0].kind, 'write');
  assert.equal(prompt.actions[0].titleZh, '写入 out/app.js');
  assert.equal(prompt.actionSummary.write, 1);

  const second = backfillSessionActions(ctx, ledger, 's-history');
  assert.equal(second.inserted, 0);
  assert.equal(second.skipped, 2);

  const session = ledger.sessionActions('s-history');
  assert.equal(session.turns.length, 1);
  assert.equal(session.summary.write, 1);
  assert.equal(session.files[0].label, 'out/app.js');
  assert.equal(ledger.sessions()[0].actionCount, 1);
  assert.equal(ledger.integrity().ok, true);
});
