// ─────────────────────────────────────────────────────────────────────────────
// TreatyVerifierAgent — Phase 12a
//
// Uses Gemini 2.0 Flash + Google Search grounding to verify Polish WHT treaty
// rates in data/treaties.json against official treaty texts and authoritative
// commentary.
//
// Design mirrors FactCheckerAgent:
//   - Same Gemini REST API + Google Search approach
//   - Same simulate/live switch — falls back to simulation if GEMINI_API_KEY absent
//   - Same three-strategy JSON extraction (raw → fence → brace scan)
//
// Called from: scripts/verifyTreaties.ts (CLI batch job)
// NOT called from the WHT agent loop — this is an offline maintenance tool.
// ─────────────────────────────────────────────────────────────────────────────

// ── Output types ──────────────────────────────────────────────────────────────
//
// RateVerificationStatus is a union type — a value of this type can only be one
// of the three strings listed. TypeScript enforces this at compile time.
//
// CONFIRMED  → Gemini found the rate in an authoritative source and it matches
// DIFFERS    → Gemini found the treaty article but the actual rate is different
// NOT_FOUND  → Gemini could not locate the rate in any authoritative source

export type RateVerificationStatus = 'CONFIRMED' | 'DIFFERS' | 'NOT_FOUND';

export interface TreatyRateVerification {
  country: string;
  income_type: string;
  claimed_rate: string; // what treaties.json currently says
  treaty_article: string; // e.g. "Art. 10(2) Poland–Austria DTC"
  status: RateVerificationStatus;
  confirmed_rate: string | null; // what Gemini found; null if NOT_FOUND
  sources: string[]; // URLs or publication names
  note: string; // any caveat or discrepancy detail
  verification_date: string; // ISO date (YYYY-MM-DD)
}

// ── System prompt ─────────────────────────────────────────────────────────────
//
// The prompt tells Gemini its job, which output format to use, and what counts
// as an authoritative source. Template literals in TypeScript start with a
// backtick (`). The backslash at the end of the first line is a line-continuation
// character — it joins the next line so the string doesn't start with a newline.

const SYSTEM_PROMPT = `\
You are a Polish tax treaty rate verifier. Your task is to verify specific withholding \
tax (WHT) rates from Polish Double Taxation Conventions (DTCs) against official sources \
using Google Search.

VERIFICATION RULES — apply exactly one status to each rate:
  CONFIRMED  → you found the exact rate claimed in the specified treaty article
  DIFFERS    → you found the treaty article but the actual rate is different from claimed
  NOT_FOUND  → you could not locate the rate or treaty article in any source

AUTHORITATIVE SOURCES (priority order):
  1. Polish Official Journal (Dziennik Ustaw — isap.sejm.gov.pl)
  2. Polish Ministry of Finance treaty list (podatki.gov.pl)
  3. OECD tax treaty database (oecd.org)
  4. IBFD tax research database (ibfd.org)
  5. Reputable tax firm commentary (EY, PwC, Deloitte, KPMG) — lower priority

OUTPUT — return ONLY a valid JSON object, no markdown, no commentary outside the JSON:

{
  "country": string,
  "income_type": "dividend" | "interest" | "royalty",
  "claimed_rate": string,
  "treaty_article": string,
  "status": "CONFIRMED" | "DIFFERS" | "NOT_FOUND",
  "confirmed_rate": string or null,
  "sources": [string],
  "note": string,
  "verification_date": "YYYY-MM-DD"
}
`;

// ── Gemini REST API response types ────────────────────────────────────────────
//
// These interface names match FactCheckerAgent exactly — same Gemini API shape.

interface GeminiPart {
  text: string;
}
interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}
interface GeminiCandidate {
  content: GeminiContent;
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

// ── TreatyVerifierAgent ───────────────────────────────────────────────────────

export interface TreatyVerifierOptions {
  simulate: boolean; // true = no API calls (for tests); false = live Gemini
}

export class TreatyVerifierAgent {
  private simulate: boolean;
  private apiKey: string | undefined;
  private model: string;

  constructor(options: TreatyVerifierOptions) {
    this.simulate = options.simulate;

    if (!this.simulate) {
      this.apiKey = process.env['GEMINI_API_KEY'];
      // Mirrors FactCheckerAgent: missing key → silent fallback to simulation.
      if (!this.apiKey) {
        console.warn('[TREATY VERIFIER] GEMINI_API_KEY not set — falling back to simulation.');
        this.simulate = true;
      }
    }

    this.model = process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash';
  }

