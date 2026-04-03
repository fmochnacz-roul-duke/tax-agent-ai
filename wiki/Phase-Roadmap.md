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

### v0.18.0 — Phase 15: QA-3 Evals + Negative Tests

**What:**
- `BoOverall` type exported from `BeneficialOwnerAgent.ts`: `'CONFIRMED' | 'UNCERTAIN' | 'REJECTED' | 'NO_TREATY'`
- `bo_overall: BoOverall` added to `WhtReport` — deterministic derivation from structured findings; never parsed from LLM free text
- `conduit_risk: boolean` added to `WhtReport` — `true` when REJECTED + entity/country is in a known routing jurisdiction or is a holding/shell/unknown entity type; no LLM judgment
- `computeBoOverall()` — decision order: NO_TREATY → LOW confidence → substance FAIL/PASS → UNCERTAIN fallback
- `computeConduitRisk()` — 16-country `KNOWN_ROUTING_JURISDICTIONS` set OR entity_type in `['holding_company', 'shell_company', 'unknown']`
- `EntityRegistry.save()` — force-draft on REJECTED: incoming REJECTED verdict resets `review_status` to `'draft'` even when previously `'signed_off'`; protects against unreviewed conduit rejections
- `data/golden_cases/` — 9 JSON cases: France/CONFIRMED, Luxembourg/UNCERTAIN, Germany/CONFIRMED (EU Directive), Netherlands/UNCERTAIN, Malta/REJECTED, Hong Kong/NO_TREATY, Ireland/UNCERTAIN, Cyprus SPV conduit (8a/REJECTED), Canada ultimate BO (8b/CONFIRMED)
- `scripts/runEvals.ts` + `npm run eval` — Triangulation Rule: fails if either `bo_overall` OR rate is wrong
- 8 negative tests: Hong Kong no-treaty, Brazil rates (10%/15% split), France 10% royalty guard, Malta MLI PPT confirmation, input validation
- Brazil added to `treaties.json` — PL-BR DTC (2022); in force 01.01.2026; no MLI PPT; rates verified via Tax@Hand/Deloitte Aug 2025

**Key decisions:**
- `bo_overall` is derived deterministically — never from an LLM enum. Compliance verdicts must not depend on the LLM correctly applying a label.
- LOW confidence unconditionally blocks CONFIRMED. No partial credit in tax law.
- `conduit_risk` uses a static jurisdiction set + entity_type field because the agent evaluates single nodes and cannot see outbound payment flows to reliably identify conduit structures.
- The conduit scenario (Cyprus SPV → Canada ultimate BO) is split into two independent eval cases (8a, 8b). Automated look-through deferred to Phase 23b (`check_look_through` tool).
- Brazil's treaty was caught as a "training data ghost" — the PL-BR DTT entered into force 01.01.2026 and was absent from the initial golden dataset proposal. All treaty facts must be cross-checked against `treaties.json` before use in golden cases or documentation.

**33 new tests — 284/284 passing.**

---

---

### v0.19.0 — DOCS-3: Documentation Polish

**What:**
- `CONTRIBUTING.md` — new: prerequisites, quickstart, build/test gates, branch naming, PR flow, roadmap change process
- `docs/README.md` — new: one-line-per-file index of all docs
- `docs/FAQ.md` — new: 7 seed entries (verified:false rates, LLM tiers, simulated substance, confidence scoring, Express auth, single-file UI, `bo_overall` vs `data_confidence`)
- `README.md` restructured: legal disclaimer + quickstart + static badges at top; ASCII agent flow diagram; docs map table; all three roadmap arcs; learning scaffolding moved to bottom
- `SECURITY.md` restructured: Legal Disclaimer first; responsible disclosure contact; Dependency Hygiene section; Access Control section
- `CLAUDE.md`: DOCS-3 phase entry; in-code doc-block convention; 7-step merge checklist

---

### v0.19.0 — Phase 16: Legal Source Hierarchy

