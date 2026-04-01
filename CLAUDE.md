# tax-agent-ai — Claude Context

## What This Project Is

A project with two parallel goals:
1. **Learning goal** — work through different AI courses from Vanderbilt University (by Jules White) step by step
2. **Business goal** — build a real Beneficial Owner Analysis Agent for Polish withholding tax (WHT) purposes

The project has graduated from pure learning exercise to a product-grade agent with a web UI.
Modules 1–3 and product phases 1–8 are all complete. The agent runs as a conversational web
application (`npm start`) or via CLI (`npm run tax:agent`).

The learner is new to TypeScript and to agentic AI. Explain all code in detail.
Always walk through changes step by step. Never skip explanations.

---

## Course Structure

| Module | Topic | Status |
|---|---|---|
| Module 1 | Programmatic prompting + text-based agent loop | **Complete** |
| Module 2 | Function calling, registerTool() pattern | **Complete** |
| Module 3 | GAME framework, unit testing, README agent | **Complete** |
| Module 4+ | TBD from course | Not started |

Course repo (reference only — do not clone into this project):
https://github.com/juleswhite/typescript-ai-agents-course

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
- A — Actions: 8 tool definitions with JSON Schema in the same file
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
| 10 | Substance interview — 5-question chat flow, TypeScript LLM extractor, any entity assessed | ✓ Complete |

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
    BeneficialOwnerAgent.ts  ← WHT agent (GAME framework); exports runWhtAnalysis(), AgentInput, WhtReport
    WhtEnvironment.ts        ← All tool implementations; simulate: true/false switch; DDQ service + FactChecker
    WhtEnvironment.test.ts   ← Unit tests for all environment methods (74 tests)
    FactCheckerAgent.ts      ← Phase 7: Gemini REST API + Google Search grounding; simulate fallback
    FactCheckerAgent.test.ts ← Unit tests for FactCheckerAgent (8 tests, simulate mode)

  server/
    index.ts                  ← Phase 8+10: Express web server; adds 'interviewing' state for substance interview
    InputExtractor.ts         ← Phase 8: LLM extracts AgentInput from free-form user text
    SubstanceInterviewer.ts   ← Phase 10: 5-question interview state machine; compiles DDQ text
    SubstanceExtractor.ts     ← Phase 10: TypeScript LLM extractor — DDQ text → SubstanceResult JSON

  public/
    index.html    ← Phase 8: single-file conversational chat UI (HTML + CSS + vanilla JS)

  module1/
    ProgrammaticPrompting.ts   ← Basic prompt, JSON output, multi-turn memory
    AgentLoop.ts               ← Text-based loop (THOUGHT/ACTION/FINAL ANSWER format)

  module2/
    FunctionCallingExample.ts      ← Single round-trip function calling demo
    AgentLoopFunctionCalling.ts    ← Agent class with registerTool() / Map dispatch

  module3/
    ReadmeAgent.ts    ← GAME framework applied to meta task: reads source, generates README

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
  treaties.json              ← Live treaty database: 36 countries, rates, MLI flags
  mli_flags_legend.md        ← Explanation of 10 MLI flag codes
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
| `npm test` | Unit tests — 99 tests, no API calls, ~2s |
| `npm run module1:prompting` | Module 1: prompting examples |
| `npm run module1:agent` | Module 1: text-based agent loop |
| `npm run module2:tools` | Module 2: function calling demo |
| `npm run module2:agent` | Module 2: registerTool() agent loop |
| `npm run module3:readme` | Module 3: README agent |

---

## Key Conventions

### TypeScript
- `strict: true` is on — never use `any`; use `unknown` and narrow explicitly
- Always run `npm run build` before committing — zero errors required
- Always run `npm test` — all 99 tests must pass
- Use `async/await` for all LLM calls and all Environment methods that call external services
- All functions must have explicit return types

### Imports
- Always import shared utilities from `'../shared'` (not from individual files)
- Always call `dotenv.config()` at the top of any entry-point file

### Git
- **Branch per feature or module — always. Never commit directly to master.**
- Merge to master before starting the next branch
- Never commit `.env` or any file containing API keys
- Stage files by name — never `git add .`
- Commit messages: present tense, under 60 characters, specific
- Always run build + tests before merging

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
- The learner is new to TypeScript — always explain what new syntax means
- When introducing a concept, explain it before writing the code

---

## GitHub

Repository: https://github.com/fmochnacz-roul-duke/tax-agent-ai

---

## Session State

See SESSION.md for current progress, what was done last session, and what comes next.
