# Session State

## Current Status
**Phase:** Phase 14 complete (2026-04-02). Phase 15 (QA-3: Evals + Negative Tests) is next.
**Last code session:** Phase 14 — Ghost Activation (v0.17.0, 2026-04-02)
**Branch:** master
**Tests:** 251/251 passing

---

## How to Resume Next Session

Open Claude Code in `C:\Users\fmoch\projects\tax-agent-ai\` and say:

> "Let's start Phase 15 — QA-3: Evals + Negative Tests. Create data/golden_cases/ with 5
> golden cases, a runEvals.ts script, and negative test cases for the agent."

### Verify environment is healthy first:
```
git checkout master
npm run build    ← zero errors
npm test         ← 246/246 passing
npm start        ← web UI at http://localhost:3000
```

---

## Revised Roadmap (Phases 14–29)

Roadmap restructured after a full strategy review (2026-04-02). Expanded from 7 to 16 phases across 3 arcs. Each phase = one session. End of every session: update all knowledge files + push to GitHub.

### Arc 1 — WHT Core Completion (Phases 14–22)

| Phase | Title | Key deliverable |
|---|---|---|
| **14** | **Ghost Activation** | `TreatyVerifierAgent` in live agent flow; `last_verified` in RAG output; confidence → LOW on rate mismatch |
| 15 | QA-3: Evals + Negative Tests | `data/golden_cases/` (5 cases); `scripts/runEvals.ts`; bo_overall + confidence calibration checks; negative tests |
| 16 | Legal Source Hierarchy | `source_type` param on `consult_legal_sources`; Art./Sec. refs in `Citation`; `legal_hierarchy` field; Zod domain-narrowing |
| 17 | Confidence UX + HITL | UI grey-out for LOW confidence; "Draft Only" watermark; auto-`review_status: 'draft'` on UNCERTAIN/LOW |
| 18 | UC2 Third-party Vendor Workflow | `classify_vendor_risk` tool; document checklist per payment type; no-DDQ path |
| 19 | Due Diligence Module | DD checklist tool per payment type; DD gap analysis in `WhtReport` |
| 20 | Data Quality Pass | Verify top-10 treaty rates against official sources; `verified: true` in treaties.json |
| 21 | Batch Processing | `--batch payments.csv` CLI; multi-entity summary report; registry cache |
| 22 | Production Hardening | Session persistence; SSE reconnect; rate limiting; memory pruning (`maxMessageHistory`) |

### Arc 2 — WHT Professional Features (Phases 23–26)

| Phase | Title | Key deliverable |
|---|---|---|
| 23 | Intangibles / Business Profits Layer | Art. 21 ust. 1 pkt 2a CIT — management fees, advisory, technical services; PE analysis hook |
| 24 | Legal Source Management Workflow | Source update protocol; new source onboarding guide; `last_verified` update workflow |
| 25 | Jurisdiction Expansion | treaties.json 36 → 50+ countries |
| 26 | WHT v1.0 Major Review | End-to-end demo (UC1 + UC2); all acceptance criteria; CHANGELOG v1.0; MBA prototype declaration |

### Arc 3 — Tax OS Foundation (Phases 27–29)

| Phase | Title | Key deliverable |
|---|---|---|
| 27 | GLOBAL VISION Documentation | `docs/GLOBAL_VISION.md` (gitignored); Tax OS architecture, legal hierarchy, system prompt guidelines |
| 28 | EU Jurisdiction Engine Concept | Architecture for multi-jurisdiction; pilot jurisdiction (Germany or Netherlands); Module 2 scope |
| 29 | Tax OS Module 2 Planning | Next tax regime scoping; cross-module framework; Tax OS v1.0 roadmap |

---

## Ghost / Inactive Items (as of v0.17.0)

1. **`verified_at` / `verified_sources` / `verification_note`** on `DividendRate` and `FlatRate`
   interfaces in `WhtEnvironment.ts`. These become meaningful once Phase 20 (Data Quality Pass)
   runs real verifications and writes confirmed rates back to `treaties.json`.

All 36 treaty rates remain `verified: false` pending Phase 20 manual verification against
official Polish treaty PDFs (DzU references).

---

## Completed Phases (full history)

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
