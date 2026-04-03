# Agentic AI Design Guide

Patterns and decisions distilled from building the WHT Beneficial Owner Agent.
Intended as a reusable reference for any future agentic project in TypeScript.

---

## 1. The GAME Framework

Design every agent before writing code. Four components:

| Letter | Component | Question it answers |
|---|---|---|
| **G** | Goals | What is the agent trying to accomplish? In what order? |
| **A** | Actions | What tools can the agent use? What are their schemas? |
| **M** | Memory | What does the agent need to remember across iterations? |
| **E** | Environment | How are actions actually executed? What are the real data sources? |

**Critical insight:** The agent loop itself is domain-agnostic. All domain knowledge lives in
G, A, and E. The loop just orchestrates them. If you find domain logic creeping into the loop,
move it to the right GAME component.

### Goals implementation

```typescript
interface Goal {
  name: string;
  description: string;
  priority?: number;  // higher = more important; omit = lowest priority
}

function buildSystemPrompt(persona: string, goals: Goal[]): string {
  const sorted = [...goals].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  // ... generate prompt with sorted goals
}
```

Rules:
- Goals should be independent and testable ("has this goal been achieved?")
- 3–6 goals is the sweet spot; more becomes a monolith in disguise
- Generate the system prompt from goal objects — don't hand-write it alongside the code

### Actions implementation

```typescript
// Every tool needs three things: name, description, JSON Schema parameters
const tool: Tool = {
  name: 'get_treaty_rate',
  description: 'Returns the WHT rate... (plain English, model reads this)',
  parameters: {
    type: 'object',
    properties: {
      residence_country: { type: 'string', description: '...' },
      income_type: { type: 'string', enum: ['dividend', 'interest', 'royalty'] },
    },
    required: ['residence_country', 'income_type'],
  },
};
```

Rules:
- Specific tool names beat generic ones: `getTreatyRateDividend` > `getRate`
- The `description` is the model's instruction — write it as if explaining to a junior colleague
- Use `enum` to constrain string arguments — reduces hallucination
- Error messages from tools should guide the model: "Call listFiles() to get valid paths"
- Always include a `source` field in tool results — this is the auditability anchor
- `ToolFactory.terminate()` for the stop signal — no text parsing, no FINAL ANSWER hacks

### Memory implementation

Two layers:

```typescript
class Memory {
  private messages: Message[] = [];           // conversational — what the LLM reads
  private findings: Record<string, string>;   // structured — derived facts

  buildFindingsSummary(): string { ... }       // injects as "## Findings so far" block
}
```

Rules:
- Inject findings as a **user message** (not into the system prompt) — keeps system prompt stable
- `getFindings()` must return a copy — never expose internal state directly
- Key finding names should be stable and descriptive: `wht_rate`, `treaty_status`, `ppt_risk`
- Structured findings are the machine-readable output — they outlast the conversation

### Environment implementation

```typescript
class WhtEnvironment {
  constructor(private options: { simulate: boolean }) {}

  getTreatyRate(country: string, type: string, pct: number): string {
    if (!this.options.simulate) { /* call real API */ }
    return JSON.stringify({ rate: 5, source: '...' });  // always return JSON string
  }
}
```

Rules:
- One class owns all tool implementations — never inline them in the agent loop
- `simulate: boolean` is the live-data switch — only one change needed at the call site
- Return JSON strings (not objects) — consistent with how the API sends results back
- Throw `Error('Live mode not implemented')` in un-implemented branches — fail loudly

---

## 2. The Agent Loop Pattern

