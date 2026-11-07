import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('registers the sidebar, composer dock, turn footer and main panel', () => {
  const React = {
    createElement() {
      return {};
    },
    Fragment: Symbol('Fragment'),
    useState(value) {
      return [typeof value === 'function' ? value() : value, () => {}];
    },
    useEffect() {},
    useMemo(fn) {
      return fn();
    },
    useCallback(fn) {
      return fn;
    },
    useRef(value) {
      return { current: value };
    },
  };
  const registrations = [];
  const window = { __ModuleLoader__: { load(definition) { globalThis.__promptLedgerDefinition = definition; } } };
  globalThis.window = window;

  const source = readFileSync(join(ROOT, 'client.js'), 'utf8');
  const evaluate = new Function('window', 'require', source);
  evaluate(window, (id) => {
    if (id === 'react') return React;
    throw new Error(`unexpected require: ${id}`);
  });

  const definition = globalThis.__promptLedgerDefinition;
  assert.equal(definition.id, '@local/prompt-ledger');
  const ctx = {
    effect(fn) {
      fn();
      return () => {};
    },
    locale: {
      register() {
        return () => {};
      },
      bind() {
        return (key) => key;
      },
      subscribe() {
        return () => {};
      },
      getLocale() {
        return { active: 'en' };
      },
    },
    layout: { selectPanel() {} },
    slots: {
      inject(_name, fn) {
        fn();
      },
      register(meta) {
        registrations.push(meta);
        return () => {};
      },
    },
  };
  definition.factory((id) => {
    if (id === 'react') return React;
    throw new Error(`unexpected require: ${id}`);
  }).apply(ctx);

  assert.deepEqual(registrations.map((entry) => `${entry.name}:${entry.id ?? entry.key}`), [
    'sidebar.panellist:prompt-ledger',
    'conversation.input.dock:prompt-ledger',
    'conversation.chat.turnTail:prompt-ledger',
    'main:prompt-ledger',
  ]);
  delete globalThis.window;
});
