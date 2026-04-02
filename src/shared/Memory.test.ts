import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Memory } from './Memory';
import { Message } from './Message';

test('Memory starts empty', () => {
  const memory = new Memory();

  assert.deepEqual(memory.getMessages(), []);
  assert.deepEqual(memory.getFindings(), {});
  assert.equal(memory.buildFindingsSummary(), '');
});

test('addMessage appends to conversation history', () => {
  const memory = new Memory();
  memory.addMessage(Message.user('Hello'));
  memory.addMessage(Message.assistant('Hi'));

  const messages = memory.getMessages();
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[1].role, 'assistant');
});

test('recordFinding stores a key/value pair', () => {
  const memory = new Memory();
  memory.recordFinding('wht_rate', '5%');

  assert.equal(memory.getFindings()['wht_rate'], '5%');
  assert.ok(memory.hasFinding('wht_rate'));
  assert.ok(!memory.hasFinding('nonexistent'));
});

test('getFindings returns a copy — mutations do not affect internal state', () => {
  const memory = new Memory();
  memory.recordFinding('key', 'value');

  const findings = memory.getFindings();
  findings['key'] = 'tampered'; // mutate the returned copy

  // Internal state should be unchanged
  assert.equal(memory.getFindings()['key'], 'value');
});

test('buildFindingsSummary returns empty string when no findings', () => {
  const memory = new Memory();
  assert.equal(memory.buildFindingsSummary(), '');
});

test('buildFindingsSummary includes all recorded findings', () => {
  const memory = new Memory();
  memory.recordFinding('treaty_status', 'confirmed');
  memory.recordFinding('wht_rate', '5%');

  const summary = memory.buildFindingsSummary();
  assert.ok(summary.includes('treaty_status'), 'should include treaty_status key');
  assert.ok(summary.includes('confirmed'), 'should include treaty_status value');
  assert.ok(summary.includes('wht_rate'), 'should include wht_rate key');
  assert.ok(summary.includes('5%'), 'should include wht_rate value');
  assert.ok(summary.includes('## Findings'), 'should include the section heading');
});

test('recordFinding overwrites an existing key', () => {
  const memory = new Memory();
  memory.recordFinding('wht_rate', '15%');
  memory.recordFinding('wht_rate', '5%'); // revised after checking shareholding

  assert.equal(memory.getFindings()['wht_rate'], '5%');
});
