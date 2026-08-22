'use strict';

/**
 * Apply the defect rule packs to the extracted contract map and write
 * .static-scan/scan-report.md plus .static-scan/findings.json.
 *
 * Four packs, four questions:
 *   contract   do the layers that validate the same field agree?
 *   boundary   is every edge of every bound defined, and asserted by a test?
 *   partition  is every equivalence class — including every role — exercised?
 *   security   the mechanical checks; deep OWASP work belongs to the
 *              owasp-security-check skill, which this one defers to.
 *
 * Every finding names the file and line of each layer it read, so a human can
 * confirm or kill it in one jump. Findings are `confirmed` when the rule is a
 * mechanical fact about the source, `suspected` when it is a pattern that
 * usually means a defect but needs a reader. Nothing here proves a bug: the
 * scanner cannot tell an intentional looseness from an accidental one.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const {
  REPO_ROOT,
  read,
  rel,
  git,
  parseRanges,
  stripLineComments,
  bvaVector,
  partitionsFor,
  ROLE_PARTITIONS,
  RULES,
  SEVERITY_ORDER,
  SEVERITY_ICON,
  severityOf,
  maxSeverity,
  readArtifact,
  readScanArtifact,
  writeScanArtifact,
} = require('./lib');

const PACKS = ['contract', 'boundary', 'partition', 'security'];

/** Auth endpoints that are public by design; SEC-01 exempts them explicitly. */
const PUBLIC_BY_DESIGN = /\/(login|register|logout|refresh|forgot|reset|owner-exists)$/;

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = {
    packs: [...PACKS],
    paths: [],
    features: [],
    resources: [],
    severity: 'low',
    refresh: true,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[i + 1];
    switch (arg) {
      case '--pack': opts.packs = next().split(',').map((s) => s.trim()); i += 1; break;
      case '--path': opts.paths.push(next()); i += 1; break;
      case '--feature': opts.features.push(next().toUpperCase()); i += 1; break;
      case '--resource': opts.resources.push(next()); i += 1; break;
      case '--severity': opts.severity = next(); i += 1; break;
      case '--no-refresh': opts.refresh = false; break;
      case '--json': opts.json = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    }
  }

  const bad = opts.packs.filter((p) => !PACKS.includes(p));
  if (bad.length) throw new Error(`Unknown pack(s): ${bad.join(', ')}. Known: ${PACKS.join(', ')}`);
  if (!(opts.severity in SEVERITY_ORDER)) {
    throw new Error(`Unknown severity: ${opts.severity}. Use high, medium or low.`);
  }
  return opts;
}

const USAGE = `
Usage: node .claude/skills/static-defect-scan/scripts/scan.js [options]

  --pack <list>       contract,boundary,partition,security  (default: all)
  --path <file>       restrict to findings touching this file (repeatable)
  --feature <F-NN>    restrict to the files docs/requirements.md cites for it
  --resource <Name>   restrict to one model, e.g. Game
  --severity <level>  report only this severity or worse (high|medium|low)
  --no-refresh        reuse the existing .static-scan/contract-map.json
  --json              write findings.json only, no markdown
`;

/* ------------------------------------------------------------------ *
 * Findings
 * ------------------------------------------------------------------ */

/**
 * @param {object} f
 * @returns {object} normalised finding
 */
function finding(f) {
  const rule = RULES[f.rule];
  if (!rule) throw new Error(`Unknown rule id: ${f.rule}`);
  return {
    rule: f.rule,
    pack: rule.pack,
    title: rule.title,
    severity: f.severity || severityOf(f.rule),
    confidence: f.confidence || 'suspected',
    subject: f.subject,
    // `Game.name` names its resource directly; an endpoint subject does not,
    // and is matched by file instead.
    resource: /^[A-Z]\w*\./.test(String(f.subject)) ? String(f.subject).split('.')[0] : null,
    layers: f.layers || [],
    consequence: f.consequence,
    repro: f.repro || null,
    fix: f.fix || null,
  };
}

/** `file:line` for a layer entry, or just the file when the line is unknown. */
function at(layer) {
  return layer.line ? `${layer.file}:${layer.line}` : layer.file;
}

/* ------------------------------------------------------------------ *
 * Pack A — cross-layer contract mismatch
 * ------------------------------------------------------------------ */

/**
 * The regex literal inside a chunk of validator source, without its delimiters
 * or flags.
 *
 * Two trailing `//` line comments look exactly like one regex literal spanning
 * the lines between them, and the custom validators here are full of both. A
 * candidate is therefore rejected unless it stays on one line and contains at
 * least one metacharacter — prose does not, patterns always do. The longest
 * surviving candidate wins, since a validator that builds up a pattern names
 * the real one last.
 *
 * @param {string|null} source
 * @returns {string|null}
 */
function regexCore(source) {
  if (!source) return null;
  // Drop trailing line comments first. A rejected `// prose ... /` candidate
  // otherwise consumes the opening delimiter of the real pattern, and the scan
  // resumes in the middle of it — `^https?:` silently disappears from the
  // reported source.
  const candidates = stripLineComments(source).match(/\/(?:[^/\\\n]|\\.)+\/[a-z]*/g) || [];
  const usable = candidates
    .map((c) => c.replace(/\/[a-z]*$/, '').slice(1))
    .filter((c) => /[\^$\\[\](){}?*+|]/.test(c));
  if (!usable.length) return null;
  return usable.sort((a, b) => b.length - a.length)[0];
}

/**
 * Is `model` strictly stricter than `route`? True when the route's pattern is a
 * prefix of the model's — `^https?://.+` versus `^https?://.+\.(jpg|png)$` —
 * which means every value the route accepts past that prefix is rejected by the
 * model. A cheap test, but it is exactly the shape a copy-then-relax edit
 * leaves behind, and it turns a guess into a fact.
 */
function modelIsStricter(modelSource, routeSource) {
  if (!modelSource || !routeSource) return false;
  const m = modelSource.replace(/\$$/, '');
  const r = routeSource.replace(/\$$/, '');
  return m !== r && m.startsWith(r);
}

/** A bounded quantifier the model imposes that a generic format check does not. */
function quantifierHint(modelSource) {
  const m = modelSource && modelSource.match(/\{(\d+),(\d+)\}/);
  return m ? `the schema regex bounds a segment to ${m[1]}-${m[2]} characters` : null;
}

