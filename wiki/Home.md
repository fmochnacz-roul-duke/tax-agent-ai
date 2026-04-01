# WHT Beneficial Owner Scanner — Wiki

A structured AI agent for Polish withholding tax beneficial owner analysis.

> **Not a substitute for professional judgment.** This tool is a structured research layer — it handles the treaty lookup, legal framework application, substance checklist, and documentation so that a tax professional can focus on the judgment call, not the groundwork.

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

### 1 — Intercompany payment review

Polish entity → related holding / IP / finance company

- Same entities appear every quarter
- Highest due diligence standard (Art. 26 CIT)
- Pay and Refund almost always triggers
- Full substance assessment required
- **Target: any entity assessed via 5-question interview or DDQ upload**

### 2 — Third-party vendor scan

Polish entity → unrelated foreign vendor (software licences, content fees, SaaS)

- New entity on each vendor onboarding
- Lower due diligence standard (residence cert + BO declaration sufficient)
- Risk classification drives document checklist
- **Target: company name + payment type → risk tier → document checklist**

---

## Current status

| Phase | Description | Status |
|---|---|---|
| 1 | Live treaty data — 36 countries, MLI flags | ✅ v0.1.0 |
| 2+3 | Structured CLI input, JSON report output | ✅ v0.3.0 |
| 4 | Entity substance profiles, 3-condition BO test | ✅ v0.4.0 |
| 5 | MATE — model tiering, environment validation | ✅ v0.5.0 |
| 6 | Python DDQ extraction service | ✅ v0.6.0 |
| 7 | FactChecker Agent — Gemini + Google Search | ✅ v0.7.0 |
| 8 | Conversational web UI, SSE streaming | ✅ v0.8.0 |
| 10 | Substance interview — 5-question chat, any entity | ✅ v0.10.0 |
| **9** | **Legal knowledge RAG + tax taxonomy** | 🔄 In progress |
| 11 | Entity registry and profile persistence | Planned |
| 12 | Treaty rate verification + human review workflow | Planned |
| 13 | Third-party vendor workflow | Planned |
| 14 | Batch payment processing | Planned |
| 15+ | Tax AI OS (Pillar Two, TP, PE, CbCR) | Vision |

---

## Quick start

```bash
# Web UI
npm start
# → browser at http://localhost:3000

# CLI
npm run tax:agent -- --input data/orange_polska_royalty.json

# Tests
npm test         # 99/99 tests, ~2s, no API calls
npm run build    # TypeScript type-check
```

Environment variables: `OPENAI_API_KEY` (required), `GEMINI_API_KEY` (optional — enables FactChecker).

---

## Wiki pages

| Page | Contents |
|---|---|
| [[Tax Taxonomy]] | Controlled vocabulary for Polish WHT — concepts, Polish/English terms, RAG keywords |
| [[Legal Sources]] | All authoritative sources used in the agent with verification status |
| [[WHT Legal Framework]] | The 3-condition BO test, Art. 4a pkt 29, MLI PPT, EU Directives, Pay and Refund |
| [[Architecture]] | GAME/MATE framework, agent design, multi-agent topology, data flows |
| [[Phase Roadmap]] | Detailed description of each phase, decisions made, open questions |
| [[How to Run]] | Full developer and non-developer setup instructions |

---

## Repository

[github.com/fmochnacz-roul-duke/tax-agent-ai](https://github.com/fmochnacz-roul-duke/tax-agent-ai)

Author: Franciszek Mochnacz — MBA / AI & Digital Transformation research project, Vanderbilt University
