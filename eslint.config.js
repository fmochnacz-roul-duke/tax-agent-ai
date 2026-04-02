// ESLint flat config (ESLint 10 / @typescript-eslint v8)
//
// Three layers, applied in order:
//   1. ignores  — skip generated and third-party directories
//   2. flat/recommended from @typescript-eslint — parser + TypeScript rules
//   3. eslint-config-prettier — turns off formatting rules that Prettier owns
//
// "flat config" means each entry is a plain object (no extends/plugins strings).
// ESLint merges the entries top-to-bottom; later entries win on rule conflicts.

'use strict';

const tsPlugin      = require('@typescript-eslint/eslint-plugin');
const prettierConfig = require('eslint-config-prettier');

// flat/recommended is an array of three config objects:
//   [0] registers the parser and the @typescript-eslint plugin globally
//   [1] turns off base ESLint rules that TypeScript already handles (e.g. no-undef)
//       restricted to *.ts / *.tsx / *.mts / *.cts files
//   [2] adds the @typescript-eslint recommended rule set
const tsRecommended = tsPlugin.configs['flat/recommended'];

module.exports = [
  // ── 1. Global ignores ─────────────────────────────────────────────────────
  // These paths are never linted, even if matched by a files glob below.
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'reports/**',
      'data/knowledge_base/**',
    ],
  },

  // ── 2. TypeScript recommended rules ───────────────────────────────────────
  // Spread the three flat/recommended config objects so they apply to the whole
  // src/ and scripts/ tree.  The @typescript-eslint rules enforce:
  //   - no-explicit-any  (TypeScript strict already catches this at compile time,
  //                       but lint makes it visible in CI without a full build)
  //   - no-unused-vars   (flag variables that are declared but never read)
  //   - ban-ts-comment   (disallow @ts-ignore without explanation)
  //   and ~30 more common TypeScript pitfalls.
  ...tsRecommended,

  // ── 3. Project-specific rule overrides ────────────────────────────────────
  // Placed after the recommended spread so these take precedence.
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      // Upgrade no-explicit-any from warn → error to match strict: true intent.
      '@typescript-eslint/no-explicit-any': 'error',

      // Allow unused variables that start with _ (conventional placeholder name).
      // Example: catch (err) { ... } where err is intentionally unused — rename to _err.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // This project uses console.log extensively for the CLI and agent loop output.
      // Do not flag it.
      'no-console': 'off',
    },
  },

  // ── 4. Prettier compatibility ──────────────────────────────────────────────
  // Disables every ESLint rule that controls formatting (semicolons, quotes,
  // indentation, etc.) so Prettier can own those decisions without conflicts.
  // This must be the LAST entry so it can override any formatting rules added
  // by the TypeScript recommended config.
  prettierConfig,
];
