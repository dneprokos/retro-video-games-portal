'use strict';

/**
 * Shared helpers for the impact-analysis scripts.
 *
 * No npm dependencies: everything here is Node stdlib + regex, so the toolchain
 * runs unchanged in CI, in Docker, and on a fresh clone.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/** Repository root, resolved from .claude/skills/impact-analysis/scripts/. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/** Directory holding all generated artifacts (gitignored). */
const OUT_DIR = path.join(REPO_ROOT, '.impact');

/** Directories worth scanning for source. Everything else is noise. */
const SCAN_DIRS = ['server', 'client/src', 'e2e'];

const IGNORED_DIR = /(^|[\\/])(node_modules|build|dist|coverage|test-results|playwright-report|\.git|\.impact|\.playwright-cli|uploads|images)([\\/]|$)/;

/** Files whose change cannot alter runtime behaviour. */
const NON_RUNTIME = /\.(md|png|jpe?g|gif|svg|webp|ico|txt|lock)$|(^|\/)package-lock\.json$|(^|\/)LICENSE$/i;

/** Agent/editor/CI plumbing and generated artifacts — never app behaviour. */
const TOOLING = /^(\.claude|\.cursor|\.github|\.impact|\.playwright-cli|\.vscode|\.idea)\//;

/** Configuration that genuinely can change how the app behaves at runtime. */
const CONFIG = /(^|\/)(package\.json|Dockerfile|docker-compose[\w.-]*\.ya?ml|nginx\.conf|jest\.config\.js|playwright\.config\.js|tailwind\.config\.js|\.env[\w.]*)$|^docker\//;

/**
 * Classify a changed path so the report can separate real regression risk from
 * documentation, screenshots and tooling churn.
 * @param {string} p repo-relative posix path
 * @returns {{category: 'code'|'config'|'docs'|'asset'|'tooling'|'other', runtime: boolean}}
 */
function classify(p) {
  if (TOOLING.test(p)) return { category: 'tooling', runtime: false };
  if (CONFIG.test(p)) return { category: 'config', runtime: true };
  if (/\.jsx?$/.test(p)) return { category: 'code', runtime: true };
  if (/\.(md|txt)$/i.test(p) || p.startsWith('docs/')) return { category: 'docs', runtime: false };
  if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(p)) return { category: 'asset', runtime: false };
  return { category: 'other', runtime: false };
}

/**
 * Convert an absolute or Windows-style path into a repo-relative posix path.
 * Every key in the generated map uses this form so lookups are platform-safe.
 * @param {string} p
 * @returns {string}
 */
function rel(p) {
  const abs = path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/');
}

/**
 * Read a file as UTF-8, returning null when it does not exist.
 * @param {string} p repo-relative or absolute path
 * @returns {string|null}
 */
function read(p) {
  const abs = path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch (err) {
    return null;
  }
}

/**
 * Recursively collect files under a repo-relative directory.
 * @param {string} dir repo-relative directory
 * @param {RegExp} [match] filter applied to the file name
 * @returns {string[]} repo-relative posix paths
 */
function walk(dir, match = /\.jsx?$/) {
  const abs = path.join(REPO_ROOT, dir);
  const out = [];
  if (!fs.existsSync(abs)) return out;

  const stack = [abs];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (IGNORED_DIR.test(rel(full))) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (match.test(entry.name)) out.push(rel(full));
    }
  }
  return out.sort();
}

/**
 * Every source file the analyzer knows about.
 * @returns {string[]}
 */
function allSourceFiles() {
  return SCAN_DIRS.flatMap((d) => walk(d));
}

/**
 * Run a git command from the repository root.
 * @param {string} args
 * @param {{allowFail?: boolean}} [opts]
 * @returns {string} trimmed stdout, or '' when the command failed and allowFail is set
 */
function git(args, opts = {}) {
  try {
    return execSync(`git ${args}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    if (opts.allowFail) return '';
    throw err;
  }
}

/**
 * Convert a 1-based line number into the range list it falls inside.
 * @param {Array<[number, number]>} ranges
 * @param {number} line
 * @returns {boolean}
 */
function lineInRanges(ranges, line) {
  return ranges.some(([from, to]) => line >= from && line <= to);
}

/**
 * True when two inclusive range lists share at least one line.
 * @param {Array<[number, number]>} a
 * @param {Array<[number, number]>} b
 * @returns {boolean}
 */
function rangesOverlap(a, b) {
  if (!a.length || !b.length) return false;
  return a.some(([aFrom, aTo]) => b.some(([bFrom, bTo]) => aFrom <= bTo && bFrom <= aTo));
}

/**
 * Parse a citation range string such as "4-10,173-184" or "288".
 * @param {string|undefined} raw
 * @returns {Array<[number, number]>}
 */
function parseRanges(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [from, to] = chunk.split('-').map((n) => parseInt(n, 10));
      if (Number.isNaN(from)) return null;
      return [from, Number.isNaN(to) ? from : to];
    })
    .filter(Boolean);
}

/**
 * Line number (1-based) of a character offset within a string.
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Normalise an API path for cross-layer matching: query string dropped,
 * template placeholders and route params collapsed to ":p".
 * @param {string} p
 * @returns {string}
 */
function normalizeApiPath(p) {
  return p
    .split('?')[0]
    .replace(/\$\{[^}]*\}/g, ':p')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':p')
    .replace(/\/+$/, '')
    .replace(/\/{2,}/g, '/') || '/';
}

/** Endpoint identity used as a map key. */
function endpointKey(method, apiPath) {
  return `${method.toUpperCase()} ${normalizeApiPath(apiPath)}`;
}

/** Ensure the output directory exists. */
function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

/**
 * Write a JSON artifact into .impact/.
 * @param {string} name file name
 * @param {unknown} data
 * @returns {string} absolute path written
 */
function writeArtifact(name, data) {
  ensureOutDir();
  const target = path.join(OUT_DIR, name);
  const body = typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(target, body, 'utf8');
  return target;
}

/**
 * Load a JSON artifact from .impact/.
 * @param {string} name
 * @returns {any|null}
 */
function readArtifact(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT_DIR, name), 'utf8'));
  } catch (err) {
    return null;
  }
}

module.exports = {
  REPO_ROOT,
  OUT_DIR,
  SCAN_DIRS,
  NON_RUNTIME,
  classify,
  rel,
  read,
  walk,
  allSourceFiles,
  git,
  lineInRanges,
  rangesOverlap,
  parseRanges,
  lineOf,
  normalizeApiPath,
  endpointKey,
  ensureOutDir,
  writeArtifact,
  readArtifact,
};
