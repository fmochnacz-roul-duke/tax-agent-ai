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
// Where the AgentLanguage abstraction would slot in:
//   A full GAME framework would have an `Environment` base class that the loop
//   calls via an interface. Here we use a single class with a `simulate` flag
//   as a lightweight equivalent — the separation of concerns is preserved
//   without the extra class hierarchy.
// ─────────────────────────────────────────────────────────────────────────────

export interface WhtEnvironmentOptions {
  simulate: boolean;   // true = use hard-coded data; false = call real APIs (not yet implemented)
}

export class WhtEnvironment {
  private simulate: boolean;

  constructor(options: WhtEnvironmentOptions) {
    this.simulate = options.simulate;
    if (!this.simulate) {
      // Placeholder — real API clients (OECD, treaty DB) would be initialised here
      throw new Error('Live mode not yet implemented — set simulate: true');
    }
  }

  // ── checkTreaty ────────────────────────────────────────────────────────────
  checkTreaty(residenceCountry: string): string {
    if (!this.simulate) throw new Error('Live mode not implemented');

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

  // ── getTreatyRate ──────────────────────────────────────────────────────────
  getTreatyRate(
    residenceCountry: string,
    incomeType: string,
    shareholdingPercentage: number
  ): string {
    if (!this.simulate) throw new Error('Live mode not implemented');

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

  // ── checkEntitySubstance ───────────────────────────────────────────────────
  checkEntitySubstance(entityName: string, country: string): string {
    if (!this.simulate) throw new Error('Live mode not implemented');

    return JSON.stringify({
      entity: entityName,
      country: country,
      employees: 3,
      office: 'Own leased premises in Luxembourg City',
      board_meetings: 'Quarterly, majority of directors resident in Luxembourg',
      income_flow: 'Dividend income passed to German parent within 30 days of receipt',
      conduit_risk: 'HIGH — automatic pass-through pattern identified',
      source: 'Simulated due diligence questionnaire response',
    });
  }

  // ── checkMliPpt ────────────────────────────────────────────────────────────
  checkMliPpt(residenceCountry: string): string {
    if (!this.simulate) throw new Error('Live mode not implemented');

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
}
