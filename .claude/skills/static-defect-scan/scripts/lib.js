'use strict';

/**
 * Shared helpers for the static-defect-scan scripts.
 *
 * Everything path-, git- and citation-related is reused from the
 * impact-analysis toolchain rather than reimplemented; only the pieces that are
 * specific to defect scanning (comment masking, bracket balancing, boundary
 * vectors, rule metadata) live here.
 *
 * No npm dependencies: Node stdlib + regex, so this runs on a fresh clone.
 */

const fs = require('fs');
const path = require('path');

const base = require('../../impact-analysis/scripts/lib');

const { REPO_ROOT } = base;

/** Generated artifacts for this skill (gitignored). Distinct from .impact/. */
const SCAN_OUT_DIR = path.join(REPO_ROOT, '.static-scan');

/** Ensure the scan output directory exists. */
function ensureScanDir() {
  fs.mkdirSync(SCAN_OUT_DIR, { recursive: true });
}

/**
 * Write an artifact into .static-scan/.
 * @param {string} name file name
 * @param {unknown} data string written verbatim, anything else as pretty JSON
 * @returns {string} absolute path written
 */
function writeScanArtifact(name, data) {
  ensureScanDir();
  const target = path.join(SCAN_OUT_DIR, name);
  const body = typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(target, body, 'utf8');
  return target;
}

/**
 * Load a JSON artifact from .static-scan/.
 * @param {string} name
 * @returns {any|null} null when absent or unparseable
 */
function readScanArtifact(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(SCAN_OUT_DIR, name), 'utf8'));
  } catch (err) {
    return null;
  }
}

/**
 * Blank out comment lines while preserving every character offset and line
 * number, so an index into the masked text still maps to the original source.
 *
 * Line-based on purpose. A character-level state machine would have to model
 * regex literals, and this repo is full of them, so getting that wrong would
 * silently corrupt offsets. Whole-line masking cannot: the worst it does is
 * leave a trailing line comment after real code, which no rule keys on.
 *
 * The tradeoff is the one `isCommentLine` already documents: a template-literal
 * continuation line starting with an asterisk is masked as a comment.
 *
 * @param {string} src
 * @returns {string} same length as src, comment lines replaced by spaces
 */
function maskComments(src) {
  return src
    .split('\n')
    .map((line) => (base.isCommentLine(line) ? ' '.repeat(line.length) : line))
    .join('\n');
}

/**
 * Remove trailing `//` line comments, which `maskComments` leaves behind
 * because they share a line with real code.
 *
 * Must run before any transform that joins lines: a comment collapsed onto one
 * line swallows everything after it, and a regex literal that followed it
 * disappears. `://` and an escaped `\/\/` inside a pattern are left alone.
 *
 * @param {string} src
 * @returns {string}
 */
function stripLineComments(src) {
  return String(src).replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/**
 * Extract every JSDoc block comment, with the line it starts on.
 * Swagger definitions live in these, so this is the "documentation layer".
 * @param {string} src
 * @returns {Array<{line: number, text: string}>}
 */
function docBlocks(src) {
  const out = [];
  const re = /\/\*\*[\s\S]*?\*\//g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ line: base.lineOf(src, m.index), text: m[0] });
  }
  return out;
}

/** Bracket pairs the balancer understands. */
const CLOSERS = { '(': ')', '[': ']', '{': '}' };

/**
 * Index of the bracket closing the one at `open`, or -1 if unbalanced.
 *
 * Skips bracket characters inside single, double and template quotes. Comments
 * should be masked out by the caller before calling this.
 *
 * @param {string} text
 * @param {number} open index of the opening bracket
 * @returns {number} index of the matching closer, or -1
 */
