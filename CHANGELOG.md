# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v0.23.0] — 2026-04-03 — QA-4: Eval Harness v2.0

### QA-4 — Evaluation Harness v2.0

#### `scripts/runEvals.ts` — v2.0 rewrite
- **Case status filtering** — `status: 'active' | 'scaffold'` field on every golden case; only `active` cases run by default and cause CI exit code 1 on failure; `--include-scaffold` flag includes EU27 scaffold cases (informational, no CI impact)
- **`sttr_topup_applies` field** — informational flag in `expected`; displayed in output with `expected:YES/NO`; does not affect PASS/FAIL (covered by rate + `bo_overall` checks; dedicated `WhtReport` field is a future Phase 22a scope)
- **`rate_basis` in summary table** — shows `treaty` / `domestic` / `sttr_override` / `domestic_dividend_rechar` per case for context
- **Scaffold counter** — summary line breaks out active vs scaffold results; scaffold cases marked with `†` in the table

#### `data/golden_cases/` — EU27 scaffold case updates (cases 13–31)
- `status: 'scaffold'` added to all 19 EU27 cases
- `treaty_rate_percent` corrected from placeholder 5% to actual rates from `treaties.json`: Finland 0%, Czech Republic 0%, Greece 20% (domestic), Hungary 10%, Italy 10%, Latvia 10%, Portugal 10%, Romania 10%, Slovenia 10%, Spain 10%
- Case 17 (Czechia): `input.country` fixed to `"Czech Republic"` to match `treaties.json` key; entity name updated

#### `data/golden_cases/` — active cases (01–12)
- `status: 'active'` added to all 13 existing active cases for explicit marking

#### `scripts/generate_eu27_cases.js`
- "Czechia" → "Czech Republic" to match `treaties.json` key
- `status: 'scaffold'` added to generated case template
- Updated console output notes next step (rate verification before promoting to active)

---

## [v0.22.0] — 2026-04-03 — Phase 19: Due Diligence Module + Negative Evidence Gate

### Scaffolding cleanup (chore)
- `src/module1`, `src/module2`, `src/module3` removed — learning scaffolding no longer appropriate in a product-grade project
- Corresponding `package.json` scripts (`module1:prompting`, `module1:agent`, `module2:tools`, `module2:agent`, `module3:readme`) removed
- `CLAUDE.md`: Phase 22 split into 22a (Temporal Context) + 22b (Production Hardening); Phase 24b complexity warning added; tool count corrected to 10 definitions / 10 implementations

### Phase 19 — Due Diligence Module + Negative Evidence Gate

#### New data file: `data/due_diligence_checklists.json`
- Defines mandatory due diligence documents per payment type (dividend / interest / royalty)
- Each entry: `id` (machine-readable), `name`, `description`, `mandatory: boolean`, `critical: boolean`
- Critical documents: `board_meeting_minutes` (all types), `ksef_id` (interest + royalty), `ip_ownership_documentation` + `payroll_proofs` + `rd_expenditure_records` (royalty only)

#### New tool: `check_due_diligence` (`src/agents/WhtEnvironment.ts`)
- **`checkDueDiligence(incomeType, providedDocuments)`** — loads checklist, normalises IDs, cross-matches
- Status derivation (deterministic, no LLM):
  - `INSUFFICIENT` — at least one critical document absent
  - `PARTIAL` — non-critical mandatory documents missing
  - `COMPLETE` — all mandatory documents provided
- Returns: `status`, `provided_count`, `required_count`, `gaps[]`, `critical_missing[]`, full `checklist[]` with `provided` flags, `legal_basis`, `source`
- Normalisation: document IDs are lowercased + spaces → underscores, allowing free-text input ("board meeting minutes" matches "board_meeting_minutes")
- Legal basis: Art. 26 Polish CIT Act; MF Objaśnienia podatkowe z 3 lipca 2025 r. §4

#### Agent integration (`src/agents/BeneficialOwnerAgent.ts`)
- **`DdGapAnalysis`** interface exported: `status / provided_count / required_count / gaps[] / critical_missing[]`
- **`WhtReport.dd_gap_analysis?: DdGapAnalysis`** — populated when `check_due_diligence` was called
- **`provided_documents?: string[]`** added to `AgentInputSchema` (Zod optional array of strings)
- **`buildTaskString()`** extended to surface provided document IDs or note their absence
- New Goal "Check due diligence documentation" (priority 4.5, between vendor-risk and pay-and-refund)
- New tool definition `check_due_diligence` (11th tool); dispatch case stores `dd_gaps` finding
- **`extractDdGapAnalysis()`** helper parses `dd_gaps` finding → typed `DdGapAnalysis | undefined`

