# tax-agent-ai — WHT Beneficial Owner Agent

> **Module 1 of Tax OS** — a working prototype demonstrating agentic AI applied to Polish withholding tax compliance.
>
> Part of an MBA research project: *AI and Digital Transformation in International Tax* (2026).
> Author: **Franciszek Mochnacz**

---

> ⚠️ **Not legal advice.** Outputs are AI-generated and require review by a qualified Polish tax
> professional. Treaty rates are unverified against official PDFs. See [SECURITY.md](./SECURITY.md).
>
> **Status:** Active prototype — not production-ready.

---

## Quickstart

```bash
git clone https://github.com/fmochnacz-roul-duke/tax-agent-ai.git
cd tax-agent-ai
npm install
cp .env.example .env          # add your OPENAI_API_KEY
npm start                     # web UI at http://localhost:3000
```

For full setup (optional Python service, Gemini FactChecker) see [Setup](#setup) below.

---

## Status

![Tests](https://img.shields.io/badge/tests-284%20passing-brightgreen)
![Phase](https://img.shields.io/badge/phase-16%20complete-blue)
![Status](https://img.shields.io/badge/status-active%20prototype-yellow)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

---

## Documentation

| File | Contents |
|---|---|
| [docs/README.md](docs/README.md) | **Docs index** — start here for navigation |
| [docs/architecture.md](docs/architecture.md) | Full architecture — component map, data flows, RAG pipeline, multi-agent topology |
| [docs/api.md](docs/api.md) | REST API reference — endpoints, SSE events, `AgentInput` / `WhtReport` schemas |
| [docs/agent-design-guide.md](docs/agent-design-guide.md) | Reusable patterns — GAME, MATE, async tools, multi-agent, SSE streaming |
| [docs/vision.md](docs/vision.md) | Tax OS long-term vision — module roadmap, acceptance criteria |
| [CHANGELOG.md](CHANGELOG.md) | Phase-by-phase change history (Keep a Changelog format) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to clone, run tests, open a PR, propose a roadmap change |
| [SECURITY.md](SECURITY.md) | API key policy, PII guidance, legal disclaimer |

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

```
User / CLI
     │
     ▼
runWhtAnalysis()                        ← single entry point (web + CLI)
     │
     ├── Goals → system prompt
     ├── Tools → tool definitions (JSON Schema)
     ├── Memory → conversation history + findings store
     └── WhtEnvironment → tool implementations
          │
          ├── treaties.json            ← treaty + MLI data (36 countries)
          ├── Python DDQ service       ← substance + DEMPE (optional)
          ├── FactCheckerAgent         ← Gemini + Google Search (optional)
          ├── TreatyVerifierAgent      ← Gemini rate verification (optional)
          └── LegalRagService          ← vector knowledge base (CIT Act, MF Objaśnienia)
```

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
| `consult_legal_sources` | Live (RAG) | Retrieves exact statutory text from embedded CIT Act / MF Objaśnienia knowledge base |
| `terminate` | Built-in | Structured stop signal — no text parsing |

Treaty data: 36 countries (EU-27 + UK, Switzerland, Norway, USA, Canada, Japan, Singapore, UAE, Australia, India). All rates marked `verified: false` — populated from professional commentary, pending confirmation against treaty PDFs (Phase 20).

---

## Legal Knowledge RAG (Phase 9)

The `consult_legal_sources` tool gives the agent direct access to exact statutory text.

**How it works:**

```
Offline (npm run rag:build):
  src/rag/sources/*.md  →  Chunker  →  Embedder (text-embedding-3-small)  →  vectors.json

Runtime (per tool call):
  query  →  embed query  →  cosine similarity vs. all chunks  →  top-5 chunks returned
```

Sources currently embedded: Art. 4a pkt 29 CIT Act (beneficial owner definition),
MF Objaśnienia podatkowe 2025 (substance criteria, conduit indicators, LTA provisions).

No external vector database is used — embeddings are stored in
`data/knowledge_base/embeddings/vectors.json`. Run `npm run rag:build` (requires
`OPENAI_API_KEY`) to rebuild the index after editing source files.

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

# Unit tests — 284 tests, no API calls, ~5s
npm test
```

---

## Known limitations

- **All treaty rates `verified: false`** — built from professional commentary; verify against official treaty PDFs before production use (planned: Phase 20)
- **VERIFY cases** (Netherlands, Sweden, Switzerland) — MLI PPT conservatively treated as not applying, with a caution message
- **Substance quality depends on interview answers** — the 5-question interview gives `MEDIUM` confidence at best; full DDQ upload (Phase 6) gives higher confidence; substance is CONDUIT-default until the interview completes
- **Art. 12 scope** for older treaties (e.g. 1975 Poland–France DTC) requires manual verification — agent flags this explicitly
- **In-memory sessions** — web UI sessions are not persisted; restart the server and sessions are lost
- **Entity registry is local** — `data/registry.json` is not shared across deployments; suitable for single-team use

---

## Roadmap

### Completed (v0.1 – v0.19)

| Phase | Description | Tag |
|---|---|---|
| 1–3 | Live treaty data, real CLI input, structured JSON report output | v0.1–v0.3 |
| 4 | Substance test — entity-aware profiles, three-condition BO test, DEMPE, Pay and Refund | v0.4.0 |
| 5 | MATE improvements — model tiering, environment-level parameter validation | v0.5.0 |
| 6 | Document ingestion — Python/FastAPI microservice for DDQ substance and DEMPE | v0.6.0 |
| 7 | FactChecker Persona Agent — Gemini + Google Search grounding, multi-agent pattern | v0.7.0 |
| 8 | Conversational web UI — Express, InputExtractor, SSE streaming, chat interface | v0.8.0 |
| 9 | Legal knowledge RAG — tax taxonomy, MF Objaśnienia 2025, CIT Act provisions | v0.9.0 |
| 10 | Substance interview — 5-question chat, TypeScript LLM extractor, any entity assessed | v0.10.0 |
| 11 | Entity registry — JSON persistence, audit trail, "Past Analyses" panel in web UI | v0.11.0 |
| 12a | TreatyVerifierAgent — Gemini rate verification, batch `verifyTreaties` script | v0.12a.0 |
| 12b | Human review workflow — review drawer, `/registry/review` endpoint, CLI list script | v0.12b.0 |
| 13 | Provenance/citations on `WhtReport`; RAG legal grounding gate in confidence scoring | v0.13.0 |
| QA-1 | ESLint + Prettier + c8 coverage + build-as-precondition + treaty snapshot test | v0.14.0 |
| QA-2 | Zod runtime validation; Python/TS contract tests for schema drift | v0.15.0 |
| DOCS-2 | `last_verified` frontmatter on RAG source files; `docs/api.md`; architecture docs | v0.16.0 |
| 14 | Ghost Activation — TreatyVerifierAgent in live flow; `last_verified` in RAG output; confidence drops on rate mismatch | v0.17.0 |
| 15 | QA-3: Evals + Negative Tests — `BoOverall`; golden dataset (9 cases); eval harness; Brazil treaty | v0.18.0 |
| **16** | **Legal Source Hierarchy** — `source_type` param on `consult_legal_sources`; `legal_hierarchy` in RAG results; Zod domain-narrowing | **v0.19.0** |

### Upcoming — Arc 1: WHT Core Completion

| Phase | Title | Key deliverable |
|---|---|---|
| 17 | Confidence UX + HITL | UI grey-out for LOW confidence; "Draft Only" watermark; auto-draft registry on UNCERTAIN/LOW |
| 18 | UC2 Third-party Vendor Workflow | `classify_vendor_risk` tool; document checklist per payment type; no-DDQ path |
| 19 | Due Diligence Module | DD checklist tool per payment type; DD gap analysis in `WhtReport` |
| 20 | Data Quality Pass | Verify top-10 treaty rates against official sources; `verified: true` in treaties.json |
| 21 | Batch Processing | `--batch payments.csv` CLI; multi-entity summary report; registry cache |
| 22 | Production Hardening | Session persistence; SSE reconnect; rate limiting; memory pruning |

### Arc 2: WHT Professional Features

| Phase | Title | Key deliverable |
|---|---|---|
| 23a | Intangibles — Legal & Data Layer | Art. 21.1.2a CIT framework; treaty classification; MDR hallmarks; RAG enrichment |
| 23b | Intangibles — Code Layer | `ServiceClassifier.ts` AI questionnaire; `check_mdr_obligation` tool; PE hook |
| 23c | GAAR Tool | Art. 119a Ordynacja podatkowa risk flag; separate tool |
| 24 | Legal Source Management | Source update protocol; `last_verified` workflow |
| 25 | Jurisdiction Expansion | treaties.json 36 → 50+ countries |
| 26 | WHT v1.0 Major Review | End-to-end demo; all acceptance criteria; CHANGELOG v1.0 |

### Arc 3: Tax OS Foundation

| Phase | Title | Key deliverable |
|---|---|---|
| 27 | GLOBAL VISION Documentation | `docs/GLOBAL_VISION.md` (gitignored); Tax OS architecture |
| 28 | EU Jurisdiction Engine Concept | Multi-jurisdiction architecture; pilot jurisdiction |
| 29 | Tax OS Module 2 Planning | Next tax regime scoping; cross-module framework |

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

## Feedback and issues

Found a bug or have a suggestion? Open an issue on GitHub:
[github.com/fmochnacz-roul-duke/tax-agent-ai/issues](https://github.com/fmochnacz-roul-duke/tax-agent-ai/issues)

Use the bug report template for reproducible problems. For questions about the legal
logic or treaty data, include the entity name, country, and income type.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to contribute.

---

## License

This project is licensed under the [ISC License](./LICENSE).

> **Disclaimer:**
> This software is provided for informational purposes only and does not constitute legal, tax,
> or financial advice. Outputs must be reviewed by a qualified tax professional before use in
> any compliance or advisory context. See [SECURITY.md](./SECURITY.md) for full details.

---

## Learning scaffolding

The `module1/`, `module2/`, and `module3/` directories contain code written during a structured AI agents course (TypeScript AI Agents Course, Jules White, Vanderbilt University). Kept as a transparent record of the reasoning and skill development that led to the product agent:

| Module | Topic | What it demonstrates |
|---|---|---|
| 1 | Programmatic prompting, multi-turn memory | How LLMs handle conversation state |
| 2 | Function calling, `registerTool()` pattern | How tools are defined and dispatched |
| 3 | GAME framework, unit testing, README agent | The architectural pattern used in the product |
