# Project Architecture — WHT Beneficial Owner Agent

A complete explanation of how all components fit together, how data flows through the system,
and the design decisions behind each boundary.

---

## 1. System Overview

The project has two entry points that share the same agent core:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Entry Points                                                       │
│                                                                     │
│  Browser                       Terminal                             │
│  http://localhost:3000         npm run tax:agent -- --input <file>  │
│       │                                    │                        │
│       ▼                                    ▼                        │
│  Express server             parseInput() + resolveOutputPath()      │
│  src/server/index.ts        (CLI-specific, not exported)            │
│       │                                    │                        │
│       └──────────────┬─────────────────────┘                       │
│                      ▼                                              │
│             runWhtAnalysis(input, ddqText, outputPath, onEvent)     │
│             src/agents/BeneficialOwnerAgent.ts                      │
└─────────────────────────────────────────────────────────────────────┘
```

`runWhtAnalysis()` is the single public entry point for running the WHT agent. Both
the web server and the CLI call it. It owns GAME component setup and the agent loop.

---

## 2. The GAME Components

Every agent in this project follows the GAME framework:

```
G — Goals ──────► system prompt injected as the first message
A — Actions ────► tool definitions passed to generateWithTools()
M — Memory ─────► conversation history + structured findings store
E — Environment ► concrete tool implementations; data sources
```

### Where each component lives

```
src/agents/BeneficialOwnerAgent.ts
  │
  ├── WHT_GOALS (const)         — G: 7 goals with priorities
  ├── WHT_PERSONA (const)       — G: agent persona string
  ├── buildWhtTools()           — A: tool definitions with JSON Schema
  ├── runWhtAnalysis()          — orchestrates GAME setup + runAgent()
  │     └─ new WhtEnvironment() — E: instantiated here
  │     └─ new Memory()         — M: fresh instance per run
  │     └─ buildSystemPrompt()  — G: compiled into system prompt
  └── runAgent()                — domain-agnostic loop; dispatches to E

src/shared/Memory.ts            — M: conversation + findings store
src/shared/Goal.ts              — G: Goal type + buildSystemPrompt()
src/shared/LLM.ts               — LLM.fast() / LLM.powerful(); generateWithTools()
src/agents/WhtEnvironment.ts    — E: all 8 tool implementations
```

---

## 3. The Agent Loop in Detail

One iteration of the loop:

```
1. Build messages = conversation history + findings summary injected as user message
2. selectLlm()  → fast tier (no complex findings yet) OR powerful tier (substance/DEMPE present)
3. generateWithTools(messages, tools)  → response
4. If response.type === 'text':  save report, return  (model answered directly)
5. Push assistantMessage to memory  ← MUST happen before tool results
6. For each call in response.calls:
     a. Duplicate guard: identical call already made? → return reminder, skip
     b. 'terminate'?    → save report, return
     c. Otherwise:      → dispatch to WhtEnvironment, record finding, push tool message
7. Loop ends: maxIterations reached → save incomplete report, return
```

**The duplicate guard** is a critical loop-prevention mechanism. Without it, the model
occasionally re-calls the same tool with the same arguments when it forgets a prior result.
The guard tracks `"toolName:argsJSON"` in a Set and returns an instruction reminder instead.

**The findings injection** happens every iteration as a user message (not system prompt).
This keeps the system prompt stable across iterations, which is important for models that
weight system prompt tokens more heavily than mid-conversation context.

---

## 4. The Tool Dispatch Chain

```
runAgent() dispatch switch
    │
    ├── 'check_treaty'              env.checkTreaty(country)
    ├── 'get_treaty_rate'           env.getTreatyRate(country, type, pct)
    ├── 'check_mli_ppt'             env.checkMliPpt(country)
    ├── 'check_directive_exemption' env.checkDirectiveExemption(...)
    ├── 'check_pay_and_refund'      env.checkPayAndRefund(...)
    ├── 'check_entity_substance'    await env.checkEntitySubstance(entity, country)
    ├── 'analyse_dempe'             await env.analyseDempe(entity, country, ipType)
    ├── 'fact_check_substance'      await env.factCheckSubstance(entity, country, claims)
    └── 'consult_legal_sources'     await env.consultLegalSources(query, concept_ids?, module?)
