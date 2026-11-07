# Work Buddy adapter

Work Buddy accepts a Skill plus an MCP server. Install the MCP entry from
`adapters/trae/mcp.json` (the schema is the same) with an absolute path to
`adapters/mcp-server.mjs`, then load `skills/prompt-ledger/SKILL.md`.

The Skill is the capture trigger: after every final answer it calls `log_turn`
with the verbatim prompt, response, model, token counts and tools. Ratings stay
human-only. If Work Buddy exposes host ids, pass them as `session_id` and
`source_key` so retries are idempotent.

For a hosted Work Buddy that cannot launch a local process, use the local HTTP
bridge instead: `POST /prompt-ledger/v1/ingest` with the token shown in the DSH
panel's Connect tab, or import a JSONL/JSON export through `adapters/cli.mjs`.
