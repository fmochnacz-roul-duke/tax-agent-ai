# Contributing to tax-agent-ai

This is primarily a solo MBA research project. This guide documents the standards applied
consistently across all sessions — it helps future collaborators (and future-me) get up to
speed quickly.

---

## Prerequisites

| Tool | Version | Required? |
|---|---|---|
| Node.js | 18+ | Required |
| npm | 9+ | Required |
| OpenAI API key | — | Required (`OPENAI_API_KEY` in `.env`) |
| Python 3.10+ | — | Optional (DDQ extraction service only) |
| Gemini API key | — | Optional (FactChecker + TreatyVerifier) |

---

## Quickstart

```bash
git clone https://github.com/fmochnacz-roul-duke/tax-agent-ai.git
cd tax-agent-ai
npm install
cp .env.example .env        # fill in OPENAI_API_KEY at minimum
npm run build               # must produce zero TypeScript errors
npm test                    # must pass all tests (~5s, no API calls)
npm start                   # web UI at http://localhost:3000
```

---

## Before every commit

These two commands **must both pass** before any commit reaches `master`.
TypeScript errors and test failures are blocking — not warnings.

```bash
npm run build     # tsc --noEmit — zero errors required
npm test          # all tests must pass (currently 326)
```

Optionally run lint as well:

```bash
npm run lint      # ESLint + Prettier check
```

---

## Branch naming

Every piece of work — including documentation — happens on a dedicated branch.
**Never commit directly to `master`.**

```
feature/phase-16-legal-hierarchy
docs/phase-16-docs3
fix/treaty-snapshot-hash
qa/negative-tests
```

Merge to `master` before starting the next branch.

---

## Opening a pull request

1. Run `npm run build` and `npm test` — both must be clean.
2. Push your branch: `git push -u origin <branch-name>`.
3. Open a PR against `master`.
4. Use the PR template in `.github/pull_request_template.md`.
5. Include in the PR description:
   - Which phase this implements (if applicable)
   - What tests were added or changed
   - Any `npm run eval` results (if agent loop or goals were changed)

---

## Proposing a roadmap change

Phases are defined in `CLAUDE.md` (the source of truth) and summarised in `README.md`
and `SESSION.md`. To propose a change:

1. Open a GitHub issue with the label `roadmap`.
2. Describe: what problem it solves, which existing phase it replaces or extends, and
   where in the arc sequence it belongs.
3. Do not start coding until the issue is discussed and the phase is added to `CLAUDE.md`.

---

## Key conventions (summary)

Full conventions are in [CLAUDE.md](./CLAUDE.md). Short version:

- `strict: true` — never use `any`; use `unknown` and narrow explicitly
- All imports from `'../shared'` (not individual files)
- `async/await` for all LLM and Environment calls
- All tool implementations go in `WhtEnvironment` — never inline in the loop
- Every tool result must include a `source` field
- Test pure components (Environment, Memory, Goal) without LLM calls
- Never commit `.env` — only `.env.example` is committed

---

## Security

See [SECURITY.md](./SECURITY.md) for:
- API key handling rules
- PII guidance
- Dependency hygiene
- Responsible disclosure

---

## Questions?

Open an issue on GitHub:
[github.com/fmochnacz-roul-duke/tax-agent-ai/issues](https://github.com/fmochnacz-roul-duke/tax-agent-ai/issues)
