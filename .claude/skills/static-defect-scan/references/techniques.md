# Test-design techniques the scanner applies

Reference for reading `.static-scan/scan-report.md`, and for the cases the
scanner cannot derive and you have to write yourself.

---

## Boundary value analysis

A bound is a decision, and decisions are written with `<` when `<=` was meant.
Three points per edge catch that: one inside, one on it, one outside.

For a constraint `min ≤ x ≤ max`:

| Point | Value | Must |
|---|---|---|
| below | `min - 1` | reject |
| lower edge | `min` | accept |
| just inside | `min + 1` | accept |
| just inside | `max - 1` | accept |
| upper edge | `max` | accept |
| above | `max + 1` | reject |

Two edges, six cases. A single off-by-one moves exactly one of them, so a suite
that tests only "a valid value" and "a wildly invalid value" cannot see it.

### The extremes that matter more than the edges

| Type | Also try | Because |
|---|---|---|
| string | empty, whitespace only | `''` is falsy; a trimming layer changes the length after the check |
| string | astral character (emoji) | JavaScript counts UTF-16 units, so one emoji has length 2 |
| string | the maximum, doubled | an unbounded field is a storage and rendering problem, not a validation one |
| number | `0`, `-0` | falsy in a guard written `if (value)` |
| number | `NaN`, `Infinity` | both survive `typeof x === 'number'` |
| number | `Number.MAX_SAFE_INTEGER` | arithmetic stops being exact above it |
| number | a string that looks numeric | query parameters are always strings |
| date | leap day, `1970-01-01` | epoch is falsy as a timestamp |
| date | today, tomorrow | the boundary of every "not in the future" rule, and timezone-dependent |
| array | empty, one element | `[]` is truthy but has no members |
| array | a scalar instead | `req.body.platforms = 'NES'` when the schema wants a list |

### The half-open bound

A field bounded on one side only has an implicit second bound somewhere else in
the stack — the body size limit, the column width, the layout of the page that
renders it. That bound was never chosen, so nobody tested it. `BV-01`.

---

## Equivalence partitioning

Group inputs that the code should treat identically, then test one member of
each group and every group boundary. The groups are usually:

| Partition | Example |
|---|---|
| valid, typical | `genre: "Action"` |
| valid, edge | `genre` = the last member of the enum |
| invalid, wrong value | `genre: "Sportsball"` |
| invalid, wrong case | `genre: "action"` |
| invalid, wrong type | `genre: ["Action"]` |
| absent | the key is missing |
| null | the key is present and null |
| empty | `""`, `[]`, `{}` |

The last three are where most defects hide, because "absent", "null" and "empty"
are three different states that a validator, a schema and a form each treat
differently. `optional()` accepts absent; `required: true` rejects null;
`minlength` rejects empty. A field can pass all three layers and still be wrong.

---

## The role matrix

Authentication is not one partition, it is six. Every guarded endpoint has to
answer for each:

| State | Expected |
|---|---|
| no `Authorization` header | 401 |
| malformed token | 401 |
| expired token | 401 |
| valid token, insufficient role | 403 |
| valid token, exact role | 200 |
| valid token, higher role | 200 — owner reaching an admin route |

401-versus-403 is the pair that gets confused: the first says who are you, the
second says you may not. A route that returns 403 to an anonymous caller has
leaked that the resource exists.

The scanner builds this matrix from the guards on each route and looks for a
test file that mentions both the path and the state. It cannot tell a good
assertion from a bad one — only that nothing appears to make it.

---

## Decision tables

When two or more inputs interact, testing each alone misses the combination.
Range pairs are the common case:

| `yearFrom` | `yearTo` | Expected |
|---|---|---|
| absent | absent | everything |
| set | absent | open upper end |
| absent | set | open lower end |
| set | set, greater | the range |
| set | set, equal | one year |
| set | set, **lesser** | 400, not an empty page |

The last row is the one nobody writes. Both values pass their own validators;
only their relationship is wrong. `BV-04` looks for exactly this shape — two
parameters sharing a stem, validated independently, never compared.

---

## Cross-layer contract testing

With more than one layer validating a field, three questions matter:

1. **Which layer rejects first?** That is the error message the user sees.
2. **Is any layer looser than the one behind it?** A value that passes the front
   and fails the back produces an error from code that was not written to explain
   itself — usually a 500.
3. **Is any layer stricter than the one behind it?** Then the back layer's rule
   is unreachable and untestable through the UI, and will rot.

The ordering here is: form → express-validator → handler guard → Mongoose schema
→ database index. A rule should live at exactly one of them, or be identical at
all of them. The interesting failures are:

| Shape | Symptom |
|---|---|
| route looser than schema | 500 instead of 400 |
| route stricter than schema | schema rule never fires; dead code |
| sanitizer order differs | `" a "` passes a length check and fails after trim |
| documented but unenforced | client written against the docs breaks |
| enforced but undocumented | client written against the docs breaks differently |

---

## Error-path design

A validation failure and a bug are different events and must not share a status
code. In Express with Mongoose:

| Error | Should be | Comes back as, unhandled |
|---|---|---|
| `ValidationError` | 400 with the field | 500 |
| `CastError` (bad ObjectId) | 400 or 404 | 500 |
| duplicate key (`E11000`) | 409 or 400 | 500 |
| anything else | 500, message logged not returned | 500 |

A catch block that maps none of these makes every schema rule invisible to the
caller. That is `CM-07`, and it is why a Pack A finding is worth more than its
own severity suggests.

---

## What none of this covers

Static reading cannot see: what the code does with a value after it stores it,
whether an index makes a query fast enough, whether two requests race, whether
the UI renders the error it receives. Those need the application running. This
skill narrows where to point it.