**What:**
- `SourceType` type exported from `src/rag/types.ts`: `statute | directive | treaty | convention | guidance | oecd | commentary`
- `source_type?: SourceType` added to `SourceFrontmatter`, `Chunk`, `CitedChunk`, `RetrieveOptions`
- `Chunker.parseFmFields()` reads `source_type` from frontmatter; unrecognised values silently dropped
- `Retriever.search()` filters by `source_type` (AND-combined with existing filters); chunks without type always pass
- `source_type` forwarded in `CitedChunk` via conditional spread
- `PL-CIT-2026-WHT.md`: `source_type: statute` in frontmatter
- `MF-OBJ-2025.md`: `source_type: guidance` in frontmatter
- `consult_legal_sources` tool: `source_type` enum parameter (statute | directive | treaty | convention | guidance | oecd | commentary | any); `'any'` → undefined in dispatch
- `SourceTypeSchema` Zod enum + `SourceTypeParam` type exported from `BeneficialOwnerAgent.ts`
- `Citation` extended: `source_type?: string`, `legal_hierarchy?: number`
- `extractCitation()` populates both fields from the RAG chunk output
- `WhtEnvironment.LEGAL_HIERARCHY` static map: statute→1, directive/treaty/convention→2, guidance/oecd→3, commentary→4
- Each chunk in `consultLegalSources()` output now includes `source_type` and `legal_hierarchy` when the chunk carries a `source_type`

**Key decisions:**
- `source_type` filter leaves chunks without a type in the result set (absence = unclassified, not excluded). This is deliberate — future sources that haven't been tagged yet will still surface.
- `legal_hierarchy` is a plain number, not an enum, so it can be compared arithmetically by the agent (statute=1 < guidance=3 → statute takes precedence).
- `'any'` as a tool parameter sentinel converts to `undefined` at the dispatch boundary — the Retriever never sees the string `'any'`.
- RAG knowledge base rebuild (`npm run rag:build`) needed to propagate `source_type` to the pre-built chunks index. *(Completed at start of Phase 17 session.)*
- `SourceTypeSchema` is exported so future tools (e.g. `check_mdr_obligation`) can reuse the same validated enum without re-declaring it.

**14 new tests — 298/298 passing.**

---

### v0.20.0 — Phase 17: Confidence UX + HITL

**What:**
- `DRAFT ONLY` banner added to the report card whenever `data_confidence === 'LOW'` — red, prominent, explains that substance is simulated and rates unverified
- `report-low` CSS class applied to the report card: reduced opacity + red border, signals report is for analysis only
- `bo_overall` badge displayed in the report card alongside the confidence badge (CONFIRMED=green, REJECTED=red, UNCERTAIN=blue, NO_TREATY=purple)
- UNCERTAIN banner shown when `bo_overall === 'UNCERTAIN'` — prompts reviewer that BO test is inconclusive
- Conduit risk banner shown when `conduit_risk === true` — alerts that an intermediate structure may exist
- `EntityRegistry.save()`: force-draft rule extended from REJECTED (Phase 15) to also cover UNCERTAIN `bo_overall` and LOW `data_confidence`

**Key decisions:**
- UNCERTAIN verdicts must reset any prior sign-off — signing off on an inconclusive BO test is inconsistent with the due diligence standard.
- LOW confidence forces draft regardless of `bo_overall` — simulated data is not sufficient for a professional sign-off even when the BO test passes.
- MEDIUM confidence does not force draft — only LOW.
- NO_TREATY + HIGH/MEDIUM preserves sign-off — a definitive no-treaty finding with verified data is actionable.

**4 new tests, 3 Phase 15 tests corrected — 302/302 passing.**

---

### v0.21.0 — Phase 18: UC2 Third-party Vendor Workflow

**What:**
- `VENDOR_ROUTING_JURISDICTIONS` set (15 countries) added to `WhtEnvironment.ts`
- `classifyVendorRisk()` method — deterministic risk tier derivation (no LLM):
  - `related_party: true` → **HIGH** / FULL due diligence
  - Unrelated + routing jurisdiction → **HIGH** / ENHANCED
  - Unrelated + royalty → **MEDIUM** / STANDARD
  - Unrelated + `annualPaymentPln > 2,000,000` → **MEDIUM** / STANDARD
  - Otherwise → **LOW** / SIMPLIFIED