```typescript
async function runAgent(systemPrompt, task, tools, env, memory, maxIterations = 12) {
  memory.addMessage(Message.system(systemPrompt));
  memory.addMessage(Message.user(task));

  for (let i = 1; i <= maxIterations; i++) {
    // Inject findings summary before each call
    const messages = memory.buildFindingsSummary()
      ? [...memory.getMessages(), Message.user(summary + 'Continue.')]
      : memory.getMessages();

    const response = await llm.generateWithTools(messages, tools);

    if (response.type === 'text') { /* model answered directly */ return; }

    memory.addMessage(response.assistantMessage);  // MUST come before tool results

    for (const call of response.calls) {
      if (call.name === 'terminate') { /* print answer, return */ }

      const result = env.dispatch(call.name, call.arguments);
      memory.recordFinding(call.name, result);      // structured memory
      memory.addMessage(Message.tool(result, call.id));  // conversational memory
    }
  }
}
```

**The two memory pushes that must always happen in order:**
1. `memory.addMessage(response.assistantMessage)` — the tool-call request (with `tool_calls` structure)
2. `memory.addMessage(Message.tool(result, call.id))` — the result (linked by `call.id`)

The API will reject `tool` messages that don't follow a `tool_calls` assistant message. This is
the most common bug when first implementing function calling.

---

## 3. Function Calling vs Text-Based Loops

| Approach | When to use | Key risk |
|---|---|---|
| **Text-based** (THOUGHT/ACTION) | Debugging, models without function calling support | Model drifts from format; parser breaks |
| **Function calling** (OpenAI tools API) | Production, any OpenAI-compatible model | Slightly more complex message history |

Always use function calling for production. The text-based approach (Module 1) is valuable for
understanding the mechanics, not for shipping.

### The AgentLanguage abstraction

The course introduces an `AgentLanguage` interface to switch between strategies without changing
agent logic. This is valuable if:
- You need to run on models without function calling support
- You want a `MockAgentLanguage` for deterministic unit tests
- You're building a reusable framework for multiple teams

Skip it if you're using one model, one team, one agent. Premature abstraction adds indirection
for no current benefit. Name your code to signal where it would slot in.

---

## 4. The `StoredToolCall` Round-Trip

The single most common bug when implementing function calling for the first time.

When the model responds with tool calls, you cannot store the response as plain text and send
it back. The API enforces that the assistant message before any `tool` results must carry the
actual `tool_calls` structure.

```typescript
// WRONG — API rejects the subsequent tool messages
messages.push(Message.assistant(`[tool_calls]: ${JSON.stringify(calls)}`));

// CORRECT — assistantMessage carries StoredToolCall[] internally
messages.push(response.assistantMessage);
```

The `assistantMessage` object is returned by `generateWithTools()` ready to push.
`StoredToolCall` is the SDK-agnostic struct that round-trips the API's required shape.

---

## 5. Testing Strategy for Agents

| What to test | How | Why |
|---|---|---|
| Environment methods | `node:test`, no LLM | Fast, cheap — catches data bugs before live switch |
| Memory operations | `node:test`, no LLM | Ensures findings isolation, summary format |
| Goal/prompt builders | `node:test`, no LLM | Verifies priority sorting, persona inclusion |
| Agent loop | Integration test with real LLM | Expensive — run sparingly |

Use `node:test` (Node 18 built-in) — zero dependencies, fast, sufficient for pure function tests.

Write tests **before** switching `simulate: false`. The test suite becomes the regression guard
that tells you whether the real data source returns the shape you expected.

```typescript
// Pattern: parse the JSON string, assert on the parsed object
function parse(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>;
}

test('getTreatyRate: 10% threshold is inclusive', () => {
  const result = parse(env.getTreatyRate('Luxembourg', 'dividend', 10));
  assert.equal(result['treaty_rate_percent'], 5);
});
```

---

## 6. Tool Design Best Practices

**Specificity beats generality.** A tool that does one thing well is better than a tool that
does many things ambiguously.

```
listFiles()            →  ambiguous: which directory? which extension?
listTypeScriptFiles()  →  clear: src/*.ts only
```

**Error messages are instructions.** Instead of adding complex rules to the system prompt,
encode guidance in error responses:

