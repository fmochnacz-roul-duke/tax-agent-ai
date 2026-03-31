# Session State

## Current Status
**Phase:** Phase 1 complete — live treaty data wired into the agent.
**Date of last session:** 2026-03-31
**Branch:** master (all work merged and pushed)

---

## How to Resume Next Session

Open Claude Code in `C:\Users\fmoch\projects\tax-agent-ai\` and say:

> "Read SESSION.md and let's continue where we left off."

Then verify the environment is healthy:
```
npm run build    ← zero errors
npm test         ← 35/35 passing
npm run tax:agent  ← runs the WHT agent end-to-end (still simulate mode for substance)
```

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

### Phase 2 — Real input
- Replace hardcoded task string in BeneficialOwnerAgent.ts with CLI prompt or structured JSON input.
- Accept: entity name, country, income type, shareholding %, substance facts.
- Suggested: `npm run tax:agent -- --input entity.json`

### Phase 3 — Real output
- Structured JSON report saved to file (the `memory.getFindings()` block is already there).
- Optional: PDF/Word export.

### Phase 4 — Broader agent coverage
- Add domestic exemption check (Art. 22 CIT Act — participation exemption).
- Add confidence score to conclusion.
- Extend royalty income analysis.

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