```

Three methods are `async` because they call external services:
- `checkEntitySubstance` → Python DDQ service (`/substance`)
- `analyseDempe` → Python DDQ service (`/dempe`)
- `factCheckSubstance` → `FactCheckerAgent` → Gemini REST API + Google Search

Each async method has a synchronous simulation fallback — if the service is unreachable
or the API key is absent, it returns a structured simulated result automatically.

---

## 5. Data Sources and the Simulation Boundary

```
Tool                  Live data source                 Fallback (simulate)
────────────────────  ───────────────────────────────  ─────────────────────────────
check_treaty          data/treaties.json (static)      same (always live)
get_treaty_rate       data/treaties.json (static)      same (always live)
check_mli_ppt         data/treaties.json (static)      same (always live)
check_entity_substance Python DDQ service /substance   hardcoded entity profiles
analyse_dempe          Python DDQ service /dempe        hardcoded DEMPE templates
check_directive_*      inline logic (CIT Act rules)    same (always live logic)
check_pay_and_refund   inline logic (CIT Act rules)    same (always live logic)
fact_check_substance   Gemini REST + Google Search     INCONCLUSIVE result
```

The `simulate: boolean` flag on `WhtEnvironment` controls whether the three async tools
try to call external services. When `simulate: true`, all tool calls resolve synchronously
with pre-built responses — no network calls, no API keys required for tests.

**Switching to full live mode for a tool:**

```typescript
const env = new WhtEnvironment({
  simulate:      false,   // try all live paths
  ddqServiceUrl: process.env['DDQ_SERVICE_URL'],  // for substance + DEMPE
  ddqText:       ddqText,  // DDQ file contents to send to service
});
```

If `ddqServiceUrl` is not set (or service is down), the environment silently falls back.
The agent is always runnable — degraded (simulation) but functional.

---

## 6. Multi-Agent Topology

Phase 7 introduced a second agent (FactChecker) called from within the first agent's
tool dispatch. This is the **call_agent** pattern:

```
┌─────────────────────────────────────────────┐
│ WHT Agent (OpenAI gpt-4o / gpt-4o-mini)     │
│                                             │
│  ... check_entity_substance ...             │
│  ... analyse_dempe ...                      │
│  ─────────────────────────────────────────  │
│  fact_check_substance(entity, claims[])     │
│       │                                     │
│       ▼                                     │
│  WhtEnvironment.factCheckSubstance()        │
│       │                                     │
│       ▼                                     │
│  FactCheckerAgent.verify()                  │─── GEMINI_API_KEY set?
│       │                      NO ────────────────► simulateResult()
│       │ YES                                 │      INCONCLUSIVE
│       ▼                                     │
│  Gemini REST API                            │
│  + google_search tool                       │
│       │                                     │
│       ▼                                     │
│  FactCheckResult (JSON)                     │
│  overall_assessment: CONFIRMS /             │
│                      INCONCLUSIVE /         │
│                      UNDERMINES             │
│       │                                     │
│       └─► memory.recordFinding('fact_check_result', ...)
│       └─► computeReportConfidence() uses this to set HIGH/MEDIUM/LOW
└─────────────────────────────────────────────┘
```

**Key design choices:**
- The FactChecker is instantiated inside `WhtEnvironment`, not the agent loop.
  The loop only knows about the `fact_check_substance` tool — not about Gemini.
- The FactChecker result feeds back into `computeReportConfidence()`:
  `CONFIRMS` → can upgrade to HIGH; `UNDERMINES` → unconditionally LOW.
- `INCONCLUSIVE` (simulation or mixed results) → falls through to standard substance logic.

---

## 7. Web UI Architecture (Phase 8)

```
Browser                 Express Server          Agent Core
──────────────────────  ─────────────────────   ──────────────────────────

1. Load page
   GET /                ──► sendFile(index.html)

2. Create session
   POST /session        ──► sessions.set(id, {...})
                        ◄── { sessionId }

