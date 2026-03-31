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
3. **MLI / PPT** — does the Multilateral Instrument's Principal Purpose Test apply, and does the arrangement survive it?
4. **DEMPE** *(royalties only)* — does the recipient economically own the IP under OECD BEPS Actions 8–10?
5. **Directive exemption** *(interest/royalties)* — does the EU Interest and Royalties Directive provide a 0% path instead?
6. **Pay and Refund** — does the Polish PLN 2,000,000 threshold trigger upfront withholding, and how is it avoided?

In practice this analysis is done manually by senior tax professionals consulting multiple sources. It is time-consuming, inconsistent across analysts, and hard to audit. This agent automates the structured reasoning layer — gathering all relevant facts through tools, applying the legal framework, and producing a cited, machine-readable conclusion.

---

## Tax OS — the bigger picture

This repository is **Module 1** of a larger architecture: **Tax AI OS** — an AI Operating System for international tax functions.

The full Tax OS vision (documented separately) has four layers:

| Layer | Function |
|---|---|
| **AI Gateway** | Input sanitisation, PII vaulting, schema enforcement, temporal gating |
| **Context Engine** | Hardened prompt architecture, intent locking, adversarial resistance |
| **Output Validator** | Deterministic bounds checking + cross-model semantic audit |
| **Human-in-the-Loop** | Risk-tiered review, attestation statements, audit trail |

The WHT agent in this repository sits inside the Context Engine layer — it is the domain-specific reasoning module for one family of international tax questions. Future modules will cover Pillar Two (GloBE), Transfer Pricing screening, PE risk, and CbCR analysis.

---

## What the agent does

The agent receives a structured JSON input describing the payment and recipient, then works through a series of tool calls to build a complete analysis:

```
npm run tax:agent -- --input data/orange_polska_royalty.json
```

**Example input** (`data/orange_polska_royalty.json`):
```json
{
  "entity_name": "Orange S.A.",
  "country": "France",
  "income_type": "royalty",
  "shareholding_percentage": 50.67,
  "substance_notes": "Orange S.A. has held its stake since the early 2000s..."
}
```

**Output:** a structured JSON report saved to `reports/`, plus a full narrative conclusion on the console.

```json
{
  "generated_at": "2026-03-31T...",
  "entity_name": "Orange S.A.",
  "country": "France",
  "income_type": "royalty",
  "conclusion": "Based on my analysis...",
  "findings": {
    "treaty_status": { "treaty_in_force": true, "mli_ppt_applies": "YES", ... },
    "dempe_analysis": { "control_test": "PASS", "beneficial_owner_dempe": "STRONG", ... },
    "directive_exemption": { "exemption_available": true, "exemption_rate": 0, ... },
    "pay_and_refund": { "applies": true, "relief_options": [...], ... }
  }
}
```

---

## Agent architecture — the GAME framework

The agent is built on the GAME framework (Goals / Actions / Memory / Environment):

| Component | File | Role |
|---|---|---|
| **G**oals | `BeneficialOwnerAgent.ts` | 7 structured goals with priorities — treaty, DEMPE, rate, directive, beneficial owner, MLI/PPT, pay-and-refund |
| **A**ctions | `BeneficialOwnerAgent.ts` | 8 tool definitions with JSON Schema; `ToolFactory.terminate()` for the stop signal |
| **M**emory | `shared/Memory.ts` | Conversation history + structured findings store; findings injected as a summary each iteration |
| **E**nvironment | `WhtEnvironment.ts` | All tool implementations in one class; `simulate: true/false` switches data sources |

The agent loop is domain-agnostic — it contains no WHT logic. All domain knowledge lives in the Goals, tool definitions, and the Environment. This separation is the architectural property that makes the system testable, auditable, and extensible.

---

## Tools

