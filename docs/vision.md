# Project Vision — WHT Beneficial Owner Scanner

> This document defines the strategic direction and product vision for the WHT Beneficial Owner
> Agent. It guides phase prioritisation and design decisions. It is a living document — update it
> when the vision changes, not just when a phase completes.
>
> **Last updated: 2026-04-03 (v0.22.0 — Phase 19 complete; DD Module + Negative Evidence Gate)**

---

## Vision statement

**A tool that gives a Polish tax team a structured, cited, machine-readable first-layer BO
analysis for any WHT-relevant payment — intercompany or third-party — in under five minutes,
producing a report that a senior tax professional can review, annotate, and sign off on.**

Not a replacement for professional judgment. A structured research layer that handles the
treaty lookup, legal framework application, substance checklist, and documentation — so the
tax professional spends their time on the judgment call, not the groundwork.

Target users: in-house tax team (1-3 people handling WHT compliance for a Polish group
or advisory team reviewing multiple clients).

---

## The two use cases that define the product

The tool must serve both use cases because they share the same legal framework but differ
fundamentally in workflow, data availability, and risk profile.

### Use case 1 — Intercompany payment review

**Who**: Polish entity paying dividends, interest, or royalties to a related-party holding
or IP company within the group.

**Characteristics**:
- Entity is known and stable — same holding appears every quarter
- Related-party status: always yes → Pay and Refund almost always triggers
- Due diligence standard: HIGH — BO declaration alone is not sufficient (MF Objaśnienia §4)
- Required evidence: contracts evidencing substance + financial statements
- Tax authority scrutiny: highest — related-party WHT is an audit priority in Poland
- Volume: low (5-20 payment relationships per group, reviewed annually or per payment)
- DDQ data: realistic — you can obtain a questionnaire from the holding

**Examples**: Orange S.A. royalties, XTB Malta Holdings interest, Luxembourg finance company
interest, Dutch IP holding royalties.

**Agent workflow**: questionnaire or document upload → full BO analysis with cited criteria
→ human review and sign-off → approved report filed with payment documentation.

### Use case 2 — Third-party vendor scan

**Who**: Polish entity paying royalties or fees to unrelated foreign vendors — software
licences, content licences, trademark fees, technical service payments.

**Characteristics**:
- Entity is often new — vendor onboarding is the trigger
- Related-party status: no → Pay and Refund typically does not apply (unless threshold exceeded)
- Due diligence standard: LOWER — BO declaration + residence certificate gives withholding agent protection (MF Objaśnienia §4 unrelated party standard)
- Required evidence: tax residence certificate + BO declaration sufficient for protection
- Tax authority scrutiny: lower — agent protected by good-faith reliance if documents obtained
- Volume: high (potentially dozens of new vendors per year)
- DDQ data: unlikely — you cannot require a detailed DDQ from a commercial vendor

**Examples**: Microsoft Ireland royalties, Adobe Ireland service fees, SAP Germany licences,
content licences from US or UK entities.

**Agent workflow**: company name + payment type + country → treaty check → risk classification
(LOW/MEDIUM/HIGH) → document checklist → optional enhanced due diligence if HIGH risk.

---

## Honest current state (as of v0.21.0 — Phase 18 complete, Phase 19 next)

### What genuinely works

