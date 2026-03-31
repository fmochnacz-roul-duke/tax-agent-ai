# tax-agent-ai

A learning project with two parallel goals:

1. **Learning goal** — work through different AI courses on Coursera, drafting my diploma project for my MBA studies.
2. **Business goal** — apply every lesson to a real finance use case: a **Beneficial Owner Analysis Agent** for Polish withholding tax (WHT) purposes

---

## The business problem

When a Polish entity pays dividends, interest, or royalties to a foreign beneficial owner, it must apply the correct withholding tax rate. The rate depends on:

- The tax treaty between Poland and the owner's country of residence
- Whether the owner meets the **beneficial owner** test under Polish CIT law
- MLI (Multilateral Instrument) modifications to the treaty — specifically the **Principal Purpose Test** (Article 7)

The agent analyses an entity and payment, determines the correct WHT rate, and assesses beneficial owner and PPT risk — with every conclusion cited back to a specific treaty article and data source.

---

## Setup

**Prerequisites:** Node.js 18+, an OpenAI API key

```bash
git clone https://github.com/fmochnacz-roul-duke/tax-agent-ai.git
cd tax-agent-ai
npm install
```

Create a `.env` file in the project root:

```
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4o-mini
```

---

## Running the agent

```bash
# The main product — GAME-framework WHT agent
npm run tax:agent

# Module 1: basic prompting examples (single-shot, JSON output, multi-turn memory)
npm run module1:prompting

# Module 1: text-based agent loop (THOUGHT/ACTION/FINAL ANSWER format)
npm run module1:agent

# Module 2: function calling demo (single round-trip with tools)
npm run module2:tools

# Module 2: agent loop with registerTool() pattern
npm run module2:agent

# Module 3: README agent (reads source files, generates documentation)
npm run module3:readme

# Type-check all TypeScript
npm run build

# Unit tests (no API calls required)
npm test
```

---

## Project structure

```
src/
  shared/
    Message.ts       ← Message class: system / user / assistant / tool roles
    LLM.ts           ← LLM wrapper: generate() and generateWithTools()
    Goal.ts          ← Goal interface and buildSystemPrompt() — the G in GAME
    Memory.ts        ← Conversation history + structured findings — the M in GAME
    index.ts         ← Re-exports for clean imports

  agents/
    BeneficialOwnerAgent.ts  ← Product-grade WHT agent (GAME framework)
    WhtEnvironment.ts        ← Tool implementations — the E in GAME

  module1/
    ProgrammaticPrompting.ts ← Lesson 1: basic prompt, JSON output, multi-turn memory
    AgentLoop.ts             ← Lesson 2: text-based agent loop with THOUGHT/ACTION format

  module2/
    FunctionCallingExample.ts      ← Lesson 3: single round-trip function calling
    AgentLoopFunctionCalling.ts    ← Lesson 4: agent loop with registerTool() / Map dispatch

  module3/
    ReadmeAgent.ts           ← Lesson 5: GAME framework applied to a meta task

tests/
  src/shared/Goal.test.ts       ← Unit tests: buildSystemPrompt, goal priority sorting
  src/shared/Memory.test.ts     ← Unit tests: findings store, summary generation
  src/agents/WhtEnvironment.test.ts  ← Unit tests: treaty rates, MLI status, edge cases
```

---

## Architecture — the GAME framework

The product agent (`BeneficialOwnerAgent.ts`) is built using the GAME framework from Module 3:

| Component | File | What it does |
|---|---|---|
| **G** oals | `shared/Goal.ts` | Structured goal objects with priorities; `buildSystemPrompt()` generates the system prompt from them |
| **A** ctions | tool definitions in `BeneficialOwnerAgent.ts` | JSON Schema tool definitions passed to the LLM; `ToolFactory.terminate()` for the stop signal |
| **M** emory | `shared/Memory.ts` | Conversation history + key/value findings store; findings injected as a summary block each iteration |
| **E** nvironment | `agents/WhtEnvironment.ts` | All tool implementations in one class; `simulate: true/false` switches between mock and live data |

The agent loop in `BeneficialOwnerAgent.ts` is domain-agnostic — it contains no WHT logic. All domain knowledge lives in the Goals, tool definitions, and the Environment.

---

## What is simulated vs. what would be real

All tool results currently return hard-coded data. The `source` field on every result marks where real data would come from:

| Tool | Current | Production replacement |
|---|---|---|
| `check_treaty` | Hard-coded Luxembourg result | Polish Ministry of Finance treaty list API |
| `get_treaty_rate` | Hard-coded 5% / 15% rates | OECD treaty database or parsed treaty PDFs |
| `check_mli_ppt` | Hard-coded MLI positions | OECD MLI deposited positions database |
| `check_entity_substance` | Hard-coded due diligence stub | User-supplied questionnaire / document input |

Switching from simulation to live data requires only changing `new WhtEnvironment({ simulate: false })` and implementing the methods in `WhtEnvironment.ts`. All agent logic, tests, and tool definitions remain unchanged.

---

## Course progress

| Module | Topic | Status |
|---|---|---|
| 1 | Programmatic prompting + text-based agent loop | Complete |
| 2 | Function calling, `registerTool()` pattern | Complete |
| 3 | GAME framework, unit testing, README agent | Complete |
| 4+ | TBD | Not started |

---

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | ^6.0 |
| Runtime | Node.js | 18+ |
| AI SDK | OpenAI SDK | ^6.0 |
| Model | gpt-4o-mini | via `.env` |
| Testing | `node:test` (built-in) | Node 18 |
| Runner | ts-node | ^10.0 |
