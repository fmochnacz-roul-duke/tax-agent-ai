// ─────────────────────────────────────────────────────────────────────────────
// treaties.json snapshot test
//
// WHY THIS TEST EXISTS
// --------------------
// data/treaties.json is the live treaty database the agent reads at runtime.
// It is manually maintained — no code generates it.  Two things can corrupt it
// silently:
//
//   1. Accidental edits (wrong field, merge conflict, fat-finger during review)
//   2. npm run verify:treaties writing back incorrect data from the Gemini API
//
// Without a guard, a wrong rate (e.g. 15% instead of 5%) would flow straight
// into an agent conclusion with no warning.
//
// HOW IT WORKS
// ------------
// This test hashes the current contents of treaties.json with SHA-256 and
// compares the result to EXPECTED_HASH below.
//
//   - Hash matches → file is unchanged → test passes
//   - Hash differs → something edited the file → test FAILS with a message
//     explaining how to update the snapshot after a deliberate change
//
// This is a *change detector*, not a lock.  The file is still allowed to
// change — but every change must be intentional and reviewed.
//
// HOW TO UPDATE THE SNAPSHOT
// --------------------------
// After a deliberate, verified change to treaties.json (e.g. you confirmed
// a new rate against the official treaty PDF), run:
//
//   npm run test:snapshot:update
//
// That script recomputes the hash and writes the new value into this file.
// Commit both files together so the reviewer can see exactly what changed.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// EXPECTED_HASH is the SHA-256 digest of data/treaties.json at the last known-
// good state.  It is intentionally a plain string constant so it shows up
// clearly in code review diffs when it changes.
//
// To update: run  npm run test:snapshot:update  and commit the result.
const EXPECTED_HASH = '007bba6977dd5c5444b933b165ac42ee42c08336ce6e6dfa2e0f15d06ab85e19';

// Resolve treaties.json relative to the project root, not this test file.
// __dirname here is  src/agents/  — two levels up reaches the project root.
const TREATIES_PATH = path.resolve(__dirname, '..', '..', 'data', 'treaties.json');

test('treaties.json matches expected snapshot hash', () => {
  // Step 1: make sure the file exists at all.
  // If it is missing entirely (e.g. someone deleted it by accident), we want
  // a clear "file not found" error rather than a confusing hash mismatch.
  assert.ok(
    fs.existsSync(TREATIES_PATH),
    `treaties.json not found at ${TREATIES_PATH} — was the file deleted?`
  );

  // Step 2: read the file and compute its SHA-256 hash.
  // We read it as utf-8 text (the same encoding the agent uses at runtime)
  // rather than as raw bytes, so line-ending differences on Windows vs Linux
  // do not cause false failures.
  const content = fs.readFileSync(TREATIES_PATH, 'utf-8');
  const actual = crypto.createHash('sha256').update(content).digest('hex');

  // Step 3: compare.
  // If the hashes differ, the message tells the developer exactly what to do
  // rather than just printing "assertion failed".
  assert.equal(
    actual,
    EXPECTED_HASH,
    [
      'treaties.json has changed since the snapshot was last recorded.',
      '',
      `  Expected hash: ${EXPECTED_HASH}`,
      `  Actual hash:   ${actual}`,
      '',
      'If this change was intentional (e.g. you verified a new rate against',
      'the official treaty PDF), run:',
      '',
      '  npm run test:snapshot:update',
      '',
      'Then commit both treaties.json and this test file together so the',
      'reviewer can see exactly what changed.',
      '',
      'If you did NOT intend to change treaties.json, restore it with:',
      '',
      '  git checkout data/treaties.json',
    ].join('\n')
  );
});