#### Negative Evidence Gate in `computeReportConfidence()`
- Checked second (after treaty rate mismatch check):
  - `dd_gaps.status === 'INSUFFICIENT'` → returns `'LOW'` unconditionally (even if fact-check CONFIRMS)
  - `dd_gaps.status === 'PARTIAL'` → sets `ddPartialFlag = true`
- Both HIGH-return sites updated: `return ddPartialFlag ? 'MEDIUM' : 'HIGH'`

#### Tests (326 total, +12 new)
- `WhtEnvironment.test.ts` (+8): COMPLETE, INSUFFICIENT (board_meeting_minutes), INSUFFICIENT (empty array), PARTIAL, INSUFFICIENT (ksef_id), invalid income_type, source field, checklist provided flags
- `BeneficialOwnerAgent.test.ts` (+4): INSUFFICIENT → LOW, PARTIAL → MEDIUM, COMPLETE → HIGH, INSUFFICIENT overrides CONFIRMS

---

## [v0.21.0] — 2026-04-03 — Phase 18: UC2 Third-party Vendor Workflow

### Phase 18 — UC2 Third-party Vendor Workflow

#### New tool: `classify_vendor_risk` (`src/agents/WhtEnvironment.ts`)
- **`VENDOR_ROUTING_JURISDICTIONS`** set (15 low-substance/routing jurisdictions) defined at module level
- **`classifyVendorRisk()`** method: classifies an unrelated-party vendor into a risk tier BEFORE the full BO analysis
- Risk tier logic (deterministic, no LLM):
  - `related_party === true` → **HIGH** / FULL due diligence
  - Unrelated + routing jurisdiction → **HIGH** / ENHANCED
  - Unrelated + royalty (any country) → **MEDIUM** / STANDARD
  - Unrelated + interest/dividend AND `annualPaymentPln > 2,000,000` → **MEDIUM** / STANDARD
  - Otherwise → **LOW** / SIMPLIFIED
- Progressive document checklist: LOW = 3 items (CFR + BO declaration + contract); MEDIUM = 5 items (+ DDQ lite + financial statements); HIGH = 8+ items (+ group chart + DEMPE analysis for royalties + Pay and Refund relief options)
- `requires_substance_interview`: true for MEDIUM and HIGH tiers
- `pay_and_refund_applies`: true for related party above PLN 2M threshold
- Legal basis: Art. 26 Polish CIT Act; MF Objaśnienia podatkowe z 3 lipca 2025 r. §4
- Parameter validation: invalid income_type → structured error listing valid values; negative amount → structured error

#### Agent integration (`src/agents/BeneficialOwnerAgent.ts`)
- New Goal (priority 5): "Classify vendor risk for unrelated parties" — routes agent to call `classify_vendor_risk` first for all `related_party: false` transactions
  - LOW tier → agent skips `check_entity_substance`
  - MEDIUM tier → standard substance assessment path
  - HIGH tier → full substance assessment path
  - Related party (`related_party: true`) → Goal instructs agent to skip this tool entirely
- New tool definition `classify_vendor_risk` with Zod-compatible JSON Schema (5 required params: entity_name, country, income_type, annual_payment_pln, related_party)
- `FINDING_KEY_FOR_TOOL` extended: `classify_vendor_risk → 'vendor_risk'`
- Dispatch case added; result stored via `memory.recordFinding('vendor_risk', result)`

#### Infrastructure fix (`eslint.config.js`)
- `scripts/*.js` added to global ignores — prevents ESLint from applying `@typescript-eslint/no-require-imports: error` to CommonJS generator scripts (generated by the data session)

#### Tests (314 total, +12 new)
- All risk tier branches covered: related party → HIGH, routing jurisdiction → HIGH/ENHANCED, royalty → MEDIUM, interest above PLN 2M → MEDIUM, low-amount non-routing → LOW
- Checklist structure tests: LOW = 3 items, HIGH (related party) includes DDQ
- Pay and Refund applies only for related party above threshold
- Unknown amount (0) → conservative MEDIUM
- Validation: invalid income_type returns structured error; negative amount returns structured error
- Result always includes `source` field

#### Design guide (`docs/agent-design-guide.md`)
- Section 17: Deterministic Verdict Computation (no LLM in verdict derivation)
- Section 18: Force-Draft HITL Pattern (EntityRegistry + UI banner)
- Section 19: Risk-Routing Tool Pattern (UC2 vendor workflow architecture)

---

## [v0.20.1] — 2026-04-03 — Data & Planning: Golden Dataset v2.0 + Roadmap Update

