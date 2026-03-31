# Session State

## Current Status
**Phase:** Modules 1–3 complete. Product-grade agent foundation built. Ready for real data sources.
**Date of last session:** 2026-03-31
**Branch:** master (all work merged and pushed)

---

## How to Resume Next Session

Open Claude Code in `C:\Users\fmoch\projects\tax-agent-ai\` and say:

> "Read SESSION.md and let's continue where we left off."

Then run to verify the environment is healthy:
```
npm run build    ← should produce zero errors
npm test         ← should show 21/21 passing
npm run tax:agent  ← should run the WHT agent end-to-end
```

---

## What Was Done — Session 2026-03-31

### Module 2: Function Calling
- Extended `shared/Message.ts` — added `tool` role and `StoredToolCall` type
- Extended `shared/LLM.ts` — added `generateWithTools()`, `ToolFactory`, type exports
- Built `module2/FunctionCallingExample.ts` — single round-trip function calling demo
  - Key bug found and fixed: assistant message must carry `tool_calls` structure (not plain text)
  - `StoredToolCall` round-trip pattern enables the API to accept subsequent tool result messages
- Built `module2/AgentLoopFunctionCalling.ts` — agent class with `registerTool()` / Map dispatch

### Module 3: GAME Framework
- Applied GAME framework retrospectively to the agent
- Added `shared/Goal.ts` — Goal interface + `buildSystemPrompt()` (priority-sorted)
- Added `shared/Memory.ts` — conversation history + structured findings store
- Added `agents/WhtEnvironment.ts` — all tool implementations; `simulate: true/false` switch
- Rebuilt `agents/BeneficialOwnerAgent.ts` — full GAME separation, domain-agnostic loop

### Unit Testing
- Added `node:test` (built-in, no dependencies) with `"types": ["node"]` in tsconfig
- 21 tests across 3 files — all green, zero API calls, ~1.7s total
- Tests cover: `WhtEnvironment` (all methods + edge cases), `Memory` (findings + copy safety),
  `buildSystemPrompt` (priority sorting, persona inclusion)

### README
- Built `module3/ReadmeAgent.ts` — GAME agent that reads source files and generates README
  - Learned: model needs explicit instruction in persona to use terminate() not plain text
  - Agent draft was structurally correct but too generic — reviewed and replaced with final version
- Committed `README.md` to repo — project now has proper GitHub documentation

### Housekeeping
- CLAUDE.md was not updated during the session (oversight) — updated at session close
- Established branch discipline: always branch, always merge before starting next feature

---

## What Comes Next — Roadmap Toward a Real Tax Tool

### Phase 1 — Real data sources (highest priority)
Replace the three simulated tools with real lookups. Each is independent and can be done separately.

| Tool | Replacement source | Notes |
|---|---|---|
| `check_treaty` | Polish MoF treaty list (static JSON lookup table) | ~85 treaties — maintainable manually |
| `get_treaty_rate` | OECD treaty database or parsed treaty PDFs | Start with a static table for top 10 countries |
| `check_mli_ppt` | OECD MLI deposited positions (public, scrapeable) | Poland's positions are fixed — small static file |

Suggested first step: build a `data/treaties.json` static file for Poland's 10 most common
treaty partners (LU, NL, DE, CY, MT, IE, AT, CH, SE, GB) and wire `WhtEnvironment` to read it.

### Phase 2 — Real input
- Replace hardcoded task string with a CLI prompt or structured input form
- Accept: entity name, country, income type, shareholding %, known substance facts
- Consider a simple JSON input file: `npm run tax:agent -- --input entity.json`

### Phase 3 — Real output
- Structured JSON report (machine-readable, for downstream systems)
- The `memory.getFindings()` block is already there — just format and save it
- Optional: PDF/Word export of the analysis

### Phase 4 — Broader coverage
- Extend beyond Luxembourg to the top 10 treaty partners
- Add `royalty` income type (currently only dividend and interest are handled)
- Add domestic exemption check (Polish CIT Act Art. 22 — participation exemption)

### Phase 5 — Document ingestion
- Accept due diligence questionnaire as a text/PDF input instead of hardcoded substance data
- Parse treaty PDFs directly for rate lookups (longer term)

---

## Open Questions / Decisions Pending
- Data source for treaty rates: static JSON table (fast, maintainable for top 10 countries)
  vs. OECD API (comprehensive but complex)
- Whether to add a confidence score to the agent's conclusion
- Whether to build a minimal web UI or keep it CLI-only

---

## Key Architecture Decisions Made This Session
- GAME framework is the design pattern for all future agents
- `WhtEnvironment` is the isolation boundary — simulate→live is one flag change
- Unit tests on pure components only (no LLM) — fast, cheap, reliable
- `node:test` (built-in) for testing — no extra dependencies
- AgentLanguage abstraction: decision was NOT to implement the full abstraction
  (we are FunctionCallingLanguage-only; the class hierarchy would be premature)
