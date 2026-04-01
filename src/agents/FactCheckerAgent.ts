// ─────────────────────────────────────────────────────────────────────────────
// FactCheckerAgent — Phase 7
//
// A specialist agent that verifies substance claims from DDQ documents against
// public records using the Gemini API with Google Search grounding.
//
// This is the "call_agent" multi-agent pattern:
//   WHT Agent (OpenAI, TypeScript)
//     └─ fact_check_substance tool
//           └─ FactCheckerAgent (Gemini, TypeScript)
//                 └─ Gemini 2.0 Flash + Google Search → live web verification
//
// Why a second agent and not another OpenAI tool?
//   OpenAI tools cannot search the web in real-time (without Bing plugin).
//   Gemini 2.0 Flash has native Google Search grounding — it can verify company
//   employee counts, annual report figures, and IP registrations against live
//   public records. That is exactly what substance verification requires.
//
// Adapted from the "WHT Substance Verifier" persona:
//   - Triangulation Rule preserved: 2+ sources = VERIFIED, 1 = UNVERIFIED, 0 = CONTRADICTED
//   - Scope narrowed to WHT-relevant facts only (no prose narrative, no slop)
//   - Output is strict JSON — machine-readable, stored in WHT agent findings
//   - Strategic liability lens → wht_risk_flags
//
// Live mode:  Gemini REST API + Google Search grounding. Requires GEMINI_API_KEY.
// Simulate mode: hardcoded INCONCLUSIVE result — no API calls, used in tests.
// ─────────────────────────────────────────────────────────────────────────────

// ── Output types ──────────────────────────────────────────────────────────────
//
// These are the WHT-specific adaptations of the persona's output structure.
// 'VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' map to the Triangulation Rule.

export type ClaimStatus = 'VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED';

export interface VerifiedClaim {
  claim:         string;       // the exact claim from the DDQ
  status:        ClaimStatus;  // triangulation result
  sources:       string[];     // publication names or URLs that support the verdict
  wht_relevance: string;       // how this claim affects the BO / WHT conclusion
}

// Overall assessment: does public record confirm, qualify, or contradict
// the substance profile that the DDQ presented to the WHT agent?
export type OverallAssessment = 'CONFIRMS' | 'INCONCLUSIVE' | 'UNDERMINES';

export interface FactCheckResult {
  entity:             string;
  country:            string;
  verification_date:  string;            // ISO date the check was run
  claims:             VerifiedClaim[];
  wht_risk_flags:     string[];          // specific red flags for WHT analysis
  overall_assessment: OverallAssessment;
  source:             string;
}

// ── System prompt ─────────────────────────────────────────────────────────────
//
// Key design choices vs. the original persona:
//   1. Scope is narrowed to WHT-relevant facts — we do not fact-check legal
//      interpretations or tax opinions, only verifiable company data.
//   2. Output is strict JSON — no "Intelligence Rewrite" prose, no Slop Purge.
//   3. Triangulation Rule is preserved verbatim — it is objective and implementable.
//   4. "Strategic Liability Lens" is reframed as wht_risk_flags.

const SYSTEM_PROMPT = `\
You are a WHT Substance Verifier — a specialist fact-checker for Polish withholding \
tax beneficial owner analysis. Your only task is to verify factual claims from Due \
Diligence Questionnaires against public records using Google Search.

TRIANGULATION RULE — apply this to every claim:
  VERIFIED     → 2 or more authoritative sources confirm the claim
  UNVERIFIED   → 1 source confirms, or claim is plausible but no sources found
  CONTRADICTED → a public source directly conflicts with the claim

AUTHORITATIVE SOURCES (priority order):
  1. Company annual reports (AMF, SEC, Euronext, local registries)
  2. Official investor relations pages
  3. Stock exchange regulatory filings
  4. Reuters / Bloomberg company profiles
  5. EU or government official databases

SCOPE — verify ONLY these WHT-relevant categories (do not analyse legal interpretations):
  • Employees and headcount  → supports genuine economic activity (Art. 4a pkt 29 lit. c CIT)
  • Physical office presence → supports country-of-residence substance
  • Management independence  → supports own-benefit condition
  • IP asset ownership       → supports DEMPE control claim
  • Shareholding % and holding period → Directive / treaty rate thresholds
  • R&D expenditure levels   → supports DEMPE development function

OVERALL ASSESSMENT LOGIC:
  CONFIRMS    → all or nearly all verifiable claims are VERIFIED, none CONTRADICTED
  INCONCLUSIVE → mixed results or insufficient public data; no CONTRADICTED claims
  UNDERMINES  → one or more claims are CONTRADICTED by a public source

OUTPUT — return ONLY a valid JSON object, no markdown, no commentary outside the JSON:

{
  "entity": string,
  "country": string,
  "verification_date": "YYYY-MM-DD",
  "claims": [
    {
      "claim": string,
      "status": "VERIFIED" | "UNVERIFIED" | "CONTRADICTED",
      "sources": [string],
      "wht_relevance": string
    }
  ],
  "wht_risk_flags": [string],
  "overall_assessment": "CONFIRMS" | "INCONCLUSIVE" | "UNDERMINES",
  "source": "FactChecker via Gemini + Google Search grounding"
}
`;

// ── Gemini REST API response types ────────────────────────────────────────────
//
// We call the Gemini API directly via Node 18 built-in fetch — no SDK needed.
// These interfaces cover the minimal response structure we parse.

interface GeminiPart      { text: string; }
interface GeminiContent   { role: string; parts: GeminiPart[]; }
interface GeminiCandidate { content: GeminiContent; }
interface GeminiResponse  { candidates?: GeminiCandidate[]; }

