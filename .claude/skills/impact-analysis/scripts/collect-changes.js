#!/usr/bin/env node
'use strict';

/**
 * collect-changes.js — capture what the current branch changed.
 *
 * Default scope is "everything this branch did that main has not seen":
 * committed work since the merge-base, plus staged and unstaged edits, plus
 * untracked files. QA scoping needs work-in-progress too, not just the PR diff.
 *
 * That whole span comes from a single `git diff <base>`, so every range shares
 * one coordinate space. Each record carries both sides of the hunk header:
 * `ranges` in post-change numbers (for reading the file as it now stands) and
 * `baseRanges` in base numbers (for joining against requirement citations,
 * which were written against the base revision).
 *
 * Output: .impact/changes.json
 *
 * Usage:
 *   node .claude/skills/impact-analysis/scripts/collect-changes.js
 *   node ... --base develop        compare against a different branch
 *   node ... --committed-only      three-dot diff only (what a PR would show)
 *   node ... --staged              staged changes only
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, classify, isCommentLine, git, writeArtifact, rel } = require('./lib');

/** Declaration forms worth naming when a hunk lands inside one. */
const SYMBOL_RE = /^\s*(?:(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=|(?:module\.)?exports\.(\w+)\s*=|router\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]|(\w+)\s*:\s*(?:async\s*)?(?:function|\()|(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{)/;

/**
 * Shapes worth naming in plain language. Every rule runs against every touched
 * line, so one line can yield several intents (a `<select data-testid=…>` is
 * both a control and, with its label, a named field).
 *
 * This is what lets the report say "the API accepts a new filter `platform`"
 * instead of "`server/routes/games.js` lines 55-58 changed".
 */
const INTENT_RULES = [
  { kind: 'route', re: /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/, pick: (m) => `${m[1].toUpperCase()} ${m[2] || '/'}` },
  { kind: 'api-param', re: /\b(query|body|param)\(\s*['"]([\w.*[\]]+)['"]/, pick: (m) => `${m[2]} ${m[1]}` },
  { kind: 'message', re: /\.withMessage\(\s*['"`]([^'"`]+)['"`]/, pick: (m) => m[1] },
  { kind: 'status', re: /res\s*\.\s*status\(\s*(\d{3})\s*\)/, pick: (m) => m[1] },
  // The line that actually narrows the result set. Without this the validator
  // gets all the credit and the feature that owns the filtering says nothing.
  { kind: 'data-filter', re: /^\s*(?:filter|where|criteria)\.(\w+)\s*=[^=]/, pick: (m) => m[1] },
  { kind: 'ui-label', re: /<label[^>]*>\s*([^<{][^<]*?)\s*</, pick: (m) => m[1].trim() },
  { kind: 'ui-control', re: /data-testid=["']([\w-]+)["']/, pick: (m) => m[1] },
  { kind: 'db-index', re: /\w*[Ss]chema\.index\(\s*\{\s*([\w.]+)/, pick: (m) => m[1] },
  { kind: 'test', re: /^\s*(?:it|test)\(\s*['"`]([^'"`]+)/, pick: (m) => m[1] },
];

/** Per file, beyond which further intents add noise rather than signal. */
const INTENT_CAP = 40;

/**
 * Derive plain-language intents from one touched line.
 *
 * Both line numbers are carried through: the new-side one names the endpoint a
 * change sits under, the base-side one decides which requirement owns it.
 *
 * @param {string} content the line without its diff +/- marker
 * @param {'added'|'removed'} action
 * @param {{line?: number, baseLine?: number}} [at] hunk position
 * @returns {Array<{kind: string, action: string, value: string, line: number, baseLine: number}>}
 */
function lineIntents(content, action, at = {}) {
  const out = [];
  for (const rule of INTENT_RULES) {
    const m = content.match(rule.re);
    if (!m) continue;
    const value = rule.pick(m);
    if (value) out.push({ kind: rule.kind, action, value, line: at.line || 0, baseLine: at.baseLine || 0 });
  }
  return out;
}

/**
 * Collapse the added/removed intent lists into one set.
 *
 * A value present on both sides was reformatted or moved, not introduced —
 * reporting it as new is how a report loses a QA reader's trust.
 * @param {Array<{kind: string, action: string, value: string}>} intents
 * @returns {Array<{kind: string, action: string, value: string}>}
 */
function reconcileIntents(intents) {
  const seen = new Map();
  for (const intent of intents) {
    const key = `${intent.kind} ${intent.value}`;
    const existing = seen.get(key);
    if (!existing) seen.set(key, { ...intent });
    else if (existing.action !== intent.action) existing.action = 'changed';
  }
  return [...seen.values()].slice(0, INTENT_CAP);
}

/**
 * Resolve the base ref to diff against.
 * @param {string|null} requested
 * @returns {{ref: string, base: string, label: string}}
 */
function resolveBase(requested) {
  const candidates = requested
    ? [requested]
    : ['main', 'origin/main', 'develop', 'origin/develop', 'master', 'origin/master'];
  for (const ref of candidates) {
    if (!git(['rev-parse', '--verify', '--quiet', ref], { allowFail: true })) continue;
    const base = git(['merge-base', ref, 'HEAD'], { allowFail: true });
    if (base) return { ref, base, label: `${ref} (merge-base ${base.slice(0, 7)})` };
  }
  const head = git(['rev-parse', 'HEAD~1'], { allowFail: true }) || git(['rev-parse', 'HEAD'], { allowFail: true });
  return { ref: 'HEAD~1', base: head, label: 'HEAD~1 (no core branch found)' };
}

/**
 * Parse `git diff --unified=0` output into per-file records.
 * @param {string} raw diff text
 * @param {string} origin 'committed' | 'working' | 'staged'
 * @returns {Map<string, object>}
 */
function parseDiff(raw, origin) {
  const files = new Map();
  if (!raw) return files;

  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      const p = header[2];
      current = files.get(p) || {
        path: p,
        previousPath: header[1] !== header[2] ? header[1] : null,
        status: 'M',
        origin,
        added: 0,
        removed: 0,
        ranges: [],
        baseRanges: [],
        intents: [],
        binary: false,
        codeLines: 0,
        commentLines: 0,
      };
      files.set(p, current);
      continue;
    }
    if (!current) continue;

    if (line.startsWith('new file mode')) current.status = 'A';
    else if (line.startsWith('deleted file mode')) current.status = 'D';
    else if (line.startsWith('rename from')) current.status = 'R';
    else if (/^Binary files /.test(line)) current.binary = true;
    else if (line.startsWith('@@')) {
      const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunk) {
        const oldStart = parseInt(hunk[1], 10);
        const oldCount = hunk[2] === undefined ? 1 : parseInt(hunk[2], 10);
        const start = parseInt(hunk[3], 10);
        const count = hunk[4] === undefined ? 1 : parseInt(hunk[4], 10);
        current.removed += oldCount;
        current.added += count;
        // A pure deletion reports +N,0 — anchor it to the surrounding line so the
        // range still intersects requirement citations.
        if (count === 0) current.ranges.push([Math.max(1, start), Math.max(1, start)]);
        else current.ranges.push([start, start + count - 1]);

        // Base-side coordinates. Requirement citations in docs/requirements.md
        // are written against the base revision, so an insertion of 20 lines
        // must not be tested against post-change line numbers — that is how an
        // untouched requirement 40 lines below gets reported as "directly
        // changed". A pure insertion reports -N,0: it occupies no base line, so
        // anchor it to the seam it was inserted into.
        if (oldCount === 0) current.baseRanges.push([Math.max(1, oldStart), Math.max(1, oldStart + 1)]);
        else current.baseRanges.push([oldStart, oldStart + oldCount - 1]);

        current.newCursor = start;
        current.baseAnchor = Math.max(1, oldStart);
      }
    } else if (/^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line)) {
      // Body of a hunk. Classifying every touched line is what lets the report
      // tell a Swagger/JSDoc block apart from a logic change.
      const content = line.slice(1);
      const isAddition = line[0] === '+';
      const at = { line: current.newCursor || 0, baseLine: current.baseAnchor || 0 };
      // Only an addition advances the new-side cursor; a removed line occupies
      // no line in the file as it now stands.
      if (isAddition) current.newCursor = (current.newCursor || 0) + 1;
      if (content.trim() === '') continue;
      if (isCommentLine(content)) current.commentLines += 1;
      else current.codeLines += 1;
      if (current.intents.length < INTENT_CAP * 4) {
        current.intents.push(...lineIntents(content, isAddition ? 'added' : 'removed', at));
      }
    }
  }
  return files;
}

/**
 * Label each changed file with where its edits currently live.
 *
 * Origin is reported separately from the diff that produces the line ranges.
 * Merging three diffs to get both was the earlier design, and it silently mixed
 * coordinate spaces: `--cached` numbers a file against HEAD while a two-dot
 * diff numbers it against the merge-base, so the unioned ranges described no
 * single revision.
 *
 * @param {Map<string, object>} files
 * @param {string|null} baseSha
 */
function tagOrigins(files, baseSha) {
  const names = (args) =>
    new Set(git(args, { allowFail: true }).split(/\r?\n/).filter(Boolean));

  const committed = baseSha ? names(['diff', '--name-only', `${baseSha}...HEAD`]) : new Set();
  const staged = names(['diff', '--name-only', '--cached']);
  const working = names(['diff', '--name-only']);

  for (const [p, record] of files) {
    const where = [];
    if (committed.has(p)) where.push('committed');
    if (staged.has(p)) where.push('staged');
    if (working.has(p)) where.push('working');
    record.origin = where.length > 1 ? 'mixed' : where[0] || record.origin;
  }
}

/**
 * Collapse overlapping/adjacent ranges so downstream overlap checks stay cheap.
 * @param {Array<[number, number]>} ranges
 * @returns {Array<[number, number]>}
 */
function normalizeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out = [sorted[0].slice()];
  for (const [from, to] of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/**
 * Name the declarations a file's changed hunks fall inside.
 * Heuristic: nearest preceding declaration line for each hunk start.
 * @param {object} record
 * @returns {string[]}
 */
function changedSymbols(record) {
  if (record.status === 'D' || record.binary || !/\.jsx?$/.test(record.path)) return [];
  const abs = path.join(REPO_ROOT, record.path);
  if (!fs.existsSync(abs)) return [];

  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const found = new Set();
  for (const [start] of record.ranges) {
    for (let i = Math.min(start, lines.length) - 1; i >= 0; i -= 1) {
      const m = lines[i].match(SYMBOL_RE);
      if (!m) continue;
      const route = m[4] ? `${m[4].toUpperCase()} ${m[5] || '/'}` : null;
      const name = route || m[1] || m[2] || m[3] || m[6] || m[7];
      if (name && !/^(if|for|while|switch|catch|return|try|else)$/.test(name)) {
        found.add(name);
        break;
      }
    }
  }
  return [...found];
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  const committedOnly = argv.includes('--committed-only');
  const stagedOnly = argv.includes('--staged');
  const quiet = argv.includes('--quiet');

  const base = resolveBase(arg('--base'));

  // One diff, one coordinate space. `git diff <base>` spans the merge-base all
  // the way to the working tree, so committed, staged and unstaged edits to the
  // same file share both their new-side and their base-side line numbers.
  const diffArgs = stagedOnly
    ? ['diff', '--unified=0', '--no-color', '--cached']
    : committedOnly
      ? ['diff', '--unified=0', '--no-color', `${base.base}...HEAD`]
      : ['diff', '--unified=0', '--no-color', base.base];

  const defaultOrigin = stagedOnly ? 'staged' : committedOnly ? 'committed' : 'working';
  const files = base.base || stagedOnly
    ? parseDiff(git(diffArgs, { allowFail: true }), defaultOrigin)
    : new Map();
  if (!stagedOnly && !committedOnly) tagOrigins(files, base.base);

  if (!committedOnly && !stagedOnly) {
    const untracked = git(['ls-files', '--others', '--exclude-standard'], { allowFail: true })
      .split(/\r?\n/)
      .filter(Boolean);
    for (const p of untracked) {
      if (files.has(p)) continue;
      let lines = [];
      try {
        lines = fs.readFileSync(path.join(REPO_ROOT, p), 'utf8').split(/\r?\n/);
      } catch (err) {
        lines = [];
      }
      const nonBlank = lines.filter((l) => l.trim() !== '');
      files.set(p, {
        path: p,
        previousPath: null,
        status: 'A',
        origin: 'untracked',
        added: lines.length,
        removed: 0,
        ranges: lines.length ? [[1, lines.length]] : [],
        baseRanges: [],
        intents: lines.flatMap((l, i) => lineIntents(l, 'added', { line: i + 1, baseLine: 0 })),
        binary: false,
        commentLines: nonBlank.filter(isCommentLine).length,
        codeLines: nonBlank.filter((l) => !isCommentLine(l)).length,
      });
    }
  }

  const records = [...files.values()]
    .map((r) => {
      r.ranges = normalizeRanges(r.ranges);
      r.baseRanges = normalizeRanges(r.baseRanges || []);
      r.intents = reconcileIntents(r.intents || []);
      delete r.newCursor;
      delete r.baseAnchor;
      r.symbols = changedSymbols(r);
      const { category, runtime } = classify(r.path);
      r.category = category;
      r.runtime = runtime && !r.binary;
      // Tooling and docs describe the app rather than being it. Left in, this
      // file's own INTENT_RULES source matches every rule it defines, and the
      // report announces a new field labelled `]*>\s*([^`.
      if (!r.runtime) r.intents = [];
      // Only meaningful for JS: a .json config has no comment syntax to detect.
      r.commentOnly =
        category === 'code' && r.status !== 'D' && r.commentLines > 0 && r.codeLines === 0;
      return r;
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true }),
      head: git(['rev-parse', '--short', 'HEAD'], { allowFail: true }),
      baseRef: base.ref,
      baseSha: base.base ? base.base.slice(0, 7) : null,
      baseLabel: base.label,
      scope: stagedOnly ? 'staged' : committedOnly ? 'committed-only' : 'branch+working-tree',
      totals: {
        files: records.length,
        runtimeFiles: records.filter((r) => r.runtime).length,
        commentOnlyFiles: records.filter((r) => r.commentOnly).length,
        behaviouralFiles: records.filter((r) => r.runtime && !r.commentOnly).length,
        added: records.reduce((n, r) => n + r.added, 0),
        removed: records.reduce((n, r) => n + r.removed, 0),
        byCategory: records.reduce((acc, r) => {
          acc[r.category] = (acc[r.category] || 0) + 1;
          return acc;
        }, {}),
      },
    },
    files: records,
  };

  const out = writeArtifact('changes.json', payload);
  if (!quiet) {
    const t = payload.meta.totals;
    console.log(`changes written: ${rel(out)}`);
    console.log(`  base: ${base.label} | scope: ${payload.meta.scope}`);
    console.log(`  ${t.files} files changed (${t.runtimeFiles} runtime), +${t.added}/-${t.removed}`);
    if (t.commentOnlyFiles) {
      console.log(`  ${t.commentOnlyFiles} of those are comment/annotation-only (${t.behaviouralFiles} behavioural)`);
    }
  }
}

if (require.main === module) main();

module.exports = { resolveBase, parseDiff, normalizeRanges, changedSymbols, lineIntents, reconcileIntents };
