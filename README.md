# tax-agent-ai — WHT Beneficial Owner Agent

> **Module 1 of Tax OS** — a working prototype demonstrating agentic AI applied to Polish withholding tax compliance.
>
> Part of an MBA research project: *AI and Digital Transformation in International Tax* (2026).
> Author: **Franciszek Mochnacz**

---

## The problem this solves

When a Polish entity pays dividends, interest, or royalties to a foreign recipient, it must determine:

1. **Treaty rate** — does a Double Taxation Convention apply, and what rate does it set?
2. **Beneficial owner** — does the recipient legally qualify to claim the treaty benefit?
3. **MLI / PPT** — does the Multilateral Instrument's Principal Purpose Test apply?
4. **DEMPE** *(royalties only)* — does the recipient economically own the IP under OECD BEPS Actions 8–10?
5. **Directive exemption** *(interest/royalties)* — does the EU Interest and Royalties Directive provide a 0% path?
6. **Pay and Refund** — does the Polish PLN 2,000,000 threshold trigger upfront withholding?

In practice this analysis is done manually by senior tax professionals consulting multiple sources. It is time-consuming, inconsistent across analysts, and hard to audit. This agent automates the structured reasoning layer — gathering all relevant facts through tools, applying the legal framework, and producing a cited, machine-readable conclusion.

---

## Tax OS — the bigger picture

This repository is **Module 1** of a larger architecture: **Tax AI OS** — an AI Operating System for international tax functions.

| Layer | Function |
|---|---|
| **AI Gateway** | Input sanitisation, PII vaulting, schema enforcement, temporal gating |
| **Context Engine** | Hardened prompt architecture, intent locking, adversarial resistance |
| **Output Validator** | Deterministic bounds checking + cross-model semantic audit |
| **Human-in-the-Loop** | Risk-tiered review, attestation statements, audit trail |

The WHT agent in this repository sits inside the Context Engine layer. Future modules will cover Pillar Two (GloBE), Transfer Pricing screening, PE risk, and CbCR analysis.

---

## Using the agent

### Web UI (conversational)

```bash
npm start
```

Opens a browser chat interface at `http://localhost:3000`. Type a transaction description in plain English:

> *"Analyse Orange S.A. royalty payments to Orange Polska, they hold 50.67% and pay around 50M PLN annually."*

The agent asks clarifying questions if needed, confirms the extracted parameters, then streams the full analysis live to the browser — tool calls, findings, and the final report all visible as they happen.

### CLI (structured JSON input)

```bash
npm run tax:agent -- --input data/orange_polska_royalty.json
```

**Example input** (`data/orange_polska_royalty.json`):
```json
{
  "entity_name": "Orange S.A.",
  "country": "France",
  "income_type": "royalty",
  "shareholding_percentage": 50.67,
  "annual_payment_pln": 50000000,
  "related_party": true,
  "ddq_path": "data/ddqs/orange_sa_ddq.txt"
}
```

**Output** — a structured JSON report saved to `reports/`:

```json
{
  "generated_at": "2026-03-31T...",
  "entity_name": "Orange S.A.",
  "country": "France",
  "income_type": "royalty",
  "data_confidence": "LOW",
  "data_confidence_note": "Substance data is simulated...",
  "conclusion": "Based on my analysis...",
  "findings": {
    "treaty_status": { "treaty_in_force": true, "mli_ppt_applies": "YES", ... },
    "dempe_analysis": { "control_test": "PASS", ... },
    "directive_exemption": { "exemption_available": true, "exemption_rate": 0, ... }
  }
}
```

---

## Agent architecture — the GAME framework

Built on the GAME framework (Goals / Actions / Memory / Environment):

| Component | File | Role |
|---|---|---|
| **G**oals | `BeneficialOwnerAgent.ts` | 7 structured goals with priorities — treaty, DEMPE, rate, directive, beneficial owner, MLI/PPT, pay-and-refund, fact-check |
| **A**ctions | `BeneficialOwnerAgent.ts` | 8 tool definitions with JSON Schema; `ToolFactory.terminate()` for the stop signal |
| **M**emory | `shared/Memory.ts` | Conversation history + structured findings store; findings injected as a summary each iteration |
| **E**nvironment | `WhtEnvironment.ts` | All tool implementations in one class; `simulate: true/false` switches data sources |

The agent loop is domain-agnostic — it contains no WHT logic. All domain knowledge lives in the Goals, tool definitions, and the Environment.

**MATE design principles:**