| Capability | Status | What it means |
|---|---|---|
| Treaty lookup (check_treaty) | ✅ Live | Correct for all 36 countries in database |
| Treaty rate (get_treaty_rate) | ✅ Live logic, ⚠ unverified rates | Rate logic correct; amounts still need PDF confirmation |
| MLI/PPT check (check_mli_ppt) | ✅ Live | Correct from MoF + OECD positions cross-check |
| EU I&R Directive (check_directive_exemption) | ✅ Live logic | Rules correctly implemented |
| Pay and Refund check (check_pay_and_refund) | ✅ Live logic | Correctly flags trigger + relief options |
| Entity substance — any entity | ✅ Phase 10 interview | 5-question chat compiles DDQ text; LLM extractor produces SubstanceResult |
| DEMPE analysis | ⚠ DDQ service / simulated | Live via Python service; simulation fallback |
| FactChecker (web search) | ⚠ Optional/GEMINI_API_KEY | Triangulates DDQ claims against public records |
| Legal citations (RAG) | ✅ Phase 9 | `consult_legal_sources` retrieves exact MF Objaśnienia / CIT Act text; confidence gate |
| Entity registry | ✅ Phase 11 | JSON persistence; audit trail; "Past Analyses" web panel |
| Human review workflow | ✅ Phase 12b | Review drawer; `review_status`: draft/reviewed/signed_off; reviewer metadata |
| Treaty rate verifier | ✅ Phase 14 | `TreatyVerifierAgent` wired into live flow; DIFFERS → confidence LOW |
| Provenance/citations | ✅ Phase 13 + 16 | `citations[]` on every WhtReport; `source_type` + `legal_hierarchy` per citation |
| Zod runtime validation | ✅ QA-2 + 16 | `AgentInputSchema`, `SourceTypeSchema`, contract schemas; Python/TS contract tests |
| Conversational input (web UI) | ✅ Live | Extracts parameters from free text, asks follow-ups |
| Progress streaming (SSE) | ✅ Live | Live agent log in browser |
| Report output (JSON) | ✅ Live | Structured, timestamped, machine-readable, cited |
| `last_verified` on RAG chunks | ✅ Phase 14 | Parsed + forwarded in `consultLegalSources` output |
| BO verdict + conduit risk | ✅ Phase 15 | `bo_overall: BoOverall` + `conduit_risk: boolean` on `WhtReport`; deterministic derivation |
| Eval harness + golden cases | ✅ Phase 15 | 9 golden cases; `scripts/runEvals.ts`; Triangulation Rule |
| Legal source hierarchy | ✅ Phase 16 | `source_type` filter on RAG tool; `legal_hierarchy` in `Citation`; Zod `SourceTypeSchema` |
| Confidence UX + auto-HITL | ✅ Phase 17 | `DRAFT ONLY` banner; LOW grey-out; force-draft on UNCERTAIN/LOW in registry |
| UC2 vendor risk classification | ✅ Phase 18 | `classify_vendor_risk` tool; risk-routing Goal; LOW/MEDIUM/HIGH tiers; progressive document checklist (3/5/8+ items) |

### Remaining gaps by arc

**Arc 1 — WHT Core (Phases 14–22):**

| Gap | Phase | Description |
|---|---|---|
| TreatyVerifierAgent not in live flow | 14 ✅ | Resolved v0.17.0 — wired into agent loop; DIFFERS → LOW confidence |
| `last_verified` not surfaced to user | 14 ✅ | Resolved v0.17.0 — forwarded in `consultLegalSources` output |
| No eval harness / golden cases | 15 ✅ | Resolved v0.18.0 — 9 golden cases + `runEvals.ts` + Triangulation Rule |
| Legal source hierarchy not reflected in tool | 16 ✅ | Resolved v0.19.0 — `source_type` filter + `legal_hierarchy` in Citation |
| No UI signal for LOW confidence | 17 ✅ | Resolved v0.20.0 — `DRAFT ONLY` banner + grey-out + force-draft on UNCERTAIN/LOW |
| No third-party vendor workflow (UC2) | 18 ✅ | Resolved v0.21.0 — `classify_vendor_risk` tool; risk-routing goal; progressive document checklist |
| No Due Diligence checklist tool | 19 | DD requirements not surfaced per payment type |
| Treaty rates unverified | 20 | All 36 countries still `verified: false` in treaties.json |
| No batch processing | 21 | One entity at a time only; no CSV input |
| Session persistence | 22 | In-memory sessions lost on server restart |

**Arc 2 — WHT Professional (Phases 23–26):**

| Gap | Phase | Description |
|---|---|---|
| Intangibles / management fees not covered | 23 | Art. 21 ust. 1 pkt 2a CIT — advisory, technical services, know-how not in scope |
| Legal source update workflow not defined | 24 | No protocol for adding new sources, updating guidance, managing `last_verified` |
| Jurisdiction coverage | 25 | 36 of 91 Polish treaties; 55 countries with no treaty support |

---

## What tax team readiness requires — acceptance criteria

A "Beneficial Owner Scanner" that a tax team can actually use must meet all of these:

