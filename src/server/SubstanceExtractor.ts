// ─────────────────────────────────────────────────────────────────────────────
// SubstanceExtractor — Phase 10
//
// Converts a DDQ text (from the SubstanceInterviewer or a file) into a
// structured SubstanceResult JSON string using OpenAI — without the Python
// extraction service.
//
// WHY THIS EXISTS
// ---------------
// The Python DDQ service (Phase 6) does the same job via Pydantic + OpenAI
// structured outputs, but it requires:
//   a) Python installed + `npm run ddq:service` running
//   b) DDQ_SERVICE_URL set in .env
//
// The SubstanceExtractor is a pure TypeScript equivalent — always available
// as a fallback when the Python service is absent.
//
// CALL ORDER in WhtEnvironment.checkEntitySubstance():
//   1. Python service (if DDQ_SERVICE_URL + ddqText present)          ← Phase 6
//   2. TypeScript SubstanceExtractor (if ddqText present, no service) ← Phase 10 (this file)
//   3. Hardcoded profile simulation (buildEntityProfile)              ← Phase 4 fallback
//
// OUTPUT
// ------
// Returns a JSON string matching the SubstanceResult shape defined in
// WhtEnvironment.ts. The string is returned directly by checkEntitySubstance()
// so the agent stores it verbatim as a finding.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

// ── System prompt ─────────────────────────────────────────────────────────────
//
// The prompt describes the full SubstanceResult JSON structure and the legal
// framework the model must apply. It uses the powerful model because this is
// multi-condition legal reasoning (Art. 4a pkt 29 CIT three-condition BO test
// + MF Objaśnienia §2.2–2.3 substance criteria).

const SYSTEM_PROMPT = `\
You are a Polish tax law specialist analysing entity substance for withholding tax (WHT) purposes.
You must evaluate the provided Due Diligence Questionnaire (DDQ) text and return a JSON object
that represents a structured SubstanceResult.

LEGAL FRAMEWORK YOU MUST APPLY
───────────────────────────────
Art. 4a pkt 29 of the Polish CIT Act defines "beneficial owner" as an entity that:
  Condition (i):  receives income for its OWN benefit — has economic dominion over the payment
  Condition (ii): is NOT an intermediary, agent, nominee, or conduit obliged to pass the income on
  Condition (iii) [related parties]: carries out GENUINE ECONOMIC ACTIVITY in its country of residence

MF Objaśnienia podatkowe z 3 lipca 2025 r. (Ministry of Finance guidance):
  §2.2.1 — Conduit red flags: pass-through obligation, rapid forwarding, nominal margin, capital insufficiency
  §2.3   — Substance factors: employees, physical office, management independence, own assets, operating costs, capital financing

REQUIRED JSON OUTPUT STRUCTURE
───────────────────────────────
Return ONLY the following JSON object — no prose, no markdown fences:

{
  "entity": "<entity name>",
  "country": "<country name>",
  "entity_type": "<one of: large_operating_company | ip_holdco | holding_company | shell_company | unknown>",

  "substance_factors": {
    "employees": {
      "present": <true | false>,
      "count":   <number or null if unknown>,
      "note":    "<brief explanation>"
    },
    "physical_office": {
      "present":      <true | false>,
      "own_premises": <true | false — true if they own/lease real office, false if nominee address>,
      "note":         "<brief explanation>"
    },
    "management_independence": {
      "present": <true | false — true if decisions made locally, not dictated by parent>,
      "note":    "<brief explanation>"
    },
    "own_assets": {
      "present": <true | false — true if entity holds own assets, not merely title for group>,
      "note":    "<brief explanation>"
    },
    "operating_costs": {
      "present": <true | false — true if incurs real operating costs from own funds>,
      "note":    "<brief explanation>"
    },
    "own_capital_financing": {
      "present": <true | false — true if funded by own capital, not back-to-back borrowing>,
      "note":    "<brief explanation>"
    }
  },

  "conduit_indicators": {
    "pass_through_obligation": {
      "present":  <true | false — true = RED FLAG>,
      "evidence": "<what in the DDQ text supports this finding>"
    },
    "rapid_forwarding": {
      "present":  <true | false>,
      "evidence": "<what in the DDQ text supports this finding>"
    },
    "nominal_margin": {
      "present":  <true | false>,
      "evidence": "<what in the DDQ text supports this finding>"
    },
    "capital_insufficiency": {
      "present":  <true | false>,
      "evidence": "<what in the DDQ text supports this finding>"
    }
  },

  "substance_tier": "<STRONG | ADEQUATE | WEAK | CONDUIT>",

  "bo_preliminary": {
    "condition_1_own_benefit": {
      "result": "<PASS | FAIL | UNCERTAIN>",
      "note":   "<cite DDQ text or explain why uncertain>"
    },
    "condition_2_not_conduit": {
      "result": "<PASS | FAIL | UNCERTAIN>",
      "note":   "<cite DDQ text>"
    },
    "condition_3_genuine_activity": {
      "result": "<PASS | FAIL | UNCERTAIN>",
      "note":   "<cite DDQ text>"
    },
    "overall":     "<PASS | FAIL | UNCERTAIN>",
    "legal_basis": "Art. 4a pkt 29 Polish CIT Act; MF Objaśnienia podatkowe 2025"
  },

  "confidence": "<HIGH | MEDIUM | LOW>",
  "confidence_note": "<brief note on what data is present and what is missing>",
  "source": "ddq_interview_typescript_extractor"
}

SUBSTANCE_TIER RULES
────────────────────
  STRONG  — 5-6 substance factors present, no conduit indicators, all 3 conditions PASS
  ADEQUATE — 3-4 substance factors present, at most 1 conduit indicator, all conditions PASS/UNCERTAIN
  WEAK    — 1-2 substance factors, some conduit indicators, at least 1 condition UNCERTAIN
  CONDUIT — 0-1 substance factors, pass-through obligation or rapid forwarding present, condition (ii) FAIL

CONFIDENCE RULES
────────────────
  HIGH   — specific factual data in the DDQ (employee names, office addresses, financial figures)
  MEDIUM — general assertions in the DDQ with some corroborating detail
  LOW    — vague answers, missing information, or self-reported without supporting evidence

If the DDQ text does not provide enough information about a factor, set present: false and
note: "Not mentioned in DDQ." — do not invent information.
`;

