import assert from 'node:assert/strict';
import test from 'node:test';

import { aggregateFiles, describeAction, summarizeActions } from '../actions.js';

const cwd = '/repo';

test('describes file reads and edits with relative targets', () => {
  const read = describeAction('read', { file_path: '/repo/src/app.js', offset: 10, limit: 20 }, { cwd });
  assert.equal(read.kind, 'read');
  assert.equal(read.titleZh, '读取 src/app.js');
  assert.deepEqual(read.targets, [{ path: '/repo/src/app.js', label: 'src/app.js', action: 'read' }]);

  const edit = describeAction('edit', {
    file_path: '/repo/src/app.js',
    old_string: 'a\nb',
    new_string: 'a\nc\nd',
  }, { cwd });
  assert.equal(edit.kind, 'edit');
  assert.equal(edit.detail.removed, 2);
  assert.equal(edit.detail.added, 3);
  assert.equal(edit.titleEn, 'Edited src/app.js');
});

test('describes commands, searches, deliveries and MCP calls', () => {
  const command = describeAction('bash', { description: 'Run tests', command: 'npm test' }, { cwd });
  assert.equal(command.kind, 'command');
  assert.equal(command.titleZh, '运行命令');
  assert.match(command.titleEn, /Run tests/);
  assert.equal(command.targets.length, 0);

  const search = describeAction('grep', { pattern: 'TODO', path: '/repo/src' }, { cwd });
  assert.equal(search.kind, 'search');
  assert.equal(search.targets[0].action, 'search');

  const deliver = describeAction('present', { files: [{ path: '/repo/out/a.png' }, '/repo/out/b.mp4'] }, { cwd });
  assert.equal(deliver.kind, 'deliver');
  assert.equal(deliver.targets.length, 2);
  assert.match(deliver.titleZh, /2 个文件/);

  const mcp = describeAction('mcp__openmotion__openmotion_get_project', { projectId: 'p1' }, { cwd });
  assert.equal(mcp.kind, 'mcp');
  assert.match(mcp.titleZh, /openmotion_get_project/);
});

test('redacts secrets from command evidence', () => {
  const command = describeAction('bash', {
    command: 'curl -H "Authorization: Bearer sk-secret123456789" https://example.com',
  }, { cwd });
  assert.doesNotMatch(command.detail.command, /sk-secret/);
  assert.match(command.detail.command, /Bearer \*\*\*/);
});

test('aggregates files and summaries', () => {
  const actions = [
    { kind: 'read', status: 'ok', startedAt: 1, targets: [{ path: '/repo/a.js', label: 'a.js', action: 'read' }] },
    { kind: 'edit', status: 'ok', startedAt: 2, targets: [{ path: '/repo/a.js', label: 'a.js', action: 'edit' }] },
    { kind: 'command', status: 'error', startedAt: 3, targets: [] },
  ];
  const files = aggregateFiles(actions);
  assert.equal(files.length, 1);
  assert.equal(files[0].action, 'edit');
  assert.equal(files[0].count, 2);
  const summary = summarizeActions(actions);
  assert.equal(summary.total, 3);
  assert.equal(summary.files, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.read, 1);
  assert.equal(summary.edit, 1);
  assert.equal(summary.command, 1);
});
