# Report structure and propagation rules

Reference for `analyze.js`. Read this when tuning the rules or explaining a result.

## Propagation rules

Each rule attaches evidence to a feature with a confidence. Confidence drives the score.

| # | Trigger | Effect | Confidence |
|---|---|---|---|
| 1 | Changed line ranges **overlap** an FR citation range | feature + FR id flagged | direct |
| 2 | Changed file is cited by an FR, ranges do not overlap | feature + FR id flagged | same-file |
| 3 | Reverse-import walk, depth ≤ 2, from each changed file | reached files' features flagged | indirect |
| 4 | A `server/routes/*.js` file changed | its endpoints flagged; `directlyChanged` when the handler line sits in a hunk | direct |
| 5 | A module a route imports changed (e.g. a model) | that route's endpoints flagged | indirect |
| 6 | `server/middleware/auth.js` changed | **every guarded endpoint** flagged | direct, high |
| 7 | Affected endpoint has client callers | caller files → their features → their screens | indirect |
| 8 | `AuthContext.js` / `ProtectedRoute.js` changed | every role-gated screen flagged | direct, high |
| 9 | `Navbar.js` / `App.js` changed | every screen flagged — the shell renders everywhere | indirect |
| 10 | Feature declared as depending on an affected feature | downstream watch list, not scored | advisory |

A file counted as `direct` is removed from the weaker sets, so one file is never
double-counted for the same feature.

## Scoring

```
base  = 3 × |direct files| + 2 × |same-file| + 1 × |indirect files|
score = base
      × 2.0   if authorization code changed AND the feature has a direct hit
      × 1.5   if any affected file appears in tests.coverageGaps
```

| Level | Condition |
|---|---|
| 🔴 High | `score ≥ 8`, or a direct hit while authorization code changed |
| 🟠 Medium | `score ≥ 3` |
| 🟡 Low | otherwise |

Low-risk features get a one-line smoke-test note instead of a full manual walkthrough.

## Change classification

Only `code` and `config` are scored. The rest appears under "Excluded from scoring"
so the reader can see nothing was hidden.

| Category | Matches | Scored |
|---|---|---|
| `code` | `*.js`, `*.jsx` outside tooling dirs | yes |
| `config` | `package.json`, `Dockerfile`, `docker-compose*.yml`, `nginx.conf`, `*.config.js`, `.env*`, `docker/**` | yes |
| `docs` | `*.md`, `*.txt`, `docs/**` | no |
| `asset` | images | no |
| `tooling` | `.claude/`, `.cursor/`, `.github/`, `.impact/`, `.playwright-cli/`, `.vscode/`, `.idea/` | no |
| `other` | anything else | no |

## Section order

| # | Section | Content |
|---|---|---|
| 0 | Changed source | file, status, ±, hunk ranges, declarations touched |
| 1 | Affected features | risk table — the headline for QA |
| 2 | Evidence | per feature: FR ids, file sets, risk modifiers, reasons |
| 3 | API surface | endpoint, guards, directly changed, client callers, why |
| 4 | Screens | URL, component, required role, why |
| 5 | Blast radius | reverse-import tree, depth 2 |
| 6 | QA regression checklist | runnable commands, then manual Given/When/Then |
| 7 | Coverage gaps | affected files with no test at all |
| 8 | Downstream watch list | dependent features from requirements.md §Dependencies |
| — | Excluded from scoring | docs, assets, tooling |

## Command synthesis

| Test location | Command |
|---|---|
| `server/**.test.js` | `cd server && npx jest <path relative to server/>` |
| `client/src/**.test.js` | `cd client && npm test -- --watchAll=false --testPathPattern="<basename>"` |
| `e2e/tests/*.spec.js`, ≤3 matched titles | `cd e2e && npx playwright test <path> -g "<title>"` |
| `e2e/tests/*.spec.js`, more | `cd e2e && npx playwright test <path>` |

e2e titles are resolved by intersecting the acceptance criterion's cited line range
with the `test(...)` line numbers in that spec, with a small tolerance for the
`test.describe` preamble.

## Known limitations

- Line-range matching degrades as `docs/requirements.md` citations drift from the
  code. Rule 2 exists to catch that: a same-file hit still surfaces the feature.
- `changedSymbols` is a nearest-preceding-declaration heuristic; treat it as a hint.
- Platform filtering is documented in requirements but unimplemented, so changes
  near it produce citations that resolve to stubs. Verify before promising coverage.
- The map has no notion of runtime configuration divergence (the client `PORT=5173`
  vs Playwright's `3000`). Port/env problems will not show up here.