| Principle | Implementation |
|---|---|
| **M — Model Efficiency** | Two LLM tiers: `LLM.fast()` for simple lookups, `LLM.powerful()` for legal synthesis. Switches automatically once complex findings (substance, DEMPE, MLI, fact-check) are present. |
| **A — Action Specificity** | Each tool does one thing. Enum constraints and typed parameters prevent hallucinated inputs. Server-side validation in `WhtEnvironment` catches out-of-range values. |
| **T — Token Efficiency** | `buildFindingsSummary()` injects a compact block each iteration. A duplicate-call guard prevents redundant tool calls. |
| **E — Environmental Safety** | `maxIterations` safety valve. `simulate: true/false` mode switch. Parameter validation in every method returns structured errors. |

---

## Tools

| Tool | Mode | Data source |
|---|---|---|
| `check_treaty` | **Live** | `data/treaties.json` — 36 countries, Polish MoF + OECD MLI positions |
| `get_treaty_rate` | **Live** | `data/treaties.json` — dividend / interest / royalty rates with threshold logic |
| `check_mli_ppt` | **Live** | `data/treaties.json` — MLI flags: YES / NO / VERIFY (conservative handling) |
| `check_directive_exemption` | **Live logic** | EU I&R Directive 2003/49/EC → Art. 21 Polish CIT Act |
| `check_pay_and_refund` | **Live logic** | Art. 26 §2c Polish CIT Act — PLN 2M threshold, Opinion vs. WH-OS |
| `analyse_dempe` | Live (DDQ service) / Simulated | OECD BEPS Actions 8–10 functional analysis |
| `check_entity_substance` | Live (DDQ service) / Simulated | Art. 4a pkt 29 CIT three-condition BO test |
| `fact_check_substance` | Live (Gemini + Google Search) / Simulated | Triangulation of DDQ claims against public records |
| `terminate` | Built-in | Structured stop signal — no text parsing |

Treaty data: 36 countries (EU-27 + UK, Switzerland, Norway, USA, Canada, Japan, Singapore, UAE, Australia, India). All rates marked `verified: false` — populated from professional commentary, pending confirmation against treaty PDFs.

---

## Multi-agent architecture (Phase 7)

Phase 7 introduced a second agent that cross-verifies substance claims against public records:

```
WHT Agent (OpenAI) ──► fact_check_substance tool ──► FactCheckerAgent (Gemini 2.0 Flash)
                                                            └─ google_search (live web)
                       ◄──── FactCheckResult (JSON) ─────────────────────────────────────
                              CONFIRMS / INCONCLUSIVE / UNDERMINES
```

The FactChecker applies the **Triangulation Rule**: 2+ authoritative sources = VERIFIED,
1 source = UNVERIFIED, contradicting source = CONTRADICTED. Its overall verdict feeds
directly into the report's `data_confidence` score.

Requires `GEMINI_API_KEY` in `.env`. Falls back to `INCONCLUSIVE` simulation if absent.

---

## Web UI (Phase 8)

The web interface eliminates the manual two-terminal setup. Single command, everything runs together.

**Conversation flow:**

```
User: "Analyse Alpine Holdings S.A. in Luxembourg, dividend, 30% stake"
  ↓
Bot: "What is the estimated annual dividend payment in PLN?"
  ↓
User: "About 3 million"
  ↓
Bot: Parameters confirmed:
     • Entity: Alpine Holdings S.A.   • Country: Luxembourg
     • Income: Dividend               • Shareholding: 30%
     • Payment: PLN 3,000,000
     [Run analysis]
  ↓
[Live progress stream]
  ▸ Iteration 1    ⚙ check_treaty(...)    ✓ check_treaty
  ▸ Iteration 2    ⚙ get_treaty_rate(...) ✓ get_treaty_rate
  ...
  ↓
[Final report card]
CONCLUSION: WHT rate is 5% under Art. 10(2)(a) Poland–Luxembourg DTC...
Data confidence: LOW | Report saved to disk.
```

---

## Setup

**Prerequisites:** Node.js 18+, an OpenAI API key.

```bash
git clone https://github.com/fmochnacz-roul-duke/tax-agent-ai.git
cd tax-agent-ai
npm install
```

Create `.env` in the project root (copy from `.env.example`):

```
OPENAI_API_KEY=your-key-here

# Single-model setup (backward-compatible):
OPENAI_MODEL=gpt-4o-mini

# Two-tier setup — recommended (MATE M: Model Efficiency):
OPENAI_MODEL_FAST=gpt-4o-mini       # simple lookups
OPENAI_MODEL_POWERFUL=gpt-4o        # legal synthesis

# Optional — Phase 7: FactChecker via Gemini + Google Search
# GEMINI_API_KEY=your-key-here
# GEMINI_MODEL=gemini-2.0-flash

# Optional — Phase 6: Python DDQ extraction service
# Start with: npm run ddq:service
# DDQ_SERVICE_URL=http://localhost:8000
```