- Progressive document checklist: LOW = 3 items (CFR + BO declaration + contract); MEDIUM = 5 items (+ DDQ lite + financial statements); HIGH = 8+ items (+ group chart + DEMPE for royalties)
- `pay_and_refund_applies: true` only for related party transactions
- `requires_substance_interview: true` for MEDIUM and HIGH tiers
- Legal basis: Art. 26 Polish CIT Act; MF Objaśnienia podatkowe z 3 lipca 2025 r. §4
- New Goal (priority 5) in `BeneficialOwnerAgent.ts`: routes agent to call `classify_vendor_risk` first for unrelated-party transactions; LOW tier → skip `check_entity_substance`
- `classify_vendor_risk` tool definition (5 required params); dispatch case; `FINDING_KEY_FOR_TOOL` entry
- `eslint.config.js`: `scripts/*.js` added to ignores (fixes ESLint on CommonJS generator scripts)
- `docs/agent-design-guide.md`: sections 17 (Deterministic Verdict Computation), 18 (Force-Draft HITL), 19 (Risk-Routing Tool Pattern)

**Key decisions:**
- Risk classification is synchronous and deterministic — no LLM call. Risk routing is a compliance rule, not a judgment call. Deterministic logic is auditable, testable, and never hallucinates.
- Related parties always bypass the routing tool — `related_party: true` is always HIGH regardless of jurisdiction, because MF Objaśnienia §4 applies the full due diligence standard to all intercompany payments above PLN 2M.
- The Goal instructs the agent to skip `check_entity_substance` for LOW-tier unrelated vendors — the lighter MF Objaśnienia standard for unrelated parties does not require full substance analysis.
- Routing jurisdictions are intentionally broad (15 countries including the Netherlands and Switzerland) — over-caution is better than under-caution in a compliance tool.

**12 new tests — 314/314 passing.**

---

## Planned phases

### v0.20.1 — Data & Planning Session (2026-04-03)

**What:**
- **22 new golden cases** (cases 09–31) added to `data/golden_cases/`:
  - Cases 09–12: 2026 Stress Tests — Swiss STTR (case_09), Singapore conduit/board saturation (case_10), UK LLP hybrid/reverse hybrid (case_11), US management fee recharacterisation (case_12)
  - Cases 13–31: EU27 baseline coverage scaffolds — all 27 member states represented with standard dividend/interest/royalty scenarios
- **Golden Dataset v2.0 structure**: `ksef_invoice_id`, `evidence` (KSeF/payroll/lease/Pillar Two status), `substance_details` (board saturation, board IP origin), `expected.sttr_topup_applies`, `expected.rate_basis`
- **Tax taxonomy**: 3 new categories (`pillar_two_sttr`, `digital_tax_compliance`, `board_governance`); concepts: `ksef_mandate`, `sttr`, `board_saturation`
- **Legal sources registry**: `PL-KSEF-2026` and `PL-CIT-PILLAR-TWO-2026` added
- **Wiki updated**: `WHT-Legal-Framework.md` — 2026 Intelligence Update section (KSeF, STTR, Board Saturation, Management Fee recharacterisation, Post-Brexit Hybrids)
- **New docs**: `docs/GOLDEN_DATASET_ARCHITECTURE.md`, `docs/SUPPLEMENTAL_LEGAL_SOURCES_AND_PIT_ANALYSIS.md`
- **Generator script**: `scripts/generate_eu27_cases.js`
- **Roadmap**: QA-4 and Phase 24b defined; Phase 19 and Phase 22 scope extended

**Known gaps opened (resolved in future phases):**
- EU27 cases 13–31 use placeholder `treaty_rate_percent: 5` — enrichment in QA-4
- Cases 09–12 expected fields not yet supported by `runEvals.ts` — fixed in QA-4
- STTR logic, board saturation check, hybrid transparency not yet in agent — Phases 22/23b/24b
- `scripts/generate_eu27_cases.js` needs commit — Phase 18 pre-work

---

### Arc 1 — WHT Core Completion (Phases 19–22)

| Phase | Title | Key deliverable |
|---|---|---|
| **19** | **Due Diligence Module + Negative Evidence Gate** | DD checklist per payment type (dividend, royalty, management fee); DD gap analysis in report; **explicit flagging of missing evidence** (no KSeF ID → WARNING, no board logs → WARNING, no payroll filing → WARNING) |
| QA-4 | Eval Harness v2.0 | Update `runEvals.ts` for v2.0 case structure (`sttr_topup_applies`, `rate_basis`); add `status: 'active' \| 'scaffold' \| 'planned'` to case metadata; only `active` cases run in CI; verify EU27 rates against `treaties.json`; commit `generate_eu27_cases.js` |
| 20 | Data Quality Pass | Verify top-10 treaty rates against official PDFs; `verified: true` + `verified_at` in treaties.json; distinguish runtime vs. static verification in UI |
| 21 | Batch Processing | `--batch payments.csv` CLI; multi-entity summary report; registry cache hits |
| 22 | Production Hardening + Temporal Context | Session persistence (Redis); SSE reconnect; rate limiting; memory pruning; `payment_year` parameter on `AgentInput`; warn when 2026 mandates (STTR/KSeF) applied to historical payments |