```typescript
if (!fs.existsSync(resolved)) {
  return JSON.stringify({
    error: `File not found: "${filePath}". Call list_typescript_files() to get valid paths.`
  });
}
```

The model reads the error and self-corrects. This is "just-in-time instruction" — more
reliable than asking the model to remember a rule from earlier in the conversation.

**Always include `source`.** Every tool result should have a `source` field that names the
authoritative data origin. During simulation, mark it explicitly:
`"source": "Simulated — to be replaced with OECD treaty database"`.
This makes the simulation/live boundary visible and forces the question: what is the real source?

---

## 7. The simulate → live Migration Path

This is the payoff of the Environment isolation. The migration checklist:

1. Write unit tests for all Environment methods against simulated data ✓
2. Implement the real data source in a new branch
3. Change `new WhtEnvironment({ simulate: false })`
4. Run the existing unit tests — they tell you if the real source matches the expected shape
5. Run the full agent — check that conclusions are consistent with simulated runs

Only the Environment class changes. Goals, Memory, the loop, and tool definitions are untouched.

---

## 8. Common Pitfalls Checklist

- [ ] `tool` messages missing `tool_call_id` → API rejects them
- [ ] Assistant tool-call message stored as plain text → API rejects subsequent tool results
- [ ] No `maxIterations` → agent loops forever, burns API budget
- [ ] Model ignores `terminate()` → make the instruction explicit in the persona, not just goals
- [ ] Tool results returned as objects not strings → always `JSON.stringify()`
- [ ] `getFindings()` returns a reference → mutations corrupt internal state; always return a copy
- [ ] `any` type in strict TypeScript → use `unknown` and narrow explicitly
- [ ] Committing without `npm run build` → broken TypeScript ships silently
- [ ] Merging to master without a branch → lose the ability to track feature history
- [ ] SSE: not calling `res.flushHeaders()` → browser does not start receiving events
- [ ] Background async: not `.catch()`-ing `runWhtAnalysis()` → unhandled promise rejection crashes server
- [ ] Gemini + `responseSchema` + `google_search` → these two cannot be used together; use system prompt + JSON extraction instead
- [ ] `async` Environment methods: forgetting `await` in the dispatch switch → silent undefined result
- [ ] In-memory session store: no TTL → memory grows unbounded in production; add cleanup for prod

---

## 9. The Multi-Agent call_agent Pattern

When a task requires a capability the orchestrating model lacks — such as real-time web search —
delegate to a specialist agent via a tool call.

```
WHT Agent (OpenAI) ──► fact_check_substance tool ──► FactCheckerAgent (Gemini)
                                                           └─ google_search
                         ◄── FactCheckResult (JSON) ───────────────────────────
```

**Implementation decisions:**

1. **Different model, different vendor** — OpenAI for structured legal reasoning (function calling,
   reliable JSON), Gemini for live web search grounding. Choose each model for what it does best.

2. **No SDK for the specialist** — call Gemini via raw `fetch()` to the REST endpoint. This avoids
   adding an SDK dependency for an optional component. Use `google_search: {}` in the tools array.

3. **Structured output from the specialist** — the specialist's system prompt must demand strict JSON.
   Because Gemini's `responseSchema` and `google_search` cannot be used simultaneously, extract JSON
   from the text response using three fallback strategies: raw parse → markdown fence → first-brace heuristic.

4. **Simulate fallback is mandatory** — the specialist must return a safe, structurally valid result
   when the API key is absent or the call fails. The orchestrating agent must never see `undefined`.

5. **Confidence propagation** — the specialist's verdict (`CONFIRMS` / `INCONCLUSIVE` / `UNDERMINES`)
   feeds back into the orchestrating agent's report confidence. This is the Memory Reflection pattern:
   the sub-agent's conclusion modifies the main agent's output quality tier.

