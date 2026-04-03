# tax-agent-ai — Claude Context

## What This Project Is

A product-grade AI agent for Polish withholding tax (WHT) beneficial owner analysis.
Runs as a conversational web application (`npm start`) or CLI (`npm run tax:agent`).
Part of an MBA research project: *AI and Digital Transformation in International Tax* (2026).

Frank is new to TypeScript. Explain all code in detail.
Always walk through changes step by step. Never skip explanations.

---

## Business Context: Withholding Tax (WHT) Agent

**The problem:** When a Polish entity pays dividends, interest, or royalties to a foreign
beneficial owner, it must apply the correct withholding tax rate. The rate depends on:
- The tax treaty between Poland and the owner's country of residence
- Whether the owner meets the "beneficial owner" test (Art. 26 Polish CIT Act)
- MLI modifications — specifically the Principal Purpose Test (Article 7)

**Current state:** The agent runs end-to-end with a conversational browser UI. Treaty data is live
(36 countries). Substance and DEMPE tools are live when the Python DDQ service is running, or fall
back to simulation automatically. FactChecker is live when `GEMINI_API_KEY` is set.

**The GAME breakdown:**
- G — Goals: `src/agents/BeneficialOwnerAgent.ts` (7 goals with priorities)
- A — Actions: 10 tool definitions with JSON Schema in the same file
- M — Memory: `src/shared/Memory.ts` (conversation + structured findings)
- E — Environment: `src/agents/WhtEnvironment.ts` (all tool implementations)

**MATE design principles applied:**
- M — Model Efficiency: `LLM.fast()` / `LLM.powerful()` tiers; `selectLlm()` in agent loop; configured via `OPENAI_MODEL_FAST` / `OPENAI_MODEL_POWERFUL`
- A — Action Specificity: narrow tools, enum constraints, server-side validation in every Environment method
- T — Token Efficiency: `buildFindingsSummary()` compact injection; duplicate-call guard
- E — Environmental Safety: `maxIterations` valve; parameter validation returns structured errors

**Phase roadmap:**

