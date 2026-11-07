# Doubao Work adapter

豆包工作版 supports Skill-style instructions and, depending on the deployment,
local MCP tools. Add `adapters/mcp-server.mjs` as an MCP server (use
`adapters/trae/mcp.json` as the template) and load
`skills/prompt-ledger/SKILL.md`.

The capture rule is identical to every other platform: one `log_turn` after the
final answer, verbatim prompt and response, real token counts only, explicit
human ratings only. The MCP server writes the same local SQLite file as the DSH
panel, so Doubao turns appear in the same reports without a separate database.

If the edition cannot launch local MCP processes, use the local HTTP bridge or
the CLI importer. Do not send ledger data to a cloud database.
