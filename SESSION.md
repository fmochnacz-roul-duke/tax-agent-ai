# Session State

## Current Status
**Phase:** QA-4 complete (v0.23.0, 2026-04-03). Phase 20 (Data Quality) is next.
**Last code session:** QA-4 — Eval Harness v2.0 (v0.23.0, 2026-04-03)
**Last knowledge/planning session:** 2026-04-03 — doc hygiene session: wiki stale references fixed (How-to-Run.md test count 246→326, removed module1/2/3 scripts; Architecture.md RAG path corrected, Phase 16 sentence updated); Legal-Sources.md "Typical update frequency" column added to all source tables; CLAUDE.md Phase 24 scope extended with `scripts/validateDataIntegrity.ts` sub-task.
**Branch:** master
**Tests:** 326/326 passing

---

## Roadmap Refinements (2026-04-02 planning session)

Key decisions from reviewer feedback analysis:

1. **Verification Paradox clarified:** Phase 14 resolved *runtime* verification (TreatyVerifier in live flow). `verified: false` in `treaties.json` is *static data quality* — pending Phase 20. These are distinct layers. Quick win: UI/report note distinguishing the two (no new phase — micro-fix in Phase 16 or 17).

2. **Observation 2 closed:** `last_verified` surfaced in `consultLegalSources` output — done in Phase 14. No action.

3. **Phase 15 scope extended:** Triangulation Rule calibration added. Test FactChecker + TreatyVerifier outputs against known-correct treaty rates in the golden cases. 7 cases instead of 5 (see Golden Dataset proposal in SESSION.md).

4. **Phase 23 split into 23a + 23b:** Art. 21 ust. 1 pkt 2a is too complex for one session. 23a = legal research + data layer (no code changes to agent core). 23b = code implementation. Total phases: 29 → 30.

5. **Phase 21 (Batch) stays at position 21:** Quality before throughput. CSV schema should be defined during Phase 18 (UC2 workflow) to avoid redesigning it twice.

6. **Architectural scaling:** Redis + pgvector tracked in Phase 22. No new phase needed at current RAG corpus size (23 chunks).

### Phase 23 design decisions (confirmed 2026-04-02):

1. **MDR → a tool.** `check_mdr_obligation` will be a new tool in `WhtEnvironment.ts`, to be developed further. Output: `mdr_flag: 'YES' | 'NO' | 'UNCLEAR'` + applicable hallmark + reporting deadline. Adds to `WhtReport`.

2. **Scope: both intercompany and third-party.** For IC: full BO test applies (MF Objaśnienia standard). For third-party: lighter standard (residence cert + declaration). The service classification questionnaire must include a "related party?" routing question.

3. **Ambiguous services → interactive AI questionnaire.** A new `ServiceClassifier.ts` state machine, architecturally modelled on `SubstanceInterviewer.ts` (Phase 10). Questions are generated dynamically by the AI based on the service description — not a fixed list. The AI determines whether the service falls under Art. 21.1.2a or Art. 7 Business Profits.

4. **GAAR → separate tool, TBD, not in Phase 23 scope.** Slotted as Phase 23c (planned). Art. 119a Ordynacja podatkowa has a different legal structure from WHT and warrants its own implementation.

---

## Golden Dataset — Phase 15 Proposal (7 cases)

| # | Entity | Country | Payment type | Key legal issue | Expected bo_overall |
|---|---|---|---|---|---|
| 1 | Orange S.A. | France | Royalty | Real substance, Art. 12 FR treaty | CONFIRMED |
| 2 | Alpine Holdings | Luxembourg | Dividend | Holding company, BO test, MLI PPT | UNCERTAIN |
| 3 | IP GmbH | Germany | Royalty | EU I&R Directive + Art. 12 DE treaty | CONFIRMED |
| 4 | TechFinance B.V. | Netherlands | Interest | VERIFY MLI status, PPT risk | UNCERTAIN |
| 5 | XTB Malta Ltd | Malta | Royalty | No MLI PPT, low substance, treaty rate 10% | REJECTED |
| 6 | No-Treaty Co. | Brazil | Dividend | No Poland–Brazil treaty | CONFIRMED (20% domestic) |
| 7 | SPV Ireland | Ireland | Interest | EU I&R Directive candidate, thin substance | UNCERTAIN |