### Data layer
- **22 new golden cases** — cases 09–31 added to `data/golden_cases/`:
  - Cases 09–12: 2026 Stress Tests (Swiss STTR, Singapore conduit, UK LLP hybrid, US management fees)
  - Cases 13–31: EU27 baseline coverage scaffolds (all 27 member states represented)
  - Cases 13–31 use placeholder `treaty_rate_percent: 5`; to be enriched in QA-4
- **Golden Dataset v2.0 case structure** — `ksef_invoice_id`, `evidence`, `substance_details` fields on cases 09–12
- **Tax taxonomy updated** — 3 new categories: `pillar_two_sttr`, `digital_tax_compliance`, `board_governance`; concepts added: `ksef_mandate`, `sttr`, `board_saturation`
- **Legal sources registry updated** — 2 new entries: `PL-KSEF-2026` (KSeF Mandate, Dz.U. 2026 poz. 128), `PL-CIT-PILLAR-TWO-2026` (Polish Pillar Two Act, Dz.U. 2026 poz. 412)
- **Generator script** — `scripts/generate_eu27_cases.js` created (untracked; to be committed in QA-4)

### Documentation
- `wiki/WHT-Legal-Framework.md` — 2026 Intelligence Update section added: KSeF, STTR, Board Saturation, Management Fee recharacterization, Post-Brexit Hybrids
- `docs/GOLDEN_DATASET_ARCHITECTURE.md` — new file: v2.0 case structure, 5-layer scenario matrix, knowledge gaps
- `docs/SUPPLEMENTAL_LEGAL_SOURCES_AND_PIT_ANALYSIS.md` — new file: supplemental sources (KAS digital evidence, NSA/CJEU case law, payroll benchmarks); PIT blind spot analysis (Art. 29/30a PIT, IFT-1 forms, B2B ghost risk)

### Roadmap
- **New Phase QA-4** (inserted after Phase 19): Eval Harness v2.0 — update `runEvals.ts` for v2.0 case structure; case status filtering; EU27 rate verification
- **Phase 19 scope extended**: Negative Evidence Gate — agent must explicitly flag missing KSeF ID, board logs, payroll proofs
- **Phase 22 scope extended**: Temporal / Point-in-Time Context — `payment_year` parameter; warn when 2026 mandates applied to historical payments
- **New Phase 24b** (inserted after Phase 24): PIT & Hybrid Entities Expansion — `recipient_type`, Art. 29/30a PIT, IFT-1/1R, B2B ghost detection, LLP transparency
- Total phases: 29 → 32

---

## [v0.20.0] — 2026-04-03 — Phase 17: Confidence UX + HITL

### Phase 17 — Confidence UX + HITL

#### Web UI — report card enhancements (`src/public/index.html`)
- **`bo_overall` badge** added to the report card alongside the data confidence badge — machine-readable BO verdict now visible immediately after analysis
- **`DRAFT ONLY` banner** shown at the top of the report card whenever `data_confidence === 'LOW'`; includes the reason (simulated substance, unverified rates)
- **`report-low` CSS class** applied to the card for LOW confidence — reduced opacity + red border to signal that the report is for analysis only
- **UNCERTAIN banner** shown when `bo_overall === 'UNCERTAIN'` — prompts reviewer that the BO test is inconclusive and human review is required before relying on the report
- **Conduit risk banner** shown when `conduit_risk === true` — alerts that an intermediate structure may exist and the ultimate beneficial owner is in another jurisdiction
- **New badge colours** `bo-CONFIRMED`, `bo-REJECTED`, `bo-NO_TREATY` added (green / red / purple) to match the existing `bo-UNCERTAIN` and registry row badges
- CSS: `.draft-watermark`, `.conduit-banner`, `.uncertain-banner` styles added

#### Registry auto-draft rules extended (`src/server/EntityRegistry.ts`)
- `save()` now forces `review_status: 'draft'` on **three** conditions (previously one):
  - `bo_overall === 'REJECTED'` — conduit structure; ultimate BO needs investigation (Phase 15)
  - `bo_overall === 'UNCERTAIN'` — BO test inconclusive; signing off would be premature (Phase 17, new)
  - `data_confidence === 'LOW'` — simulated substance / unverified rates; not safe to act on (Phase 17, new)
- Comment block updated to document all three conditions and their rationale