// ── SubstanceExtractor class ──────────────────────────────────────────────────

export class SubstanceExtractor {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    // Use the powerful model: multi-condition legal reasoning
    this.model =
      process.env['OPENAI_MODEL_POWERFUL'] ?? process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini';
  }

  // extract() takes the DDQ text and returns a SubstanceResult JSON string.
  //
  // ddqText:    the interview transcript or DDQ document text
  // entityName: passed into the prompt for context
  // country:    passed into the prompt for context
  //
  // Returns a JSON string matching SubstanceResult shape.
  // On any failure, returns a safe CONDUIT/LOW-confidence fallback JSON string.
  async extract(ddqText: string, entityName: string, country: string): Promise<string> {
    const userMessage =
      `Please analyse the following DDQ text for entity "${entityName}" (${country}) ` +
      `and return the SubstanceResult JSON:\n\n${ddqText}`;

    let rawText: string;
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        // json_object mode: the model is guaranteed to return valid JSON.
        // Combined with the detailed schema in the system prompt, this produces
        // a SubstanceResult that can be parsed and used directly.
        response_format: { type: 'json_object' },
        temperature: 0, // legal extraction must be deterministic
      });

      rawText = response.choices[0]?.message?.content ?? '';
      if (!rawText) throw new Error('Empty response from SubstanceExtractor LLM');
    } catch (err) {
      console.error('[SUBSTANCE EXTRACTOR] LLM call failed:', err);
      return this.fallbackResult(entityName, country, String(err));
    }

    // Validate that the response is parseable JSON before returning it.
    // The agent will JSON.parse this string, so we must not return garbage.
    try {
      JSON.parse(rawText);
      return rawText;
    } catch {
      console.error('[SUBSTANCE EXTRACTOR] LLM returned non-JSON:', rawText.slice(0, 200));
      return this.fallbackResult(entityName, country, 'LLM returned non-JSON output');
    }
  }

  // fallbackResult() produces a conservative CONDUIT/LOW result when the LLM
  // call fails. This is the same safety principle as Phase 6: if the service
  // is unavailable, report LOW confidence rather than crashing.
  private fallbackResult(entityName: string, country: string, reason: string): string {
    return JSON.stringify({
      entity: entityName,
      country,
      entity_type: 'unknown',
      substance_factors: {
        employees: { present: false, count: null, note: 'Extraction failed.' },
        physical_office: { present: false, own_premises: false, note: 'Extraction failed.' },
        management_independence: { present: false, note: 'Extraction failed.' },
        own_assets: { present: false, note: 'Extraction failed.' },
        operating_costs: { present: false, note: 'Extraction failed.' },
        own_capital_financing: { present: false, note: 'Extraction failed.' },
      },
      conduit_indicators: {
        pass_through_obligation: { present: false, evidence: 'Extraction failed.' },
        rapid_forwarding: { present: false, evidence: 'Extraction failed.' },
        nominal_margin: { present: false, evidence: 'Extraction failed.' },
        capital_insufficiency: { present: false, evidence: 'Extraction failed.' },
      },
      substance_tier: 'CONDUIT',
      bo_preliminary: {
        condition_1_own_benefit: { result: 'UNCERTAIN', note: `Extraction failed: ${reason}` },
        condition_2_not_conduit: { result: 'UNCERTAIN', note: `Extraction failed: ${reason}` },
        condition_3_genuine_activity: { result: 'UNCERTAIN', note: `Extraction failed: ${reason}` },
        overall: 'UNCERTAIN',
        legal_basis: 'Art. 4a pkt 29 Polish CIT Act; MF Objaśnienia podatkowe 2025',
      },
      confidence: 'LOW',
      confidence_note: `TypeScript extraction failed — ${reason}. Substance assessment is not reliable.`,
      source: 'ddq_interview_typescript_extractor_fallback',
    });
  }
}