3. Chat turns (repeat until ready)
   POST /session/:id/message   ──► InputExtractor.extract(history)
                                    └─ OpenAI gpt-4o-mini
                                       response_format: json_object
                                ◄── { type: 'question', text: "..." }
                                or
                                ◄── { type: 'ready', text: "...", input: AgentInput }

4. User confirms
   POST /session/:id/confirm   ──► session.status = 'running'
                                    runWhtAnalysis(input, ..., onEvent) [background]
                                ◄── { started: true }  [immediate]

5. SSE stream (while agent runs)
   GET /session/:id/stream     ──► res.setHeader('Content-Type', 'text/event-stream')
                                    res.flushHeaders()
                                    session.sseClients.push(res)
                                         │
                                         │ onEvent(AgentEvent) fires in runAgent()
                                         │
                                    broadcastEvent(session, event)
                                ◄── data: {"type":"tool_call","message":"..."}
                                ◄── data: {"type":"tool_result","message":"..."}
                                ◄── data: {"type":"final_answer","message":"..."}
                                ◄── data: {"type":"report_saved","data":{"report":{...}}}

6. Report displayed in browser from SSE event data (no extra fetch needed)
```

**Session state machine:**

```
'chatting'  ──[/confirm]──►  'running'  ──[complete]──►  'complete'
                                                 └──[error]──►  'error'
```

Sessions are stored in a `Map<string, Session>` in memory. This is sufficient for
single-server development use. For production, replace with Redis or a database.

---

## 8. Data Confidence Scoring

Every report includes `data_confidence: 'HIGH' | 'MEDIUM' | 'LOW'` derived from the
findings and citation metadata collected during the run.
The logic in `computeReportConfidence(findings, citations)` (Phase 13 extended):

```
FactCheckResult present?
  └─ overall_assessment === 'UNDERMINES'  →  LOW  (public source contradicted DDQ)
  └─ overall_assessment === 'CONFIRMS'
       └─ treaty rate verified AND RAG legal grounding?  →  HIGH
       └─ otherwise  →  MEDIUM
  └─ INCONCLUSIVE or absent  →  fall through ↓

entity_substance.confidence === 'LOW'?  →  LOW  (simulated substance data)

wht_rate.verified === false?  →  MEDIUM  (unverified treaty rate)

RAG legal grounding absent?   →  MEDIUM  (no statutory text cited)
  [grounding = consult_legal_sources returned ≥2 chunks, top_score ≥0.55]

Otherwise  →  HIGH
```

**Phase 13 addition — the RAG legal grounding gate:**
Every report now carries `citations: Citation[]` (one entry per tool call). A citation
from `consult_legal_sources` carries `chunk_count` and `top_score`. `hasRagLegalGrounding()`
checks that the agent retrieved meaningful legal text — at least 2 chunks with a similarity
score above 0.55. Without this gate, HIGH confidence could be awarded even when the agent
never consulted the actual statutory text.

**Practical meaning today:**
- Run without DDQ → `LOW` (substance simulated)
- Run with DDQ + no RAG call → `MEDIUM` (substance real but no statutory grounding)
- Run with DDQ + RAG (strong hits) + verified rate → `HIGH`
- Any run where FactChecker `UNDERMINES` → `LOW` regardless of other signals

The note attached to each confidence level explicitly states the limitation.

---

## 9. Test Coverage Map

All 246 tests run without network calls. The test boundary is `WhtEnvironment` — the
Environment class is tested exhaustively; the agent loop and LLM are not unit tested.

```
Test file                            Count  What it covers
───────────────────────────────────  ─────  ──────────────────────────────────────────
WhtEnvironment.test.ts                  74  All 8 tool implementations (simulate + live modes)
                                            Parameter validation (invalid enum, out-of-range)
                                            Country alias resolution (UK, USA, Czechia, etc.)
                                            Regression guards (valid inputs do not return errors)
                                            factCheckSubstance delegation + error handling
FactCheckerAgent.test.ts                 8  Simulation mode: entity/country, claim count,
                                            all UNVERIFIED, INCONCLUSIVE overall, risk flags,
                                            required field shapes, source text, ISO date format
