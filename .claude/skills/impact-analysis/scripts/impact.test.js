'use strict';

/**
 * Tests for the impact-analysis scripts.
 *
 *   node --test .claude/skills/impact-analysis/scripts/
 *   npm run impact:test
 *
 * Uses the Node built-in test runner — no dependency, consistent with the rest
 * of the toolchain. The analyzer is exercised against synthetic fixtures rather
 * than the live repo so the assertions stay stable as the app evolves.
 */

const test = require('node:test');
const assert = require('node:assert');

const lib = require('./lib');
const { parseDiff, normalizeRanges, resolveBase } = require('./collect-changes');
const { propagate, score, e2eForFeature, render } = require('./analyze');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A diff whose only additions are a JSDoc/Swagger block. */
const COMMENT_ONLY_DIFF = `diff --git a/server/routes/auth.js b/server/routes/auth.js
--- a/server/routes/auth.js
+++ b/server/routes/auth.js
@@ -60,0 +61,5 @@
+/**
+ * @swagger
+ * /api/auth/login:
+ *   post:
+ */
`;

/** A diff that moves real logic. */
const BEHAVIOUR_DIFF = `diff --git a/server/middleware/auth.js b/server/middleware/auth.js
--- a/server/middleware/auth.js
+++ b/server/middleware/auth.js
@@ -20,1 +20,2 @@
-  if (decoded.exp < now) return res.status(401).json({ message: 'Token expired' });
+  // expiry is inclusive
+  if (decoded.exp <= now) return res.status(401).json({ message: 'Token expired' });
`;

/**
 * Minimal impact-map covering one feature, one endpoint, one screen.
 * @returns {object}
 */
function fixtureMap() {
  return {
    meta: { counts: {} },
    features: {
      'F-02': {
        id: 'F-02',
        title: 'Authentication',
        dependsOn: [],
        frs: [{ id: 'FR-02.1', text: 'login', line: 1, citations: [{ file: 'server/routes/auth.js', ranges: [[60, 70]] }] }],
        acceptance: [
          { text: 'Given valid credentials, When submitted, Then a token is returned.', line: 2, citations: [{ file: 'e2e/tests/auth.spec.js', ranges: [[10, 30]] }] },
        ],
      },
      'F-04': { id: 'F-04', title: 'Authorization', dependsOn: ['F-02'], frs: [], acceptance: [] },
    },
    nfrs: [],
    fileIndex: {
      'server/routes/auth.js': {
        features: ['F-02'],
        frs: [{ featureId: 'F-02', frId: 'FR-02.1', text: 'login', ranges: [[60, 70]] }],
        acceptance: [],
      },
      'server/middleware/auth.js': {
        features: ['F-04'],
        frs: [{ featureId: 'F-04', frId: 'FR-04.1', text: 'guards', ranges: [[10, 40]] }],
        acceptance: [],
      },
      'client/src/pages/Login.js': { features: ['F-02'], frs: [], acceptance: [] },
    },
    imports: { 'server/routes/auth.js': ['server/middleware/auth.js'], 'client/src/pages/Login.js': [] },
    importedBy: { 'server/middleware/auth.js': ['server/routes/auth.js'] },
    endpoints: [
      {
        method: 'POST', path: '/api/auth/login', key: 'POST /api/auth/login',
        file: 'server/routes/auth.js', line: 65, guards: [], public: true,
        consumers: [{ file: 'client/src/pages/Login.js', line: 10 }], uiReachable: true,
      },
      {
        method: 'GET', path: '/api/auth/me', key: 'GET /api/auth/me',
        file: 'server/routes/auth.js', line: 200, guards: ['authenticateToken'], public: false,
        consumers: [], uiReachable: false,
      },
    ],
    screens: [{ url: '/login', component: 'Login', file: 'client/src/pages/Login.js', requiredRole: null, protected: false, line: 5 }],
    apiConsumers: {},
    tests: { unitTests: [], testedBy: {}, specs: [{ file: 'e2e/tests/auth.spec.js', suite: 'Auth', tests: [{ title: 'logs in', line: 12 }], count: 1, endpoints: [], empty: false }], helperEndpoints: {}, coverageGaps: ['server/routes/auth.js'] },
  };
}

/**
 * Wrap file records in the changes.json envelope.
 * @param {object[]} files
 * @returns {object}
 */
