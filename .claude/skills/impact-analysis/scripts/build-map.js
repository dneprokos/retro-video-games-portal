#!/usr/bin/env node
'use strict';

/**
 * build-map.js — derive the change→regression dictionary from the repository.
 *
 * Nothing here is hand-maintained. Six extractors read the source of truth:
 *
 *   a. requirements  docs/requirements.md — F-ids, FR-ids, NFRs and the
 *                    `file:line-range` citation that ends every requirement.
 *   b. imports       relative require()/import graph, plus its reverse.
 *   c. endpoints     server/routes/*.js route table with its auth guards.
 *   d. consumers     client axios call sites + the App.js URL table.
 *   e. tests         unit test → source links, e2e spec → endpoint links,
 *                    and the coverage gaps that fall out of both.
 *   f. meta          git sha/branch plus self-check counters.
 *
 * Output: .impact/impact-map.json
 *
 * Usage: node .claude/skills/impact-analysis/scripts/build-map.js [--quiet]
 */

const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT,
  rel,
  read,
  walk,
  allSourceFiles,
  git,
  parseRanges,
  lineOf,
  normalizeApiPath,
  endpointKey,
  writeArtifact,
} = require('./lib');

const REQUIREMENTS_DOC = 'docs/requirements.md';

/** Middleware names that constitute an authorization decision. */
const GUARD_NAMES = ['authenticateToken', 'requireAdmin', 'requireOwner', 'optionalAuth'];

/**
 * Matches a backticked source citation such as `server/models/Game.js:4-10,173-184`.
 * The extension requirement keeps prose backticks (`name`, `genre`) out of the results.
 */
const CITATION_RE = /`([A-Za-z0-9_@./-]+\.(?:js|jsx|json|md|yml|yaml|ps1|sh))(?::([\d,\s-]+))?`/g;

// ---------------------------------------------------------------------------
// a. Requirements index
// ---------------------------------------------------------------------------

/**
 * Extract every citation from a line of requirement prose.
 * @param {string} line
 * @returns {Array<{file: string, ranges: Array<[number, number]>}>}
 */
function extractCitations(line) {
  const out = [];
  let m;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(line)) !== null) {
    out.push({ file: m[1], ranges: parseRanges(m[2]) });
  }
  return out;
}

/**
 * Parse docs/requirements.md into features, requirements and a file index.
 * @returns {{features: object, nfrs: Array, fileIndex: object, unresolved: string[], counts: object}}
 */
