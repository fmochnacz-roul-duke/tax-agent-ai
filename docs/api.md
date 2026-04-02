# API Reference — WHT Agent Web Server

The Express server (`src/server/index.ts`) exposes a REST API for the conversational web interface.
All endpoints use JSON bodies and responses unless noted.

---

## Sessions

### POST /session

Creates a new analysis session.

**Request body:** none

**Response:**
```json
{ "sessionId": "abc123" }
```

---

### POST /session/:id/message

Sends a chat message. The server runs `InputExtractor` to extract `AgentInput` from
the conversation history. Returns a clarifying question or a ready confirmation card.

**Request body:**
```json
{ "text": "Analyse Orange S.A. royalty payments, 50.67% stake, about 50M PLN annually" }
```

**Response — more information needed:**
```json
{
  "type": "question",
  "text": "What is the country of residence of Orange S.A.?"
}
```

**Response — parameters extracted:**
```json
{
  "type": "ready",
  "text": "Parameters confirmed: Entity: Orange S.A. | Country: France | ...",
  "input": {
    "entity_name": "Orange S.A.",
    "country": "France",
    "income_type": "royalty",
    "shareholding_percentage": 50.67,
    "annual_payment_pln": 50000000,
    "related_party": true
  }
}
```

**Response — substance interview started (Phase 10):**
```json
{
  "type": "interview_start",
  "text": "Before running the analysis I need to assess the entity's substance..."
}
```

**Response — interview in progress:**
```json
{
  "type": "question",
  "text": "Does Orange S.A. have a board of directors that meets regularly in France?"
}
```

**Response — interview complete:**
```json
{
  "type": "interview_complete",
  "text": "Substance interview complete. Proceeding with analysis..."
}
```

---

### POST /session/:id/confirm

Triggers `runWhtAnalysis()` in the background. Returns immediately; progress is
delivered via the SSE stream.

**Request body:** none

**Response:**
```json
{ "started": true }
```

---

### GET /session/:id/stream

Server-Sent Events stream. Connect before `/confirm` to receive all events.

**Headers set by server:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event format:**
```
data: {"type":"...","message":"...","data":{...}}\n\n
```

**Event types:**

| `type` | `message` | `data` |
|---|---|---|
| `start` | "Starting WHT analysis..." | — |
| `iteration` | "Iteration 1" | — |
| `tool_call` | "Calling check_treaty(France)" | `{ name, arguments }` |
| `tool_result` | "check_treaty result: ..." | `{ name, result }` |
| `final_answer` | The agent's narrative conclusion | — |
| `report_saved` | "Report saved to reports/..." | `{ report: WhtReport }` |
| `error` | Error message | — |

---

### GET /session/:id/report

Returns the completed `WhtReport` once the session is in `complete` state.

**Response:** see `WhtReport` schema below.

---

## Entity Registry

### GET /registry

Returns all past analyses stored in `data/registry.json`.

**Response:**
```json
[
  {
    "entity_name": "Orange S.A.",
    "country": "France",
    "income_type": "royalty",
    "substance_tier": "STRONG",
    "bo_overall": "PASS",
    "review_status": "pending",
    "created_at": "2026-04-02T10:00:00.000Z",
    "updated_at": "2026-04-02T10:00:00.000Z",
    "run_count": 1
  }
]
```

---

## Data Schemas

### AgentInput

Input to `runWhtAnalysis()`. Accepted by the CLI (`--input <file>`) and extracted
from free-form text by `InputExtractor` in the web UI.

```typescript
interface AgentInput {
  entity_name:             string;           // e.g. "Orange S.A."
  country:                 string;           // e.g. "France"
  income_type:             'dividend'        // determines which tools the agent calls
                         | 'interest'
                         | 'royalty';
  shareholding_percentage: number;           // 0–100; used for dividend threshold logic
  substance_notes?:        string;           // freeform; supplements DDQ
  annual_payment_pln?:     number;           // PLN amount; triggers Pay and Refund check
  related_party?:          boolean;          // true → Check Pay and Refund
  ddq_path?:               string;           // path to a DDQ .txt file (CLI only)
}
```

### WhtReport

Output from `runWhtAnalysis()`. Saved to `reports/` and emitted via the
`report_saved` SSE event.

```typescript
interface WhtReport {
  generated_at:            string;           // ISO 8601 timestamp
  entity_name:             string;
  country:                 string;
  income_type:             string;
  shareholding_percentage: number;
  related_party?:          boolean;
  substance_notes?:        string;
  data_confidence:         'HIGH' | 'MEDIUM' | 'LOW';
  data_confidence_note:    string;           // explains why confidence is at this level
  conclusion:              string;           // agent's full narrative conclusion
  findings:                Record<string, unknown>; // parsed tool results keyed by tool name
}
```

**`data_confidence` levels:**

| Level | Meaning |
|---|---|
| `HIGH` | Real DDQ + Gemini confirms + treaty rate verified |
| `MEDIUM` | Real DDQ but treaty rate unverified, or Gemini inconclusive |
| `LOW` | Substance data is simulated (no DDQ file and no interview) |

### RegistryEntry

Persisted to `data/registry.json` after every analysis.

```typescript
interface RegistryEntry {
  entity_name:    string;
  country:        string;
  income_type:    string;
  substance_tier: 'STRONG' | 'ADEQUATE' | 'WEAK' | 'CONDUIT' | null;
  bo_overall:     'PASS' | 'FAIL' | 'UNCERTAIN' | null;
  review_status:  'pending' | 'approved' | 'flagged';
  created_at:     string;   // ISO 8601; set on first save, never updated
  updated_at:     string;   // ISO 8601; updated on every re-analysis
  run_count:      number;   // incremented on every re-analysis
}
```

---

## CLI Flags

```
npm run tax:agent -- --input <path>    Path to AgentInput JSON file (required)
                    --output <path>    Override output path for the report (optional)
                                       Default: reports/<entity_slug>_<date>.json
```