function fixtureChanges(files) {
  return {
    meta: {
      generatedAt: new Date().toISOString(), branch: 'test', head: 'abc1234',
      baseRef: 'main', baseSha: 'def5678', baseLabel: 'main (merge-base def5678)',
      scope: 'branch+working-tree',
      totals: {
        files: files.length,
        runtimeFiles: files.filter((f) => f.runtime).length,
        commentOnlyFiles: files.filter((f) => f.commentOnly).length,
        behaviouralFiles: files.filter((f) => f.runtime && !f.commentOnly).length,
        added: 0, removed: 0, byCategory: {},
      },
    },
    files,
  };
}

/**
 * One changed-file record with sensible defaults.
 * @param {string} p
 * @param {object} [over]
 * @returns {object}
 */
function changed(p, over = {}) {
  return {
    path: p, previousPath: null, status: 'M', origin: 'committed',
    added: 5, removed: 0, ranges: [[60, 70]], binary: false,
    codeLines: 5, commentLines: 0, symbols: [], category: 'code',
    runtime: true, commentOnly: false, ...over,
  };
}

// ---------------------------------------------------------------------------
// lib
// ---------------------------------------------------------------------------

test('parseRanges handles single lines, spans and comma lists', () => {
  assert.deepStrictEqual(lib.parseRanges('4-10,173-184'), [[4, 10], [173, 184]]);
  assert.deepStrictEqual(lib.parseRanges('288'), [[288, 288]]);
  assert.deepStrictEqual(lib.parseRanges(undefined), []);
  assert.deepStrictEqual(lib.parseRanges('not-a-range'), []);
});

test('rangesOverlap is inclusive and order-independent', () => {
  assert.ok(lib.rangesOverlap([[10, 20]], [[20, 30]]));
  assert.ok(lib.rangesOverlap([[20, 30]], [[10, 20]]));
  assert.ok(!lib.rangesOverlap([[10, 19]], [[20, 30]]));
  assert.ok(!lib.rangesOverlap([], [[1, 5]]));
});

test('normalizeApiPath collapses params, template holes and query strings', () => {
  assert.strictEqual(lib.normalizeApiPath('/api/games/${id}'), '/api/games/:p');
  assert.strictEqual(lib.normalizeApiPath('/api/games/:id'), '/api/games/:p');
  assert.strictEqual(lib.normalizeApiPath('/api/games?limit=1000&page=1'), '/api/games');
  assert.strictEqual(lib.endpointKey('get', '/api/games/${id}'), 'GET /api/games/:p');
});

test('classify separates app code from docs, assets and tooling', () => {
  assert.deepStrictEqual(lib.classify('server/routes/games.js'), { category: 'code', runtime: true });
  assert.deepStrictEqual(lib.classify('package.json'), { category: 'config', runtime: true });
  assert.deepStrictEqual(lib.classify('docker/nginx.conf'), { category: 'config', runtime: true });
  assert.deepStrictEqual(lib.classify('docs/requirements.md'), { category: 'docs', runtime: false });
  assert.deepStrictEqual(lib.classify('docs/guides/images/01-home.png'), { category: 'asset', runtime: false });
  assert.deepStrictEqual(lib.classify('.claude/skills/impact-analysis/scripts/lib.js'), { category: 'tooling', runtime: false });
});

test('isCommentLine recognises JSDoc, line comments and blanks', () => {
  ['/**', ' * @swagger', ' */', '// note', '   ', ''].forEach((l) => assert.ok(lib.isCommentLine(l), `expected comment: ${JSON.stringify(l)}`));
  ['const x = 1;', 'router.get("/", handler);', 'return res.json({});'].forEach((l) => assert.ok(!lib.isCommentLine(l), `expected code: ${l}`));
});

test('git() refuses a shell string so args cannot be interpolated', () => {
  assert.throws(() => lib.git('rev-parse HEAD'), /argument array/);
  assert.strictEqual(lib.git(['rev-parse', '--verify', '--quiet', 'refs/heads/definitely-not-a-branch'], { allowFail: true }), '');
});

// ---------------------------------------------------------------------------
// collect-changes
// ---------------------------------------------------------------------------

