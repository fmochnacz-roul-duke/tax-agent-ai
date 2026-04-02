// updateTreatySnapshot.ts
//
// Recomputes the SHA-256 hash of data/treaties.json and writes the new value
// into src/agents/treaties.snapshot.test.ts.
//
// Run this after a deliberate, verified change to treaties.json:
//
//   npm run test:snapshot:update
//
// Then commit both files together so the reviewer can see exactly what changed.

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const TREATIES_PATH = path.resolve(__dirname, '..', 'data', 'treaties.json');
const SNAPSHOT_TEST_PATH = path.resolve(
  __dirname,
  '..',
  'src',
  'agents',
  'treaties.snapshot.test.ts'
);

// Read and hash treaties.json
if (!fs.existsSync(TREATIES_PATH)) {
  console.error(`Error: treaties.json not found at ${TREATIES_PATH}`);
  process.exit(1);
}

const content = fs.readFileSync(TREATIES_PATH, 'utf-8');
const newHash = crypto.createHash('sha256').update(content).digest('hex');

// Read the current test file
const testSource = fs.readFileSync(SNAPSHOT_TEST_PATH, 'utf-8');

// Replace the EXPECTED_HASH constant value.
// The regex matches the full assignment line so only the hash string changes,
// leaving all the surrounding comments and structure untouched.
const updated = testSource.replace(
  /^const EXPECTED_HASH = '[0-9a-f]+';\s*$/m,
  `const EXPECTED_HASH = '${newHash}';`
);

if (updated === testSource) {
  console.error('Could not find EXPECTED_HASH line in the snapshot test file.');
  console.error('Has the test file been moved or renamed?');
  process.exit(1);
}

fs.writeFileSync(SNAPSHOT_TEST_PATH, updated, 'utf-8');

console.log('Snapshot updated.');
console.log(`  File:     ${TREATIES_PATH}`);
console.log(`  New hash: ${newHash}`);
console.log('');
console.log('Commit both treaties.json and treaties.snapshot.test.ts together.');
