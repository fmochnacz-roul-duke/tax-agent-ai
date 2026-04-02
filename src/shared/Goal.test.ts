// node:test is Node 18's built-in test runner — no extra dependencies needed.
// `test` registers a test case; `assert` provides assertion helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from './Goal';
import type { Goal } from './Goal';

test('buildSystemPrompt includes the persona', () => {
  const goals: Goal[] = [{ name: 'Do thing', description: 'Do it well', priority: 1 }];
  const prompt = buildSystemPrompt('You are an expert.', goals);

  assert.ok(prompt.includes('You are an expert.'), 'persona should appear in prompt');
});

test('buildSystemPrompt sorts goals highest priority first', () => {
  const goals: Goal[] = [
    { name: 'Low', description: 'Low priority task', priority: 1 },
    { name: 'High', description: 'High priority task', priority: 10 },
    { name: 'Medium', description: 'Medium priority task', priority: 5 },
  ];

  const prompt = buildSystemPrompt('Persona.', goals);

  const highPos = prompt.indexOf('High');
  const mediumPos = prompt.indexOf('Medium');
  const lowPos = prompt.indexOf('Low');

  assert.ok(highPos < mediumPos, 'High should appear before Medium');
  assert.ok(mediumPos < lowPos, 'Medium should appear before Low');
});

test('buildSystemPrompt handles goals with no priority (defaults to 0)', () => {
  const goals: Goal[] = [
    { name: 'NoPriority', description: 'No priority set' },
    { name: 'HasPriority', description: 'Priority set', priority: 5 },
  ];

  const prompt = buildSystemPrompt('Persona.', goals);

  const hasPos = prompt.indexOf('HasPriority');
  const noPos = prompt.indexOf('NoPriority');

  assert.ok(hasPos < noPos, 'Goal with priority 5 should appear before goal with priority 0');
});

test('buildSystemPrompt includes all goal names', () => {
  const goals: Goal[] = [
    { name: 'Verify treaty', description: 'Check treaty', priority: 10 },
    { name: 'Determine rate', description: 'Find the rate', priority: 8 },
  ];

  const prompt = buildSystemPrompt('Tax advisor.', goals);

  assert.ok(prompt.includes('Verify treaty'), 'should include goal name 1');
  assert.ok(prompt.includes('Determine rate'), 'should include goal name 2');
});
