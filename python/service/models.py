# ─────────────────────────────────────────────────────────────────────────────
# models.py — Pydantic models for the DDQ extraction service
#
# These models mirror the TypeScript interfaces in WhtEnvironment.ts exactly:
#   SubstanceResult  ← checkEntitySubstance return type
#   DempeResult      ← analyseDempe return type
#
# Pydantic v2 uses these for two purposes:
#   1. FastAPI request/response validation and OpenAPI schema generation
#   2. Structured output schema passed to OpenAI — the LLM must return JSON
#      that matches the model exactly (enforced by the API)
#
# Why Literal types?
#   Pydantic Literal["A", "B"] maps to a JSON Schema enum, which OpenAI uses
#   to constrain which string values the model can output.
# ─────────────────────────────────────────────────────────────────────────────

from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── Shared building blocks ─────────────────────────────────────────────────────

class SubstanceFactor(BaseModel):
    """A single substance criterion from MF Objaśnienia §2.3."""
    present: bool = Field(description="True if this factor supports BO status")
    note: str    = Field(description="Evidence from DDQ or explanation of absence")


class EmployeeFactor(SubstanceFactor):
    """Extends SubstanceFactor with headcount (may be None if DDQ does not disclose)."""
    count: Optional[int] = Field(
        default=None,
        description="Number of employees; null when DDQ does not disclose a number"
    )


class PhysicalOfficeFactor(BaseModel):
    """Physical presence factor — own_premises distinguishes owned vs. rented office."""
    present:      bool = Field(description="True if entity has a physical office")
    own_premises: bool = Field(description="True if premises are owned or long-term leased")
    note: str          = Field(description="Evidence from DDQ")


class ConduitIndicator(BaseModel):
    """A conduit red flag from MF Objaśnienia §2.2.1."""
    present:  bool = Field(description="True if this red flag is present")
    evidence: str  = Field(description="Evidence from DDQ supporting the assessment")


class BoCondition(BaseModel):
    """One of the three cumulative BO conditions under Art. 4a pkt 29 CIT."""
    result: Literal["PASS", "FAIL", "UNCERTAIN"] = Field(
        description="Binary result: PASS if condition is met, FAIL if not, UNCERTAIN if DDQ is insufficient"
    )
    note: str = Field(description="Explanation citing DDQ evidence")


# ── Nested grouping models ─────────────────────────────────────────────────────

class SubstanceFactors(BaseModel):
    """Six universal substance criteria from MF Objaśnienia §2.3."""
    employees:               EmployeeFactor
    physical_office:         PhysicalOfficeFactor
    management_independence: SubstanceFactor
    own_assets:              SubstanceFactor
    operating_costs:         SubstanceFactor
    own_capital_financing:   SubstanceFactor


class ConduitIndicators(BaseModel):
    """Four conduit red flags from MF Objaśnienia §2.2.1."""
    pass_through_obligation: ConduitIndicator
    rapid_forwarding:        ConduitIndicator
    nominal_margin:          ConduitIndicator
    capital_insufficiency:   ConduitIndicator


class BoPreliminary(BaseModel):
    """Preliminary three-condition BO test result (Art. 4a pkt 29 CIT)."""
    condition_1_own_benefit:      BoCondition
    condition_2_not_conduit:      BoCondition
    condition_3_genuine_activity: BoCondition
    overall: Literal["PASS", "FAIL", "UNCERTAIN"] = Field(
        description="FAIL if ANY single condition fails; UNCERTAIN if any condition is UNCERTAIN and none fail"
    )
    legal_basis: str = Field(
        description="Cite the legal provisions assessed (Art. 4a pkt 29 CIT, MF Objaśnienia 2025)"
    )


class DempeFunctions(BaseModel):
    """DEMPE function descriptions extracted from DDQ."""
    development:  str = Field(description="Who directs R&D strategy and controls investment decisions?")
    enhancement:  str = Field(description="Who manages brand/technology improvement programmes?")
    maintenance:  str = Field(description="Who maintains IP registrations and handles renewals?")
    protection:   str = Field(description="Who enforces IP rights and manages litigation?")
    exploitation: str = Field(description="Who negotiates and signs licence agreements?")


# ── Top-level result models ────────────────────────────────────────────────────

class SubstanceResult(BaseModel):
    """
    Full substance profile — mirrors TypeScript SubstanceResult interface.
    Returned by POST /substance.
    """
    entity:       str = Field(description="Entity name as provided in the request")
    country:      str = Field(description="Country of registration")
    entity_type:  Literal[
        "large_operating_company",
        "ip_holdco",
        "holding_company",
        "shell_company",
        "unknown",
    ] = Field(description="Archetypal entity classification derived from DDQ content")

    substance_factors:  SubstanceFactors
    conduit_indicators: ConduitIndicators
    substance_tier: Literal["STRONG", "ADEQUATE", "WEAK", "CONDUIT"] = Field(
        description=(
            "STRONG: all six factors present, no red flags. "
            "ADEQUATE: most factors present, minor gaps. "
            "WEAK: significant gaps or some red flags. "
            "CONDUIT: entity appears to be a pass-through with minimal own substance."
        )
    )
    bo_preliminary: BoPreliminary

    confidence: Literal["HIGH", "MEDIUM", "LOW"] = Field(
        description=(
            "HIGH: DDQ explicitly covers all six substance factors and all three BO conditions. "
            "MEDIUM: most factors addressed but some gaps. "
            "LOW: DDQ is sparse or missing key evidence."
        )
    )
    confidence_note: str = Field(description="Explanation of the confidence rating")
    source: str          = Field(description="Data source description (set by the extractor)")


class DempeResult(BaseModel):
    """
    DEMPE analysis result — mirrors TypeScript DempeResult shape.
    Returned by POST /dempe.
    """
    entity:   str = Field(description="Entity name as provided in the request")
    country:  str = Field(description="Country of registration")
    ip_type:  str = Field(description="Type of intangible (brand, technology, patent, etc.)")

    dempe_functions: DempeFunctions

    control_test: str = Field(
        description=(
            "Assessment of whether the entity makes key DEMPE decisions. "
            "Format: 'PASS — ...' or 'FAIL — ...' with supporting evidence from DDQ."
        )
    )
    risk_bearing: str = Field(
        description="Assessment of who bears IP development risk and exploitation risk"
    )
    beneficial_owner_dempe: str = Field(
        description="Overall DEMPE-based BO conclusion (STRONG / MODERATE / WEAK) with explanation"
    )
    art12_scope_warning: str = Field(
        description=(
            "CRITICAL flag: remind the reader to verify the treaty has an Art. 12 royalties "
            "article and that it covers this payment type. Mention the Art. 7 fallback."
        )
    )
    source: str = Field(description="Data source description (set by the extractor)")


# ── Request models ─────────────────────────────────────────────────────────────

class SubstanceRequest(BaseModel):
    """Input for POST /substance."""
    entity_name: str = Field(description="Full legal name of the entity")
    country:     str = Field(description="Country of registration")
    ddq_text:    str = Field(description="Full text content of the Due Diligence Questionnaire")


class DempeRequest(BaseModel):
    """Input for POST /dempe."""
    entity_name: str = Field(description="Full legal name of the entity")
    country:     str = Field(description="Country of registration")
    ip_type:     str = Field(description="Type of intangible: brand, technology, patent, software, know_how, or mixed")
    ddq_text:    str = Field(description="Full text content of the Due Diligence Questionnaire")