| Phase | Description | Status |
|---|---|---|
| 1–3 | Live treaty data, real CLI input, JSON report output | ✓ Complete |
| 4 | Entity-aware substance profiles, three-condition BO test, DEMPE, Pay and Refund | ✓ Complete |
| 5 | MATE improvements — model tiering (LLM.fast/powerful), environment-level parameter validation | ✓ Complete |
| 6 | Document ingestion — Python/FastAPI microservice for DDQ substance and DEMPE extraction | ✓ Complete |
| 7 | FactChecker Persona Agent — Gemini + Google Search grounding, multi-agent call_agent pattern | ✓ Complete |
| 8 | Conversational web UI — Express server, InputExtractor, SSE progress streaming | ✓ Complete |
| 9 | Legal Knowledge RAG — tax taxonomy, Chunker/Embedder/Retriever/LegalRagService, consult_legal_sources tool | ✓ Complete |
| 10 | Substance interview — 5-question chat flow, TypeScript LLM extractor, any entity assessed | ✓ Complete |
| 11 | Entity Registry — JSON persistence, audit trail, collapsible web UI panel | ✓ Complete |
| 12a | TreatyVerifierAgent — Gemini rate verification, batch verify script | ✓ Complete |
| 12b | Human review workflow — review drawer, `/registry/review` endpoint, CLI list | ✓ Complete |
| 13 | Provenance/citations field on `WhtReport`; RAG legal grounding gate in confidence scoring | ✓ Complete |
| QA-1 | ESLint + Prettier + `npm run lint`; c8 coverage; build-as-precondition; treaty snapshot test | ✓ Complete |
| QA-2 | Zod runtime validation; Python/TS contract tests for `SubstanceResult` / `DempeResult` | ✓ Complete |
| DOCS-1 | CHANGELOG.md + LICENSE + SECURITY.md | ✓ Complete |
| DOCS-2 | `docs/api.md`; `last_verified` frontmatter on RAG source files | ✓ Complete |
| GITHUB-1 | `.github/` issue template + PR template; README feedback section + docs table | ✓ Complete |
| 14 | Ghost Activation — wire TreatyVerifierAgent into live flow; surface `last_verified`; confidence drops on rate mismatch | ✓ Complete |
| 15 | QA-3: Evals + Negative Tests — `BoOverall` type; `bo_overall`+`conduit_risk` on `WhtReport`; `data/golden_cases/` (9 cases); `scripts/runEvals.ts`; Triangulation Rule; 8 negative tests; Brazil in treaties.json | ✓ Complete |
| DOCS-3 | Documentation polish — `CONTRIBUTING.md`; quickstart + disclaimer up top; `docs/README.md` index; `docs/FAQ.md`; `SECURITY.md` gaps; README badges + roadmap sync | ✓ Complete |
| 16 | Legal Source Hierarchy — `source_type` on `consult_legal_sources`; `source_type`+`legal_hierarchy` in RAG results + `Citation`; Zod `SourceTypeSchema`; `source_type` filter in `Retriever` | ✓ Complete |
| 17 | Confidence UX + HITL — `DRAFT ONLY` banner + grey-out for LOW confidence; `bo_overall` + conduit risk in report card; force-draft on UNCERTAIN/LOW | ✓ Complete |
| 18 | UC2 Third-party Vendor Workflow — `classify_vendor_risk` tool; risk-routing goal; progressive document checklist; no-DDQ path for LOW tier | ✓ Complete |
| 19 | Due Diligence Module + Negative Evidence Gate — `check_due_diligence` tool; `data/due_diligence_checklists.json`; `DdGapAnalysis` on `WhtReport`; Negative Evidence Gate in confidence scoring | ✓ Complete |
| QA-4 | Eval Harness v2.0 — update `runEvals.ts` for v2.0 case structure (`sttr_topup_applies`, `rate_basis`); case status filtering (`active`/`scaffold`); EU27 rate verification for cases 13–31 | Planned |
| 20 | Data quality — verify top-10 treaty rates against official PDFs; `verified: true` in treaties.json | Planned |
| 21 | Batch processing — `--batch payments.csv` CLI; multi-entity summary report; `scripts/runBatch.ts`; sequential processing; timestamped output dir + summary CSV | Planned |
| 22a | Temporal Context — `payment_year` parameter on `AgentInput`; STTR/KSeF temporal gating | Planned |
| 22b | Production Hardening — session persistence (`express-session`); SSE reconnect; rate limiting (`express-rate-limit`) | Planned |
| 23a | Intangibles — Legal & Data Layer: Art. 21.1.2a CIT framework; treaty classification (Art. 7 vs Art. 12); MDR hallmarks (Art. 86a-86o Ord.pod.); RAG enrichment; IC vs. 3rd-party paths | Planned |
| 23b | Intangibles — Code Layer: new `payment_type` options; `ServiceClassifier.ts` AI questionnaire; `check_mdr_obligation` tool; PE hook | Planned |
| 23c | GAAR Tool: Art. 119a Ordynacja podatkowa risk flag; separate tool in `WhtEnvironment.ts`; TBD scope | Planned |
| 24 | Legal Source Management Workflow — source update protocol; new source onboarding; hierarchy documentation; NSA/CJEU case law RAG ingestion | Planned |
| 24b | PIT & Hybrid Entities Expansion — `recipient_type: 'ENTITY' \| 'INDIVIDUAL' \| 'PARTNERSHIP'`; Art. 29/30a PIT WHT; IFT-1/1R form guidance; UK LLP transparency; B2B ghost detection — **HIGH COMPLEXITY: touches every system component; scope carefully before starting** | Planned |
| 25 | Jurisdiction expansion — treaties.json 36 → 50+ countries | Planned |
| 26 | WHT v1.0 Major Review — end-to-end demo, all acceptance criteria, `CHANGELOG.md` v1.0, MBA prototype declaration | Planned |
| 27 | GLOBAL VISION Documentation — private `docs/GLOBAL_VISION.md` (gitignored); Tax OS architecture + system prompt guidelines | Planned |
| 28 | EU Jurisdiction Engine Concept — architecture for multi-jurisdiction; pilot jurisdiction design; Tax OS Module 2 scope | Planned |
| 29 | Tax OS Module 2 Planning — next tax regime scoping; cross-module shared framework design | Planned |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | ^6.0 |
| Runtime | Node.js | v18+ |
| AI SDK | OpenAI SDK | ^6.0 |
| Model (fast tier) | gpt-4o-mini | via OPENAI_MODEL_FAST |
| Model (powerful tier) | gpt-4o | via OPENAI_MODEL_POWERFUL |
| FactChecker model | gemini-2.0-flash | via GEMINI_MODEL |
| Web server | Express | ^5.0 |
| DDQ extraction | Python 3.10+ / FastAPI / uvicorn | optional |
| Env vars | dotenv | ^17.0 |
| Runner | ts-node | ^10.0 |
| Testing | node:test (built-in) | Node 18 |

