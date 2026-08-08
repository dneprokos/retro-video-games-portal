#!/usr/bin/env node
'use strict';

/**
 * analyze.js — join the dictionary against the branch diff and write the
 * QA regression report.
 *
 * Refreshes both inputs (build-map.js, collect-changes.js) unless --no-refresh
 * is passed, then applies the propagation rules documented in
 * references/report-template.md and emits .impact/impact-report.md.
 *
 * Usage:
 *   node .claude/skills/impact-analysis/scripts/analyze.js
 *   node ... --base develop --committed-only
 *   node ... --no-refresh          reuse the existing .impact/*.json
 */

const path = require('path');
const { execFileSync } = require('child_process');
const { OUT_DIR, rel, rangesOverlap, readArtifact, writeArtifact } = require('./lib');

/** Files whose behaviour every authenticated request depends on. */
const AUTH_FILES = ['server/middleware/auth.js', 'client/src/contexts/AuthContext.js', 'client/src/components/ProtectedRoute.js'];

/** How far to walk the reverse-import graph when computing blast radius. */
const BLAST_DEPTH = 2;

const WEIGHT = { direct: 3, likely: 2, indirect: 1 };

/** Most manual acceptance criteria to list per feature before linking out. */
const MANUAL_CAP = 8;

// ---------------------------------------------------------------------------
// Input refresh
// ---------------------------------------------------------------------------

/**
 * Regenerate the map and the change set.
 * @param {string[]} passThrough args forwarded to collect-changes.js
 */
function refresh(passThrough) {
  const run = (script, args) =>
    execFileSync(process.execPath, [path.join(__dirname, script), '--quiet', ...args], { stdio: 'inherit' });
  run('build-map.js', []);
  run('collect-changes.js', passThrough);
}

// ---------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------

/**
 * Accumulator for one feature's evidence.
 * @typedef {{id: string, title: string, direct: Set, likely: Set, indirect: Set, reasons: string[], frs: Set, files: Set}} Hit
 */

/**
 * Build the per-feature hit set by applying every propagation rule.
 * @param {object} map impact-map.json
 * @param {object} changes changes.json
 * @returns {{hits: Map<string, Hit>, endpointHits: Map<string, object>, screenHits: Map<string, object>, blast: object, changedRuntime: object[]}}
 */
