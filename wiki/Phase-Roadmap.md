# Phase Roadmap

Each phase corresponds to a git tag. Completed phases are available as GitHub Releases.

---

## Completed phases

### v0.1.0 — Phase 1: Live treaty data

**What:** Replaced hardcoded treaty stubs with a live lookup from `data/treaties.json`. 36 countries (EU27 + UK, Switzerland, Norway, USA, Canada, Japan, Singapore, UAE, Australia, India). Each entry has treaty metadata, MLI flags, and rates for dividend/interest/royalty.

**Key decisions:**
- ALIASES map + `normalise()` helper handles UK/USA/Czechia/Holland variants
- VERIFY MLI status → conservative `mli_applies: false` with caution message (not VERIFY = NO, not VERIFY = YES)
- All rates marked `verified: false` — populated from commentary, not PDFs

---

### v0.3.0 — Phase 2+3: Structured input and report output

**What:**
- Phase 2: `AgentInput` interface with `validateInput()`. Reads `--input <file>` from CLI. Three new tools: `analyse_dempe`, `check_directive_exemption`, `check_pay_and_refund`.
- Phase 3: `resolveOutputPath()` auto-generates `reports/<slug>_<date>.json`. `parseFindings()` converts tool result strings back to objects for the report.

**Key decisions:**
- Report saved on both `terminate` (full answer) and `maxIterations` (partial, `incomplete: true`)
- `reports/` gitignored

### v0.3.1 — Phase 2+3 fixes

**What:** Seven agent loop fixes that reduced 12 looping iterations to 5 clean iterations on the Orange S.A. test case:
- Duplicate tool call guard
- `buildFindingsSummary()` prefix changed to `ESTABLISHED FINDINGS — do not repeat`
- `maxIterations` raised 12 → 20
- Shareholding always included in task string

---

### v0.4.0 — Phase 4: Entity substance profiles and 3-condition BO test

**What:**
- `buildEntityProfile()` — entity-aware simulation: Orange S.A. → STRONG, Alpine Holdings → WEAK, unknown → CONDUIT
- `SubstanceResult` structure: 6 `substance_factors`, 4 `conduit_indicators`, `substance_tier`, `bo_preliminary` (per condition + overall), `confidence`
- `computeReportConfidence()` — derives LOW/MEDIUM/HIGH from findings

**Key decisions:**
- 3-condition test (i/ii/iii) implemented as per Art. 4a pkt 29 CIT
- CONDUIT fallback for unknown entities — "cannot confirm" > wrong answer

---

### v0.5.0 — Phase 5: MATE improvements

**What:**
- `LLM.fast()` / `LLM.powerful()` tier factories
- `OPENAI_MODEL_FAST` / `OPENAI_MODEL_POWERFUL` env vars
- `selectLlm()` in agent loop: upgrades from fast to powerful on fact-check confirmation
- Environment-level parameter validation for all 8 tools

---

### v0.6.0 — Phase 6: Python DDQ extraction service

**What:**
- FastAPI microservice (`python/service/`) with `POST /substance` and `POST /dempe`
- OpenAI structured outputs with Pydantic `response_format` — schema-guaranteed results
- TypeScript `WhtEnvironment` calls service via HTTP; falls back to simulation if unavailable
- Sample DDQ: `data/ddqs/orange_sa_ddq.txt` — 10 sections, all substance factors

**Key decisions:**
- Service is optional — `DDQ_SERVICE_URL` not set → simulation, no error
- Additive and backward-compatible

---

### v0.7.0 — Phase 7: FactChecker Agent

**What:**
- `FactCheckerAgent.ts` — Gemini REST API + `google_search` tool
- `verify(entityName, country, claims[]) → FactCheckResult`
- Triangulation rule: 2+ web sources = VERIFIED, 1 = UNVERIFIED, 0 = CONTRADICTED
- `fact_check_substance` tool added to WHT agent
- Multi-agent pattern: WHT Agent (OpenAI) calls FactCheckerAgent (Gemini) as a sub-agent

**Key decisions:**
- 3-strategy JSON extraction: raw → markdown fence → first-to-last brace
- Only useful for publicly-listed entities with public data — not for most holding companies
- `GEMINI_API_KEY` absent → simulation fallback, no error

---

### v0.8.0 — Phase 8: Conversational web UI

**What:**
- Express.js server replacing the two-terminal workflow
- `InputExtractor.ts` — free-text → `AgentInput` via fast model + `json_object` mode
- SSE streaming of agent events to browser
- Single-file chat UI (`src/public/index.html`) — dark monospace, chat bubbles, live agent log
- `runWhtAnalysis()` as the single exported entry point for both CLI and server

