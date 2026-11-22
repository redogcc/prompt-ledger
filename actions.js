/**
 * Prompt Ledger · Action Trace derivation.
 *
 * Turns raw tool calls (direct tools and nested run_code / PTC calls) into
 * plain-language actions, file targets and a compact summary. This module is
 * pure and dependency-free so it can be unit-tested and reused by adapters.
 */

import { basename, isAbsolute, relative } from 'node:path';

const FILE_ACTIONS = new Set(['read', 'write', 'edit', 'view', 'deliver', 'search']);

function asObject(value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function oneLine(value, max = 90) {
  const valueText = text(value).replace(/\s+/g, ' ').trim();
  if (valueText.length <= max) return valueText;
  return valueText.slice(0, max - 1) + '…';
}

function firstLine(value, max = 90) {
  const line = text(value).split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  return oneLine(line, max);
}

function countLines(value) {
  const valueText = text(value);
  if (valueText === '') return 0;
  return valueText.split('\n').length;
}

function byteLength(value) {
  return typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : 0;
}

export function redactSecrets(value, max = 12000) {
  let output = text(value);
  output = output
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)\s*[=:]\s*)[^\s"',}]+/gi, '$1***');
  if (output.length <= max) return output;
  return output.slice(0, max - 1) + '…';
}

export function displayPath(value, cwd) {
  const full = text(value).trim();
  if (full === '') return '';
  if (typeof cwd === 'string' && cwd !== '' && isAbsolute(full)) {
    const rel = relative(cwd, full);
    if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) return rel;
    const home = process.env.HOME;
    if (typeof home === 'string' && home !== '' && full.startsWith(home + '/')) return '~/' + relative(home, full);
    return basename(full);
  }
  return full;
}

function isTemporaryPath(full) {
  return /^(\/tmp|\/private\/tmp|\/var\/folders)\//.test(full)
    || full.includes('/node_modules/')
    || full.includes('/.git/');
}

function target(path, action, cwd) {
  const full = text(path).trim();
  if (full === '') return null;
  const item = { path: full, label: displayPath(full, cwd), action };
  if (isTemporaryPath(full)) item.temporary = true;
  return item;
}

function targetsFrom(args, action, cwd) {
  const values = [];
  if (typeof args.file_path === 'string') values.push(args.file_path);
  if (typeof args.path === 'string') values.push(args.path);
  if (Array.isArray(args.paths)) values.push(...args.paths);
  if (Array.isArray(args.files)) {
    for (const file of args.files) {
      if (typeof file === 'string') values.push(file);
      else if (file !== null && typeof file === 'object' && typeof file.path === 'string') values.push(file.path);
    }
  }
  if (Array.isArray(args.items)) {
    for (const item of args.items) {
      if (item !== null && typeof item === 'object') {
        if (typeof item.sourcePath === 'string') values.push(item.sourcePath);
        else if (typeof item.source_path === 'string') values.push(item.source_path);
        else if (typeof item.path === 'string') values.push(item.path);
      }
    }
  }
  return [...new Set(values.map((value) => target(value, action, cwd)).filter(Boolean))];
}

function diffStats(oldText, newText) {
  const oldLines = countLines(oldText);
  const newLines = countLines(newText);
  return { removed: oldLines, added: newLines, oldPreview: redactSecrets(oldText, 420), newPreview: redactSecrets(newText, 420) };
}

function humanizeMcp(name) {
  const raw = text(name);
  const parts = raw.split('__').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'mcp') return parts.slice(2).join(' / ');
  return raw.replace(/^mcp[_:-]?/i, '') || raw;
}

function normalizeQuestions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((question) => {
    if (typeof question === 'string') return question;
    if (question !== null && typeof question === 'object') return text(question.question ?? question.header ?? '');
    return '';
  }).filter(Boolean);
}

/**
 * @typedef {object} ActionDescription
 * @property {string} kind
 * @property {string} category
 * @property {string} titleZh
 * @property {string} titleEn
 * @property {Array<{path:string,label:string,action:string}>} targets
 * @property {Record<string, unknown>} detail
 * @property {boolean} hidden
 */

