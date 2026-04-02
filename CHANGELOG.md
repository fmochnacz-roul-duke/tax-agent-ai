# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v0.11.0] — 2026-04-02 — Entity Registry

- `EntityRegistry.ts` — JSON-backed entity store with upsert semantics and audit trail
- `data/registry.json` persisted after every analysis (gitignored)
- `GET /registry` endpoint returns all past analyses
- Web UI: collapsible "Past Analyses" panel in right column, refreshes after each run
- 26 new unit tests — 169 total

## [v0.10.0] — 2026-04-02 — Substance Interview

- `SubstanceInterviewer.ts` — 5-question chat interview state machine (Art. 4a pkt 29 CIT)
- `SubstanceExtractor.ts` — TypeScript LLM extractor: DDQ text → SubstanceResult JSON
- Server: `interviewing` state; `/confirm` triggers interview before analysis
- Web UI: `interview_start / question / complete` response types with progress indicator

## [v0.9.0] — Legal Knowledge RAG

- Tax taxonomy for Polish WHT law (Art. 4a pkt 29, Art. 26, MLI Art. 7)
- `Chunker / Embedder / Retriever / LegalRagService` pipeline
- `consult_legal_sources` tool added to WHT agent
- `scripts/build-knowledge-base.ts` — one-shot RAG index builder

## [v0.8.0] — Conversational Web UI

- Express server with session management and SSE progress streaming
- `InputExtractor.ts` — LLM-based parameter extraction from free-form user text
- `src/public/index.html` — single-file dark-theme chat UI
- CLI and web UI share `runWhtAnalysis()` — no duplication

## [v0.7.0] — FactChecker Agent

- `FactCheckerAgent.ts` — Gemini REST API + Google Search grounding
- `fact_check_substance` tool added to WHT agent
- Triangulation rule: 2+ sources = VERIFIED; graceful simulation fallback

## [v0.6.0] — Python DDQ Extraction Service

- FastAPI microservice (`python/service/`) with `/substance` and `/dempe` endpoints
- Pydantic models mirror TypeScript interfaces; OpenAI structured outputs
- Graceful HTTP→simulation fallback when service is not running

## [v0.5.0] — MATE Improvements

- `LLM.fast()` / `LLM.powerful()` tier factories; `selectLlm()` in agent loop
- Environment-level parameter validation for all 8 tools

## [v0.4.0] — Substance Test & DEMPE

- Entity-aware substance profiles (Orange S.A., Alpine Holdings, unknown fallback)
- Three-condition BO test per Art. 4a pkt 29 CIT + MF Objaśnienia
- `analyse_dempe`, `check_directive_exemption`, `check_pay_and_refund` tools added
- `computeReportConfidence()` — LOW / MEDIUM / HIGH confidence in every report

## [v0.3.0] — Real Output

- `saveReport()` writes `reports/<slug>_<date>.json` on every exit path
- `parseFindings()` makes the report fully machine-readable

## [v0.2.0] — Real Input

- `AgentInput` interface + `validateInput()` + `buildTaskString()`
- `--input <file>` CLI flag; `data/orange_polska_royalty.json` real-world case

## [v0.1.0] — Live Treaty Data

- `data/treaties.json` — 36 countries, rates, MLI flags
- `data/poland_dtt_list.csv` — 91 Polish treaties with MLI cross-check
- `WhtEnvironment` live mode: `checkTreaty`, `getTreatyRate`, `checkMliPpt`