**Functional requirements:**
- [x] Any entity can be assessed, not just two hardcoded ones *(Phase 10)*
- [x] Substance data entered via browser (no DDQ files, no Python service for basic use) *(Phase 10)*
- [x] Entity profiles persist — same holding is not re-entered each quarter *(Phase 11)*
- [x] Report includes a "reviewed and approved by" field that a professional fills in *(Phase 12b)*
- [ ] Treaty rates verified against at least the top 10 commercially relevant treaties *(Phase 20)*
- [ ] Output format suitable for a tax file (not just developer-readable JSON) *(Phase 26)*
- [x] Intercompany and third-party workflows are explicitly different *(Phase 18)*
- [ ] Eval harness confirms correct `bo_overall` on curated golden cases *(Phase 15)*
- [ ] Citations include specific Art./Sec. references (e.g. Art. 26 ust. 1 CIT) *(Phase 16)*
- [ ] Management fees / technical services covered (Art. 21 ust. 1 pkt 2a CIT) *(Phase 23)*

**Quality requirements:**
- [x] Every BO conclusion cites the specific MF Objaśnienia and/or OECD criteria it applied *(Phase 9 RAG + Phase 13 citations)*
- [x] Confidence levels reflect real data quality, not just simulation mode *(Phase 13 RAG gate)*
- [x] The agent never states HIGH confidence based on simulated substance *(RAG gate + substance confidence check)*
- [x] Conservative fallback is explicit — "cannot confirm" is better than a wrong answer *(CONDUIT fallback, LOW confidence)*
- [x] UI signals LOW confidence visually — `DRAFT ONLY` banner + grey-out *(Phase 17)*
- [x] UNCERTAIN analysis automatically forces `review_status: 'draft'` in registry *(Phase 17)*

**Process requirements:**
- [x] A new entity can be onboarded in under 15 minutes *(Phase 10 interview ~5min — feasible today)*
- [x] Output is suitable for review by a professional who did not run the analysis *(Phase 12b)*
- [ ] A new payment can be analysed in under 5 minutes if entity data is already stored *(Phase 21 batch + Phase 11 cache)*

---

## Phase roadmap — completed

Phases 1–17 (including QA-1–3, DOCS-1–3, GITHUB-1) are complete as of v0.20.0.
The reasoning below is preserved for reference — it explains *why* each phase was prioritised
the way it was. For the current forward-looking roadmap see [[Phase Roadmap]] in the wiki.

### Phase 9 — Legal knowledge RAG (completed v0.9.0)

**What it does:** Replace hardcoded substance and DEMPE logic with retrieval from the actual
legal texts — MF Objaśnienia 2025, Jankowski & Smoleń 2025, OECD TP Guidelines Ch. VI.

**Why it matters:** Today, the agent applies a hardcoded checklist. With RAG, it retrieves
the exact paragraph from the official guidance, applies it, and cites it in the conclusion.
This matters for defensibility: the output says "per MF Objaśnienia §2.3.1, a holding company
needs adequate experienced personnel — this entity [PASSES/FAILS] because..." rather than
"CONDUIT (simulated)."

**What it does NOT fix:** RAG improves the REASONING quality when substance data is present.
It does not fix the absence of substance data. Phases 9 and 10 must be built together for
the output to be meaningful.

**Scope:**
- Phase 9a: Ingest MF Objaśnienia 2025 + Jankowski & Smoleń 2025 → substance assessment
- Phase 9b: Ingest OECD TP Guidelines Ch. VI (DEMPE framework)
- Phase 9c: Ingest EU Directives + key CIT Act articles (Arts. 21, 22, 26, 4a pkt 29)
- Simple retrieval: embed by section, retrieve by entity type + payment type + legal question

**Target outcome:** `check_entity_substance` returns a conclusion that cites the specific
legal criterion it applied — "per MF Objaśnienia §2.3, condition (iii) requires genuine
business activity assessed on: [list from document]."

---

### Phase 10 — Substance questionnaire (completed v0.10.0)

**What it does:** Replace both the hardcoded entity profiles AND the DDQ file approach with
a structured web UI questionnaire that any user can complete in 5-10 minutes.

**Why it is the highest-impact phase:** This is the single change that transforms the tool
from "works for two pre-built test cases" to "works for any entity." Without this, every
other improvement is academic.

**Design — two questionnaire modes:**