TreatyVerifierAgent.test.ts             15  Simulate mode: shape, status NOT_FOUND,
                                            null confirmed_rate, echoed fields, ISO date format
                                            All three income types, zero rate, unusual countries
EntityRegistry.test.ts                  38  Upsert semantics, lookup key normalisation,
                                            audit trail (created_at preserved on re-analysis),
                                            substance_tier + bo_overall extraction, run_count
                                            updateReviewStatus: review/sign-off/reset,
                                            reviewer_note, reviewed_by, disk persistence
BeneficialOwnerAgent.test.ts            36  validateInput (Zod v4): valid path, all rejections,
                                            boundary values (0/100), multi-field error messages
                                            computeReportConfidence: LOW/MEDIUM/HIGH paths,
                                            RAG grounding gate (≥2 chunks, top_score ≥0.55),
                                            FactChecker interaction (CONFIRMS/UNDERMINES)
                                            parseFindings: JSON/non-JSON, empty map, copy isolation
contract.test.ts                        13  Category A: simulation output validates against Zod schemas
                                            Category B: Python field names + enum values match TypeScript
treaties.snapshot.test.ts               1  SHA-256 hash of treaties.json (change detector)
SubstanceInterviewer.test.ts            13  State machine flow, question sequencing,
                                            DDQ text compilation from interview answers
Chunker.test.ts + LegalRagService.test  30  Frontmatter parsing, body splitting, chunk_id generation,
                                            extractSectionRef, cosine similarity, filtering, top_k
Retriever.test.ts                       17  Similarity score, filter combinations, top_k ordering
Goal.test.ts                             3  Priority sorting, persona inclusion, goal names
Memory.test.ts                           4  Findings store, getFindings() copy isolation,
                                            buildFindingsSummary() format
```

**What is intentionally not unit tested:**
- The agent loop (`runAgent`) — it requires live LLM calls; validate via end-to-end runs
- `InputExtractor` — requires live LLM; validates itself by delegating to `validateInput()`
- The Express server endpoints — HTTP integration; validate manually or with `supertest`
- `SubstanceExtractor` — wraps an LLM call; covered indirectly by SubstanceInterviewer tests

---

## 10. Key Interfaces Quick Reference

```typescript
// Input to the agent
interface AgentInput {
  entity_name:             string;
  country:                 string;
  income_type:             'dividend' | 'interest' | 'royalty';
  shareholding_percentage: number;         // 0–100
  substance_notes?:        string;
  annual_payment_pln?:     number;
  related_party?:          boolean;
  ddq_path?:               string;         // path to DDQ file
}

// Output from the agent (Phase 13 extended)
interface WhtReport {
  generated_at:            string;         // ISO timestamp
  entity_name:             string;
  country:                 string;
  income_type:             string;
  shareholding_percentage: number;
  related_party?:          boolean;
  substance_notes?:        string;
  data_confidence:         'HIGH' | 'MEDIUM' | 'LOW';
  data_confidence_note:    string;         // human-readable explanation
  conclusion:              string;         // agent's full narrative conclusion
  findings:                Record<string, unknown>;  // parsed tool results
  citations:               Citation[];    // one entry per tool call, in order
}

// One citation entry — links a conclusion to its data source
interface Citation {
  tool:          string;         // e.g. "get_treaty_rate", "consult_legal_sources"
  source:        string;         // data origin text from the tool result
  finding_key?:  string;         // key in memory.findings (undefined for RAG)
  section_ref?:  string;         // statutory section (from RAG chunks)
  source_id?:    string;         // legal source ID (e.g. "MF-OBJ-2025")
  chunk_count?:  number;         // how many RAG chunks were returned
  top_score?:    number;         // cosine similarity score of the best chunk
}

// Progress event emitted during the agent loop
interface AgentEvent {
  type:    AgentEventType;  // 'start' | 'iteration' | 'tool_call' | 'tool_result' | ...
  message: string;          // human-readable, shown in UI log
  data?:   unknown;         // structured payload (e.g. { name, arguments } for tool_call)
}

