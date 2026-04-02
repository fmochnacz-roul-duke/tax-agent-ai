# How to Run

---

## Prerequisites

- **Node.js v18+** (`node --version`)
- **npm** (comes with Node)
- **TypeScript** (installed via `npm install`)
- **OpenAI API key** (required)

Optional:
- **Python 3.10+** with pip — for the DDQ extraction service (Phase 6; not required for basic use)
- **Gemini API key** — for the FactChecker agent (Phase 7) and TreatyVerifier (Phase 14)

---

## Setup

```bash
git clone https://github.com/fmochnacz-roul-duke/tax-agent-ai.git
cd tax-agent-ai
npm install
```

Create `.env` (copy from `.env.example`):

```env
OPENAI_API_KEY=sk-...

# Optional — if not set, both default to gpt-4o
OPENAI_MODEL_FAST=gpt-4o-mini
OPENAI_MODEL_POWERFUL=gpt-4o

# Optional — enables FactChecker agent and TreatyVerifier
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash

# Optional — enables Python DDQ extraction service
DDQ_SERVICE_URL=http://localhost:8000

# Optional — web server port (default: 3000)
PORT=3000
```

Verify everything works:

```bash
npm run build    # TypeScript type-check — must return zero errors
npm test         # 246/246 tests, ~3 seconds, no API calls needed
```

---

## Web UI (recommended)

```bash
npm start
```

Opens the conversational chat UI at `http://localhost:3000`.

**Workflow:**
1. Type the entity name, country, and payment type in plain English (example prompts on the welcome screen)
2. The agent asks follow-up questions if anything is missing
3. Review the extracted parameters on the confirmation card
4. Click **Confirm** — substance interview starts (5 questions)
5. Answer the questions in the chat
6. Analysis runs with live agent log in the right panel
7. Report displayed as a formatted card with confidence badge
8. Review past analyses in the "Past Analyses" panel (right column)
9. Open the review drawer to sign off on any analysis (draft → reviewed → signed_off)

---

## CLI

```bash
# Analyse using a JSON input file
npm run tax:agent -- --input data/orange_polska_royalty.json

# Save report to a specific path
npm run tax:agent -- --input data/example_input.json --output reports/my_report.json
```

Input file format (see `data/example_input.json`):

```json
{
  "entity_name": "Alpine Holdings S.A.",
  "country": "Luxembourg",
  "income_type": "dividend",
  "shareholding_pct": 100,
  "annual_payment_pln": 5000000,
  "related_party": true
}
```

To include a DDQ document:

```json
{
  "entity_name": "Orange S.A.",
  "country": "France",
  "income_type": "royalty",
  "ddq_path": "data/ddqs/orange_sa_ddq.txt"
}
```

---

## DDQ extraction service (optional)

Enables Python-based document extraction for substance and DEMPE analysis.

```bash
# Install Python dependencies
pip install -r python/requirements.txt

# Start the service (port 8000)
npm run ddq:service
```

In `.env`: `DDQ_SERVICE_URL=http://localhost:8000`

Health check: `curl http://localhost:8000/health`

If the service is not running, the agent automatically falls back to the TypeScript LLM extractor or simulation — no error.

---

## Tests

```bash
npm test
```

246 tests across 9 test files. All tests run without API keys (simulation mode). Typical runtime ~3 seconds.

Test files:
- `src/shared/Goal.test.ts` — 4 tests: priority sorting, prompt generation
- `src/shared/Memory.test.ts` — 7 tests: findings store, summary, copy isolation
- `src/agents/WhtEnvironment.test.ts` — 74 tests: all environment methods
- `src/agents/BeneficialOwnerAgent.test.ts` — 36 tests: validateInput, computeReportConfidence, parseFindings
- `src/agents/FactCheckerAgent.test.ts` — 8 tests: simulate mode
- `src/agents/TreatyVerifierAgent.test.ts` — 15 tests: simulate mode
- `src/agents/contract.test.ts` — 13 tests: simulation output vs. Zod; Python vs. TypeScript schemas
- `src/agents/treaties.snapshot.test.ts` — 1 test: SHA-256 hash guard on treaties.json
- `src/server/EntityRegistry.test.ts` — 38 tests: registry upsert, persistence, review status
- `src/server/SubstanceInterviewer.test.ts` — 13 tests: state machine logic

---

## npm scripts reference

| Command | What it does |
|---|---|
| `npm start` | Web UI at http://localhost:3000 |
| `npm run tax:agent` | CLI agent (requires `--input <file>`) |
| `npm run ddq:service` | Python DDQ service on port 8000 |
| `npm run build` | TypeScript type-check (no output files) — zero errors required |
| `npm test` | All 246 unit tests (build precondition included) |
| `npm run lint` | ESLint + Prettier check across all TS files |
| `npm run test:coverage` | c8 coverage report (text + lcov) |
| `npm run verify:treaties` | Batch-verify treaty rates via Gemini (requires `GEMINI_API_KEY`) |
| `npm run review:list` | CLI: list all registry entries with `review_status: draft` |
| `npm run test:snapshot:update` | Recompute SHA-256 hash of treaties.json after intentional changes |
| `npm run test:contract:update` | Regenerate contract.json after Pydantic model changes |
| `npm run module1:prompting` | Module 1 prompting examples |
| `npm run module1:agent` | Module 1 text-based agent loop |
| `npm run module2:tools` | Module 2 function calling demo |
| `npm run module2:agent` | Module 2 registerTool() agent loop |
| `npm run module3:readme` | Module 3 README agent |