```typescript
// The specialist as an injected dependency
class WhtEnvironment {
  private factChecker: FactCheckerAgent;

  constructor(options: WhtEnvironmentOptions) {
    this.factChecker = new FactCheckerAgent({ simulate: options.simulate });
  }

  async factCheckSubstance(entity, country, claims): Promise<string> {
    const result = await this.factChecker.verify(entity, country, claims);
    return JSON.stringify(result);  // always a string; caller handles parsing
  }
}
```

**Rule:** The specialist is injected into the environment, not into the agent loop.
The loop remains domain-agnostic; it just dispatches `fact_check_substance` like any other tool.

---

## 10. Async Environment Methods

When a tool needs to call an external service, the method signature changes from `string` to
`Promise<string>`. This change must propagate through the entire call chain.

```typescript
// Before — synchronous
checkEntitySubstance(name: string, country: string): string

// After — async (calls Python DDQ service or Gemini)
async checkEntitySubstance(name: string, country: string): Promise<string>
```

**The propagation chain:**

```
WhtEnvironment.checkEntitySubstance()  ← async
  ↑ awaited in
BeneficialOwnerAgent dispatch switch   ← await env.checkEntitySubstance(...)
  ↑ inside
runAgent()                             ← already async — no signature change
```

**Graceful fallback pattern:**

```typescript
async checkEntitySubstance(entity: string, country: string): Promise<string> {
  if (this.ddqServiceUrl && this.ddqText) {
    try {
      const response = await fetch(`${this.ddqServiceUrl}/substance`, { ... });
      if (response.ok) return await response.text();
    } catch (err) {
      console.warn(`[ENV] DDQ service failed: ${err}. Falling back to simulation.`);
    }
  }
  return this.simulateSubstance(entity, country);  // always works
}
```

Rule: every async tool method must have a synchronous simulation path it falls back to.
This means `simulate: true` tests remain synchronous in spirit — they resolve immediately.
Existing tests just need `await` added; no logic changes required.

---

## 11. Exporting Agent Functions for Reuse

When an agent graduates from a CLI script to a library used by a web server, export the
contract without exposing CLI-specific internals.

**What to export:**

```typescript
// Types the server needs to build inputs and interpret outputs
export interface AgentInput { ... }
export interface WhtReport  { ... }
export interface AgentEvent { ... }
export type AgentEventType = ...;

// Validation — used by both CLI and server's InputExtractor
export function validateInput(raw: unknown): AgentInput { ... }

// Task string builder — also useful for display in confirmation cards
export function buildTaskString(input: AgentInput): string { ... }

// The single public entry point for running the analysis
export async function runWhtAnalysis(
  input: AgentInput,
  ddqText: string | undefined,
  outputPath: string,
  onEvent: (event: AgentEvent) => void
): Promise<WhtReport> { ... }
```

**What NOT to export:**

```typescript
// parseInput() — reads process.argv, calls process.exit — CLI only
// resolveOutputPath() — reads process.argv for --output flag — CLI only
// runAgent() — internal; callers use runWhtAnalysis() instead
// WHT_GOALS, WHT_PERSONA — internal; the caller doesn't configure goals
```

**The CLI `main()` becomes a thin wrapper:**

```typescript
async function main(): Promise<void> {
  const { input, ddqText } = parseInput();        // CLI-specific
  const outputPath = resolveOutputPath(input);    // CLI-specific
  await runWhtAnalysis(input, ddqText, outputPath, (_event) => { /* emit() logs to console */ });
}
```

Rule: the exported API surface should be as small as possible. Expose what the consumer
needs to know; hide everything about how the agent loop is implemented internally.

---

## 12. Streaming Agent Progress via SSE

Server-Sent Events (SSE) are the right transport for agent progress: unidirectional (server → browser),
built into browsers natively (`EventSource` API), no library required.

**The callback pattern in the agent loop:**

