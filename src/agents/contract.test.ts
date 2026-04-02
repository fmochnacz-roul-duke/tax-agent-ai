// ─────────────────────────────────────────────────────────────────────────────
// Python/TypeScript contract tests
//
// These tests guard against schema drift between the Python Pydantic models
// (python/service/models.py) and the TypeScript Zod schemas (contracts.ts).
//
// TWO CATEGORIES
// --------------
//
// Category A — TypeScript simulation is internally consistent
//   WhtEnvironment.checkEntitySubstance() and analyseDempe() return inline JSON
//   in simulate mode.  These tests parse that JSON through the Zod schemas and
//   assert it validates.  A failure here means someone broke the simulation
//   output in WhtEnvironment.ts without updating the schema.
//
// Category B — Python models match the TypeScript schema
//   python/service/contract.json is a JSON Schema snapshot generated from the
//   Pydantic models by running:  npm run test:contract:update
//
//   These tests compare:
//     - Top-level required field names: Python `required[]` vs. Zod shape keys
//     - Key enum values: substance_tier, confidence, entity_type, bo_preliminary.overall
//
//   A failure here means someone changed a Pydantic model and did not update the
//   TypeScript Zod schema (or vice versa).  Re-run the contract update script,
//   inspect the diff, and align both sides before committing.
//
// HOW TO UPDATE AFTER AN INTENTIONAL MODEL CHANGE
// ------------------------------------------------
//   npm run test:contract:update   ← regenerates python/service/contract.json
//   npm test                       ← verify both sides now agree
//   git add python/service/contract.json src/agents/contracts.ts
// ─────────────────────────────────────────────────────────────────────────────

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { WhtEnvironment } from './WhtEnvironment';
import { SubstanceResultSchema, DempeResultSchema } from './contracts';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parse the JSON string every Environment method returns.
function parseResult(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

// Load the Python JSON Schema snapshot.
// Path: python/service/contract.json, resolved from project root.
const CONTRACT_PATH = path.resolve(__dirname, '..', '..', 'python', 'service', 'contract.json');

interface PythonContract {
  SubstanceResult: {
    properties: Record<string, unknown>;
    required: string[];
  };
  DempeResult: {
    properties: Record<string, unknown>;
    required: string[];
  };
}

function loadContract(): PythonContract {
  assert.ok(
    fs.existsSync(CONTRACT_PATH),
    `python/service/contract.json not found at ${CONTRACT_PATH}.\n` +
      'Run: npm run test:contract:update'
  );
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf-8')) as PythonContract;
}

const env = new WhtEnvironment({ simulate: true });

// ── Category A: TypeScript simulation output validates against Zod schemas ────
//
// These tests call the simulation (no API calls needed) and run the result
// through the Zod schemas.  If the simulation output has changed shape,
// Zod will throw and the test fails with a detailed validation error.

describe('SubstanceResult — simulation output matches Zod schema', () => {
  test('Orange S.A. substance profile validates against SubstanceResultSchema', async () => {
    const raw = await env.checkEntitySubstance('Orange S.A.', 'France');
    const parsed = parseResult(raw);
    // safeParse returns { success, data, error } rather than throwing.
    // We use it here so we can print the full Zod error on failure.
    const result = SubstanceResultSchema.safeParse(parsed);
    assert.ok(
      result.success,
      `Simulation output does not match SubstanceResultSchema:\n${
        result.success ? '' : JSON.stringify(result.error.issues, null, 2)
      }`
    );
  });

  test('Alpine Holdings substance profile validates against SubstanceResultSchema', async () => {
    const raw = await env.checkEntitySubstance('Alpine Holdings S.A.', 'Luxembourg');
    const result = SubstanceResultSchema.safeParse(parseResult(raw));
    assert.ok(
      result.success,
      `Simulation output does not match SubstanceResultSchema:\n${
        result.success ? '' : JSON.stringify(result.error.issues, null, 2)
      }`
    );
  });

  test('Unknown entity (CONDUIT fallback) validates against SubstanceResultSchema', async () => {
    const raw = await env.checkEntitySubstance('Acme Holdings Ltd', 'Cayman Islands');
    const result = SubstanceResultSchema.safeParse(parseResult(raw));
    assert.ok(
      result.success,
      `CONDUIT fallback does not match SubstanceResultSchema:\n${
        result.success ? '' : JSON.stringify(result.error.issues, null, 2)
      }`
    );
  });
});

describe('DempeResult — simulation output matches Zod schema', () => {
  test('Brand ip_type DEMPE output validates against DempeResultSchema', async () => {
    const raw = await env.analyseDempe('Orange S.A.', 'France', 'brand');
    const result = DempeResultSchema.safeParse(parseResult(raw));
    assert.ok(
      result.success,
      `DEMPE simulation output does not match DempeResultSchema:\n${
        result.success ? '' : JSON.stringify(result.error.issues, null, 2)
      }`
    );
  });

  test('Technology ip_type DEMPE output validates against DempeResultSchema', async () => {
    const raw = await env.analyseDempe('SAP SE', 'Germany', 'technology');
    const result = DempeResultSchema.safeParse(parseResult(raw));
    assert.ok(result.success);
  });

  test('DEMPE result includes art12_scope_warning (critical field)', async () => {
    const raw = await env.analyseDempe('Orange S.A.', 'France', 'brand');
    const result = DempeResultSchema.parse(parseResult(raw));
    assert.ok(result.art12_scope_warning.length > 0, 'art12_scope_warning must not be empty');
  });
});

// ── Category B: Python JSON Schema matches TypeScript Zod schema ──────────────
//
// These tests compare the Python Pydantic JSON Schema snapshot against the
// TypeScript Zod schemas — specifically field names and enum values, which are
// the most common sources of drift.

describe('Python/TypeScript contract — SubstanceResult field names', () => {
  test('every field Python requires is present in the TypeScript Zod schema', () => {
    const contract = loadContract();
    const pythonFields = new Set(contract.SubstanceResult.required);
    const tsFields = new Set(Object.keys(SubstanceResultSchema.shape));

    const missingInTs = [...pythonFields].filter((f) => !tsFields.has(f));
    assert.deepEqual(
      missingInTs,
      [],
      `Python requires fields that TypeScript schema is missing: ${missingInTs.join(', ')}\n` +
        'Add them to SubstanceResultSchema in contracts.ts'
    );
  });

  test('every field the TypeScript schema requires is present in the Python model', () => {
    const contract = loadContract();
    const pythonFields = new Set(contract.SubstanceResult.required);
    const tsFields = new Set(Object.keys(SubstanceResultSchema.shape));

    const missingInPython = [...tsFields].filter((f) => !pythonFields.has(f));
    assert.deepEqual(
      missingInPython,
      [],
      `TypeScript schema has fields that Python model does not produce: ${missingInPython.join(', ')}\n` +
        'Either add them to SubstanceResult in models.py or remove from contracts.ts'
    );
  });
});

describe('Python/TypeScript contract — DempeResult field names', () => {
  test('every field Python requires is present in the TypeScript Zod schema', () => {
    const contract = loadContract();
    const pythonFields = new Set(contract.DempeResult.required);
    const tsFields = new Set(Object.keys(DempeResultSchema.shape));

    const missingInTs = [...pythonFields].filter((f) => !tsFields.has(f));
    assert.deepEqual(
      missingInTs,
      [],
      `Python requires fields that TypeScript schema is missing: ${missingInTs.join(', ')}`
    );
  });

  test('every field the TypeScript schema requires is present in the Python model', () => {
    const contract = loadContract();
    const pythonFields = new Set(contract.DempeResult.required);
    const tsFields = new Set(Object.keys(DempeResultSchema.shape));

    const missingInPython = [...tsFields].filter((f) => !pythonFields.has(f));
    assert.deepEqual(
      missingInPython,
      [],
      `TypeScript schema has fields Python does not produce: ${missingInPython.join(', ')}`
    );
  });
});

describe('Python/TypeScript contract — SubstanceResult enum values', () => {
  // For each key enum in SubstanceResult, compare the Python JSON Schema's
  // enum array against the Zod schema's .options array.
  // A mismatch means one side added or renamed a value without updating the other.

  test('substance_tier enum values match between Python and TypeScript', () => {
    const contract = loadContract();
    const pythonEnum = (
      contract.SubstanceResult.properties['substance_tier'] as { enum: string[] }
    ).enum.sort();
    const tsEnum = [...SubstanceResultSchema.shape.substance_tier.options].sort();
    assert.deepEqual(tsEnum, pythonEnum);
  });

  test('confidence enum values match between Python and TypeScript', () => {
    const contract = loadContract();
    const pythonEnum = (
      contract.SubstanceResult.properties['confidence'] as { enum: string[] }
    ).enum.sort();
    const tsEnum = [...SubstanceResultSchema.shape.confidence.options].sort();
    assert.deepEqual(tsEnum, pythonEnum);
  });

  test('entity_type enum values match between Python and TypeScript', () => {
    const contract = loadContract();
    const pythonEnum = (
      contract.SubstanceResult.properties['entity_type'] as { enum: string[] }
    ).enum.sort();
    const tsEnum = [...SubstanceResultSchema.shape.entity_type.options].sort();
    assert.deepEqual(tsEnum, pythonEnum);
  });
});