function buildRequirements() {
  const doc = read(REQUIREMENTS_DOC);
  const features = {};
  const nfrs = [];
  const fileIndex = {};
  const unresolved = new Set();

  if (!doc) {
    return { features, nfrs, fileIndex, unresolved: [], counts: { features: 0, frs: 0, nfrs: 0, acceptance: 0 } };
  }

  const lines = doc.split(/\r?\n/);
  let feature = null;
  let section = null; // 'fr' | 'ac' | null
  let frCount = 0;
  let acCount = 0;

  /**
   * Record a citation against the file index.
   * @param {{file: string, ranges: Array<[number,number]>}} cite
   * @param {string} kind 'fr' | 'acceptance'
   * @param {object} payload
   */
  const index = (cite, kind, payload) => {
    if (!fs.existsSync(path.join(REPO_ROOT, cite.file))) {
      unresolved.add(cite.file);
      return;
    }
    const entry = (fileIndex[cite.file] = fileIndex[cite.file] || {
      features: [],
      frs: [],
      acceptance: [],
    });
    if (payload.featureId && !entry.features.includes(payload.featureId)) {
      entry.features.push(payload.featureId);
    }
    entry[kind === 'fr' ? 'frs' : 'acceptance'].push({ ...payload, ranges: cite.ranges });
  };

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    const heading = line.match(/^###\s+(F-\d+):\s*(.+?)\s*$/);
    if (heading) {
      feature = {
        id: heading[1],
        title: heading[2],
        line: lineNo,
        dependsOn: [],
        frs: [],
        acceptance: [],
      };
      features[feature.id] = feature;
      section = null;
      return;
    }
    if (/^##\s+\d+\./.test(line)) {
      // Left the feature-breakdown section (e.g. "## 5. Non-Functional Requirements").
      feature = null;
      section = null;
    }

    if (/^\s*-\s+\*\*Functional Requirements:\*\*/.test(line)) { section = 'fr'; return; }
    if (/^\s*-\s+\*\*Acceptance Criteria:\*\*/.test(line)) { section = 'ac'; return; }
    if (/^\s*-\s+\*\*(Summary|Actors|Description|Out of Scope|Priority):\*\*/.test(line)) { section = null; }

    const deps = line.match(/^\s*-\s+\*\*Dependencies:\*\*\s*(.+)$/);
    if (deps && feature) {
      feature.dependsOn = [...new Set((deps[1].match(/F-\d+/g) || []))];
      section = null;
      return;
    }

    const nfr = line.match(/\*\*(NFR-\d+)\*\*\s*(.*)$/);
    if (nfr) {
      nfrs.push({ id: nfr[1], text: nfr[2].trim(), line: lineNo, citations: extractCitations(line) });
      return;
    }

    const fr = line.match(/\*\*(FR-\d+\.\d+)\*\*\s*(.*)$/);
    if (fr && feature) {
      const citations = extractCitations(line);
      const record = { id: fr[1], text: fr[2].trim(), line: lineNo, citations };
      feature.frs.push(record);
      frCount += 1;
      citations.forEach((c) => index(c, 'fr', { featureId: feature.id, frId: fr[1], text: record.text }));
      return;
    }

    if (section === 'ac' && feature && /^\s*-\s+Given/i.test(line)) {
      const citations = extractCitations(line);
      const text = line.replace(/^\s*-\s+/, '').replace(CITATION_RE, '').replace(/\s*\(\s*,?\s*\)\s*\.?$/, '.').trim();
      const record = { text, line: lineNo, citations };
      feature.acceptance.push(record);
      acCount += 1;
      citations.forEach((c) => index(c, 'acceptance', { featureId: feature.id, text }));
    }
  });

  return {
    features,
    nfrs,
    fileIndex,
    unresolved: [...unresolved].sort(),
    counts: { features: Object.keys(features).length, frs: frCount, nfrs: nfrs.length, acceptance: acCount },
  };
}

// ---------------------------------------------------------------------------
// b. Import graph
// ---------------------------------------------------------------------------

/**
 * Resolve a relative specifier to a repo-relative file, trying extensions.
 * @param {string} fromFile repo-relative importer
 * @param {string} spec raw specifier
 * @returns {string|null}
 */
function resolveImport(fromFile, spec) {
  const base = path.resolve(REPO_ROOT, path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return rel(candidate);
  }
  return null;
}

/**
 * Build the forward and reverse relative-import graphs.
 * @param {string[]} files
 * @returns {{imports: object, importedBy: object}}
 */
function buildImportGraph(files) {
  const imports = {};
  const importedBy = {};

  for (const file of files) {
    const src = read(file);
    if (src === null) continue;
    const specs = new Set();
    const patterns = [
      /require\(\s*['"](\.[^'"]+)['"]\s*\)/g,
      /import\s+[\s\S]*?from\s*['"](\.[^'"]+)['"]/g,
      /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(src)) !== null) specs.add(m[1]);
    }
    const resolved = [...specs].map((s) => resolveImport(file, s)).filter(Boolean);
    imports[file] = [...new Set(resolved)].sort();
    for (const target of imports[file]) {
      (importedBy[target] = importedBy[target] || []).push(file);
    }
  }

  Object.keys(importedBy).forEach((k) => { importedBy[k] = [...new Set(importedBy[k])].sort(); });
  return { imports, importedBy };
}

// ---------------------------------------------------------------------------
// c. Route table
// ---------------------------------------------------------------------------

/**
 * Map each router module to the URL prefix it is mounted at in server.js.
 * @returns {object} repo-relative route file → mount prefix
 */
