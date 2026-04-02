# Session State

## Current Status
**Phase:** DOCS-2 COMPLETE — last_verified frontmatter on RAG source files.
**Date of last session:** 2026-04-02
**Branch:** master (feature/docs2-last-verified merged, tagged v0.16.0)
**Tests:** 246/246 passing

---

## How to Resume Next Session

Open Claude Code in `C:\Users\fmoch\projects\tax-agent-ai\` and say:

> "Let's start Phase 14 — Ghost Activation. Wire TreatyVerifierAgent into the live agent
> flow and surface last_verified in consult_legal_sources results."

### Verify environment is healthy first:
```
git checkout master
npm run build    ← zero errors
npm test         ← 246/246 passing
npm start        ← web UI at http://localhost:3000
```

---

## 7-Session Roadmap (Phases 14–20)

After completing v0.16.0, all planned phases from the original roadmap are done.
The next 7 sessions address ghost/inactive functions and move toward tax-team readiness.

| Session | Phase | Title | Key deliverable |
|---|---|---|---|
| **1** | **14** | **Ghost Activation** | `TreatyVerifierAgent` wired into live agent flow; `last_verified` surfaced in RAG tool results |
| 2 | 15 | Third-party vendor UC2 | `classify_vendor_risk` tool; document checklist; lightweight non-DDQ workflow |
| 3 | 16 | Batch processing | `--batch payments.csv` CLI; multi-entity summary report; registry cache hits |
| 4 | 17 | Data quality pass | Verify top-10 treaty rates against DzU PDFs; update `verified: true` in treaties.json |
| 5 | 18 | Jurisdiction expansion | Expand treaties.json 36 → 50+ countries |
| 6 | 19 | Production hardening | Session persistence, SSE reconnect, rate limiting, error recovery |
| 7 | 20 | Major review | End-to-end demo; full docs pass; Tax OS Module 2 planning |

*After session 7: major review before the next phase roadmap is set.*

---

## Ghost / Inactive Items (as of v0.16.0)

These exist in the codebase but are not active in the main agent flow:

1. **`TreatyVerifierAgent.verifyRate()`** — has 15 tests, batch script `scripts/verifyTreaties.ts`
   uses it. NEVER called from `BeneficialOwnerAgent` or `WhtEnvironment`. All 36 treaty rates
   remain `verified: false`. Phase 14 fixes this.

2. **`last_verified` on Chunk / CitedChunk** — parsed by Chunker (v0.16.0), stored on every
   chunk. But `consultLegalSources` tool result text does NOT include this field. The agent and
   user never see it. Phase 14 surfaces it in the formatted tool result.

3. **`verified_at` / `verified_sources` / `verification_note`** on rate interfaces — added to
   `DividendRate` and `FlatRate` in `WhtEnvironment.ts`. The `getTreatyRate` output already
   includes `verification_note` conditionally. These become meaningful once Phase 17 runs
   the real verification.

---

## Completed Phases (full history)

### Phase 14 — Not yet started
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
- `last_verified` in RAG tool result: currently parsed but not surfaced (Phase 14).
