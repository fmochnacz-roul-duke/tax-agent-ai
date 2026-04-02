// ─────────────────────────────────────────────────────────────────────────────
// SubstanceInterviewer — Phase 10
//
// Conducts a short Mode A substance interview (5 questions) with the user
// via the chat interface, before the WHT agent runs.
//
// WHY THIS EXISTS
// ---------------
// The agent's check_entity_substance tool previously fell back to a CONDUIT
// result for any entity not explicitly hardcoded (Orange S.A. or Alpine
// Holdings). This interviewer collects the minimum facts needed to produce a
// real SubstanceResult for any entity — without requiring a DDQ document or
// the Python extraction service.
//
// HOW IT WORKS
// ------------
// 1. The server transitions the session to 'interviewing' after the user
//    confirms analysis parameters.
// 2. SubstanceInterviewer.start() creates an InterviewState.
// 3. The server sends the first question via getQuestion(state).
// 4. Each user answer is passed to answer(state, text), which either returns
//    the next question (status: 'in_progress') or the compiled DDQ text
//    (status: 'complete').
// 5. The DDQ text is passed to runWhtAnalysis() as the ddqText parameter.
//    The TypeScript SubstanceExtractor (or Python service if running) then
//    converts it into a structured SubstanceResult.
//
// THE FIVE QUESTIONS (Mode A)
// ---------------------------
// Each question maps to one of the three conditions in Art. 4a pkt 29 CIT
// and the substance criteria from MF Objaśnienia podatkowe (2025) §2.2–2.3.
//
//   Q1 → Condition (i): does the entity receive the income for its own benefit?
//   Q2 → Condition (ii): is the entity a conduit / pass-through?
//   Q3 → Condition (iii): does the entity have real economic activity in its
//        country of residence?
//   Q4 → MF Objaśnienia §2.3 substance factors: employees + physical presence
//   Q5 → Due diligence evidence available
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

// InterviewState tracks where we are in the 5-question sequence.
// This object lives on the Session — it is created by start() and mutated by answer().
export interface InterviewState {
  currentQuestionIndex: number; // 0-based; 0..4 are the 5 questions
  answers: string[]; // collected user answers, one per question
  entityName: string;
  country: string;
  incomeType: string;
}

// The server receives one of these after each call to answer().
// If status is 'in_progress', show the next question to the user.
// If status is 'complete', the interview is done — ddqText is ready to use.
export type InterviewResult =
  | { status: 'in_progress'; question: string; questionIndex: number; totalQuestions: number }
  | { status: 'complete'; ddqText: string; summary: string };

// ── Question templates ─────────────────────────────────────────────────────────
//
// Each question is a function that takes (entityName, country, incomeType)
// and returns the question string. Using functions lets us interpolate the
// entity and country name into each question so they feel specific, not generic.

type QuestionFn = (entityName: string, country: string, incomeType: string) => string;

const QUESTIONS: QuestionFn[] = [
  // Q1 — Condition (i): own benefit / right to the income
  // Art. 4a pkt 29 CIT: "receives income for its own benefit"
  // MF Objaśnienia §2.2.2 condition (i): entity has the right to freely use and enjoy the income
  (entity, _country, incomeType) =>
    `Question 1 of 5 — Own benefit (Art. 4a pkt 29 CIT condition i)\n\n` +
    `Does **${entity}** receive this ${incomeType} income for its own benefit? ` +
    `In other words: is it free to decide what to do with the money once received — ` +
    `invest it, distribute it, retain it — or is it contractually or practically ` +
    `obligated to pass it on to another entity (e.g., its parent or ultimate shareholder)?\n\n` +
    `Please describe briefly.`,

  // Q2 — Condition (ii): not a conduit / pass-through
  // MF Objaśnienia §2.2.1: rapid forwarding, nominal margin, pass-through obligation are red flags
  (entity, _country, incomeType) =>
    `Question 2 of 5 — Conduit risk (Art. 4a pkt 29 CIT condition ii)\n\n` +
    `Does **${entity}** bear real economic risk related to this ${incomeType}?\n\n` +
    `For example:\n` +
    `• Interest income: does it bear credit risk on the loan? Does it fund the loan from its own capital?\n` +
    `• Royalty income: does it own and develop the IP, or just hold a licence to sub-licence?\n` +
    `• Dividend income: does it bear investment risk on the shareholding?\n\n` +
    `Or does it receive the ${incomeType} only to immediately forward it upstream with little or no margin?`,

  // Q3 — Condition (iii): genuine economic activity in country of residence
  // MF Objaśnienia §2.2.2 condition (iii): for related parties — real activity in country of residence
  (entity, country, _incomeType) =>
    `Question 3 of 5 — Real economic activity (Art. 4a pkt 29 CIT condition iii)\n\n` +
    `Does **${entity}** carry out genuine economic activity in **${country}**?\n\n` +
    `For related parties, Polish law requires that the entity does more than just hold ` +
    `assets on paper. Signs of real activity include:\n` +
    `• Qualified staff making real management decisions in ${country}\n` +
    `• Physical office (not just a registered address at a service provider)\n` +
    `• Own contracts with third parties\n` +
    `• Board or management meetings actually held in ${country}\n\n` +
    `What can you tell us about ${entity}'s operations in ${country}?`,

  // Q4 — MF Objaśnienia §2.3 substance factors: employees + assets + costs
  (entity, country, _incomeType) =>
    `Question 4 of 5 — Substance factors (MF Objaśnienia §2.3)\n\n` +
    `Please answer the following about **${entity}** in **${country}**:\n\n` +
    `• **Employees**: does it employ its own staff (even part-time or shared), ` +
    `or is it managed entirely by directors from another group entity?\n` +
    `• **Physical office**: does it have its own registered business premises ` +
    `(not just a nominee address at a law firm or service company)?\n` +
    `• **Own assets and costs**: does it incur real operating costs — salaries, ` +
    `rent, professional fees — from its own funds?\n\n` +
    `If you have approximate figures (number of employees, annual operating costs) that is helpful.`,

  // Q5 — Due diligence evidence
  // MF Objaśnienia §4: what documents give the withholding agent legal protection
  (entity, _country, incomeType) =>
    `Question 5 of 5 — Supporting evidence\n\n` +
    `What documents are available to support the BO analysis for **${entity}**?\n\n` +
    `For example:\n` +
    `• BO declaration signed by an authorised representative\n` +
    `• Tax residence certificate (issued within 12 months)\n` +
    `• Financial statements (showing own assets, revenues, costs)\n` +
    `• Employment contracts or org chart showing local staff\n` +
    `• DDQ / substance questionnaire completed by the entity\n` +
    `• Contracts evidencing the ${incomeType} arrangement\n\n` +
    `List what is available — even partially. This affects the confidence level of the analysis.`,
];

