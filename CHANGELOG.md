# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] — 2026-11-22

### Added

- Output preview: image, video, PDF and text/code files can be previewed inside the panel; users can also open with the default app, reveal in Finder, or copy the path.
- Secure asset routes: only exact action targets already captured for the prompt can be read/opened; inline preview is capped at 64 MB, with a direct-open fallback for larger files.
- Evidence mapping for completed items: file links and path references in the model delivery note are matched to changed/output files, shown as clickable file chips under each item; unmatched items are explicitly marked as having no direct file mapping.

### Changed

- Completed items now connect semantic results to concrete files instead of leaving both as separate sections.

## [1.1.0] — 2026-11-22

### Added

- **Action trace（行动轨迹）**: captures nested `run_code` / PTC tool calls (`tool/ptc-dispatch-start` / `tool/ptc-dispatch`) as first-class actions, derives plain-language read / write / edit / command / search / deliver / MCP summaries, aggregates affected files, and adds a per-turn “这次做了什么” panel with key actions, file chips, filters and expandable evidence.
- Added `action_events` storage, `actions.js` derivation helpers, `recordActionStart` / `recordActionResult`, and regression tests for action derivation, aggregation and ledger capture.
- Added **historical Session backfill**: replay durable `tool/ptc-dispatch-start` / `tool/ptc-dispatch` events into sealed prompts with callId-level idempotency, plus a `POST /api/prompt-ledger/actions/backfill` endpoint.
- Added the **Action map** tab: session selector, 4-phase summary (see / change / run / deliver), session file filter, turn-by-turn cards and a “补齐历史” action.
- Added a graceful host-upgrade state for the Outcomes tab: when the running Host lacks the new session API, show restart steps instead of an HTTP 404 and an empty session selector.
- Added **完成事项 (completed items)**: extracts 2–4 semantic result items from the model delivery note’s section headings, then pairs them with verified outputs, project changes and checks.
- write-created documents/code/assets now count as outputs, with present files marked delivered and new files marked created.

### Fixed

- Load the plugin stylesheet once at plugin startup instead of only when the full ledger panel mounts. The composer dock and per-turn footer previously rendered as unstyled native buttons until the main panel had been opened.

### Changed

- Reworked the action output from a log into an outcome-first result card: model delivery note, deliverables, project-level changes with `+/-` churn, verification results and a collapsed process/evidence timeline.
- Reworked the session page into an outcome map: outputs gallery, files/checks/turn metrics, and turn cards that show what each turn produced instead of raw tool calls.
- Outcome cards now prioritize a model delivery note and completed items, then outputs, project-level churn and real checks; the full action timeline is collapsed as evidence.
- Replaced the floating composer capsule with a 26px composer status line aligned to the chat column: icon, session scope, tokens and human average; the expanded session card keeps the token headline, cache meter, three drill-down stats, rating row and integrity footer.
- Removed the 10-second first-run auto-expand. A one-time dot on the status-line icon now marks the first visit, and the card only opens on demand.
- Redesigned the per-turn footer into a 12px ledger rail with a consistent icon tile, status dot, model/tool metadata, auto-score chip, 14px five-star control and a quiet review link. The per-turn token count moved to the session status line and review detail, so it no longer duplicates the host usage pill.
- Added an adaptive data-text mix for secondary numbers so light-theme labels keep readable contrast while dark-theme stays quiet.
- Aligned both surfaces with the host chat typography, hover tokens, focus rings and light/dark theme surfaces.

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
