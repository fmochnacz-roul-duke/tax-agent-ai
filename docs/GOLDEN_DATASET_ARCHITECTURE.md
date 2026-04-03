# Golden Dataset Architecture & Importance

> **Date:** 2026-04-03
> **Status:** Active — v2.0 case structure in use for cases 09–12; EU27 scaffolds (cases 13–31) use v2.0 fields with placeholder rates (to be enriched in QA-4)
> **Objective:** Replace the existing "weak" test cases with a robust, legally-grounded Golden Dataset that serves as the source of truth for WHT agent evaluation.

---

## 1. Why a "Golden Dataset"?

In the domain of international tax and WHT compliance, a "pass/fail" unit test is insufficient. The **Golden Dataset** is a curated collection of real-world (and realistic synthetic) tax scenarios that represent the full spectrum of WHT risks.

### The Importance of the Golden Dataset:
1.  **Regression Guard**: Ensures that improvements to the RAG layer or the LLM prompt don't break existing correct conclusions.
2.  **Legal Benchmarking**: Calibrates the agent's "Judgment" against established Polish tax office (MoF) guidance (MF Objaśnienia 2025).
3.  **Confidence Validation**: Verifies that the `data_confidence` (HIGH/MEDIUM/LOW) correctly reflects the quality and quantity of available evidence.
4.  **Triangulation**: Tests the "Triangulation Rule" — where public records (FactChecker), taxpayer claims (DDQ/Interview), and statutory rules (RAG) must all align.

---

## 2. Architecture of a Robust Golden Case (v2.0 - 2026 Stress Test)

The existing cases use a simplified `input` structure. The **Robust Golden Dataset (v2.0)** introduces a structured `input_context` to mimic a real 2026 tax file, focusing on "Digital Footprints" rather than static documents.

### Proposed Case Structure (JSON):

```json
{
  "case_id": "GOLD-2026-001",
  "metadata": {
    "risk_tier": "HIGH",
    "complexity": "EXPERT",
    "primary_provision": "Art. 4a pkt 29 (BO) + STTR (Pillar Two)",
    "scenario_type": "Intercompany / 2026 Stress Test"
  },
  "input": {
    "entity_name": "...",
    "country": "...",
    "income_type": "...",
    "shareholding_percentage": 100,
    "annual_payment_pln": 5000000,
    "related_party": true,
    "ksef_invoice_id": "PL-20260215-ABC123-XY",
    "evidence": {
      "cfr_status": "BASELINE_ONLY",
      "payroll_filing_proof": "Loonheffing (NL) / P30 (IE) verified",
      "lease_registry_cert": "EXCLUSIVE_OFFICE_CONFIRMED",
      "pillar_two_gir_status": "ETR_GT_15_PERCENT",
      "tp_local_file_benchmarked": true
    },
    "substance_details": {
      "senior_headcount": 3,
      "board_saturation": "Low (<5 boards per director)",
      "it_infrastructure_costs": "Significant (Cloud + Local Dev salaries)",
      "flash_lending_timing": "No (Funds held >30 days)",
      "board_meeting_ip_origin": "Local (Verified via Logs)",
      "economic_justification": "Detailed expansion business case"
    }
  },
  "expected": {
    "bo_overall": "CONFIRMED",
    "conduit_risk": false,
    "sttr_topup_applies": false,
    "treaty_rate_percent": 5,
    "rate_basis": "treaty",
    "citations_required": ["Art. 4a pkt 29", "KSeF Mandate 2026", "OECD Pillar Two STTR"],
    "min_confidence": "HIGH"
  }
}
```

---

## 3. The 5-Layer Scenario Matrix (Updated for 2026)

| Layer | Scenario Category | 2026 Stress Factor |
|---|---|---|
| **1. Baseline** | Clear Operating Co | Verified via KSeF + GIR (>15% ETR). |
| **2. Conduit** | Shell/SPV | Flash lending (<48h) + Board saturation (>10 boards). |
| **3. STTR Trap** | Low-Tax Branch | Branch/HQ in <9% jurisdiction (e.g., Swiss Canton Holiday). |
| **4. Hybrid** | Fiscally Transparent | Post-Brexit UK LLP or Reverse Hybrids. |
| **5. Intangibles** | Management Fees | TP Benchmarking vs. "Hidden Dividend" recharacterization. |

---

## 4. Knowledge Gaps & Compliance Blind Spots (The "Negative" Set)

The Golden Dataset must specifically target these identified "Blind Spots":

1.  **Intangibles (Phase 23 Gap)**: Scenarios involving management fees (Art. 21.1.2a) where the agent must distinguish between "Business Profits" (Art. 7) and "Royalties" (Art. 12).
2.  **Unverified Treaties (Phase 20 Gap)**: Cases where the treaty text differs from standard OECD models (e.g., Narrow royalty definition in the 1975 France treaty).
3.  **Third-Party Vendor (Phase 18 Gap)**: Low-value vendor payments where "Good Faith" and "Due Diligence" standards are lower (MF-OBJ-2025 §4).
4.  **Multi-Leg Look-Through**: Leg 1 (Conduit) and Leg 2 (Ultimate BO) linked scenarios to test "Conduit Risk" flagging.

---

## 5. Execution Plan

1.  **Draft 12-15 Golden Cases**: Covering the matrix above.
2.  **Verification**: Cross-reference each case with `data/tax_taxonomy.json` to ensure canonical keywords are used.
3.  **Automation**: Update `scripts/runEvals.ts` to support the structured `input_context`.
4.  **Audit**: Add a `last_reviewed` date to every golden case file.

---

*This architecture ensures that the WHT Agent remains a professional-grade tool, capable of defending its conclusions during a tax audit.*
