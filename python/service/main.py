# ─────────────────────────────────────────────────────────────────────────────
# main.py — FastAPI DDQ extraction service
#
# Two endpoints replace the simulated WhtEnvironment methods:
#   POST /substance  →  checkEntitySubstance (TypeScript)
#   POST /dempe      →  analyseDempe (TypeScript)
#
# The TypeScript agent calls these when DDQ_SERVICE_URL is set in .env AND
# a ddq_path is provided in the input JSON. If the service is unreachable,
# WhtEnvironment falls back to the hardcoded simulation silently.
#
# How to start:
#   From the project root:
#       python python/run.py
#   Or directly:
#       cd python && uvicorn service.main:app --reload --port 8000
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import FastAPI, HTTPException

from .models import SubstanceRequest, DempeRequest, SubstanceResult, DempeResult
from .extractor import extract_substance, extract_dempe

app = FastAPI(
    title="DDQ Extraction Service",
    description=(
        "Extracts structured substance and DEMPE evidence from Due Diligence "
        "Questionnaires using OpenAI structured outputs. Designed to replace "
        "simulated data in the Polish WHT Beneficial Owner Agent (Phase 6)."
    ),
    version="1.0.0",
)


@app.get("/health")
def health() -> dict:
    """Liveness check — returns 200 OK if the service is running."""
    return {"status": "ok", "service": "DDQ Extraction Service v1.0.0"}


@app.post("/substance", response_model=SubstanceResult)
def substance(req: SubstanceRequest) -> SubstanceResult:
    """
    Extract a structured substance profile from a DDQ document.

    The result mirrors the SubstanceResult TypeScript interface:
    - substance_factors: six MF Objaśnienia §2.3 criteria
    - conduit_indicators: four MF Objaśnienia §2.2.1 red flags
    - substance_tier: STRONG / ADEQUATE / WEAK / CONDUIT
    - bo_preliminary: three-condition BO test result
    - confidence: HIGH / MEDIUM / LOW

    Called by WhtEnvironment.checkEntitySubstance() when DDQ_SERVICE_URL is set.
    """
    try:
        return extract_substance(req)
    except Exception as exc:
        # Return HTTP 500 so the TypeScript caller falls back to simulation
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/dempe", response_model=DempeResult)
def dempe(req: DempeRequest) -> DempeResult:
    """
    Extract a structured DEMPE analysis from a DDQ document.

    The result mirrors the TypeScript DempeResult shape:
    - dempe_functions: Development / Enhancement / Maintenance / Protection / Exploitation
    - control_test: PASS/FAIL assessment of DEMPE decision control
    - risk_bearing: who bears IP development and exploitation risk
    - beneficial_owner_dempe: overall DEMPE BO conclusion
    - art12_scope_warning: critical Art. 12 scope verification reminder

    Called by WhtEnvironment.analyseDempe() when DDQ_SERVICE_URL is set.
    """
    try:
        return extract_dempe(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