Cases 1-2 use existing repo data. Cases 4-5 cover MLI PPT / low-substance risk. Case 6 tests no-treaty path. Case 7 tests EU Directive + substance conflict. All to be validated with Frank before coding the harness.

---

## How to Resume Next Session

All knowledge files are synced to v0.23.0 and pushed. Start Phase 20 (Data Quality) next.

```
git checkout -b feature/phase-20-data-quality
npm run build    ← zero errors required
npm test         ← 326/326 passing
npm run eval     ← runs 13 active cases only; all should be PASS
npm start        ← web UI at http://localhost:3000
```

**Phase 20 — Data Quality (80/20 rule: verify top 5 treaties first)**
- 80/20 rule: Luxembourg, Germany, France, Netherlands, Ireland first — these appear in existing golden cases
- One country at a time: fetch treaty PDF → verify rate → update `verified: true` in `treaties.json` → commit
- Then move to remaining top-10 by payment volume
- AI-assisted research only — always verify against primary source before committing
- Scaffold cases 13–31 can be promoted to `active` after rate verification in this phase

**QA-4 summary (what was done):**
- `runEvals.ts` v2.0: active/scaffold status filter; `sttr_topup_applies` informational field; `rate_basis` in table; scaffold excluded from CI exit code
- `generate_eu27_cases.js`: committed; Czech Republic key fix; `status: 'scaffold'` on all generated cases
- Cases 01–12: `status: 'active'` added
- Cases 13–31: `status: 'scaffold'`; treaty rates corrected from 5% placeholder to actual values from `treaties.json`; Czech Republic country fix in case_17

Phase 17 summary (v0.20.0):
- `DRAFT ONLY` banner + grey-out (`report-low` CSS class) for LOW confidence report cards
- `bo_overall` badge displayed in the report card alongside confidence badge
- UNCERTAIN banner when `bo_overall === 'UNCERTAIN'`; conduit risk banner when `conduit_risk === true`
- New badge colours: `bo-CONFIRMED`, `bo-REJECTED`, `bo-NO_TREATY`
- `EntityRegistry.save()`: force-draft extended to UNCERTAIN `bo_overall` + LOW `data_confidence`
- 4 new tests → 302 total (3 Phase 15 tests also updated for correctness)

---

## Revised Roadmap (Phases 14–29)

Roadmap restructured after a full strategy review (2026-04-02). Expanded from 7 to 16 phases across 3 arcs. Each phase = one session. End of every session: update all knowledge files + push to GitHub.

### Arc 1 — WHT Core Completion (Phases 14–22)