function propagate(map, changes) {
  const changedRuntime = changes.files.filter((f) => f.runtime && f.status !== 'D');
  const changedPaths = new Set(changedRuntime.map((f) => f.path));
  const byPath = new Map(changedRuntime.map((f) => [f.path, f]));

  /** @type {Map<string, Hit>} */
  const hits = new Map();
  const hit = (featureId) => {
    if (!hits.has(featureId)) {
      const feature = map.features[featureId];
      hits.set(featureId, {
        id: featureId,
        title: feature ? feature.title : featureId,
        direct: new Set(),
        likely: new Set(),
        indirect: new Set(),
        reasons: [],
        frs: new Set(),
        files: new Set(),
      });
    }
    return hits.get(featureId);
  };
  const note = (h, reason) => { if (!h.reasons.includes(reason)) h.reasons.push(reason); };

  // --- Rules 1 & 2: requirement citations, line-range aware ----------------
  for (const change of changedRuntime) {
    const entry = map.fileIndex[change.path];
    if (!entry) continue;

    for (const fr of entry.frs) {
      const h = hit(fr.featureId);
      h.files.add(change.path);
      const overlaps = change.status === 'A' || rangesOverlap(change.ranges, fr.ranges);
      (overlaps ? h.direct : h.likely).add(change.path);
      h.frs.add(fr.frId);
      note(h, overlaps
        ? `${fr.frId} is implemented in the changed lines of \`${change.path}\``
        : `${fr.frId} lives in \`${change.path}\` (changed elsewhere in the file)`);
    }
    for (const ac of entry.acceptance) {
      const h = hit(ac.featureId);
      h.files.add(change.path);
      h.indirect.add(change.path);
      note(h, `acceptance criteria for ${ac.featureId} cite \`${change.path}\``);
    }
  }

  // --- Rule 3: reverse-import blast radius ---------------------------------
  const blast = {};
  for (const change of changedRuntime) {
    const seen = new Set([change.path]);
    let frontier = [change.path];
    const reached = [];
    for (let depth = 1; depth <= BLAST_DEPTH; depth += 1) {
      const next = [];
      for (const file of frontier) {
        for (const importer of map.importedBy[file] || []) {
          if (seen.has(importer)) continue;
          seen.add(importer);
          next.push(importer);
          reached.push({ file: importer, depth });
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    if (reached.length) blast[change.path] = reached;

    for (const { file, depth } of reached) {
      if (/\.test\.jsx?$/.test(file) || changedPaths.has(file)) continue;
      const entry = map.fileIndex[file];
      if (!entry) continue;
      for (const featureId of entry.features) {
        const h = hit(featureId);
        h.indirect.add(file);
        note(h, `\`${file}\` imports the changed code (depth ${depth})`);
      }
    }
  }

  // --- Rules 4-6: API surface ----------------------------------------------
  /** @type {Map<string, object>} */
  const endpointHits = new Map();
  const flagEndpoint = (endpoint, why, directly) => {
    const existing = endpointHits.get(endpoint.key);
    if (existing) {
      existing.directlyChanged = existing.directlyChanged || directly;
      if (!existing.why.includes(why)) existing.why.push(why);
      return existing;
    }
    const record = { ...endpoint, why: [why], directlyChanged: directly };
    endpointHits.set(endpoint.key, record);
    return record;
  };

  const authTouched = AUTH_FILES.some((f) => changedPaths.has(f));

  for (const endpoint of map.endpoints) {
    const change = byPath.get(endpoint.file);
    if (change) {
      // Rule 4: the route file itself moved.
      const inHunk = change.status === 'A' || rangesOverlap(change.ranges, [[endpoint.line, endpoint.line + 60]]);
      flagEndpoint(endpoint, inHunk ? 'handler sits in a changed hunk' : 'declared in a changed route file', inHunk);
    } else {
      // Rule 5: a module the route depends on moved.
      const deps = (map.imports[endpoint.file] || []).filter((d) => changedPaths.has(d));
      if (deps.length) flagEndpoint(endpoint, `depends on changed \`${deps.join('`, `')}\``, false);
    }
    // Rule 6: an authorization change reaches every guarded route.
    if (authTouched && endpoint.guards.length && changedPaths.has('server/middleware/auth.js')) {
      flagEndpoint(endpoint, 'guarded by the changed auth middleware', false);
    }
  }

  // Endpoints pull in their client callers, and those callers' features.
  for (const endpoint of endpointHits.values()) {
    for (const consumer of endpoint.consumers || []) {
      const entry = map.fileIndex[consumer.file];
      if (!entry) continue;
      for (const featureId of entry.features) {
        const h = hit(featureId);
        h.indirect.add(consumer.file);
        note(h, `\`${consumer.file}\` calls \`${endpoint.key}\``);
      }
    }
  }

  // --- Rule 7: screens ------------------------------------------------------
  /** @type {Map<string, object>} */
  const screenHits = new Map();
  const flagScreen = (screen, why) => {
    const existing = screenHits.get(screen.url);
    if (existing) {
      if (!existing.why.includes(why)) existing.why.push(why);
      return;
    }
    screenHits.set(screen.url, { ...screen, why: [why] });
  };

  const consumerFiles = new Set();
  for (const endpoint of endpointHits.values()) {
    (endpoint.consumers || []).forEach((c) => consumerFiles.add(c.file));
  }

  for (const screen of map.screens) {
    if (!screen.file) continue;
    if (changedPaths.has(screen.file)) flagScreen(screen, 'its page component changed');
    if (consumerFiles.has(screen.file)) flagScreen(screen, 'it calls an affected endpoint');
    const importsChanged = (map.imports[screen.file] || []).some((d) => changedPaths.has(d));
    if (importsChanged) flagScreen(screen, 'it imports changed code');
    if (screen.protected && authTouched) flagScreen(screen, 'auth/authorization code changed and this route is role-gated');
  }
  if (changedPaths.has('client/src/components/Navbar.js') || changedPaths.has('client/src/App.js')) {
    map.screens.forEach((s) => flagScreen(s, 'the application shell renders on every route'));
  }

  // Screens feed their features back in.
  for (const screen of screenHits.values()) {
    const entry = screen.file ? map.fileIndex[screen.file] : null;
    if (!entry) continue;
    for (const featureId of entry.features) {
      const h = hit(featureId);
      h.indirect.add(screen.file);
      note(h, `screen \`${screen.url}\` is affected`);
    }
  }

  return { hits, endpointHits, screenHits, blast, changedRuntime, authTouched };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Turn evidence into a ranked risk level.
 * @param {Map<string, Hit>} hits
 * @param {object} map
 * @param {boolean} authTouched
 * @returns {object[]} scored features, highest risk first
 */
function score(hits, map, authTouched) {
  const gaps = new Set(map.tests.coverageGaps);

  const scored = [...hits.values()].map((h) => {
    // A file proven to be directly changed should not also be reported as a
    // weaker "same file, different lines" hit.
    h.direct.forEach((f) => h.likely.delete(f));
    [...h.direct, ...h.likely].forEach((f) => h.indirect.delete(f));
    const files = [...h.files, ...h.indirect];
    const base =
      WEIGHT.direct * h.direct.size + WEIGHT.likely * h.likely.size + WEIGHT.indirect * h.indirect.size;

    let multiplier = 1;
    const modifiers = [];
    if (authTouched && h.direct.size) { multiplier *= 2; modifiers.push('authorization code changed'); }
    const untested = files.filter((f) => gaps.has(f));
    if (untested.length) { multiplier *= 1.5; modifiers.push(`${untested.length} affected file(s) have no automated test`); }

    const value = Math.round(base * multiplier * 10) / 10;
    const level = value >= 8 || (h.direct.size && authTouched) ? 'High' : value >= 3 ? 'Medium' : 'Low';

    return {
      ...h,
      direct: [...h.direct],
      likely: [...h.likely],
      indirect: [...h.indirect],
      frs: [...h.frs].sort(),
      files: [...new Set(files)].sort(),
      untested,
      score: value,
      level,
      modifiers,
    };
  });

  const rank = { High: 0, Medium: 1, Low: 2 };
  return scored.sort((a, b) => rank[a.level] - rank[b.level] || b.score - a.score || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Test recommendations
// ---------------------------------------------------------------------------

/**
 * Turn a unit test path into the command that runs just that file.
 * @param {string} testFile
 * @returns {string}
 */
function unitCommand(testFile) {
  if (testFile.startsWith('server/')) return `cd server && npx jest ${testFile.replace(/^server\//, '')}`;
  if (testFile.startsWith('client/')) {
    const name = path.basename(testFile).replace(/\.test\.jsx?$/, '');
    return `cd client && npm test -- --watchAll=false --testPathPattern="${name}"`;
  }
  return `npx jest ${testFile}`;
}

/**
 * Find the e2e tests a feature's acceptance criteria point at, resolving the
 * cited line ranges down to individual test titles where possible.
 * @param {object} feature
 * @param {object} map
 * @returns {Array<{spec: string, titles: string[], command: string}>}
 */
function e2eForFeature(feature, map) {
  const bySpec = new Map();
  const criteria = [...(feature.acceptance || []), ...(feature.frs || [])];

  for (const item of criteria) {
    for (const cite of item.citations || []) {
      if (!/^e2e\/.*\.spec\.js$/.test(cite.file)) continue;
      const spec = map.tests.specs.find((s) => s.file === cite.file);
      if (!spec) continue;
      const entry = bySpec.get(cite.file) || { spec: cite.file, titles: new Set() };
      for (const test of spec.tests) {
        if (!cite.ranges.length || cite.ranges.some(([from, to]) => test.line >= from - 8 && test.line <= to + 2)) {
          entry.titles.add(test.title);
        }
      }
      bySpec.set(cite.file, entry);
    }
  }

  return [...bySpec.values()].map((entry) => {
    const specPath = entry.spec.replace(/^e2e\//, '');
    const titles = [...entry.titles];
    return {
      spec: entry.spec,
      titles,
      command:
        titles.length && titles.length < 4
          ? `cd e2e && npx playwright test ${specPath} -g "${titles[0]}"`
          : `cd e2e && npx playwright test ${specPath}`,
    };
  });
}

/**
 * Assemble the automated + manual checklist for one scored feature.
 * @param {object} entry scored feature
 * @param {object} map
 * @returns {{automated: string[], e2e: object[], manual: object[]}}
 */
function checklistFor(entry, map) {
  const feature = map.features[entry.id] || { acceptance: [], frs: [] };

  const unitTests = new Set();
  for (const file of entry.files) {
    for (const test of map.tests.testedBy[file] || []) unitTests.add(test);
  }

  const e2e = e2eForFeature(feature, map);
  const automatedCovers = unitTests.size > 0 || e2e.length > 0;

  // Criteria with no automation behind them have to be walked by hand.
  const manual = automatedCovers && e2e.length
    ? (feature.acceptance || []).filter((ac) => !(ac.citations || []).some((c) => /^e2e\//.test(c.file)))
    : feature.acceptance || [];

  return {
    automated: [...unitTests].sort().map(unitCommand),
    e2e,
    manual,
    hasAutomation: automatedCovers,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const BADGE = { High: '🔴 High', Medium: '🟠 Medium', Low: '🟡 Low' };

/**
 * Render the markdown report.
 * @returns {string}
 */
function render(map, changes, scored, endpointHits, screenHits, blast, authTouched) {
  const L = [];
  const t = changes.meta.totals;
  const cat = t.byCategory || {};

  L.push('# Impact Analysis — QA Regression Scope');
  L.push('');
  L.push(`**Branch** \`${changes.meta.branch}\` @ \`${changes.meta.head}\`  `);
  L.push(`**Compared against** ${changes.meta.baseLabel}  `);
  L.push(`**Scope** ${changes.meta.scope}  `);
  L.push(`**Generated** ${new Date(changes.meta.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC`);
  L.push('');
  L.push(
    `${t.files} files changed (+${t.added}/-${t.removed}) — ` +
      `**${cat.code || 0} source**, ${cat.config || 0} config, ${cat.docs || 0} docs, ${cat.tooling || 0} tooling, ${cat.other || 0} other.`
  );
  L.push('');

  if (!scored.length) {
    L.push('## No feature impact detected');
    L.push('');
    L.push(
      changes.meta.totals.runtimeFiles === 0
        ? 'No runtime source files changed on this branch. Nothing to regression-test.'
        : 'Runtime files changed but none of them are referenced by any requirement, route, screen or importer. Review manually — this may mean the map needs a new citation in `docs/requirements.md`.'
    );
    L.push('');
    appendIgnored(L, changes);
    return `${L.join('\n')}\n`;
  }

  // 0. What actually changed
  const changedCode = changes.files.filter((f) => f.runtime && f.status !== 'D');
  if (changedCode.length) {
    L.push('## 0. Changed source');
    L.push('');
    L.push('| File | Δ | Lines | Declarations touched |');
    L.push('|---|---|---|---|');
    for (const f of changedCode) {
      const ranges = f.ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).slice(0, 6).join(', ');
      const symbols = f.symbols.length ? f.symbols.map((s) => `\`${s}\``).join(', ') : '_—_';
      L.push(`| \`${f.path}\` | ${f.status} +${f.added}/-${f.removed} | ${ranges || '_whole file_'} | ${symbols} |`);
    }
    L.push('');
  }

  // 1. Risk table
  L.push('## 1. Affected features');
  L.push('');
  L.push('| Risk | Feature | Why | Automated coverage |');
  L.push('|---|---|---|---|');
  for (const entry of scored) {
    const checklist = checklistFor(entry, map);
    const coverage = checklist.hasAutomation
      ? `${checklist.automated.length} unit, ${checklist.e2e.length} e2e spec(s)`
      : '**none — manual only**';
    L.push(
      `| ${BADGE[entry.level]} | **${entry.id}** ${entry.title} | ${entry.reasons[0] || '—'} | ${coverage} |`
    );
  }
  L.push('');
  if (authTouched) {
    L.push('> ⚠️ Authorization code changed. Every role-gated route and guarded endpoint is in scope regardless of score.');
    L.push('');
  }

  // 2. Detail per feature
  L.push('## 2. Evidence');
  L.push('');
  for (const entry of scored) {
    L.push(`### ${entry.id} — ${entry.title} · ${BADGE[entry.level]} (score ${entry.score})`);
    L.push('');
    if (entry.frs.length) L.push(`**Requirements touched:** ${entry.frs.join(', ')}`);
    if (entry.direct.length) L.push(`**Changed directly:** ${entry.direct.map((f) => `\`${f}\``).join(', ')}`);
    if (entry.likely.length) L.push(`**Same file, different lines:** ${entry.likely.map((f) => `\`${f}\``).join(', ')}`);
    if (entry.indirect.length) L.push(`**Reached indirectly:** ${entry.indirect.map((f) => `\`${f}\``).join(', ')}`);
    if (entry.modifiers.length) L.push(`**Risk modifiers:** ${entry.modifiers.join('; ')}`);
    L.push('');
    entry.reasons.slice(0, 6).forEach((r) => L.push(`- ${r}`));
    L.push('');
  }

  // 3. API surface
  if (endpointHits.size) {
    L.push('## 3. API surface in scope');
    L.push('');
    L.push('| Endpoint | Guards | Changed | Called from | Why |');
    L.push('|---|---|---|---|---|');
    for (const e of [...endpointHits.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      const guards = e.guards.length ? e.guards.join(' + ') : 'public';
      const callers = (e.consumers || []).length
        ? [...new Set(e.consumers.map((c) => path.basename(c.file)))].join(', ')
        : '_API only_';
      L.push(`| \`${e.key}\` | ${guards} | ${e.directlyChanged ? 'yes' : 'no'} | ${callers} | ${e.why.join('; ')} |`);
    }
    L.push('');
  }

  // 4. Screens
  if (screenHits.size) {
    L.push('## 4. Screens in scope');
    L.push('');
    L.push('| URL | Component | Role required | Why |');
    L.push('|---|---|---|---|');
    for (const s of screenHits.values()) {
      L.push(`| \`${s.url}\` | ${s.component || '?'} | ${s.requiredRole || 'public'} | ${s.why.join('; ')} |`);
    }
    L.push('');
  }

  // 5. Blast radius
  const blastEntries = Object.entries(blast);
  if (blastEntries.length) {
    L.push('## 5. Blast radius (reverse imports)');
    L.push('');
    L.push('```');
    for (const [file, reached] of blastEntries) {
      L.push(file);
      reached.forEach((r, i) => {
        const deeperFollows = reached.slice(i + 1).some((n) => n.depth === r.depth);
        const indent = '  '.repeat(r.depth);
        L.push(`${indent}${deeperFollows ? '├─' : '└─'} ${r.file}`);
      });
    }
    L.push('```');
    L.push('');
  }

  // 6. The checklist
  L.push('## 6. QA regression checklist');
  L.push('');
  L.push('### Run these');
  L.push('');
  const commands = new Set();
  for (const entry of scored) {
    const checklist = checklistFor(entry, map);
    checklist.automated.forEach((c) => commands.add(c));
    checklist.e2e.forEach((e) => commands.add(e.command));
  }
  if (commands.size) {
    L.push('```bash');
    [...commands].forEach((c) => L.push(c));
    L.push('```');
  } else {
    L.push('_No automated test covers any affected area — everything below is manual._');
  }
  L.push('');

  L.push('### Verify by hand');
  L.push('');
  // Only High/Medium features earn a full manual walkthrough — a Low hit does
  // not justify replaying six acceptance criteria.
  const manualFeatures = scored.filter((s) => s.level !== 'Low');
  for (const entry of manualFeatures) {
    const checklist = checklistFor(entry, map);
    if (!checklist.manual.length) continue;
    const shown = checklist.manual.slice(0, MANUAL_CAP);
    L.push(`**${entry.id} — ${entry.title}** ${BADGE[entry.level]}${checklist.hasAutomation ? '' : ' · no automation exists'}`);
    L.push('');
    shown.forEach((ac) => L.push(`- [ ] ${ac.text}`));
    if (checklist.manual.length > shown.length) {
      L.push(`- [ ] _…${checklist.manual.length - shown.length} further criteria — see \`docs/requirements.md\` ${entry.id}_`);
    }
    L.push('');
  }
  const lowFeatures = scored.filter((s) => s.level === 'Low');
  if (lowFeatures.length) {
    L.push(
      `_Smoke-test only:_ ${lowFeatures.map((s) => `**${s.id}** ${s.title}`).join(', ')} — reached indirectly, ` +
        'confirm the feature still loads rather than replaying its full criteria.'
    );
    L.push('');
  }
  if (!manualFeatures.length && !lowFeatures.length) {
    L.push('_Nothing to walk by hand._');
    L.push('');
  }

  // 7. Coverage gaps
  const gaps = new Set(map.tests.coverageGaps);
  const hitGaps = [...new Set(scored.flatMap((s) => s.files))].filter((f) => gaps.has(f)).sort();
  if (hitGaps.length) {
    L.push('## 7. Coverage gaps hit by this change');
    L.push('');
    L.push('These affected files have **no automated test at all**. Changes here are only as safe as manual QA:');
    L.push('');
    hitGaps.forEach((f) => L.push(`- \`${f}\``));
    L.push('');
  }

  // 8. Watch list from feature dependencies
  const affected = new Set(scored.map((s) => s.id));
  const downstream = Object.values(map.features)
    .filter((f) => !affected.has(f.id) && f.dependsOn.some((d) => affected.has(d)))
    .map((f) => `${f.id} ${f.title} (depends on ${f.dependsOn.filter((d) => affected.has(d)).join(', ')})`);
  if (downstream.length) {
    L.push('## 8. Downstream watch list');
    L.push('');
    L.push('Not directly touched, but declared as dependent in `docs/requirements.md`. Smoke-test if time allows:');
    L.push('');
    downstream.forEach((d) => L.push(`- ${d}`));
    L.push('');
  }

  appendIgnored(L, changes);
  return `${L.join('\n')}\n`;
}

/**
 * Append the transparency section listing what was deliberately not scored.
 * @param {string[]} L
 * @param {object} changes
 */
function appendIgnored(L, changes) {
  const ignored = changes.files.filter((f) => !f.runtime);
  if (!ignored.length) return;
  L.push('## Excluded from scoring');
  L.push('');
  L.push('Changed, but cannot alter runtime behaviour:');
  L.push('');
  const byCat = ignored.reduce((acc, f) => {
    (acc[f.category] = acc[f.category] || []).push(f.path);
    return acc;
  }, {});
  for (const [category, files] of Object.entries(byCat)) {
    L.push(`- **${category}** (${files.length}): ${files.slice(0, 6).map((f) => `\`${f}\``).join(', ')}${files.length > 6 ? `, +${files.length - 6} more` : ''}`);
  }
  L.push('');
}

// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  if (!argv.includes('--no-refresh')) {
    refresh(argv.filter((a) => a !== '--no-refresh' && a !== '--quiet'));
  }

  const map = readArtifact('impact-map.json');
  const changes = readArtifact('changes.json');
  if (!map || !changes) {
    console.error('Missing .impact artifacts. Run without --no-refresh.');
    process.exit(1);
  }

  const { hits, endpointHits, screenHits, blast, authTouched } = propagate(map, changes);
  const scored = score(hits, map, authTouched);
  const report = render(map, changes, scored, endpointHits, screenHits, blast, authTouched);

  const out = writeArtifact('impact-report.md', report);
  console.log(`impact report written: ${rel(out)}`);
  if (scored.length) {
    const summary = scored.map((s) => `${s.id}:${s.level}`).join('  ');
    console.log(`  features affected: ${scored.length}  ${summary}`);
    console.log(`  endpoints: ${endpointHits.size}  screens: ${screenHits.size}`);
  } else {
    console.log('  no feature impact detected');
  }
}

if (require.main === module) main();

module.exports = { propagate, score, checklistFor, e2eForFeature, render };
