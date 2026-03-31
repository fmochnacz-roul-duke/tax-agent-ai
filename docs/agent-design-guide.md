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
