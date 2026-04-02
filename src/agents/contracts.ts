// ─────────────────────────────────────────────────────────────────────────────
// contracts.ts — Zod schemas for Python DDQ service output shapes
//
// PURPOSE
// -------
// The Python DDQ extraction service (python/service/) returns JSON that
// TypeScript consumes without any runtime validation.  If the Pydantic models
// and the TypeScript interfaces drift apart, the agent silently processes wrong
// data — wrong substance tier, missing BO conditions, null where a string was
// expected.
//
// These Zod schemas are the TypeScript side of the contract:
//   - SubstanceResultSchema  — what TypeScript EXPECTS from POST /substance
//   - DempeResultSchema      — what TypeScript EXPECTS from POST /dempe
//
// The derived types (SubstanceResult, DempeResult) replace the inline
// interface definitions scattered through WhtEnvironment.ts and give the
// DempeResult shape a formal TypeScript type for the first time.
//
// CONTRACT TESTS
// --------------
// src/agents/contract.test.ts validates two things:
//   1. The WhtEnvironment simulation output satisfies these schemas
//      (catches TypeScript-side regressions — someone broke the simulation)
//   2. The Python JSON Schema snapshot (python/service/contract.json) has the
//      same top-level field names and enum values as these schemas
//      (catches Python-side drift — someone changed a Pydantic model)
//
// To regenerate the Python snapshot after an intentional model change:
//   npm run test:contract:update
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ── Shared building-block schemas ─────────────────────────────────────────────

// A single substance criterion — present/absent + supporting note.
// Mirrors Python SubstanceFactor.
const SubstanceFactorSchema = z.object({
  present: z.boolean(),
  note: z.string(),
});

// Employee factor — extends SubstanceFactor with an optional headcount.
// count is null (not undefined) when the DDQ does not disclose a number.
// Mirrors Python EmployeeFactor.
const EmployeeFactorSchema = z.object({
  present: z.boolean(),
  note: z.string(),
  count: z.number().int().nullable(),
});

// Physical office presence — adds own_premises to distinguish owned vs. rented.
// Mirrors Python PhysicalOfficeFactor.
const PhysicalOfficeFactorSchema = z.object({
  present: z.boolean(),
  own_premises: z.boolean(),
  note: z.string(),
});

// Conduit red flag — present/absent + supporting evidence from DDQ.
// Mirrors Python ConduitIndicator.
const ConduitIndicatorSchema = z.object({
  present: z.boolean(),
  evidence: z.string(),
});

// One of the three BO conditions — result and explanation.
// Mirrors Python BoCondition.
const BoConditionSchema = z.object({
  result: z.enum(['PASS', 'FAIL', 'UNCERTAIN']),
  note: z.string(),
});

// ── SubstanceResultSchema ─────────────────────────────────────────────────────
//
// Full substance profile returned by POST /substance.
// Every field here must also exist in Python's SubstanceResult Pydantic model
// (python/service/models.py) — the contract test enforces this.

export const SubstanceResultSchema = z.object({
  entity: z.string(),
  country: z.string(),

  // Archetypal entity classification derived from DDQ content.
  // These five values must match Python's Literal type exactly.
  entity_type: z.enum([
    'large_operating_company',
    'ip_holdco',
    'holding_company',
    'shell_company',
    'unknown',
  ]),

  // Six universal substance criteria from MF Objaśnienia §2.3.
  substance_factors: z.object({
    employees: EmployeeFactorSchema,
    physical_office: PhysicalOfficeFactorSchema,
    management_independence: SubstanceFactorSchema,
    own_assets: SubstanceFactorSchema,
    operating_costs: SubstanceFactorSchema,
    own_capital_financing: SubstanceFactorSchema,
  }),

  // Four conduit red flags from MF Objaśnienia §2.2.1.
  conduit_indicators: z.object({
    pass_through_obligation: ConduitIndicatorSchema,
    rapid_forwarding: ConduitIndicatorSchema,
    nominal_margin: ConduitIndicatorSchema,
    capital_insufficiency: ConduitIndicatorSchema,
  }),

  // Aggregate substance risk level.
  substance_tier: z.enum(['STRONG', 'ADEQUATE', 'WEAK', 'CONDUIT']),

  // Three-condition BO test (Art. 4a pkt 29 CIT).
  bo_preliminary: z.object({
    condition_1_own_benefit: BoConditionSchema,
    condition_2_not_conduit: BoConditionSchema,
    condition_3_genuine_activity: BoConditionSchema,
    overall: z.enum(['PASS', 'FAIL', 'UNCERTAIN']),
    legal_basis: z.string(),
  }),

  // Data quality rating for this analysis.
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  confidence_note: z.string(),
  source: z.string(),
});

// SubstanceResult is derived from the schema — same type, single definition.
// z.infer<T> reads the schema structure at compile time and produces the
// equivalent TypeScript type automatically.
export type SubstanceResult = z.infer<typeof SubstanceResultSchema>;

// ── DempeResultSchema ─────────────────────────────────────────────────────────
//
// DEMPE analysis result returned by POST /dempe.
// NOTE: This is the first formal TypeScript definition of this type.
// The Python side (DempeResult in models.py) existed since Phase 6;
// TypeScript only had the inline simulation object in WhtEnvironment.ts.
// This schema closes that gap.

export const DempeResultSchema = z.object({
  entity: z.string(),
  country: z.string(),
  ip_type: z.string(),

  // DEMPE function descriptions extracted from DDQ.
  dempe_functions: z.object({
    development: z.string(),
    enhancement: z.string(),
    maintenance: z.string(),
    protection: z.string(),
    exploitation: z.string(),
  }),

  // Free-text assessments — format is "PASS — ..." or "FAIL — ..."
  control_test: z.string(),
  risk_bearing: z.string(),
  beneficial_owner_dempe: z.string(),

  // Critical Art. 12 scope reminder — always present, never empty.
  art12_scope_warning: z.string(),

  source: z.string(),
});

// DempeResult — the TypeScript type for DEMPE analysis output.
export type DempeResult = z.infer<typeof DempeResultSchema>;