```typescript
// The agent loop accepts an optional onEvent callback
async function runAgent(..., onEvent?: (event: AgentEvent) => void): Promise<WhtReport> {
  const emit = (type: AgentEventType, message: string, data?: unknown): void => {
    console.log(message);          // CLI output stays
    onEvent?.({ type, message, data });  // web output added alongside
  };

  emit('iteration', `ITERATION ${i}`, { iteration: i });
  emit('tool_call',  `[TOOL CALL] ${name}`, { name, arguments: args });
  emit('tool_result', `[TOOL RESULT] ${result}`, { name, result });
  emit('final_answer', answer, { conclusion: answer });
}
```

**The server-side SSE endpoint:**

```typescript
app.get('/session/:id/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();   // ← critical: send headers now, not when first data arrives

  session.sseClients.push(res);
  req.on('close', () => {
    session.sseClients = session.sseClients.filter(c => c !== res);
  });
});

function broadcastEvent(session, event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;  // SSE wire format
  for (const client of session.sseClients) client.write(line);
}
```

**The browser-side EventSource:**

```javascript
const es = new EventSource('/session/' + sessionId + '/stream');
es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  if (event.type === 'report_saved') displayReport(event.data.report);
  else appendLog(event);
};
```

**Why SSE over WebSockets:** SSE is simpler (HTTP only, no upgrade handshake), built-in
to browsers, and sufficient for one-directional streaming. WebSockets add complexity that
is only justified when the browser also needs to send messages after the stream starts.

---

## 13. Conversational Input Extraction

When replacing a structured form with free-text input, use an LLM with `response_format: json_object`
to extract the required parameters across multiple turns.

**The two-state machine:**

```typescript
type ExtractionResult =
  | { status: 'need_more'; question: string }   // ask the user for a missing field
  | { status: 'ready'; input: AgentInput; summary: string };  // all fields present
```

**The extraction prompt pattern:**

```
Return JSON with:
  { "status": "need_more", "question": "Single question for missing field" }
  or
  { "status": "ready", "entity_name": "...", "country": "...", ..., "summary": "..." }

INFERENCE RULES:
  - "S.A." after a name → France; "GmbH" → Germany; "Ltd" → UK; "BV" → Netherlands
  - "brand licence" or "technology licence" → income_type: "royalty"
```

**Validation at the boundary:**

```typescript
// After extraction succeeds, run the same validation the CLI uses
const input = validateInput({ entity_name, country, income_type, ... });
// If validateInput() throws, return need_more with the error as the question
```

This means there is exactly one validation function, shared by CLI and web UI.
The LLM extraction is a UI convenience layer — it is not trusted to produce correct types;
`validateInput()` is the enforcement gate.

**Temperature = 0.** Extraction is a deterministic transformation; temperature should be 0
to ensure the same user message always produces the same extraction.

---

## 14. Runtime Input Validation with Zod

Using Zod (v4) to validate agent input gives a single source of truth for both the
TypeScript compile-time type and the runtime validation logic — no drift possible.

```typescript
// Single definition — both type AND validator
export const AgentInputSchema = z.object({
  entity_name: z.string().min(1, 'entity_name must be a non-empty string.'),
  income_type: z.enum(['dividend', 'interest', 'royalty'] as const, {
    error: 'income_type must be one of: dividend, interest, royalty.',
  }),
  shareholding_percentage: z.number().min(0).max(100),
  // ...
});

// Type derived — not separately declared
export type AgentInput = z.infer<typeof AgentInputSchema>;
```

**Why `z.infer<>` instead of a separate `interface`:** If you declare the interface
separately, it can drift from the schema. `z.infer` makes TypeScript generate the type
directly from the schema structure — they are guaranteed to be identical.

**Error reporting pattern:** Zod collects ALL validation errors in one pass.
Wrap the parse in a try/catch and extract `error.issues.map(i => i.message).join('; ')`
to give callers a single string listing every problem at once.

**Zod v4 API notes (breaking changes from v3):**
- Custom messages use `error: 'message'` (not `errorMap` or `invalid_type_error`)
- `z.enum()` requires `as const` on the array literal to preserve the tuple type
- `z.number({ error: '...' })` for type-level custom error on non-numbers

