#!/usr/bin/env node
/**
 * Import a ChatGPT data export (conversations.json) into the local ledger.
 *
 *   node adapters/chatgpt/import.mjs conversations.json
 *
 * The importer is deliberately tolerant: ChatGPT's export schema has changed
 * several times. It walks `mapping`, keeps user/assistant messages in creation
 * order, groups each user message with the assistant replies that follow it,
 * and preserves message ids as idempotency keys.
 */

import { readFile } from 'node:fs/promises';
import { openLedger } from '../../ledger.js';

function textOf(content) {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content.parts)) return content.parts.filter((part) => typeof part === 'string').join('\n');
  if (Array.isArray(content.text)) return content.text.join('\n');
  if (typeof content.text === 'string') return content.text;
  return '';
}

function nodesOf(conversation) {
  const mapping = conversation?.mapping;
  if (mapping === null || typeof mapping !== 'object') return [];
  const nodes = Object.values(mapping)
    .map((node) => node?.message)
    .filter((message) => message !== null && message !== undefined);
  return nodes.sort((left, right) => {
    const a = Number(left?.create_time ?? 0);
    const b = Number(right?.create_time ?? 0);
    if (a !== b) return a - b;
    return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
  });
}

function modelOf(conversation, message) {
  return message?.metadata?.model_slug
    ?? message?.metadata?.model
    ?? conversation?.default_model_slug
    ?? 'chatgpt';
}

function groupTurns(conversation) {
  const turns = [];
  let current = null;
  for (const message of nodesOf(conversation)) {
    const role = message?.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = textOf(message.content).trim();
    if (text === '') continue;
    if (role === 'user') {
      if (current !== null) turns.push(current);
      current = {
        user: message,
        prompt: text,
        replies: [],
        model: modelOf(conversation, message),
        startedAt: Number(message.create_time ?? 0) * 1000,
        completedAt: Number(message.create_time ?? 0) * 1000,
      };
    } else if (current !== null) {
      current.replies.push(text);
      current.completedAt = Number(message.create_time ?? 0) * 1000;
      current.model = modelOf(conversation, message) ?? current.model;
    }
  }
  if (current !== null) turns.push(current);
  return turns;
}

const file = process.argv[2];
if (file === undefined) {
  console.error('usage: node adapters/chatgpt/import.mjs conversations.json');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(await readFile(file, 'utf8'));
} catch (error) {
  console.error(`prompt-ledger: could not read ${file}: ${error.message}`);
  process.exit(1);
}
const conversations = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.conversations) ? parsed.conversations : [];
if (conversations.length === 0) {
  console.error('prompt-ledger: no conversations found in export');
  process.exit(1);
}

const ledger = openLedger();
let imported = 0;
let duplicates = 0;
let skipped = 0;
try {
  for (const conversation of conversations) {
    const conversationId = conversation?.id ?? conversation?.conversation_id ?? 'unknown';
    for (const turn of groupTurns(conversation)) {
      if (turn.prompt === '') {
        skipped += 1;
        continue;
      }
      const result = ledger.ingest({
        platform: 'chatgpt',
        provider: 'openai',
        sessionId: conversationId,
        prompt: turn.prompt,
        response: turn.replies.join('\n\n'),
        model: turn.model,
        status: 'completed',
        startedAt: turn.startedAt || undefined,
        completedAt: turn.completedAt || undefined,
        sourceKey: `${conversationId}:${turn.user?.id ?? turn.user?.message_id ?? turn.prompt.slice(0, 24)}`,
        metadata: {
          title: conversation?.title ?? null,
          importer: 'chatgpt-export',
        },
        tags: conversation?.title ? [String(conversation.title).slice(0, 24)] : [],
      });
      if (result.duplicate === true) duplicates += 1;
      else imported += 1;
    }
  }
  console.log(JSON.stringify({ ok: true, conversations: conversations.length, imported, duplicates, skipped }, null, 2));
} finally {
  ledger.close();
}
