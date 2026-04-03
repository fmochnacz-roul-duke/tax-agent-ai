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

---

## What is the "Garbage In, Gospel Out" problem — and how does the co-pilot defend against it?

When a user inputs document IDs that they claim to have reviewed but have not actually verified,
the co-pilot has no way to detect the misrepresentation. If the inputs are wrong, the analysis
will be wrong — potentially at HIGH confidence. This is the "Garbage In, Gospel Out" risk.

Three design layers address it:

1. **Negative Evidence Gate (Phase 19):** The `check_due_diligence` tool checks whether
   *critical* documents are present. If any critical document is absent (`INSUFFICIENT`),
   the report is unconditionally capped at `data_confidence: LOW` — regardless of what the
   FactChecker says. You cannot argue your way to HIGH confidence with a missing document.

2. **HITL review workflow (Phase 12b):** A professional must review and sign off before a
   report leaves `review_status: draft`. The reviewer is responsible for checking that the
   document list reflects what was actually reviewed — not just what was listed.

3. **Self-certification (Phase 26 — planned):** The Phase 26 FLAC Legal Memo output will
   include an explicit attestation step: *"I confirm that the documents listed above were
   physically reviewed."* This converts an implicit assumption into an explicit audit trail
   entry.

The current compensating control is the human reviewer. Train reviewers to verify the
document list, not just read the conclusion.

---

## What is the "Static Knowledge Trap" — and can I tell if the knowledge base is stale?

The co-pilot's legal reasoning is grounded in RAG source files (CIT Act provisions, MF Objaśnienia).
If those files are not updated when the law changes, the agent will confidently apply outdated law.
This is the "Static Knowledge Trap" — the system has no automated update mechanism.

**How to detect staleness today:**
- Every RAG source file carries a `last_verified` frontmatter field (e.g. `last_verified: 2026-04-02`).
- When the `consult_legal_sources` tool is called, this field is forwarded in the tool output.
  Look for it in the live agent log in the browser UI.
- If the `last_verified` date is more than 6 months ago, treat the citation with extra caution.

**What is planned (Phase 24):**
- A "knowledge freshness warning" in reports when any cited RAG chunk's `last_verified` date
  is more than 6 months old. This is a one-line check in `consultLegalSources()`.
- A source update protocol for adding new NSA/CJEU rulings and MF guidance updates.

**Why this matters:** Polish WHT law has changed significantly in recent years —
KSeF mandate timelines, STTR implementing legislation, MF Objaśnienia updates.
A tool that confidently cites 2024 law to answer a 2027 question is worse than a tool
that honestly says "the source was last verified in 2024 — please confirm this is still current."

---

## Can I use the co-pilot to challenge a position taken by the Polish tax authority (KAS)?

No. The co-pilot is a **first-layer research tool**, not a legal opinion. It is not designed for:
- Responding to KAS audit queries
- Drafting formal position papers or tax appeals
- Serving as the sole basis for a compliance decision

What it *is* designed for:
- Screening a payment before it is made — "does this entity likely qualify for treaty benefits?"
- Generating a structured, cited analysis that a tax professional then reviews and acts on
- Documenting the analysis trail for internal records

The Phase 26 **FLAC Legal Memo** output (Facts / Law / Application / Conclusion) will produce
a report in the format Polish tax opinions follow — close to what you would hand to an auditor.
But even FLAC output requires professional sign-off before it can support a formal position.

---

## What happens when the FactChecker UNDERMINES a claim that the substance interview confirms?

The FactChecker wins. Unconditionally.

If `fact_check_substance` returns `overall_assessment: 'UNDERMINES'`, the report's
`data_confidence` is set to `LOW` regardless of what the substance interview found, how
many DDQ documents were provided, or what the RAG legal grounding says.

**Why such a hard gate?** Because the FactChecker's job is to cross-verify substance claims
against public records. If a company's website, public filings, or press coverage directly
contradicts what the DDQ says about headcount or office presence, that is a serious red flag —
not a discrepancy to be averaged away.

The professional reviewer should use this `UNDERMINES` result as a starting point for
enhanced due diligence, not dismiss it because the internal questionnaire said otherwise.