*Mode A — Quick assessment (third-party or low-risk intercompany):*
Five questions, estimated 5 minutes. Covers the minimum MF Objaśnienia §2.3 substance factors:
1. Headcount in the country of registration (range: 0 / 1-5 / 6-50 / 51+)
2. Physical office presence (none / registered address only / leased / owned)
3. Decision-making independence (all decisions made locally / some / none)
4. Own operating costs (salary, rent, utilities — € range)
5. Pass-through obligation (explicit contract to forward / factual/informal / none)

*Mode B — Full assessment (related party, high-value, audit-sensitive):*
Fifteen questions covering all MF Objaśnienia §2.3 universal criteria PLUS §2.3.1 holding
company criteria PLUS the conduit indicators from §2.2.1. Generates a full SubstanceResult
with confidence: MEDIUM (pending external verification).

**The key design decision:** The questionnaire answers replace the DDQ text as input to
the substance assessment. The Python service is still useful when a real DDQ document exists,
but no longer required for basic use.

**Integration with Phase 9 RAG:** Phase 9 makes the agent ask the RIGHT questions (derived
from the legal text). Phase 10 gives users the UI to ANSWER them. Together they close the gap.

---

### Phase 11 — Entity registry and profile persistence (completed v0.11.0)

**What it does:** Store assessed entity profiles in a persistent store (file-based JSON or
SQLite). When the same holding appears next quarter, load the cached profile instead of
re-entering the questionnaire.

**Why it matters:** For intercompany payments, the same 3-5 holding companies appear on
every payment run. Re-entering their data every time is not a product — it is a form.

**Design:**
- Entity key: `entity_name + country` (normalised)
- Stored fields: all questionnaire answers + assessment result + last_reviewed_date
- Expiry: profiles older than 12 months flagged for re-verification (entity data can change)
- Web UI: "known entity" indicator when user types an entity name that already exists
- Update flow: user can review and confirm or update the stored profile

**Third-party vs. intercompany distinction at the registry level:**
- Third-party: store the BO declaration type + residence certificate status + risk tier
- Intercompany: store full SubstanceResult + approval history + financial data summary

---

### Phase 12 — Treaty rate verification and human review workflow (completed v0.12a.0 + v0.12b.0)

**What it does (part A — treaty rates):** Verify the 10-15 most commercially important
treaty rates against the official treaty PDFs, update `verified: true` in `treaties.json`,
and flag the remaining unverified rates explicitly in output.

Priority order from the gap analysis: Luxembourg (2012 Protocol), Malta, France (1975 DTC),
Germany, Netherlands, Cyprus, Ireland, UK, Switzerland, USA.

**What it does (part B — human review):**
- Add a `reviewed_by` field to the report (name + date + professional title)
- Add a `review_status` field: `draft` | `reviewed` | `approved`
- Web UI: after analysis completes, show a "Review and approve" panel
- Approved reports are signed with reviewer metadata and saved to a separate `approved/` folder
- The approval step is the human-in-the-loop gate — nothing goes to the tax file without it

**Why the approval step is not optional:** The agent explicitly states it is not a substitute
for professional judgment. The approval workflow makes that explicit in the output — the
report is not finalised until a professional has reviewed it.

---

### Phase 13 — Provenance/citations (completed v0.13.0)

See [[Phase Roadmap]] for the full Phase 13 delivery details. `WhtReport.citations[]` and the RAG legal grounding gate for HIGH confidence are live.

---

### Phase 18 (previously Phase 13 in early plans) — Third-party vendor workflow

**What it does:** A distinct, lighter-touch onboarding flow for unrelated third-party vendors.

**The key difference from intercompany:** Under MF Objaśnienia §4, obtaining a tax residence
certificate + BO declaration gives the withholding agent protection even if the preference
is later found inapplicable. This creates a different risk profile:
- For third parties: the goal is to obtain correct documentation and correctly classify risk
- For intercompany: the goal is to conduct genuine substance due diligence

**Design — third-party flow:**
1. Enter vendor name, country, payment type, expected annual amount
2. Agent checks treaty, rate, Directive, Pay and Refund
3. Risk classification: LOW / MEDIUM / HIGH based on treaty reliability, MLI flags, payment size
4. Document checklist generated: what certificates and declarations to obtain
5. For HIGH risk: enhanced due diligence checklist (same as Mode A questionnaire from Phase 10)
6. Output: "this payment requires [documents]. Once obtained, WHT rate is [X]%. Pay and Refund [applies/does not apply]."