function buildMountPoints() {
  const src = read('server/server.js') || '';
  const varToFile = {};
  let m;

  const requireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  while ((m = requireRe.exec(src)) !== null) {
    const resolved = resolveImport('server/server.js', m[2]);
    if (resolved) varToFile[m[1]] = resolved;
  }

  const mounts = {};
  const useRe = /app\.use\(\s*['"](\/api[^'"]*)['"]\s*,\s*(\w+)/g;
  while ((m = useRe.exec(src)) !== null) {
    if (varToFile[m[2]]) mounts[varToFile[m[2]]] = m[1];
  }
  return mounts;
}

/**
 * Extract the full endpoint table, including the auth guards on each route.
 * @returns {Array<object>}
 */
function buildEndpoints() {
  const mounts = buildMountPoints();
  const endpoints = [];

  for (const file of walk('server/routes')) {
    if (/\.test\.js$/.test(file)) continue;
    const src = read(file);
    if (!src) continue;
    const prefix = mounts[file] || '';

    const routeRe = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/g;
    let m;
    while ((m = routeRe.exec(src)) !== null) {
      // Everything between the path literal and the handler signature holds the
      // middleware list — it may be inline or a multi-line array of validators.
      const tail = src.slice(m.index, m.index + 6000);
      const handlerAt = tail.search(/async\s*\(\s*req|\(\s*req\s*,\s*res\s*\)/);
      const middleware = handlerAt > 0 ? tail.slice(0, handlerAt) : tail.slice(0, 400);
      const guards = GUARD_NAMES.filter((g) => new RegExp(`\\b${g}\\b`).test(middleware));

      const fullPath = `${prefix}${m[2] === '/' ? '' : m[2]}` || '/';
      endpoints.push({
        method: m[1].toUpperCase(),
        path: fullPath,
        key: endpointKey(m[1], fullPath),
        file,
        line: lineOf(src, m.index),
        guards,
        public: guards.length === 0 || (guards.length === 1 && guards[0] === 'optionalAuth'),
        validated: /\bbody\(|\bquery\(|\bparam\(/.test(middleware),
      });
    }
  }

  // Inline endpoints declared straight on the app (health check, docs).
  const serverSrc = read('server/server.js') || '';
  const inlineRe = /app\.(get|post|put|patch|delete)\(\s*['"](\/[^'"]*)['"]/g;
  let im;
  while ((im = inlineRe.exec(serverSrc)) !== null) {
    endpoints.push({
      method: im[1].toUpperCase(),
      path: im[2],
      key: endpointKey(im[1], im[2]),
      file: 'server/server.js',
      line: lineOf(serverSrc, im.index),
      guards: [],
      public: true,
      validated: false,
    });
  }

  return endpoints.sort((a, b) => a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// d. Client consumers and the user-visible URL table
// ---------------------------------------------------------------------------

/**
 * Parse App.js into the browser route table, resolving each element to a file.
 * @param {object} imports forward import graph
 * @returns {Array<object>}
 */
function buildScreens(imports) {
  const file = 'client/src/App.js';
  const src = read(file);
  if (!src) return [];

  const componentFiles = {};
  for (const dep of imports[file] || []) {
    componentFiles[path.basename(dep).replace(/\.jsx?$/, '')] = dep;
  }

  // Collect the path literals first so each <Route> block can be bounded by the
  // next one — a fixed look-ahead window bleeds `requiredRole` across routes.
  const marks = [];
  const pathRe = /path\s*=\s*["']([^"']+)["']/g;
  let pm;
  while ((pm = pathRe.exec(src)) !== null) marks.push({ url: pm[1], index: pm.index });

  const screens = [];
  marks.forEach((m, i) => {
    const stop = i + 1 < marks.length ? marks[i + 1].index : src.length;
    const block = src.slice(m.index, Math.min(stop, m.index + 500));
    const requiredRole = (block.match(/requiredRole\s*=\s*["'](\w+)["']/) || [])[1] || null;
    const component = (block.match(/<([A-Z]\w+)\s*\/>/) || [])[1]
      || (block.match(/<([A-Z]\w+)[\s>]/g) || [])
        .map((t) => t.replace(/[<\s>]/g, ''))
        .find((name) => name !== 'ProtectedRoute' && name !== 'Route');
    screens.push({
      url: m.url,
      component: component || null,
      file: component ? componentFiles[component] || null : null,
      requiredRole,
      protected: Boolean(requiredRole),
      line: lineOf(src, m.index),
    });
  });
  return screens;
}

/**
 * Find every client-side call site for an API endpoint.
 * Test files and MSW mocks are excluded — they consume nothing at runtime.
 * @returns {object} endpoint key → call sites
 */
function buildApiConsumers() {
  const consumers = {};
  const files = walk('client/src').filter((f) => !/\.test\.js$|\/mocks\//.test(f));

  for (const file of files) {
    const src = read(file);
    if (!src) continue;
    const re = /axios\.(get|post|put|patch|delete)\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const raw = m[3];
      if (!raw.includes('/api/')) continue;
      const key = endpointKey(m[1], raw);
      (consumers[key] = consumers[key] || []).push({ file, line: lineOf(src, m.index), raw });
    }
  }
  return consumers;
}

// ---------------------------------------------------------------------------
// e. Test index
// ---------------------------------------------------------------------------

/**
 * Link every source file to the tests that exercise it, and derive the gaps.
 * @param {string[]} files all source files
 * @param {object} imports forward import graph
 * @returns {object}
 */
function buildTests(files, imports) {
  const unitTests = files.filter((f) => /\.test\.jsx?$/.test(f));
  const testedBy = {};

  for (const test of unitTests) {
    const targets = new Set((imports[test] || []).filter((t) => !/\.test\.jsx?$/.test(t)));
    // Co-located convention: Game.test.js proves Game.js even without an import.
    const sibling = test.replace(/\.test\.(jsx?)$/, '.$1');
    if (files.includes(sibling)) targets.add(sibling);
    for (const target of targets) {
      (testedBy[target] = testedBy[target] || []).push(test);
    }
  }
  Object.keys(testedBy).forEach((k) => { testedBy[k] = [...new Set(testedBy[k])].sort(); });

  // e2e api-client method → endpoint, so a spec's helper calls resolve to routes.
  const clientFile = 'e2e/tests/utils/api-client.js';
  const clientSrc = read(clientFile) || '';
  const helperEndpoints = {};
  const methodRe = /async\s+(\w+)\s*\(/g;
  let hm;
  const methodPositions = [];
  while ((hm = methodRe.exec(clientSrc)) !== null) methodPositions.push({ name: hm[1], index: hm.index });
  methodPositions.forEach((entry, i) => {
    const end = i + 1 < methodPositions.length ? methodPositions[i + 1].index : clientSrc.length;
    const body = clientSrc.slice(entry.index, end);
    const seg = body.match(/\$\{this\.baseURL\}\/([A-Za-z0-9_-]+)/);
    if (seg) helperEndpoints[entry.name] = endpointKey('GET', `/api/${seg[1]}`);
  });

  const specs = walk('e2e/tests', /\.spec\.js$/).map((file) => {
    const src = read(file) || '';
    const titles = [];
    const titleRe = /\btest\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
    let tm;
    while ((tm = titleRe.exec(src)) !== null) titles.push({ title: tm[2], line: lineOf(src, tm.index) });

    const helpers = [...new Set((src.match(/apiClient\.(\w+)\(/g) || []).map((s) => s.slice(10, -1)))];
    const endpoints = [...new Set(helpers.map((h) => helperEndpoints[h]).filter(Boolean))];
    const suite = (src.match(/test\.describe\(\s*['"`]([^'"`]+)/) || [])[1] || path.basename(file, '.spec.js');

    return { file, suite, tests: titles, count: titles.length, endpoints, empty: titles.length === 0 };
  });

  // Anything shipped that no test references at all.
  const shippable = files.filter(
    (f) => !/\.test\.jsx?$|\.spec\.js$|\/mocks\/|^e2e\/|setupTests|test-utils|jest\.config/.test(f)
  );
  const coverageGaps = shippable.filter((f) => !(testedBy[f] || []).length).sort();

  return { unitTests, testedBy, specs, helperEndpoints, coverageGaps };
}

/**
 * Notes in the source that claim something does not exist yet.
 *
 * A test or page object saying "platform filter is not implemented" is correct
 * right up until someone implements it, and then it is a lie that no test run
 * will ever catch — the stub still passes. Collecting the claims here lets the
 * analyzer cross-check them against what the branch actually built.
 *
 * @param {string[]} files
 * @returns {Array<{file: string, line: number, text: string}>}
 */
const STALE_MARKER_RE = /\b(not\s+(?:yet\s+)?implemented|not\s+implemented\s+yet|no-?op|placeholder|would\s+need\s+to\s+be\s+implemented|TODO|FIXME)\b/i;

function buildStaleMarkers(files) {
  const out = [];
  for (const file of files) {
    const src = read(file);
    if (!src) continue;
    src.split(/\r?\n/).forEach((line, i) => {
      if (out.length >= 200) return;
      if (!STALE_MARKER_RE.test(line)) return;
      // Only prose carries a claim; a variable named `todoCount` does not.
      if (!/(\/\/|\/\*|\*|['"`])/.test(line)) return;
      out.push({ file, line: i + 1, text: line.trim().replace(/^[/*\s]+/, '').slice(0, 160) });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

function main() {
  const quiet = process.argv.includes('--quiet');
  const files = allSourceFiles();

  const requirements = buildRequirements();
  const { imports, importedBy } = buildImportGraph(files);
  const endpoints = buildEndpoints();
  const screens = buildScreens(imports);
  const apiConsumers = buildApiConsumers();
  const tests = buildTests(files, imports);
  const staleMarkers = buildStaleMarkers(files);

  // Endpoints the UI never calls are API-only surface; useful signal for QA.
  const consumedKeys = new Set(Object.keys(apiConsumers));
  endpoints.forEach((e) => { e.consumers = apiConsumers[e.key] || []; e.uiReachable = consumedKeys.has(e.key); });

  const map = {
    meta: {
      generatedAt: new Date().toISOString(),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true }),
      sha: git(['rev-parse', '--short', 'HEAD'], { allowFail: true }),
      sourceFiles: files.length,
      counts: {
        ...requirements.counts,
        endpoints: endpoints.length,
        screens: screens.length,
        unitTests: tests.unitTests.length,
        e2eSpecs: tests.specs.length,
        coverageGaps: tests.coverageGaps.length,
        staleMarkers: staleMarkers.length,
      },
      unresolvedCitations: requirements.unresolved,
    },
    features: requirements.features,
    nfrs: requirements.nfrs,
    fileIndex: requirements.fileIndex,
    imports,
    importedBy,
    endpoints,
    screens,
    apiConsumers,
    tests,
    staleMarkers,
  };

  const out = writeArtifact('impact-map.json', map);

  if (!quiet) {
    const c = map.meta.counts;
    console.log(`impact-map written: ${rel(out)}`);
    console.log(
      `  ${c.features} features, ${c.frs} FRs, ${c.nfrs} NFRs, ${c.acceptance} acceptance criteria`
    );
    console.log(
      `  ${c.endpoints} endpoints, ${c.screens} screens, ${c.unitTests} unit tests, ${c.e2eSpecs} e2e specs`
    );
    console.log(`  ${files.length} source files, ${c.coverageGaps} with no test coverage`);
    if (requirements.unresolved.length) {
      console.log(`  WARNING: ${requirements.unresolved.length} citation(s) point at missing files:`);
      requirements.unresolved.forEach((f) => console.log(`    - ${f}`));
    }
  }
}

if (require.main === module) main();

module.exports = { buildRequirements, buildImportGraph, buildEndpoints, buildScreens, buildApiConsumers, buildTests };