Note: the FactChecker is most useful for publicly-listed or well-documented entities.
For small or private holding companies with little public record, it typically returns
`INCONCLUSIVE` — which is treated as neutral, not negative.

---

## Why does the co-pilot say "UNCERTAIN" rather than just "LOW confidence"?

These are two different signals that can occur independently:

| Signal | What it means | Example |
|---|---|---|
| `bo_overall: UNCERTAIN` | The **legal verdict** is genuinely inconclusive — the three-condition BO test cannot determine PASS or FAIL | Entity has some substance but also has a pass-through obligation in the contract |
| `data_confidence: LOW` | The **data quality** is poor — the conclusion was reached on simulated or unverified data | No DDQ, no interview, substance simulated |

A report can be `UNCERTAIN` with `HIGH` confidence — meaning the agent had good data but the
legal situation is genuinely ambiguous. It can also be `CONFIRMED` with `LOW` confidence —
meaning the analysis points toward CONFIRMED but the underlying data is simulated.

UNCERTAIN + LOW is the most concerning combination: the legal situation is unclear *and*
the data quality is poor. Both issues must be resolved before the analysis can be relied upon.

Both states force `review_status: draft` in the entity registry — UNCERTAIN because an
inconclusive BO test must be resolved by a professional, LOW because simulated data is
insufficient for a compliance decision.

---

## Can the co-pilot handle payments to hybrid entities like UK LLPs?

Not fully — and this is a deliberate, documented limitation rather than an oversight.

UK LLPs (Limited Liability Partnerships) are transparent for UK tax purposes — they are
not taxable at the entity level. This creates a **hybrid entity problem** for WHT analysis:
the beneficial owner is not the LLP itself but its members, who may be in different
countries with different treaty positions.

The correct analysis requires **look-through** — tracing through the LLP to identify each
member's country of residence and applicable treaty. This fundamentally changes the BO
question: you are not assessing one entity but potentially several, each with different
treaty positions and substance requirements.

Phase 24b is scoped to address this, with a deliberate constraint: rather than implement a
shallow look-through that produces wrong answers, the co-pilot will return a formal
**"escalate to specialist"** flag in the report. A wrong answer with HIGH confidence is worse
than an honest "this requires specialist advice."

Until Phase 24b, entering a UK LLP will produce a UNCERTAIN verdict — which is the correct
conservative outcome.

---

## I tried typing my payment description in Polish — does the co-pilot understand Polish?

Partially. The `InputExtractor` uses GPT-4o-mini, which handles Polish-language input
reasonably well and can extract the required fields (`entity_name`, `country`, `income_type`,
`shareholding_percentage`, `annual_payment_pln`) from a Polish sentence.

However:
- The co-pilot's internal reasoning, tool descriptions, and goals are all written in English
- The analysis output (conclusion text, report fields) is always in English
- RAG source files are in English (though they cite Polish legal texts in the original Polish)

In practice: you can describe a payment in Polish and the co-pilot will extract the parameters
correctly. The analysis will proceed in English. This is a known UX gap — a Polish-language
output mode is not currently planned but would be a natural addition for a production system
targeting Polish in-house teams.

For technical parameters (country names, income types), use English to avoid alias-matching
issues. `"dywidenda"` is not currently in the country/income alias map — use `"dividend"`.

---

## Why is Phase 20 (Data Quality) listed before batch processing and production hardening?

Because **data quality unlocks a capability that everything else depends on.**

All 36 treaty rate entries in `treaties.json` are currently `verified: false` — populated from
professional commentary, not official treaty PDFs. This means:
- The `TreatyVerifierAgent` (Gemini + Google Search) may flag `DIFFERS` at runtime
- `data_confidence` is capped at MEDIUM for rate-dependent conclusions
- The eval harness scaffold cases (EU27) cannot be promoted to active without verified rates

Phase 20 verifies the top-10 commercially relevant treaties (80/20 rule: Luxembourg, Germany,
France, Netherlands, Ireland first). Once rates are `verified: true`, the confidence ceiling
lifts and scaffold eval cases can be promoted. This unblocks Phase 21 (batch) and Phase 25
(jurisdiction expansion).

Running batch processing on unverified data would scale the uncertainty, not resolve it.
Data quality first is the correct order.
