# Session State

## Current Status
**Phase:** Phases 2, 3 complete. Agent fixes applied. Ready for Phase 4.
**Date of last session:** 2026-03-31
**Branch:** master (all work merged and pushed)

---

## How to Resume Next Session

Open Claude Code in `C:\Users\fmoch\projects\tax-agent-ai\` and say:

> "Let's start where we've stopped — it's time to build Phase 4."

Then verify the environment is healthy:
```
npm run build                                                     ← zero errors
npm test                                                          ← 52/52 passing
npm run tax:agent -- --input data/orange_polska_royalty.json      ← runs end-to-end in ~5 iterations
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

### Phase 4 — Substance test refinement (NEXT)
**Start here next session.**

Current `checkEntitySubstance` returns hardcoded Alpine Holdings data regardless of input entity.
The agent ran the Orange S.A. case and got back Luxembourg premises + German parent — misleading.

Work to do:
1. **Define concrete substance criteria** aligned with:
   - Art. 26 Polish CIT Act (beneficial owner: own benefit, economic risk, decision-making, not conduit)
   - MLI PPT substance requirements (genuine activity, local board, no pass-through obligation)
   - OECD TP Guidelines Ch. VI DEMPE substance (for royalty cases)
2. **Build a scoring/risk-tier model**: STRONG / ADEQUATE / WEAK / CONDUIT
3. **Make simulated data entity-aware** — different profiles for operating companies vs. holding vehicles vs. IP holdcos
4. **Add confidence score** to the final conclusion (HIGH / MEDIUM / LOW based on verified vs. simulated findings)
5. Verify Art. 12 scope for 1975 Poland–France DTC against the official DzU text

### Phase 5 — Document ingestion (Python)
- Accept DDQ as text/PDF input instead of hardcoded substance data.
- Python component (e.g. FastAPI microservice) that the TypeScript agent calls as a tool.

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
