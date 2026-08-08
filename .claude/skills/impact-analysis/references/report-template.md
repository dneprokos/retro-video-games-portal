# Report structure and propagation rules

Reference for `analyze.js`. Read this when tuning the rules or explaining a result.

## Propagation rules

Each rule attaches evidence to a feature with a confidence. Confidence drives the score.

Rule 0 runs first and can demote everything below it.

| # | Trigger | Effect | Confidence |
|---|---|---|---|
| 0 | Changed file's hunks contain **no executable line** (`commentOnly`) | feature flagged as annotation; no propagation through imports or to callers | annotation |
| 1 | Changed **base-side** line ranges overlap an FR citation range | feature + FR id flagged | direct |
| 2 | Changed file is cited by an FR, ranges do not overlap | feature + FR id flagged | same-file |
| 3 | Reverse-import walk, depth ≤ 2, from each changed file | reached files' features flagged | indirect |
| 4 | A `server/routes/*.js` file changed | its endpoints flagged; `directlyChanged` when the handler line sits in a hunk | direct |
| 5 | A module a route imports changed (e.g. a model) | that route's endpoints flagged | indirect |
| 5a | …unless the changed import is itself a route module | **not** flagged — `server.js` mounting a router is not a behavioural dependency, and that router's own endpoints are already covered by rule 4 | — |
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

## Line coordinates

A diff hunk header carries both sides: `@@ -oldStart,oldCount +newStart,newCount @@`.
`collect-changes.js` records both.

| Field | Coordinates | Used for |
|---|---|---|
| `ranges` | post-change | section 0, endpoint-handler proximity, symbol lookup — anything a reader will open the current file to check |
| `baseRanges` | base revision | the requirement-citation join, and intent attribution |

Requirement citations are written against the base revision, so joining them against
post-change numbers reports every requirement below an insertion point as directly
changed — a 20-line insert at line 55 "touches" a requirement cited at 60-70 that it
never came near. Rule 1 therefore reads `baseRanges`.

A pure insertion reports `-N,0`: it occupies no base line, so it is anchored to the
seam `[N, N+1]`. A pure deletion reports `+M,0` and is anchored to `[M, M]`.

**One diff, one coordinate space.** The default scope runs `git diff <base>`, which
spans merge-base → working tree in a single pass. The earlier design merged three
diffs (`base...HEAD`, `--cached`, unstaged); each numbers the same file against a
different revision, so unioning their ranges described no revision at all. Where the
edits live is now reported separately as `origin`, via `--name-only` calls.

Caveat: under `--staged` the diff is `HEAD` → index, so base-side numbers are
`HEAD`-relative. Attribution is exact only when `HEAD` is the base.

## Plain-English intents

`INTENT_RULES` in `collect-changes.js` matches every touched line against the shapes
that have a user-visible consequence: `router.<verb>`, `query()`/`body()`/`param()`,
`filter.x =`, `.withMessage()`, `res.status()`, `<label>`, `data-testid`,
`schema.index()`, `it()`/`test()`. Each match records its kind, value, and both line
numbers.

- A value appearing on **both** sides of the diff becomes `changed`, not `added` —
  reformatting must not read as a new feature.
- Intents are dropped for non-runtime files. Left in, this skill's own rule source
  matches every rule it defines and the report announces a field labelled `]*>\s*([^`.
- `api-param` names the endpoint whose declaration most recently precedes the line,
  not every endpoint in the file.

### Attribution

A busy route file carries requirements from eight features. Repeating the same three
sentences under all eight tells QA nothing, so each intent gets one owner:

| Order | Rule |
|---|---|
| 1 | The **tightest** citation range containing the line |
| 2 | Tie on width → the feature with the most citations in that file |
| 3 | A whole-file citation (no line range) |
| 4 | The nearest citation, if within `NEAR_CITATION_LINES` (60) |
| 5 | Otherwise unattributed → "Not tied to a single feature" |

Sentences are then deduplicated globally, so a change appears once, under its
highest-risk owner. The section says so in a standing note.

## Notes turned into lies

`build-map.js` collects every source line matching "not implemented" / "no-op" /
"placeholder" / "TODO" / "FIXME" into `staleMarkers` (capped at 200, prose lines only).
`analyze.js` flags a marker when **all** hold:

- its file is **not** in this diff
- its text mentions a term (≥ 5 characters, not in `TERM_STOPLIST`) drawn from an
  added *surface* intent — `api-param`, `route`, `ui-label`, `ui-control`, `db-index`

Test titles and error strings are deliberately excluded from term extraction: they are
generic enough to match almost any TODO.

This is the one staleness class no test run can catch. A page object whose
`filterByPlatform` logs "not implemented" keeps passing after platform filtering
ships, and the E2E suite stays green while covering nothing.

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
| — | What changed — in plain English | QA-facing sentences from the diff intents, grouped by owning feature |
| 0 | Changed source | `code` files only — file, status, ±, kind (comments vs code), post-change hunk ranges, declarations touched. Config is excluded: it has its own section, and a `.json` file has no comment syntax for the `Kind` column to reason about |
| 1 | Affected features | risk table — the headline for QA |
| — | Configuration & environment | config files with catalogued impact; rendered even when no feature is hit |
| 2 | Evidence | per feature: FR ids, file sets, risk modifiers, reasons |
| 3 | API surface | endpoint, guards, directly changed, client callers, why |
| 4 | Screens | URL, component, required role, why |
| 5 | Blast radius | reverse-import tree, depth 2 |
| 6 | QA regression checklist | runnable commands, then manual Given/When/Then |
| 7 | Coverage gaps | affected files with no test at all |
| — | ⚠️ Notes turned into lies | unchanged stubs claiming the new behaviour does not exist |
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
The suite covers range parsing, path classification, diff parsing on both sides of the
hunk header, comment detection, intent extraction and reconciliation, every attribution
tiebreak, every propagation rule, the scoring buckets, and the report-rendering paths.

The `git()` helper takes an **argument array** and executes without a shell, so a ref
passed via `--base` cannot be interpolated into a command. Passing a string throws.

## Known limitations

- Base coordinates correct for **this branch's** line shifts. They cannot correct a
  citation that was already stale on `main`; that shows up as a feature flagged for a
  change it never touched, and the fix is in `docs/requirements.md`.
- Under `--staged`, base-side numbers are relative to `HEAD`, not the merge-base.
- `e2eForFeature` still matches citation ranges against **current** spec line numbers.
  Exact for unchanged specs, approximate for specs this branch edited.
- Intent extraction is regex over single lines: a parameter registered across two
  lines, or a label built from a variable, is invisible. Absence from the plain-English
  section is not evidence a change is invisible to users.
- `changedSymbols` is a nearest-preceding-declaration heuristic; treat it as a hint.
- The map has no notion of runtime configuration divergence (the client `PORT=5173`
  vs Playwright's `3000`). Port/env problems will not show up here.