function matchBalanced(text, open) {
  if (!CLOSERS[text[open]]) return -1;

  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (CLOSERS[ch]) depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * The six-point boundary vector for a bounded constraint, plus the type-specific
 * extremes that break implementations more often than the nominal edges do.
 *
 * Each entry says what a correct implementation must do, so an untested entry
 * in the report doubles as a ready-to-run test case.
 *
 * @param {{kind: 'length'|'number'|'array'|'date', min?: number|null, max?: number|null}} c
 * @returns {Array<{label: string, value: string, expect: 'accept'|'reject'}>}
 */
function bvaVector(c) {
  const out = [];
  const push = (label, value, expect) => out.push({ label, value, expect });

  if (c.min !== null && c.min !== undefined) {
    push('min-1', String(c.min - 1), 'reject');
    push('min', String(c.min), 'accept');
    push('min+1', String(c.min + 1), 'accept');
  }
  if (c.max !== null && c.max !== undefined) {
    push('max-1', String(c.max - 1), 'accept');
    push('max', String(c.max), 'accept');
    push('max+1', String(c.max + 1), 'reject');
  }

  if (c.kind === 'length') {
    push('empty string', 'empty', 'reject');
    push('whitespace only', 'three spaces', 'reject');
    push('emoji (surrogate pair)', 'one astral character', 'accept');
  } else if (c.kind === 'number') {
    push('non-numeric', 'abc', 'reject');
    push('NaN', 'NaN', 'reject');
    push('Infinity', 'Infinity', 'reject');
    push('MAX_SAFE_INTEGER', '9007199254740991', 'reject');
  } else if (c.kind === 'array') {
    push('empty array', '[]', 'reject');
    push('scalar instead of array', 'x', 'reject');
  } else if (c.kind === 'date') {
    push('leap day', '2024-02-29', 'accept');
    push('epoch', '1970-01-01', 'accept');
    push('tomorrow', 'today+1', 'reject');
    push('non-date string', 'not-a-date', 'reject');
  }

  return out;
}

/**
 * The equivalence classes worth exercising for a constraint shape.
 * @param {{enum?: string[], optional?: boolean}} c
 * @returns {Array<{label: string, expect: 'accept'|'reject'}>}
 */
function partitionsFor(c) {
  const out = [];
  if (c.enum && c.enum.length) {
    out.push({ label: `valid member (${c.enum[0]})`, expect: 'accept' });
    out.push({ label: 'value outside the enum', expect: 'reject' });
    out.push({ label: `wrong case (${String(c.enum[0]).toLowerCase()})`, expect: 'reject' });
    out.push({ label: 'empty string', expect: 'reject' });
    out.push({ label: 'array instead of scalar', expect: 'reject' });
  }
  out.push({ label: 'field absent', expect: c.optional ? 'accept' : 'reject' });
  out.push({ label: 'explicit null', expect: c.optional ? 'accept' : 'reject' });
  return out;
}

/** The authentication states every guarded endpoint has to answer for. */
const ROLE_PARTITIONS = ['no token', 'malformed token', 'expired token', 'guest', 'admin', 'owner'];

/**
 * Rule catalogue. `severity` is the default; scan.js may raise it (never lower)
 * when the affected field or route is authentication-related.
 */
const RULES = {
  'CM-01': { pack: 'contract', severity: 'high', title: 'Route bound looser than model bound' },
  'CM-02': { pack: 'contract', severity: 'high', title: 'Model rule with no route counterpart' },
  'CM-03': { pack: 'contract', severity: 'medium', title: 'Length checked before the model trims' },
  'CM-04': { pack: 'contract', severity: 'low', title: 'Client bound disagrees with server bound' },
  'CM-05': { pack: 'contract', severity: 'low', title: 'Documented bound is not enforced' },
  'CM-06': { pack: 'contract', severity: 'medium', title: 'Create and update validators diverge' },
  'CM-07': { pack: 'contract', severity: 'high', title: 'ValidationError is not mapped to 4xx' },
  'BV-01': { pack: 'boundary', severity: 'medium', title: 'Unbounded field' },
  'BV-02': { pack: 'boundary', severity: 'low', title: 'Boundary with no test' },
  'BV-03': { pack: 'boundary', severity: 'medium', title: 'Inclusive/exclusive disagreement' },
  'BV-04': { pack: 'boundary', severity: 'medium', title: 'Uncapped or over-generous limit' },
  'EP-01': { pack: 'partition', severity: 'low', title: 'Enum partition with no test' },
  'EP-02': { pack: 'partition', severity: 'medium', title: 'Optionality disagrees across layers' },
  'EP-03': { pack: 'partition', severity: 'medium', title: 'Role partition with no test' },
  'EP-04': { pack: 'partition', severity: 'medium', title: 'Advertised but not implemented' },
  'SEC-01': { pack: 'security', severity: 'high', title: 'Mutating route with no auth guard' },
  'SEC-02': { pack: 'security', severity: 'high', title: 'Mass assignment from req.body' },
  'SEC-03': { pack: 'security', severity: 'high', title: 'User input reaches a regex' },
  'SEC-04': { pack: 'security', severity: 'medium', title: 'Rate limit or size cap bypassable' },
  'SEC-05': { pack: 'security', severity: 'high', title: 'Secret in a tracked file' },
  'SEC-06': { pack: 'security', severity: 'medium', title: 'Error handler leaks internals' },
  'SEC-07': { pack: 'security', severity: 'high', title: 'Resource id route with no ownership check' },
};

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const SEVERITY_ICON = { high: '\u{1F534}', medium: '\u{1F7E0}', low: '\u{1F7E1}' };

/** Default severity for a rule id. */
function severityOf(ruleId) {
  return (RULES[ruleId] && RULES[ruleId].severity) || 'low';
}

/** The more serious of two severities. */
function maxSeverity(a, b) {
  return SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b;
}

module.exports = {
  ...base,
  SCAN_OUT_DIR,
  ensureScanDir,
  writeScanArtifact,
  readScanArtifact,
  maskComments,
  stripLineComments,
  docBlocks,
  matchBalanced,
  bvaVector,
  partitionsFor,
  ROLE_PARTITIONS,
  RULES,
  SEVERITY_ORDER,
  SEVERITY_ICON,
  severityOf,
  maxSeverity,
};