| Phase | Title | Key deliverable |
|---|---|---|
| 14 | Ghost Activation | `TreatyVerifierAgent` in live agent flow; `last_verified` in RAG output; confidence → LOW on rate mismatch | ✓ v0.17.0 |
| 15 | QA-3: Evals + Negative Tests | `data/golden_cases/` (9 cases); `scripts/runEvals.ts`; Triangulation Rule; negative tests | ✓ v0.18.0 |
| 16 | Legal Source Hierarchy | `source_type` param; `legal_hierarchy` in RAG results + `Citation`; Zod `SourceTypeSchema`; filter in Retriever | ✓ v0.19.0 |
| 17 | Confidence UX + HITL | UI grey-out for LOW confidence; `DRAFT ONLY` banner; auto-`review_status: 'draft'` on UNCERTAIN/LOW | ✓ v0.20.0 |
| — | Data & Planning (v0.20.1) | Golden Dataset v2.0 (cases 09–31); taxonomy + registry updated; QA-4 + Phase 24b defined | ✓ v0.20.1 |
| 18 | UC2 Third-party Vendor Workflow | `classify_vendor_risk` tool; risk-routing goal; progressive document checklist; no-DDQ path | ✓ v0.21.0 |
| 19 | Due Diligence Module + Negative Evidence Gate | `check_due_diligence` tool; `data/due_diligence_checklists.json`; `DdGapAnalysis` on `WhtReport`; Negative Evidence Gate in confidence scoring | ✓ v0.22.0 |
| **QA-4** | **Eval Harness v2.0** | Update `runEvals.ts` for v2.0 case structure; `active`/`scaffold` status filter; EU27 rate verification for cases 13–31 | **Next** |
| 20 | Data Quality Pass | Verify top-10 treaty rates against official PDFs; `verified: true` in treaties.json — **80/20: Luxembourg, Germany, France, Netherlands, Ireland first; one country at a time** |
| 21 | Batch Processing | `scripts/runBatch.ts`; `--batch payments.csv` CLI; sequential processing; timestamped output dir + summary CSV |
| 22a | Temporal Context | `payment_year` on `AgentInput`; STTR/KSeF temporal gating |
| 22b | Production Hardening | Session persistence (`express-session`); SSE reconnect; rate limiting (`express-rate-limit`) — existing packages only |

### Arc 2 — WHT Professional Features (Phases 23–26)

| Phase | Title | Key deliverable |
|---|---|---|
| 23a | Intangibles — Legal & Data Layer | Art. 21.1.2a framework; treaty classification (Art. 7 vs Art. 12); MDR hallmarks; RAG source enrichment; IC vs. 3rd-party paths — **time-box: ~10h research budget** |
| 23b | Intangibles — Code Layer | `ServiceClassifier.ts` AI questionnaire; `check_mdr_obligation` tool — **specialized agent pattern; do NOT expand `WhtEnvironment.ts`** |
| 23c | GAAR Tool | Art. 119a Ordynacja podatkowa analysis; GAAR risk flag; separate isolated tool |
| 24 | Legal Source Management Workflow | Source update protocol; `last_verified` staleness warnings in reports; NSA/CJEU case law RAG ingestion (Danish Cases, NSA II FSK 27/23) |
| 24b | PIT & Hybrid Entities Expansion | **Start with PIT individuals only** (Art. 29/30a); hybrid entities (UK LLP) → formal escalation flag, not shallow implementation; HIGH COMPLEXITY — scope one sub-type at a time |
| 25 | Jurisdiction Expansion | treaties.json 36 → 50+ countries — **Phase 20 pipeline first; add jurisdictions from existing golden cases** |
| 26 | WHT v1.0 Major Review | End-to-end demo (UC1 + UC2); all acceptance criteria; CHANGELOG v1.0; MBA prototype declaration; **Legal Memo in FLAC format (Facts / Law / Application / Conclusion)** |

### Arc 3 — Tax OS Foundation (Phases 27–29)

| Phase | Title | Key deliverable |
|---|---|---|
| 27 | GLOBAL VISION Documentation | `docs/GLOBAL_VISION.md` (gitignored); Tax OS architecture, legal hierarchy, system prompt guidelines |
| 28 | EU Jurisdiction Engine Concept | Pilot jurisdiction (Germany or Netherlands) — **"extract, don't invent": build one fully working second agent BEFORE designing any generic framework** |
| 29 | Tax OS Module 2 Planning | Next tax regime scoping; generic framework design only after Phase 28 pilot validates the approach |

---

## Ghost / Inactive Items (as of v0.17.0)

1. **`verified_at` / `verified_sources` / `verification_note`** on `DividendRate` and `FlatRate`
   interfaces in `WhtEnvironment.ts`. These become meaningful once Phase 20 (Data Quality Pass)
   runs real verifications and writes confirmed rates back to `treaties.json`.

All 36 treaty rates remain `verified: false` pending Phase 20 manual verification against
official Polish treaty PDFs (DzU references).

---

## Completed Phases (full history)

