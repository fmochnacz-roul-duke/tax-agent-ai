# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v0.17.0] — 2026-04-02 — Phase 14: Ghost Activation

- **`TreatyVerifierAgent` wired into live agent flow** (`WhtEnvironment.ts`, `BeneficialOwnerAgent.ts`)
  - `WhtEnvironment` now instantiates `TreatyVerifierAgent` alongside `FactCheckerAgent` (same simulate flag, same self-degradation when `GEMINI_API_KEY` is absent)
  - New `verifyTreatyRate()` method on `WhtEnvironment` — thin wrapper around `TreatyVerifierAgent.verifyRate()`
  - `case 'get_treaty_rate'` in the agent loop calls `verifyTreatyRate()` after the lookup and merges `treaty_verification_status` and `treaty_verification_note` into the `wht_rate` finding
- **`last_verified` surfaced in `consult_legal_sources` results**
  - `Retriever.search()` now forwards `last_verified` from `Chunk` to `CitedChunk` (was silently dropped before)
  - `consultLegalSources()` in `WhtEnvironment` includes `last_verified` in each chunk object when present; absent when the source has not been reviewed
- **Confidence drops to LOW on rate mismatch**
  - `computeReportConfidence()` checks `wht_rate.treaty_verification_status === 'DIFFERS'` before all other checks → `'LOW'`; `NOT_FOUND` (simulate fallback) is neutral
- **5 new tests** — 251/251 passing
  - `computeReportConfidence: LOW when wht_rate has treaty_verification_status DIFFERS`
  - `computeReportConfidence: NOT_FOUND verification status does NOT lower confidence`
  - `consultLegalSources: last_verified is included in chunk output when set`
  - `consultLegalSources: last_verified is absent from output when not set on chunk`
  - `verifyTreatyRate: simulate mode returns NOT_FOUND without API call`

## [v0.16.0] — 2026-04-02 — DOCS-2: last_verified frontmatter

- `last_verified?: string` added to `SourceFrontmatter` and `Chunk` interfaces (`src/rag/types.ts`)
- `parseFmFields()` in `Chunker.ts` parses and propagates the field into every chunk
- `MF-OBJ-2025.md` and `PL-CIT-2026-WHT.md` frontmatter updated: `last_verified: 2026-04-02`
- `TEMPLATE.md` documents the field with usage guidance
- `CitedChunk` inherits `last_verified` automatically via `Omit<Chunk, 'char_count'>`
- 246/246 tests passing — no regressions

## [v0.15.0] — 2026-04-02 — QA-2: Zod validation + Python/TS contract tests

### Zod runtime validation (Part 1)
- `AgentInputSchema` (Zod v4) replaces hand-written `validateInput()` and the `interface AgentInput`
- `AgentInput` type is now `z.infer<typeof AgentInputSchema>` — single source of truth, no drift
- `AgentInputSchema.parse()` reports all invalid fields at once (not first-error-only)
- 17 new tests for the Zod path — all validation cases, boundary values, multi-field errors

### Python/TypeScript contract tests (Part 2)
- `src/agents/contracts.ts` — `SubstanceResultSchema` + `DempeResultSchema` (Zod v4 schemas)
  - `DempeResult` type defined in TypeScript for the first time (previously only existed in Python)
- `python/service/export_schemas.py` — generates `python/service/contract.json` from Pydantic `model_json_schema()`
- `npm run test:contract:update` — regenerates snapshot after intentional Pydantic model changes
- `src/agents/contract.test.ts` — 13 tests in two categories:
  - Category A: WhtEnvironment simulation output validates against Zod schemas (3 substance + 3 DEMPE)
  - Category B: Python `required[]` field names and enum values match TypeScript schema (7 tests)
- 246/246 tests passing

## [v0.14.0] — 2026-04-02 — QA-1: Linting, coverage, snapshot test

- `eslint.config.js` — ESLint 10 flat config; `@typescript-eslint/flat/recommended`; `no-explicit-any: error`; `no-console: off`; `eslint-config-prettier` last
- `.prettierrc.json` — single quotes, trailing commas (es5), 100-char line width
- `npm run lint` — ESLint + Prettier check in one command; all 39 TS files formatted
- `.c8rc.json` + `npm run test:coverage` — V8 coverage via c8; text + lcov reporters; all source files included
- `npm test` now prefixed with `tsc --noEmit &&` — type errors block the test run
- `src/agents/treaties.snapshot.test.ts` — SHA-256 hash of `treaties.json`; clear recovery instructions on mismatch
- `scripts/updateTreatySnapshot.ts` + `npm run test:snapshot:update` — recomputes and patches the hash
- 216/216 tests passing

## [v0.13.0] — 2026-04-02 — Phase 13: Provenance/Citations on WhtReport

- `Citation` interface — tracks tool name, source, finding_key, section_ref, source_id, chunk_count, top_score
- `FINDING_KEY_FOR_TOOL` map — maps each tool to its memory key (or `undefined` for RAG)
- `extractCitation(toolName, result)` — parses tool result JSON and extracts citation metadata
- `computeReportConfidence(findings, citations)` — extended with RAG legal grounding gate:
  `consult_legal_sources` must return ≥2 chunks with top_score ≥0.55 for HIGH confidence
- `hasRagLegalGrounding(citations)` — helper function for the RAG threshold check
- `WhtReport.citations: Citation[]` — one entry per executed tool call, in order
- `buildReport` / `saveReport` — accept and include `citations`
- `require.main === module` guard on `main()` — fixes import side-effect (tests can import the module)
- `src/agents/BeneficialOwnerAgent.test.ts` — 19 tests: LOW/MEDIUM/HIGH confidence paths,
  FactChecker interaction, exact threshold tests, `parseFindings` edge cases
- 215/215 tests passing

## [v0.12b.0] — 2026-04-02 — Phase 12b: Human Review Workflow

- `EntityRegistry.ts` — extended `RegistryEntry` with `reviewer_note?`, `reviewed_at?`, `reviewed_by?`
- `EntityRegistry.updateReviewStatus()` — changes `review_status` to `reviewed` or `signed_off`
- `GET /registry/entry` endpoint — fetch a single registry entry by entity + country
- `POST /registry/review` endpoint — update review status programmatically
- `scripts/listUnreviewed.ts` — CLI: lists all draft entries pending professional review
- `npm run review:list`
- Web UI: review drawer with reviewer name input, note textarea, "Mark Reviewed" / "Sign Off" / "Reset to Draft" buttons; panel refreshes after action
- 12 new unit tests for `updateReviewStatus` — 196/196 total

## [v0.12a.0] — 2026-04-02 — Phase 12a: TreatyVerifierAgent

- `src/agents/TreatyVerifierAgent.ts` — `verifyRate(country, incomeType, claimedRate, treatyArticle)` → `TreatyRateVerification`
  - Uses Gemini REST API + Google Search grounding
  - Status: `CONFIRMED` | `DIFFERS` | `NOT_FOUND`
  - Graceful fallback to simulation if `GEMINI_API_KEY` absent
- `verified_at?`, `verified_sources?`, `verification_note?` added to `DividendRate` and `FlatRate` interfaces
- `scripts/verifyTreaties.ts` — batch script: loops 36 countries × 3 income types, writes results to `treaties.json`
- `npm run verify:treaties`
- 15 new simulate-mode tests — TreatyVerifierAgent

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
