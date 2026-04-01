// ─────────────────────────────────────────────────────────────────────────────
// SubstanceInterviewer — unit tests
//
// SubstanceInterviewer is pure logic: no LLM calls, no I/O, no async.
// Every test runs in-process and completes in milliseconds.
//
// Coverage:
//   - start() creates a valid initial state
//   - getQuestion() returns parameterised question text
//   - answer() advances the state correctly through all 5 questions
//   - answer() returns 'complete' with ddqText after the 5th answer
//   - ddqText includes all 5 answers and the entity/country header
//   - isComplete() reflects state correctly before and after all answers
//   - Mutation: state object is updated in place by answer()
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SubstanceInterviewer } from './SubstanceInterviewer';

const ENTITY  = 'XTB Malta Holdings Ltd';
const COUNTRY = 'Malta';
const INCOME  = 'interest';

const ANSWERS = [
  'The entity receives interest for its own benefit and retains it.',
  'It bears full credit risk on the loan. No back-to-back arrangement.',
  'Has 3 employees in Malta, board meetings held in Valletta.',
  'Owns its own office in Valletta. Incurs EUR 120k annual operating costs.',
  'BO declaration and tax residence certificate available. No DDQ yet.',
];

describe('SubstanceInterviewer', () => {

  it('start() creates state with index 0 and empty answers', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    assert.equal(state.currentQuestionIndex, 0);
    assert.deepEqual(state.answers, []);
    assert.equal(state.entityName, ENTITY);
    assert.equal(state.country, COUNTRY);
    assert.equal(state.incomeType, INCOME);
  });

  it('getQuestion(state) returns a non-empty string', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);
    const q     = iv.getQuestion(state);

    assert.ok(typeof q === 'string' && q.length > 0);
  });

  it('getQuestion() includes the entity name and country', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);
    const q     = iv.getQuestion(state);

    assert.ok(q.includes(ENTITY),  'Question should mention entity name');
    assert.ok(q.includes(COUNTRY), 'Question should mention country');
  });

  it('isComplete() is false at start', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);
    assert.equal(iv.isComplete(state), false);
  });

  it('answer() to Q1 returns in_progress with Q2', () => {
    const iv     = new SubstanceInterviewer();
    const state  = iv.start(ENTITY, COUNTRY, INCOME);
    const result = iv.answer(state, ANSWERS[0]!);

    assert.equal(result.status, 'in_progress');
    if (result.status === 'in_progress') {
      assert.equal(result.questionIndex,  1);
      assert.equal(result.totalQuestions, 5);
      assert.ok(result.question.length > 0);
    }
  });

  it('answer() advances state index on each call', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    for (let i = 0; i < 4; i++) {
      iv.answer(state, ANSWERS[i]!);
      assert.equal(state.currentQuestionIndex, i + 1);
    }
  });

  it('answer() accumulates answers in state', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    for (let i = 0; i < 4; i++) {
      iv.answer(state, ANSWERS[i]!);
    }
    assert.equal(state.answers.length, 4);
    assert.equal(state.answers[0], ANSWERS[0]);
    assert.equal(state.answers[3], ANSWERS[3]);
  });

  it('answer() to Q5 returns complete with ddqText and summary', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    let result: ReturnType<typeof iv.answer> | undefined;
    for (let i = 0; i < 5; i++) {
      result = iv.answer(state, ANSWERS[i]!);
    }

    assert.ok(result !== undefined);
    assert.equal(result.status, 'complete');
    if (result.status === 'complete') {
      assert.ok(result.ddqText.length > 0,  'ddqText should be non-empty');
      assert.ok(result.summary.length > 0,  'summary should be non-empty');
    }
  });

  it('isComplete() is true after all 5 answers', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    for (const answer of ANSWERS) {
      iv.answer(state, answer);
    }
    assert.equal(iv.isComplete(state), true);
  });

  it('ddqText contains entity name, country, and income type', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    let result: ReturnType<typeof iv.answer> | undefined;
    for (const answer of ANSWERS) {
      result = iv.answer(state, answer);
    }

    assert.ok(result !== undefined);
    assert.equal(result.status, 'complete');
    if (result!.status === 'complete') {
      assert.ok(result.ddqText.includes(ENTITY),  'ddqText should include entity name');
      assert.ok(result.ddqText.includes(COUNTRY), 'ddqText should include country');
      assert.ok(result.ddqText.includes(INCOME),  'ddqText should include income type');
    }
  });

  it('ddqText contains all 5 user answers', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    let result: ReturnType<typeof iv.answer> | undefined;
    for (const answer of ANSWERS) {
      result = iv.answer(state, answer);
    }

    assert.ok(result !== undefined);
    assert.equal(result.status, 'complete');
    if (result!.status === 'complete') {
      for (const answer of ANSWERS) {
        assert.ok(
          result.ddqText.includes(answer),
          `ddqText should contain answer: "${answer.slice(0, 40)}..."`
        );
      }
    }
  });

  it('answer() trims whitespace from user input', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    iv.answer(state, '  answer with spaces  ');
    assert.equal(state.answers[0], 'answer with spaces');
  });

  it('summary mentions entity name', () => {
    const iv    = new SubstanceInterviewer();
    const state = iv.start(ENTITY, COUNTRY, INCOME);

    let result: ReturnType<typeof iv.answer> | undefined;
    for (const answer of ANSWERS) {
      result = iv.answer(state, answer);
    }

    assert.ok(result !== undefined);
    assert.equal(result.status, 'complete');
    if (result!.status === 'complete') {
      assert.ok(result.summary.includes(ENTITY));
    }
  });

});
