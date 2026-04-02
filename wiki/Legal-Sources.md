# Legal Sources Registry

All authoritative sources used in the WHT Beneficial Owner Agent. The canonical machine-readable version is [`data/legal_sources_registry.json`](../blob/master/data/legal_sources_registry.json).

> **Verification policy:** All sources with `status: current` have been identified and located by the author. Individual provisions have not been verified line-by-line against the original texts unless noted. Treaty rates in `data/treaties.json` are all marked `verified: false` — pending confirmation against treaty PDFs.

---

## Sources by type

### Primary legislation (statutes)

| ID | Name | Reference | Status | Local copy |
|---|---|---|---|---|
| `PL-CIT-2026` | Polish CIT Act | Dz.U. 2026 poz. 331 | Current | `D19920086Lj.pdf` |
| `PL-ORD-2026` | Polish Tax Ordinance | Dz.U. 2026 poz. 252 + poz. 347 | Current | Reference only |

**Key CIT Act provisions used in agent:**

| Article | Subject |
|---|---|
| Art. 4a pkt 29 | Beneficial owner definition — 3 cumulative conditions |
| Art. 21 ust. 1 | WHT rates on interest and royalties (20%) |
| Art. 21 ust. 3 | EU I&R Directive implementation (0% exemption) |
| Art. 22 ust. 1 | WHT rate on dividends (19%) |
| Art. 22 ust. 4 | EU P-S Directive implementation (0% exemption) |
| Art. 22c | General Anti-Avoidance Rule (GAAR) for WHT |
| Art. 26 | Remitter obligations, BO verification, due diligence |
| Art. 26 §2c | Pay and Refund mechanism (PLN 2M threshold) |
| Art. 26aa | Withholding and refund procedure |
| Art. 26b | Opinia o stosowaniu preferencji |

---

### Official guidance

| ID | Name | Author | Reference | Status |
|---|---|---|---|---|
| `MF-OBJ-2025` | Objaśnienia podatkowe — rzeczywisty właściciel | Ministry of Finance | Published 2025 | Current — legal protection status |
| `MF-TREATY-LIST` | Wykaz umów o unikaniu podwójnego opodatkowania | MoF / podatki.gov.pl | Updated 27 Jan 2026 | Current |

**MF Objaśnienia 2025 — key sections used in agent:**

| Section | Subject |
|---|---|
| §2.2 | Conduit entity definition |
| §2.2.1 | Conduit indicators (4 red flags) |
| §2.3 | Universal substance criteria (6 factors) |
| §2.3.1 | Holding-company-specific substance criteria |
| §4 | Due diligence standards: related vs. unrelated parties |

> The MF Objaśnienia carry **legal protection status** under Art. 14n Tax Ordinance — a taxpayer who relies on them in good faith is protected from penalties even if the interpretation is later found incorrect.

---

### EU Directives

| ID | Name | Reference | Status |
|---|---|---|---|
| `EU-IR-DIR-2003` | Interest and Royalties Directive | Council Directive 2003/49/EC | Current |
| `EU-PS-DIR-2011` | Parent-Subsidiary Directive (recast) | Council Directive 2011/96/EU | Current |

---

### MLI and OECD

| ID | Name | Reference | Status |
|---|---|---|---|
| `PL-MLI-RATIF` | Poland MLI ratification positions | OECD MLI Matching Database | Current |
| `OECD-MC-2017` | OECD Model Tax Convention 2017 | OECD | Reference |
| `OECD-TP-GL` | OECD Transfer Pricing Guidelines | OECD — Chapter VI (DEMPE) | Reference |

**Critical MLI edge cases for Poland:**

| Country | Status | Note |
|---|---|---|
| Germany | EXCLUDED_BY_POLAND | Germany excluded from Art. 7 PPT by Poland's reservation |
| Italy | NOT_RATIFIED | Italy has not ratified MLI — treaty predates and PPT does not apply |
| Netherlands | VERIFY_MATCHING_DB | Check OECD MLI Matching Database — probable PPT = NO |
| Sweden | VERIFY_MATCHING_DB | As above |
| Switzerland | VERIFY_MATCHING_DB | As above |

---

### Commentary

| ID | Name | Authors | Status |
|---|---|---|---|
| `JANKOWSKI-SMOLEN-2025` | WHT Commentary — Jankowski & Smoleń | Jankowski, Smoleń | Current — cited in agent design |

Key findings from Jankowski & Smoleń used in agent:
- Substance test criteria alignment with MF Objaśnienia
- BO vs. TP recharacterisation analysis
- Key CJEU / NSA / national case law table

---

## Treaty rates — verification priority

All 36 entries in `data/treaties.json` have `verified: false`. Priority order for Phase 20 verification:

| Priority | Country | Reason |
|---|---|---|
| 1 | Luxembourg | 2012 Protocol changes; 0% dividend rate in current treaty |
| 2 | Malta | EU P-S Directive alignment; 0% dividend rate |
| 3 | France | Art. 12(3) scope note — technical services may be royalties |
| 4 | Germany | Most commercially significant; EXCLUDED_BY_POLAND MLI flag |
| 5 | Netherlands | VERIFY_MATCHING_DB; high-value intercompany payments |
| 6 | Cyprus | 0% dividend; conduit-risk jurisdiction |
| 7 | Ireland | 0% dividend; tech company royalties |
| 8 | UK | Post-Brexit treaty; high commercial volume |
| 9 | Switzerland | VERIFY_MATCHING_DB; significant banking/holding payments |
| 10 | USA | High volume; no MLI — bilateral treaty only |

Sources for verification: DzU references in `data/treaties.json` → official treaty PDFs at isap.sejm.gov.pl.

---

## RAG — live as of Phase 9

The following documents are indexed and active in the `consult_legal_sources` tool:

| Source ID | Document | Chunks | Last verified |
|---|---|---|---|
| `PL-CIT-2026-WHT` | CIT Act Arts. 4a, 21, 22, 22c, 26 | 9 | 2026-04-02 |
| `MF-OBJ-2025` | MF Objaśnienia podatkowe 2025 — BO | 14 | 2026-04-02 |

Chunking: split at section boundaries matching taxonomy concept IDs (`data/tax_taxonomy.json`). Each chunk carries `source_id`, `section_ref`, and `last_verified` frontmatter (DOCS-2, Phase 16 will surface this in tool output).

**Planned additions (Phase 24 — Legal Source Management Workflow):**
- Protocol for adding new sources: frontmatter template, chunking, rebuild, `last_verified` tracking
- Case law ingestion: key NSA / CJEU rulings on BO definition
- Phase 23 (Intangibles): additional CIT Act provisions (Art. 21 ust. 1 pkt 2a)