---

## 15. Python/TypeScript Contract Tests

When a Python service returns JSON consumed by TypeScript without runtime validation,
schema drift is a silent failure. The fix: a committed JSON Schema snapshot.

**The three-file pattern:**

```
python/service/export_schemas.py    ← generates contract.json from Pydantic model_json_schema()
python/service/contract.json        ← committed snapshot — the Python side of the contract
src/agents/contracts.ts             ← Zod schemas — the TypeScript side of the contract
src/agents/contract.test.ts         ← tests that compare both sides
```

**Category A tests** — simulation validates against Zod:
```typescript
const raw = await env.checkEntitySubstance('Orange S.A.', 'France');
const result = SubstanceResultSchema.safeParse(JSON.parse(raw));
assert.ok(result.success, JSON.stringify(result.error?.issues, null, 2));
```

**Category B tests** — Python fields match TypeScript:
```typescript
const contract = loadContract();  // reads contract.json
const pythonFields = new Set(contract.SubstanceResult.required);
const tsFields = new Set(Object.keys(SubstanceResultSchema.shape));
const missingInTs = [...pythonFields].filter(f => !tsFields.has(f));
assert.deepEqual(missingInTs, []);
```

**Update workflow** after an intentional Pydantic model change:
```
npm run test:contract:update   ← regenerates contract.json
npm test                       ← verify both sides now agree
git add python/service/contract.json src/agents/contracts.ts
```

**Key rule:** `contract.json` is committed alongside every Pydantic model change.
Reviewers see both sides of the schema change in the same diff.

---

## 16. Provenance and Citations

Every tool result should be traceable to its data source. Phase 13 formalises this
as a `Citation` array on `WhtReport`.

**The citation collection pattern:**

```typescript
// After every tool dispatch in the agent loop:
const citation = extractCitation(toolName, result);
citations.push(citation);

// extractCitation() parses the result JSON and pulls the source field
function extractCitation(toolName: string, result: string): Citation {
  const parsed = JSON.parse(result) as Record<string, unknown>;
  return {
    tool: toolName,
    source: typeof parsed['source'] === 'string' ? parsed['source'] : 'unknown',
    // RAG-specific fields:
    chunk_count: typeof parsed['chunk_count'] === 'number' ? parsed['chunk_count'] : undefined,
    top_score:   typeof parsed['top_score'] === 'number'   ? parsed['top_score']   : undefined,
  };
}
```

**The RAG legal grounding gate:** For HIGH confidence, the agent must have retrieved
meaningful legal text — not just called the tool. The gate checks the RAG citation:

```typescript
function hasRagLegalGrounding(citations: Citation[]): boolean {
  const rag = citations.find(c => c.tool === 'consult_legal_sources');
  return rag !== undefined
    && (rag.chunk_count ?? 0) >= 2
    && (rag.top_score ?? 0) >= 0.55;
}
```

**Why this matters:** The `source` field tells a reviewer where each fact came from.
The RAG gate prevents HIGH confidence from being awarded when the agent consulted a
knowledge base that returned low-relevance results — which would be worse than not
consulting it at all (false certainty).

---

## 17. Deterministic Verdict Computation

For compliance conclusions, never parse the final verdict from LLM output text. Derive
it deterministically from structured findings in memory.

**The pattern (Phase 15+17):**

