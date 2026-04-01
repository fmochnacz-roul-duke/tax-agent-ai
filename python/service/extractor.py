# ─────────────────────────────────────────────────────────────────────────────
# extractor.py — LLM extraction logic for substance and DEMPE analysis
#
# Two public functions:
#   extract_substance(req) → SubstanceResult
#   extract_dempe(req)     → DempeResult
#
# Both use OpenAI's structured output API (client.beta.chat.completions.parse).
# The Pydantic model is passed as response_format — OpenAI generates a JSON
# Schema from it and constrains the model output to match that schema exactly.
# This means we never get a ParseError from a malformed LLM response.
#
# Why structured outputs instead of JSON mode?
#   JSON mode (response_format={"type": "json_object"}) only guarantees valid
#   JSON — the shape can still be wrong. Structured outputs guarantee the exact
#   schema is followed, including all required fields and enum constraints.
#
# Model used: OPENAI_MODEL_POWERFUL (defaults to gpt-4o).
#   Extraction requires genuine legal reasoning — gpt-4o-mini is not reliable
#   enough for the Art. 4a pkt 29 three-condition test.
# ─────────────────────────────────────────────────────────────────────────────

import os
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

from .models import SubstanceResult, DempeResult, SubstanceRequest, DempeRequest

# Load .env from the project root (two levels above this file: python/service/ → project/)
load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env")

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL  = os.getenv("OPENAI_MODEL_POWERFUL", "gpt-4o")

# ── System prompts ─────────────────────────────────────────────────────────────
#
# These are carefully worded to produce legally-grounded extractions.
# The substance prompt references the exact MF Objaśnienia §2.2.1 and §2.3
# sections so the LLM applies the right framework.

SUBSTANCE_SYSTEM = """\
You are a Polish tax specialist performing an economic substance analysis for \
withholding tax (WHT) purposes under Art. 4a pkt 29 of the Polish CIT Act and \
the MF Objaśnienia podatkowe z 3 lipca 2025 r. (Ministry of Finance guidance).

Your task: read the Due Diligence Questionnaire (DDQ) provided and extract \
substance evidence. Then assess the three cumulative Beneficial Owner (BO) conditions:

  1. Own benefit (Art. 4a pkt 29 lit. a CIT) — entity receives income for its own \
account and exercises economic dominion over it (MF Objaśnienia §2.2.1)
  2. Not conduit (Art. 4a pkt 29 lit. b CIT) — no contractual OR factual obligation \
to pass on the payment to another entity (MF Objaśnienia §2.2.1)
  3. Genuine business activity (Art. 4a pkt 29 lit. c CIT) — entity conducts genuine \
business operations in its country of residence (MF Objaśnienia §2.3)

Assessment rules:
- Be objective. Base all fields on evidence found in the DDQ.
- When information is absent, set 'present: false' (for factors) or 'present: true' \
(for conduit indicators that you cannot rule out) and explain in the note/evidence field.
- Confidence:
    HIGH   → DDQ explicitly addresses all six substance factors AND all three BO conditions
    MEDIUM → Most factors addressed but some gaps remain
    LOW    → DDQ is sparse, covers fewer than four substance factors, or is missing key BO evidence
- substance_tier logic:
    STRONG  → All six factors present, no conduit red flags
    ADEQUATE → Four or more factors present, at most one minor red flag
    WEAK    → Fewer than four factors present, or at least one significant red flag
    CONDUIT → Majority of conduit red flags present, minimal own substance
"""

DEMPE_SYSTEM = """\
You are a Polish tax specialist performing a DEMPE analysis for transfer pricing \
and WHT purposes under OECD BEPS Actions 8–10 and the OECD Transfer Pricing \
Guidelines Chapter VI (2022).

DEMPE stands for: Development, Enhancement, Maintenance, Protection, Exploitation \
of intangible property. The entity that actually controls DEMPE functions and bears \
the associated economic risks is the true economic owner of the IP, and therefore \
the beneficial owner of the royalty income it generates.

Your task: read the DDQ document provided. For each of the five DEMPE functions, \
describe what the DDQ says about who controls that function — use direct evidence \
from the DDQ, not general assumptions.

Then assess:
- control_test: does the entity make key DEMPE decisions (approve R&D budgets, set \
  licence terms, control IP strategy)? Format: 'PASS — <evidence>' or 'FAIL — <evidence>'.
- risk_bearing: who bears IP development risk (obsolescence, failed R&D) and \
  exploitation risk (licensees not paying, IP losing value)?
- beneficial_owner_dempe: overall DEMPE BO conclusion — STRONG / MODERATE / WEAK — \
  with explanation.
- art12_scope_warning: ALWAYS include this field. Remind the reader to: (1) verify \
  the applicable treaty has an Art. 12 royalties article, (2) confirm the payment falls \
  within its definition of 'royalties', (3) note that if Art. 12 is absent the income \
  falls to Art. 7 Business Profits and Poland has no WHT right unless the recipient \
  has a Polish permanent establishment.
"""


# ── Extraction functions ───────────────────────────────────────────────────────

def extract_substance(req: SubstanceRequest) -> SubstanceResult:
    """
    Send the DDQ to OpenAI and extract a structured SubstanceResult.

    Uses client.beta.chat.completions.parse — the response_format parameter
    accepts a Pydantic model class and OpenAI constrains its output to match
    the generated JSON Schema exactly. The parsed attribute of the response
    is already a SubstanceResult instance (no manual JSON parsing needed).
    """
    completion = client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": SUBSTANCE_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Entity: {req.entity_name}\n"
                    f"Country: {req.country}\n\n"
                    f"Due Diligence Questionnaire:\n"
                    f"{'─' * 60}\n"
                    f"{req.ddq_text}\n"
                    f"{'─' * 60}"
                ),
            },
        ],
        response_format=SubstanceResult,
    )

    result = completion.choices[0].message.parsed
    if result is None:
        # This should never happen with structured outputs — the API raises before
        # returning None — but we guard against it to keep the type checker happy.
        raise ValueError("OpenAI returned no structured output for substance extraction")

    # Override the source field to make clear this came from real DDQ data
    result.source = (
        f"DDQ extraction via OpenAI {MODEL} — "
        f"based on real Due Diligence Questionnaire document"
    )
    return result


def extract_dempe(req: DempeRequest) -> DempeResult:
    """
    Send the DDQ to OpenAI and extract a structured DempeResult.
    Same mechanism as extract_substance — structured outputs guarantee schema compliance.
    """
    completion = client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": DEMPE_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Entity: {req.entity_name}\n"
                    f"Country: {req.country}\n"
                    f"IP type: {req.ip_type}\n\n"
                    f"Due Diligence Questionnaire:\n"
                    f"{'─' * 60}\n"
                    f"{req.ddq_text}\n"
                    f"{'─' * 60}"
                ),
            },
        ],
        response_format=DempeResult,
    )

    result = completion.choices[0].message.parsed
    if result is None:
        raise ValueError("OpenAI returned no structured output for DEMPE extraction")

    result.source = (
        f"DEMPE extraction via OpenAI {MODEL} — "
        f"based on real Due Diligence Questionnaire document"
    )
    return result
