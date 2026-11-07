# Security and privacy

Prompt Ledger is designed as a local-first archive.

## Data location

By default the database is:

```
$DSH_HOME/prompt-ledger/prompt-ledger.sqlite3
```

Override it with `PROMPT_LEDGER_DB=/absolute/path.sqlite3`. The database stores full prompts, final answers, tool arguments/results (truncated for very large payloads), ratings and evaluation notes.

## Network boundaries

- DSH session capture, ratings, reports and exports are local.
- The local ingest endpoint is `POST /prompt-ledger/v1/ingest` on the Host Web listener. It requires an `x-prompt-ledger-token` generated per database. Treat the token like a write password.
- `adapters/mcp-server.mjs`, `adapters/cli.mjs` and importers write the SQLite file directly; they do not upload data.
- Model review is **opt-in**. When enabled, the turn text is sent to the model provider already configured in DSH, and it incurs model tokens.

## Tamper evidence

SQLite triggers reject UPDATE/DELETE on sealed prompts, submissions, events, annotations, evaluations and rubric versions. `integrity()` additionally replays the SHA-256 chain and checks sealed snapshots. This detects application-level or SQL-level tampering; it is not protection against an attacker with full filesystem control.

## Reporting

Please open a private security advisory on the repository rather than a public issue for:

- token exposure,
- unintended network transmission,
- SQLite trigger bypass,
- remote code execution through importers.

Include the affected version, platform and a minimal reproduction. Do not attach real conversation archives or tokens.