**Risk classification logic:**
- LOW: stable EU/EEA treaty, MLI PPT = NO or VERIFY, Directive potentially applies, below PLN 2M
- MEDIUM: MLI PPT = YES, non-EU, or Directive does not apply
- HIGH: VERIFY MLI cases + above PLN 2M, known conduit-risk jurisdictions (Delaware, Cayman, BVI), missing treaty

---

### Phase 21 (previously Phase 14 in early plans) — Batch payment processing

**What it does:** Accept a spreadsheet or CSV of payments and produce a report for each one,
using stored entity profiles where available and flagging new entities that need analysis.

**Why it matters:** In practice, a tax team runs WHT analysis not one payment at a time but
as a batch at payment date — "here are 12 intercompany payments due this quarter, run the
analysis." The current one-at-a-time UI is correct for Phase 8 but not for volume use.

**Design:**
- Input: CSV with columns entity_name, country, income_type, amount_pln, related_party
- Processing: for each row, load cached profile if available → run analysis
- Output: summary table (entity, rate, BO status, confidence, action required) + individual reports
- Flagging: entities without cached profiles highlighted for manual questionnaire completion

---

### Phases 27–29 — Tax OS Foundation

After WHT v1.0 (Phase 26), the project expands beyond Poland-centric WHT analysis:

**Phase 27 — GLOBAL VISION Documentation:** Proprietary Tax OS architecture, legal hierarchy system, and system prompt guidelines. Stored as `docs/GLOBAL_VISION.md` (gitignored — not public).

**Phase 28 — EU Jurisdiction Engine Concept:** Architecture for multi-jurisdiction support. One pilot jurisdiction (Germany or Netherlands) as a design exercise. Tax OS Module 2 scope definition.

**Phase 29 — Tax OS Module 2 Planning:** Next tax regime scoping (candidates: PE risk, Transfer Pricing first-pass screening, Pillar Two). Cross-module shared framework design. Tax OS v1.0 roadmap.

The Tax OS modules share:
- The same GAME agent framework
- The same web UI (analysis type selector)
- The same entity registry (substance data reusable across modules)
- The same RAG infrastructure (extended with new-regime guidance)

---

## Phase sequencing rationale (updated 2026-04-03)

Phases 1–17 complete. The sequence below explains the current arc priority ordering.

```
DONE (v0.21.0):
  Phases 1–18, QA-1, QA-2, QA-3, DOCS-1, DOCS-2, DOCS-3, GITHUB-1
  Treaty mechanics, web UI, RAG, substance interview, entity registry,
  human review, citations, Zod validation, treaty verifier (live),
  eval harness (9 golden cases), legal source hierarchy, confidence UX + HITL,
  UC2 vendor risk classification (classify_vendor_risk, progressive checklist).
  Tool is production-capable for UC1 intercompany and UC2 third-party analysis.

NEXT (Phase 19 — Due Diligence Module + Negative Evidence Gate):
  DD checklist per payment type; DD gap analysis in WhtReport;
  explicit flagging of missing KSeF ID, board logs, payroll proofs.

THEN (Phases QA-4, 20–22 — Core completion):
  Due Diligence module, data quality pass, batch processing,
  production hardening. Order is impact-driven.

FUTURE (Phases 23–26 — Professional features):
  Intangibles layer, GAAR tool, legal source workflow,
  jurisdiction expansion, WHT v1.0.

VISION (Phases 27–29 — Tax OS):
  GLOBAL VISION (private), EU jurisdiction engine, Module 2 planning.
  Begins after WHT v1.0 is complete and battle-tested.
```

---

## Key product design principles for all future phases

These came out of building Phases 1-8. Every future decision should be checked against them.

**1. The agent is a structured research assistant, not a legal advisor.**
It applies a checklist derived from authoritative sources. It does not give legal advice. Every
report must be reviewed and approved by a qualified professional. This is not a disclaimer —
it is an architectural property that shapes the output format and the approval workflow.

**2. Explicit uncertainty is better than false confidence.**
When the agent does not have sufficient data, it says "cannot confirm" with a reason —
not a wrong answer at high confidence. `data_confidence: LOW` with a clear explanation is
more valuable than `data_confidence: HIGH` based on guessed substance.

