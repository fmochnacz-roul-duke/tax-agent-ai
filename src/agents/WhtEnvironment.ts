// ─────────────────────────────────────────────────────────────────────────────
// WhtEnvironment — the E in GAME
//
// The Environment owns the concrete implementations of every tool action.
// It is deliberately separated from the agent loop and the tool definitions
// so that:
//
//   - The agent loop never knows HOW tools are executed
//   - Swapping simulation → live data is a one-line change at the call site:
//       new WhtEnvironment({ simulate: false })
//   - Each tool implementation can be tested in isolation
//
// Live mode reads from data/treaties.json — a static lookup table maintained
// from the Polish MoF treaty list and OECD MLI positions.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import { FactCheckerAgent } from './FactCheckerAgent';
import { SubstanceExtractor } from '../server/SubstanceExtractor';

// ── Treaty database types ─────────────────────────────────────────────────────
//
// These interfaces describe the shape of every entry in data/treaties.json.
// TypeScript uses them to catch mistakes at compile time — e.g. if you try to
// read `entry.rates.dividnd` (typo), the compiler will error immediately.

interface DividendRate {
  reduced_rate: number;       // WHT rate when shareholding threshold is met
  reduced_threshold: number;  // minimum shareholding % required (0 = flat rate)
  standard_rate: number;      // WHT rate when threshold not met
  treaty_article: string;     // e.g. "Art. 10(2) Poland–Germany DTC"
  verified: boolean;          // false until confirmed against treaty PDF
  note?: string;              // any caveat worth surfacing to the agent
}

interface FlatRate {
  rate: number;
  treaty_article: string;
  verified: boolean;
  note?: string;
}

interface TreatyRates {
  dividend: DividendRate | null;  // null = not yet researched
  interest: FlatRate | null;
  royalty: FlatRate | null;
}

interface TreatyEntry {
  treaty_in_force: boolean;
  treaty_name: string;
  dz_u: string;                          // Polish Official Journal reference
  mli_ppt_applies: 'YES' | 'NO' | 'VERIFY';
  mli_flags: string[];                   // e.g. ["EXCLUDED_BY_POLAND", "NOT_RATIFIED"]
  mli_note?: string;
  rates: TreatyRates;
}

// Record<string, TreatyEntry> is TypeScript's way to say:
// "an object with string keys where every value is a TreatyEntry"
type TreatyDatabase = Record<string, TreatyEntry>;

// ── Country name normalisation ────────────────────────────────────────────────
//
// Users (or the LLM) may pass "UK", "United Kingdom", "England", etc.
// normalise() converts everything to the key used in treaties.json.

const ALIASES: Record<string, string> = {
  'uk':                   'united kingdom',
  'great britain':        'united kingdom',
  'england':              'united kingdom',
  'us':                   'united states',
  'usa':                  'united states',
  'america':              'united states',
  'united states of america': 'united states',
  'uae':                  'united arab emirates',
  'czechia':              'czech republic',
  'holland':              'netherlands',
  'the netherlands':      'netherlands',
};

function normalise(country: string): string {
  const lower = country.trim().toLowerCase();
  return ALIASES[lower] ?? lower;
}

// ── Entity substance types ────────────────────────────────────────────────────
//
// These types model the economic substance analysis for a foreign entity under
// the Polish Beneficial Owner clause (Art. 4a pkt 29 CIT Act) and the official
// MF Objaśnienia podatkowe z 3 lipca 2025 r. (Ministry of Finance guidance).
//
// The BO test has THREE cumulative conditions:
//   (i)   Receives income for OWN benefit (economic dominion)
//   (ii)  NO obligation to pass on the payment (not a conduit)
//   (iii) Conducts GENUINE BUSINESS ACTIVITY in country of residence
//
// Per MF Objaśnienia §2.2.1: conditions (i) and (ii) are treated functionally
// as ONE — both exclude entities that lack economic dominion over the payment.
//
// The BO test is BINARY: PASS or FAIL.
// SubstanceTier describes the overall risk level — not a gradient BO score.

// The four archetypal entity profiles the simulation recognises.
// TypeScript string literal union type: only these exact strings are allowed.
type EntityType =
  | 'large_operating_company'   // full business functions, own IP/assets, many employees
  | 'ip_holdco'                  // dedicated IP holding with DEMPE control
  | 'holding_company'            // intermediate holding; lower substance threshold applies
  | 'shell_company'              // minimal substance, high conduit risk
  | 'unknown';                   // entity not in any known profile

type SubstanceTier    = 'STRONG' | 'ADEQUATE' | 'WEAK' | 'CONDUIT';
type BoConditionResult = 'PASS'  | 'FAIL'     | 'UNCERTAIN';
type DataConfidence   = 'HIGH'   | 'MEDIUM'   | 'LOW';

// A single substance factor (universal criteria per MF Objaśnienia §2.3).
// 'present: true' means the factor supports BO status.
interface SubstanceFactor {
  present: boolean;
  note:    string;
}

// EmployeeFactor extends SubstanceFactor — it has all fields from SubstanceFactor
// PLUS the additional 'count' field. This is TypeScript's interface inheritance.
interface EmployeeFactor extends SubstanceFactor {
  count: number | null;   // null when count is unknown
}

// Physical office factor — adds the ownership flag
interface PhysicalOfficeFactor {
  present:      boolean;
  own_premises: boolean;
  note:         string;
}

// A conduit red flag from MF Objaśnienia §2.2.1
interface ConduitIndicator {
  present:  boolean;
  evidence: string;
}

// One of the three BO conditions — result and supporting reasoning
interface BoCondition {
  result: BoConditionResult;
  note:   string;
}

// Full structured output of checkEntitySubstance
interface SubstanceResult {
  entity:      string;
  country:     string;
  entity_type: EntityType;

