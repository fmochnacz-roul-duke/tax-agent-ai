// ─────────────────────────────────────────────────────────────────────────────
// listUnreviewed.ts — Phase 12b
//
// CLI script: lists all registry entries with review_status = 'draft'.
// A tax professional can run this to see which analyses need human review
// before the conclusions are acted on.
//
// Usage:
//   npm run review:list
//
// Output: formatted table of unreviewed analyses with key metadata.
// If all entries have been reviewed, prints a confirmation message.
// ─────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import { EntityRegistry } from '../src/server/EntityRegistry';

// The EntityRegistry constructor defaults to data/registry.json when called
// with no arguments.  Since npm scripts run from the project root, this works
// without any path manipulation.
const registry = new EntityRegistry();
const drafts = registry.listAll().filter((e) => e.review_status === 'draft');

if (drafts.length === 0) {
  console.log('\n✓ No draft entries — all analyses have been reviewed or signed off.\n');
  process.exit(0);
}

// Print a header line
console.log('\n' + '═'.repeat(60));
console.log(`UNREVIEWED ANALYSES — ${drafts.length} draft(s) pending review`);
console.log('═'.repeat(60));

for (const entry of drafts) {
  // Slice ISO timestamp to YYYY-MM-DD for readability
  const date = entry.updated_at.slice(0, 10);

  console.log(`\n  ${entry.entity_name}  (${entry.country})`);
  console.log(`  ${'─'.repeat(Math.max(entry.entity_name.length + entry.country.length + 4, 30))}`);
  console.log(`  Income type : ${entry.income_type}`);
  console.log(`  Last updated: ${date}`);
  console.log(`  Confidence  : ${entry.data_confidence}`);

  if (entry.substance_tier) {
    console.log(`  Substance   : ${entry.substance_tier}`);
  }
  if (entry.bo_overall) {
    console.log(`  BO outcome  : ${entry.bo_overall}`);
  }

  // Show up to 120 chars of the conclusion for context
  const snippet =
    entry.conclusion_summary.length > 120
      ? entry.conclusion_summary.slice(0, 120) + '...'
      : entry.conclusion_summary;
  console.log(`  Summary     : ${snippet}`);

  if (entry.report_path) {
    // path.relative makes the path shorter in the terminal output
    const rel = path.relative(process.cwd(), entry.report_path);
    console.log(`  Full report : ${rel}`);
  }
}

console.log('\n' + '═'.repeat(60));
console.log('To review via the web UI:  npm start  → click entry in Past Analyses');
console.log('═'.repeat(60) + '\n');