**Key decisions:**
- In-memory session store (Map) — sufficient for dev; Redis needed for multi-user production
- SSE is additive to console.log (backward-compatible)
- CLI (`npm run tax:agent`) unchanged

---

### v0.9.0 — Phase 9: Legal knowledge RAG

**What:**
- Tax taxonomy (`data/tax_taxonomy.json`) — 40 controlled concepts with Polish/English terms and RAG keywords
- RAG infrastructure — `Chunker`, `Embedder`, `Retriever`, `LegalRagService`
- Source `.md` files: `MF-OBJ-2025.md` (14 chunks) and `PL-CIT-2026-WHT.md` (9 chunks)
- `consult_legal_sources` tool — agent retrieves statutory text before final BO determination; goal priority 2
- RAG results flow as reasoning context; citations appear in the final answer
- `npm run rag:build` — embeds 23 chunks using `text-embedding-3-small`; incremental rebuild via SHA-256 manifest

**Key decisions:**
- Knowledge base = authoritative sources only (CIT Act, MF Objaśnienia). Academic commentary deliberately excluded — not legislation.
- `vectors.json` gitignored (905 KB generated file); `chunks/index.json` and `manifest.json` tracked
- RAG results not stored as findings — citations appear in the final answer text

---

### v0.10.0 — Phase 10: Substance interview

**What:**
- `SubstanceInterviewer.ts` — 5-question Mode A interview state machine
- `SubstanceExtractor.ts` — TypeScript LLM extractor: DDQ text → SubstanceResult (no Python needed)
- `WhtEnvironment.checkEntitySubstance` — 3-tier fallback: Python service → TS extractor → simulation
- Server `interviewing` state — `/confirm` triggers interview, `/message` routes answers

**Key decisions:**
- Phase 10 closes the data-entry gap: any entity can now be assessed without a DDQ file
- The interview replaces DDQ upload as the primary substance data entry path for basic use
- TypeScript extractor as fallback means Python service is no longer required for basic use

---

### v0.11.0 — Phase 11: Entity Registry

**What:**
- `EntityRegistry.ts` — JSON-backed registry; persists to `data/registry.json` (gitignored)
- Upsert semantics: re-running for the same entity updates the entry but preserves `created_at` and `review_status`
- Lookup key: `entity_name::country` (lowercased) — case-insensitive
- `GET /registry` endpoint — returns all entries as JSON, newest-first
- "Past Analyses" collapsible panel in the web UI right column

**Key decisions:**
- JSON (not SQLite) — zero new dependencies, human-readable, sufficient for 1–3 analysts
- `review_status` preserved on upsert — a professional's sign-off survives re-analysis
- `data/registry.json` gitignored — runtime artifact, not source code

---

### v0.12a.0 — Phase 12a: TreatyVerifierAgent

**What:**
- `TreatyVerifierAgent.ts` — `verifyRate()` via Gemini REST API + Google Search
- `TreatyRateVerification` type: `{ verified: boolean, confidence: string, note: string, sources: [] }`
- `scripts/verifyTreaties.ts` — batch runner; `npm run verify:treaties`
- `verified_at?`, `verified_sources?`, `verification_note?` added to rate interfaces in `WhtEnvironment.ts`
- 15 simulate-mode tests

**Key decisions:**
- Batch script works and is correct; NOT yet wired into the live agent flow (Phase 14 does this)
- All 36 treaty rates remain `verified: false` until Phase 14 + Phase 20

---

### v0.12b.0 — Phase 12b: Human review workflow

**What:**
- `EntityRegistry.updateReviewStatus()` — `review_status: draft | reviewed | signed_off`
- `GET /registry/entry` + `POST /registry/review` endpoints
- `scripts/listUnreviewed.ts` + `npm run review:list`
- Web UI review drawer with reviewer name, note, and action buttons
- 12 new tests

---

### v0.13.0 — Phase 13: Provenance and citations

**What:**
- `Citation` interface — tool, source, finding_key, section_ref, source_id, chunk_count, top_score
- `FINDING_KEY_FOR_TOOL` map + `extractCitation()` + `hasRagLegalGrounding()`
- `computeReportConfidence(findings, citations)` — RAG legal grounding gate: ≥2 chunks, top_score ≥0.55 required for HIGH
- `WhtReport.citations: Citation[]`
- `require.main === module` guard on `main()`
- 19 new tests

---

### v0.14.0 — QA-1: Lint, coverage, snapshot