---

## Project Structure

```
src/
  shared/
    Message.ts    ← 4 roles: system/user/assistant/tool; StoredToolCall for round-tripping
    LLM.ts        ← generate() and generateWithTools(); LLM.fast()/LLM.powerful() tier factories; ToolFactory
    Goal.ts       ← Goal interface; buildSystemPrompt() generates prompt from goals + priorities
    Memory.ts     ← Conversation history + key/value findings store; buildFindingsSummary()
    index.ts      ← re-exports everything from shared

  agents/
    BeneficialOwnerAgent.ts     ← WHT agent (GAME); exports runWhtAnalysis(), AgentInput, WhtReport, Citation
    BeneficialOwnerAgent.test.ts ← Phase 13 + QA-2: 36 tests (validateInput, computeReportConfidence, parseFindings)
    WhtEnvironment.ts           ← All 10 tool implementations + verifyTreatyRate helper; simulate: true/false; DDQ service + FactChecker
    WhtEnvironment.test.ts      ← Unit tests for all tool implementations (~96 tests)
    FactCheckerAgent.ts         ← Phase 7: Gemini REST API + Google Search grounding; simulate fallback
    FactCheckerAgent.test.ts    ← 8 tests, simulate mode
    TreatyVerifierAgent.ts      ← Phase 12a: Gemini rate verification; verifyRate() + simulate fallback
    TreatyVerifierAgent.test.ts ← 15 simulate-mode tests
    contracts.ts                ← QA-2: SubstanceResultSchema + DempeResultSchema (Zod v4); SubstanceResult type
    contract.test.ts            ← QA-2: 13 tests — simulation output vs. Zod + Python contract.json
    treaties.snapshot.test.ts   ← QA-1: SHA-256 hash guard for treaties.json

  server/
    index.ts                  ← Phase 8+10+11+12b: Express server; review endpoints; interview state
    InputExtractor.ts         ← Phase 8: LLM extracts AgentInput from free-form user text
    SubstanceInterviewer.ts   ← Phase 10: 5-question interview state machine; compiles DDQ text
    SubstanceExtractor.ts     ← Phase 10: TypeScript LLM extractor — DDQ text → SubstanceResult JSON
    EntityRegistry.ts         ← Phase 11+12b: JSON-backed registry; upsert + audit trail + review workflow
    EntityRegistry.test.ts    ← 48 unit tests (save/findBy/listAll/updateReviewStatus/force-draft)

  public/
    index.html    ← Phase 8: single-file conversational chat UI (HTML + CSS + vanilla JS)

  shared/
    Goal.test.ts    ← Unit tests: priority sorting, prompt generation
    Memory.test.ts  ← Unit tests: findings store, summary, copy isolation

python/
  service/
    main.py      ← FastAPI app: POST /substance, POST /dempe, GET /health
    extractor.py ← OpenAI structured outputs using Pydantic response_format
    models.py    ← Pydantic v2 models mirroring TypeScript interfaces
  run.py         ← uvicorn entry point; starts service on port 8000

data/
  treaties.json                   ← Live treaty database: 36 countries, rates, MLI flags
  due_diligence_checklists.json   ← Phase 19: required DD docs per payment type (dividend/interest/royalty)
  mli_flags_legend.md             ← Explanation of 10 MLI flag codes
  poland_dtt_list.csv        ← Full 91-country Polish treaty list with MLI cross-check
  example_input.json         ← Alpine Holdings demo (Luxembourg, dividend)
  orange_polska_royalty.json ← Orange S.A. real-world case (France, royalty)
  ddqs/
    orange_sa_ddq.txt        ← Sample DDQ for Orange S.A. (10 sections, all substance factors)

docs/
  agent-design-guide.md    ← Reusable patterns from building this agent
  architecture.md          ← Full project architecture explanation
```

