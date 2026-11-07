# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-07

### Added

- Native DeepSeek Harness plugin with a left-sidebar entry and four-tab management panel.
- Automatic capture from the durable Session log: prompts, submissions, model/provider, token usage, tool/Skill/MCP calls, outcome, errors and latency.
- Local SQLite archive with WAL mode, append-only triggers, a global SHA-256 event chain and sealed prompt snapshots.
- Five-star human rating, notes, tags, favourites and filtering.
- Configurable rubric, deterministic local evaluation and optional model-judge evaluation.
- Cross-analysis by model, tool, Skill, MCP, platform and model+tool combination; auto-vs-human calibration.
- CSV/JSON export with time/platform/model/tool/rating/keyword filters.
- Centered, collapsible Prompt Ledger dashboard above the composer; six core modules with first-open auto-expand.
- Lightweight per-turn footer row with status, model, tokens, tools, auto score, five-star rating and a deep link into the ledger.
- MCP stdio server, CLI, HTTP bridge, ChatGPT Action/import adapter, Codex rollout sync, and TRAE/Work Buddy/Doubao integration guides.
- Release packaging, validation scripts and GitHub Actions CI.