---

## Running the agent

```bash
# Web UI — conversational interface at http://localhost:3000
npm start

# CLI — structured JSON input
npm run tax:agent -- --input data/orange_polska_royalty.json
npm run tax:agent -- --input data/example_input.json

# Override output path
npm run tax:agent -- --input data/orange_polska_royalty.json --output reports/my_report.json

# Optional: Python DDQ extraction service (live substance + DEMPE from real documents)
npm run ddq:service     # starts FastAPI service on port 8000 (requires Python 3.10+)

# Type-check (zero errors required before any commit)
npm run build

# Unit tests — 99 tests, no API calls, ~2s
npm test
```

---

## Known limitations

- **All treaty rates `verified: false`** — built from professional commentary; verify against official treaty PDFs before production use
- **VERIFY cases** (Netherlands, Sweden, Switzerland) — MLI PPT conservatively treated as not applying, with a caution message
- **Substance/DEMPE are simulated** when no DDQ file is provided — reports correctly flagged as `LOW` confidence
- **Art. 12 scope** for older treaties (e.g. 1975 Poland–France DTC) requires manual verification — agent flags this explicitly
- **In-memory sessions** — web UI sessions are not persisted; restart the server and sessions are lost

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| 1 | Live treaty data (`treaties.json` wired into `WhtEnvironment`) | ✓ Complete |
| 2 | Real CLI input (`--input` JSON file, `AgentInput` validation) | ✓ Complete |
| 3 | Structured JSON report output (`reports/`) | ✓ Complete |
| 4 | Refined substance test — entity-aware profiles, three-condition BO test, DEMPE, Pay and Refund | ✓ Complete |
| 5 | MATE improvements — model tiering, environment-level parameter validation | ✓ Complete |
| 6 | Document ingestion — Python/FastAPI microservice for DDQ substance and DEMPE extraction | ✓ Complete |
| 7 | FactChecker Persona Agent — Gemini + Google Search grounding, multi-agent call_agent pattern | ✓ Complete |
| 8 | Conversational web UI — Express, InputExtractor, SSE streaming, chat interface | ✓ Complete |
| 10 | Substance interview — 5-question chat, TypeScript LLM extractor, any entity assessed | ✓ Complete |
| 9 | RAG — MF Objaśnienia 2025, OECD TP Guidelines Ch. VI, EU Directives | Next |
| 11 | Entity registry — persist interview results, avoid re-analysis, audit trail | Next |
| 12+ | Treaty rate verification; third-party vendor workflow; Pillar Two module; TP screening | Future |

---

## Technical appendix — learning scaffolding

The `module1/`, `module2/`, and `module3/` directories contain code written during a structured AI agents course (TypeScript AI Agents Course, Jules White, Vanderbilt University). Kept as a transparent record of the reasoning and skill development that led to the product agent:

| Module | Topic | What it demonstrates |
|---|---|---|
| 1 | Programmatic prompting, multi-turn memory | How LLMs handle conversation state |
| 2 | Function calling, `registerTool()` pattern | How tools are defined and dispatched |
| 3 | GAME framework, unit testing, README agent | The architectural pattern used in the product |

---

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | ^6.0 |
| Runtime | Node.js | 18+ |
| AI SDK | OpenAI SDK | ^6.0 |
| Model (fast tier) | gpt-4o-mini | via `OPENAI_MODEL_FAST` |
| Model (powerful tier) | gpt-4o | via `OPENAI_MODEL_POWERFUL` |
| FactChecker model | gemini-2.0-flash | Gemini REST API (no SDK) |
| Web server | Express | ^5.0 |
| DDQ service | Python 3.10+ / FastAPI / uvicorn | optional |
| Testing | `node:test` (built-in) | Node 18 |
| Runner | ts-node | ^10.0 |

---

## Documentation

| File | Contents |
|---|---|
| `docs/agent-design-guide.md` | Reusable patterns — GAME, MATE, async tools, multi-agent, SSE streaming, conversational extraction |
| `docs/architecture.md` | Full project architecture — component map, data flows, multi-agent topology, test coverage map |
| `data/mli_flags_legend.md` | Explanation of 10 MLI flag codes used in treaties.json |

---

## Status

Active development. Not production-ready. All outputs must be reviewed by a qualified tax professional before use in any compliance or advisory context.
