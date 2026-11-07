# Codex adapter

Codex has two complementary paths:

1. **MCP capture** — add the server to `~/.codex/config.toml`:

   ```toml
   [mcp_servers.prompt-ledger]
   command = "node"
   args = ["/ABSOLUTE/PATH/TO/prompt-ledger/adapters/mcp-server.mjs"]
   env = { PROMPT_LEDGER_DB = "/Users/YOU/.dsh/prompt-ledger/prompt-ledger.sqlite3" }
   ```

   Then add `skills/prompt-ledger/SKILL.md` (or the capture paragraph from it)
   to `AGENTS.md` so Codex calls `log_turn` at the end of a turn.

2. **Session sync** — Codex already writes JSONL rollouts under
   `~/.codex/sessions`. Backfill or periodically sync them:

   ```bash
   node adapters/codex/sync.mjs
   node adapters/codex/sync.mjs --dry-run
   ```

   The sync reads `response_item` messages, optional `token_count` usage,
   `turn_context` model changes, and function call/output pairs. Unknown event
   types are ignored, so Codex updates do not break the importer. Re-running is
   idempotent through stable session/turn keys.

Codex rollouts are local files; the importer never uploads them.