---

## Environment Variables

| Variable | Purpose | Required? |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI authentication | **Required** |
| `OPENAI_MODEL` | Fallback model for both tiers | Required if tier-specific vars not set |
| `OPENAI_MODEL_FAST` | Fast tier (simple lookups) | Optional — falls back to OPENAI_MODEL |
| `OPENAI_MODEL_POWERFUL` | Powerful tier (legal synthesis) | Optional — falls back to OPENAI_MODEL |
| `DDQ_SERVICE_URL` | URL of Python DDQ extraction service | Optional — substance/DEMPE fall back to simulation |
| `GEMINI_API_KEY` | Gemini API key for FactChecker | Optional — fact check falls back to simulation |
| `GEMINI_MODEL` | Gemini model name | Optional — defaults to `gemini-2.0-flash` |
| `PORT` | Web server port | Optional — defaults to `3000` |

See `.env.example` for the complete configuration file with comments.

---

## npm Scripts

| Command | What it runs |
|---|---|
| `npm start` | **Web UI** at http://localhost:3000 — conversational chat interface |
| `npm run tax:agent` | CLI agent — requires `--input <file>` |
| `npm run ddq:service` | Python DDQ extraction service on port 8000 (optional) |
| `npm run build` | TypeScript type-check (no output files) — run before every commit |
| `npm test` | Unit tests — 326 tests, no API calls, ~5s |
| `npm run lint` | ESLint + Prettier check across all TS files |
| `npm run eval` | Run golden dataset evaluation harness (31 cases total; 9 active in harness — v2.0 harness pending QA-4) — requires `OPENAI_API_KEY` |
| `npm run test:coverage` | c8 coverage report (text + lcov) |
| `npm run test:snapshot:update` | Recompute SHA-256 hash of treaties.json after intentional changes |
| `npm run test:contract:update` | Regenerate python/service/contract.json after Pydantic model changes |
| `npm run verify:treaties` | Batch-verify treaty rates via Gemini (requires GEMINI_API_KEY) |
| `npm run review:list` | CLI: list all registry entries with `review_status: draft` |

---

## Key Conventions

### TypeScript
- `strict: true` is on — never use `any`; use `unknown` and narrow explicitly
- Always run `npm run build` before committing — zero errors required
- Always run `npm test` — all tests must pass (update count in this file after each phase: currently 326)
- Use `async/await` for all LLM calls and all Environment methods that call external services
- All functions must have explicit return types

### In-code doc-blocks
Every primary agent/RAG/server file should carry a file-level JSDoc comment at the top
linking it to its GAME component and the phase that introduced it. Format:
```typescript
/**
 * Phase N — Short phase title
 * GAME: [Goals | Actions | Memory | Environment] — one-line role description.
 * See docs/architecture.md for the full component map.
 */
```
Add this comment opportunistically when touching a file during a phase — not as a
dedicated sweep. New files created in a phase must always include it.

### Imports
- Always import shared utilities from `'../shared'` (not from individual files)
- Always call `dotenv.config()` at the top of any entry-point file

### Git
- **Branch per feature or module — always. Never commit directly to master.**
- Merge to master before starting the next branch
- Never commit `.env` or any file containing API keys
- Stage files by name — never `git add .`
- Commit messages: present tense, under 60 characters, specific

### Merge checklist (required before every master merge)
1. `npm run build` — zero TypeScript errors
2. `npm test` — all tests pass
3. `npm run lint` — no ESLint or Prettier violations
4. README.md roadmap table updated to reflect completed phase
5. SESSION.md updated (current status, how to resume, completed phases list)
6. CHANGELOG.md entry added for the phase
7. Test count in CLAUDE.md TypeScript section updated if tests were added
8. `docs/agent-design-guide.md` updated with any new architectural patterns introduced
- Always run build + tests before merging
- **Push to GitHub at the end of every session** (`git push`) — `git commit` is local only; GitHub does not update until you push