### Doc hygiene session — wiki stale references + Legal-Sources update frequency (docs — 2026-04-03)
No code changes. Three targeted improvements after a full documentation review:
- `wiki/How-to-Run.md`: test count corrected 246→326; test file list expanded to 12 files (added Chunker, Retriever, RAG); per-file counts corrected; removed deleted module1/2/3 scripts; `npm run eval` added to scripts table
- `wiki/Architecture.md`: RAG source path corrected `data/legal_sources/` → `data/knowledge_base/sources/`; "Phase 16 will surface last_verified" updated to past tense + accurate description; "Phase 16 will enhance citations" updated to describe actual delivered state (source_type, legal_hierarchy, SourceTypeSchema)
- `wiki/Legal-Sources.md`: "Typical update frequency" column added to all 5 source tables (statutes, guidance, EU Directives, MLI/OECD, commentary) and the RAG live sources table (renamed to "Rebuild trigger")
- `CLAUDE.md`: Phase 24 scope extended with `scripts/validateDataIntegrity.ts` sub-task — cross-file referential integrity checks (concept_ids, source_ids) deferred to the correct phase
- `SESSION.md`: this entry

### Knowledge session — vision restructure + FAQ (docs — 2026-04-03)
No code changes. Knowledge files updated:
- `docs/vision.md`: added "Product identity: WHT Research Co-Pilot" as a first-class section (before Use Cases); updated to v0.23.0; fixed acceptance criteria checkboxes (Phase 15 ✓, Phase 16 ✓); added Phase 19 + QA-4 to "What genuinely works" table; updated Phase sequencing rationale; Three Blind Spots strengthened with explicit phase-mapping tables
- `docs/FAQ.md`: 8 new entries (Garbage In/Gospel Out; Static Knowledge Trap; DRAFT ONLY vs bo_overall; co-pilot for KAS positions; FactChecker vs DDQ contradiction; UNCERTAIN vs LOW confidence; UK LLP hybrid; Polish-language input; Phase 20 ordering rationale)
- `wiki/Home.md`: version updated to v0.23.0; test count 314→326; naming updated to "WHT Beneficial Owner Co-Pilot"
- `wiki/Architecture.md`: tool count corrected 9→10
- `README.md`: headline updated to "Co-Pilot"; CLI test count comment corrected; problem-statement language updated
- `CONTRIBUTING.md`: test count corrected 284→326
- `CLAUDE.md`: Phase 26 updated (self-certification + Three Blind Spots closure checklist); Phase 22b updated (knowledge freshness warning as quick-win candidate); `npm run eval` description updated for v2.0 harness
- `SESSION.md`: this entry

### Scaffolding cleanup (chore — 2026-04-03)
- `src/module1`, `src/module2`, `src/module3` removed — learning scaffolding no longer needed in a product-grade project
- `npm run module1:*`, `module2:*`, `module3:*` scripts removed from `package.json`
- CLAUDE.md: Phase 22 split into 22a (Temporal Context) + 22b (Production Hardening); Phase 24b marked HIGH COMPLEXITY; tool/test counts corrected

### Phase 19 — Due Diligence Module + Negative Evidence Gate (v0.22.0 — 2026-04-03)
- `data/due_diligence_checklists.json` — required documents per payment type (dividend/interest/royalty); each item has `id`, `name`, `description`, `mandatory`, `critical`
- `checkDueDiligence()` in `WhtEnvironment.ts` — loads checklist, matches provided doc IDs, returns `DdGapAnalysis` with `status / gaps / critical_missing / provided_count / required_count`
- Status logic: INSUFFICIENT = any critical doc absent; PARTIAL = non-critical mandatory docs missing; COMPLETE = all mandatory docs provided
- `DdGapAnalysis` interface exported from `BeneficialOwnerAgent.ts`
- `dd_gap_analysis?: DdGapAnalysis` added to `WhtReport`
- `provided_documents?: string[]` added to `AgentInputSchema` and `buildTaskString()`
- New Goal `Check due diligence documentation` (priority 4.5) — agent must always call `check_due_diligence`
- New tool `check_due_diligence` in `buildWhtTools()`; dispatch case records `dd_gaps` finding
- `computeReportConfidence()` Negative Evidence Gate: INSUFFICIENT → LOW (unconditional); PARTIAL → cap at MEDIUM
- `extractDdGapAnalysis()` helper in `buildReport()` populates `dd_gap_analysis` on the report
- 12 new tests: 8 in `WhtEnvironment.test.ts` + 4 in `BeneficialOwnerAgent.test.ts` → 326/326