  // MF Objaśnienia §2.3 — universal substance criteria
  substance_factors: {
    employees:               EmployeeFactor;
    physical_office:         PhysicalOfficeFactor;
    management_independence: SubstanceFactor;
    own_assets:              SubstanceFactor;
    operating_costs:         SubstanceFactor;
    own_capital_financing:   SubstanceFactor;
  };

  // MF Objaśnienia §2.2.1 — conduit red flags
  conduit_indicators: {
    pass_through_obligation: ConduitIndicator;
    rapid_forwarding:        ConduitIndicator;
    nominal_margin:          ConduitIndicator;
    capital_insufficiency:   ConduitIndicator;
  };

  // Aggregate risk level
  substance_tier: SubstanceTier;

  // Art. 4a pkt 29 CIT — three-condition BO test (preliminary, based on simulated data)
  bo_preliminary: {
    condition_1_own_benefit:      BoCondition;
    condition_2_not_conduit:      BoCondition;
    condition_3_genuine_activity: BoCondition;
    overall:                      BoConditionResult;
    legal_basis:                  string;
  };

  confidence:      DataConfidence;
  confidence_note: string;
  source:          string;
}

// ── WhtEnvironment ────────────────────────────────────────────────────────────

export interface WhtEnvironmentOptions {
  simulate:       boolean;     // true = use hard-coded data; false = load from treaties.json
  ddqServiceUrl?: string;      // URL of the Python DDQ extraction service, e.g. "http://localhost:8000"
  ddqText?:       string;      // pre-loaded DDQ document content forwarded to the service
}

export class WhtEnvironment {
  private simulate: boolean;
  // db is populated only in live mode; stays empty in simulate mode
  private db: TreatyDatabase = {};
  // Phase 6: DDQ service connection — both must be set to enable live DDQ mode
  private ddqServiceUrl: string | undefined;
  private ddqText:       string | undefined;
  // Phase 7: FactChecker agent — verifies substance claims against public records
  private factChecker: FactCheckerAgent;