### Session-end knowledge checklist (run at the END of every session before closing)

This checklist ensures every knowledge file stays consistent. Apply it every time, not just when code changed. Frank should not have to ask for these updates — they are part of every session.

**Tier 0 — Always (takes 2 minutes):**
- [ ] `SESSION.md` — current status block updated (phase, version, test count, branch, date)
- [ ] `SESSION.md` — "How to Resume" section reflects next phase with correct branch name + test count
- [ ] `SESSION.md` — completed phase added to Completed Phases history with full bullet list
- [ ] `SESSION.md` — Revised Roadmap table updated (completed = ✓ vX.X.X, next = **bold**)
- [ ] `CLAUDE.md` — phase roadmap table updated (completed → ✓ Complete)
- [ ] `CLAUDE.md` — test count updated in TypeScript section AND npm scripts table
- [ ] Memory index updated in `~/.claude/projects/.../memory/project_context.md`

**Tier 1 — Code sessions (when TypeScript/Python was written):**
- [ ] `CHANGELOG.md` — v0.X.X entry with all changes listed under named sub-sections
- [ ] `docs/agent-design-guide.md` — new section added if a new architectural pattern was introduced
- [ ] `docs/api.md` — updated if new types exported from `BeneficialOwnerAgent.ts` or server endpoints added
- [ ] `docs/architecture.md` — updated if a new component, file, or data flow was added
- [ ] `wiki/Architecture.md` — updated to match `docs/architecture.md` (higher-level version)

**Tier 2 — Every session (takes 5 minutes):**
- [ ] `README.md` — roadmap table: last completed phase bold + version; next phase bold; no duplicate rows
- [ ] `wiki/Phase-Roadmap.md` — completed phase moved from Planned to Completed section with full detail
- [ ] `wiki/Home.md` — current version and test count updated if changed
- [ ] `docs/vision.md` — "Last updated" line updated; new strategic insights added if vision evolved

**Tier 3 — Data/planning sessions only:**
- [ ] `wiki/Tax-Taxonomy.md` — updated if new concept IDs added to taxonomy
- [ ] `wiki/Legal-Sources.md` — updated if new sources added to `data/legal_sources_registry.json`
- [ ] `data/knowledge_base/sources/TEMPLATE.md` — reviewed if a new RAG source was created
- [ ] RAG rebuild reminder noted if source files were modified

**Tier 4 — Strategic/vision sessions only:**
- [ ] `docs/vision.md` — SWOT/SOAR findings section updated with new insights
- [ ] `docs/vision.md` — acceptance criteria reviewed if phase scope changed significantly
- [ ] `docs/FAQ.md` — new entries added for questions that came up in the session

**Cross-consistency checks (spot-check before pushing):**
- Phase number consistency: CLAUDE.md roadmap table = SESSION.md roadmap = README.md roadmap = wiki/Phase-Roadmap.md
- Test count consistency: CLAUDE.md TypeScript section = CLAUDE.md npm scripts table = SESSION.md status block
- Version consistency: CHANGELOG.md latest version = SESSION.md status = docs/vision.md Last updated
- Next phase consistency: SESSION.md "How to Resume" = CLAUDE.md roadmap **bold** = README.md **bold** = wiki **bold**

### Agent design
- Follow the GAME framework: Goals / Actions / Memory / Environment
- All tool implementations go in an Environment class — never inline in the loop
- Always include a `source` field in tool results
- `ToolFactory.terminate()` for the stop signal — no text parsing
- `maxIterations` safety valve on every loop
- Test pure components (Environment, Memory, Goal builders) without LLM
- Export `runWhtAnalysis()` and types from the agent file; keep `main()` as a thin CLI wrapper
- Web server and CLI share the same agent core — no duplication

### Explanations
- Frank is new to TypeScript — always explain what new syntax means
- When introducing a concept, explain it before writing the code

---

## GitHub

Repository: https://github.com/fmochnacz-roul-duke/tax-agent-ai

---

## Session State

See SESSION.md for current progress, what was done last session, and what comes next.