**3. Data quality drives confidence, not simulation mode.**
The confidence system should reflect the quality of the underlying data:
- Questionnaire answers from the taxpayer themselves → MEDIUM
- Questionnaire answers + public record corroboration → HIGH
- No entity data at all → LOW / "cannot confirm"

**4. Every conclusion cites its legal basis.**
"The entity does not qualify as beneficial owner" is not sufficient. "The entity does not
qualify because condition (ii) — no pass-through obligation — is not satisfied. Per MF
Objaśnienia §2.2.1, a contractual OR factual obligation to forward the payment disqualifies
BO status. The entity has [specific indicator]." That is the target output.

**5. The intercompany and third-party use cases are different products with a shared engine.**
Different data requirements, different due diligence standards, different output formats.
The agent core (GAME + MATE) is shared. The UX and workflows are distinct.

**6. The entity registry is the product's memory.**
Without it, the tool is a one-shot calculator. With it, it becomes a compliance management
system. The transition from Phase 10 to Phase 11 is the transition from a tool to a product.

**7. RAG (Phase 9) scales knowledge without recoding.**
Today, when MF publishes updated guidance, someone must recode the substance checklist.
With RAG, you re-index the document. This is the architectural property that makes the tool
maintainable and extensible to new tax regimes (Pillar Two, PE, CbCR) without starting from scratch.

**8. Legal source hierarchy must be reflected in the tool design.**
A citation that says "per CIT Act" and a citation that says "per MF Objaśnienia" carry different
legal weight. The tool must distinguish statute (primary law) from administrative guidance (binding
interpretation) from case law (judicial precedent). This distinction is professional-grade quality — a
tax authority audit will care which category the agent cited. Phase 16 implements this via the
`source_type` and `legal_hierarchy` fields.

---

## Appendix — comparative summary: Orange S.A. vs. XTB Malta Holdings (v0.16.0)

Phase 10 (substance interview) closed the XTB Malta gap. Any entity can now be assessed.

| Factor | Orange S.A. | XTB Malta Holdings |
|---|---|---|
| Treaty lookup | ✅ France in database | ✅ Malta in database |
| Treaty rate | ✅ France royalty 10% | ✅ Malta interest rate (e.g. 5%) |
| MLI/PPT | ✅ France: YES, PPT applies | ✅ Malta: MLI status checked |
| EU Directive | ✅ Royalty, France EU, 50.67% ≥25% | ✅ Interest, Malta EU, 100% ≥25% |
| Pay and Refund | ✅ Related party flagged correctly | ✅ Related party flagged correctly |
| Entity substance | ✅ Via interview or DDQ | ✅ Via 5-question interview (Phase 10) |
| BO conclusion | ✅ Cited legal reasoning | ✅ Cited legal reasoning |
| Report confidence | MEDIUM → HIGH with RAG grounding | MEDIUM → HIGH with RAG grounding |
| Usable for filing? | With professional review + sign-off | With professional review + sign-off |

**Remaining limitation for both cases (Phase 20):** All treaty rates still `verified: false`.
Report confidence cannot reach HIGH on rate-dependent conclusions until Phase 20 verifies the top-10 treaties.

**New gap opened (Phase 23):** If XTB Malta charges management fees or advisory fees (not pure interest), those payments fall under Art. 21 ust. 1 pkt 2a CIT — not currently in scope. Phase 23 adds this analysis layer.

---

## Strategic review — SWOT/SOAR findings (2026-04-03)

An external strategic review of the project was conducted in April 2026. The findings below
are recorded here so they shape future phase priorities and design decisions.
They are **not** retrospective — they are standing guidance for every future session.

---

### Repositioning decision: Co-Pilot over Auto-Pilot

The tool is deliberately positioned as a **tax research co-pilot**, not an autonomous agent.
This is not a limitation — it is the correct professional positioning for a compliance tool.

**What this means in practice:**
- Reports are always "suitable for professional review" — never "ready for filing" without a human sign-off
- HITL (review workflow, Phase 12b) is a core user story, not a workaround
- Substance interview (Phase 10) positions the analyst as an active participant
- DRAFT ONLY status for LOW/UNCERTAIN confidence is a compliance safety gate

**Language standard (apply to all future user-facing text):**
- Web UI: "Here is the first-layer analysis for your review"
- Report conclusion: "This analysis is a research input — professional review required before filing"
- README: frames the tool as an assistant, not a replacement for professional judgment
- The vision statement already reflects this. Maintain it in all future phases.