function packContract(map) {
  const out = [];

  for (const [resource, r] of Object.entries(map.resources)) {
    for (const [field, entry] of Object.entries(r.fields)) {
      const model = entry.model;
      if (!model) continue;

      // Only routes that actually store the field can produce a schema error
      // from it. `POST /api/auth/login` validates `password` and writes only
      // `lastLogin`; comparing its chain against the schema reports a mismatch
      // that no request can ever trigger.
      const bodyRoutes = entry.route.filter((v) => v.in === 'body');
      const writingRoutes = bodyRoutes.filter((v) => v.persisted);

      for (const v of writingRoutes) {
        const layers = [
          { layer: 'route', file: v.file, line: v.line, detail: `${v.endpoint} validator` },
          { layer: 'model', file: model.file, line: model.line, detail: `${resource}.${field}` },
        ];

        /* CM-01 — a numeric or length bound the route lets past. */
        const looser = [];
        if (model.minlength != null && (v.minLength == null || v.minLength < model.minlength)) {
          looser.push(`minimum length: route ${v.minLength == null ? 'unchecked' : v.minLength}, model ${model.minlength}`);
        }
        if (model.maxlength != null && (v.maxLength == null || v.maxLength > model.maxlength)) {
          looser.push(`maximum length: route ${v.maxLength == null ? 'unchecked' : v.maxLength}, model ${model.maxlength}`);
        }
        if (model.min != null && (v.min == null || v.min < model.min)) {
          looser.push(`minimum: route ${v.min == null ? 'unchecked' : v.min}, model ${model.min}`);
        }
        if (model.max != null && (v.max == null || v.max > model.max)) {
          looser.push(`maximum: route ${v.max == null ? 'unchecked' : v.max}, model ${model.max}`);
        }
        if (looser.length && !v.guardedInHandler) {
          out.push(finding({
            rule: 'CM-01',
            confidence: 'confirmed',
            subject: `${resource}.${field}`,
            layers,
            consequence: `${v.endpoint} accepts values the schema rejects (${looser.join('; ')}), so the request reaches the database layer and fails there.`,
            repro: `Send ${field} at the value the model forbids but the route allows.`,
            fix: `Mirror the schema bound in the ${field} validator chain.`,
          }));
        }

        /* CM-01 — the model restricts to an enum the route does not. */
        if (model.enum && model.enum.length && !v.enumRef) {
          out.push(finding({
            rule: 'CM-01',
            confidence: 'confirmed',
            subject: `${resource}.${field}`,
            layers,
            consequence: `${v.endpoint} does not restrict ${field} to the schema's ${model.enum.length}-value enum, so an unknown value is only caught at save time.`,
            repro: `POST ${field}: "definitely-not-a-member".`,
            fix: `Add .isIn(${resource}.get${field[0].toUpperCase()}${field.slice(1)}s()) — delegating to the model keeps the two lists from drifting.`,
          }));
        }

        /* CM-02 — a schema-level custom rule the route never mirrors. */
        // A schema validator that only asserts the array is non-empty is
        // answered by .isArray({ min: 1 }); reporting it would be noise.
        const arrayLengthRule = model.validate
          && /\.length\s*(?:>|>=|!==?)/.test(model.validate)
          && v.minItems != null;

        const modelRule = model.validate || model.match;
        if (modelRule && !v.guardedInHandler && !arrayLengthRule) {
          const modelCore = regexCore(modelRule) || regexCore(model.validate);
          const routeCore = regexCore(v.custom);

          if (!v.custom && !v.format) {
            out.push(finding({
              rule: 'CM-02',
              confidence: 'confirmed',
              subject: `${resource}.${field}`,
              layers: [...layers, { layer: 'model rule', file: model.file, line: model.line, detail: String(modelRule).slice(0, 160) }],
              consequence: `The schema enforces "${model.validateMessage || 'a pattern'}" but ${v.endpoint} checks nothing equivalent, so the rule is only applied at save time.`,
              repro: `Send a ${field} that the route accepts and the schema rejects.`,
              fix: 'Add the same rule as a .custom() validator, or map the save error to a 400.',
            }));
          } else if (modelIsStricter(modelCore, routeCore)) {
            out.push(finding({
              rule: 'CM-02',
              confidence: 'confirmed',
              subject: `${resource}.${field}`,
              layers: [
                { layer: 'route', file: v.file, line: v.line, detail: `pattern /${routeCore}/` },
                { layer: 'model', file: model.file, line: model.line, detail: `pattern /${modelCore}/` },
              ],
              consequence: `The route pattern is a prefix of the schema pattern: every ${field} matching the first but not the rest passes validation and fails at save.`,
              repro: `Send a ${field} matching /${routeCore}/ only.`,
              fix: 'Make the route pattern identical to the schema pattern, or delete one of them.',
            }));
          } else if (modelCore && (routeCore || v.format) && modelCore !== routeCore) {
            const hint = quantifierHint(modelCore);
            out.push(finding({
              rule: 'CM-02',
              confidence: 'suspected',
              subject: `${resource}.${field}`,
              layers: [
                { layer: 'route', file: v.file, line: v.line, detail: routeCore ? `pattern /${routeCore}/` : `${v.format} format check` },
                { layer: 'model', file: model.file, line: model.line, detail: `pattern /${modelCore}/` },
              ],
              consequence: `Route and schema check ${field} with different grammars${hint ? `; ${hint}` : ''}, so a value can satisfy one and not the other.`,
              repro: hint
                ? `Send a ${field} whose bounded segment is longer than the schema allows.`
                : `Compare the two patterns and send a value matching only the route's.`,
              fix: 'Use one pattern, defined once, referenced by both layers.',
            }));
          }
        }

        /* CM-03 — the route measures length before the schema trims. */
        if (model.trim && v.minLength != null && !v.sanitizers.includes('trim')) {
          out.push(finding({
            rule: 'CM-03',
            confidence: 'confirmed',
            subject: `${resource}.${field}`,
            layers,
            consequence: `${v.endpoint} counts ${field} before trimming while the schema trims first, so padding a short value with spaces passes validation and then fails the schema's minimum of ${model.minlength}.`,
            repro: `Send ${field} as a short value padded with spaces to length ${v.minLength}.`,
            fix: `Add .trim() ahead of .isLength() in the ${field} chain.`,
          }));
        }
      }

      /* CM-04 — the browser and the server disagree. */
      const client = entry.client;
      const primary = writingRoutes[0] || bodyRoutes[0];
      if (client && primary) {
        for (const [clientKey, routeKey, label] of [
          ['minLength', 'minLength', 'minimum length'],
          ['maxLength', 'maxLength', 'maximum length'],
          ['min', 'min', 'minimum'],
          ['max', 'max', 'maximum'],
        ]) {
          const c = client[clientKey];
          const s = primary[routeKey];
          if (c == null || s == null || c === s) continue;
          out.push(finding({
            rule: 'CM-04',
            confidence: 'confirmed',
            subject: `${resource}.${field}`,
            layers: [
              { layer: 'client', file: client.file, line: client.line, detail: `${clientKey}=${c}` },
              { layer: 'route', file: primary.file, line: primary.line, detail: `${routeKey}=${s}` },
            ],
            consequence: `The form and the API disagree on ${field}'s ${label} (${c} vs ${s}); whichever is stricter hides the other's behaviour from manual testing.`,
            fix: 'Pick one number and use it in both places.',
          }));
        }
      }

      /* CM-05 — documented bounds that nothing enforces. */
      const doc = entry.doc;
      if (doc && primary) {
        for (const [docKey, routeKey, label] of [
          ['minLength', 'minLength', 'minimum length'],
          ['maxLength', 'maxLength', 'maximum length'],
          ['minimum', 'min', 'minimum'],
          ['maximum', 'max', 'maximum'],
        ]) {
          const d = doc[docKey];
          const s = primary[routeKey];
          if (d == null) continue;
          if (s == null) {
            out.push(finding({
              rule: 'CM-05',
              confidence: 'confirmed',
              subject: `${resource}.${field}`,
              layers: [
                { layer: 'doc', file: doc.file, line: doc.line, detail: `${docKey}: ${d}` },
                { layer: 'route', file: primary.file, line: primary.line, detail: 'no equivalent check' },
              ],
              consequence: `The published API says ${field} has a ${label} of ${d}, but no validator enforces it. A client written against the docs will be surprised.`,
              fix: `Enforce it, or delete the claim from the Swagger block.`,
            }));
          } else if (d !== s) {
            out.push(finding({
              rule: 'CM-05',
              confidence: 'confirmed',
              subject: `${resource}.${field}`,
              layers: [
                { layer: 'doc', file: doc.file, line: doc.line, detail: `${docKey}: ${d}` },
                { layer: 'route', file: primary.file, line: primary.line, detail: `${routeKey}=${s}` },
              ],
              consequence: `The published ${label} for ${field} (${d}) is not the enforced one (${s}).`,
              fix: 'Correct the Swagger block.',
            }));
          }
        }
      }

      /* CM-06 — create and update drifted apart. */
      const create = writingRoutes.find((v) => /^POST/.test(v.endpoint));
      const update = writingRoutes.find((v) => /^(PUT|PATCH)/.test(v.endpoint));
      if (create && update) {
        const diffs = ['minLength', 'maxLength', 'min', 'max', 'format', 'enumRef', 'minItems']
          .filter((k) => JSON.stringify(create[k] ?? null) !== JSON.stringify(update[k] ?? null))
          .map((k) => `${k}: create ${JSON.stringify(create[k] ?? null)}, update ${JSON.stringify(update[k] ?? null)}`);
        if (Boolean(create.custom) !== Boolean(update.custom)) diffs.push('one route has a .custom() check and the other does not');
        if (diffs.length) {
          out.push(finding({
            rule: 'CM-06',
            confidence: 'confirmed',
            subject: `${resource}.${field}`,
            layers: [
              { layer: 'route', file: create.file, line: create.line, detail: create.endpoint },
              { layer: 'route', file: update.file, line: update.line, detail: update.endpoint },
            ],
            consequence: `${field} is validated differently on create and update (${diffs.join('; ')}), so a value rejected at creation can be introduced by an edit.`,
            repro: `Create the record with a legal value, then PUT the value the create route rejects.`,
            fix: 'Extract the chain into a shared array and reuse it on both routes.',
          }));
        }
      }
    }
  }

  /* CM-07 — a write path whose catch cannot tell a bad request from a bug. */
  for (const route of map.routes) {
    const causes = [];
    if (route.handler.writesModel && !route.handler.mapsValidationError) {
      causes.push({
        error: 'ValidationError',
        why: 'a schema rule that fails at save',
        repro: 'Send a value that passes the validators and fails the schema, then read the status code.',
        knockOn: ' Every Pack A finding on this route surfaces this way rather than as a validation message.',
      });
    }
    if (route.handler.readsById && !route.handler.mapsCastError) {
      causes.push({
        error: 'CastError',
        why: 'an :id that is not a valid ObjectId',
        repro: `Request ${route.endpoint.split(' ')[1].replace(/:\w+/, 'not-an-object-id')}.`,
        knockOn: '',
      });
    }
    if (!causes.length || !route.handler.has500) continue;
    const named = causes.map((c) => `${c.why} raises ${c.error}`).join(', and ');
    out.push(finding({
      rule: 'CM-07',
      confidence: 'confirmed',
      subject: route.endpoint,
      layers: [{ layer: 'route', file: route.file, line: route.line, detail: 'catch block' }],
      consequence: `On ${route.endpoint}, ${named}, and the catch block does not map ${causes.length > 1 ? 'either' : 'it'} to a 4xx status, `
        + `so the caller gets 500 "Server error" for what is a client mistake.${causes.map((c) => c.knockOn).join('')}`,
      repro: causes.map((c) => c.repro).join(' '),
      fix: `In the catch, map error.name === ${causes.map((c) => `'${c.error}'`).join(' and ')} to 400 before falling through to 500.`,
    }));
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Pack B — boundary values
 * ------------------------------------------------------------------ */

/** Bounds actually in force for a field, merged across route and model. */
function effectiveBounds(entry) {
  const model = entry.model || {};
  const route = entry.route.filter((v) => v.in === 'body')[0] || {};
  const pick = (a, b) => (a != null ? a : (b != null ? b : null));

  if (model.type === 'Number' || route.type === 'number' || route.type === 'integer') {
    return { kind: 'number', min: pick(model.min, route.min), max: pick(model.max, route.max) };
  }
  if (model.type === 'Date' || route.format === 'date') {
    return { kind: 'date', min: null, max: null };
  }
  if (/^\[/.test(model.type || '') || route.type === 'array') {
    return { kind: 'array', min: pick(route.minItems, null), max: null };
  }
  if (model.type === 'String' || route.type === 'string' || route.minLength != null || model.minlength != null) {
    return { kind: 'length', min: pick(model.minlength, route.minLength), max: pick(model.maxlength, route.maxLength) };
  }
  return null;
}

/** Does any test mention this field together with this literal? */
function boundaryCovered(entry, point) {
  if (!/^-?\d+$/.test(point.value)) {
    const word = point.label.split(' ')[0].toLowerCase();
    return entry.tests.some((t) => t.text.toLowerCase().includes(word));
  }
  return entry.tests.some((t) => new RegExp(`(^|[^\\d])${point.value}([^\\d]|$)`).test(t.text));
}

function packBoundary(map) {
  const out = [];
  const matrix = [];

  for (const [resource, r] of Object.entries(map.resources)) {
    for (const [field, entry] of Object.entries(r.fields)) {
      const accepted = entry.route.some((v) => v.in === 'body');
      if (!accepted) continue;

      const bounds = effectiveBounds(entry);
      if (!bounds) continue;
      const where = entry.model || entry.route[0];

      /* BV-01 — a range with one end missing. */
      if (bounds.kind === 'length' && bounds.min != null && bounds.max == null) {
        out.push(finding({
          rule: 'BV-01',
          confidence: 'confirmed',
          subject: `${resource}.${field}`,
          layers: [
            { layer: 'model', file: where.file, line: where.line, detail: `minlength ${bounds.min}, no maxlength` },
          ],
          consequence: `${field} has a lower bound and no upper bound on any layer, so a request can store a string of any length the 10 MB body limit allows — it will then be rendered in every list that shows the field.`,
          repro: `POST ${field} with 100000 characters and load the page that lists it.`,
          fix: `Add a maxlength to the schema and a matching .isLength({ max }) to the validators.`,
        }));
      }
      if (bounds.kind === 'number' && (bounds.min == null) !== (bounds.max == null)) {
        out.push(finding({
          rule: 'BV-01',
          confidence: 'confirmed',
          subject: `${resource}.${field}`,
          layers: [{ layer: 'model', file: where.file, line: where.line, detail: `min ${bounds.min}, max ${bounds.max}` }],
          consequence: `${field} is bounded on one side only, so the other side accepts anything numeric.`,
          fix: 'Bound both ends.',
        }));
      }

      /* BV-02 — boundary points with no assertion anywhere. */
      const vector = bvaVector(bounds).map((p) => ({ ...p, covered: boundaryCovered(entry, p) }));
      matrix.push({ subject: `${resource}.${field}`, kind: bounds.kind, points: vector });
      const uncovered = vector.filter((p) => !p.covered);
      if (uncovered.length) {
        out.push(finding({
          rule: 'BV-02',
          confidence: 'suspected',
          subject: `${resource}.${field}`,
          layers: [{ layer: 'tests', file: entry.tests[0] ? entry.tests[0].file : '(no test mentions this field)', line: entry.tests[0] ? entry.tests[0].line : null, detail: `${uncovered.length}/${vector.length} boundary points unasserted` }],
          consequence: `No test asserts ${field} at: ${uncovered.map((p) => p.label).join(', ')}. Coverage is judged by whether a test mentions the field and the literal, so this over-reports where a helper builds the value — check section 4 before acting.`,
          fix: 'Add the missing cases from the boundary matrix in section 4.',
        }));
      }

      /* BV-03 — the client and the schema draw the edge differently. */
      const client = entry.client;
      const modelRule = entry.model && entry.model.validate;
      if (client && client.maxExpr && modelRule && /<=|>=/.test(modelRule)) {
        out.push(finding({
          rule: 'BV-03',
          confidence: 'suspected',
          subject: `${resource}.${field}`,
          layers: [
            { layer: 'client', file: client.file, line: client.line, detail: `max={${client.maxExpr}}` },
            { layer: 'model', file: entry.model.file, line: entry.model.line, detail: modelRule.slice(0, 120) },
          ],
          consequence: `The form caps ${field} with a computed value while the schema compares inclusively against the server clock. The two agree only when the browser and the server are in the same timezone and the same day.`,
          repro: `Set the browser timezone to UTC+13 and pick today's date.`,
          fix: 'Compare against the same clock on both sides, or accept the edge and test it explicitly.',
        }));
      }
    }
  }

  /* BV-04 — collection limits and unpaired range parameters. */
  for (const route of map.routes) {
    const queries = route.validators.filter((v) => v.in === 'query');

    for (const v of queries) {
      if (!/^(limit|pageSize|per_?page)$/i.test(v.field)) continue;
      if (v.max == null) {
        out.push(finding({
          rule: 'BV-04',
          severity: 'high',
          confidence: 'confirmed',
          subject: `${route.endpoint} ?${v.field}`,
          layers: [{ layer: 'route', file: route.file, line: v.line, detail: 'no upper bound' }],
          consequence: `${v.field} has no maximum, so one request can ask for the entire collection.`,
          fix: 'Cap it at a page size the UI actually renders.',
        }));
      } else if (v.max > 100) {
        out.push(finding({
          rule: 'BV-04',
          confidence: 'confirmed',
          subject: `${route.endpoint} ?${v.field}`,
          layers: [{ layer: 'route', file: route.file, line: v.line, detail: `max ${v.max}` }],
          consequence: `${v.field} accepts up to ${v.max} while the UI pages at a fraction of that; a single request can pull ${v.max} documents and their images.`,
          repro: `GET ${route.endpoint.split(' ')[1]}?${v.field}=${v.max}`,
          fix: 'Lower the cap to the largest page the client renders.',
        }));
      }
    }

    // Paired range parameters: yearFrom/yearTo, minPrice/maxPrice.
    const pairs = new Map();
    for (const v of queries) {
      const m = v.field.match(/^(.*?)(From|To|Min|Max)$/i) || v.field.match(/^(min|max)(.+)$/i);
      if (!m) continue;
      const stem = (m[1].length > 3 ? m[1] : m[2]).toLowerCase();
      if (!pairs.has(stem)) pairs.set(stem, []);
      pairs.get(stem).push(v);
    }
    for (const [stem, group] of pairs) {
      if (group.length < 2) continue;
      const names = group.map((g) => g.field);
      // `if (yearFrom || yearTo)` mentions both names while comparing neither;
      // only a condition that actually relates the two counts as a check.
      const crossChecked = route.handler.conditions.some(
        (c) => names.every((n) => c.includes(n)) && /[<>]/.test(c)
      );
      if (crossChecked) continue;
      out.push(finding({
        rule: 'BV-04',
        confidence: 'confirmed',
        subject: `${route.endpoint} ?${names.join('/')}`,
        layers: [{ layer: 'route', file: route.file, line: group[0].line, detail: names.join(' and ') }],
        consequence: `${names.join(' and ')} are validated independently and never compared, so an inverted range (${names[0]} after ${names[1]}) is accepted and silently returns nothing.`,
        repro: `GET ${route.endpoint.split(' ')[1]}?${names[0]}=2000&${names[1]}=1990`,
        fix: `Reject the inverted range with a 400 rather than returning an empty page.`,
      }));
      void stem;
    }
  }

  return { findings: out, matrix };
}

/* ------------------------------------------------------------------ *
 * Pack C — equivalence partitions and the role matrix
 * ------------------------------------------------------------------ */

const ROLE_EVIDENCE = {
  'no token': /\b401\b|without (?:a )?token|no token|unauthenticated/i,
  'malformed token': /malformed|invalid token|Bearer\s+invalid|not-?a-?token/i,
  'expired token': /expired/i,
  guest: /\bguest\b|\b403\b/i,
  admin: /\badmin\b/i,
  owner: /\bowner\b/i,
};

function packPartition(map) {
  const out = [];
  const roleMatrix = [];

  /* EP-01 / EP-02 — field-level partitions. */
  for (const [resource, r] of Object.entries(map.resources)) {
    for (const [field, entry] of Object.entries(r.fields)) {
      const model = entry.model;
      const bodyRoutes = entry.route.filter((v) => v.in === 'body');
      if (!model || !bodyRoutes.length) continue;

      if (model.enum && model.enum.length) {
        const negative = entry.tests.some((t) => /invalid|reject|not allowed|throw|400/i.test(t.text) || /invalid/i.test(t.title));
        if (!negative) {
          out.push(finding({
            rule: 'EP-01',
            confidence: 'suspected',
            subject: `${resource}.${field}`,
            layers: [{ layer: 'model', file: model.file, line: model.line, detail: `${model.enum.length}-value enum` }],
            consequence: `No test sends ${field} a value outside its enum, so nothing proves the rejection path works. Partitions worth covering: ${partitionsFor({ enum: model.enum }).map((p) => p.label).join(', ')}.`,
            fix: `Add one negative case per partition.`,
          }));
        }
      }

      // Only the create route can be compared with the schema's requiredness:
      // an update route is a partial by design and omits everything.
      const create = bodyRoutes.find((v) => /^POST/.test(v.endpoint));
      if (create && model.required && create.optional) {
        out.push(finding({
          rule: 'EP-02',
          confidence: 'confirmed',
          subject: `${resource}.${field}`,
          layers: [
            { layer: 'route', file: create.file, line: create.line, detail: `${create.endpoint}: optional` },
            { layer: 'model', file: model.file, line: model.line, detail: 'required' },
          ],
          consequence: `${create.endpoint} treats ${field} as optional while the schema requires it, so omitting it produces a save error rather than a validation message.`,
          repro: `POST the record without ${field}.`,
          fix: 'Make the validator require it.',
        }));
      }
      if (create && !model.required && !create.optional && model.default === undefined) {
        out.push(finding({
          rule: 'EP-02',
          confidence: 'suspected',
          subject: `${resource}.${field}`,
          layers: [
            { layer: 'route', file: create.file, line: create.line, detail: `${create.endpoint}: required` },
            { layer: 'model', file: model.file, line: model.line, detail: 'optional' },
          ],
          consequence: `${create.endpoint} demands ${field} although the schema does not, so the API is stricter than the data model — records created any other way will not have it.`,
          fix: 'Decide which layer owns the requirement.',
        }));
      }
    }
  }

  /* EP-03 — role partitions per endpoint. */
  const testText = new Map();
  for (const route of map.routes) {
    const pathOnly = route.endpoint.split(' ')[1];
    const relevant = (map.meta.testFiles || []).filter((f) => {
      if (!testText.has(f)) testText.set(f, read(f) || '');
      return testText.get(f).includes(pathOnly.replace(/\/:\w+$/, ''));
    });

    const applicable = route.guards.length
      ? ROLE_PARTITIONS
      : ['no token'];
    const covered = {};
    for (const partition of applicable) {
      covered[partition] = relevant.some((f) => ROLE_EVIDENCE[partition].test(testText.get(f)));
    }
    roleMatrix.push({ endpoint: route.endpoint, guards: route.guards, applicable, covered, testFiles: relevant });

    const missing = applicable.filter((p) => !covered[p]);
    if (!missing.length) continue;
    out.push(finding({
      rule: 'EP-03',
      severity: route.guards.length && !relevant.length ? 'high' : severityOf('EP-03'),
      confidence: relevant.length ? 'suspected' : 'confirmed',
      subject: route.endpoint,
      layers: [{ layer: 'tests', file: relevant[0] || '(no test file mentions this path)', line: null, detail: relevant.length ? `${relevant.length} test file(s)` : 'none' }],
      consequence: relevant.length
        ? `Untested access states for ${route.endpoint}: ${missing.join(', ')}.`
        : `No test file mentions ${route.endpoint} at all, so every access state is unproven: ${missing.join(', ')}. Its guards (${route.guards.join(', ') || 'none'}) are enforced only by inspection.`,
      fix: 'Add one request per unproven state and assert the status code.',
    }));
  }

  /* EP-04 — dimensions the API advertises but does not accept. */
  for (const route of map.routes) {
    if (!/options|filters/.test(route.endpoint)) continue;
    const collection = map.routes.find(
      (r) => r.method === 'GET' && r.file === route.file && r.validators.some((v) => v.in === 'query')
    );
    if (!collection) continue;
    const queryFields = collection.validators.filter((v) => v.in === 'query').map((v) => v.field);
    const accepted = new Set(queryFields.map((f) => f.toLowerCase()));

    for (const key of route.handler.responseKeys) {
      if (key === 'message') continue;
      const singular = key.replace(/s$/, '').toLowerCase();
      if (accepted.has(key.toLowerCase()) || accepted.has(singular)) continue;
      // yearRange maps onto yearFrom/yearTo rather than a parameter of its own.
      if ([...accepted].some((a) => a.startsWith(singular.replace(/range$/, '')))) continue;
      out.push(finding({
        rule: 'EP-04',
        confidence: 'confirmed',
        subject: `${key} filter`,
        layers: [
          { layer: 'route', file: route.file, line: route.line, detail: `${route.endpoint} advertises "${key}"` },
          { layer: 'route', file: collection.file, line: collection.line, detail: `${collection.endpoint} accepts ${queryFields.join(', ')}` },
        ],
        consequence: `${route.endpoint} publishes "${key}" as a filter dimension, but ${collection.endpoint} has no parameter for it — a client that reads the options endpoint and builds a filter gets an unfiltered list back.`,
        repro: `GET ${route.endpoint.split(' ')[1]}, then try to use "${key}" as a query parameter.`,
        fix: `Implement the parameter, or stop advertising the dimension.`,
      }));
    }
  }

  /* EP-04 — documented parameters nothing reads. */
  for (const p of map.docs.parameters) {
    if (p.in !== 'query') continue;
    const route = map.routes.find((r) => r.method === p.method && r.endpoint.endsWith(p.path.replace(/\{(\w+)\}/g, ':$1')));
    if (!route) continue;
    const declared = route.validators.some((v) => v.field === p.name);
    const read_ = route.handler.readsParams.some((r) => r.endsWith(`.${p.name}`));
    if (declared || read_) continue;
    out.push(finding({
      rule: 'EP-04',
      confidence: 'confirmed',
      subject: `${route.endpoint} ?${p.name}`,
      layers: [{ layer: 'doc', file: p.file, line: p.line, detail: `documented query parameter "${p.name}"` }],
      consequence: `The Swagger block documents ?${p.name} but the handler neither validates nor reads it, so sending it does nothing.`,
      fix: 'Implement it, or remove it from the documentation.',
    }));
  }

  return { findings: out, roleMatrix };
}

/* ------------------------------------------------------------------ *
 * Pack D — mechanical security checks
 * ------------------------------------------------------------------ */

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * @param {object} map contract map
 * @param {{read?: function, tracked?: string[]}} [io] overrides for the
 *   application-wide checks, so the tests can drive them with fixtures
 */
function packSecurity(map, io = {}) {
  const readFile = io.read || read;
  const out = [];
  const exempt = [];

  for (const route of map.routes) {
    const pathOnly = route.endpoint.split(' ')[1];

    /* SEC-01 */
    if (MUTATING.includes(route.method) && !route.guards.length) {
      if (PUBLIC_BY_DESIGN.test(pathOnly)) {
        exempt.push(route.endpoint);
      } else {
        out.push(finding({
          rule: 'SEC-01',
          confidence: 'confirmed',
          subject: route.endpoint,
          layers: [{ layer: 'route', file: route.file, line: route.line, detail: 'no guard middleware' }],
          consequence: `${route.endpoint} changes state and carries none of authenticateToken, requireAdmin or requireOwner, so anyone who can reach the port can call it.`,
          repro: `curl -X ${route.method} <host>${pathOnly}`,
          fix: 'Add the guard the neighbouring mutating routes use.',
        }));
      }
    }

    /* SEC-02 */
    if (route.handler.massAssignment) {
      out.push(finding({
        rule: 'SEC-02',
        confidence: 'suspected',
        subject: route.endpoint,
        layers: [{ layer: 'route', file: route.file, line: route.line, detail: 'req.body passed to the model whole' }],
        consequence: `The handler builds or updates a document from req.body without an allowlist, so a caller can set fields the form never exposes — role, ownership, timestamps.`,
        repro: `Send the request with an extra "role": "owner" property.`,
        fix: 'Destructure the fields you accept and construct the document from those.',
      }));
    }

    /* SEC-03 */
    if (route.handler.regexFromInput) {
      out.push(finding({
        rule: 'SEC-03',
        confidence: 'confirmed',
        subject: route.endpoint,
        layers: [{ layer: 'route', file: route.file, line: route.line, detail: 'user input reaches $regex / new RegExp' }],
        consequence: `A query value is used as a regular expression. Regex metacharacters change what the query matches, and a crafted pattern can pin the event loop (ReDoS) on a collection of any size.`,
        repro: `GET ${pathOnly}?search=${encodeURIComponent('(a+)+$')}`,
        fix: 'Escape the input before building the pattern, or use the text index that Game already declares.',
      }));
    }

    /* SEC-06 */
    if (route.handler.leaksError) {
      out.push(finding({
        rule: 'SEC-06',
        confidence: 'confirmed',
        subject: route.endpoint,
        layers: [{ layer: 'route', file: route.file, line: route.line, detail: 'error text returned to the caller' }],
        consequence: 'The catch block returns the raw error message, which can carry schema field names, driver text or paths.',
        fix: 'Log the detail, return a fixed message.',
      }));
    }

    /* SEC-07 */
    if (/:\w+/.test(pathOnly) && route.guards.includes('authenticateToken')
        && !route.guards.includes('requireAdmin') && !route.guards.includes('requireOwner')
        && !route.handler.conditions.some((c) => /req\.user/.test(c))) {
      out.push(finding({
        rule: 'SEC-07',
        confidence: 'suspected',
        subject: route.endpoint,
        layers: [{ layer: 'route', file: route.file, line: route.line, detail: 'authenticated but not authorised' }],
        consequence: `${route.endpoint} takes a resource id, requires only a valid token, and never compares the resource to req.user — any logged-in caller can address any record.`,
        repro: 'Log in as one user and request another user\'s record id.',
        fix: 'Compare the record owner with req.user, or add the role guard.',
      }));
    }
  }

  /* SEC-04 / SEC-05 — application-wide settings. */
  const serverSrc = readFile('server/server.js') || '';
  // The guard is written either way round — `=== 'test'` to skip the limiter,
  // `!== 'test'` to install it. Both make rate limiting environment-dependent.
  const envGate = /NODE_ENV\s*[!=]==?\s*['"]test['"]/;
  if (envGate.test(serverSrc) && /rateLimit|limiter/.test(serverSrc)) {
    const line = serverSrc.split('\n').findIndex((l) => envGate.test(l)) + 1;
    out.push(finding({
      rule: 'SEC-04',
      confidence: 'confirmed',
      subject: 'rate limiting',
      layers: [{ layer: 'config', file: 'server/server.js', line, detail: 'limiter skipped when NODE_ENV === test' }],
      consequence: 'The rate limiter is disabled by an environment variable. Any deployment that starts with NODE_ENV unset to production — a container default, a mistyped compose file — runs with no limiter and no warning.',
      fix: 'Decide the limiter from an explicit flag, and log which mode started.',
    }));
  }
  const bodyLimit = serverSrc.match(/limit\s*:\s*['"](\d+)mb['"]/i);
  if (bodyLimit && parseInt(bodyLimit[1], 10) >= 10) {
    const line = serverSrc.split('\n').findIndex((l) => l.includes(bodyLimit[0])) + 1;
    out.push(finding({
      rule: 'SEC-04',
      confidence: 'confirmed',
      subject: 'request body size',
      layers: [{ layer: 'config', file: 'server/server.js', line, detail: `${bodyLimit[1]} mb JSON body limit` }],
      consequence: `Every endpoint accepts a ${bodyLimit[1]} mb JSON body, including the unauthenticated ones. Parsing is synchronous work an anonymous caller can schedule at will.`,
      fix: 'Set the limit to the largest legitimate payload; raise it per-route where an upload needs it.',
    }));
  }

  const tracked = io.tracked || git(['ls-files'], { allowFail: true }).split('\n');
  for (const file of tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f))) {
    const body = readFile(file) || '';
    const secretish = body.split('\n').filter((l) => /(SECRET|PASSWORD|TOKEN|KEY|CREDENTIAL)/i.test(l) && /=\S/.test(l));
    if (!secretish.length) continue;
    out.push(finding({
      rule: 'SEC-05',
      confidence: 'confirmed',
      subject: file,
      layers: [{ layer: 'config', file, line: null, detail: `${secretish.length} secret-shaped assignment(s), tracked by git` }],
      consequence: `${file} is committed and contains values named like credentials. Anyone with clone access has them, and rotating them means rewriting history.`,
      fix: 'Move the values to an untracked file, commit an example with placeholders, and rotate anything real.',
    }));
  }

  for (const file of (map.meta.routeFiles || []).concat(['server/middleware/auth.js', 'server/server.js'])) {
    const src = readFile(file);
    if (!src) continue;
    const fallback = src.match(/process\.env\.(\w*(?:SECRET|KEY|PASSWORD)\w*)\s*\|\|\s*['"]([^'"]+)['"]/);
    if (!fallback) continue;
    const line = src.split('\n').findIndex((l) => l.includes(fallback[0])) + 1;
    out.push(finding({
      rule: 'SEC-05',
      confidence: 'confirmed',
      subject: fallback[1],
      layers: [{ layer: 'code', file, line, detail: `falls back to the literal "${fallback[2]}"` }],
      consequence: `${fallback[1]} has a hard-coded default, so the application starts and signs tokens even when the real secret is missing. Every deployment that forgets the variable shares one publicly known key.`,
      fix: 'Fail startup when the variable is absent.',
    }));
  }

  return { findings: out, exempt };
}

/* ------------------------------------------------------------------ *
 * Scoping
 * ------------------------------------------------------------------ */

/** Files a feature id covers, from the requirement citations in the impact map. */
function featureFiles(features) {
  const impact = readArtifact('impact-map.json');
  if (!impact) {
    throw new Error(
      '--feature needs .impact/impact-map.json. Run: node .claude/skills/impact-analysis/scripts/build-map.js'
    );
  }
  const files = new Set();
  for (const id of features) {
    const feature = impact.features[id];
    if (!feature) throw new Error(`Unknown feature: ${id}. Known: ${Object.keys(impact.features).join(', ')}`);
    for (const fr of feature.frs || []) {
      for (const citation of fr.citations || []) files.add(citation.file);
    }
  }
  void parseRanges;
  return files;
}

/**
 * Files that belong to a resource: its model, and every route file that
 * requires that model.
 *
 * Subject-prefix matching alone is not enough — `CM-07 POST /api/games` and
 * `EP-03 GET /api/games` are Game findings whose subject is an endpoint, and
 * scoping by name silently dropped them.
 *
 * @param {object} map
 * @param {string[]} resources
 * @returns {Set<string>}
 */
function resourceFiles(map, resources) {
  const files = new Set();
  for (const name of resources) {
    const r = map.resources[name];
    if (!r) throw new Error(`Unknown resource: ${name}. Known: ${Object.keys(map.resources).join(', ')}`);
    if (r.model) files.add(r.model);
  }
  for (const route of map.routes) {
    if (route.resources.some((x) => resources.includes(x))) files.add(route.file);
  }
  return files;
}

function inScope(f, scope) {
  if (scope.resources) {
    const byName = f.resource && scope.resources.includes(f.resource);
    const byFile = f.layers.some((l) => scope.resourceFiles.has(l.file));
    if (!byName && !byFile) return false;
  }
  if (scope.files && !f.layers.some((l) => scope.files.has(l.file))) return false;
  if (SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[scope.severity]) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function bySeverity(a, b) {
  const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (s) return s;
  if (a.confidence !== b.confidence) return a.confidence === 'confirmed' ? -1 : 1;
  return a.rule.localeCompare(b.rule);
}

function renderReport(state) {
  const { findings, matrix, roleMatrix, map, opts, exempt } = state;
  const L = [];
  const p = (s = '') => L.push(s);

  p('# Static defect scan');
  p();
  p(`Branch \`${map.meta.branch}\` at \`${map.meta.sha}\`. ${findings.length} finding(s).`);
  p();
  p('Generated by `.claude/skills/static-defect-scan`. Nothing here is proven — each finding');
  p('names the lines it was derived from so you can confirm or kill it.');
  p();

  /* 0 */
  p('## 0. Scope');
  p();
  p('| Setting | Value |');
  p('|---|---|');
  p(`| Packs | ${opts.packs.join(', ')} |`);
  p(`| Severity floor | ${opts.severity} |`);
  p(`| Paths | ${opts.paths.length ? opts.paths.join(', ') : 'whole application'} |`);
  p(`| Features | ${opts.features.length ? opts.features.join(', ') : 'all'} |`);
  p(`| Resources | ${opts.resources.length ? opts.resources.join(', ') : 'all'} |`);
  p(`| Sources read | ${map.meta.routeFiles.length} route, ${map.meta.modelFiles.length} model, ${map.meta.formFiles.length} form, ${map.meta.testFiles.length} test files |`);
  p();

  /* 1 */
  p('## 1. Counts');
  p();
  p('| Pack | 🔴 High | 🟠 Medium | 🟡 Low | Total |');
  p('|---|---|---|---|---|');
  for (const pack of PACKS) {
    if (!opts.packs.includes(pack)) continue;
    const inPack = findings.filter((f) => f.pack === pack);
    const n = (s) => inPack.filter((f) => f.severity === s).length;
    p(`| ${pack} | ${n('high')} | ${n('medium')} | ${n('low')} | ${inPack.length} |`);
  }
  const total = (s) => findings.filter((f) => f.severity === s).length;
  p(`| **all** | **${total('high')}** | **${total('medium')}** | **${total('low')}** | **${findings.length}** |`);
  p();
  p(`${findings.filter((f) => f.confidence === 'confirmed').length} confirmed (a mechanical fact about the source), `
    + `${findings.filter((f) => f.confidence === 'suspected').length} suspected (a pattern that needs a reader).`);
  p();

  /* 2 */
  p('## 2. Findings');
  p();
  if (!findings.length) p('_None at this severity floor._');
  findings.forEach((f, i) => {
    p(`### ${i + 1}. ${SEVERITY_ICON[f.severity]} ${f.rule} — ${f.subject}`);
    p();
    p(`**${f.title}** · ${f.severity} · ${f.confidence}`);
    p();
    for (const layer of f.layers) p(`- \`${at(layer)}\` — ${layer.layer}: ${layer.detail}`);
    p();
    p(f.consequence);
    if (f.repro) { p(); p(`**Reproduce:** ${f.repro}`); }
    if (f.fix) { p(); p(`**Fix:** ${f.fix}`); }
    p();
  });

  /* 3 */
  p('## 3. Contract table');
  p();
  p('What each layer says about each field. Blank means the layer is silent — which is');
  p('itself the evidence behind most of Pack A.');
  p();
  for (const [resource, r] of Object.entries(map.resources)) {
    if (opts.resources.length && !opts.resources.includes(resource)) continue;
    p(`### ${resource}`);
    p();
    p('| Field | Route validator | Handler guard | Schema | Form | Swagger |');
    p('|---|---|---|---|---|---|');
    for (const [field, entry] of Object.entries(r.fields)) {
      const body = entry.route.filter((v) => v.in === 'body');
      p(`| \`${field}\` | ${describeRoute(body)} | ${body.some((v) => v.guardedInHandler) ? 'yes' : '—'} `
        + `| ${describeModel(entry.model)} | ${describeClient(entry.client)} | ${describeDoc(entry.doc)} |`);
    }
    p();
  }

  /* 4 */
  if (opts.packs.includes('boundary')) {
    p('## 4. Boundary matrix');
    p();
    p('Every edge of every bound, and whether a test names it. Coverage is inferred from a');
    p('test mentioning the field and the literal, so a value built by a helper reads as');
    p('uncovered. Treat an unchecked box as "go look", not as "no test exists".');
    p();
    for (const row of matrix) {
      p(`**${row.subject}** (${row.kind})`);
      p();
      p('| Point | Value | Expected | Asserted |');
      p('|---|---|---|---|');
      for (const point of row.points) {
        p(`| ${point.label} | \`${point.value}\` | ${point.expect} | ${point.covered ? 'yes' : '**no**'} |`);
      }
      p();
    }
  }

  /* 5 */
  if (opts.packs.includes('partition')) {
    p('## 5. Role matrix');
    p();
    p('Access states per endpoint. A public endpoint only has to answer for the anonymous');
    p('case; a guarded one has to answer for all six.');
    p();
    p(`| Endpoint | Guards | ${ROLE_PARTITIONS.join(' | ')} |`);
    p(`|---|---|${ROLE_PARTITIONS.map(() => '---').join('|')}|`);
    for (const row of roleMatrix) {
      const cells = ROLE_PARTITIONS.map((partition) => {
        if (!row.applicable.includes(partition)) return 'n/a';
        return row.covered[partition] ? 'yes' : '**no**';
      });
      p(`| \`${row.endpoint}\` | ${row.guards.join(', ') || 'public'} | ${cells.join(' | ')} |`);
    }
    p();
  }

  /* 6 */
  p('## 6. Ready-to-run cases');
  p();
  const withRepro = findings.filter((f) => f.repro);
  if (!withRepro.length) p('_No finding carries a reproduction._');
  for (const f of withRepro) p(`- **${f.rule} ${f.subject}** — ${f.repro}`);
  p();

  /* 7 */
  p('## 7. Coverage gaps');
  p();
  const untested = map.meta.routeFiles.filter((f) => !map.meta.testFiles.some((t) => t.replace(/\.test\.js$/, '.js') === f));
  if (untested.length) {
    p('Route files with no test file beside them — every rule they enforce is verified by');
    p('manual testing only:');
    p();
    for (const f of untested) p(`- \`${f}\``);
  } else {
    p('Every route file has a test file beside it.');
  }
  p();

  /* 8 */
  p('## 8. Deferred');
  p();
  p('This pack runs mechanical checks only. For the full OWASP Top 10 pass — injection,');
  p('cryptographic failures, SSRF, session handling, dependency CVEs — run the');
  p('`owasp-security-check` skill, which carries the rule set this one deliberately does');
  p('not duplicate.');
  p();
  if (exempt.length) {
    p(`SEC-01 exempted these unauthenticated mutating endpoints as public by design: ${exempt.map((e) => `\`${e}\``).join(', ')}.`);
    p('If any of them should not be public, that is a finding this scan suppressed.');
    p();
  }

  return L.join('\n');
}

function describeRoute(entries) {
  if (!entries.length) return '—';
  const v = entries[0];
  const bits = [];
  if (v.optional) bits.push('optional');
  else bits.push('required');
  if (v.minLength != null || v.maxLength != null) bits.push(`length ${v.minLength ?? '-'}..${v.maxLength ?? '-'}`);
  if (v.min != null || v.max != null) bits.push(`range ${v.min ?? '-'}..${v.max ?? '-'}`);
  if (v.minItems != null) bits.push(`min ${v.minItems} item(s)`);
  if (v.format) bits.push(v.format);
  if (v.enumRef) bits.push(`enum ${v.enumRef}`);
  if (v.custom) bits.push('custom');
  if (v.sanitizers.length) bits.push(v.sanitizers.join('+'));
  return bits.join(', ');
}

function describeModel(model) {
  if (!model) return '—';
  const bits = [];
  if (model.required) bits.push('required');
  if (model.type) bits.push(model.type);
  if (model.minlength != null || model.maxlength != null) bits.push(`length ${model.minlength ?? '-'}..${model.maxlength ?? '-'}`);
  if (model.min != null || model.max != null) bits.push(`range ${model.min ?? '-'}..${model.max ?? '-'}`);
  if (model.enum) bits.push(`enum(${model.enum.length})`);
  if (model.match) bits.push('regex');
  if (model.validate) bits.push('validator fn');
  if (model.trim) bits.push('trim');
  if (model.lowercase) bits.push('lowercase');
  if (model.unique) bits.push('unique');
  return bits.join(', ');
}

function describeClient(client) {
  if (!client) return '—';
  const bits = [];
  if (client.required) bits.push('required');
  if (client.inputType) bits.push(client.inputType);
  if (client.minLength != null || client.maxLength != null) bits.push(`length ${client.minLength ?? '-'}..${client.maxLength ?? '-'}`);
  if (client.min != null || client.max != null) bits.push(`range ${client.min ?? '-'}..${client.max ?? '-'}`);
  if (client.maxExpr) bits.push(`max=${client.maxExpr}`);
  if (client.clientMessages) bits.push(`${client.clientMessages.length} message(s)`);
  return bits.join(', ');
}

function describeDoc(doc) {
  if (!doc) return '—';
  const bits = [];
  if (doc.type) bits.push(doc.type);
  if (doc.format) bits.push(doc.format);
  if (doc.minLength != null || doc.maxLength != null) bits.push(`length ${doc.minLength ?? '-'}..${doc.maxLength ?? '-'}`);
  if (doc.minimum != null || doc.maximum != null) bits.push(`range ${doc.minimum ?? '-'}..${doc.maximum ?? '-'}`);
  if (doc.enum && doc.enum.length) bits.push(`enum(${doc.enum.length})`);
  return bits.join(', ');
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(USAGE);
    return null;
  }

  if (opts.refresh) {
    execFileSync(process.execPath, [path.join(__dirname, 'build-contract-map.js')], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  }
  const map = readScanArtifact('contract-map.json');
  if (!map) throw new Error('No contract map. Run without --no-refresh.');

  const scope = {
    resources: opts.resources.length ? opts.resources : null,
    resourceFiles: opts.resources.length ? resourceFiles(map, opts.resources) : null,
    severity: opts.severity,
    files: null,
  };
  if (opts.paths.length || opts.features.length) {
    const files = new Set(opts.paths.map((p) => rel(p)));
    for (const f of opts.features.length ? featureFiles(opts.features) : []) files.add(f);
    scope.files = files;
  }

  const boundary = opts.packs.includes('boundary') ? packBoundary(map) : { findings: [], matrix: [] };
  const partition = opts.packs.includes('partition') ? packPartition(map) : { findings: [], roleMatrix: [] };
  const security = opts.packs.includes('security') ? packSecurity(map) : { findings: [], exempt: [] };

  const findings = [
    ...(opts.packs.includes('contract') ? packContract(map) : []),
    ...boundary.findings,
    ...partition.findings,
    ...security.findings,
  ]
    .map((f) => (f.subject && /auth|token|password|role/i.test(String(f.subject))
      ? { ...f, severity: maxSeverity(f.severity, 'medium') }
      : f))
    .filter((f) => inScope(f, scope))
    .sort(bySeverity);

  writeScanArtifact('findings.json', { meta: map.meta, scope: opts, findings });

  if (!opts.json) {
    const report = renderReport({
      findings,
      matrix: boundary.matrix,
      roleMatrix: partition.roleMatrix,
      exempt: security.exempt,
      map,
      opts,
    });
    const target = writeScanArtifact('scan-report.md', report);
    const n = (s) => findings.filter((f) => f.severity === s).length;
    process.stdout.write(
      `scan: ${findings.length} finding(s) — ${n('high')} high, ${n('medium')} medium, ${n('low')} low -> ${rel(target)}\n`
    );
  } else {
    process.stdout.write(`scan: ${findings.length} finding(s) -> .static-scan/findings.json\n`);
  }

  return findings;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  packContract,
  packBoundary,
  packPartition,
  packSecurity,
  effectiveBounds,
  modelIsStricter,
  regexCore,
  inScope,
  resourceFiles,
  renderReport,
  main,
};