  constructor(options: WhtEnvironmentOptions) {
    this.simulate      = options.simulate;
    this.ddqServiceUrl = options.ddqServiceUrl;
    this.ddqText       = options.ddqText;
    // Phase 7 — FactCheckerAgent shares the same simulate flag.
    // When simulate:true (tests), no Gemini API calls are made.
    // When simulate:false and GEMINI_API_KEY is absent, the agent self-degrades
    // to simulation and logs a warning — backward-compatible.
    this.factChecker = new FactCheckerAgent({ simulate: this.simulate });

    if (!this.simulate) {
      // path.join builds the correct OS path from pieces.
      // __dirname is the directory of *this compiled file* (src/agents/).
      // Two levels up lands us at the project root; then into data/.
      const dbPath = path.join(__dirname, '..', '..', 'data', 'treaties.json');
      const raw = fs.readFileSync(dbPath, 'utf-8');

      // JSON.parse returns `any`, which we immediately cast to `unknown` for
      // safety, then walk through with a for-of loop so TypeScript can follow.
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      const db: TreatyDatabase = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (key !== '_meta') {           // _meta is documentation, not a treaty
          db[key] = value as TreatyEntry;
        }
      }
      this.db = db;
    }
  }

  // ── checkTreaty ─────────────────────────────────────────────────────────────
  //
  // Returns: is there a valid tax treaty in force? What is the MLI status?
  checkTreaty(residenceCountry: string): string {
    if (this.simulate) {
      if (residenceCountry.toLowerCase() === 'luxembourg') {
        return JSON.stringify({
          treaty_in_force: true,
          treaty_name: 'Poland–Luxembourg Double Taxation Convention (1995, as amended 2012)',
          mli_applies: true,
          source: 'Polish Ministry of Finance — treaty list (simulated)',
        });
      }
      return JSON.stringify({
        treaty_in_force: false,
        note: `No treaty data available for ${residenceCountry} in this simulation.`,
      });
    }

    // ── Live mode ──
    const key = normalise(residenceCountry);
    const entry = this.db[key];

    if (entry === undefined) {
      return JSON.stringify({
        treaty_in_force: false,
        note: `"${residenceCountry}" not found in treaty database. The country may have no treaty with Poland, or it may not yet be in the lookup table.`,
        source: 'data/treaties.json',
      });
    }

    return JSON.stringify({
      treaty_in_force:  entry.treaty_in_force,
      treaty_name:      entry.treaty_name,
      dz_u:             entry.dz_u,
      mli_ppt_applies:  entry.mli_ppt_applies,
      mli_flags:        entry.mli_flags,
      mli_note:         entry.mli_note ?? null,
      source: 'data/treaties.json — MoF treaty list + OECD MLI positions',
    });
  }

  // ── getTreatyRate ────────────────────────────────────────────────────────────
  //
  // Returns: the reduced or standard WHT rate for the given income type.
  // shareholdingPercentage is used only for dividends (to check the threshold).
  getTreatyRate(
    residenceCountry: string,
    incomeType: string,
    shareholdingPercentage: number
  ): string {
    // ── Parameter validation ───────────────────────────────────────────────────
    // The agent loop validates user input at the CLI boundary, but the LLM can
    // still fabricate out-of-range values when calling tools. These guards prevent
    // silent errors propagating into treaty rate logic.
    const VALID_INCOME = new Set(['dividend', 'interest', 'royalty']);
    if (!VALID_INCOME.has(incomeType.toLowerCase())) {
      return JSON.stringify({
        error: `Unsupported income_type "${incomeType}". Must be one of: dividend, interest, royalty.`,
      });
    }
    if (shareholdingPercentage < 0 || shareholdingPercentage > 100) {
      return JSON.stringify({
        error: `shareholding_percentage must be between 0 and 100. Received: ${shareholdingPercentage}.`,
      });
    }

    if (this.simulate) {
      const country = residenceCountry.toLowerCase();

      if (country === 'luxembourg' && incomeType === 'dividend') {
        const rate = shareholdingPercentage >= 10 ? 5 : 15;
        return JSON.stringify({
          treaty_rate_percent: rate,
          condition: shareholdingPercentage >= 10
            ? 'Reduced rate: beneficial owner holds ≥10% of capital'
            : 'Standard rate applies (shareholding below 10%)',
          domestic_rate_percent: 19,
          treaty_article: 'Art. 10(2) Poland–Luxembourg DTC',
          source: 'Simulated — to be replaced with OECD treaty database',
        });
      }

      if (country === 'luxembourg' && incomeType === 'interest') {
        return JSON.stringify({
          treaty_rate_percent: 5,
          condition: 'Beneficial owner test must be met',
          domestic_rate_percent: 20,
          treaty_article: 'Art. 11(2) Poland–Luxembourg DTC',
          source: 'Simulated — to be replaced with OECD treaty database',
        });
      }

      return JSON.stringify({
        error: `No rate data for ${residenceCountry} / ${incomeType} in this simulation.`,
      });
    }

    // ── Live mode ──
    const key = normalise(residenceCountry);
    const entry = this.db[key];

    if (entry === undefined) {
      return JSON.stringify({
        error: `"${residenceCountry}" not found in treaty database.`,
      });
    }

    if (!entry.treaty_in_force) {
      return JSON.stringify({
        error: `Treaty with ${residenceCountry} is not in force — no treaty rate applies. Domestic WHT rates apply.`,
      });
    }

    const type = incomeType.toLowerCase();

    if (type === 'dividend') {
      const div = entry.rates.dividend;
      if (div === null) {
        return JSON.stringify({
          error: `Dividend rate for ${residenceCountry} not yet in the database. Verify against treaty text.`,
        });
      }

      // When reduced_threshold === 0 the treaty has a flat rate (no shareholding condition).
      // Otherwise, apply the reduced rate only if the holding meets or exceeds the threshold.
      const qualifies = div.reduced_threshold > 0 && shareholdingPercentage >= div.reduced_threshold;
      const isFlat    = div.reduced_threshold === 0;

      const rate = (isFlat || qualifies) ? div.reduced_rate : div.standard_rate;
      const condition = isFlat
        ? 'Flat rate — no shareholding threshold in this treaty'
        : qualifies
          ? `Reduced rate: beneficial owner holds ≥${div.reduced_threshold}% of capital`
          : `Standard rate applies (shareholding ${shareholdingPercentage}% is below the ${div.reduced_threshold}% threshold)`;

      return JSON.stringify({
        treaty_rate_percent:  rate,
        condition,
        domestic_rate_percent: 19,
        treaty_article:       div.treaty_article,
        verified:             div.verified,
        ...(div.note !== undefined ? { verification_note: div.note } : {}),
        source: 'data/treaties.json',
      });
    }

    if (type === 'interest') {
      const interest = entry.rates.interest;
      if (interest === null) {
        return JSON.stringify({
          error: `Interest rate for ${residenceCountry} not yet in the database.`,
        });
      }
      return JSON.stringify({
        treaty_rate_percent:  interest.rate,
        condition:            'Beneficial owner test must be met',
        domestic_rate_percent: 20,
        treaty_article:       interest.treaty_article,
        verified:             interest.verified,
        ...(interest.note !== undefined ? { verification_note: interest.note } : {}),
        source: 'data/treaties.json',
      });
    }

    if (type === 'royalty') {
      const royalty = entry.rates.royalty;
      if (royalty === null) {
        return JSON.stringify({
          error: `Royalty rate for ${residenceCountry} not yet in the database.`,
        });
      }
      return JSON.stringify({
        treaty_rate_percent:  royalty.rate,
        condition:            'Beneficial owner test must be met',
        domestic_rate_percent: 20,
        treaty_article:       royalty.treaty_article,
        verified:             royalty.verified,
        ...(royalty.note !== undefined ? { verification_note: royalty.note } : {}),
        source: 'data/treaties.json',
      });
    }

    return JSON.stringify({
      error: `Unknown income type "${incomeType}". Supported values: dividend, interest, royalty.`,
    });
  }

  // ── buildEntityProfile ───────────────────────────────────────────────────────
  //
  // Returns a structured SubstanceResult for the named entity.
  //
  // Phase 4 delivers entity-aware simulation:
  //   - Orange S.A.          → large_operating_company (substance tier: STRONG)
  //   - Alpine Holdings S.A. → holding_company         (substance tier: WEAK)
  //   - Any other entity     → conservative fallback   (substance tier: CONDUIT)
  //
  // Phase 5 will replace all of these with real DDQ data from the Python component.
  //
  // 'private' means this method can only be called from within WhtEnvironment.
  // The outside world uses checkEntitySubstance() — that public method calls this.
  private buildEntityProfile(entityName: string, country: string): SubstanceResult {
    // Normalise the entity name for reliable comparison — removes extra spaces and
    // converts to lowercase so "Orange S.A." and "orange s.a." match the same profile.
    const normalised = entityName.trim().toLowerCase();

    // ── Profile: Orange S.A. — large operating company ────────────────────────
    if (normalised === 'orange s.a.') {
      return {
        entity:      entityName,
        country,
        entity_type: 'large_operating_company',
        substance_factors: {
          employees: {
            count:   140000,
            present: true,
            note:
              'Orange S.A. employs approximately 140,000 people worldwide. ' +
              'Paris HQ houses dedicated IP governance and brand management teams ' +
              'that control DEMPE functions globally.',
          },
          physical_office: {
            present:      true,
            own_premises: true,
            note:
              'HQ at 78 rue Olivier de Serres, Paris — own premises. ' +
              'Significant infrastructure in France and internationally.',
          },
          management_independence: {
            present: true,
            note:
              'Board of Directors with independent non-executive members; strategic ' +
              'decisions taken in France. No single controlling shareholder directing ' +
              'day-to-day management of IP exploitation.',
          },
          own_assets: {
            present: true,
            note:
              'Owns the Orange brand, patents, and technology portfolio globally. ' +
              'Assets valued in the tens of billions of euros on the balance sheet.',
          },
          operating_costs: {
            present: true,
            note:
              'R&D spend €1.4B+ per year; brand and marketing independently controlled. ' +
              'All costs funded from own operating cash flow — not dependent on ' +
              'royalty receipts from any single subsidiary.',
          },
          own_capital_financing: {
            present: true,
            note:
              'Listed on Euronext Paris; equity capital financed via public markets. ' +
              'No reliance on Polish subsidiary royalties to meet any upstream obligation.',
          },
        },
        conduit_indicators: {
          pass_through_obligation: {
            present:  false,
            evidence:
              'Orange S.A. is publicly listed — royalty income is recognised as revenue ' +
              'and deployed for general corporate purposes. No contractual or factual ' +
              'obligation to forward royalties to any single upstream entity identified.',
          },
          rapid_forwarding: {
            present:  false,
            evidence:
              'No evidence of systematic rapid forwarding of royalty receipts. ' +
              'Royalties form part of consolidated group revenue, not a pass-through stream.',
          },
          nominal_margin: {
            present:  false,
            evidence:
              'Orange S.A. generates material profit from its IP portfolio. ' +
              'Royalty income is one of several revenue streams, not a pure intermediary margin.',
          },
          capital_insufficiency: {
            present:  false,
            evidence:
              'Own equity capital base exceeds €25B. No dependence on Polish subsidiary ' +
              'royalties to meet any upstream obligation.',
          },
        },
        substance_tier: 'STRONG',
        bo_preliminary: {
          condition_1_own_benefit: {
            result: 'PASS',
            note:
              'Orange S.A. exercises full economic dominion over royalty income: Board ' +
              'independently decides on deployment; income bears full economic risk of IP ' +
              'investment (obsolescence, litigation, market demand).',
          },
          condition_2_not_conduit: {
            result: 'PASS',
            note:
              'No contractual or factual obligation to forward royalty receipts to another entity. ' +
              'Orange S.A. is the terminal point of the royalty chain for its own IP exploitation.',
          },
          condition_3_genuine_activity: {
            result: 'PASS',
            note:
              'Large-scale genuine business activity in France (140,000 employees, own premises, ' +
              'independent management). DEMPE functions controlled centrally in France — character ' +
              'and scale of activity are proportionate to royalty income received.',
          },
          overall:     'PASS',
          legal_basis:
            'Art. 4a pkt 29 CIT (Dz.U. 2025 poz. 278); ' +
            'MF Objaśnienia podatkowe z 3 lipca 2025 r. §2, §2.3; ' +
            'CJEU C-115/16 et al. (Danish cases).',
        },
        confidence:      'LOW',
        confidence_note:
          'Simulated profile based on publicly available information about Orange S.A. ' +
          'Real BO determination requires a formal Due Diligence Questionnaire (DDQ), ' +
          'reviewed group contracts, current financial statements, and board minutes (Phase 5).',
        source: 'Simulated entity profile — Phase 5 will replace with DDQ document analysis',
      };
    }

    // ── Profile: Alpine Holdings S.A. — intermediate holding company ──────────
    if (normalised === 'alpine holdings s.a.') {
      return {
        entity:      entityName,
        country,
        entity_type: 'holding_company',
        substance_factors: {
          employees: {
            count:   2,
            present: false,
            note:
              '2 employees — borderline under MF Objaśnienia §2.3.1 lower holding company ' +
              'threshold. Adequacy depends on their qualifications and genuine engagement ' +
              'in investment management decisions.',
          },
          physical_office: {
            present:      true,
            own_premises: false,
            note:
              'Leased office in Luxembourg City — satisfies the physical presence criterion ' +
              'for holding companies (MF Objaśnienia §2.3.1). Small scale.',
          },
          management_independence: {
            present: false,
            note:
              'Board meets only quarterly; no evidence of daily independent decision-making. ' +
              'Majority Luxembourg-resident directors, but their business expertise and ' +
              'independence from the German parent have not been established.',
          },
          own_assets: {
            present: true,
            note:
              'Holds shares in Polish operating company. ' +
              'No other significant assets evident beyond the shareholding.',
          },
          operating_costs: {
            present: true,
            note:
              'Pays rent and operating expenses independently. ' +
              'Costs are minimal and proportionate to a pure holding structure.',
          },
          own_capital_financing: {
            present: false,
            note:
              'Capital structure not confirmed. Given the 2-employee base and sole holding ' +
              'function, the entity likely relies on dividends received to service any ' +
              'upstream obligations — capital insufficiency risk cannot be excluded.',
          },
        },
        conduit_indicators: {
          pass_through_obligation: {
            present:  true,
            evidence:
              'Dividend income forwarded to German parent within 30 days of receipt — strong ' +
              'factual indicator of pass-through obligation per MF Objaśnienia §2.2.1 and ' +
              'OECD Commentary 2014 (dependent payment, not independent debt).',
          },
          rapid_forwarding: {
            present:  true,
            evidence:
              '30-day forwarding interval is rapid relative to the dividend payment cycle. ' +
              'Consistent with conduit characterisation per NSA II FSK 27/23 (DutchCo) and ' +
              'CJEU C-116/16, C-117/16 (Danish cases).',
          },
          nominal_margin: {
            present:  true,
            evidence:
              'Pure holding structure with income solely from dividends. ' +
              'No evidence of material profit retention after forwarding to German parent.',
          },
          capital_insufficiency: {
            present:  false,
            evidence:
              'Insufficient information to confirm or deny — capital structure data not available.',
          },
        },
        substance_tier: 'WEAK',
        bo_preliminary: {
          condition_1_own_benefit: {
            result: 'UNCERTAIN',
            note:
              'Entity formally receives dividends, but rapid forwarding within 30 days suggests ' +
              'it does not exercise genuine economic dominion. A factual obligation to forward ' +
              'may displace the own-benefit element per MF Objaśnienia §2.2.1.',
          },
          condition_2_not_conduit: {
            result: 'FAIL',
            note:
              'Factual pass-through obligation present: dividends forwarded to German parent within ' +
              '30 days. This satisfies the conduit test under Art. 4a pkt 29 CIT and the OECD ' +
              'Commentary 2014 dependent-payment criterion. Obligation arises from facts, not contract.',
          },
          condition_3_genuine_activity: {
            result: 'UNCERTAIN',
            note:
              'Holding company lower threshold (MF Objaśnienia §2.3.1) applies: adequately ' +
              'experienced, genuinely engaged personnel + appropriate office equipment required. ' +
              '2 employees + quarterly board + leased office is borderline; expertise not confirmed.',
          },
          overall:     'FAIL',
          legal_basis:
            'Art. 4a pkt 29 CIT (Dz.U. 2025 poz. 278); ' +
            'MF Objaśnienia podatkowe z 3 lipca 2025 r. §2.2.1, §2.3.1; ' +
            'NSA II FSK 27/23 (DutchCo, Nov 2023); CJEU C-116/16, C-117/16.',
        },
        confidence:      'LOW',
        confidence_note:
          'Simulated profile. FAIL on condition (ii) is based on reported 30-day dividend ' +
          'forwarding pattern. Real determination requires review of group contracts, ' +
          'constitutional documents, board minutes, and full capital structure (Phase 5).',
        source: 'Simulated entity profile — Phase 5 will replace with DDQ document analysis',
      };
    }

    // ── Fallback: conservative profile for unknown entities ────────────────────
    //
    // When the entity is not in the known list, no meaningful substance data exists.
    // The conservative default is CONDUIT — this ensures the agent flags the need
    // for real due diligence instead of silently accepting treaty benefits.
    return {
      entity:      entityName,
      country,
      entity_type: 'unknown',
      substance_factors: {
        employees: {
          count:   null,
          present: false,
          note:    'No employee data available for this entity in the simulation.',
        },
        physical_office: {
          present:      false,
          own_premises: false,
          note:         'No office or premises data available.',
        },
        management_independence: {
          present: false,
          note:    'No management structure data available.',
        },
        own_assets: {
          present: false,
          note:    'No asset data available.',
        },
        operating_costs: {
          present: false,
          note:    'No operating cost data available.',
        },
        own_capital_financing: {
          present: false,
          note:    'No capital structure data available.',
        },
      },
      conduit_indicators: {
        pass_through_obligation: {
          present:  false,
          evidence: 'Unable to assess — no contract or payment flow data available.',
        },
        rapid_forwarding: {
          present:  false,
          evidence: 'Unable to assess — no payment timing data available.',
        },
        nominal_margin: {
          present:  false,
          evidence: 'Unable to assess — no financial data available.',
        },
        capital_insufficiency: {
          present:  false,
          evidence: 'Unable to assess — no capital structure data available.',
        },
      },
      substance_tier: 'CONDUIT',
      bo_preliminary: {
        condition_1_own_benefit: {
          result: 'UNCERTAIN',
          note:   'Cannot assess — no substance data available for this entity.',
        },
        condition_2_not_conduit: {
          result: 'UNCERTAIN',
          note:   'Cannot assess — no payment flow or contract data available.',
        },
        condition_3_genuine_activity: {
          result: 'UNCERTAIN',
          note:   'Cannot assess — no business activity data available.',
        },
        overall:     'UNCERTAIN',
        legal_basis: 'Art. 4a pkt 29 CIT (Dz.U. 2025 poz. 278); MF Objaśnienia podatkowe z 3 lipca 2025 r. §2',
      },
      confidence:      'LOW',
      confidence_note:
        'No profile available for this entity. Conservative CONDUIT tier applied. ' +
        'Real substance assessment requires a formal Due Diligence Questionnaire (Phase 5).',
      source: 'Simulated — no entity profile found; conservative fallback applied',
    };
  }

  // ── checkEntitySubstance ─────────────────────────────────────────────────────
  //
  // Public method called by the agent loop via the check_entity_substance tool.
  //
  // Phase 6 — live DDQ mode:
  //   If ddqServiceUrl and ddqText are both set (i.e. a ddq_path was in the input
  //   file AND DDQ_SERVICE_URL is in .env), the method forwards the DDQ to the
  //   Python extraction service and returns structured evidence from the real document.
  //   If the service call fails for any reason, it falls back to simulation silently.
  //
  // Simulation fallback:
  //   Delegates to buildEntityProfile() for entity-specific hardcoded data.
  //   This is the same behaviour as Phase 4/5.
  //
  // The method is async because the live DDQ path requires an HTTP round-trip.
  // In simulation mode it still resolves immediately — the Promise wraps a sync value.
  async checkEntitySubstance(entityName: string, country: string): Promise<string> {
    if (!entityName || entityName.trim() === '') {
      return JSON.stringify({ error: 'entity_name must be a non-empty string.' });
    }

    // Phase 6 — live DDQ mode: call the Python extraction service
    if (!this.simulate && this.ddqServiceUrl !== undefined && this.ddqText !== undefined) {
      try {
        // fetch is Node 18+ built-in — no extra dependency needed.
        // The Python service returns JSON matching the SubstanceResult shape.
        const response = await fetch(`${this.ddqServiceUrl}/substance`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            entity_name: entityName,
            country,
            ddq_text: this.ddqText,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return JSON.stringify(await response.json());
      } catch (err) {
        // Graceful fallback: an unstarted or unreachable Python service should
        // never block the TypeScript agent — try the TypeScript extractor next.
        console.warn(
          `[DDQ SERVICE] /substance call failed: ${String(err)}. Trying TypeScript extractor.`
        );
      }
    }

    // Phase 10 — TypeScript extractor: DDQ text present but no Python service running.
    // SubstanceExtractor calls OpenAI directly from Node.js — no Python required.
    // This is the path used after a SubstanceInterviewer chat session.
    if (!this.simulate && this.ddqText !== undefined) {
      try {
        const extractor = new SubstanceExtractor();
        return await extractor.extract(this.ddqText, entityName, country);
      } catch (err) {
        console.warn(
          `[SUBSTANCE EXTRACTOR] Extraction failed: ${String(err)}. Falling back to simulation.`
        );
      }
    }

    // Simulation fallback (or simulate:true mode)
    return JSON.stringify(this.buildEntityProfile(entityName, country));
  }

  // ── analyseDempe ─────────────────────────────────────────────────────────────
  //
  // DEMPE = Development, Enhancement, Maintenance, Protection, Exploitation.
  // This is the OECD BEPS Actions 8–10 framework for determining which entity
  // economically owns an intangible and is therefore entitled to the income it
  // generates (OECD Transfer Pricing Guidelines, Ch. VI, 2022).
  //
  // For WHT purposes, the entity that controls DEMPE functions and bears the
  // associated economic risk is the beneficial owner of the royalty.
  // If it merely holds IP title without controlling DEMPE, it is a conduit.
  //
  // The method also flags the Art. 12 scope question: some older treaties
  // (pre-1977 OECD Model) omit the royalties article entirely, meaning the
  // payment falls to Art. 7 Business Profits — no Polish WHT without a PE.
  //
  // Stays simulated permanently — real DEMPE analysis requires due diligence
  // documentation (DDQs, TP files, functional analyses). Phase 5 will replace
  // this with Python document ingestion.
  async analyseDempe(entityName: string, country: string, ipType: string): Promise<string> {
    const VALID_IP = new Set(['brand', 'technology', 'patent', 'software', 'know_how', 'mixed']);
    if (!VALID_IP.has(ipType.toLowerCase())) {
      return JSON.stringify({
        error: `Unsupported ip_type "${ipType}". Must be one of: brand, technology, patent, software, know_how, mixed.`,
      });
    }

    // Phase 6 — live DDQ mode: call the Python extraction service
    if (!this.simulate && this.ddqServiceUrl !== undefined && this.ddqText !== undefined) {
      try {
        const response = await fetch(`${this.ddqServiceUrl}/dempe`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            entity_name: entityName,
            country,
            ip_type:     ipType,
            ddq_text:    this.ddqText,
          }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return JSON.stringify(await response.json());
      } catch (err) {
        console.warn(
          `[DDQ SERVICE] /dempe call failed: ${String(err)}. Falling back to simulation.`
        );
      }
    }

    return JSON.stringify({
      entity:   entityName,
      country:  country,
      ip_type:  ipType,
      dempe_functions: {
        development:  'Entity directs IP development strategy and controls R&D investment decisions at group level',
        enhancement:  'Entity manages global brand/technology enhancement; local entities implement under central governance',
        maintenance:  'Entity holds IP registrations; maintenance budget and renewal decisions made centrally',
        protection:   'Entity enforces IP rights; trademark and patent litigation managed by group legal team',
        exploitation: 'Entity signs licence agreements with subsidiaries; sets royalty rates and licence terms centrally',
      },
      control_test:
        'PASS — entity makes all key DEMPE decisions; local subsidiaries are operational ' +
        'executors without independent IP decision-making authority',
      risk_bearing:
        'MODERATE — entity bears IP development and obsolescence risk; exploitation risk ' +
        'partially passed to licensees via fixed royalty rates regardless of local profitability',
      beneficial_owner_dempe:
        'STRONG — entity performs and controls DEMPE functions and does not automatically ' +
        'pass royalty income upstream; beneficial owner claim is substantiated from a DEMPE perspective',
      art12_scope_warning:
        'CRITICAL: verify that the applicable treaty contains an Art. 12 royalties article ' +
        'AND that its definition of "royalties" covers this payment type. ' +
        'Treaties predating the 1977 OECD Model Convention may omit Art. 12 entirely. ' +
        'If absent or inapplicable, income falls to Art. 7 Business Profits — ' +
        'Poland has no withholding right unless the recipient has a Polish permanent establishment.',
      source: 'Simulated DEMPE analysis — real analysis requires TP documentation and DDQ (Phase 6)',
    });
  }

  // ── checkDirectiveExemption ───────────────────────────────────────────────────
  //
  // Checks whether the EU Interest and Royalties Directive (Council Directive
  // 2003/49/EC), transposed into Art. 21 of the Polish CIT Act, provides a
  // 0% WHT exemption on the payment.
  //
  // The Directive covers interest and royalties only — dividends are governed
  // by the separate Parent-Subsidiary Directive (90/435/EEC → Art. 22 CIT).
  //
  // Four conditions must ALL be met:
  //   1. Recipient is resident in an EU member state
  //   2. Income type is interest or royalty
  //   3. Recipient holds ≥25% of the payer's shares (or vice-versa, or common parent)
  //   4. Shareholding has been held for ≥2 uninterrupted years
  //
  // Anti-avoidance: Art. 5 of the Directive allows denial for artificial
  // arrangements. In practice this is co-extensive with the MLI PPT — a PPT
  // failure will also cause the Directive exemption to be denied.
  checkDirectiveExemption(
    residenceCountry: string,
    incomeType: string,
    shareholdingPercentage: number,
    holdingYears: number
  ): string {
    // ── Parameter validation ───────────────────────────────────────────────────
    const DIRECTIVE_TYPES = new Set(['interest', 'royalty']);
    if (!DIRECTIVE_TYPES.has(incomeType.toLowerCase())) {
      return JSON.stringify({
        error:
          `Directive only covers interest and royalties, not "${incomeType}". ` +
          'For dividends, see the Parent-Subsidiary Directive (Art. 22 CIT).',
      });
    }
    if (shareholdingPercentage < 0 || shareholdingPercentage > 100) {
      return JSON.stringify({
        error: `shareholding_percentage must be between 0 and 100. Received: ${shareholdingPercentage}.`,
      });
    }
    if (holdingYears < 0) {
      return JSON.stringify({
        error: `holding_years must be 0 or greater. Received: ${holdingYears}.`,
      });
    }

    // EU-27 member states (as of 2026)
    const EU27 = new Set([
      'austria', 'belgium', 'bulgaria', 'croatia', 'cyprus',
      'czech republic', 'czechia', 'denmark', 'estonia', 'finland',
      'france', 'germany', 'greece', 'hungary', 'ireland', 'italy',
      'latvia', 'lithuania', 'luxembourg', 'malta', 'netherlands',
      'poland', 'portugal', 'romania', 'slovakia', 'slovenia',
      'spain', 'sweden',
    ]);

    const country = residenceCountry.toLowerCase();
    const isEU             = EU27.has(country);
    const typeIsCovered    = incomeType === 'interest' || incomeType === 'royalty';
    const shareholdingMet  = shareholdingPercentage >= 25;
    const holdingMet       = holdingYears >= 2;
    const exemptionAvailable = isEU && typeIsCovered && shareholdingMet && holdingMet;

    return JSON.stringify({
      directive:    'EU Interest and Royalties Directive 2003/49/EC',
      legal_basis:  'Art. 21 Polish CIT Act',
      conditions: {
        eu_member_state: {
          required: true,
          met:      isEU,
          value:    residenceCountry,
        },
        income_type_covered: {
          required: true,
          met:      typeIsCovered,
          value:    incomeType,
          note:     'Directive covers interest and royalties only — dividends fall under the Parent-Subsidiary Directive (Art. 22 CIT)',
        },
        shareholding_threshold: {
          required:  true,
          met:       shareholdingMet,
          value:     `${shareholdingPercentage}%`,
          threshold: '25%',
        },
        holding_period: {
          required:  true,
          met:       holdingMet,
          value:     `${holdingYears} year(s)`,
          threshold: '2 uninterrupted years',
        },
      },
      exemption_available: exemptionAvailable,
      exemption_rate:      exemptionAvailable ? 0 : null,
      anti_avoidance_note:
        'Art. 5 of the Directive allows Poland to deny the exemption for artificial ' +
        'arrangements. This test is co-extensive with the MLI PPT: a PPT failure ' +
        'will simultaneously deny the Directive exemption.',
      required_documentation: exemptionAvailable
        ? [
            'Tax Residency Certificate of the recipient (current year)',
            'Proof of shareholding ≥25% held for ≥2 uninterrupted years (share register extract or notarial statement)',
            'Beneficial owner declaration signed by the recipient',
          ]
        : [],
      source: 'Simulated — verify holding period and shareholding structure against company register and intercompany agreements',
    });
  }

  // ── checkPayAndRefund ─────────────────────────────────────────────────────────
  //
  // Checks whether the Polish "Pay and Refund" mechanism (Art. 26 §2c CIT Act,
  // in force since 2019, reinforced 2022) applies to this payment.
  //
  // The mechanism applies when ALL of:
  //   - The recipient is a related party (Art. 11a CIT definition)
  //   - Total payments of this type to this recipient exceed PLN 2,000,000
  //     in the tax year
  //
  // Effect: the Polish payer must withhold at the full domestic rate first
  // (20% for royalties/interest, 19% for dividends), then the recipient
  // claims a refund of the excess over the applicable treaty/directive rate.
  //
  // Two relief options avoid the cash-flow drag:
  //   1. Opinion on WHT Exemption (Art. 26b CIT) — from KAS; valid 36 months
  //   2. WH-OS Management Statement (Art. 26 §7a CIT) — personal liability
  //
  // Pass annual_payment_pln = 0 if the amount is unknown — the method will
  // apply a conservative assumption (threshold exceeded).
  checkPayAndRefund(
    incomeType: string,
    relatedParty: boolean,
    annualPaymentPln: number
  ): string {
    // ── Parameter validation ───────────────────────────────────────────────────
    const VALID_INCOME = new Set(['dividend', 'interest', 'royalty']);
    if (!VALID_INCOME.has(incomeType.toLowerCase())) {
      return JSON.stringify({
        error: `Unsupported income_type "${incomeType}". Must be one of: dividend, interest, royalty.`,
      });
    }
    if (annualPaymentPln < 0) {
      return JSON.stringify({
        error: `annual_payment_pln must be 0 or greater. Pass 0 if unknown. Received: ${annualPaymentPln}.`,
      });
    }

    const THRESHOLD_PLN = 2_000_000;

    // Domestic WHT rates that apply when Pay and Refund is triggered
    const domesticRate: Record<string, number> = {
      royalty:  20,
      interest: 20,
      dividend: 19,
    };
    const rate = domesticRate[incomeType] ?? 20;

    // Conservative: unknown amount (0) is treated as exceeding the threshold
    const exceedsThreshold =
      annualPaymentPln === 0 || annualPaymentPln > THRESHOLD_PLN;
    const applies = relatedParty && exceedsThreshold;

    return JSON.stringify({
      mechanism:   'Pay and Refund (Art. 26 §2c Polish CIT Act)',
      applies:     applies,
      threshold_pln: THRESHOLD_PLN,
      conditions: {
        related_party:      { required: true, met: relatedParty },
        exceeds_threshold:  {
          required:  true,
          met:       exceedsThreshold,
          value_pln: annualPaymentPln === 0
            ? 'unknown — conservative assumption applied'
            : annualPaymentPln,
          threshold: 'PLN 2,000,000 per recipient per tax year',
        },
      },
      domestic_withholding_rate: applies ? `${rate}%` : null,
      mechanism_description: applies
        ? `Polish payer must withhold at the domestic rate of ${rate}% on the full ` +
          'payment. Recipient claims a refund of the excess over the applicable ' +
          'treaty or Directive rate. Significant cash-flow drag — use a relief option.'
        : 'Pay and Refund does not apply — payment is below PLN 2,000,000 or recipient is not a related party.',
      relief_options: applies
        ? [
            {
              option:              'Opinion on WHT Exemption',
              legal_basis:         'Art. 26b Polish CIT Act',
              effect:              'Payer applies reduced treaty/directive rate without upfront withholding',
              issuing_authority:   'Head of National Revenue Administration (KAS)',
              validity:            '36 months from date of issue',
              processing_time:     'Approx. 6 months — apply well in advance of first payment',
            },
            {
              option:      'WH-OS Management Statement',
              legal_basis: 'Art. 26 §7a Polish CIT Act',
              effect:      'Management declares under penalty of perjury that all conditions for the reduced rate are met',
              risk:        'Personal criminal and financial liability of signatories if declaration proves incorrect',
              validity:    '2 months from date of statement — must be renewed for each payment period',
            },
          ]
        : [],
      source: 'Simulated — verify payment amounts against intercompany licence agreements and actual invoices',
    });
  }

  // ── checkMliPpt ──────────────────────────────────────────────────────────────
  //
  // Returns: does the MLI Principal Purpose Test (Article 7) apply to this treaty?
  // VERIFY cases are treated conservatively as NO — the agent should flag this
  // to the user and recommend checking the OECD MLI Matching Database.
  checkMliPpt(residenceCountry: string): string {
    if (this.simulate) {
      const country = residenceCountry.toLowerCase();

      if (country === 'luxembourg') {
        return JSON.stringify({
          mli_applies: true,
          article: 'Article 7 MLI (Principal Purpose Test)',
          effect:
            'Treaty benefit denied if obtaining it was one of the principal ' +
            'purposes of the arrangement.',
          substance_requirements: [
            'Genuine business activity in the residence country',
            'Local board with real decision-making authority',
            'No contractual obligation to pass income upstream',
          ],
          source: 'OECD MLI deposited positions — Poland (2018), Luxembourg (2019)',
        });
      }

      return JSON.stringify({
        mli_applies: false,
        note: `MLI status for ${residenceCountry} not available in simulation.`,
      });
    }

    // ── Live mode ──
    const key = normalise(residenceCountry);
    const entry = this.db[key];

    if (entry === undefined) {
      return JSON.stringify({
        mli_applies: false,
        note: `"${residenceCountry}" not found in treaty database.`,
        source: 'data/treaties.json',
      });
    }

    const pptStatus = entry.mli_ppt_applies;

    // Conservative rule: VERIFY → treat as NO until confirmed via OECD Matching DB
    const applies = pptStatus === 'YES';

    return JSON.stringify({
      mli_applies:     applies,
      mli_ppt_status:  pptStatus,
      flags:           entry.mli_flags,
      note:            entry.mli_note ?? null,
      ...(pptStatus === 'VERIFY' ? {
        caution: 'PPT status unconfirmed — treated as NO pending OECD MLI Matching Database verification.',
      } : {}),
      ...(applies ? {
        article: 'Article 7 MLI (Principal Purpose Test)',
        effect: 'Treaty benefit denied if obtaining it was one of the principal purposes of the arrangement.',
        substance_requirements: [
          'Genuine business activity in the residence country',
          'Local board with real decision-making authority',
          'No contractual obligation to pass income upstream',
        ],
      } : {}),
      source: 'data/treaties.json — OECD MLI Poland positions + MoF synthesized texts',
    });
  }

  // ── factCheckSubstance ───────────────────────────────────────────────────────
  //
  // Phase 7 — delegates to FactCheckerAgent to verify factual claims from the
  // DDQ against public records via Gemini + Google Search grounding.
  //
  // Called by the WHT agent after check_entity_substance returns real DDQ data.
  // The agent is responsible for extracting 3–5 specific verifiable claims from
  // the substance profile and passing them here.
  //
  // Parameter validation:
  //   entity_name  — must be non-empty
  //   claims       — must be a non-empty array of strings
  //
  // Returns a JSON string of FactCheckResult.
  // In simulate mode (or when GEMINI_API_KEY is absent), returns INCONCLUSIVE
  // with all claims marked UNVERIFIED — conservatively safe, never fabricated.
  async factCheckSubstance(
    entityName: string,
    country:    string,
    claims:     string[]
  ): Promise<string> {
    if (!entityName || entityName.trim() === '') {
      return JSON.stringify({ error: 'entity_name must be a non-empty string.' });
    }
    if (!Array.isArray(claims) || claims.length === 0) {
      return JSON.stringify({ error: 'claims must be a non-empty array of strings.' });
    }

    const result = await this.factChecker.verify(entityName, country, claims);
    return JSON.stringify(result);
  }
}
