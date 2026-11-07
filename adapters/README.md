# Cross-platform adapters

Every adapter writes the same local SQLite file (`PROMPT_LEDGER_DB`, default
`$DSH_HOME/prompt-ledger/prompt-ledger.sqlite3`). One archive, one rubric, one
report; only the capture entry point differs.

| Platform | Capture path | Rating path | Notes |
| --- | --- | --- | --- |
| DeepSeek Harness | Native Host listener on the durable session log | Sidebar panel | Zero configuration; captures prompts, model, tokens, tools, Skills, MCP and turn outcome |
| ChatGPT | Custom GPT Action (`chatgpt/openapi.yaml`) or `chatgpt/import.mjs` | Sidebar panel / CLI | Hosted ChatGPT cannot write local files; use an HTTPS tunnel or export import |
| Codex | MCP `log_turn` + `codex/sync.mjs` rollout sync | Sidebar panel / CLI / MCP `rate_turn` | MCP server and importer share the DB |
| Work Buddy | Skill + MCP server | Sidebar panel / CLI | Hosted editions can use the local HTTP bridge |
| Doubao Work | Skill + MCP server | Sidebar panel / CLI | Same MCP schema as Work Buddy |
| TRAE | Native MCP (`trae/mcp.json`) | Sidebar panel / CLI / MCP `rate_turn` | Skill-driven capture because no durable plugin hook is exposed |
| Generic | `cli.mjs ingest`, `post.mjs`, or MCP | CLI / HTTP | Normalized JSON contract below |

## Normalized ingest contract

```json
{
  "platform": "trae",
  "prompt": "verbatim user prompt",
  "response": "verbatim final answer",
  "model": "model-id",
  "provider": "provider-id",
  "status": "completed",
  "input_tokens": 1200,
  "output_tokens": 400,
  "total_tokens": 1600,
  "duration_ms": 8300,
  "session_id": "optional",
  "source_key": "stable-idempotency-key",
  "tools": [
    { "name": "read", "category": "tool", "status": "ok", "arguments": "..." },
    { "name": "frontend-design", "category": "skill", "status": "ok" },
    { "name": "mcp__search", "category": "mcp", "status": "error", "error": "timeout" }
  ],
  "tags": ["landing-page"],
  "rating": { "stars": 5, "note": "only when the human gave it" }
}
```

## Why not a cloud sync service

The requirement is local, low-intrusion persistence. A shared SQLite file in WAL
mode is enough for the desktop processes involved and keeps the privacy story
simple: no account, no upload, no third-party archive. The optional model review
is the only outbound path and is explicitly opt-in in the DSH panel.
