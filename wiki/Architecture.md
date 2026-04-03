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
    ├── SubstanceExtractor      ← DDQ text → SubstanceResult (TS LLM extractor)
    ├── EntityRegistry          ← JSON registry; saved after every analysis
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
    ├── fact_check_substance    ─── FactCheckerAgent (Gemini + Google Search)
    └── consult_legal_sources   ─── LegalRagService (cosine search over CIT + MF chunks)
```

---

## GAME framework

### Goals — `BeneficialOwnerAgent.ts`

Seven goals with explicit priorities:

1. (Priority 1) Treaty existence and BO status — do not conclude without these
2. (Priority 2) Consult legal sources — retrieve statutory text before final BO determination
3. (Priority 3) Treaty rate — correct rate under the treaty
4. (Priority 4) Beneficial owner substance assessment — the factual core
5. (Priority 5) DEMPE analysis — for royalties
6. (Priority 6) EU Directive — 0% pathway
7. (Priority 7) MLI/PPT — anti-avoidance check
8. (Priority 8) Pay and Refund — compliance obligation

Goals are injected into the system prompt via `buildSystemPrompt()`.

### Actions — tool definitions

Ten tools defined in `BeneficialOwnerAgent.ts` with JSON Schema (plus `terminate`). All tool implementations are in `WhtEnvironment.ts`. The agent never directly accesses external data — it calls tools, tools call the environment.

**Zod validation layer (QA-2 + Phase 16):** `AgentInput` is validated at entry via `AgentInputSchema` (Zod v4). `SubstanceResult` and `DempeResult` are validated at environment boundaries via `contracts.ts`. `SourceTypeSchema` (Phase 16) validates the `source_type` parameter on `consult_legal_sources`. `z.infer<>` derives the TypeScript types throughout — no separate interfaces to drift.

### Memory — `Memory.ts`

Two stores:
- **Conversation history**: rolling message array (system / user / assistant / tool)
- **Findings store**: key-value map of structured results (e.g. `treaty_result`, `substance_result`)

`buildFindingsSummary()` injects a compact findings summary at each iteration to prevent the agent re-calling tools whose results are already known. This is the primary token-efficiency mechanism.

### Environment — `WhtEnvironment.ts`

All tool implementations. The environment is the isolation boundary between the agent loop and external data sources. Switching `simulate: true → false` changes every tool from simulated to live without touching the agent.

**Data tiers:**
1. **Live**: `check_treaty`, `get_treaty_rate`, `check_mli_ppt` — reads `data/treaties.json`
2. **Live + fallback**: `check_entity_substance`, `analyse_dempe` — calls Python DDQ service if configured, falls back to TypeScript extractor, then simulation
3. **Optional live**: `fact_check_substance` — calls FactCheckerAgent (Gemini) if `GEMINI_API_KEY` is set
4. **Semantic retrieval**: `consult_legal_sources` — cosine search over pre-embedded legal chunks (CIT Act + MF Objaśnienia). Phase 16 adds a `source_type` filter parameter and returns `source_type` + `legal_hierarchy` (1=statute, 3=guidance) in each chunk.

---

## MATE principles

### M — Model efficiency

Two model tiers via `LLM.fast()` / `LLM.powerful()`:
- Fast tier (`gpt-4o-mini`): InputExtractor, SubstanceExtractor (initial pass), simple lookups
- Powerful tier (`gpt-4o`): Agent reasoning, FactCheckerAgent, synthesis after fact-check confirms substance

`selectLlm()` in the agent loop upgrades from fast → powerful after a confirmed substance finding.

### A — Action specificity

Tools have narrow, precise schemas — no "do everything" tools. Every tool has:
- Enum-constrained parameters (`income_type: "dividend" | "interest" | "royalty"`)
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

## Multi-agent topology (Phase 7 + Phase 12a)

The WHT Agent (OpenAI GPT-4o) is the orchestrator. It calls two sub-agents:

```
WHT Agent (OpenAI)
    │
    ├── fact_check_substance tool
    │       └── FactCheckerAgent (Gemini + Google Search)
    │               → FactCheckResult { verified, sources, confidence }
    │
    └── [Phase 14] TreatyVerifierAgent called from WhtEnvironment.getTreatyRate()
                └── TreatyVerifierAgent (Gemini + Google Search)
                        → TreatyRateVerification { verified, confidence, note, sources }
```

**FactCheckerAgent** (Phase 7): triangulation rule — 2+ web sources = VERIFIED, 1 = UNVERIFIED, 0 = CONTRADICTED.

**TreatyVerifierAgent** (Phase 12a): verifies treaty rates against official sources. Batch script (`npm run verify:treaties`) works now. Wired into live agent flow in Phase 14.

---

## Legal knowledge RAG (Phase 9)

The `consult_legal_sources` tool retrieves relevant chunks from embedded legal source files:

```
LegalRagService
    │
    ├── Chunker      ← parses .md files at section boundaries; extracts frontmatter (last_verified)
    ├── Embedder     ← text-embedding-3-small via OpenAI API; incremental via SHA-256 manifest
    └── Retriever    ← cosine similarity search; returns top-K CitedChunk[]

Source files (data/knowledge_base/sources/):
    ├── PL-CIT-2026-WHT.md    ← CIT Act Arts. 4a, 21, 22, 22c, 26 (9 chunks)
    └── MF-OBJ-2025.md        ← MF Objaśnienia 2025 §2–§4 (14 chunks)