```typescript
// BAD: parse LLM output — fragile, model-version-dependent
const bo = report.conclusion.includes('beneficial owner') ? 'CONFIRMED' : 'REJECTED';

// GOOD: derive from structured findings — deterministic, testable
export function computeBoOverall(
  findings: Record<string, string>,
  dataConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
): BoOverall {
  // 1. No treaty → NO_TREATY (bypasses BO test entirely)
  const treatyRaw = findings['treaty_status'];
  if (treatyRaw) {
    const treaty = JSON.parse(treatyRaw) as Record<string, unknown>;
    if (!treaty['treaty_in_force']) return 'NO_TREATY';
  }

  // 2. Low data quality → UNCERTAIN (cannot confirm BO on bad data)
  if (dataConfidence === 'LOW') return 'UNCERTAIN';

  // 3. Substance FAIL → REJECTED
  const substanceRaw = findings['entity_substance'];
  if (substanceRaw) {
    const substance = JSON.parse(substanceRaw) as Record<string, unknown>;
    const boPrelim = substance['bo_preliminary'] as Record<string, unknown> | undefined;
    if (boPrelim?.['overall'] === 'FAIL') return 'REJECTED';
    if (boPrelim?.['overall'] === 'PASS') return 'CONFIRMED';
  }

  return 'UNCERTAIN'; // substance not yet assessed or inconclusive
}
```

**Rules:**
- `BoOverall` and `conduit_risk` are derived last, after all other findings are stored
- LOW confidence unconditionally blocks CONFIRMED — no partial credit in tax compliance
- The function must be pure and unit-testable with no LLM calls

---

## 18. Force-Draft HITL Pattern

When a conclusion cannot be safely signed off by a professional (due to uncertain data,
inconclusive BO test, or REJECTED verdict), force the entity registry entry to `draft`
status — even if a professional previously signed it off.

**The pattern (Phase 12b + 17):**

```typescript
// In EntityRegistry.save():
if (
  report.bo_overall === 'REJECTED'  ||   // conduit — needs human look-through
  report.bo_overall === 'UNCERTAIN' ||   // BO test inconclusive — premature to sign off
  report.data_confidence === 'LOW'       // simulated data — not safe to act on
) {
  entry.review_status = 'draft';
}
```

**UI counterpart:** Flag the report card visually when force-draft conditions apply.
Use a banner + greyed-out card, not just a status field — the reviewer's eye must
catch the state before they can sign off.

**Rules:**
- Force-draft overrides any existing sign-off — re-analysis may have changed the verdict
- MEDIUM confidence does NOT force draft — only LOW
- NO_TREATY with HIGH/MEDIUM confidence is actionable — no force-draft

---

## 19. Risk-Routing Tool Pattern (UC2 Vendor Workflow)

For workflows with multiple analysis paths, introduce a routing tool that the agent
calls FIRST (for the relevant transaction type) to determine which analysis path applies.

**The pattern (Phase 18):**

```typescript
// classify_vendor_risk returns the tier BEFORE the agent decides which tools to call
classifyVendorRisk(entityName, country, incomeType, annualPaymentPln, relatedParty): string {
  // Derives risk tier from static rules — no LLM, no external calls
  const riskTier = deriveRiskTier(...);
  const documentChecklist = buildChecklist(riskTier, ...);

  return JSON.stringify({
    risk_tier: riskTier,         // 'HIGH' | 'MEDIUM' | 'LOW'
    requires_substance_interview: riskTier === 'HIGH',
    document_checklist: documentChecklist,
    // ... other fields
  });
}
```

**The goal routing instruction (in the agent goals array):**

```
"For UNRELATED PARTY transactions only: call classify_vendor_risk BEFORE the full substance
assessment. Use the result to route:
• LOW → skip check_entity_substance; proceed to treaty/rate checks only
• MEDIUM → standard path; note the document checklist
• HIGH → full substance assessment required; call check_entity_substance"
```

**Why a dedicated routing tool instead of branching logic in the agent prompt:**
- The routing decision is deterministic — it should not be left to LLM judgment
- A tool result is stored in memory and cited in the report — prompt conditions are not
- The agent can explain WHY the simplified path was taken (the tool result is in findings)

**Document checklist is progressive:** each higher tier adds items to the tier below.
This means LOW → 3 items, MEDIUM → 5 items, HIGH → 8+ items. The agent can surface
the checklist to the user without any further reasoning.