const TOTAL_QUESTIONS = QUESTIONS.length; // 5

// ── SubstanceInterviewer ──────────────────────────────────────────────────────

export class SubstanceInterviewer {
  // start() creates a fresh InterviewState for a new entity.
  // Call this when the session transitions to 'interviewing'.
  start(entityName: string, country: string, incomeType: string): InterviewState {
    return {
      currentQuestionIndex: 0,
      answers: [],
      entityName,
      country,
      incomeType,
    };
  }

  // getQuestion() returns the current question text, parameterised with the
  // entity / country / incomeType from the state.
  // Call this immediately after start() to get the first question to show.
  getQuestion(state: InterviewState): string {
    const fn = QUESTIONS[state.currentQuestionIndex];
    if (!fn) {
      // Should not happen if the caller checks isComplete() first
      throw new Error(`No question at index ${state.currentQuestionIndex}`);
    }
    return fn(state.entityName, state.country, state.incomeType);
  }

  // answer() records the user's answer and advances to the next question.
  // Returns InterviewResult — either the next question or the compiled DDQ text.
  //
  // This method MUTATES the state object — that is intentional.
  // The state lives on the session and is updated in place each time the user answers.
  answer(state: InterviewState, userAnswer: string): InterviewResult {
    // Record this answer
    state.answers.push(userAnswer.trim());
    state.currentQuestionIndex += 1;

    if (state.currentQuestionIndex < TOTAL_QUESTIONS) {
      // More questions remain — return the next one
      return {
        status: 'in_progress',
        question: this.getQuestion(state),
        questionIndex: state.currentQuestionIndex, // now 1-based for display
        totalQuestions: TOTAL_QUESTIONS,
      };
    }

    // All 5 answers collected — compile the DDQ text
    const ddqText = this.buildDdqText(state);
    const summary = this.buildSummary(state);
    return { status: 'complete', ddqText, summary };
  }

  // isComplete() lets callers check state without calling answer()
  isComplete(state: InterviewState): boolean {
    return state.currentQuestionIndex >= TOTAL_QUESTIONS;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  // buildDdqText() formats the 5 Q&A pairs into a document that resembles the
  // sample DDQ in data/ddqs/orange_sa_ddq.txt. The SubstanceExtractor (TypeScript)
  // and the Python DDQ service both receive this text and extract a SubstanceResult.
  private buildDdqText(state: InterviewState): string {
    const { entityName, country, incomeType, answers } = state;

    // Generate each question label (without the long explanation, just the section heading)
    const sectionLabels = [
      '1. Own benefit and right to the income (Art. 4a pkt 29 CIT condition i)',
      '2. Economic risk and conduit indicators (Art. 4a pkt 29 CIT condition ii)',
      '3. Genuine economic activity in country of residence (Art. 4a pkt 29 CIT condition iii)',
      '4. Substance factors — employees, physical office, own assets (MF Objaśnienia §2.3)',
      '5. Supporting evidence and due diligence documents',
    ];

    const sections = sectionLabels
      .map((label, i) => `${label}\nAnswer: ${answers[i] ?? '(no answer provided)'}`)
      .join('\n\n');

    return [
      `DUE DILIGENCE QUESTIONNAIRE — SUBSTANCE INTERVIEW`,
      `Entity:      ${entityName}`,
      `Country:     ${country}`,
      `Income type: ${incomeType}`,
      `Source:      Chat interview (Mode A — 5 questions)`,
      ``,
      sections,
    ].join('\n');
  }

  // buildSummary() creates a short human-readable summary shown to the user
  // after the interview completes, before the analysis starts.
  private buildSummary(state: InterviewState): string {
    return (
      `Substance interview complete for **${state.entityName}** (${state.country}).\n\n` +
      `5 answers collected covering: own benefit, economic risk, genuine activity, ` +
      `substance factors, and supporting evidence.\n\n` +
      `Starting WHT analysis now — this may take 30–60 seconds.`
    );
  }
}