Each chunk carries:
    ├── source_id, section_ref, content
    ├── last_verified: "2026-04-02"   ← parsed from frontmatter; surfaced in tool output (Phase 14)
    └── embedding vector (in vectors.json — gitignored)
```

**RAG confidence gate (Phase 13):** `WhtReport.data_confidence` can only reach `HIGH` if `consult_legal_sources` returned ≥2 chunks with top cosine score ≥0.55. This ensures HIGH confidence is never based on simulated data alone.

**Machine-readable BO verdict (Phase 15):** `WhtReport` carries two new fields derived deterministically from structured findings — never from LLM free text:
- `bo_overall: BoOverall` — `'CONFIRMED' | 'UNCERTAIN' | 'REJECTED' | 'NO_TREATY'`. Decision order: no treaty → LOW confidence → substance FAIL/PASS → UNCERTAIN fallback.
- `conduit_risk: boolean` — `true` when REJECTED + country is in `KNOWN_ROUTING_JURISDICTIONS` (16 entries) OR `entity_type` is holding/shell/unknown. Signals that a human reviewer should investigate whether an ultimate BO exists in another jurisdiction.

---

## Web server (Phase 8+10+11+12b)

Express.js with endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /session` | Create session, return sessionId |
| `POST /session/:id/message` | Chat turn — InputExtractor or SubstanceInterviewer |
| `POST /session/:id/confirm` | Start `runWhtAnalysis()` in background |
| `GET /session/:id/stream` | SSE stream — live agent events |
| `GET /session/:id/report` | Completed WhtReport JSON |
| `GET /registry` | All past analyses (EntityRegistry entries, newest-first) |
| `GET /registry/entry` | Single registry entry by entity + country |
| `POST /registry/review` | Update review_status (draft / reviewed / signed_off) |

Session state machine: `chatting` → `interviewing` → `running` → `complete` / `error`

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

After all answers, `SubstanceExtractor.ts` converts the compiled DDQ text to a `SubstanceResult` JSON using the powerful model with `json_object` output mode.

---

## Citations and provenance (Phase 13)

Every `WhtReport` carries a `citations: Citation[]` array:

```typescript
interface Citation {
  tool: string;         // which tool produced this finding
  source: string;       // e.g. "MF-OBJ-2025"
  finding_key: string;  // matches a key in the findings store
  section_ref?: string; // e.g. "§2.3" — populated when RAG returns section metadata
  source_id?: string;   // canonical ID from legal_sources_registry.json
  chunk_count?: number; // how many RAG chunks supported this finding
  top_score?: number;   // highest cosine similarity score
}
```

Phase 16 (v0.19.0) extended `Citation` with `source_type?: string` and `legal_hierarchy?: number` (1=statute, 2=directive/treaty, 3=guidance, 4=commentary). The `consult_legal_sources` tool accepts a `source_type` filter parameter; `SourceTypeSchema` (Zod enum) validates it at runtime.

---

## Entity registry (Phase 11+12b)

`EntityRegistry.ts` — JSON-backed store at `data/registry.json` (gitignored):

- Lookup key: `entity_name::country` (normalised, case-insensitive)
- Upsert semantics: `created_at` preserved on re-analysis; `review_status` preserved unless incoming `bo_overall === 'REJECTED'` — in which case the status is reset to `'draft'` (conduit risk: a prior sign-off is no longer valid when a new analysis rejects the entity)
- `review_status`: `draft` (default) → `reviewed` → `signed_off`
- Every entry carries a full `WhtReport` snapshot + extracted `substance_tier` + `bo_overall`
- `getRegistry()` singleton — web server and CLI share state within a process

---

## Key files

| File | Role |
|---|---|
| `src/agents/BeneficialOwnerAgent.ts` | GAME definition: goals, tools, agent loop, `runWhtAnalysis()` |
| `src/agents/WhtEnvironment.ts` | All 10 tool implementations; environment isolation boundary |
| `src/agents/contracts.ts` | Zod schemas: `AgentInputSchema`, `SubstanceResultSchema`, `DempeResultSchema` |
| `src/agents/FactCheckerAgent.ts` | Gemini multi-agent — substance fact verification |
| `src/agents/TreatyVerifierAgent.ts` | Gemini multi-agent — treaty rate verification (Phase 14: wired in) |
| `src/server/index.ts` | Express server, session state machine, review endpoints |
| `src/server/InputExtractor.ts` | Free-text → AgentInput via LLM |
| `src/server/SubstanceInterviewer.ts` | 5-question interview state machine |
| `src/server/SubstanceExtractor.ts` | DDQ text → SubstanceResult via LLM |
| `src/server/EntityRegistry.ts` | JSON entity registry — upsert, audit trail, `getRegistry()` singleton |
| `src/shared/LLM.ts` | `generate()`, `generateWithTools()`, `LLM.fast/powerful`, `ToolFactory` |
| `src/shared/Memory.ts` | Conversation history + findings store |
| `data/treaties.json` | Treaty database: 37 countries (Brazil added v0.18.0), rates, MLI flags |
| `data/tax_taxonomy.json` | Tax taxonomy: ~40 concepts, rag_keywords, legal refs |
| `data/legal_sources_registry.json` | All legal sources with verification status |
| `data/legal_sources/PL-CIT-2026-WHT.md` | RAG source: CIT Act WHT provisions (9 chunks) |
| `data/legal_sources/MF-OBJ-2025.md` | RAG source: MF Objaśnienia 2025 (14 chunks) |