---

### SWOT summary

**Strengths (protect and leverage):**
- Exceptional documentation — the strongest asset for the MBA research context; makes every design decision explainable
- Architectural excellence — GAME framework, MATE principles, clean separation of concerns; the architecture is a reusable platform
- High-quality codebase — `strict: true`, Zod validation, 326 tests, deterministic verdict computation
- Advanced AI integration — multi-agent (Gemini + OpenAI), RAG, SSE streaming, HITL workflow

**Weaknesses (mitigate in planning):**
- Solo developer dependency — session context must be fully documented in CLAUDE.md + SESSION.md; every knowledge file must be updated before the session ends
- High barrier to entry — complex setup (env vars, Python service, RAG build) limits adoption; Phase 22b simplifies this
- Static knowledge core — tax law changes monthly; no automated update pipeline; Phase 24 addresses partially
- Limited explainability — report format is not yet structured for auditor review (see Blind Spots below)

**Opportunities (prioritise in roadmap):**
- Strategic advisory positioning — evolving from "What is the WHT rate?" toward "What is the most tax-efficient compliant structure?" is the higher-value proposition; relevant for Phase 26 (v1.0 review)
- Tax OS foundation — GAME + MATE + HITL patterns are reusable; the architecture is already a platform; formalise in Phase 27
- AI in professional services boom — co-pilot framing is timely and differentiating

**Threats (design defensively):**
- Rapid legal change — MF Objaśnienia, NSA rulings, KSeF timelines, STTR create knowledge decay; add `last_verified` staleness warning to reports when >6 months (Phase 24)
- Platform dependency — OpenAI/Gemini API changes can break functionality; keep simulate fallbacks working and test them
- Regulatory uncertainty — if AI-generated tax advice is regulated, co-pilot framing is the safer positioning

---

### Three blind spots — design implications

**Blind Spot 1: Auditor's perspective missing.**
Current reports are structured for the analyst, not the auditor. An auditor needs:
- Explicit acknowledgement of what evidence was NOT considered (Phase 19 DD gap analysis begins to address this)
- A documented decision trail for each of the three BO conditions (why PASS or FAIL)
- A clear flag when the analysis relied on simulated or unverified data (Phase 17 DRAFT ONLY is the start)

*Design implication:* Phase 26 Legal Memo output should follow Polish tax opinion standard:
Facts → Legal Framework → Application → Conclusion (FLAC). This is the format KAS reviewers
and courts expect.

**Blind Spot 2: Garbage In, Gospel Out problem.**
The system assumes input quality. Phase 19 (Negative Evidence Gate) addresses missing documents.
It cannot detect inaccurate inputs or user misrepresentation of what documents they actually hold.

*Design implication:* The DD checklist should eventually include a self-certification step where the
analyst confirms each document was physically reviewed, not just listed. The HITL review workflow
(Phase 12b) is the current compensating control — reviewers should be trained to verify the document
list before signing off.

**Blind Spot 3: Static Knowledge Trap.**
The knowledge base (RAG sources, treaties.json) has no automated update mechanism. Tax law in Poland
changes frequently (KSeF mandate timelines, STTR implementing legislation, NSA judgments).

*Design implication:* Phase 24 (Legal Source Management Workflow) is a maintenance requirement, not
optional. Additionally: add a "knowledge freshness" warning to reports when a RAG source
`last_verified` date is more than 6 months old. This is a one-line check in `consultLegalSources()`.

---

### SOAR — Aspirations and Results focus

**Aspirations:**
- Become the trusted standard for first-layer WHT BO analysis in Polish in-house tax teams
- Enable a tax professional to be "10× more effective" — more thorough analysis in less time with full audit trail
- Establish the GAME + MATE + HITL framework as a reusable Tax OS platform (Phase 27–29)

**Results to aim for at v1.0 (Phase 26):**
- End-to-end demo: UC1 (intercompany royalty — Orange S.A.) + UC2 (third-party vendor — XTB Malta)
- All acceptance criteria in this document verified
- Legal Memo (FLAC format) output alongside the JSON report
- MBA prototype declaration: this tool demonstrates that AI-assisted compliance is viable,
  auditable, and professionally defensible when designed with HITL and deterministic gates
