---
name: static-defect-scan
description: Hunt latent defects in the code as it stands, without running it — cross-layer validation mismatches, missing boundary values, untested equivalence partitions and role combinations, and mechanical security checks. Use when asked to "find bugs", "static analysis", "check boundary values", "equivalence partitioning", "what could break", "audit this feature", "security scan", or to review a feature for defects before writing tests.
---

# Static Defect Scan

Answers *what is already broken?* — the question `impact-analysis` does not ask.
Where that skill takes a diff and reports regression scope, this one takes the
code as it stands and applies test-design technique to it.

## Run it

```bash
npm run scan
```

Writes `.static-scan/scan-report.md` and `.static-scan/findings.json`. Options:

| Flag | Effect |
|---|---|
| `--pack <list>` | `contract`, `boundary`, `partition`, `security` — default all |
| `--path <file>` | only findings touching this file (repeatable) |
| `--feature <F-NN>` | only the files `docs/requirements.md` cites for that feature |
| `--resource <Name>` | one model and the routes that use it, e.g. `Game` |
| `--severity <level>` | `high`, `medium` or `low` floor |
| `--no-refresh` | reuse the existing `.static-scan/contract-map.json` |
| `--json` | findings only, no markdown |

Stages, if you need one on its own:

```bash
node .claude/skills/static-defect-scan/scripts/build-contract-map.js   # .static-scan/contract-map.json
npm run scan:test                                                      # the scanner's own tests
```

Everything under `.static-scan/` is generated and gitignored.

## Why this repo needs it

Four layers validate the same fields, none of them generated from the others:

| Layer | Where |
|---|---|
| express-validator chains | `server/routes/*.js` |
| explicit handler guards | the same routes, inside the handler body |
| Mongoose schema rules | `server/models/*.js` |
| React form attributes and `validateForm()` | `client/src/**/*Form.js` |
| Swagger JSDoc schemas | the route files' comment blocks |

Nothing keeps them in step. When the route is looser than the schema, the request
passes validation, reaches `save()`, and comes back as `500 Server error` — no
field name, no message, nothing a tester can act on. That failure mode is what
Pack A exists to find.

## The four packs

**A. Contract mismatch (`CM-*`)** — do the layers agree?

| Rule | Fires when |
|---|---|
| `CM-01` | a numeric, length or enum bound the schema enforces and the route does not |
| `CM-02` | a schema `validate`/`match` rule with no equivalent on the route |
| `CM-03` | the route measures length before the schema trims, so padding slips through |
| `CM-04` | the form and the API disagree on a bound |
| `CM-05` | Swagger documents a bound nothing enforces |
| `CM-06` | create and update validate the same field differently |
| `CM-07` | the catch block maps neither `ValidationError` nor `CastError` to a 4xx |

`CM-07` is the multiplier: it is what turns every other Pack A finding on that
route from a validation message into an opaque 500.

**B. Boundary values (`BV-*`)** — is every edge defined and asserted?

Each bounded field gets the six-point vector (`min-1, min, min+1, max-1, max,
max+1`) plus the type extremes that break implementations more often than the
nominal edges: empty and whitespace-only strings, astral characters, `NaN`,
`Infinity`, `MAX_SAFE_INTEGER`, leap day, epoch, tomorrow.

`BV-01` unbounded field · `BV-02` boundary with no test · `BV-03` the two layers
draw the edge differently · `BV-04` uncapped page size, or a range pair that is
never compared against itself.

**C. Partitions and roles (`EP-*`)**

`EP-01` an enum whose rejection path nothing tests · `EP-02` optionality that
disagrees across layers · `EP-03` the role matrix — six access states (no token,
malformed, expired, guest, admin, owner) against every endpoint · `EP-04`
something the API advertises but does not implement.

**D. Security (`SEC-*`)** — mechanical checks only

Missing guards on mutating routes, mass assignment, user input reaching a regex,
environment-dependent rate limiting, secrets in tracked files, leaked error
internals, id routes with no ownership check.

**This pack is deliberately shallow.** For the real audit — injection,
cryptographic failures, SSRF, session handling, dependency CVEs — run the
`owasp-security-check` skill. This one defers to it rather than duplicating its
twenty rule files, and the report says so.

## Confirmed versus suspected

Every finding carries both a severity and a confidence:

