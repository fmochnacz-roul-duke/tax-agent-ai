# Project Vision — WHT Beneficial Owner Scanner

> This document defines the strategic direction and product vision for the WHT Beneficial Owner
> Agent. It guides phase prioritisation and design decisions. It is a living document — update it
> when the vision changes, not just when a phase completes.

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

## Honest current state (as of Phase 8)

### What genuinely works

| Capability | Status | What it means |
|---|---|---|
| Treaty lookup (check_treaty) | ✅ Live | Correct for all 36 countries in database |
| Treaty rate (get_treaty_rate) | ✅ Live logic, ⚠ unverified rates | Rate logic correct; amounts need PDF confirmation |
| MLI/PPT check (check_mli_ppt) | ✅ Live | Correct from MoF + OECD positions cross-check |
| EU I&R Directive (check_directive_exemption) | ✅ Live logic | Rules correctly implemented; depends on user input |
| Pay and Refund check (check_pay_and_refund) | ✅ Live logic | Correctly flags trigger + relief options |
| Conversational input (web UI) | ✅ Live | Extracts parameters from free text, asks follow-ups |
| Progress streaming (SSE) | ✅ Live | Live agent log in browser |
| Report output (JSON) | ✅ Live | Structured, timestamped, machine-readable |

### What does NOT work — the central gap

| Capability | Status | Why it matters |
|---|---|---|
| Entity substance assessment | ❌ Simulated | For any entity other than Orange S.A. or Alpine Holdings, defaults to CONDUIT/UNCERTAIN. Useless for real decisions. |
| DEMPE analysis | ❌ Simulated | Returns structured template, not real functional analysis. |
| FactChecker (web search) | ⚠ Optional | Only useful for large publicly-listed entities with abundant public data. Not reliable for most holding companies. |
| Substance data entry in web UI | ❌ Missing | No way to input real entity data via browser. DDQ path is CLI-only. |
| Entity registry | ❌ Missing | No persistence. Same entity re-analysed from scratch every run. |
| Treaty rate verification | ⚠ All unverified | Every rate in treaties.json is `verified: false`. |
| Human review workflow | ❌ Missing | No approval step, no annotation, no professional sign-off. |

### The central problem in one sentence

The tool can correctly identify WHICH legal framework applies and WHAT rate would apply if
the entity qualifies — but it cannot assess WHETHER the entity actually qualifies, because
that requires real data about the entity, and no mechanism to input that data exists yet.

For the Malta interest case: the agent would correctly flag the treaty rate, the EU Directive
0% path, and the Pay and Refund obligation — but would conclude "cannot confirm BO status"
for the Malta holding because it has no substance data. A tax professional already knows the
treaty rate and the Directive exist. The value they need is exactly what the tool cannot yet provide.

---

## What tax team readiness requires — acceptance criteria

A "Beneficial Owner Scanner" that a tax team can actually use must meet all of these:

**Functional requirements:**
- [ ] Any entity can be assessed, not just two hardcoded ones
- [ ] Substance data entered via browser (no DDQ files, no Python service for basic use)
- [ ] Entity profiles persist — same holding is not re-entered each quarter
- [ ] Treaty rates verified against at least the top 10 commercially relevant treaties
- [ ] Report includes a "reviewed and approved by" field that a professional fills in
- [ ] Output format suitable for a tax file (not just developer-readable JSON)
- [ ] Intercompany and third-party workflows are explicitly different

**Quality requirements:**
- [ ] Every BO conclusion cites the specific MF Objaśnienia and/or OECD criteria it applied
- [ ] Confidence levels reflect real data quality, not just whether simulation mode is active
- [ ] The agent never states a conclusion with HIGH confidence based on simulated substance
- [ ] Conservative fallback is explicit — "cannot confirm" is better than a wrong answer

**Process requirements:**
- [ ] A new payment can be analysed in under 5 minutes if entity data is already stored
- [ ] A new entity can be onboarded in under 15 minutes
- [ ] Output is suitable for review by a professional who did not run the analysis

---

## Phase roadmap — revised

The original Phase 9 plan was "simple RAG." This section refines the full roadmap based on
the gap analysis above.

### Phase 9 — Legal knowledge RAG (originally planned)

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

### Phase 10 — Substance questionnaire (HIGHEST IMPACT)

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

### Phase 11 — Entity registry and profile persistence

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

### Phase 12 — Treaty rate verification and human review workflow

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

### Phase 13 — Third-party vendor workflow

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

### Phase 14 — Batch payment processing

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

### Phase 15+ — Tax AI OS expansion

The longer-term vision (Tax OS) adds new analysis modules that share the same GAME
framework, web UI, entity registry, and RAG knowledge base:

| Module | What it analyses |
|---|---|
| **Pillar Two / GloBE** | Is the group within scope? What is the effective tax rate per jurisdiction? |
| **Transfer Pricing screening** | Are intercompany transactions within arm's length ranges? First-pass risk flag. |
| **PE risk** | Does the foreign entity's activity in Poland create a permanent establishment? |
| **CbCR analysis** | Parse Country-by-Country Reports; flag low-substance / high-profit mismatches |

These modules reuse:
- The same GAME agent framework
- The same web UI (different analysis type selected)
- The same entity registry (entity substance data is reusable across modules)
- The RAG knowledge base (extended with Pillar Two, TP, PE guidance)

---

## The correct phase sequence — a decision framework

Not all phases are equal. This is the recommended order based on impact and dependencies:

```
TODAY:    Phases 1-8 complete — treaty mechanics, web UI, streaming
          Tool is useful for treaty/directive/P&R lookup only

NEXT:     Phase 9 + 10 together (RAG + substance questionnaire)
          These are co-dependent — RAG gives the right questions,
          Phase 10 gives the UI to answer them.
          Together: any entity can be assessed with cited legal reasoning.
          This is the transition from "demo" to "actually useful."

THEN:     Phase 11 (entity registry)
          Once Phase 10 exists, persistence makes it practical for
          real recurring use. Without Phase 10, Phase 11 stores nothing useful.

THEN:     Phase 12 (treaty rates + human review)
          Treaty rates should be verified before anything goes near a real
          filing. The review workflow should be in place before Phase 13.

THEN:     Phase 13 (third-party vendor flow)
          Builds on Phase 12's risk classification logic.
          A genuinely new use case, not just an improvement to the existing one.

FUTURE:   Phase 14 (batch processing) and Phase 15+ (Tax OS modules)
          These require Phases 9-13 to be solid first.
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

---

## Appendix — comparative summary: Orange S.A. vs. XTB Malta Holdings today

| Factor | Orange S.A. (works today) | XTB Malta Holdings (does not work) |
|---|---|---|
| Treaty lookup | ✅ France in database | ✅ Malta in database |
| Treaty rate | ✅ France royalty 10% | ✅ Malta interest rate (e.g. 5%) |
| MLI/PPT | ✅ France: YES, PPT applies | ✅ Malta: MLI status checked |
| EU Directive | ✅ Royalty, France EU, 50.67% ≥25% | ✅ Interest, Malta EU, 100% ≥25% |
| Pay and Refund | ✅ Related party flagged correctly | ✅ Related party flagged correctly |
| Entity substance | ✅ Hardcoded: STRONG profile | ❌ Unknown → CONDUIT (no data) |
| BO conclusion | ✅ PASS (3/3 conditions) | ❌ UNCERTAIN (0/3 conditions) |
| Report confidence | MEDIUM (rates unverified) | LOW (substance simulated) |
| Usable for filing? | With professional review | No — substance conclusion worthless |

The gap is entirely in entity substance. Everything else works for both cases.
Phases 9+10 close that gap.
