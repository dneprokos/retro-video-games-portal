---
name: impact-analysis
description: Analyze what the current branch changed and produce a QA regression scope — affected features (F-01…F-15), API endpoints, UI screens, blast radius, and a ranked checklist of tests to run. Use when asked "what did this branch break", "what should QA test", "impact analysis", "regression scope", "what areas are affected", or before opening a PR / handing work to QA.
---

# Impact Analysis

Turns a branch diff into a QA regression scope. Three scripts do the mechanical
work; you supply the judgement the scripts cannot.

## Run it

```bash
node .claude/skills/impact-analysis/scripts/analyze.js
```

That refreshes both inputs and writes `.impact/impact-report.md`. Options:

| Flag | Effect |
|---|---|
| `--base <ref>` | Compare against something other than `main` |
| `--committed-only` | Three-dot diff only — what the PR would show, ignoring working-tree edits |
| `--staged` | Staged changes only |
| `--no-refresh` | Reuse the existing `.impact/*.json` instead of regenerating |

Individual stages, if you need them:

```bash
node .claude/skills/impact-analysis/scripts/build-map.js        # .impact/impact-map.json
node .claude/skills/impact-analysis/scripts/collect-changes.js  # .impact/changes.json
npm run impact:test                                             # the analyzer's own tests
```

Everything under `.impact/` is generated and gitignored.

## How the dictionary is built

Nothing is hand-maintained. `build-map.js` extracts it from the repo:

| Source | What it yields |
|---|---|
| `docs/requirements.md` | 15 features, 179 FRs, 96 acceptance criteria — **each ending in a `file:line-range` citation** |
| relative `require`/`import` | forward + reverse dependency graph |
| `server/routes/*.js` + `server.js` mounts | endpoint table with auth guards |
| `client/src/**` axios calls + `App.js` | endpoint → caller → user-visible URL |
| `*.test.js`, `e2e/tests/*.spec.js` | test → source links, and the coverage gaps |

The requirement citations are what make this precise: a diff hunk that overlaps
`server/models/Game.js:72-81` resolves to FR-01.5, which resolves to F-01, which
resolves to the acceptance criteria and e2e specs that prove it.

### Line numbers are compared in base coordinates

Citations in `docs/requirements.md` are written against the **base** revision. A
diff reports both sides, and the join uses the base side (`baseRanges`) — never
the post-change side. Inserting 20 lines at the top of a file shifts everything
below it, and comparing shifted numbers against unshifted citations reports every
requirement under the insertion point as "directly changed". Section 0 still
prints post-change ranges, because that is what you need to open the file.

For the same reason `collect-changes.js` runs **one** diff (`git diff <base>`,
spanning merge-base → working tree) rather than merging the committed, staged and
unstaged diffs: those three number the same file against three different
revisions, and unioning their ranges describes no revision at all. Where the edits
live is reported separately, as the `origin` field.

## Comment-only changes

`collect-changes.js` classifies every touched line. A file whose hunks contain no
executable line is marked `commentOnly` and is treated as an **annotation** hit:

- it produces no direct or same-file requirement hit, only an `annotation` one
- it does not propagate through the import graph or to client callers
- any feature whose evidence is purely annotations is forced to **Low**
- its endpoints show `📝 docs only` in section 3
- if the whole branch is comment-only, the report opens with a banner saying so

That covers the common Swagger/JSDoc-documentation branch automatically. It does not
replace reading the diff — a `commentOnly` verdict is a strong hint, not proof.

## The plain-English section

The report opens with **What changed — in plain English**, written for a tester
who does not read code. It is generated from the diff by pattern-matching the
shapes that have a user-visible consequence:

| Detected | Reported as |
|---|---|
| `router.<verb>('/path'` | a new or removed API endpoint |
| `query('x')` / `body('x')` | the endpoint that line sits under accepts a new parameter |
| `filter.x = …` | results can now be narrowed by `x` |
| `.withMessage('…')` | a request can now be refused with that message |
| `res.status(NNN)` | a new response path |
| `<label>Text</label>` | a new field on the page that renders it |
| `data-testid="x"` | a new control, when no label was touched |
| `schema.index({ x: 1 })` | an index — speed, not results |
| `it('…')` / `test('…')` | new automated checks, by name |

Each sentence appears **once**, under the feature whose citation covers its line
most precisely: tightest range wins, then the feature most invested in that file,
then a whole-file citation, then the nearest citation within 60 lines. Past that
it goes to "Not tied to a single feature" rather than being filed under a
requirement it never touched.

