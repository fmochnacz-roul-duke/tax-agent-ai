# Phase Roadmap

Each phase corresponds to a git tag. All completed phases are available as GitHub Releases.

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
- This means Phase 6 is additive and backward-compatible

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

### v0.10.0 — Phase 10: Substance interview

**What:**
- `SubstanceInterviewer.ts` — 5-question Mode A interview state machine
- `SubstanceExtractor.ts` — TypeScript LLM extractor: DDQ text → SubstanceResult (no Python needed)
- `WhtEnvironment.checkEntitySubstance` — 3-tier fallback: Python service → TS extractor → simulation
- Server `interviewing` state — `/confirm` triggers interview, `/message` routes answers

**Key decisions:**
- Phase 10 closes the data-entry gap: any entity can now be assessed without a DDQ file
- The interview replaces Phase 6's DDQ upload as the primary substance data entry path for basic use
- TypeScript extractor as fallback means Phase 6 Python service is no longer required for any basic use

---

### v0.9.0 — Phase 9: Legal knowledge RAG

**What:**
- 9a: Tax taxonomy (`data/tax_taxonomy.json`) — 40 controlled concepts with Polish/English terms and RAG keywords
- 9b: RAG infrastructure — `Chunker`, `Embedder`, `Retriever`, `LegalRagService`; source .md files for MF-OBJ-2025 (14 chunks) and PL-CIT-2026-WHT (9 chunks); `npm run rag:build` embeds 23 chunks using `text-embedding-3-small`; incremental rebuild via SHA-256 manifest
- 9c: `consult_legal_sources` tool — agent retrieves statutory text before final BO determination; goal priority 2; RAG results flow as reasoning context (not persisted finding); smoke test retrieved Art. 4a pkt 29 with score 0.58

**Key decisions:**
- Knowledge base = authoritative sources only (CIT Act, MF Objaśnienia). Academic commentary (Jankowski & Smoleń) deliberately excluded — not legislation.
- `vectors.json` gitignored (905 KB generated file); `chunks/index.json` and `manifest.json` tracked (human-readable, enables incremental rebuild)
- RAG results not stored as findings — tool may be called multiple times with different queries; citations appear in the final answer text

---

### v0.11.0 — Phase 11: Entity Registry

**What:**
- `EntityRegistry.ts` — JSON-backed registry; persists to `data/registry.json` (gitignored)
- Upsert semantics: re-running for the same entity updates the entry but preserves `created_at` and `review_status` (so a professional's sign-off is not wiped by a re-analysis)
- Lookup key: `entity_name::country` (lowercased) — case-insensitive
- Extracts `substance_tier` and `bo_overall` from the parsed findings map
- `getRegistry()` singleton for the web server; CLI creates its own instance
- `GET /registry` endpoint — returns all entries as JSON, newest-first
- "Past Analyses" collapsible panel in the web UI right column — loads on init, refreshes after each analysis
- 26 new unit tests (all pure logic, temp file paths, no API calls)

**Key decisions:**
- JSON (not SQLite) — zero new dependencies, human-readable, sufficient for 1–3 analysts
- Circular import avoided: `EntityRegistry` defines its own `AnalysisReport` interface; `WhtReport` satisfies it via structural typing
- `review_status` preserved on upsert — `draft` by default; a professional can set `reviewed` or `signed_off` in the JSON file
- `data/registry.json` gitignored — runtime artifact, not source code

---

## Planned

### Phase 12 — Treaty rate verification + human review workflow

- Verify top 10 treaty rates against official treaty PDFs (DzU references in treaties.json)
- Add `reviewed_by` + `review_status` + `signed_off_at` fields to the registry
- "Review and approve" button in web UI — entry not `signed_off` until a professional clicks it


### Phase 13 — Third-party vendor workflow

Distinct lighter-touch flow: company name + payment type → treaty check → risk classification (LOW/MEDIUM/HIGH) → document checklist. Based on the distinction between related-party (full substance) and third-party (cert + declaration) due diligence standards.

### Phase 14 — Batch payment processing

CSV input → one report per row → summary table + individual reports. Cached entity profiles used where available.

### Phase 15+ — Tax AI OS expansion

New analysis modules sharing the same GAME framework, web UI, entity registry, and RAG knowledge base:
- Pillar Two / GloBE effective tax rate per jurisdiction
- Transfer Pricing first-pass screening
- Permanent establishment risk
- CbCR analysis — low-substance / high-profit mismatches
