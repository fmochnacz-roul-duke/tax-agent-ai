// ─────────────────────────────────────────────────────────────────────────────
// InputExtractor — Phase 8
//
// Converts free-form user text into a validated AgentInput.
//
// This is the "conversation intake" step of the web UI:
//   User: "Analyse Orange S.A. royalty payments from Poland, they hold 50.67%"
//   InputExtractor: → { entity_name: "Orange S.A.", country: "France", ... }
//
// How it works:
//   The extractor sends the full conversation history to the LLM and asks it
//   to extract the WHT analysis parameters. The LLM returns JSON with:
//     - status: 'need_more'  → a required field is still missing; send question
//     - status: 'ready'      → all required fields present; ready to confirm
//
// The server calls extract() after every user message. If the LLM has enough
// data, the server confirms with the user and then calls runWhtAnalysis().
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { AgentInput, validateInput } from '../agents/BeneficialOwnerAgent';

dotenv.config();

// ── Result types ─────────────────────────────────────────────────────────────

export type ExtractionResult =
  | { status: 'need_more'; question: string }
  | { status: 'ready';     input: AgentInput; summary: string };

// What the LLM sends back as JSON — all fields optional because the user
// may not have provided them yet.
interface LlmOutput {
  status:                   'need_more' | 'ready';
  question?:                string;
  summary?:                 string;
  entity_name?:             string;
  country?:                 string;
  income_type?:             string;
  shareholding_percentage?: number;
  substance_notes?:         string;
  annual_payment_pln?:      number;
  related_party?:           boolean;
}

// ── System prompt ──────────────────────────────────────────────────────────────
//
// The LLM is told exactly what fields are required vs optional, and what format
// to return. It also gets guidance on how to infer country from entity name
// (e.g. "Orange S.A." → France) to reduce the number of clarifying questions.

const SYSTEM_PROMPT = `\
You are a parameter extractor for a Polish withholding tax (WHT) analysis tool.
Your job is to extract WHT analysis parameters from the user's messages and return
structured JSON. You never perform the analysis yourself — only extract parameters.

REQUIRED PARAMETERS (you must have all of these before returning status: "ready"):
  entity_name:             string  — name of the foreign entity receiving the payment
  country:                 string  — country of residence of the entity (ISO or full name)
  income_type:             string  — must be exactly one of: "dividend", "interest", "royalty"
  shareholding_percentage: number  — % of the Polish company's capital held by the entity (0-100)

OPTIONAL PARAMETERS (include when mentioned or clearly implied):
  substance_notes:      string   — any extra context about the entity's substance
  annual_payment_pln:   number   — annual payment amount in PLN (0 if unknown)
  related_party:        boolean  — whether the entity is a related party (Art. 11a CIT)

INFERENCE RULES:
  - "S.A." or "SA" after a name → likely a French or Spanish entity
  - "Ltd", "PLC" → likely UK entity
  - "GmbH" → Germany; "BV" → Netherlands; "AG" → Switzerland or Germany; "SE" → EU
  - If country is not mentioned but can be inferred from entity name, infer it
  - If income_type is not mentioned but context implies it (e.g. "brand licence",
    "technology licence" → royalty; "loan interest" → interest; "profit distribution" → dividend)
  - If shareholding is mentioned as a percentage, use it directly
  - If the user says "they own X%" or "holding X%" or "X% stake", extract shareholding_percentage = X

OUTPUT — return ONLY valid JSON, no prose:

If a required parameter is missing:
{
  "status": "need_more",
  "question": "Single concise question to get the missing information",
  "entity_name": "..." (if known),
  "country": "..." (if known),
  "income_type": "..." (if known),
  "shareholding_percentage": 0 (if unknown, omit the field)
}

If all required parameters are present:
{
  "status": "ready",
  "summary": "Human-readable confirmation of the extracted parameters",
  "entity_name": "...",
  "country": "...",
  "income_type": "dividend" | "interest" | "royalty",
  "shareholding_percentage": 0,
  "substance_notes": "...",
  "annual_payment_pln": 0,
  "related_party": true | false
}

The "summary" field should be a short paragraph confirming what will be analysed,
e.g.: "I'll analyse whether Orange S.A. (France, 50.67% shareholder) qualifies as
beneficial owner of a royalty payment from a Polish company."
`;

// ── InputExtractor class ──────────────────────────────────────────────────────

export class InputExtractor {
  private client: OpenAI;
  private model:  string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    // Use the fast model — this is a simple extraction task, not legal reasoning.
    this.model = process.env['OPENAI_MODEL_FAST'] ?? process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini';
  }

  // extract() is called after every user message.
  //
  // conversationHistory: all messages exchanged so far (user + assistant),
  //   in chronological order. This gives the LLM context to infer parameters
  //   from earlier messages even if the user adds detail across turns.
  //
  // Returns either a question to ask the user, or a validated AgentInput.

  async extract(
    conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<ExtractionResult> {
    // Build messages: system prompt + conversation history
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
    ];

    let rawText: string;
    try {
      const response = await this.client.chat.completions.create({
        model:           this.model,
        messages,
        // response_format: json_object tells the model to return only valid JSON.
        // No markdown wrapping, no prose — just the JSON object we defined above.
        response_format: { type: 'json_object' },
        temperature:     0,   // deterministic — same input always gives same extraction
      });

      rawText = response.choices[0]?.message?.content ?? '';
      if (!rawText) throw new Error('Empty response from extraction LLM');
    } catch (err) {
      // If the LLM call fails, ask a safe fallback question
      console.error('[INPUT EXTRACTOR] LLM call failed:', err);
      return {
        status: 'need_more',
        question:
          "I couldn't process your message. Could you tell me the entity name, " +
          "country, type of payment (dividend, interest, or royalty), and the " +
          "shareholding percentage?",
      };
    }

    // Parse the LLM's JSON output
    let parsed: LlmOutput;
    try {
      parsed = JSON.parse(rawText) as LlmOutput;
    } catch {
      return {
        status: 'need_more',
        question:
          "Could you describe the transaction? I need the entity name, country, " +
          "payment type, and shareholding percentage.",
      };
    }

    // If the LLM says more info is needed, pass the question back to the user
    if (parsed.status === 'need_more') {
      return {
        status: 'need_more',
        question: parsed.question ?? 'Could you provide more details about the transaction?',
      };
    }

    // Status is 'ready' — validate the extracted fields using the existing
    // validateInput() function. If validation fails (which can happen if the LLM
    // got a field slightly wrong), treat it as need_more with a specific error.
    try {
      const input = validateInput({
        entity_name:             parsed.entity_name,
        country:                 parsed.country,
        income_type:             parsed.income_type,
        shareholding_percentage: parsed.shareholding_percentage,
        substance_notes:         parsed.substance_notes,
        annual_payment_pln:      parsed.annual_payment_pln,
        related_party:           parsed.related_party,
      });

      return {
        status:  'ready',
        input,
        summary: parsed.summary ?? `Ready to analyse ${input.entity_name} (${input.country}).`,
      };
    } catch (err) {
      // Validation caught a bad field — ask for clarification
      return {
        status:   'need_more',
        question: `I need a small correction: ${String(err)} Could you clarify?`,
      };
    }
  }
}
