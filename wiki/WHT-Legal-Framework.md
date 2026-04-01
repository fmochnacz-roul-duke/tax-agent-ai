# WHT Legal Framework — Polish Withholding Tax

This page documents the legal framework implemented in the agent. It is a reference for understanding what the agent does and why — not a substitute for reading the source texts.

> **Review status:** All provisions should be verified against Dz.U. 2026 poz. 331 (CIT Act) and the MF Objaśnienia 2025 before use in a real filing. See [[Legal Sources]] for verification status.

---

## The core question

When a Polish entity pays dividends, interest, or royalties to a foreign entity, it must withhold tax — **unless** a treaty rate or Directive exemption applies. The correct rate depends on all of the following, in order:

```
1. Does a bilateral DTT exist?          → check_treaty
2. Is the recipient the beneficial owner? → check_entity_substance (BO test)
3. Does the MLI PPT apply?              → check_mli_ppt
4. Does an EU Directive apply?          → check_directive_exemption (0% if yes)
5. Does Pay and Refund apply?           → check_pay_and_refund (PLN 2M+ related party)
```

Each step can reduce the rate (step 4) or prevent the reduction (steps 2, 3).

---

## Statutory WHT rates (Art. 21 + Art. 22 CIT)

| Income type | Statutory rate | Provision |
|---|---|---|
| Dividends | 19% | Art. 22 ust. 1 CIT |
| Interest | 20% | Art. 21 ust. 1 pkt 1 CIT |
| Royalties | 20% | Art. 21 ust. 1 pkt 1 CIT |

These rates apply unless a DTT or Directive reduces them.

---

## The beneficial owner test — Art. 4a pkt 29 CIT

Three **cumulative** conditions. Failing any one denies BO status and the statutory rate applies.

### Condition I — Economic and legal title to income

The entity receives the payment as the rightful legal and economic owner of the underlying right or asset — not as an agent, nominee, or intermediary.

*Key question:* Who really owns the receivable?

### Condition II — No pass-through obligation

The entity is **not obliged** to forward the received income to a third party. Either a formal contractual obligation OR a factual/informal arrangement that achieves the same economic result (forwarding X → receiving X – thin margin) disqualifies BO status.

*Key question:* Does the money flow through, or does it stop here?

MF Objaśnienia §2.2.1 specifies conduit indicators (see [[Tax Taxonomy]] — `conduit_indicators` category).

### Condition III — Genuine business activity

The entity carries on **genuine** business activity in its country of residence — assessed against the MF Objaśnienia §2.3 universal criteria:

| Factor | What is assessed |
|---|---|
| Headcount | Number of employees physically present |
| Physical office | Real office vs. registered address only |
| Decision-making | Independent management vs. parent-directed |
| Own operating costs | Salary, rent, utilities actually incurred |
| Economic risk bearing | Bears genuine financial/operational risk |
| Pass-through indicators | Absence of contractual/factual forwarding |

For **holding companies**, additional criteria apply per MF Objaśnienia §2.3.1 (to be verified — see review notes in `data/tax_taxonomy.json`).

---

## MLI Principal Purpose Test — Art. 7 MLI

Even where a treaty rate applies and the recipient passes the BO test, the PPT can independently deny the treaty preference if:

> It is reasonable to conclude that obtaining that benefit was one of the **principal purposes** of an arrangement or transaction.

This applies where:
- Poland and the recipient's country have both ratified the MLI
- Neither excluded the other from Art. 7 PPT

Poland's position: PPT applies to the majority of its active treaties. Exceptions: Germany (excluded by Poland's reservation), Italy (MLI not yet in force for Italian treaty), Netherlands/Sweden/Switzerland (VERIFY status — check OECD MLI Matching Database).

The agent applies a **conservative rule**: VERIFY status → PPT = not confirmed + caution message surfaced.

---

## EU Directives — 0% exemptions

### Interest and Royalties Directive (2003/49/EC) — Art. 21 ust. 3 CIT

Conditions for 0% WHT:
- Both entities are EU/EEA resident
- Both subject to corporate income tax (cannot be a tax-transparent entity)
- The payer holds ≥ **25%** of the payee (or vice versa, or both held ≥ 25% by common parent)
- The shareholding has been held (or will be held) for ≥ **2 years**
- The recipient is the **beneficial owner**

Applies to: interest and royalties.

### Parent-Subsidiary Directive (2011/96/EU) — Art. 22 ust. 4 CIT

Conditions for 0% WHT on dividends:
- Both entities are EU resident, covered legal form (e.g. SA, GmbH, Ltd), subject to corporate tax
- The payer holds ≥ **10%** of the payee for ≥ **2 years**
- The recipient is the **beneficial owner**

The BO condition applies to both Directives — a conduit entity cannot claim a Directive exemption.

---

## Pay and Refund mechanism — Art. 26 §2c CIT

Where annual payments to a **single related-party entity** exceed **PLN 2,000,000**:

1. The Polish entity **must withhold at the statutory rate** (not the reduced rate)
2. The foreign entity then claims a **refund** from the Polish tax authority

**Alternatives to the refund procedure:**
- **Opinia** (Art. 26b CIT): tax authority opinion certifying BO status and applicable rate — valid for 36 months
- **WH-OSC declaration**: signed by the Polish company's management board — accepts full liability if BO status is incorrectly assessed

Pay and Refund almost always applies to large intercompany dividend, interest, and royalty payments within corporate groups.

---

## GAAR — Art. 22c CIT

The domestic general anti-avoidance rule specific to WHT. Operates independently of and in parallel with:
- The BO test (Art. 4a pkt 29)
- The MLI PPT (Art. 7 MLI)

All three can apply to the same arrangement. Even if the BO test and PPT are satisfied, GAAR can still deny a preference where the arrangement lacks genuine economic justification.

---

## DEMPE framework — OECD TP Guidelines Ch. VI

For royalty payments, the agent also runs a DEMPE analysis (currently simulated — Phase 9b will add real retrieval). DEMPE assesses whether the IP holding performing **D**evelopment, **E**nhancement, **M**aintenance, **P**rotection, and **E**xploitation of the intangible — or whether those functions sit elsewhere in the group while the holding merely holds legal title.

Key principle: legal ownership of IP does not, by itself, entitle an entity to royalty income at arm's length if it does not perform or control DEMPE functions.

---

## Key legal sources

| Source | Role | Status |
|---|---|---|
| Polish CIT Act (Dz.U. 2026 poz. 331) | All domestic WHT provisions | Verified |
| MF Objaśnienia podatkowe 2025 | Official guidance — substance, due diligence, conduit indicators | Verified |
| OECD MC 2017 + Commentary | Treaty interpretation, BO definition, PPT | Reference |
| OECD TP Guidelines Ch. VI | DEMPE framework | Reference |
| Poland MLI ratification positions | Which treaties have PPT, which are excluded | Verified |

Full registry: [[Legal Sources]] / [`data/legal_sources_registry.json`](../blob/master/data/legal_sources_registry.json)
