# tax-agent-ai — Claude Context

## What This Project Is

A learning project with two parallel goals:
1. **Learning goal** — work through the TypeScript AI Agents Course (Jules White) step by step
2. **Business goal** — apply every lesson to a real Finance use case: a Beneficial Owner Analysis Agent for withholding tax (WHT) purposes

The learner is new to TypeScript and to agentic AI. Explain all code in detail.
Always walk through changes step by step. Never skip explanations.

---

## Course Structure

| Module | Topic | Status |
|---|---|---|
| Module 1 | Programmatic prompting + Agent Loop | Not started |
| Module 2 | Function calling / tools | Not started |

Course repo (reference only — do not clone into this project):
https://github.com/juleswhite/typescript-ai-agents-course

---

## Business Context: Withholding Tax (WHT) Agent

**The problem:** When a Polish entity pays dividends, interest, or royalties to a foreign beneficial owner, it must apply the correct withholding tax rate. The rate depends on:
- The tax treaty between Poland and the owner's country of residence
- Whether the owner meets the "beneficial owner" test
- MLI (Multilateral Instrument) modifications to the treaty

**The agent's job:** Given entity data, determine the correct WHT rate and whether the beneficial owner test is met.

This business case is applied progressively:
- Module 1 → agent asks questions and reasons about WHT rules (no tools yet)
- Module 2 → agent calls real tools (lookup treaty rates, check MLI status)

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

---

## Project Structure

```
src/
  shared/
    Message.ts       ← Message class (system/user/assistant factory methods)
    LLM.ts           ← LLM class (wraps OpenAI API, reads key from .env)
    index.ts         ← re-exports Message and LLM for clean imports
  module1/
    ProgrammaticPrompting.ts   ← Lesson 1: basic prompting exercises
    AgentLoop.ts               ← Lesson 2: first agent with loop
  module2/
    FunctionCallingExample.ts  ← Lesson 3: tools / function calling
  agents/
    BeneficialOwnerAgent.ts    ← The real tax agent (built progressively)
```

---

## Environment Variables

| Variable | Purpose | File |
|---|---|---|
| OPENAI_API_KEY | OpenAI authentication | .env (never commit) |
| OPENAI_MODEL | Model name (default: gpt-4o-mini) | .env |

`.env` is in `.gitignore` — it will never be committed to GitHub.

---

## npm Scripts

| Command | What it runs |
|---|---|
| `npm run build` | TypeScript type-check (no output files) |
| `npm run module1:prompting` | Lesson 1 prompting exercises |
| `npm run module1:agent` | Lesson 1 agent loop |
| `npm run module2:tools` | Lesson 2 function calling |
| `npm run tax:agent` | The beneficial owner tax agent |

---

## Key Conventions

### TypeScript
- `strict: true` is on — never use `any`
- Always run `npm run build` before committing — zero errors required
- Use `async/await` for all LLM calls (they are always asynchronous)
- All functions must have explicit return types

### Imports
- Always import shared utilities from `'../shared'` (not from individual files)
- Always call `dotenv.config()` at the top of any entry-point file

### Git
- Never commit `.env` or any file containing API keys
- Always stage files by name — never `git add .`
- Commit messages: present tense, under 60 characters, specific
- Branch per feature or module

### Explanations
- The learner is new to TypeScript — always explain what new syntax means
- When introducing a concept, explain it before writing the code

---

## GitHub

Repository: https://github.com/fmochnacz-roul-duke/tax-agent-ai

---

## Session State

See SESSION.md for current progress, what was done last session, and what comes next.