test('parseDiff extracts line ranges and separates comment from code lines', () => {
  const files = parseDiff(COMMENT_ONLY_DIFF, 'committed');
  const record = files.get('server/routes/auth.js');
  assert.ok(record, 'expected the file to be parsed');
  assert.deepStrictEqual(record.ranges, [[61, 65]]);
  assert.strictEqual(record.commentLines, 5);
  assert.strictEqual(record.codeLines, 0);
});

test('parseDiff counts a mixed hunk as behavioural', () => {
  const record = parseDiff(BEHAVIOUR_DIFF, 'committed').get('server/middleware/auth.js');
  assert.strictEqual(record.commentLines, 1);
  assert.strictEqual(record.codeLines, 2, 'one removed + one added executable line');
});

test('parseDiff ignores the +++/--- file headers', () => {
  const record = parseDiff(COMMENT_ONLY_DIFF, 'committed').get('server/routes/auth.js');
  assert.strictEqual(record.commentLines + record.codeLines, 5);
});

test('normalizeRanges merges overlapping and adjacent spans', () => {
  assert.deepStrictEqual(normalizeRanges([[5, 10], [8, 12], [30, 31]]), [[5, 12], [30, 31]]);
  assert.deepStrictEqual(normalizeRanges([[5, 6], [7, 8]]), [[5, 8]], 'adjacent spans merge');
  assert.deepStrictEqual(normalizeRanges([]), []);
});

test('resolveBase falls back through the core branch candidates', () => {
  const base = resolveBase(null);
  assert.ok(base.ref, 'a base ref is always resolved');
  assert.ok(base.label.includes(base.ref));
});

// ---------------------------------------------------------------------------
// analyze — propagation
// ---------------------------------------------------------------------------

test('a hunk overlapping a requirement citation is a direct hit', () => {
  const { hits } = propagate(fixtureMap(), fixtureChanges([changed('server/routes/auth.js', { ranges: [[62, 64]] })]));
  const f02 = hits.get('F-02');
  assert.ok(f02.direct.has('server/routes/auth.js'));
  assert.strictEqual(f02.likely.size, 0);
  assert.ok(f02.frs.has('FR-02.1'));
});

test('a hunk elsewhere in a cited file is a weaker same-file hit', () => {
  const { hits } = propagate(fixtureMap(), fixtureChanges([changed('server/routes/auth.js', { ranges: [[500, 505]] })]));
  const f02 = hits.get('F-02');
  assert.strictEqual(f02.direct.size, 0);
  assert.ok(f02.likely.has('server/routes/auth.js'));
});

test('a comment-only change produces an annotation hit, never a direct one', () => {
  const change = changed('server/routes/auth.js', { commentOnly: true, commentLines: 5, codeLines: 0, ranges: [[62, 64]] });
  const { hits, endpointHits } = propagate(fixtureMap(), fixtureChanges([change]));
  const f02 = hits.get('F-02');
  assert.strictEqual(f02.direct.size, 0, 'comments are not a direct hit');
  assert.ok(f02.annotation.has('server/routes/auth.js'));
  assert.ok(endpointHits.get('POST /api/auth/login').annotationOnly, 'endpoint flagged as docs-only');
});

test('a comment-only change does not propagate to client callers', () => {
  const change = changed('server/routes/auth.js', { commentOnly: true, commentLines: 5, codeLines: 0 });
  const { screenHits } = propagate(fixtureMap(), fixtureChanges([change]));
  assert.strictEqual(screenHits.size, 0, 'no screen is dragged in by a doc change');
});

test('an auth middleware change reaches every guarded endpoint', () => {
  const map = fixtureMap();
  const { endpointHits, hits } = propagate(map, fixtureChanges([changed('server/middleware/auth.js', { ranges: [[20, 21]] })]));
  const guarded = endpointHits.get('GET /api/auth/me');
  assert.ok(guarded, 'guarded endpoint is in scope');
  assert.ok(guarded.why.some((w) => /auth middleware/.test(w)));
  assert.ok(hits.has('F-02'), 'reverse imports carry the change into the route feature');
});

test('blast radius stops at the configured depth and skips comment-only sources', () => {
  const map = fixtureMap();
  const behaviour = propagate(map, fixtureChanges([changed('server/middleware/auth.js')]));
  assert.ok(behaviour.blast['server/middleware/auth.js'], 'behavioural change has a blast radius');

  const comments = propagate(map, fixtureChanges([changed('server/middleware/auth.js', { commentOnly: true })]));
  assert.strictEqual(Object.keys(comments.blast).length, 0, 'comments reach no importer');
});