| Tool | Status | Data source |
|---|---|---|
| `check_treaty` | **Live** | `data/treaties.json` — 36 countries, Polish MoF + OECD MLI positions |
| `get_treaty_rate` | **Live** | `data/treaties.json` — dividend / interest / royalty rates with threshold logic |
| `check_mli_ppt` | **Live** | `data/treaties.json` — MLI flags: YES / NO / VERIFY (conservative handling) |
| `analyse_dempe` | Simulated | BEPS Actions 8–10 functional analysis — Phase 5 (document ingestion) |
| `check_directive_exemption` | Simulated | EU I&R Directive 2003/49/EC → Art. 21 Polish CIT Act |
| `check_pay_and_refund` | Simulated | Art. 26 §2c Polish CIT Act — PLN 2M threshold, Opinion vs. WH-OS |
| `check_entity_substance` | Simulated | Due diligence questionnaire — Phase 5 (document ingestion) |
| `terminate` | Built-in | Structured stop signal — no text parsing |

Treaty data covers 36 countries (EU-27 + UK, Switzerland, Norway, USA, Canada, Japan, Singapore, UAE, Australia, India). All rates marked `verified: false` — populated from professional commentary, pending confirmation against treaty PDFs.

---

## Setup

**Prerequisites:** Node.js 18+, an OpenAI API key

```bash
git clone https://github.com/fmochnacz-roul-duke/tax-agent-ai.git
cd tax-agent-ai
npm install
```

Create `.env` in the project root:

```
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4o-mini
```

---

## Running the agent

```bash
# Run with the Orange Polska royalty test case
npm run tax:agent -- --input data/orange_polska_royalty.json

# Run with the Alpine Holdings dividend demo case
npm run tax:agent -- --input data/example_input.json

# Override the output path
npm run tax:agent -- --input data/orange_polska_royalty.json --output reports/my_report.json

# Type-check (zero errors required before any commit)
npm run build

# Unit tests — 52 tests, no API calls, ~2s
npm test
```

Reports are saved automatically to `reports/<entity_slug>_<date>.json`. The folder is gitignored.

---

## Treaty coverage and known limitations

- **36 countries** in `data/treaties.json` (see `data/mli_flags_legend.md` for MLI flag codes)
- All rates `verified: false` — the static data is built from professional commentary; every rate should be confirmed against the official treaty PDF before use in production
- **VERIFY cases** (Netherlands, Sweden, Switzerland) — the agent conservatively treats PPT as not applying and surfaces a caution message
- **DEMPE, substance, and directive checks** are simulated — they return structured outputs with correct field shapes and legal references, but the underlying data is placeholder until Phase 5 (document ingestion)
- **Art. 12 scope** for older treaties (e.g. the 1975 Poland–France DTC) requires manual verification — the agent flags this explicitly

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| 1 | Live treaty data (`treaties.json` wired into `WhtEnvironment`) | ✓ Complete |
| 2 | Real CLI input (`--input` JSON file, `AgentInput` validation) | ✓ Complete |
| 3 | Structured JSON report output (`reports/`) | ✓ Complete |
| 4 | Refined substance test — concrete criteria aligned with Art. 26 CIT and MLI PPT guidelines | Next |
| 5 | Document ingestion — Python/FastAPI microservice replacing simulated substance and DEMPE tools | Planned |
| 6+ | Additional Tax OS modules: Pillar Two, TP screening, PE risk | Future |

---

## Technical appendix — learning scaffolding

The `module1/`, `module2/`, and `module3/` directories contain the code written during a structured AI agents course (TypeScript AI Agents Course, Jules White). These are kept as a transparent record of the reasoning and skill development that led to the product agent:

| Module | Topic | What it demonstrates |
|---|---|---|
| 1 | Programmatic prompting, multi-turn memory | How LLMs handle conversation state |
| 2 | Function calling, `registerTool()` pattern | How tools are defined and dispatched |
| 3 | GAME framework, unit testing, README agent | The architectural pattern used in the product |

The product agent (`src/agents/`) builds directly on these patterns. The learning scaffolding is the visible reasoning chain.

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

---

## Status

Active development. Not production-ready. All outputs should be reviewed by a qualified tax professional before use in any compliance or advisory context.
