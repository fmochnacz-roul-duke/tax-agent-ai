# Architecture

The agent is built on two design frameworks: **GAME** (Goals / Actions / Memory / Environment) and **MATE** (Model efficiency / Action specificity / Token efficiency / Environmental safety).

---

## System overview

```
Browser (index.html)
    │
    ▼  HTTP + SSE
Express Server (src/server/index.ts)
    │
    ├── InputExtractor          ← Free-text → AgentInput (fast model)
    ├── SubstanceInterviewer    ← 5-question substance chat state machine
    │
    ▼
BeneficialOwnerAgent (src/agents/BeneficialOwnerAgent.ts)
    │  GAME loop — tool calls → WhtEnvironment
    ├── check_treaty
    ├── get_treaty_rate
    ├── check_mli_ppt
    ├── check_entity_substance  ─── SubstanceExtractor (TS LLM)
    │                           └── Python DDQ service (optional)
    ├── analyse_dempe           ─── Python DDQ service (optional)
    ├── check_directive_exemption
    ├── check_pay_and_refund
    └── fact_check_substance    ─── FactCheckerAgent (Gemini + Google Search)
```

---

## GAME framework

### Goals — `BeneficialOwnerAgent.ts`

Seven goals with explicit priorities:

1. (Priority 1) Treaty existence and BO status — do not conclude without these
2. (Priority 2) Treaty rate — correct rate under the treaty
3. (Priority 3) Beneficial owner substance assessment — the factual core
4. (Priority 4) DEMPE analysis — for royalties
5. (Priority 5) EU Directive — 0% pathway
6. (Priority 6) MLI/PPT — anti-avoidance check
7. (Priority 7) Pay and Refund — compliance obligation

Goals are injected into the system prompt via `buildSystemPrompt()`.

### Actions — tool definitions

Eight tools defined in `BeneficialOwnerAgent.ts` with JSON Schema. All tool implementations are in `WhtEnvironment.ts`. The agent never directly accesses external data — it calls tools, tools call the environment.

### Memory — `Memory.ts`

Two stores:
- **Conversation history**: rolling message array (system / user / assistant / tool)
- **Findings store**: key-value map of structured results (e.g. `treaty_result`, `substance_result`)

`buildFindingsSummary()` injects a compact findings summary at each iteration to prevent the agent re-calling tools whose results are already known. This is the primary token-efficiency mechanism.

### Environment — `WhtEnvironment.ts`

All tool implementations. The environment is the isolation boundary between the agent loop and external data sources. Key design property: switching `simulate: true → false` changes every tool from simulated to live without touching the agent.

The environment has three data tiers:
1. **Live**: `check_treaty`, `get_treaty_rate`, `check_mli_ppt` — reads `data/treaties.json`
2. **Live + fallback**: `check_entity_substance`, `analyse_dempe` — calls Python DDQ service if configured, falls back to simulation
3. **Optional live**: `fact_check_substance` — calls FactCheckerAgent (Gemini) if `GEMINI_API_KEY` is set

---

## MATE principles

### M — Model efficiency

Two model tiers via `LLM.fast()` / `LLM.powerful()`:
- Fast tier (`gpt-4o-mini`): InputExtractor, SubstanceExtractor (initial pass), simple lookups
- Powerful tier (`gpt-4o`): Agent reasoning, FactCheckerAgent, synthesis after fact-check confirms substance

`selectLlm()` in the agent loop upgrades from fast → powerful after a confirmed substance finding.

### A — Action specificity

Tools have narrow, precise schemas — no "do everything" tools. Every tool has:
- Enum-constrained parameters (income_type: "dividend" | "interest" | "royalty")
- Server-side validation in the environment method before execution
- Structured result objects with a `source` field

### T — Token efficiency

- `buildFindingsSummary()` injects compact context: `ESTABLISHED FINDINGS — do not repeat these tool calls`
- Duplicate-call guard: the agent loop blocks identical re-calls and returns a reminder
- System prompt uses `buildSystemPrompt()` with sorted goals — most critical goals first

### E — Environmental safety

- `maxIterations` valve: agent loop terminates after 20 iterations regardless of state
- Parameter validation: every environment method validates its inputs and returns structured error on invalid params
- `ToolFactory.terminate()`: the stop signal — no text parsing, structured termination

---

## Multi-agent topology (Phase 7)

The WHT Agent (OpenAI GPT-4o) is the orchestrator. It can call the FactCheckerAgent (Google Gemini) via the `fact_check_substance` tool. This implements the `call_agent` pattern:

```
WHT Agent (OpenAI)
    └── fact_check_substance tool
            └── FactCheckerAgent (Gemini + Google Search)
                    → FactCheckResult { verified: true/false, sources: [...], confidence: ... }
```

Triangulation rule: 2+ web sources = VERIFIED, 1 = UNVERIFIED, 0 = CONTRADICTED.

---

## Web server (Phase 8)

Express.js with four endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /session` | Create session, return sessionId |
| `POST /session/:id/message` | Chat turn — InputExtractor or SubstanceInterviewer |
| `POST /session/:id/confirm` | Start `runWhtAnalysis()` in background |
| `GET /session/:id/stream` | SSE stream — live agent events |
| `GET /session/:id/report` | Completed WhtReport JSON |

Session state machine: `collecting` → `interviewing` → `ready` → `running` → `done`

---

## Substance interview (Phase 10)

`SubstanceInterviewer.ts` is a five-question state machine. Questions map to Art. 4a pkt 29 CIT conditions:

| Question | BO condition | MF Objaśnienia |
|---|---|---|
| 1 — Headcount | iii | §2.3 |
| 2 — Office presence | iii | §2.3 |
| 3 — Decision-making | iii | §2.3 |
| 4 — Operating costs | iii | §2.3 |
| 5 — Pass-through obligation | ii | §2.2.1 |

After all answers are collected, `SubstanceExtractor.ts` converts the compiled DDQ text to a `SubstanceResult` JSON using the powerful model with `json_object` output mode.

---

## Key files

| File | Role |
|---|---|
| `src/agents/BeneficialOwnerAgent.ts` | GAME definition: goals, tools, agent loop, runWhtAnalysis() |
| `src/agents/WhtEnvironment.ts` | All tool implementations, environment isolation boundary |
| `src/agents/FactCheckerAgent.ts` | Gemini multi-agent — fact verification |
| `src/server/index.ts` | Express server, session state machine |
| `src/server/InputExtractor.ts` | Free-text → AgentInput via LLM |
| `src/server/SubstanceInterviewer.ts` | 5-question interview state machine |
| `src/server/SubstanceExtractor.ts` | DDQ text → SubstanceResult via LLM |
| `src/shared/LLM.ts` | generate(), generateWithTools(), LLM.fast/powerful, ToolFactory |
| `src/shared/Memory.ts` | Conversation history + findings store |
| `data/treaties.json` | Treaty database: 36 countries, rates, MLI flags |
| `data/tax_taxonomy.json` | Tax taxonomy: ~40 concepts, rag_keywords, legal refs |
| `data/legal_sources_registry.json` | All legal sources with verification status |