### Phase 18 — UC2 Third-party Vendor Workflow (v0.21.0 — 2026-04-03)
- `VENDOR_ROUTING_JURISDICTIONS` set (15 countries) + `classifyVendorRisk()` method in `WhtEnvironment.ts`
- Deterministic risk tier: related party→HIGH/FULL; routing jurisdiction→HIGH/ENHANCED; royalty→MEDIUM/STANDARD; >PLN 2M→MEDIUM/STANDARD; otherwise→LOW/SIMPLIFIED
- Progressive document checklist: LOW=3, MEDIUM=5, HIGH=8+ items
- New Goal (priority 5) in `BeneficialOwnerAgent.ts`: routes agent to call `classify_vendor_risk` first for unrelated-party transactions
- New tool `classify_vendor_risk` with JSON Schema; dispatch case + `vendor_risk` finding key
- `eslint.config.js`: `scripts/*.js` added to ignores (CommonJS generator scripts)
- Design guide updated: sections 17 (Deterministic Verdict Computation), 18 (Force-Draft HITL), 19 (Risk-Routing Tool Pattern)
- 12 new tests → 314/314

### Phase 17 — Confidence UX + HITL (v0.20.0 — 2026-04-03)
- `DRAFT ONLY` banner added to report card when `data_confidence === 'LOW'` (red, with explanation text)
- `report-low` CSS class applied to report card for LOW confidence — opacity + red border
- `bo_overall` badge added to report card alongside the confidence badge
- UNCERTAIN banner shown when `bo_overall === 'UNCERTAIN'`
- Conduit risk banner shown when `conduit_risk === true`
- New badge colours: `bo-CONFIRMED` (green), `bo-REJECTED` (red), `bo-NO_TREATY` (purple)
- `EntityRegistry.save()`: force-draft rule extended: REJECTED (Phase 15) + UNCERTAIN + LOW confidence all force `review_status: 'draft'`
- 4 new tests; 3 Phase 15 tests updated (CONFIRMED/NO_TREATY now use HIGH confidence, UNCERTAIN test behavior corrected)
- 302/302 tests

### Phase 16 — Legal Source Hierarchy + DOCS-3 (v0.19.0 — 2026-04-03)
- `SourceType` type exported from `src/rag/types.ts`: `statute | directive | treaty | convention | guidance | oecd | commentary`
- `source_type?: SourceType` added to `SourceFrontmatter`, `Chunk`, `CitedChunk`, `RetrieveOptions`
- `Chunker.parseFmFields()` reads and validates `source_type` from frontmatter (unrecognised → undefined)
- `Retriever.search()` now filters by `source_type` (AND-combined); chunks without type always pass
- `source_type` forwarded in `CitedChunk` via conditional spread
- `data/knowledge_base/sources/PL-CIT-2026-WHT.md`: `source_type: statute` in frontmatter
- `data/knowledge_base/sources/MF-OBJ-2025.md`: `source_type: guidance` in frontmatter
- `consult_legal_sources` tool: `source_type` enum parameter added; `'any'` sentinel → `undefined`
- `SourceTypeSchema` (Zod enum) + `SourceTypeParam` type exported from `BeneficialOwnerAgent.ts`
- `Citation` extended: `source_type?: string`, `legal_hierarchy?: number`
- `extractCitation()` populates `source_type` + `legal_hierarchy` from RAG chunk output
- `WhtEnvironment.LEGAL_HIERARCHY` static map: statute→1, directive/treaty/convention→2, guidance/oecd→3, commentary→4
- `consultLegalSources()` includes `source_type` + `legal_hierarchy` in chunk output; accepts `sourceType` param
- DOCS-3: `CONTRIBUTING.md`, `docs/README.md`, `docs/FAQ.md` created; `README.md` restructured; `SECURITY.md` updated; `CLAUDE.md` merge checklist + docblock convention added
- 298/298 tests (14 new: Chunker +4, Retriever +5, WhtEnvironment +5)