Intents are only extracted from runtime files. Tooling is skipped — left in, this
skill's own `INTENT_RULES` source matches every rule it defines.

## Notes this change may have turned into lies

`build-map.js` collects every "not implemented yet" / "no-op" / "TODO" note in the
source. The analyzer cross-checks them against the surface this branch actually
built and flags any that sit in an **unchanged** file yet mention the new term.

This is the one staleness class no test run can catch: a stub asserting a feature
is missing keeps passing after the feature ships. Only surface-level intents
(params, routes, labels, controls, indexes) contribute terms — test titles and
error strings are too generic to prove a match.

## Your job after the script runs

**The script cannot read intent.** It knows `server/routes/auth.js` changed and whether
the hunks were comments; it does not know whether a changed validation rule is a
tightening or a loosening. Always:

1. Read `.impact/impact-report.md`, section **0. Changed source** — that lists each
   changed file with its hunk ranges and the declarations touched.
2. `git diff <base>...HEAD -- <file>` for **every file in section 0**. Read the actual hunks.
3. Adjust the risk levels, with one line of justification each:
   - comments / JSDoc / Swagger annotations only → downgrade to Low, note "documentation-only"
   - validation rules, auth guards, status codes, query shape → keep or upgrade
   - anything touching `server/middleware/auth.js`, `AuthContext.js` or `ProtectedRoute.js`
     → High regardless of size
4. Rewrite section 6 so the checklist reflects the real change, not the file's whole
   requirement surface.
5. Save the edited report back to `.impact/impact-report.md`.

Report to the user in ≤15 lines: risk per feature, the commands to run, and the
coverage gaps. Do not paste the whole report — point at the file.

## Reading the output

| Section | Use |
|---|---|
| What changed — in plain English | the QA-facing summary; hand this to a non-technical reader |
| 0. Changed source | what to `git diff` before trusting anything below; `Kind` column says comments vs code. Source only — config has its own section |
| 1. Affected features | the headline — hand this to QA |
| Configuration & environment | config files the requirement map cannot reach, with their known implications |
| 2. Evidence | why each feature was flagged, per requirement ID |
| 3. API surface | endpoints to re-test, with their guards and callers |
| 4. Screens | user-visible URLs and the role needed to reach them |
| 5. Blast radius | reverse imports, depth 2 |
| 6. Checklist | commands first, then manual Given/When/Then |
| 7. Coverage gaps | affected files with zero automated tests |
| ⚠️ Notes turned into lies | unchanged stubs that claim the new behaviour does not exist |
| 8. Downstream watch list | features declared dependent in requirements.md |

## Scoring

`3×direct + 2×same-file + 1×indirect + 0.5×annotation`, then `×2` if authorization code
changed and `×1.5` if affected files have no test. High ≥ 8, Medium ≥ 3, else Low.
A direct hit combined with an auth change is always High; annotation-only evidence is
always Low.

Full rule table: `references/report-template.md`.

## Tests

`npm run impact:test` — 42 tests on the Node built-in runner, no dependency. They run
against synthetic map/diff fixtures rather than the live repo, so they stay valid as
the application changes. Add a case whenever you touch a propagation rule.

## Troubleshooting

**"0 features, 0 FRs"** — `docs/requirements.md` moved or its heading format changed.
The extractor keys on `### F-NN: Title` and `**FR-NN.M**`.

**"WARNING: N citation(s) point at missing files"** — a requirement cites a path that
no longer exists. Fix the citation in `docs/requirements.md`; the map is only as good
as it is.

**A changed file produces no hits** — it has no requirement citation, no importers, no
route and no axios call. Either it is genuinely inert, or `docs/requirements.md` needs
a citation added for it. Say so in the report rather than silently reporting no impact.

**Report flags everything** — check whether the diff base is right. On a branch far
behind `main`, `--base origin/main` gives a cleaner merge-base.

**A requirement is flagged that the diff plainly never touched** — the citation in
`docs/requirements.md` is stale relative to the base revision. The base-coordinate
join corrects for the branch's own line shifts, not for citations that were already
wrong before the branch started. Fix the citation.

**The plain-English section says nothing about a real change** — no `INTENT_RULES`
pattern matched it. That is a gap in the rules, not proof the change is invisible;
describe it yourself and consider adding a rule.

**`--staged` scope** — the staged diff numbers files against `HEAD`, not the
merge-base, so requirement attribution is only exact when `HEAD` is the base. The
default scope has no such caveat.
