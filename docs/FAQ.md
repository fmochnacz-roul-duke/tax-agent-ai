# Frequently Asked Questions

Answers to questions that have come up during development, reviews, or testing.
Updated as new questions arise.

---

## Why are all treaty rates `verified: false`?

The rates in `data/treaties.json` were populated from professional tax commentary
(Tax@Hand, IBFD summaries) rather than directly from official treaty PDFs. They are
reliable for prototype purposes but have not been confirmed line-by-line against
the official Polish Journal of Laws (Dziennik Ustaw) references.

Systematic verification against official PDFs is planned for **Phase 20 (Data Quality Pass)**.
Until then, `verified: false` is intentional — it signals to the agent and any downstream
consumer that the rate should be independently verified before use in a compliance context.

Note: there are **two distinct verification layers**:
- *Runtime verification*: `TreatyVerifierAgent` (Gemini + Google Search) cross-checks the
  rate during each live analysis — this is Phase 14, already live.
- *Static data quality*: `verified: true/false` in `treaties.json` reflects whether a human
  has confirmed the rate against the official PDF — this is Phase 20, not yet done.

---

## Why does the agent use two different LLM tiers?

Early tool calls (check_treaty, get_treaty_rate) are simple structured lookups — they do
not require the most capable model. The fast tier (`gpt-4o-mini` by default) handles these
at lower cost and latency.

Once complex findings arrive — substance profile, DEMPE analysis, MLI PPT, or FactChecker
results — the agent must reason over multi-condition legal frameworks and synthesise
contradictory evidence. The powerful tier (`gpt-4o`) takes over for this synthesis step.

The switch happens automatically via `selectLlm()` in the agent loop. The set of finding
keys that trigger the switch is in `COMPLEX_FINDINGS` in `BeneficialOwnerAgent.ts`.

This is the MATE **M — Model Efficiency** principle. See `docs/agent-design-guide.md`.

---

## Why is substance data simulated by default?

The Python DDQ extraction service (`npm run ddq:service`) is optional. When it is not
running, or when no DDQ document is uploaded, the agent falls back to hardcoded entity
profiles in `WhtEnvironment.ts` (`buildEntityProfile()`).

This is intentional — the agent should always be runnable, even in environments without
Python. Simulated substance always produces `confidence: 'LOW'`, which propagates to the
report's `data_confidence` field, making the limitation explicit.

To get real substance data: start the DDQ service and either upload a DDQ document via
the web UI or point the CLI to a DDQ file with `--input`.

---

## Why is the confidence score sometimes LOW even after a full DDQ?

Data confidence starts at HIGH and is reduced by any of the following:
1. FactChecker verdict is `UNDERMINES` → unconditionally LOW
2. Substance source is simulated → LOW
3. Treaty rate is `verified: false` → MEDIUM at best
4. RAG legal grounding is absent or weak (< 2 chunks, top score < 0.55) → MEDIUM at best

A full DDQ upload (via the Python service) removes condition 2. But conditions 3 and 4
still apply until Phase 20 verifies the treaty rates, so `MEDIUM` is the realistic ceiling
for most runs today.

---

## Why is there no authentication on the web server?

The Express server (`src/server/index.ts`) has no API key auth or session auth. Any client
that can reach port 3000 can trigger an analysis — and therefore an OpenAI API call at your
expense.

This is acceptable for local development (port 3000 is not publicly exposed). For any
deployment accessible from the internet, add authentication first. Rate limiting and auth
are planned for **Phase 22 (Production Hardening)**.

In the meantime: do not expose port 3000 publicly.

---

## Why is the agent loop not unit tested?

The agent loop (`runAgent()` in `BeneficialOwnerAgent.ts`) requires a live LLM call —
there is no meaningful way to unit test it without either mocking the entire OpenAI SDK
(which tests the mock, not the logic) or spending API budget on every test run.

The loop itself is deliberately thin: it builds messages, calls `generateWithTools()`,
dispatches to `WhtEnvironment`, and repeats. All the interesting logic is in the
Environment (tested exhaustively in `WhtEnvironment.test.ts`) and the pure helper
functions (`computeBoOverall`, `computeReportConfidence`, `extractCitation` — all tested
in `BeneficialOwnerAgent.test.ts`).

End-to-end validation of the full loop is done via `npm run eval` (the golden dataset
harness) and manual runs against known cases.

---

## Why is there no React/Vue frontend?

The web UI (`public/index.html`) is a single HTML file with vanilla JavaScript. This
was a deliberate choice for simplicity at the prototype stage — no build step, no
additional dependencies, fully readable in one file.

The trade-off is maintainability as the UI grows. A frontend refactor (splitting into
`app.js` and `styles.css` at minimum) is tracked for **Phase 22**.

---

## What does `bo_overall` mean and how is it different from `data_confidence`?

`bo_overall` (`CONFIRMED | UNCERTAIN | REJECTED | NO_TREATY`) is the **legal verdict**:
the agent's conclusion about whether the beneficial owner test is satisfied.

`data_confidence` (`HIGH | MEDIUM | LOW`) is the **data quality signal**: how much the
agent trusts the data it had access to when reaching that verdict.

A report can be `bo_overall: CONFIRMED` with `data_confidence: LOW` — meaning the agent's
reasoning points to a CONFIRMED conclusion, but the substance data was simulated, so the
conclusion should not be relied upon without real DDQ data.

Both fields are always present in `WhtReport`. The distinction matters for the human review
workflow: CONFIRMED + LOW still gets auto-drafted to the entity registry for review.