#### Tests (302 total, +4 new, 3 updated)
- 3 Phase 15 force-draft tests updated: CONFIRMED and NO_TREATY scenarios now use `HIGH` confidence so they correctly test the "preserve sign-off" path (previously LOW confidence would have triggered the new force-draft rule)
- UNCERTAIN test updated: was "preserves signed_off" → now correctly expects 'draft' after the behavior change
- **4 new tests** in `EntityRegistry.test.ts` (Phase 17 force-draft suite):
  - UNCERTAIN resets signed_off to draft
  - LOW data_confidence resets signed_off to draft
  - LOW data_confidence forces draft regardless of CONFIRMED bo_overall
  - CONFIRMED + MEDIUM preserves signed_off (positive-case verification)

---

## [v0.19.0] — 2026-04-03 — DOCS-3 + Phase 16: Legal Source Hierarchy

### DOCS-3 — Documentation polish

- **`CONTRIBUTING.md`** — new file: prerequisites, quickstart, build/test gates, branch naming, PR flow, roadmap change process, SECURITY.md link
- **`docs/README.md`** — new file: one-line-per-file index of all docs (architecture, api, agent-design-guide, vision, FAQ)
- **`docs/FAQ.md`** — new file: 7 seed entries covering verified:false rates, two LLM tiers, simulated substance, confidence scoring, Express auth, single-file frontend, `bo_overall` vs. `data_confidence`
- **`README.md`** restructured: disclaimer + quickstart + badges at top; docs map table; ASCII agent flow diagram; all three roadmap arcs in roadmap table; learning scaffolding moved to bottom
- **`SECURITY.md`** restructured: Legal Disclaimer moved to first section; responsible disclosure contact added; Dependency Hygiene section (npm audit + monthly review) added; Access Control section (unauthenticated Express) added
- **`CLAUDE.md`** updated: DOCS-3 phase added to table; in-code doc-block convention added; Merge Checklist (7 steps) added; test count note updated

### Phase 16 — Legal Source Hierarchy

#### `SourceType` in RAG layer (`src/rag/types.ts`)
- **`SourceType`** type exported: `'statute' | 'directive' | 'treaty' | 'convention' | 'guidance' | 'oecd' | 'commentary'`
- **`source_type?: SourceType`** added to `SourceFrontmatter`, `Chunk`, `CitedChunk`
- **`source_type?: SourceType`** added to `RetrieveOptions` — new authority-tier filter

#### Chunker (`src/rag/Chunker.ts`)
- `parseFmFields()` reads `source_type` from frontmatter; unrecognised values are silently dropped (not an error)
- `source_type` propagated to every `Chunk` via conditional spread (absent when not declared)

#### Retriever (`src/rag/Retriever.ts`)
- `search()` now accepts `source_type` option (AND-combined with existing filters)
- Chunks without `source_type` always pass the filter (absence = unclassified, not excluded)
- `source_type` forwarded to `CitedChunk` via conditional spread

#### Source files updated
- `data/knowledge_base/sources/PL-CIT-2026-WHT.md` — `source_type: statute` added to frontmatter
- `data/knowledge_base/sources/MF-OBJ-2025.md` — `source_type: guidance` added to frontmatter

#### `consult_legal_sources` tool (`BeneficialOwnerAgent.ts`)
- New `source_type` parameter (enum: statute | directive | treaty | convention | guidance | oecd | commentary | any) added to tool definition
- Agent dispatch passes `source_type` (converts `'any'` sentinel to `undefined` before forwarding)
- **`SourceTypeSchema`** Zod enum exported: validates and narrows the `source_type` parameter at runtime
- **`SourceTypeParam`** type derived via `z.infer<typeof SourceTypeSchema>`

#### `Citation` interface extended (`BeneficialOwnerAgent.ts`)
- **`source_type?: string`** — legal authority tier of the top-matched RAG source
- **`legal_hierarchy?: number`** — numeric rank (1=statute, 2=directive/treaty, 3=guidance, 4=commentary)
- `extractCitation()` populates both fields from the RAG chunk output

#### `WhtEnvironment.consultLegalSources()` (`WhtEnvironment.ts`)
- Signature extended: `consultLegalSources(query, conceptIds?, topK?, sourceType?)`
- **`LEGAL_HIERARCHY`** static map: statute→1, directive/treaty/convention→2, guidance/oecd→3, commentary→4
- Each chunk in the output now includes `source_type` and `legal_hierarchy` when the chunk carries a `source_type`

#### Tests (298 total, +14 new)
- `Chunker.test.ts` +4: reads `source_type: statute`, reads `source_type: guidance`, undefined when absent, ignores unrecognised values
- `Retriever.test.ts` +5: filters to statute, filters to guidance, no filter returns all, forwards `source_type` in `CitedChunk`, omits when absent
- `WhtEnvironment.test.ts` +5: statute chunk hierarchy 1, guidance chunk hierarchy 3, chunk without type omits fields, `source_type` filter returns only matching, `undefined` filter returns all

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
