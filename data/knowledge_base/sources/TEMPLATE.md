---
source_id: REPLACE-WITH-ID-FROM-LEGAL-SOURCES-REGISTRY
language: pl
module_relevance: [WHT]
concept_ids: [beneficial_owner, condition_i_economic_title]
---

# Document Title (optional — not a chunk boundary, skipped by the Chunker)

Optional introductory text that comes before the first ## section.
This becomes a "preamble" chunk if it contains non-empty content.

## §X.X Section Title

[Paste the exact text of this section from the official source here.
Do not paraphrase or summarise — keep the original legal language.
The LLM will cite this text verbatim in its conclusions.]

## §X.Y Another Section

[Another section of the same document.
Each ## heading starts a new chunk.
All chunks from this file inherit the concept_ids listed in the frontmatter above.]

### §X.Y.1 Subsection

[H3 headings also start new chunks.
Use H3 for sub-sections within a major section.
Use a separate file if the sub-sections have different concept_ids.]

---
HOW TO USE THIS TEMPLATE
─────────────────────────
1. Copy this file and rename it to match the source_id:
     PL-CIT-2026.md          — CIT Act relevant articles
     MF-OBJ-2025.md          — MF Objaśnienia (full text)
     EU-IR-DIR-2003-49-EC.md — Interest & Royalties Directive
     OECD-TP-GL-CH6.md       — OECD TP Guidelines Chapter VI

2. Fill in the frontmatter:
     source_id       — must match an ID in data/legal_sources_registry.json
     language        — "pl" for Polish, "en" for English
     module_relevance — [WHT] for this project; add [TP_screening] etc. for future modules
     concept_ids     — IDs from data/tax_taxonomy.json that this document covers

3. For finer concept_id tagging:
     Create one file per major section (e.g. MF-OBJ-2025-§2.2.md, MF-OBJ-2025-§2.3.md)
     with a narrow concept_ids list in each frontmatter.
     The Chunker will still split at ## headings within each file.

4. Run: npm run rag:build
     This chunks all .md files in this directory (except files starting with TEMPLATE)
     and embeds them using the OpenAI Embeddings API.
     Output is written to data/knowledge_base/chunks/ and data/knowledge_base/embeddings/.

5. NEVER edit the generated files in chunks/ or embeddings/ manually.
   Always edit the source .md files and re-run rag:build.
---