/** @returns {ActionDescription} */
export function describeAction(name, rawArguments, options = {}) {
  const toolName = text(name) || 'unknown';
  const lower = toolName.toLowerCase();
  const args = asObject(rawArguments);
  const cwd = typeof options.cwd === 'string' ? options.cwd : '';
  const base = { kind: 'other', category: 'other', titleZh: '执行了一个动作', titleEn: 'Did an action', targets: [], detail: {}, hidden: false };

  if (toolName === 'run_code') {
    return { ...base, kind: 'orchestrator', category: 'orchestrator', titleZh: '执行多步任务', titleEn: 'Ran a multi-step task', hidden: true };
  }

  if (lower === 'read') {
    const targets = targetsFrom(args, 'read', cwd);
    const label = targets[0]?.label ?? '文件';
    return { ...base, kind: 'read', category: 'file', titleZh: '读取 ' + label, titleEn: 'Read ' + label, targets, detail: { offset: args.offset ?? null, limit: args.limit ?? null } };
  }

  if (lower === 'write') {
    const targets = targetsFrom(args, 'write', cwd);
    const label = targets[0]?.label ?? '文件';
    const content = text(args.content);
    return {
      ...base, kind: 'write', category: 'file', titleZh: '写入 ' + label, titleEn: 'Wrote ' + label, targets,
      detail: { bytes: byteLength(content), lines: countLines(content), preview: redactSecrets(content, 320) },
    };
  }

  if (lower === 'edit') {
    const targets = targetsFrom(args, 'edit', cwd);
    const label = targets[0]?.label ?? '文件';
    const stats = diffStats(text(args.old_string), text(args.new_string));
    return {
      ...base, kind: 'edit', category: 'file', titleZh: '修改 ' + label, titleEn: 'Edited ' + label, targets,
      detail: { ...stats, replaceAll: args.replace_all === true },
    };
  }

  if (lower === 'read_image') {
    const targets = targetsFrom(args, 'view', cwd);
    const label = targets[0]?.label ?? '图片';
    return { ...base, kind: 'view', category: 'file', titleZh: '查看 ' + label, titleEn: 'Viewed ' + label, targets };
  }

  if (lower === 'glob') {
    const targets = targetsFrom(args, 'search', cwd);
    const pattern = oneLine(args.pattern ?? '*');
    return { ...base, kind: 'search', category: 'search', titleZh: '查找文件：' + pattern, titleEn: 'Found files: ' + pattern, targets, detail: { pattern } };
  }

  if (lower === 'grep') {
    const targets = targetsFrom(args, 'search', cwd);
    const pattern = oneLine(args.pattern ?? '');
    return { ...base, kind: 'search', category: 'search', titleZh: '搜索：' + pattern, titleEn: 'Searched: ' + pattern, targets, detail: { pattern } };
  }

  if (lower === 'bash') {
    const description = oneLine(args.description ?? '', 80);
    const command = text(args.command);
    const title = description || firstLine(command, 80) || '命令';
    const hasChinese = /[\u3400-\u9fff]/.test(description);
    return {
      ...base, kind: 'command', category: 'command',
      titleZh: hasChinese ? '运行：' + description : '运行命令',
      titleEn: 'Ran: ' + title,
      targets: [],
      detail: { command: redactSecrets(command, 1600), description },
    };
  }

  if (lower === 'present') {
    const files = Array.isArray(args.files) ? args.files : [];
    const targets = [];
    for (const file of files) {
      const path = typeof file === 'string' ? file : file?.path;
      const item = target(path, 'deliver', cwd);
      if (item !== null) targets.push(item);
    }
    const count = targets.length;
    return {
      ...base, kind: 'deliver', category: 'deliver',
      titleZh: count === 0 ? '交付文件' : '交付 ' + count + ' 个文件',
      titleEn: count === 0 ? 'Delivered files' : 'Delivered ' + count + ' file(s)',
      targets,
      detail: { files: files.map((file) => (typeof file === 'string' ? { path: file } : { path: file?.path, description: file?.description })) },
    };
  }

  if (lower === 'web_search') {
    const queries = Array.isArray(args.queries) ? args.queries.map((query) => text(query)).filter(Boolean) : [];
    return { ...base, kind: 'web', category: 'web', titleZh: '联网搜索' + (queries.length ? '：' + oneLine(queries[0], 48) : ''), titleEn: 'Searched the web', detail: { queries } };
  }

  if (lower === 'web_fetch') {
    let host = '';
    try { host = new URL(text(args.url)).hostname; } catch { host = ''; }
    return { ...base, kind: 'web', category: 'web', titleZh: '读取网页' + (host ? '：' + host : ''), titleEn: 'Fetched a web page', detail: { url: text(args.url) } };
  }

  if (lower === 'skill') {
    const skill = text(args.name ?? args.skill ?? '');
    return { ...base, kind: 'skill', category: 'skill', titleZh: '加载技能' + (skill ? '：' + skill : ''), titleEn: 'Loaded a skill', detail: { skill } };
  }

  if (lower === 'ask_user_question') {
    const questions = normalizeQuestions(args.questions);
    return { ...base, kind: 'ask', category: 'ask', titleZh: '向你确认 ' + questions.length + ' 个问题', titleEn: 'Asked ' + questions.length + ' question(s)', detail: { questions: questions.map((question) => oneLine(question, 120)) } };
  }

  if (lower === 'todo_write') {
    const todos = Array.isArray(args.todos) ? args.todos : [];
    return { ...base, kind: 'plan', category: 'plan', titleZh: '更新任务清单（' + todos.length + ' 项）', titleEn: 'Updated the task list', detail: { todos: todos.map((todo) => ({ text: oneLine(todo?.content ?? '', 100), status: todo?.status ?? '' })) } };
  }

  if (lower === 'job_output' || lower === 'job_kill') {
    return { ...base, kind: 'job', category: 'job', titleZh: lower === 'job_kill' ? '停止后台任务' : '查看后台任务', titleEn: lower === 'job_kill' ? 'Stopped a background job' : 'Checked a background job', detail: { jobId: text(args.job_id), reason: text(args.reason) } };
  }

  if (lower === 'prompt_ledger') {
    return { ...base, kind: 'ledger', category: 'tool', titleZh: '查询提示词账本', titleEn: 'Queried the prompt ledger', detail: { action: text(args.action) } };
  }

  if (lower.startsWith('mcp__') || lower.startsWith('mcp:') || lower.startsWith('mcp-')) {
    const human = humanizeMcp(toolName);
    const targets = targetsFrom(args, 'other', cwd);
    return { ...base, kind: 'mcp', category: 'mcp', titleZh: '调用 ' + human, titleEn: 'Called ' + human, targets, detail: { tool: toolName, action: text(args.action), projectId: text(args.projectId), sourcePath: text(args.sourcePath) } };
  }

  const targets = targetsFrom(args, 'other', cwd);
  return { ...base, kind: 'other', category: 'tool', titleZh: '调用 ' + toolName, titleEn: 'Called ' + toolName, targets, detail: { tool: toolName } };
}

