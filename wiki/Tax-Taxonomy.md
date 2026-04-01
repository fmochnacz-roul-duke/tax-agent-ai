# Tax Taxonomy & Keyword Dictionary

The WHT agent uses a structured controlled vocabulary — the **tax taxonomy** — to ensure that every legal concept is consistently named, defined, and sourced across all components.

**Canonical data file:** [`data/tax_taxonomy.json`](../blob/master/data/tax_taxonomy.json)

---

## What it is

A machine-readable dictionary of ~40 Polish WHT tax concepts. Each entry contains:

| Field | Purpose |
|---|---|
| `id` | Snake-case identifier used in code (`beneficial_owner`, `condition_ii_no_passthrough`) |
| `term_en` / `term_pl` | Canonical English and Polish names |
| `aliases_en` / `aliases_pl` | All known synonyms — used for query expansion before RAG retrieval |
| `definition` | Plain-English definition, legally grounded |
| `legal_source_refs` | IDs from `data/legal_sources_registry.json` — the source of truth |
| `key_provisions` | Exact statutory / guidance references (e.g. `Art. 4a pkt 29 CIT`) |
| `rag_keywords` | Keyword set for vector search — both Polish and English, includes common abbreviations |
| `agent_tool_relevance` | Which agent tools use this concept |
| `interview_question` | For substance concepts: the question the SubstanceInterviewer asks |
| `review_note` | Items flagged for legal review by tax professional |

---

## Categories

### bo_test — The 3-condition beneficial owner test

| Concept | Polish | Provision |
|---|---|---|
| `beneficial_owner` | rzeczywisty właściciel | Art. 4a pkt 29 CIT |
| `condition_i_economic_title` | tytuł prawny i ekonomiczny | Art. 4a pkt 29 lit. a |
| `condition_ii_no_passthrough` | brak obowiązku dalszego przekazania | Art. 4a pkt 29 lit. b |
| `condition_iii_genuine_business` | rzeczywista działalność gospodarcza | Art. 4a pkt 29 lit. c |

All three conditions are **cumulative** — failing any one is sufficient to deny BO status.

---

### entity_classification — Entity types and their substance priors

| Concept | Prior substance tier | WHT risk |
|---|---|---|
| `holding_company` | WEAK | Higher scrutiny |
| `operating_company` | ADEQUATE | Standard scrutiny |
| `ip_holding_company` | WEAK | Higher + DEMPE required |
| `finance_company` | WEAK | Higher — back-to-back risk |
| `conduit_entity` | CONDUIT | Fail — BO test denied |
| `related_party` | — | Triggers Pay and Refund |

The `name_indicators` field on each entity type (e.g. "Holdings", "Finance", "Capital") is used by the agent to pre-classify an entity from its name before the substance interview begins.

---

### substance_factors — MF Objaśnienia §2.3 universal criteria

These are the factual questions assessed in the substance interview (SubstanceInterviewer) and scored by the SubstanceExtractor.

| Concept | Interview question (Mode A) |
|---|---|
| `headcount` | How many employees does this entity have? |
| `physical_office_presence` | What type of office presence does it have? |
| `decision_making_independence` | Are decisions made locally or directed by parent? |
| `own_operating_costs` | What annual operating costs does it incur? |
| `genuine_business_activity` | Overall — does it conduct genuine commercial operations? |
| `economic_risk_bearing` | Does it bear genuine economic risks? |

---

### conduit_indicators — MF Objaśnienia §2.2.1 red flags

These are the specific patterns that indicate a conduit (pass-through) arrangement:

| Concept | Significance |
|---|---|
| `passthrough_obligation_contractual` | Explicit contract to forward — strongest indicator |
| `passthrough_obligation_factual` | De facto forwarding (no contract, but same economic result) |
| `identical_amounts_forwarded` | Receives X, forwards X ± thin margin |
| `no_economic_risk_from_income` | Fully insulated from risk — guaranteed spread |

---

### mli_ppt — MLI anti-avoidance concepts

| Concept | Polish | Source |
|---|---|---|
| `principal_purpose_test` | test głównego celu | MLI Art. 7 |
| `mli_limitation_on_benefits` | ograniczenie korzyści | MLI Art. 10 |
| `treaty_shopping` | treaty shopping | OECD Commentary Art. 1 |

---

### compliance_mechanisms — Polish WHT pathways

| Concept | Rate | Conditions |
|---|---|---|
| `eu_interest_royalties_directive` | 0% | ≥25% shareholding, ≥2 years, EU resident |
| `eu_parent_subsidiary_directive` | 0% | ≥10% shareholding, ≥2 years, EU resident |
| `pay_and_refund` | Statutory (19%/20%) withheld, refund claimed | Related party + PLN 2M+ |
| `gaar_poland` | Denial of preference | Art. 22c CIT — anti-avoidance |

---

## How the taxonomy improves RAG quality

Without the taxonomy, vector retrieval on "is this entity a beneficial owner?" returns chunks with token overlap to those words — noisy and generic.

With the taxonomy:

1. **Query expansion**: the query is expanded with all `rag_keywords` from matched concepts before retrieval. `beneficial_owner` → `rzeczywisty właściciel`, `Art. 4a pkt 29`, `warunek i ii iii`, `podmiot uprawniony`, etc.

2. **Concept-tagged chunks**: when indexing MF Objaśnienia, each chunk is tagged with the concept IDs it covers. `§2.3` → `[headcount, physical_office_presence, decision_making_independence, own_operating_costs]`. Retrieval fetches concepts, not keyword matches.

3. **Coverage scoring**: after the agent produces a conclusion, a coverage checker compares referenced concept IDs against the required set for the entity type. Missing concepts = explicit gaps in the report.

4. **Interview generation**: each `substance_factors` concept has an `interview_question`. New legal criteria added to the taxonomy automatically propagate to the SubstanceInterviewer.

---

## Maintenance

The taxonomy is a living document. When:

- MF publishes updated Objaśnienia → update `definition` and `key_provisions` for affected concepts, update `review_note` status
- A new Tax OS module is added → add `module_relevance` entries for concepts that apply
- A new legal concept is identified in case law → add a new concept entry with `legal_source_refs` pointing to the case

**Review notes** (`review_note` field) mark concepts where the legal accuracy needs confirmation from the tax professional. All items should be resolved before Phase 9 RAG goes into production.
