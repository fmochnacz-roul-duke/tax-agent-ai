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

// ── WhtEnvironment ────────────────────────────────────────────────────────────

export interface WhtEnvironmentOptions {
  simulate: boolean;  // true = use hard-coded data; false = load from treaties.json
}

export class WhtEnvironment {
  private simulate: boolean;
  // db is populated only in live mode; stays empty in simulate mode
  private db: TreatyDatabase = {};

  constructor(options: WhtEnvironmentOptions) {
    this.simulate = options.simulate;

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

  // ── checkEntitySubstance ─────────────────────────────────────────────────────
  //
  // Stays simulated permanently — real substance data comes from due diligence
  // questionnaires (Phase 5, Python document ingestion component).
  checkEntitySubstance(entityName: string, country: string): string {
    return JSON.stringify({
      entity:         entityName,
      country:        country,
      employees:      3,
      office:         'Own leased premises in Luxembourg City',
      board_meetings: 'Quarterly, majority of directors resident in Luxembourg',
      income_flow:    'Dividend income passed to German parent within 30 days of receipt',
      conduit_risk:   'HIGH — automatic pass-through pattern identified',
      source:         'Simulated due diligence questionnaire response',
    });
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
  analyseDempe(entityName: string, country: string, ipType: string): string {
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
      source: 'Simulated DEMPE analysis — real analysis requires TP documentation and DDQ (Phase 5)',
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
}
