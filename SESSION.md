# Session State

## Current Status
**Phase:** Phase 7 complete (FactCheckerAgent — Gemini + Google Search grounding). All phases 1–7 done. 86/86 tests passing. On master, pushed to GitHub.
**Date of last session:** 2026-04-01
**Branch:** master

---

## How to Resume Next Session

Open Claude Code in `C:\Users\fmoch\projects\tax-agent-ai\` and say:

> "Let's continue — Phase 6 is done, start Phase 7 (FactChecker Persona Agent)."

Then verify the environment is healthy:
```
npm run build                                                     ← zero errors
npm test                                                          ← 74/74 passing
npm run tax:agent -- --input data/orange_polska_royalty.json      ← runs end-to-end (simulation mode)

# To run with live DDQ (requires Python service):
pip install -r python/requirements.txt
npm run ddq:service                                               ← starts service on port 8000
# In .env: DDQ_SERVICE_URL=http://localhost:8000
npm run tax:agent -- --input data/orange_polska_royalty.json      ← uses real DDQ extraction
```

---

## What Was Done — Session 2026-03-31 (Phases 2, 3, fixes)

### Phase 2 — Real input
- `AgentInput` interface + `validateInput()` + `buildTaskString()` in BeneficialOwnerAgent.ts
- `parseInput()` reads `--input <file>` from CLI; clean error on missing flag
- `data/example_input.json` — Alpine Holdings demo; `data/orange_polska_royalty.json` — Orange S.A. real case
- `WhtEnvironment` switched to `simulate: false`

### New tools added
- `analyse_dempe` — DEMPE/BEPS 8–10 for royalties (Art. 12 scope warning included)
- `check_directive_exemption` — EU I&R Directive 2003/49/EC → Art. 21 CIT (0% path)
- `check_pay_and_refund` — Art. 26 §2c CIT; PLN 2M threshold; Opinion vs. WH-OS relief
- `AgentInput.annual_payment_pln` field added for Pay and Refund input

### Phase 3 — Real output
- `resolveOutputPath()` — auto-generates `reports/<slug>_<date>.json`; `--output` flag overrides
- `parseFindings()` — parses tool result strings back to objects
- `saveReport()` — saves on `terminate`, `maxIterations`, and plain-text exit
- `reports/` gitignored

### Agent fixes (post first test run)
- `buildTaskString()` — shareholding now always included (with Directive label for non-dividends)
- Duplicate tool call guard — blocks identical re-calls, returns reminder to model
- Findings summary prefix changed to `ESTABLISHED FINDINGS — do not repeat...`
- Persona strengthened with loop-prevention instruction
- Goals updated: Directive goal names the shareholding source; BO goal names `check_entity_substance`
- `maxIterations` raised from 12 → 20
- Plain-text exit now saves report (was silent before)
- Result: 12 looping iterations → 5 clean iterations; correct 0% Directive conclusion

### README rewrite
- Reframed as Module 1 of Tax OS / MBA diploma project (AI and Digital Transformation)
- Author, research context, Tax OS four-layer architecture, roadmap, limitations all documented
- Module1/2/3 reframed as technical appendix / visible reasoning chain

---

## What Was Done — Session 2026-03-31 (Phase 1)

### Legal source research
- Confirmed authoritative Polish sources: CIT Act Dz.U. 2026 poz. 331; Tax Ordinance Act Dz.U. 2026 poz. 252 + poz. 347 amendment.
- Confirmed MoF treaty list (podatki.gov.pl, last updated 27 Jan 2026): 91 bilateral treaties.
- Cross-checked all 91 treaties against OECD MLI Poland positions and signatories doc (12 Jan 2026).

### data/poland_dtt_list.csv
- 91 rows, 13 columns: full treaty metadata + MLI cross-check for every Polish DTT.
- mli_ppt_applies: YES / NO / VERIFY for each country.
- Critical findings: Germany (EXCLUDED_BY_POLAND); Italy (NOT_RATIFIED, 9 years); Netherlands/Sweden/Switzerland (VERIFY_MATCHING_DB — probable PPT=NO).

### data/mli_flags_legend.md
- 10 flag codes with full explanations: VERIFY_MATCHING_DB, NOT_RATIFIED, EXCLUDED_BY_POLAND, SUSPENDED, RECENT_MLI, POST_RATIF_NOTIF, EXISTING_ANTIABUSE, ART8_RESERVED, SYNTH_PL_ONLY, NOT_IN_FORCE.

### data/treaties.json — new
- Static lookup table for live mode: EU27 + UK, Switzerland, Norway, USA, Canada, Japan, Singapore, UAE, Australia, India (36 countries).
- Each entry: treaty metadata (name, DzU ref), mli_ppt_applies, mli_flags, mli_note, and rates (dividend/interest/royalty).
- All rates marked `verified: false` — populated from professional commentary, pending confirmation against treaty PDFs.
- Key rate nuances captured: flat-rate countries (Italy, Hungary, Bulgaria, Japan); 0% dividend rates post-EU P-S Dir alignment (Cyprus, Denmark, Ireland, Malta, Luxembourg); VERIFY MLI cases (Netherlands, Sweden, Switzerland).

### src/agents/WhtEnvironment.ts — updated
- TypeScript interfaces: DividendRate, FlatRate, TreatyRates, TreatyEntry, TreatyDatabase.
- ALIASES map + normalise() helper (handles UK/USA/Czechia/Holland etc.).
- Constructor: live mode loads treaties.json via fs.readFileSync + path.join(__dirname, ...).
- checkTreaty (live): lookup by normalised country key; returns treaty metadata + MLI status.
- getTreatyRate (live): handles dividend (threshold logic incl. flat-rate), interest, royalty; surfaces verified flag and notes.
- checkMliPpt (live): VERIFY treated conservatively as NO with caution message.
- checkEntitySubstance: stays simulated permanently (Phase 5 — Python document ingestion).

### src/agents/WhtEnvironment.test.ts — updated
- 14 new live-mode tests added (35 total across all files, all green).
- Covers: alias resolution (UK), Germany EXCLUDED_BY_POLAND flag, Italy NOT_RATIFIED, flat-rate logic (Italy), VERIFY→NO conservative handling (Netherlands).

---

## Roadmap — What Comes Next

### Phase 2 — Real input ✓ COMPLETE
- `AgentInput` interface + `validateInput()` + `buildTaskString()` added to BeneficialOwnerAgent.ts.
- `parseInput()` reads `--input <file>` from process.argv; exits cleanly with usage hint if missing.
- `data/example_input.json` is the Alpine Holdings demo (Luxembourg, dividend, 25%).
- `data/orange_polska_royalty.json` is the first real-world test case (Orange S.A., France, royalty, 50.67%).
- `WhtEnvironment` switched to `simulate: false` — live treaty data active.
- Three new tools added this session: `analyse_dempe`, `check_directive_exemption`, `check_pay_and_refund`.
- 52 tests passing.
- Usage: `npm run tax:agent -- --input data/orange_polska_royalty.json`

### Phase 3 — Real output ✓ COMPLETE
- `resolveOutputPath()` — auto-generates `reports/<entity_slug>_<date>.json`; `--output <path>` overrides.
- `parseFindings()` — parses tool result strings back to objects so the report is fully machine-readable.
- `saveReport()` — creates the `reports/` directory if needed, writes JSON with `generated_at`, input fields, `conclusion`, and `findings`.
- Report saved on both `terminate` (full answer) and `maxIterations` (partial, with incomplete flag).
- `reports/` added to `.gitignore`.
- Usage: `npm run tax:agent -- --input data/orange_polska_royalty.json`
- Override: `npm run tax:agent -- --input data/orange_polska_royalty.json --output path/to/report.json`

### Phase 4 — Substance test refinement ✓ COMPLETE

- `buildEntityProfile()` private method: entity-aware simulation for known entities.
  - Orange S.A. (France) → large_operating_company, STRONG tier, all 3 BO conditions PASS.
  - Alpine Holdings S.A. (Luxembourg) → holding_company, WEAK tier, condition (ii) FAIL (factual pass-through).
  - Unknown entity → conservative CONDUIT fallback, all conditions UNCERTAIN.
- `checkEntitySubstance` now returns `SubstanceResult` with:
  - `substance_factors` — 6 universal MF Objaśnienia §2.3 criteria
  - `conduit_indicators` — 4 red flags per MF Objaśnienia §2.2.1
  - `substance_tier`: STRONG / ADEQUATE / WEAK / CONDUIT
  - `bo_preliminary` — per-condition result + overall for Art. 4a pkt 29 CIT 3-condition test
  - `confidence`: LOW / MEDIUM / HIGH
- `AgentInput.related_party?: boolean` — explicit flag for check_pay_and_refund.
- `computeReportConfidence()` — derives LOW/MEDIUM/HIGH from findings; `data_confidence`
  and `data_confidence_note` added to every saved report.
- Art. 12(3) scope note added to France entry in treaties.json.
- 59 tests passing (8 new substance tests).
- Alpine Holdings case: 4 clean iterations, correct FAIL conclusion, confidence LOW.
- Orange S.A. case: 3 clean iterations, correct 0% Directive conclusion, confidence MEDIUM.

### Phase 5 — MATE improvements ✓ COMPLETE
- `LLM.fast()` / `LLM.powerful()` tier factories; `selectLlm()` in agent loop.
- `OPENAI_MODEL_FAST` / `OPENAI_MODEL_POWERFUL` env vars; backward-compatible.
- Environment-level parameter validation for all tools (invalid enum, out-of-range numbers, empty strings).
- 74 tests passing (15 new validation tests).

### Phase 6 — Python DDQ Extraction Service ✓ COMPLETE
- **Python/FastAPI microservice** (`python/service/`) with two endpoints:
  - `POST /substance` — reads DDQ text, extracts SubstanceResult via OpenAI structured outputs
  - `POST /dempe` — reads DDQ text, extracts DempeResult via OpenAI structured outputs
- **Pydantic models** (`python/service/models.py`) mirror TypeScript interfaces exactly;
  passed as `response_format` to OpenAI so the LLM output is schema-guaranteed.
- **LLM extraction** (`python/service/extractor.py`) uses `client.beta.chat.completions.parse()`
  with the Pydantic model — returns a typed SubstanceResult / DempeResult, never raw JSON.
- **System prompts** reference exact MF Objaśnienia §2.2.1 / §2.3 criteria and DEMPE framework.
- **TypeScript changes:**
  - `WhtEnvironmentOptions`: + `ddqServiceUrl?` and `ddqText?` fields
  - `checkEntitySubstance` and `analyseDempe` → `async`, call HTTP when service is configured;
    graceful fallback to simulation if service is down or not configured
  - `AgentInput`: + `ddq_path?: string` — path to a DDQ text file in the input JSON
  - `parseInput()` — returns `{ input, ddqText }` (loads DDQ file when `ddq_path` is set)
  - Agent loop dispatch → `await` the two async tool methods
- **Sample DDQ** (`data/ddqs/orange_sa_ddq.txt`) — realistic 10-section questionnaire for
  Orange S.A. covering all 6 substance factors, all DEMPE functions, and BO conditions.
- **`orange_polska_royalty.json`** — updated with `"ddq_path": "data/ddqs/orange_sa_ddq.txt"`.
- **`.env.example`** — documents `DDQ_SERVICE_URL` with setup instructions.
- **`npm run ddq:service`** — starts the Python service via `python/run.py`.
- **74 tests passing** — all substance/DEMPE tests updated to `async/await`, all green.
- Backward compatible — `DDQ_SERVICE_URL` not set → simulation as before.

### Phase 7 — FactChecker Agent (Gemini + Google Search) ✓ COMPLETE
- **`src/agents/FactCheckerAgent.ts`** — specialist agent using Gemini REST API with `google_search` tool.
  - `verify(entityName, country, claims[])` → `FactCheckResult`
  - Triangulation Rule: 2+ sources = VERIFIED, 1 = UNVERIFIED, 0 = CONTRADICTED
  - Adapted from WHT Substance Verifier persona: scope narrowed to 5 WHT-relevant fact categories
  - Output is strict JSON (machine-readable, stored in WHT agent findings)
  - 3-strategy JSON extraction: raw → markdown fence → first-to-last brace
  - Graceful fallback to INCONCLUSIVE simulation when GEMINI_API_KEY is absent
- **`fact_check_substance` tool** added to WHT agent — calls FactCheckerAgent from the tool dispatch.
  - Agent calls it after `check_entity_substance` when source indicates real DDQ data (not simulated)
  - Result stored as `fact_check_result` finding, triggers `selectLlm` switch to powerful tier
- **`computeReportConfidence`** updated: fact-check CONFIRMS → can upgrade to HIGH; UNDERMINES → unconditionally LOW
- **`WhtEnvironment.factCheckSubstance`** — validates params, delegates to FactCheckerAgent, returns JSON string
- **86 tests passing** (8 new FactCheckerAgent tests + 4 factCheckSubstance environment tests)
- To activate: set `GEMINI_API_KEY=...` and `GEMINI_MODEL=gemini-2.0-flash` in `.env`

### Unresolved: treaty rate verification
- All 36 entries in treaties.json have `verified: false`.
- Priority check list: Luxembourg (2012 Protocol changes), Cyprus (0% threshold), Ireland, Germany, Netherlands.
- Source: the actual treaty PDFs — use the DzU references in the JSON to find the official texts.

---

## Open Questions
- Whether to add a confidence score to the agent's conclusion.
- Whether to build a minimal web UI or keep CLI-only.
- OECD MLI Matching Database check needed for Netherlands, Sweden, Switzerland (VERIFY cases).

---

## Key Architecture Decisions
- GAME framework for all agents.
- WhtEnvironment is the isolation boundary — simulate→live is one flag change.
- treaties.json is the live data store (static, manually maintained); replaces simulated hardcoded data.
- Conservative MLI rule: VERIFY status → mli_applies: false (with caution message surfaced to agent).
- checkEntitySubstance stays simulated permanently — replaced by Phase 5 Python ingestion.
- Phase 5 document ingestion: Python component (FastAPI or similar), called from TypeScript as a tool.
- node:test (built-in) for testing — no extra dependencies.
