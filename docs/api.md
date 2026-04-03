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
{
  "entries": [
    {
      "entity_name": "Orange S.A.",
      "country": "France",
      "income_type": "royalty",
      "review_status": "signed_off",
      "data_confidence": "MEDIUM",
      "substance_tier": "STRONG",
      "bo_overall": "CONFIRMED",
      "conclusion_summary": "Orange S.A. qualifies as beneficial owner under Art. 12 of the FR-PL treaty...",
      "created_at": "2026-04-02T10:00:00.000Z",
      "updated_at": "2026-04-03T14:22:00.000Z",
      "reviewed_by": "Anna Nowak",
      "reviewed_at": "2026-04-03T14:22:00.000Z"
    }
  ]
}
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
  // Phase 15: machine-readable BO verdict derived deterministically from findings.
  bo_overall:              'CONFIRMED' | 'UNCERTAIN' | 'REJECTED' | 'NO_TREATY';
  // Phase 15: true when bo_overall === 'REJECTED' AND the entity/country suggests a conduit.
  conduit_risk:            boolean;
  conclusion:              string;           // agent's full narrative conclusion
  findings:                Record<string, unknown>; // parsed tool results keyed by tool name
  // Phase 13: one Citation per tool call, in call order.
  citations:               Citation[];
}

// Phase 13 + 16: links a conclusion to its data source.
interface Citation {
  tool:           string;   // e.g. "get_treaty_rate", "consult_legal_sources"
  source:         string;   // data origin text from the tool result
  finding_key?:   string;   // key in memory.findings (undefined for RAG)
  section_ref?:   string;   // statutory section reference (from RAG chunks)
  source_id?:     string;   // legal source ID (e.g. "MF-OBJ-2025")
  chunk_count?:   number;   // how many RAG chunks were returned
  top_score?:     number;   // cosine similarity of the best chunk
  source_type?:   string;   // Phase 16: 'statute' | 'directive' | 'treaty' | 'guidance' | ...
  legal_hierarchy?: number; // Phase 16: 1=statute, 2=directive/treaty, 3=guidance, 4=commentary
}
```

**`data_confidence` levels:**

| Level | Meaning |
|---|---|
| `HIGH` | Real DDQ + Gemini confirms + treaty rate verified + RAG grounding |
| `MEDIUM` | Real DDQ but treaty rate unverified, or Gemini inconclusive |
| `LOW` | Substance data is simulated (no DDQ file and no interview); report is DRAFT ONLY |

**`bo_overall` values (Phase 15):**

| Value | Meaning |
|---|---|
| `CONFIRMED` | BO test passed — treaty rate applies |
| `UNCERTAIN` | Insufficient data to confirm — human review required |
| `REJECTED` | BO test failed — conduit risk; domestic rate may apply |
| `NO_TREATY` | No applicable treaty — domestic rate (20%) applies |

### RegistryEntry

Persisted to `data/registry.json` after every analysis.

```typescript
interface RegistryEntry {
  entity_name:      string;
  country:          string;
  income_type:      string;
  review_status:    'draft' | 'reviewed' | 'signed_off';
  data_confidence:  'HIGH' | 'MEDIUM' | 'LOW';
  substance_tier?:  string;            // STRONG / ADEQUATE / WEAK / CONDUIT (if assessed)
  bo_overall?:      string;            // CONFIRMED / UNCERTAIN / REJECTED / NO_TREATY (if present)
  conclusion_summary: string;          // first 200 chars of the agent's conclusion
  created_at:       string;            // ISO 8601; set on first save, never updated
  updated_at:       string;            // ISO 8601; updated on every re-analysis
  report_path?:     string;            // path to the full JSON report on disk
  // Phase 12b: set by updateReviewStatus(), never by save()
  reviewer_note?:   string;
  reviewed_at?:     string;
  reviewed_by?:     string;
}
```

**`review_status` rules (Phase 15 + 17):**
- New entries default to `'draft'`.
- Re-analysis forces `'draft'` when `bo_overall === 'REJECTED'`, `bo_overall === 'UNCERTAIN'`, or `data_confidence === 'LOW'`.
- All other states are preserved — a professional's sign-off is never cleared for safe/high-quality results.

---

## CLI Flags

```
npm run tax:agent -- --input <path>    Path to AgentInput JSON file (required)
                    --output <path>    Override output path for the report (optional)
                                       Default: reports/<entity_slug>_<date>.json
```