**What:**
- `eslint.config.js` — flat config, `@typescript-eslint/flat/recommended`, `no-explicit-any: error`
- `.prettierrc.json` — single quotes, trailing commas, 100-char line width
- `npm run lint` — ESLint + Prettier check in one command
- `.c8rc.json` + `npm run test:coverage` — V8 coverage, text + lcov
- `tsc --noEmit &&` prefix on `npm test` — type errors block test run
- `treaties.snapshot.test.ts` — SHA-256 hash guard for treaties.json

---

### v0.15.0 — QA-2: Zod validation and contract tests

**What:**
- `AgentInputSchema` (Zod v4) — single source of truth for shape + validation; `AgentInput` type derived via `z.infer<>`
- `src/agents/contracts.ts` — `SubstanceResultSchema` + `DempeResultSchema` (Zod v4)
- `python/service/export_schemas.py` → `contract.json` snapshot (Python/TS contract parity test)
- `src/agents/contract.test.ts` — 13 tests (simulation output vs. Zod; Python vs. TypeScript schemas)

---

### DOCS-1 + GITHUB-1

**What:**
- `CHANGELOG.md` + `LICENSE` (MIT) + `SECURITY.md`
- `.github/ISSUE_TEMPLATE/` — bug + feature request templates
- `.github/pull_request_template.md`
- README feedback section + docs table

---

### v0.16.0 — DOCS-2: last_verified frontmatter

**What:**
- `last_verified?: string` added to `SourceFrontmatter`, `Chunk`, propagated to `CitedChunk`
- `parseFmFields()` in `Chunker.ts` parses and includes the field
- `MF-OBJ-2025.md` + `PL-CIT-2026-WHT.md`: `last_verified: 2026-04-02`
- `TEMPLATE.md` documents the field
- Field parsed and stored on every chunk — surfacing to tool results is Phase 14

**246/246 tests passing.**

---

## Planned phases

### Arc 1 — WHT Core Completion (Phases 14–22)

| Phase | Title | Key deliverable |
|---|---|---|
| **14** | Ghost Activation | `TreatyVerifierAgent` wired into live agent flow; `last_verified` surfaced in `consult_legal_sources` output; confidence → LOW on rate mismatch |
| 15 | QA-3: Evals + Negative Tests | `data/golden_cases/` (5 curated cases); `scripts/runEvals.ts`; `bo_overall` + confidence calibration checks; negative tests (unsupported country, missing DDQ) |
| 16 | Legal Source Hierarchy | `source_type` parameter on `consult_legal_sources`; Art./Sec. refs in `Citation`; `legal_hierarchy` field; Zod domain-narrowing for `paymentType`, `countryCode` |
| 17 | Confidence UX + HITL | UI grey-out for LOW confidence; "Draft Only" watermark; auto-`review_status: 'draft'` on UNCERTAIN/LOW analysis |
| 18 | UC2 Third-party Vendor Workflow | `classify_vendor_risk` tool; document checklist per payment type; no-DDQ path |
| 19 | Due Diligence Module | DD checklist tool per payment type (dividend, royalty, management fee); DD gap analysis in report |
| 20 | Data Quality Pass | Verify top-10 treaty rates against official sources; `verified: true` in treaties.json |
| 21 | Batch Processing | `--batch payments.csv` CLI; multi-entity summary report; registry cache hits |
| 22 | Production Hardening | Session persistence; SSE reconnect; rate limiting; memory pruning (`maxMessageHistory`) |

### Arc 2 — WHT Professional Features (Phases 23–26)

| Phase | Title | Key deliverable |
|---|---|---|
| 23 | Intangibles / Business Profits Layer | Art. 21 ust. 1 pkt 2a CIT — management fees, advisory, technical services; PE article analysis hook |
| 24 | Legal Source Management Workflow | Source update protocol; new source onboarding guide; `last_verified` update workflow |
| 25 | Jurisdiction Expansion | `treaties.json` 36 → 50+ countries |
| 26 | WHT v1.0 Major Review | End-to-end demo (UC1 + UC2); all acceptance criteria verified; `CHANGELOG.md` v1.0; MBA prototype declaration |

### Arc 3 — Tax OS Foundation (Phases 27–29)

| Phase | Title | Key deliverable |
|---|---|---|
| 27 | GLOBAL VISION Documentation | `docs/GLOBAL_VISION.md` (gitignored — private); Tax OS architecture, legal hierarchy system, system prompt guidelines |
| 28 | EU Jurisdiction Engine Concept | Architecture design for multi-jurisdiction support; pilot jurisdiction (Germany or Netherlands); Tax OS Module 2 scope |
| 29 | Tax OS Module 2 Planning | Next tax regime scoping; cross-module shared framework design; Tax OS v1.0 roadmap |
