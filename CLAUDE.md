# tax-agent-ai — Claude Context

## What This Project Is

A project with two parallel goals:
1. **Learning goal** — work through different AI courses from Vanderbilt University (by Jules White) step by step
2. **Business goal** — build a real Beneficial Owner Analysis Agent for Polish withholding tax (WHT) purposes

The project has graduated from pure learning exercise to a product-grade agent foundation.
Modules 1–3 are complete. Future sessions focus on connecting real data sources.

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

**Current state:** The agent runs end-to-end using simulated tool data.
Every tool result includes a `source` field marking what real data source would replace it.
The `WhtEnvironment` class has a `simulate: true/false` switch — the only change needed
when connecting real APIs.

**The GAME breakdown:**
- G — Goals: `src/agents/BeneficialOwnerAgent.ts` (4 goals with priorities)
- A — Actions: tool definitions with JSON Schema in the same file
- M — Memory: `src/shared/Memory.ts` (conversation + structured findings)
- E — Environment: `src/agents/WhtEnvironment.ts` (all tool implementations)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | ^6.0 |
| Runtime | Node.js | v18+ |
| AI SDK | OpenAI SDK | ^6.0 |
| Model | gpt-4o-mini | via .env |
| Env vars | dotenv | ^17.0 |
| Runner | ts-node | ^10.0 |
| Testing | node:test (built-in) | Node 18 |

---

## Project Structure

```
src/
  shared/
    Message.ts    ← 4 roles: system/user/assistant/tool; StoredToolCall for round-tripping
    LLM.ts        ← generate() and generateWithTools(); Tool/ToolCall/LLMResponse types; ToolFactory
    Goal.ts       ← Goal interface; buildSystemPrompt() generates prompt from goals + priorities
    Memory.ts     ← Conversation history + key/value findings store; buildFindingsSummary()
    index.ts      ← re-exports everything from shared

  agents/
    BeneficialOwnerAgent.ts  ← Product-grade WHT agent (GAME framework, all 4 components)
    WhtEnvironment.ts        ← All tool implementations; simulate: true/false switch
    WhtEnvironment.test.ts   ← Unit tests for all environment methods

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
```

---

## Environment Variables

| Variable | Purpose | File |
|---|---|---|
| OPENAI_API_KEY | OpenAI authentication | .env (never commit) |
| OPENAI_MODEL | Model name (default: gpt-4o-mini) | .env |

---

## npm Scripts

| Command | What it runs |
|---|---|
| `npm run build` | TypeScript type-check (no output files) — run before every commit |
| `npm test` | Unit tests — 21 tests, no API calls, ~1.7s |
| `npm run tax:agent` | Product-grade WHT agent (GAME framework) |
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
- Always run `npm test` — all 21 tests must pass
- Use `async/await` for all LLM calls
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

### Explanations
- The learner is new to TypeScript — always explain what new syntax means
- When introducing a concept, explain it before writing the code

---

## GitHub

Repository: https://github.com/fmochnacz-roul-duke/tax-agent-ai

---

## Session State

See SESSION.md for current progress, what was done last session, and what comes next.
