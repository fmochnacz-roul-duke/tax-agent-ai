# WHT Beneficial Owner Co-Pilot — Wiki

A structured AI research co-pilot for Polish withholding tax beneficial owner analysis.

> **Not a substitute for professional judgment.** This tool is a structured research layer — it handles the treaty lookup, legal framework application, substance checklist, and documentation so that a tax professional can focus on the judgment call, not the groundwork. Every report requires professional review and sign-off before use in any compliance context.

---

## What this project does

When a Polish entity pays dividends, interest, or royalties to a foreign beneficial owner, it must determine and apply the correct withholding tax rate. The rate depends on:

- The bilateral DTT between Poland and the owner's country of residence
- Whether the owner meets the **beneficial owner test** (Art. 4a pkt 29 Polish CIT Act)
- **MLI modifications** — specifically the Principal Purpose Test (Article 7)
- EU Directives (Parent-Subsidiary / Interest & Royalties) where applicable
- The **Pay and Refund** mechanism for related-party payments above PLN 2M

This agent automates the first-layer research for any WHT-relevant payment — intercompany or third-party — producing a structured, cited, machine-readable report in under five minutes.

---

## Two use cases

### UC1 — Intercompany payment review

Polish entity → related holding / IP / finance company

- Same entities appear every quarter
- Highest due diligence standard (Art. 26 CIT + MF Objaśnienia §4)
- Pay and Refund almost always triggers
- Full substance assessment via 5-question interview or DDQ upload
- **Status: fully supported as of Phase 10**

### UC2 — Third-party vendor scan

Polish entity → unrelated foreign vendor (software licences, content fees, SaaS)

- New entity on each vendor onboarding
- Lower due diligence standard (residence cert + BO declaration sufficient)
- Risk classification drives document checklist
- **Status: `classify_vendor_risk` tool live as of Phase 18 (v0.21.0). Full DD module in Phase 19.**

---

## Current status (v0.23.0)

| Phase | Description | Status |
|---|---|---|
| 1 | Live treaty data — 36 countries, MLI flags | ✅ v0.1.0 |
| 2+3 | Structured CLI input, JSON report output | ✅ v0.3.0 |
| 4 | Entity substance profiles, 3-condition BO test | ✅ v0.4.0 |
| 5 | MATE — model tiering, environment validation | ✅ v0.5.0 |
| 6 | Python DDQ extraction service | ✅ v0.6.0 |
| 7 | FactChecker Agent — Gemini + Google Search | ✅ v0.7.0 |
| 8 | Conversational web UI, SSE streaming | ✅ v0.8.0 |
| 9 | Legal knowledge RAG + tax taxonomy | ✅ v0.9.0 |
| 10 | Substance interview — 5-question chat, any entity | ✅ v0.10.0 |
| 11 | Entity registry — JSON persistence, audit trail | ✅ v0.11.0 |
| 12a | TreatyVerifierAgent — Gemini rate verification | ✅ v0.12a.0 |
| 12b | Human review workflow — drawer, sign-off, CLI | ✅ v0.12b.0 |
| 13 | Citations on WhtReport; RAG legal grounding gate | ✅ v0.13.0 |
| QA-1 | ESLint + Prettier + c8 coverage + snapshot test | ✅ v0.14.0 |
| QA-2 | Zod validation; Python/TS contract tests | ✅ v0.15.0 |
| DOCS-1/2 | CHANGELOG, LICENSE, last_verified frontmatter | ✅ v0.16.0 |
| 14 | Ghost Activation — wire TreatyVerifier; surface last_verified | ✅ v0.17.0 |
| 15 | QA-3 Evals — `bo_overall`, `conduit_risk`, golden dataset (9 cases), eval harness | ✅ v0.18.0 |
| DOCS-3 | Documentation polish — CONTRIBUTING.md, docs index, FAQ, README badges | ✅ v0.19.0 |
| 16 | Legal Source Hierarchy — `source_type` filter on RAG tool; `legal_hierarchy` in Citation | ✅ v0.19.0 |
| 17 | Confidence UX + HITL — `DRAFT ONLY` banner + grey-out; `bo_overall` badge; conduit risk banner; force-draft on UNCERTAIN/LOW | ✅ v0.20.0 |
| — | Data & Planning (v0.20.1) | Golden Dataset v2.0: 22 new cases (09–31); taxonomy, legal sources registry updated | ✅ v0.20.1 |
| 18 | UC2 Third-party Vendor Workflow | `classify_vendor_risk` tool; risk-routing goal; progressive document checklist (LOW/MEDIUM/HIGH); no-DDQ path | ✅ v0.21.0 |
| 19 | Due Diligence Module + Negative Evidence Gate | `check_due_diligence` tool; `DdGapAnalysis` on `WhtReport`; Negative Evidence Gate (INSUFFICIENT → LOW) | ✅ v0.22.0 |
| QA-4 | Eval Harness v2.0 | active/scaffold status filter; `sttr_topup_applies` + `rate_basis`; EU27 rates corrected | ✅ v0.23.0 |
| **20** | **Data Quality Pass** | Verify top-10 treaty rates; `verified: true` in treaties.json — 80/20: Luxembourg, Germany, France, Netherlands, Ireland first | **Next** |
| 21–22 | Batch Processing + Temporal Context + Production Hardening | Batch CSV; `payment_year`; session persistence; rate limiting |
| 23–26 | Intangibles, GAAR, PIT Expansion (24b), Jurisdiction expansion, WHT v1.0 | Planned |
| 27–29 | Tax OS Foundation — GLOBAL VISION, EU engine, Module 2 | Vision |

**Tests: 326/326 passing. Build: zero errors. Golden Dataset: 31 cases (13 active + 18 EU27 scaffolds).**

---

## Quick start

```bash
# Web UI
npm start
# → browser at http://localhost:3000

# CLI
npm run tax:agent -- --input data/orange_polska_royalty.json

# Tests (no API keys needed)
npm test         # 314/314 tests, ~5s
npm run build    # TypeScript type-check — zero errors required

# Code quality
npm run lint                    # ESLint + Prettier
npm run test:coverage           # c8 coverage report

# Golden dataset evaluation (requires OPENAI_API_KEY)
# NOTE: Only cases 01–08b are currently active in the harness (v2.0 harness pending QA-4)
npm run eval                    # run 9-case eval harness with Triangulation Rule

# Optional — requires GEMINI_API_KEY
npm run verify:treaties         # batch-verify treaty rates via Gemini

# Registry management
npm run review:list             # list all draft-status registry entries
```

Environment variables: `OPENAI_API_KEY` (required), `GEMINI_API_KEY` (optional — enables FactChecker + TreatyVerifier).

---

## Wiki pages

| Page | Contents |
|---|---|
| [[Tax Taxonomy]] | Controlled vocabulary for Polish WHT — concepts, Polish/English terms, RAG keywords |
| [[Legal Sources]] | All authoritative sources used in the agent with verification status |
| [[WHT Legal Framework]] | The 3-condition BO test, Art. 4a pkt 29, MLI PPT, EU Directives, Pay and Refund |
| [[Architecture]] | GAME/MATE framework, agent design, multi-agent topology, data flows |
| [[Phase Roadmap]] | Detailed description of each phase, decisions made, and planned phases |
| [[How to Run]] | Full developer and non-developer setup instructions |

---

## Repository

[github.com/fmochnacz-roul-duke/tax-agent-ai](https://github.com/fmochnacz-roul-duke/tax-agent-ai)

Author: Franciszek Mochnacz — MBA / AI & Digital Transformation research project, Vanderbilt University