### Arc 2 — WHT Professional Features (Phases 23a–26)

| Phase | Title | Key deliverable |
|---|---|---|
| 23a | Intangibles — Legal & Data Layer | Art. 21 ust. 1 pkt 2a CIT framework; treaty classification rules (Art. 7 Business Profits vs Art. 12 Royalties); MDR hallmarks (Art. 86a-86o Ordynacja podatkowa); IC vs. third-party analysis paths; RAG source enrichment for management fees |
| 23b | Intangibles — Code Layer | New `payment_type` options (`management_fee`, `advisory`, `technical_service`); `ServiceClassifier.ts` — AI-generated dynamic service classification questionnaire; `check_mdr_obligation` tool in `WhtEnvironment.ts`; PE hook in `WhtReport` |
| 23c | GAAR Tool | `check_gaar_risk` tool — Art. 119a Ordynacja podatkowa analysis; GAAR risk flag in `WhtReport`; scope TBD |
| 24 | Legal Source Management Workflow | Source update protocol; new source onboarding guide; `last_verified` update workflow; NSA/CJEU case law RAG ingestion (CJEU Danish Cases C-116/16; NSA II FSK 27/23) |
| 24b | PIT & Hybrid Entities Expansion | `recipient_type: 'ENTITY' \| 'INDIVIDUAL' \| 'PARTNERSHIP'` on `AgentInput`; Art. 29/30a PIT WHT rates; IFT-1/IFT-1R (PIT) vs IFT-2/IFT-2R (CIT) form guidance in report; UK LLP fiscal transparency check (case_11 is primary eval case); B2B freelancer / "disguised employment" detection |
| 25 | Jurisdiction Expansion | `treaties.json` 36 → 50+ countries |
| 26 | WHT v1.0 Major Review | End-to-end demo (UC1 + UC2); all acceptance criteria verified; `CHANGELOG.md` v1.0; MBA prototype declaration; Legal Memo output format (Facts / Law / Application / Conclusion) |

### Arc 3 — Tax OS Foundation (Phases 27–29)

| Phase | Title | Key deliverable |
|---|---|---|
| 27 | GLOBAL VISION Documentation | `docs/GLOBAL_VISION.md` (gitignored — private); Tax OS architecture, legal hierarchy system, system prompt guidelines |
| 28 | EU Jurisdiction Engine Concept | Architecture design for multi-jurisdiction support; pilot jurisdiction (Germany or Netherlands); Tax OS Module 2 scope |
| 29 | Tax OS Module 2 Planning | Next tax regime scoping; cross-module shared framework design; Tax OS v1.0 roadmap |

---

### v0.17.0 — Phase 14: Ghost Activation

**What:**
- `TreatyVerifierAgent` wired into live agent flow: `WhtEnvironment.treatyVerifier` + `verifyTreatyRate()` called from `case 'get_treaty_rate'` in the agent loop
- `treaty_verification_status` + `treaty_verification_note` merged into the `wht_rate` finding
- `Retriever.search()` forwards `last_verified` from `Chunk` to `CitedChunk` (was silently dropped)
- `consultLegalSources()` includes `last_verified` in chunk output when present
- `computeReportConfidence()`: DIFFERS → unconditionally LOW (before all other checks); NOT_FOUND → neutral
- 5 new tests — 251/251 passing

**Key decisions:**
- Runtime verification (Gemini check during analysis) is now live. Static data quality (`verified: true` in treaties.json) is a separate concern — pending Phase 20.
- The `verified: false` field in treaties.json is a *data quality* flag, not a runtime status. Phase 20 will verify top-10 rates against official PDFs.
- DIFFERS overrides confidence to LOW unconditionally — a rate mismatch is a red flag regardless of substance quality.
