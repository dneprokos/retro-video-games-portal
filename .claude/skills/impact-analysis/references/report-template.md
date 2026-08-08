# Report structure and propagation rules

Reference for `analyze.js`. Read this when tuning the rules or explaining a result.

## Propagation rules

Each rule attaches evidence to a feature with a confidence. Confidence drives the score.

Rule 0 runs first and can demote everything below it.

| # | Trigger | Effect | Confidence |
|---|---|---|---|
| 0 | Changed file's hunks contain **no executable line** (`commentOnly`) | feature flagged as annotation; no propagation through imports or to callers | annotation |
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
base  = 3 × |direct| + 2 × |same-file| + 1 × |indirect| + 0.5 × |annotation|
score = base
      × 2.0   if authorization code changed AND the feature has a direct hit
      × 1.5   if any affected file appears in tests.coverageGaps
```

| Level | Condition |
|---|---|
| 🔴 High | `score ≥ 8`, or a direct hit while authorization code changed |
| 🟠 Medium | `score ≥ 3` |
| 🟡 Low | otherwise, **or** evidence made entirely of annotation hits |

A file appears in exactly one bucket: direct beats same-file beats indirect beats
annotation. Low-risk features get a one-line smoke-test note instead of a full manual
walkthrough.

## Comment-only classification

`collect-changes.js` reads the hunk bodies, not just the `@@` headers, and counts each
touched line as comment or code via `lib.isCommentLine` (blank, `//`, `/*`, `*`, `*/`).
`commentOnly` is set when a JS file has `commentLines > 0 && codeLines === 0`.

Consequences, all asserted in `impact.test.js`:

- no direct/same-file hit, only annotation
- excluded from the reverse-import walk — importers see unchanged exports
- its endpoints are marked `annotationOnly`, and do not drag in client callers or screens
- features with only annotation evidence are forced to Low
- a wholly comment-only branch gets a banner at the top of the report

Known limit: a template-literal continuation line beginning with `*` is misread as a
comment. The agent's diff read is the backstop.

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
| — | Banner | shown only when every runtime file is comment-only |
| 0 | Changed source | file, status, ±, kind (comments vs code), hunk ranges, declarations touched |
| 1 | Affected features | risk table — the headline for QA |
| — | Configuration & environment | config files with catalogued impact; rendered even when no feature is hit |
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

## Configuration impact catalogue

Config files carry no requirement citation and no importer, so the join can never
reach them. `analyze.js` holds an ordered pattern list (`CONFIG_IMPACT`, most specific
first) mapping each to its QA implication — `package.json` → reinstall and run the
suite, `nginx.conf` → verify the proxy path, `playwright.config.js` → the whole e2e
suite is invalidated, and so on. An unmatched config file is reported as needing a
manual decision, never as "no impact".

## Tests

`npm run impact:test`. Node's built-in runner, synthetic fixtures, no dependency.
The suite covers range parsing, path classification, diff parsing, comment detection,
every propagation rule, the scoring buckets, and three report-rendering paths.

The `git()` helper takes an **argument array** and executes without a shell, so a ref
passed via `--base` cannot be interpolated into a command. Passing a string throws.

## Known limitations

- Line-range matching degrades as `docs/requirements.md` citations drift from the
  code. Rule 2 exists to catch that: a same-file hit still surfaces the feature.
- `changedSymbols` is a nearest-preceding-declaration heuristic; treat it as a hint.
- Platform filtering is documented in requirements but unimplemented, so changes
  near it produce citations that resolve to stubs. Verify before promising coverage.
- The map has no notion of runtime configuration divergence (the client `PORT=5173`
  vs Playwright's `3000`). Port/env problems will not show up here.