  // verifyRate() is the public entry point called from verifyTreaties.ts.
  //
  // country:       normalised country name, e.g. "austria"
  // incomeType:    "dividend" | "interest" | "royalty"
  // claimedRate:   human-readable rate string, e.g. "5% (reduced, shareholding ≥25%) / 15% (standard)"
  // treatyArticle: e.g. "Art. 10(2) Poland–Austria DTC"
  //
  // Returns a TreatyRateVerification whether live or simulated — callers never
  // need to handle a null/undefined result.
  async verifyRate(
    country: string,
    incomeType: string,
    claimedRate: string,
    treatyArticle: string
  ): Promise<TreatyRateVerification> {
    if (this.simulate) {
      return this.simulateResult(country, incomeType, claimedRate, treatyArticle);
    }
    return this.liveVerify(country, incomeType, claimedRate, treatyArticle);
  }

  // ── Live verification ──────────────────────────────────────────────────────

  private async liveVerify(
    country: string,
    incomeType: string,
    claimedRate: string,
    treatyArticle: string
  ): Promise<TreatyRateVerification> {
    // Build the user message — one specific rate claim for Gemini to look up.
    const userMessage =
      `Country:        ${country}\n` +
      `Income type:    ${incomeType}\n` +
      `Treaty article: ${treatyArticle}\n` +
      `Claimed rate:   ${claimedRate}\n\n` +
      `Please verify this WHT rate against official sources using Google Search. ` +
      `Return a JSON object matching the required schema.`;

    // v1beta — same endpoint as FactCheckerAgent, same reason (Google Search grounding).
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${this.model}:generateContent?key=${this.apiKey ?? ''}`;

    const requestBody = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      tools: [{ google_search: {} }],
    };

    let responseText: string;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Gemini API: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as GeminiResponse;
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      if (!responseText) {
        throw new Error('Gemini returned an empty response body');
      }
    } catch (err) {
      console.warn(
        `[TREATY VERIFIER] Gemini call failed: ${String(err)}. Falling back to simulation.`
      );
      return this.simulateResult(country, incomeType, claimedRate, treatyArticle);
    }

    return this.extractResult(responseText, country, incomeType, claimedRate, treatyArticle);
  }

  // ── JSON extraction ────────────────────────────────────────────────────────
  //
  // Three strategies, same as FactCheckerAgent:
  //   1. Entire response is valid JSON
  //   2. Content inside ```json ... ``` markdown fence
  //   3. First { to last } in the response
  //   4. Fall back to simulation if none work

  private extractResult(
    text: string,
    country: string,
    incomeType: string,
    claimedRate: string,
    treatyArticle: string
  ): TreatyRateVerification {
    const strategies: Array<() => string | null> = [
      () => text.trim(),
      () => {
        const match = text.match(/```json\s*([\s\S]*?)```/);
        return match?.[1]?.trim() ?? null;
      },
      () => {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        return start !== -1 && end > start ? text.slice(start, end + 1) : null;
      },
    ];

    for (const strategy of strategies) {
      const candidate = strategy();
      if (candidate === null) continue;
      try {
        const parsed = JSON.parse(candidate) as TreatyRateVerification;
        // Minimal validation: must have country (string) and a valid status.
        const validStatuses = new Set(['CONFIRMED', 'DIFFERS', 'NOT_FOUND']);
        if (typeof parsed.country === 'string' && validStatuses.has(parsed.status)) {
          return parsed;
        }
      } catch {
        // Try next strategy
      }
    }

    console.warn(
      `[TREATY VERIFIER] Could not parse Gemini response for ${country}/${incomeType}. Falling back to simulation.`
    );
    return this.simulateResult(country, incomeType, claimedRate, treatyArticle);
  }

  // ── Simulation fallback ───────────────────────────────────────────────────
  //
  // Simulate returns NOT_FOUND with no sources and a clear note.
  // This is conservative: simulation never falsely marks a rate as CONFIRMED.

  private simulateResult(
    country: string,
    incomeType: string,
    claimedRate: string,
    treatyArticle: string
  ): TreatyRateVerification {
    const today = new Date().toISOString().slice(0, 10);

    return {
      country,
      income_type: incomeType,
      claimed_rate: claimedRate,
      treaty_article: treatyArticle,
      status: 'NOT_FOUND',
      confirmed_rate: null,
      sources: [],
      note: 'Simulation mode — GEMINI_API_KEY not configured or API unavailable. Manual verification required.',
      verification_date: today,
    };
  }
}
