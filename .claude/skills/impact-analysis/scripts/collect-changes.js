#!/usr/bin/env node
'use strict';

/**
 * collect-changes.js — capture what the current branch changed.
 *
 * Default scope is "everything this branch did that main has not seen":
 * committed work since the merge-base, plus staged and unstaged edits, plus
 * untracked files. QA scoping needs work-in-progress too, not just the PR diff.
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
const { REPO_ROOT, classify, git, writeArtifact, rel } = require('./lib');

/** Declaration forms worth naming when a hunk lands inside one. */
const SYMBOL_RE = /^\s*(?:(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=|(?:module\.)?exports\.(\w+)\s*=|router\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]|(\w+)\s*:\s*(?:async\s*)?(?:function|\()|(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{)/;

/**
 * Resolve the base ref to diff against.
 * @param {string|null} requested
 * @returns {{ref: string, base: string, label: string}}
 */
function resolveBase(requested) {
  const candidates = requested ? [requested] : ['main', 'origin/main', 'develop', 'origin/develop'];
  for (const ref of candidates) {
    if (!git(`rev-parse --verify --quiet ${ref}`, { allowFail: true })) continue;
    const base = git(`merge-base ${ref} HEAD`, { allowFail: true });
    if (base) return { ref, base, label: `${ref} (merge-base ${base.slice(0, 7)})` };
  }
  const head = git('rev-parse HEAD~1', { allowFail: true }) || git('rev-parse HEAD', { allowFail: true });
  return { ref: 'HEAD~1', base: head, label: 'HEAD~1 (no main branch found)' };
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
        binary: false,
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
      const hunk = line.match(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunk) {
        const start = parseInt(hunk[2], 10);
        const count = hunk[3] === undefined ? 1 : parseInt(hunk[3], 10);
        current.removed += hunk[1] === undefined ? 1 : parseInt(hunk[1], 10);
        current.added += count;
        // A pure deletion reports +N,0 — anchor it to the surrounding line so the
        // range still intersects requirement citations.
        if (count === 0) current.ranges.push([Math.max(1, start), Math.max(1, start)]);
        else current.ranges.push([start, start + count - 1]);
      }
    }
  }
  return files;
}

/**
 * Merge a diff result into the accumulator, unioning line ranges.
 * @param {Map<string, object>} into
 * @param {Map<string, object>} from
 */
function merge(into, from) {
  for (const [p, record] of from) {
    const existing = into.get(p);
    if (!existing) {
      into.set(p, record);
      continue;
    }
    existing.added += record.added;
    existing.removed += record.removed;
    existing.ranges.push(...record.ranges);
    existing.binary = existing.binary || record.binary;
    if (existing.status === 'M' && record.status !== 'M') existing.status = record.status;
    if (existing.origin !== record.origin) existing.origin = 'mixed';
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
  const files = new Map();

  if (!stagedOnly && base.base) {
    merge(files, parseDiff(git(`diff --unified=0 --no-color ${base.base}...HEAD`, { allowFail: true }), 'committed'));
  }
  if (!committedOnly) {
    merge(files, parseDiff(git('diff --unified=0 --no-color --cached', { allowFail: true }), 'staged'));
    if (!stagedOnly) {
      merge(files, parseDiff(git('diff --unified=0 --no-color', { allowFail: true }), 'working'));

      const untracked = git('ls-files --others --exclude-standard', { allowFail: true })
        .split(/\r?\n/)
        .filter(Boolean);
      for (const p of untracked) {
        if (files.has(p)) continue;
        let lineCount = 0;
        try {
          lineCount = fs.readFileSync(path.join(REPO_ROOT, p), 'utf8').split(/\r?\n/).length;
        } catch (err) {
          lineCount = 0;
        }
        files.set(p, {
          path: p,
          previousPath: null,
          status: 'A',
          origin: 'untracked',
          added: lineCount,
          removed: 0,
          ranges: lineCount ? [[1, lineCount]] : [],
          binary: false,
        });
      }
    }
  }

  const records = [...files.values()]
    .map((r) => {
      r.ranges = normalizeRanges(r.ranges);
      r.symbols = changedSymbols(r);
      const { category, runtime } = classify(r.path);
      r.category = category;
      r.runtime = runtime && !r.binary;
      return r;
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      branch: git('rev-parse --abbrev-ref HEAD', { allowFail: true }),
      head: git('rev-parse --short HEAD', { allowFail: true }),
      baseRef: base.ref,
      baseSha: base.base ? base.base.slice(0, 7) : null,
      baseLabel: base.label,
      scope: stagedOnly ? 'staged' : committedOnly ? 'committed-only' : 'branch+working-tree',
      totals: {
        files: records.length,
        runtimeFiles: records.filter((r) => r.runtime).length,
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
  }
}

if (require.main === module) main();

module.exports = { resolveBase, parseDiff, normalizeRanges, changedSymbols };
