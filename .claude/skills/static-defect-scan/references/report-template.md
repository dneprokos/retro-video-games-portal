# Report structure and rule reference

`scan.js` renders the sections below. This file is the specification: if the
generated report and this document disagree, one of them is wrong.

## Sections

| § | Title | Contents |
|---|---|---|
| 0 | Scope | flags used, files read, so a narrow run is never mistaken for a clean one |
| 1 | Counts | pack × severity, plus the confirmed/suspected split |
| 2 | Findings | severity descending, then confirmed before suspected, then rule id |
| 3 | Contract table | field × layer grid — the evidence Pack A reasons over |
| 4 | Boundary matrix | every boundary point, its expected verdict, and whether a test names it |
| 5 | Role matrix | six access states × every endpoint |
| 6 | Ready-to-run cases | every reproduction, collected |
| 7 | Coverage gaps | route files with no test file beside them |
| 8 | Deferred | the OWASP handoff and the SEC-01 exemption list |

## A finding

```
### 3. 🔴 CM-02 — Game.imageUrl

**Model rule with no route counterpart** · high · confirmed

- `server/routes/games.js:491` — route: pattern /^https?:\/\/.+/
- `server/models/Game.js:91`  — model: pattern /^https?:\/\/.+\.(jpg|png)$/

<one paragraph: what breaks, for whom, and how it presents>

**Reproduce:** <a request, or a value to send>

**Fix:** <the change, in one sentence>
```

Required on every finding: rule id, severity, confidence, at least one
`file:line`, and a consequence written in terms of behaviour rather than code
shape. `Reproduce` and `Fix` are omitted only when the rule genuinely has
neither — a coverage gap has no reproduction.

## Rules

| Id | Pack | Default | Fires when |
|---|---|---|---|
| `CM-01` | contract | high | a schema bound (length, range, enum) the route does not enforce |
| `CM-02` | contract | high | a schema `validate`/`match` with no route counterpart, or a weaker one |
| `CM-03` | contract | medium | the route measures length before the schema trims |
| `CM-04` | contract | low | the form and the API disagree on a bound |
| `CM-05` | contract | low | Swagger documents a bound that is absent or different |
| `CM-06` | contract | medium | create and update validate the same field differently |
| `CM-07` | contract | high | the catch maps neither `ValidationError` nor `CastError` to a 4xx |
| `BV-01` | boundary | medium | a field bounded on one side only |
| `BV-02` | boundary | low | a boundary point no test appears to assert |
| `BV-03` | boundary | medium | two layers place the same edge differently |
| `BV-04` | boundary | medium | an uncapped or over-generous limit; an uncompared range pair |
| `EP-01` | partition | low | an enum whose rejection path nothing tests |
| `EP-02` | partition | medium | optionality disagrees between the create route and the schema |
| `EP-03` | partition | medium | an access state with no test (high when no test names the endpoint) |
| `EP-04` | partition | medium | a filter or parameter the API advertises but does not implement |
| `SEC-01` | security | high | a mutating route with no guard middleware |
| `SEC-02` | security | high | `req.body` reaching the model without an allowlist |
| `SEC-03` | security | high | user input reaching `$regex` or `new RegExp` |
| `SEC-04` | security | medium | rate limiting decided by environment; an oversized body cap |
| `SEC-05` | security | high | a secret in a tracked file, or a hard-coded fallback for one |
| `SEC-06` | security | medium | the 500 path returning `err.message` |
| `SEC-07` | security | high | an id route that is authenticated but not authorised |

## Severity

The table above gives the default. `scan.js` raises — never lowers — a finding to
at least **medium** when its subject mentions authentication, tokens, passwords
or roles. A rule that reports on an endpoint nothing tests (`EP-03`) is raised to
**high**, because there the guard is enforced by inspection alone.

Nothing downgrades automatically. Downgrading is the reader's job, and the reason
belongs in the report.

## Confidence

| Value | Means |
|---|---|
| `confirmed` | a mechanical fact about the source: the bound is absent, the catch tests neither name, the pattern is a prefix of the other |
| `suspected` | a pattern that usually indicates a defect: two regexes that differ, a boundary no test seems to name, a wholesale `req.body` copy that might be deliberate |

`confirmed` is a claim about the code, never about intent. Both still need a
reader.

## Suppressions

Each of these exists because its absence produced a false finding on this
codebase. Removing one brings the noise back; changing one needs a test in
`scan.test.js`.

| Suppression | Without it |
|---|---|
| handler `if` guards count as validation | `releaseDate` reports as unvalidated on both games routes |
| only identifiers from the condition count | the `const { name, genre, imageUrl } = req.body` line marks every field guarded |
| string literals are blanked in conditions | `'Game with this name already exists.'` marks `name` guarded |
| only persisted fields are compared | login's `password` chain is measured against a schema rule it can never reach |
| `field` and `field.*` merge per endpoint | `platforms` reports as both enum-less and length-less |
| `.isIn(Model.getX())` is not drift | every delegated enum reports as a mismatch |
| `CM-06` ignores `optional()` | every field on every partial-update route reports |
| `isArray({min})` answers an array-length validator | `platforms` reports a missing counterpart it has |
| public auth routes exempt from `SEC-01` | login, register and logout report as unguarded |
| `SEC-06` only reads the 500 path | a deliberate 400 carrying a business message reports as a leak |
