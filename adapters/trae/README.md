# TRAE adapter

TRAE supports MCP servers natively. Add `mcp.json` to the project (or merge its
`mcpServers` entry into TRAE's MCP settings), replacing the absolute plugin path
and `PROMPT_LEDGER_DB` with this machine's values. Then enable the
`prompt-ledger` server and attach `skills/prompt-ledger/SKILL.md` as a project
Skill.

TRAE does not expose a durable turn hook to third-party plugins, so capture is
Skill-driven: the assistant calls `log_turn` after the final answer. The same
MCP server also exposes `rate_turn`, `search_turns`, `get_turn`, `stats`,
`integrity` and `export`.

The server opens the same SQLite file as the DSH plugin. If TRAE runs as a
different OS user, grant that user read/write access to the `.dsh` directory.