const FILE_PRIORITY = { edit: 5, write: 4, deliver: 3, read: 2, view: 1, search: 0, other: 0 };

export function aggregateFiles(actions) {
  const files = new Map();
  for (const action of Array.isArray(actions) ? actions : []) {
    if (action === null || typeof action !== 'object' || action.hidden === true) continue;
    for (const item of Array.isArray(action.targets) ? action.targets : []) {
      const path = text(item?.path);
      if (path === '' || item?.temporary === true) continue;
      const current = files.get(path) ?? {
        path,
        label: text(item.label) || basename(path),
        action: item.action ?? action.kind,
        count: 0,
        lastAt: 0,
      };
      current.count += 1;
      if ((FILE_PRIORITY[item.action] ?? 0) >= (FILE_PRIORITY[current.action] ?? 0)) current.action = item.action ?? action.kind;
      current.lastAt = Math.max(current.lastAt, Number(action.startedAt ?? 0));
      files.set(path, current);
    }
  }
  return [...files.values()].sort((a, b) => (FILE_PRIORITY[b.action] ?? 0) - (FILE_PRIORITY[a.action] ?? 0) || b.lastAt - a.lastAt);
}

export function summarizeActions(actions) {
  const visible = (Array.isArray(actions) ? actions : []).filter((action) => action !== null && typeof action === 'object' && action.hidden !== true);
  const counts = { read: 0, write: 0, edit: 0, command: 0, search: 0, view: 0, deliver: 0, web: 0, skill: 0, mcp: 0, ask: 0, plan: 0, job: 0, other: 0 };
  let errors = 0;
  for (const action of visible) {
    if (action.kind in counts) counts[action.kind] += 1;
    if (action.status === 'error') errors += 1;
  }
  const files = aggregateFiles(visible);
  return {
    total: visible.length,
    files: files.length,
    errors,
    ...counts,
  };
}