// FactChecker output
interface FactCheckResult {
  entity:             string;
  country:            string;
  verification_date:  string;
  claims:             VerifiedClaim[];    // VERIFIED / UNVERIFIED / CONTRADICTED per claim
  wht_risk_flags:     string[];
  overall_assessment: 'CONFIRMS' | 'INCONCLUSIVE' | 'UNDERMINES';
  source:             string;
}
```

---

## 11. Legal Knowledge RAG Pipeline (Phase 9)

The `consult_legal_sources` tool gives the agent access to exact statutory text via
retrieval-augmented generation. The pipeline has three offline stages and one runtime stage:

```
OFFLINE — run once with: npm run rag:build
─────────────────────────────────────────────────────────────────────────────
src/rag/sources/*.md          ← authoritative legal text (CIT Act, MF Objaśnienia)
        │
        ▼
Chunker.chunk()               ← splits each source into overlapping text chunks
        │                        (chunk size ~400 tokens, 50-token overlap)
        ▼
Embedder.embed()              ← calls OpenAI text-embedding-3-small for each chunk
        │                        (1536-dimensional vector per chunk)
        ▼
data/knowledge_base/
  embeddings/vectors.json     ← stored: { chunkId, text, embedding[], source, article }

RUNTIME — called by consult_legal_sources tool
─────────────────────────────────────────────────────────────────────────────
Agent calls consult_legal_sources(query)
        │
        ▼
LegalRagService.retrieve(query)
        │
        ├── Embedder.embed(query)     ← embeds the query (same model, same space)
        │
        ├── Retriever.retrieve()      ← cosine similarity: query vector vs. all chunk vectors
        │                                top-k chunks returned (default k=5)
        │
        └── Returns: chunk text + source reference + similarity score
                │
                ▼
        Agent synthesises the retrieved text into its reasoning
```

**Key design decisions:**
- No external vector database — embeddings stored as a plain JSON file. Sufficient for
  the current corpus size (~23 chunks, 2 source files); swap to Pinecone or pgvector for
  production scale.
- OpenAI `text-embedding-3-small` — 1536 dimensions, low cost, high quality for legal text.
- Rebuild trigger: run `npm run rag:build` after editing any file in `src/rag/sources/`.
- `last_verified` frontmatter (DOCS-2, v0.16.0): each source file carries the date it was
  last checked against the official consolidated text. The field is parsed by `Chunker`,
  stored on every `Chunk` and `CitedChunk`, and ready to be surfaced in tool results.
  **Ghost note (Phase 14):** the field is not yet shown in `consultLegalSources` output —
  wiring this is planned for Phase 14 (Ghost Activation).

**Phase 13 (v0.13.0):** retrieval metadata (chunk count, similarity scores) now feeds
`computeReportConfidence()` via the RAG legal grounding gate (≥2 chunks, top_score ≥0.55).

---

## 12. Adding a New Tool — Checklist

1. **Define the tool** in `buildWhtTools()` (BeneficialOwnerAgent.ts):
   - `name`, `description` (model reads this — write it clearly)
   - `parameters` with JSON Schema; use `enum` for all constrained strings
   - Add to `required` array

2. **Implement in WhtEnvironment**:
   - Add a method (sync or `async` if it calls external service)
   - Validate all parameters at the top — return `JSON.stringify({ error: '...' })` for bad input
   - Always include `source` field in the return object
   - For async methods: add a simulation path as fallback

3. **Add dispatch case** in `runAgent()` switch statement:
   - Call the method (with `await` if async)
   - `memory.recordFinding('finding_key', result)`

4. **Add to `COMPLEX_FINDINGS`** if the tool returns data that requires sophisticated reasoning:
   - Adding the finding key here causes `selectLlm()` to switch to the powerful model tier

5. **Add goal** to `WHT_GOALS` — describe when and how to call this tool

6. **Write tests** in `WhtEnvironment.test.ts`:
   - Happy path (valid inputs return expected fields)
   - Error path (invalid inputs return `{ error: ... }`)
   - Regression guard (valid inputs do NOT return `error` field)

7. **Run `npm run build` and `npm test`** before committing.
