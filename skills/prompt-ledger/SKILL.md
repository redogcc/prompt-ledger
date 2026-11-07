---
name: prompt-ledger
description: Archive every completed turn in the local Prompt Ledger so the user can review prompts, models, tokens, tools, Skills, MCP calls and five-star ratings. Use on ChatGPT, Codex, Work Buddy, Doubao Work, TRAE or any MCP-capable assistant that has the prompt-ledger MCP server installed.
---

# Prompt Ledger capture

The Prompt Ledger is a **local-only** SQLite archive. It is not a note-taking
suggestion: when this skill is active, capture is part of finishing a turn.

## Capture rule

After you have produced the final answer for a user turn, call `log_turn` once
before ending the turn. If the host already records the turn natively (for
example, DeepSeek Harness), do not duplicate it.

`log_turn` arguments:

- `platform`: `chatgpt`, `codex`, `workbuddy`, `doubao`, `trae`, or your host id.
- `prompt`: the user's complete prompt, verbatim. Do not summarize it.
- `response`: your final answer, verbatim. Do not replace it with "done".
- `model` / `provider`: exact identifiers when known.
- `status`: `completed`, `failed`, `aborted`, or `interrupted`.
- `input_tokens`, `output_tokens`, `total_tokens`: only values the host actually
  exposes. Never estimate or invent them.
- `duration_ms`: elapsed wall-clock time if known.
- `session_id` / `source_key`: stable ids from the host, used for idempotency.
- `tools`: every tool, Skill and MCP call, with `name`, `category`
  (`tool` / `skill` / `mcp`), `status` (`ok` / `error`), and an error string
  when it failed. Include enough of the arguments to make the turn reviewable,
  but do not paste secrets.
- `tags`: a few short labels that help later retrieval.
- `rating`: **only** when the user has explicitly given a 1–5 star rating in
  their message. Never rate your own answer.

If the MCP tool is unavailable or errors, continue the user's task normally and
mention the failure in one short sentence. Never block or delay the answer to
write the ledger.

## Reviewing

Use `search_turns` to find prior work by text, model, tool, platform or rating.
Use `get_turn` for the complete prompt/result and `stats` for model/tool
comparisons. Use `integrity` when the user asks whether the archive was altered;
the append-only SHA-256 chain and sealed snapshots are the evidence.

## Privacy

Never send ledger contents to a remote service. The MCP server writes only the
local SQLite file. Model review in the DSH panel is opt-in and is the only path
that sends turn text to a model provider.
