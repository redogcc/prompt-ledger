# Contributing

Thanks for improving Prompt Ledger.

## Requirements

- Node.js **22.5+** (the project uses the built-in `node:sqlite`).
- DeepSeek Harness 0.2.x for end-to-end plugin testing.
- No package dependencies are required for the plugin, ledger, MCP server or CLI.

## Local checks

```bash
npm test
npm run check
npm run pack:release
```

`npm test` covers SQLite capture, hash-chain integrity, append-only triggers, ratings, analytics, CSV export and client slot registration. `npm run check` validates JavaScript syntax, the bundle manifest, locales, icon and packaging hygiene.

## Editing rules

- Keep `ledger.js` dependency-free and usable by the DSH Host, MCP server and CLI.
- Do not write profile configuration directly; install through DSH's `plugin_manager`.
- Never add `fetch` calls to cloud services for archive data.
- Add visible text to both `ZH`/`EN` dictionaries in `client.js`; `npm run check` fails on missing keys.
- Preserve append-only tables and sealed-prompt triggers. New derived data belongs in new tables or evaluations, not updates to sealed rows.
- For UI, use `--dsw-alias-*` tokens, keep the surfaces non-blocking, and verify the composer dock and turn footer in both light and dark mode.

## Pull requests

1. Fork and create a topic branch.
2. Add a test for a behavioural change.
3. Run `npm test && npm run check`.
4. Describe the capture path affected (DSH native, MCP, CLI, HTTP, importer) and include a screenshot/GIF for UI changes.

Do not include personal database files, tokens, exported conversations, or absolute local paths.
