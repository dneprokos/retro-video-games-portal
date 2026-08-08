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

## Your job after the script runs

**The script cannot read intent.** It knows `server/routes/auth.js` changed; it does
not know whether that was a Swagger comment block or the token expiry check. Always:

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
| 0. Changed source | what to `git diff` before trusting anything below |
| 1. Affected features | the headline — hand this to QA |
| 2. Evidence | why each feature was flagged, per requirement ID |
| 3. API surface | endpoints to re-test, with their guards and callers |
| 4. Screens | user-visible URLs and the role needed to reach them |
| 5. Blast radius | reverse imports, depth 2 |
| 6. Checklist | commands first, then manual Given/When/Then |
| 7. Coverage gaps | affected files with zero automated tests |
| 8. Downstream watch list | features declared dependent in requirements.md |

## Scoring

`3×direct + 2×same-file + 1×indirect`, then `×2` if authorization code changed and
`×1.5` if affected files have no test. High ≥ 8, Medium ≥ 3, else Low. A direct hit
combined with an auth change is always High.

Full rule table: `references/report-template.md`.

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