- **confirmed** — a mechanical fact about the source. The route really has no
  upper bound; the catch block really tests neither error name.
- **suspected** — a pattern that usually means a defect and needs a reader. Two
  regexes that merely differ; a boundary no test appears to name.

Neither means "bug". The scanner cannot tell an intentional looseness from an
accidental one, which is why every finding prints the `file:line` of each layer
it read.

## What the scanner deliberately does not report

These suppressions exist because the naive version of each rule produced a false
finding on this codebase. If you change them, expect noise back.

- **Handler guards count.** `POST /api/games` rejects future release dates in the
  handler, not in the validator chain. Only identifiers from an `if` condition
  whose body returns 4xx count — not a destructuring line, not a string literal.
- **Only persisted fields are compared.** `POST /api/auth/login` validates
  `password` and stores only `lastLogin`, so its password chain is never measured
  against the schema's.
- **`field` and `field.*` are one field.** Kept apart, `platforms` looks like an
  array with no enum and `platforms.*` like a value with no length rule.
- **`.isIn(Game.getGenres())` cannot drift**, because it *is* the model's list.
- **A partial update may omit anything.** `CM-06` compares rules, not optionality.
- **Public auth endpoints are exempt from `SEC-01`**, and section 8 lists which,
  so the exemption is visible rather than silent.

## Your job after the script runs

**The script cannot tell you whether a mismatch matters.** It knows the route
accepts a longer string than the schema stores; it does not know whether that is
an oversight or a deliberate staging step. Always:

1. Read `.static-scan/scan-report.md`, section 2.
2. For each finding, open **every** `file:line` it lists. A finding that cites
   three layers is only real if all three say what the report claims.
3. Kill the false positives, with the reason written down. A finding removed
   without a reason comes back next run.
4. Re-rank by user-visible impact. `CM-07` on a route nobody calls matters less
   than `BV-01` on the field every page renders.
5. Save the corrected report back to `.static-scan/scan-report.md`.

Report to the user in ≤15 lines: the findings worth acting on, the single most
valuable reproduction, and the coverage gaps. Point at the file rather than
pasting it.

## Reading the output

| Section | Use |
|---|---|
| 0. Scope | what was actually scanned |
| 1. Counts | pack × severity, and the confirmed/suspected split |
| 2. Findings | the list — layers, consequence, reproduction, fix |
| 3. Contract table | field × layer grid; the raw evidence behind Pack A |
| 4. Boundary matrix | every edge, and whether a test names it |
| 5. Role matrix | access states per endpoint |
| 6. Ready-to-run cases | the reproductions, collected |
| 7. Coverage gaps | route files with no test file beside them |
| 8. Deferred | the OWASP handoff, and the SEC-01 exemptions |

## Relationship to the other skills

- `impact-analysis` — what a **branch** changed, and what to re-test. Run that
  before a PR; run this one when hunting for defects that predate the branch.
- `owasp-security-check` — the deep security pass. Pack D is a tripwire, not a
  substitute.
- `--feature F-NN` reuses `.impact/impact-map.json`, so run
  `node .claude/skills/impact-analysis/scripts/build-map.js` first if that
  artifact is missing. The rest of the scan has no such dependency.

## Tests

`npm run scan:test` — 85 tests on the Node built-in runner, no dependency. They
run against synthetic route, model and map fixtures rather than the live
application, so a test never fails because someone fixed a bug. Add a case
whenever you touch a rule.

## Troubleshooting

**"0 resources, 0 fields"** — `build-contract-map.js` found no
`new mongoose.Schema({` in `server/models/`. Check the path, and that the schema
is a literal rather than assembled at runtime.

**A finding cites a line that says something else** — the extractor is regex and
brace matching, not a parser. Report the line it actually read; that is a bug in
the extractor, and the test fixtures are the place to reproduce it.

**A whole route is missing from the report** — `parseRouteFile` keys on
`router.<verb>('<path>'`. A route registered any other way is invisible.

**Everything in Pack B looks uncovered** — `BV-02` infers coverage from a test
mentioning both the field and the literal value. A suite that builds values
through a helper reads as uncovered. Check section 4 before adding tests.

**`--feature` fails** — it needs `.impact/impact-map.json` from the
impact-analysis skill. The error names the command to run.

**A rule fires on something intentional** — say so in the report and add the
suppression to the list above, with the reason. That list is the record of every
false positive already dealt with.