### Phase 15 — QA-3: Evals + Negative Tests (v0.18.0 — 2026-04-02)
- `BoOverall` type: `'CONFIRMED' | 'UNCERTAIN' | 'REJECTED' | 'NO_TREATY'`
- `bo_overall: BoOverall` + `conduit_risk: boolean` added to `WhtReport`
- `computeBoOverall()`: deterministic derivation (NO_TREATY → LOW→UNCERTAIN → FAIL→REJECTED → PASS→CONFIRMED)
- `computeConduitRisk()`: REJECTED + routing jurisdiction OR holding/shell/unknown entity type
- `KNOWN_ROUTING_JURISDICTIONS`: 16 countries (Cyprus, Luxembourg, Netherlands, Ireland, Malta, etc.)
- `EntityRegistry`: force-draft on REJECTED — clears prior sign-offs when new analysis returns REJECTED
- `data/golden_cases/`: 9 files — cases 01–07, 08a (Cyprus conduit), 08b (Canada ultimate BO)
- `scripts/runEvals.ts` + `npm run eval`: Triangulation Rule harness — fails on wrong `bo_overall` OR wrong rate
- Negative tests (8): Hong Kong no-treaty, Brazil treaty data, France 10% royalty, Malta MLI PPT, input validation
- `data/treaties.json`: Brazil added (PL-BR DTC 2022; in force 2026; no MLI PPT; rates verified via Tax@Hand)
- SHA-256 snapshot updated
- 284/284 tests passing (33 new tests)

### Phase 14 — Ghost Activation (v0.17.0 — 2026-04-02)
- `TreatyVerifierAgent` wired into live agent flow: `WhtEnvironment.treatyVerifier` + `verifyTreatyRate()`
- `case 'get_treaty_rate'` in agent loop calls `verifyTreatyRate()` and merges `treaty_verification_status` + `treaty_verification_note` into the `wht_rate` finding
- `Retriever.search()` now forwards `last_verified` from `Chunk` to `CitedChunk` (was silently dropped)
- `consultLegalSources()` surfaces `last_verified` in chunk output when present
- `computeReportConfidence()`: DIFFERS → unconditionally LOW (before all other checks); NOT_FOUND → neutral
- 5 new tests — 251/251 passing

### DOCS-2 (v0.16.0 — 2026-04-02)
- `last_verified?: string` added to `SourceFrontmatter`, `Chunk`, propagated to `CitedChunk`
- `parseFmFields()` in `Chunker.ts` parses and includes the field
- `MF-OBJ-2025.md` + `PL-CIT-2026-WHT.md`: `last_verified: 2026-04-02`
- `TEMPLATE.md` documents the field
- 246/246 tests passing (no regressions — optional field, no test changes needed)

### QA-2 (v0.15.0 — 2026-04-02)
- `AgentInputSchema` (Zod v4) — single source of truth for shape + validation
- `AgentInput` type derived via `z.infer<>` — no separate interface to drift
- `validateInput()` replaced by `AgentInputSchema.parse()` + ZodError formatting
- `src/agents/contracts.ts` — `SubstanceResultSchema` + `DempeResultSchema` (Zod v4)
- `DempeResult` type defined in TypeScript for the first time
- `python/service/export_schemas.py` → `contract.json` snapshot
- `src/agents/contract.test.ts` — 13 tests (Category A: simulation vs. Zod; Category B: Python vs. TypeScript)
- 246/246 tests

