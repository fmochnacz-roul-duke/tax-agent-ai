# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v0.18.0] — 2026-04-02 — Phase 15: QA-3 Evals + Negative Tests

### Machine-readable BO verdict
- **`BoOverall` type** exported from `BeneficialOwnerAgent.ts`: `'CONFIRMED' | 'UNCERTAIN' | 'REJECTED' | 'NO_TREATY'`
- **`bo_overall: BoOverall`** added to `WhtReport` — deterministic derivation, never parsed from LLM free text
- **`conduit_risk: boolean`** added to `WhtReport` — `true` when REJECTED + entity/country indicates conduit structure
- **`computeBoOverall()`** — decision order: NO_TREATY → LOW confidence → substance FAIL/PASS → UNCERTAIN fallback
- **`computeConduitRisk()`** — checks 16-country `KNOWN_ROUTING_JURISDICTIONS` set OR `entity_type` in `['holding_company', 'shell_company', 'unknown']`; no LLM judgment

### EntityRegistry: force-draft on REJECTED
- `AnalysisReport.bo_overall?: string` added — `WhtReport` satisfies it via structural typing
- `save()` resets `review_status` to `'draft'` when incoming `bo_overall === 'REJECTED'`; previously signed-off entries are cleared — a REJECTED verdict may reflect a conduit structure requiring human look-through

### Golden dataset — `data/golden_cases/` (9 cases)
- `case_01`: Orange S.A. — France — Royalty — CONFIRMED (10% rate, real substance)
- `case_02`: Alpine Holdings — Luxembourg — Dividend — UNCERTAIN (MLI PPT + thin holding)
- `case_03`: IP GmbH — Germany — Royalty — CONFIRMED (EU I&R Directive 0%, fallback treaty 5%)
- `case_04`: TechFinance B.V. — Netherlands — Interest — UNCERTAIN (MLI PPT + back-to-back loan)
- `case_05`: XTB Malta Ltd — Malta — Royalty — REJECTED (MLI PPT + EXISTING_ANTIABUSE + zero substance)
- `case_06`: HK Royalties Ltd — Hong Kong — Royalty — NO_TREATY (domestic 20%)
- `case_07`: SPV Ireland Ltd — Ireland — Interest — UNCERTAIN (EU Directive vs. thin substance conflict)
- `case_08a`: Cyprus IP SPV — Cyprus — Royalty — REJECTED (conduit leg 1; `conduit_risk: true`)
- `case_08b`: Canada Tech Corp — Canada — Royalty — CONFIRMED (conduit leg 2; ultimate BO qualifies at 10%)

### Eval harness
- **`scripts/runEvals.ts`** + **`npm run eval`** — Triangulation Rule: fails if `bo_overall` OR applied rate is wrong; `conduit_risk` check on cases that specify it; exits with code 1 for CI

### Negative tests (8 new in `WhtEnvironment.test.ts`)
- Hong Kong returns `treaty_in_force: false` (no PL-HK treaty)
- `getTreatyRate` for Hong Kong returns an error (no rate to look up)
- Brazil is now a treaty country (`treaty_in_force: true`, `mli_ppt_applies: 'NO'`)
- Brazil royalty rate is 10% with trademark exception documented in `verification_note`
- Brazil interest rate is 15% with bank-loan exception in `verification_note`
- France royalty rate is 10% — not 5% (hallucination guard)
- Malta MLI PPT is YES (refutes "no MLI" assumption)
- Invalid `income_type` and out-of-range `shareholding_percentage` return structured errors

### Treaty data
- **Brazil added to `treaties.json`** — PL-BR DTC (2022); in force 01.01.2026; `mli_ppt_applies: 'NO'` (treaty post-MLI deposit window); rates verified via Tax@Hand/Deloitte Aug 2025: dividend 10%/15%, interest 15% (10% bank-loan exception), royalty 10% (15% trademark exception)
- SHA-256 snapshot updated

### Tests
- 33 new tests — 284/284 passing

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
