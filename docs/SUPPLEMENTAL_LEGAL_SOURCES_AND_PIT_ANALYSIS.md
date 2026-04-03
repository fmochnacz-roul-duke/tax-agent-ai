# Supplemental Legal Sources & PIT WHT Analysis

> **Date:** 2026-04-03
> **Objective:** Identify missing authoritative data sources to support the 2026 Stress Test and evaluate the impact of missing the PIT (Personal Income Tax) perspective.

---

## 1. Supplemental Legal Sources (2026 Upgrade)

The current knowledge base (`data/knowledge_base/sources/`) is limited to the Polish CIT Act and the 2025 BO Explanations. To handle the **2026 Digital Footprint Audit**, the following sources MUST be ingested into the RAG pipeline:

### A. Digital & Procedural Sources (New Mandates)
*   **KSeF Technical Specification (XML Schema v3.0)**: Essential for the agent to understand how WHT data is linked to the "Faktura Ustrukturyzowana".
*   **KAS Guidance on Digital Evidence (Wytyczne KAS 2025)**: Guidelines for tax inspectors on verifying substance via MS Teams logs, IP address tracking, and LinkedIn profile audits.
*   **Pillar Two STTR Model Rules (OECD 2025)**: Detailed commentary on the "Subject to Tax Rule" and the "9% Top-Up" mechanism.

### B. Jurisprudence (The "Citations" Layer)
*   **NSA Case Law Database (BO Subset)**: Key rulings (e.g., **NSA II FSK 27/23** - DutchCo substance denial) to calibrate the agent's judgment on "Decision-making Independence".
*   **CJEU "Danish Cases" (C-116/16, C-117/16)**: The foundational EU jurisprudence that defines "Abuse of Right" and "Beneficial Ownership" in a cross-border context.

### C. The "Economic Reality" Sources
*   **Local Payroll Thresholds (2026)**: Current average salary data for Luxembourg, Ireland, and Malta to verify if "Operating Costs" reported in a DDQ are realistic or merely nominal.
*   **Board Saturation Registry (Mock or Real API)**: A lookup for director names to flag individuals with >10 board appointments.

---

## 2. The Missing PIT Perspective (Compliance Blind Spot)

The agent currently operates on a **CIT-Centric Bias**. This is a critical gap because WHT obligations apply equally to payments made to individuals (PIT) or via partnerships.

### A. Statutory Gaps (PIT Act vs CIT Act)
| Concept | CIT Act (Current) | PIT Act (Missing) | Impact |
|---|---|---|---|
| **Royalties/Interest** | Art. 21 | **Art. 29** | Agent misses WHT on B2B freelancers. |
| **Dividends** | Art. 22 | **Art. 30a** | Agent misses WHT on private shareholders. |
| **Beneficial Owner** | Art. 4a pkt 29 | **Art. 5a pkt 20** | Definitions are similar, but PIT has different "Due Diligence" nuances. |
| **Pay & Refund** | Art. 26 ust. 2c | **Art. 41 ust. 12** | Threshold (PLN 2M) applies to PIT too, but forms differ (IFT-1/1R). |

### B. "The B2B Ghost": Why PIT Matters in 2026
In 2026, many "Intangible Services" (Management, IT, Advisory) are provided by **foreign sole proprietorships** (e.g., an IT architect in Germany or a consultant in Switzerland).
*   **The Risk**: The agent might conclude "No CIT WHT" because the recipient is not a company, failing to flag a **20% PIT WHT** under Art. 29 PIT.
*   **The "Worker" Recharacterization**: KAS often recharacterizes B2B contracts as **Employment Contracts** if the "Substance" is just one person. The agent needs to check the PIT "Substance" (Independent business organization vs. disguised employment).

### C. Compliance nuance: Forms & Deadlines
*   **CIT**: Uses IFT-2 / IFT-2R.
*   **PIT**: Uses IFT-1 / IFT-1R.
*   **Conflict**: If the agent misclassifies an entity (e.g., a UK LLP which can be transparent or opaque), it will recommend the wrong tax form, leading to a procedural penalty.

---

## 3. Recommendation for Phase 24b (PIT & Hybrid Entities Expansion)

> **Note:** This is Phase 24b in the roadmap. Phase 24 = Legal Source Management Workflow (source update protocol, `last_verified` update workflow). Phase 24b follows directly after Phase 24.

1.  **Ingest PIT Act (Chapters on WHT)** into the Knowledge Base (Art. 29, 30a PIT Act).
2.  **Add `recipient_type` parameter**: `ENTITY` (CIT) vs `INDIVIDUAL` (PIT) vs `PARTNERSHIP` (transparency assessment required).
3.  **Update "Management Fee" logic**: Specifically target B2B contracts to differentiate between "Business Profits" and "Independent Personal Services" (Art. 14 OECD MC legacy).
4.  **Triangulation for Individuals**: Cross-reference LinkedIn/Social media footprints (FactChecker) against the "Genuine Business Activity" claim of a sole proprietor.
5.  **IFT form guidance**: Agent report must specify IFT-1/IFT-1R (PIT) or IFT-2/IFT-2R (CIT) based on `recipient_type`.
6.  **UK LLP transparency check**: `case_11_uk_llp_hybrid.json` is the primary eval case for this phase.