### QA-1 (v0.14.0 — 2026-04-02)
- `eslint.config.js` — flat config, `@typescript-eslint/flat/recommended`, `no-explicit-any: error`
- `.prettierrc.json` — single quotes, trailing commas, 100-char line width
- `npm run lint` — ESLint + Prettier check in one command
- `.c8rc.json` + `npm run test:coverage` — V8 coverage, text + lcov
- `tsc --noEmit &&` prefix on `npm test` — type errors block test run
- `treaties.snapshot.test.ts` — SHA-256 hash guard for treaties.json
- `scripts/updateTreatySnapshot.ts` + `npm run test:snapshot:update`
- 216/216 tests

### Phase 13 (v0.13.0 — 2026-04-02)
- `Citation` interface — tool, source, finding_key, section_ref, source_id, chunk_count, top_score
- `FINDING_KEY_FOR_TOOL` map + `extractCitation()` + `hasRagLegalGrounding()`
- `computeReportConfidence(findings, citations)` — RAG legal grounding gate: ≥2 chunks, top_score ≥0.55
- `WhtReport.citations: Citation[]`
- `require.main === module` guard on `main()`
- 19 new tests (confidence thresholds, FactChecker interaction, parseFindings)
- 215/215 tests

### Phase 12b (v0.12b.0 — 2026-04-02)
- `EntityRegistry.updateReviewStatus()` — review_status: draft / reviewed / signed_off
- `GET /registry/entry` + `POST /registry/review` endpoints
- `scripts/listUnreviewed.ts` + `npm run review:list`
- Web UI review drawer with reviewer name, note, action buttons
- 12 new tests — 196/196

### Phase 12a (v0.12a.0 — 2026-04-02)
- `TreatyVerifierAgent.ts` — `verifyRate()` + `TreatyRateVerification` type
- Gemini REST API + Google Search; simulate fallback
- `scripts/verifyTreaties.ts` + `npm run verify:treaties`
- `verified_at?`, `verified_sources?`, `verification_note?` on rate interfaces
- 15 tests — simulate mode only

### Phase 11 (v0.11.0 — 2026-04-02) — Entity Registry
### Phase 10 (v0.10.0 — 2026-04-02) — Substance Interview
### Phase 9  (v0.9.0)  — Legal Knowledge RAG
### Phase 8  (v0.8.0)  — Conversational Web UI
### Phase 7  (v0.7.0)  — FactChecker Agent
### Phase 6  (v0.6.0)  — Python DDQ Extraction Service
### Phase 5  (v0.5.0)  — MATE Improvements
### Phase 4  (v0.4.0)  — Substance Test & DEMPE
### Phase 3  (v0.3.0)  — Real Output
### Phase 2  (v0.2.0)  — Real Input
### Phase 1  (v0.1.0)  — Live Treaty Data

---

## Key Architecture Decisions (stable, do not change without discussion)

- GAME framework for all agents
- `WhtEnvironment` is the isolation boundary — `simulate: false` active
- Three-tier substance fallback: Python DDQ service → TypeScript SubstanceExtractor → `buildEntityProfile`
- `runWhtAnalysis()` is the single exported entry point — CLI and web server both call it
- SSE streaming via `onEvent?` callback — additive, backward-compatible
- `node:test` (built-in) for unit tests — no extra dependencies
- Express web server; in-memory session Map (suitable for dev; Redis for production)
- Zod v4 for all runtime input validation — `z.infer<>` derives the TypeScript type
- `contract.json` committed alongside every Pydantic model change
- `treaties.json` change guarded by SHA-256 snapshot test

---

## Open Questions

- Treaty rate verification: verify rates against official treaty PDFs (DzU references in treaties.json). Priority: Luxembourg, Germany, France, Netherlands, Ireland.
- OECD MLI Matching Database check needed for Netherlands, Sweden, Switzerland (VERIFY cases).
- Session persistence: in-memory Map is fine for dev; Redis or DB needed for multi-user production use.
- Third-party vendor UC2: currently no distinct workflow for unrelated parties (Phase 15).
- `last_verified` in RAG tool result: now surfaced in `consultLegalSources` output (Phase 14 ✓).