**Rules:**
- Routing tool must be synchronous — no external calls, no LLM
- Related-party transactions always bypass routing (full path is non-negotiable)
- The `requires_substance_interview` field is the single flag the agent reads to decide
  whether to call `check_entity_substance`

---

## 20. Negative Evidence Gate Pattern (Phase 19)

When absence of evidence is itself a material finding, implement a gate tool that explicitly
checks what documentation has NOT been provided — and feed the result into the confidence
scoring logic. Without this gate, the agent can complete a full BO analysis with simulated
substance data and no documentation, and return MEDIUM confidence that looks credible but
is based on nothing. This is the "Garbage In, Gospel Out" failure mode.

**The pattern:**

```typescript
// data/due_diligence_checklists.json defines required docs + criticality per income type:
{
  "royalty": {
    "required_docs": [
      { "id": "board_meeting_minutes", "mandatory": true, "critical": true },
      { "id": "payroll_proofs",        "mandatory": true, "critical": true },
      { "id": "ksef_id",               "mandatory": true, "critical": true }
    ]
  }
}

// Tool implementation: deterministic, no LLM, loads from the JSON data file
checkDueDiligence(incomeType: string, providedDocuments: string[]): string {
  const mandatoryItems = checklist.required_docs.filter(d => d.mandatory);
  const normProvided = new Set(providedDocuments.map(id => id.toLowerCase().trim().replace(/\s+/g,'_')));
  const gaps = mandatoryItems.filter(d => !normProvided.has(d.id));
  const criticalMissing = gaps.filter(d => d.critical);
  const status = criticalMissing.length > 0 ? 'INSUFFICIENT'
    : gaps.length > 0 ? 'PARTIAL' : 'COMPLETE';
  return JSON.stringify({ status, gaps: gaps.map(d => d.name),
    critical_missing: criticalMissing.map(d => d.name), ... });
}
```

**Injecting the gate into `computeReportConfidence()`:**

```typescript
// Checked second (after treaty rate mismatch) — BEFORE fact-check results.
// Absent documents override all positive signals.
const ddGapsRaw = findings['dd_gaps'];
let ddPartialFlag = false;
if (ddGapsRaw !== undefined) {
  const ddGaps = JSON.parse(ddGapsRaw);
  if (ddGaps.status === 'INSUFFICIENT') return 'LOW';   // unconditional
  if (ddGaps.status === 'PARTIAL')      ddPartialFlag = true; // caps at MEDIUM
}
// ... later, when all other checks pass ...
return ddPartialFlag ? 'MEDIUM' : 'HIGH';
```

**Why INSUFFICIENT is unconditional:**
- Missing `board_meeting_minutes` → cannot confirm independent decision-making (BO Condition iii)
- Missing `ksef_id` → transaction documentation incomplete; report unsafe for filing
- Missing `payroll_proofs` for royalty → DEMPE cannot be confirmed; substance claim unverifiable
- Fact-check CONFIRMS or strong RAG grounding cannot compensate for absent primary documents

**Status derivation:**
| Status | Trigger | Confidence effect |
|---|---|---|
| `COMPLETE` | All mandatory docs provided | No impact |
| `PARTIAL` | Non-critical mandatory doc(s) missing | Caps at MEDIUM |
| `INSUFFICIENT` | Any critical doc missing | Forces LOW (unconditional) |

**Design rules:**
- Gate tool must be deterministic — status derives from presence/absence, never LLM judgment
- Critical items are defined in the data file, not hardcoded in TypeScript — keeps the gate updateable without code changes
- Gate check in `computeReportConfidence()` must precede any early-return path that could produce HIGH
- Add `provided_documents?: string[]` to `AgentInput` so analysts supply IDs up front; surface them in `buildTaskString()` so the agent sees them in the first user message
- The tool returns a full checklist with `provided` flags — useful for UI display without additional computation