// ── FactCheckerAgent ──────────────────────────────────────────────────────────

export interface FactCheckerOptions {
  simulate: boolean;  // true = hardcoded result, no API calls; false = live Gemini
}

export class FactCheckerAgent {
  private simulate: boolean;
  private apiKey:   string | undefined;
  private model:    string;

  constructor(options: FactCheckerOptions) {
    this.simulate = options.simulate;

    if (!this.simulate) {
      this.apiKey = process.env['GEMINI_API_KEY'];
      // If the key is absent, fall back to simulation silently.
      // This mirrors how WhtEnvironment handles a missing DDQ_SERVICE_URL.
      if (!this.apiKey) {
        console.warn(
          '[FACT CHECKER] GEMINI_API_KEY not set — falling back to simulation.'
        );
        this.simulate = true;
      }
    }

    // GEMINI_MODEL defaults to gemini-2.0-flash.
    // That model supports Google Search grounding via the tools array.
    this.model = process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash';
  }

  // verify() is the public entry point called from WhtEnvironment.
  //
  // entityName, country: identify who we are researching
  // claims:              array of specific factual statements to check
  //                      (e.g. "Orange S.A. employs approximately 133,000 people globally")
  //
  // Returns a FactCheckResult whether or not the API call succeeds — simulation
  // is the safe fallback so the WHT agent always gets a valid tool result.
  async verify(
    entityName: string,
    country:    string,
    claims:     string[]
  ): Promise<FactCheckResult> {
    if (this.simulate) {
      return this.simulateResult(entityName, country, claims);
    }
    return this.liveVerify(entityName, country, claims);
  }

  // ── Live verification ──────────────────────────────────────────────────────

  private async liveVerify(
    entityName: string,
    country:    string,
    claims:     string[]
  ): Promise<FactCheckResult> {
    // Build the user message — entity context + numbered claim list.
    const claimList = claims.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const userMessage =
      `Entity:  ${entityName}\n` +
      `Country: ${country}\n\n` +
      `Verify the following claims from this entity's Due Diligence Questionnaire:\n` +
      claimList;

    // Gemini v1beta endpoint — the stable v1 endpoint does not yet expose
    // googleSearch as a tool for all models.
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${this.model}:generateContent?key=${this.apiKey ?? ''}`;

    const requestBody = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      // google_search enables Google Search grounding — Gemini can search the web
      // before producing its response. This is the equivalent of the Custom Gem's
      // live search capability.
      tools: [{ google_search: {} }],
    };

    let responseText: string;
    try {
      const response = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Gemini API: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as GeminiResponse;
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      if (!responseText) {
        throw new Error('Gemini returned an empty response body');
      }
    } catch (err) {
      // Any network or API failure falls back to simulation.
      console.warn(
        `[FACT CHECKER] Gemini call failed: ${String(err)}. Falling back to simulation.`
      );
      return this.simulateResult(entityName, country, claims);
    }

    return this.extractResult(responseText, entityName, country, claims);
  }

  // ── JSON extraction ────────────────────────────────────────────────────────
  //
  // Gemini returns text. Our system prompt asks for pure JSON, but grounding
  // metadata or markdown wrapping can appear. Three extraction strategies:
  //   1. Entire response is valid JSON
  //   2. Content inside ```json ... ``` markdown fence
  //   3. First { to last } in the response
  //   4. Fall back to simulation if none parse correctly

  private extractResult(
    text:       string,
    entityName: string,
    country:    string,
    claims:     string[]
  ): FactCheckResult {
    const strategies: Array<() => string | null> = [
      () => text.trim(),
      () => {
        const match = text.match(/```json\s*([\s\S]*?)```/);
        return match?.[1]?.trim() ?? null;
      },
      () => {
        const start = text.indexOf('{');
        const end   = text.lastIndexOf('}');
        return (start !== -1 && end > start) ? text.slice(start, end + 1) : null;
      },
    ];

    for (const strategy of strategies) {
      const candidate = strategy();
      if (candidate === null) continue;
      try {
        const parsed = JSON.parse(candidate) as FactCheckResult;
        // Minimal validation: must have entity (string) and claims (array)
        if (typeof parsed.entity === 'string' && Array.isArray(parsed.claims)) {
          parsed.source = `FactChecker via Gemini ${this.model} + Google Search grounding`;
          return parsed;
        }
      } catch {
        // Try next strategy
      }
    }

    console.warn(
      '[FACT CHECKER] Could not parse Gemini response as JSON. Falling back to simulation.'
    );
    return this.simulateResult(entityName, country, claims);
  }

  // ── Simulation fallback ───────────────────────────────────────────────────
  //
  // All claims are marked UNVERIFIED and overall_assessment is INCONCLUSIVE.
  //
  // This is deliberately conservative — simulation never fabricates verified
  // sources. The WHT agent sees an INCONCLUSIVE result and the report confidence
  // stays MEDIUM at most, which is correct when we have no real verification.

  private simulateResult(
    entityName: string,
    country:    string,
    claims:     string[]
  ): FactCheckResult {
    const today = new Date().toISOString().slice(0, 10);

    return {
      entity:  entityName,
      country,
      verification_date: today,
      claims: claims.map(claim => ({
        claim,
        status:        'UNVERIFIED' as ClaimStatus,
        sources:       [],
        wht_relevance: 'Could not verify — manual check against public filings recommended.',
      })),
      wht_risk_flags: [
        'Fact-check service not available — all claims remain unverified.',
        'Manual verification against public records required before filing or client advice.',
      ],
      overall_assessment: 'INCONCLUSIVE' as OverallAssessment,
      source: 'FactChecker simulation — GEMINI_API_KEY not configured or API unavailable',
    };
  }
}