// ---------------------------------------------------------------------------
// analyze — scoring
// ---------------------------------------------------------------------------

test('scoring ranks a direct auth change as High', () => {
  const map = fixtureMap();
  const changes = fixtureChanges([changed('server/middleware/auth.js', { ranges: [[20, 21]] })]);
  const { hits, authTouched } = propagate(map, changes);
  assert.ok(authTouched);
  const f04 = score(hits, map, authTouched).find((s) => s.id === 'F-04');
  assert.strictEqual(f04.level, 'High');
});

test('scoring forces annotation-only evidence to Low with an explicit modifier', () => {
  const map = fixtureMap();
  const changes = fixtureChanges([changed('server/routes/auth.js', { commentOnly: true, ranges: [[62, 64]] })]);
  const { hits, authTouched } = propagate(map, changes);
  const f02 = score(hits, map, authTouched).find((s) => s.id === 'F-02');
  assert.strictEqual(f02.level, 'Low');
  assert.ok(f02.annotationOnly);
  assert.ok(f02.modifiers.some((m) => /annotation/.test(m)));
});

test('an untested affected file raises the score', () => {
  const map = fixtureMap();
  const changes = fixtureChanges([changed('server/routes/auth.js', { ranges: [[62, 64]] })]);
  const { hits, authTouched } = propagate(map, changes);
  const f02 = score(hits, map, authTouched).find((s) => s.id === 'F-02');
  assert.ok(f02.untested.includes('server/routes/auth.js'));
  assert.ok(f02.modifiers.some((m) => /no automated test/.test(m)));
});

test('a file is never counted in two confidence buckets at once', () => {
  const map = fixtureMap();
  map.fileIndex['server/routes/auth.js'].frs.push({ featureId: 'F-02', frId: 'FR-02.2', text: 'other', ranges: [[900, 910]] });
  const changes = fixtureChanges([changed('server/routes/auth.js', { ranges: [[62, 64]] })]);
  const { hits, authTouched } = propagate(map, changes);
  const f02 = score(hits, map, authTouched).find((s) => s.id === 'F-02');
  assert.deepStrictEqual(f02.direct, ['server/routes/auth.js']);
  assert.deepStrictEqual(f02.likely, [], 'the direct hit wins');
});

// ---------------------------------------------------------------------------
// analyze — report
// ---------------------------------------------------------------------------

test('e2eForFeature resolves a cited line range to the test title', () => {
  const map = fixtureMap();
  const specs = e2eForFeature(map.features['F-02'], map);
  assert.strictEqual(specs.length, 1);
  assert.deepStrictEqual(specs[0].titles, ['logs in']);
  assert.match(specs[0].command, /playwright test tests\/auth\.spec\.js -g "logs in"/);
});

test('a wholly comment-only branch renders the documentation banner', () => {
  const map = fixtureMap();
  const changes = fixtureChanges([changed('server/routes/auth.js', { commentOnly: true, commentLines: 5, codeLines: 0 })]);
  const { hits, endpointHits, screenHits, blast, authTouched } = propagate(map, changes);
  const report = render(map, changes, score(hits, map, authTouched), endpointHits, screenHits, blast, authTouched);
  assert.match(report, /changed comments only/);
  assert.match(report, /📝 comments only/);
});

test('config changes are reported even when no feature is hit', () => {
  const map = fixtureMap();
  const changes = fixtureChanges([
    { ...changed('docker/nginx.conf', { category: 'config', ranges: [[1, 2]] }) },
  ]);
  const { hits, endpointHits, screenHits, blast, authTouched } = propagate(map, changes);
  const report = render(map, changes, score(hits, map, authTouched), endpointHits, screenHits, blast, authTouched);
  assert.match(report, /## Configuration & environment/);
  assert.match(report, /Reverse-proxy routing changed/);
});

test('an unmatched source file is named rather than silently dropped', () => {
  const map = fixtureMap();
  const changes = fixtureChanges([changed('server/utils/orphan.js')]);
  const { hits, endpointHits, screenHits, blast, authTouched } = propagate(map, changes);
  const report = render(map, changes, score(hits, map, authTouched), endpointHits, screenHits, blast, authTouched);
  assert.match(report, /server\/utils\/orphan\.js/);
  assert.match(report, /missing a citation/);
});
