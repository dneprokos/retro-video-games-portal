'use strict';

/**
 * Tests for the static defect scanner.
 *
 * Every case runs against a synthetic fixture — a hand-written route, model or
 * contract map — never against the live application. A test that asserted
 * "Game.name has no maximum" would start failing the day someone fixes the
 * defect, which is exactly backwards: the scanner is what should be under test,
 * not the codebase it happens to be pointed at.
 *
 * Run: npm run scan:test
 */

const test = require('node:test');
const assert = require('node:assert');

const lib = require('./lib');
const extract = require('./build-contract-map');
const scan = require('./scan');

/* ------------------------------------------------------------------ *
 * Fixture builders
 * ------------------------------------------------------------------ */

const handler = (over = {}) => ({
  guardedFields: [],
  uniquenessChecks: [],
  responseKeys: [],
  writesModel: false,
  readsById: false,
  persisted: { fields: [], wildcard: false },
  mapsValidationError: false,
  mapsCastError: false,
  has500: true,
  leaksError: false,
  massAssignment: false,
  regexFromInput: false,
  readsParams: [],
  conditions: [],
  ...over,
});

const routeEntry = (over = {}) => ({
  endpoint: 'POST /api/games',
  file: 'server/routes/games.js',
  line: 10,
  in: 'body',
  persisted: true,
  guardedInHandler: false,
  optional: false,
  notEmpty: false,
  minLength: null,
  maxLength: null,
  min: null,
  max: null,
  minItems: null,
  type: null,
  format: null,
  enumRef: null,
  custom: null,
  sanitizers: [],
  messages: [],
  ...over,
});

const route = (over = {}) => ({
  method: 'POST',
  path: '/',
  file: 'server/routes/games.js',
  line: 10,
  endpoint: 'POST /api/games',
  guards: ['authenticateToken', 'requireAdmin'],
  resources: ['Game'],
  validators: [],
  handler: handler(),
  ...over,
});

const field = (over = {}) => ({ route: [], model: null, client: null, doc: null, tests: [], ...over });

const mapOf = ({ resources = {}, routes = [], docs, meta } = {}) => ({
  meta: { routeFiles: [], modelFiles: [], formFiles: [], testFiles: [], ...meta },
  resources,
  routes,
  docs: docs || { schemas: {}, parameters: [] },
});

/** One resource with one field, the shape most contract tests need. */
const oneField = (name, spec) => mapOf({ resources: { Game: { model: 'server/models/Game.js', statics: {}, fields: { [name]: field(spec) } } } });

const rules = (findings) => findings.map((f) => f.rule);

/* ------------------------------------------------------------------ *
 * lib
 * ------------------------------------------------------------------ */

test('maskComments blanks comment lines and preserves every offset', () => {
  const src = 'const a = 1;\n// a comment\n * swagger line\nconst b = 2;';
  const masked = lib.maskComments(src);
  assert.strictEqual(masked.length, src.length);
  assert.match(masked, /const a = 1;/);
  assert.doesNotMatch(masked, /comment/);
  assert.doesNotMatch(masked, /swagger/);
  assert.match(masked, /const b = 2;/);
});

test('stripLineComments removes a trailing comment but not a URL scheme', () => {
  assert.strictEqual(lib.stripLineComments("const x = 1; // note").trim(), 'const x = 1;');
  assert.match(lib.stripLineComments("const u = 'https://example.com/a';"), /https:\/\/example\.com\/a/);
});

test('stripLineComments leaves an escaped slash pair inside a pattern alone', () => {
  const src = 'const p = /^https?:\\/\\/.+/i;';
  assert.strictEqual(lib.stripLineComments(src), src);
});

test('matchBalanced walks nested brackets and ignores brackets in strings', () => {
  const text = 'call([a, (b)], "x)y")';
  assert.strictEqual(text[lib.matchBalanced(text, 4)], ')');
  assert.strictEqual(lib.matchBalanced(text, 5), 12);
});

test('matchBalanced returns -1 when the bracket never closes', () => {
  assert.strictEqual(lib.matchBalanced('foo(bar', 3), -1);
  assert.strictEqual(lib.matchBalanced('abc', 1), -1);
});

test('bvaVector covers both sides of a bound plus the type extremes', () => {
  const labels = lib.bvaVector({ kind: 'number', min: 0, max: 10 }).map((p) => p.label);
  assert.deepStrictEqual(labels.slice(0, 6), ['min-1', 'min', 'min+1', 'max-1', 'max', 'max+1']);
  assert.ok(labels.includes('NaN'));
  assert.ok(labels.includes('MAX_SAFE_INTEGER'));
});

test('bvaVector omits the missing side of a half-open bound', () => {
  const points = lib.bvaVector({ kind: 'length', min: 2, max: null });
  assert.ok(points.some((p) => p.label === 'min-1'));
  assert.ok(!points.some((p) => p.label.startsWith('max')));
  assert.ok(points.some((p) => p.label === 'whitespace only'));
});

test('bvaVector marks the far side of each edge as a rejection', () => {
  const points = lib.bvaVector({ kind: 'date' });
  assert.strictEqual(points.find((p) => p.label === 'tomorrow').expect, 'reject');
  assert.strictEqual(points.find((p) => p.label === 'leap day').expect, 'accept');
});

test('partitionsFor derives the enum classes and follows optionality', () => {
  const required = lib.partitionsFor({ enum: ['Action', 'RPG'], optional: false });
  assert.ok(required.some((p) => p.label === 'value outside the enum' && p.expect === 'reject'));
  assert.strictEqual(required.find((p) => p.label === 'field absent').expect, 'reject');
  const optional = lib.partitionsFor({ optional: true });
  assert.strictEqual(optional.find((p) => p.label === 'field absent').expect, 'accept');
});

test('maxSeverity never lowers a severity', () => {
  assert.strictEqual(lib.maxSeverity('low', 'high'), 'high');
  assert.strictEqual(lib.maxSeverity('high', 'low'), 'high');
  assert.strictEqual(lib.severityOf('CM-02'), 'high');
});

/* ------------------------------------------------------------------ *
 * Validator chain extraction
 * ------------------------------------------------------------------ */

test('parseValidatorChain reads length bounds and the message', () => {
  const c = extract.parseValidatorChain(
    "body('name').isLength({ min: 2, max: 40 }).withMessage('too short')"
  );
  assert.strictEqual(c.minLength, 2);
  assert.strictEqual(c.maxLength, 40);
  assert.deepStrictEqual(c.messages, ['too short']);
  assert.strictEqual(c.optional, false);
});

test('parseValidatorChain reads numeric bounds and the declared type', () => {
  const c = extract.parseValidatorChain("query('limit').optional().isInt({ min: 1, max: 1000 })");
  assert.strictEqual(c.min, 1);
  assert.strictEqual(c.max, 1000);
  assert.strictEqual(c.type, 'integer');
  assert.strictEqual(c.optional, true);
});

test('parseValidatorChain captures a custom validator body whole', () => {
  const c = extract.parseValidatorChain(
    "body('imageUrl').custom((v) => { return /^https?:\\/\\/.+/i.test(v); }).withMessage('bad')"
  );
  assert.match(c.custom, /https\?/);
  assert.deepStrictEqual(c.messages, ['bad']);
});

test('parseValidatorChain marks an enum delegated to the model', () => {
  const c = extract.parseValidatorChain("body('genre').isIn(Game.getGenres())");
  assert.strictEqual(c.enumRef, 'Game.getGenres()');
  assert.strictEqual(c.enumFromModel, true);
});

test('parseValidatorChain reads a literal enum, which can drift', () => {
  const c = extract.parseValidatorChain("body('genre').isIn(['Action', 'RPG'])");
  assert.deepStrictEqual(c.enumValues, ['Action', 'RPG']);
  assert.strictEqual(c.enumFromModel, false);
});

test('parseValidatorChain records array bounds and sanitizers', () => {
  const c = extract.parseValidatorChain("body('platforms').trim().isArray({ min: 1 })");
  assert.strictEqual(c.type, 'array');
  assert.strictEqual(c.minItems, 1);
  assert.deepStrictEqual(c.sanitizers, ['trim']);
});

/* ------------------------------------------------------------------ *
 * Handler extraction
 * ------------------------------------------------------------------ */

test('handlerGuardedFields finds a field tested by a 4xx guard', () => {
  const src = 'if (new Date(releaseDate) > new Date()) { return res.status(400).json({ m: 1 }); }';
  assert.ok(extract.handlerGuardedFields(src).includes('releaseDate'));
});

test('handlerGuardedFields ignores destructuring above the guard', () => {
  const src = `
    const { name, genre, imageUrl } = req.body;
    if (!found) { return res.status(404).json({ m: 1 }); }
  `;
  const guarded = extract.handlerGuardedFields(src);
  assert.ok(guarded.includes('found'));
  assert.ok(!guarded.includes('imageUrl'), 'a destructured name is not a guard');
  assert.ok(!guarded.includes('genre'));
});

test('handlerGuardedFields ignores identifiers inside a string literal', () => {
  const src = "if (error.message === 'Game with this name already exists.') { return res.status(400).json({}); }";
  assert.ok(!extract.handlerGuardedFields(src).includes('name'));
});

test('handlerGuardedFields ignores a condition that returns no 4xx', () => {
  assert.deepStrictEqual(extract.handlerGuardedFields('if (debug) { console.log(rating); }'), []);
});

test('handlerUniquenessChecks finds the field a duplicate lookup uses', () => {
  assert.ok(extract.handlerUniquenessChecks('const g = await Game.findOne({ name });').includes('name'));
});

test('handlerResponseKeys reads shorthand keys and skips trailing comments', () => {
  const src = 'res.json({\n genres,\n platforms, // always included\n yearRange\n});';
  assert.deepStrictEqual(extract.handlerResponseKeys(src).sort(), ['genres', 'platforms', 'yearRange']);
});

test('handlerPersistedFields lists the fields a constructor stores', () => {
  const p = extract.handlerPersistedFields('const g = new Game({ name, genre, rating });');
  assert.deepStrictEqual(p.fields.sort(), ['genre', 'name', 'rating']);
  assert.strictEqual(p.wildcard, false);
});

test('handlerPersistedFields flags a wholesale body copy as a wildcard', () => {
  const p = extract.handlerPersistedFields('Object.assign(game, req.body); game.updatedBy = req.user._id;');
  assert.strictEqual(p.wildcard, true);
  assert.ok(p.fields.includes('updatedBy'));
});

test('handlerPersistedFields does not treat a validated field as stored', () => {
  // POST /api/auth/login validates password and stores only lastLogin.
  const p = extract.handlerPersistedFields('user.lastLogin = Date.now(); await user.save();');
  assert.ok(!p.fields.includes('password'));
});

/* ------------------------------------------------------------------ *
 * File-level extraction
 * ------------------------------------------------------------------ */

const ROUTE_FIXTURE = `
const router = require('express').Router();
const Game = require('../models/Game');

/**
 * @swagger
 * components:
 *   schemas:
 *     GameInput:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *         genre:
 *           type: string
 *           enum: [Action, RPG]
 */
router.post('/', [
  authenticateToken,
  requireAdmin,
  body('name').isLength({ min: 2 }).withMessage('too short'),
  body('genre').isIn(Game.getGenres()).withMessage('bad genre')
], async (req, res) => {
  try {
    const { name, genre } = req.body;
    if (!name) { return res.status(400).json({ message: 'no name' }); }
    const game = new Game({ name, genre });
    await game.save();
    res.status(201).json({ game });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
`;

test('parseRouteFile reads the path, the guards and the validator chains', () => {
  const [r] = extract.parseRouteFile('server/routes/games.js', ROUTE_FIXTURE);
  assert.strictEqual(r.method, 'POST');
  assert.strictEqual(r.path, '/');
  assert.deepStrictEqual(r.guards, ['authenticateToken', 'requireAdmin']);
  assert.deepStrictEqual(r.validators.map((v) => v.field), ['name', 'genre']);
  assert.strictEqual(r.validators[0].minLength, 2);
});

test('parseRouteFile separates handler facts from middleware', () => {
  const [r] = extract.parseRouteFile('server/routes/games.js', ROUTE_FIXTURE);
  assert.ok(r.handler.guardedFields.includes('name'));
  assert.strictEqual(r.handler.writesModel, true);
  assert.strictEqual(r.handler.mapsValidationError, false);
  assert.strictEqual(r.handler.has500, true);
  assert.deepStrictEqual(r.handler.persisted.fields.sort(), ['genre', 'name']);
});

test('parseRouteFile does not read a route out of a Swagger block', () => {
  const src = '/**\n * router.post("/fake", handler)\n */\nrouter.get("/real", h);';
  const routes = extract.parseRouteFile('server/routes/x.js', src);
  assert.deepStrictEqual(routes.map((r) => r.path), ['/real']);
});

const MODEL_FIXTURE = `
const mongoose = require('mongoose');
const gameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Game name is required'],
    unique: true,
    trim: true,
    minlength: [2, 'too short']
  },
  genre: {
    type: String,
    required: true,
    enum: ['Action', 'RPG', 'Puzzle']
  },
  rating: {
    type: Number,
    min: [0, 'low'],
    max: [10, 'high'],
    default: null
  },
  email: {
    type: String,
    match: [/^\\w+@\\w+\\.\\w{2,3}$/, 'bad email']
  },
  releaseDate: {
    type: Date,
    validate: {
      validator: function(date) { return date <= new Date(); },
      message: 'Release date cannot be in the future'
    }
  }
}, { timestamps: true });

gameSchema.statics.getPlatforms = function() {
  return ['NES', 'SNES'];
};

module.exports = mongoose.model('Game', gameSchema);
`;

test('parseModelFile reads each schema rule with the line it sits on', () => {
  const model = extract.parseModelFile('server/models/Game.js', MODEL_FIXTURE);
  assert.strictEqual(model.name, 'Game');
  assert.strictEqual(model.fields.name.minlength, 2);
  assert.strictEqual(model.fields.name.trim, true);
  assert.strictEqual(model.fields.name.unique, true);
  assert.ok(model.fields.name.line > 1);
  assert.deepStrictEqual(model.fields.genre.enum, ['Action', 'RPG', 'Puzzle']);
  assert.strictEqual(model.fields.rating.min, 0);
  assert.strictEqual(model.fields.rating.max, 10);
});

test('parseModelFile keeps the regex and the validator body as evidence', () => {
  const model = extract.parseModelFile('server/models/Game.js', MODEL_FIXTURE);
  assert.match(model.fields.email.match, /\\w\{2,3\}/);
  assert.match(model.fields.releaseDate.validate, /date <= new Date/);
  assert.strictEqual(model.fields.releaseDate.validateMessage, 'Release date cannot be in the future');
});

test('parseModelFile reads the enum a static exposes', () => {
  const model = extract.parseModelFile('server/models/Game.js', MODEL_FIXTURE);
  assert.deepStrictEqual(model.statics.getPlatforms, ['NES', 'SNES']);
});

test('parseFormFile reads both JSX attributes and validateForm branches', () => {
  const src = `
    const validateForm = () => {
      if (!formData.name) { newErrors.name = 'Game name is required'; }
    };
    return (
      <input name="name" type="text" required />
      <input name="rating" type="number" min="0" max="10" />
      <input name="releaseDate" type="date" max={new Date().toISOString()} />
    );
  `;
  const form = extract.parseFormFile('client/src/components/GameForm.js', src);
  assert.strictEqual(form.fields.name.required, true);
  assert.deepStrictEqual(form.fields.name.clientMessages, ['Game name is required']);
  assert.strictEqual(form.fields.rating.min, 0);
  assert.strictEqual(form.fields.rating.max, 10);
  assert.match(form.fields.releaseDate.maxExpr, /toISOString/);
});

test('parseDocBlock understands nesting and inline sequences', () => {
  const block = [
    '/**',
    ' * @swagger',
    ' * components:',
    ' *   schemas:',
    ' *     GameInput:',
    ' *       properties:',
    ' *         name:',
    ' *           type: string',
    ' *           minLength: 2',
    ' *         genre:',
    ' *           enum: [Action, RPG]',
    ' */',
  ].join('\n');
  const doc = extract.parseDocBlock(block);
  const props = doc.components.schemas.GameInput.properties;
  assert.strictEqual(props.name.minLength, 2);
  assert.deepStrictEqual(props.genre.enum, ['Action', 'RPG']);
});

test('splitTopLevel ignores commas nested in brackets and quotes', () => {
  assert.deepStrictEqual(
    extract.splitTopLevel('a: 1, b: [2, 3], c: "x,y"').map((s) => s.trim()),
    ['a: 1', 'b: [2, 3]', 'c: "x,y"']
  );
});

/* ------------------------------------------------------------------ *
 * Pack A — contract
 * ------------------------------------------------------------------ */

test('CM-01 fires when the route leaves a schema bound unchecked', () => {
  const map = oneField('description', {
    model: { file: 'm.js', line: 1, type: 'String', maxlength: 500 },
    route: [routeEntry({ minLength: 2 })],
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-01');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].confidence, 'confirmed');
  assert.match(found[0].consequence, /maximum length/);
});

test('CM-01 stays silent when both layers agree', () => {
  const map = oneField('rating', {
    model: { file: 'm.js', line: 1, type: 'Number', min: 0, max: 10 },
    route: [routeEntry({ min: 0, max: 10, optional: true })],
  });
  assert.deepStrictEqual(rules(scan.packContract(map)), []);
});

test('CM-01 fires when the schema has an enum and the route does not', () => {
  const map = oneField('genre', {
    model: { file: 'm.js', line: 1, type: 'String', enum: ['Action', 'RPG'] },
    route: [routeEntry()],
  });
  assert.ok(rules(scan.packContract(map)).includes('CM-01'));
});

test('CM-02 fires when a schema rule has no counterpart on the route', () => {
  const map = oneField('imageUrl', {
    model: { file: 'm.js', line: 9, type: 'String', validate: 'url) { return /\\.(jpg|png)$/.test(url); }', validateMessage: 'bad url' },
    route: [routeEntry({ optional: true })],
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-02');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].confidence, 'confirmed');
});

test('CM-02 is confirmed when the route pattern is a prefix of the schema pattern', () => {
  const map = oneField('imageUrl', {
    model: { file: 'm.js', line: 9, type: 'String', validate: 'const p = /^https?:\\/\\/.+\\.(jpg|png)$/i;' },
    route: [routeEntry({ optional: true, custom: 'const p = /^https?:\\/\\/.+/i;' })],
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-02');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].confidence, 'confirmed');
  assert.match(found[0].consequence, /prefix/);
});

test('CM-02 is only suspected when the two grammars merely differ', () => {
  const map = oneField('email', {
    model: { file: 'm.js', line: 5, type: 'String', match: '/^\\w+@\\w+\\.\\w{2,3}$/' },
    route: [routeEntry({ format: 'email' })],
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-02');
  assert.strictEqual(found[0].confidence, 'suspected');
  assert.match(found[0].consequence, /2-3 characters/);
});

test('CM-02 stays silent when the handler already guards the field', () => {
  const map = oneField('releaseDate', {
    model: { file: 'm.js', line: 7, type: 'Date', validate: 'date) { return date <= new Date(); }' },
    route: [routeEntry({ format: 'date', guardedInHandler: true })],
  });
  assert.ok(!rules(scan.packContract(map)).includes('CM-02'));
});

test('CM-02 accepts isArray({min}) as the answer to an array-length rule', () => {
  const map = oneField('platforms', {
    model: { file: 'm.js', line: 3, type: '[String]', validate: 'p) { return p && p.length > 0; }' },
    route: [routeEntry({ type: 'array', minItems: 1 })],
  });
  assert.ok(!rules(scan.packContract(map)).includes('CM-02'));
});

test('contract rules skip a route that validates a field without storing it', () => {
  const map = oneField('password', {
    model: { file: 'm.js', line: 2, type: 'String', minlength: 6 },
    route: [routeEntry({ endpoint: 'POST /api/auth/login', notEmpty: true, persisted: false })],
  });
  assert.deepStrictEqual(rules(scan.packContract(map)), []);
});

test('CM-03 fires when the route measures length before the schema trims', () => {
  const map = oneField('name', {
    model: { file: 'm.js', line: 4, type: 'String', minlength: 2, trim: true },
    route: [routeEntry({ minLength: 2 })],
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-03');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].repro, /padded with spaces/);
});

test('CM-03 stays silent when the chain trims first', () => {
  const map = oneField('name', {
    model: { file: 'm.js', line: 4, type: 'String', minlength: 2, trim: true },
    route: [routeEntry({ minLength: 2, sanitizers: ['trim'] })],
  });
  assert.ok(!rules(scan.packContract(map)).includes('CM-03'));
});

test('CM-04 fires when the form and the API disagree on a bound', () => {
  const map = oneField('description', {
    model: { file: 'm.js', line: 1, type: 'String', maxlength: 500 },
    route: [routeEntry({ maxLength: 500 })],
    client: { file: 'GameForm.js', line: 30, maxLength: 200 },
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-04');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].consequence, /200 vs 500/);
});

test('CM-05 fires when the documentation claims a bound nothing enforces', () => {
  const map = oneField('name', {
    model: { file: 'm.js', line: 1, type: 'String' },
    route: [routeEntry({ minLength: 2 })],
    doc: { file: 'games.js', line: 20, schema: 'GameInput', minLength: 2, maxLength: 80 },
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-05');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].consequence, /maximum length of 80/);
});

test('CM-06 fires when create and update validate the same field differently', () => {
  const map = oneField('name', {
    model: { file: 'm.js', line: 1, type: 'String' },
    route: [
      routeEntry({ endpoint: 'POST /api/games', minLength: 2 }),
      routeEntry({ endpoint: 'PUT /api/games/:id', minLength: null, optional: true }),
    ],
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-06');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].consequence, /minLength/);
});

test('CM-06 ignores optionality, which a partial update is entitled to', () => {
  const map = oneField('name', {
    model: { file: 'm.js', line: 1, type: 'String' },
    route: [
      routeEntry({ endpoint: 'POST /api/games', minLength: 2 }),
      routeEntry({ endpoint: 'PUT /api/games/:id', minLength: 2, optional: true }),
    ],
  });
  assert.ok(!rules(scan.packContract(map)).includes('CM-06'));
});

test('CM-07 fires on a write path whose catch ignores ValidationError', () => {
  const map = mapOf({ routes: [route({ handler: handler({ writesModel: true }) })] });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-07');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].consequence, /ValidationError/);
});

test('CM-07 fires on an :id lookup whose catch ignores CastError', () => {
  const map = mapOf({
    routes: [route({ method: 'GET', endpoint: 'GET /api/games/:id', handler: handler({ readsById: true }) })],
  });
  const found = scan.packContract(map).filter((f) => f.rule === 'CM-07');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].repro, /not-an-object-id/);
});

test('CM-07 stays silent once both errors are mapped', () => {
  const map = mapOf({
    routes: [route({ handler: handler({ writesModel: true, readsById: true, mapsValidationError: true, mapsCastError: true }) })],
  });
  assert.deepStrictEqual(rules(scan.packContract(map)), []);
});

/* ------------------------------------------------------------------ *
 * Pack B — boundary
 * ------------------------------------------------------------------ */

test('BV-01 fires on a string bounded below and not above', () => {
  const map = oneField('name', {
    model: { file: 'm.js', line: 4, type: 'String', minlength: 2 },
    route: [routeEntry({ minLength: 2 })],
  });
  const found = scan.packBoundary(map).findings.filter((f) => f.rule === 'BV-01');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].confidence, 'confirmed');
});

test('BV-01 stays silent when both ends are bounded', () => {
  const map = oneField('description', {
    model: { file: 'm.js', line: 4, type: 'String', minlength: 2, maxlength: 500 },
    route: [routeEntry({ minLength: 2, maxLength: 500 })],
  });
  assert.ok(!rules(scan.packBoundary(map).findings).includes('BV-01'));
});

test('the boundary matrix marks a point asserted by a test as covered', () => {
  const map = oneField('rating', {
    model: { file: 'm.js', line: 1, type: 'Number', min: 0, max: 10 },
    route: [routeEntry({ min: 0, max: 10 })],
    tests: [{ file: 'Game.test.js', line: 5, title: 'rejects 11', text: 'expect(rating).toBe(11)' }],
  });
  const row = scan.packBoundary(map).matrix.find((m) => m.subject === 'Game.rating');
  assert.strictEqual(row.points.find((p) => p.label === 'max+1').covered, true);
  assert.strictEqual(row.points.find((p) => p.label === 'min-1').covered, false);
});

test('BV-03 fires when a computed client cap meets an inclusive schema rule', () => {
  const map = oneField('releaseDate', {
    model: { file: 'm.js', line: 7, type: 'Date', validate: 'date) { return date <= new Date(); }' },
    route: [routeEntry({ format: 'date' })],
    client: { file: 'GameForm.js', line: 20, maxExpr: "new Date().toISOString().split('T')[0]" },
  });
  const found = scan.packBoundary(map).findings.filter((f) => f.rule === 'BV-03');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].consequence, /timezone/);
});

test('BV-04 fires on a page size larger than a UI renders', () => {
  const map = mapOf({
    routes: [route({ method: 'GET', endpoint: 'GET /api/games', validators: [routeEntry({ field: 'limit', in: 'query', min: 1, max: 1000 })] })],
  });
  const found = scan.packBoundary(map).findings.filter((f) => f.rule === 'BV-04');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].severity, 'medium');
});

test('BV-04 treats a page size with no cap at all as high severity', () => {
  const map = mapOf({
    routes: [route({ method: 'GET', endpoint: 'GET /api/games', validators: [routeEntry({ field: 'limit', in: 'query', min: 1 })] })],
  });
  const found = scan.packBoundary(map).findings.filter((f) => f.rule === 'BV-04');
  assert.strictEqual(found[0].severity, 'high');
});

test('BV-04 fires on a range pair that is never compared', () => {
  const map = mapOf({
    routes: [route({
      method: 'GET',
      endpoint: 'GET /api/games',
      validators: [
        routeEntry({ field: 'yearFrom', in: 'query' }),
        routeEntry({ field: 'yearTo', in: 'query' }),
      ],
      handler: handler({ conditions: ['if (yearFrom || yearTo)'] }),
    })],
  });
  const found = scan.packBoundary(map).findings.filter((f) => f.rule === 'BV-04');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].consequence, /inverted range/);
});

test('BV-04 accepts a real comparison between the two ends', () => {
  const map = mapOf({
    routes: [route({
      method: 'GET',
      endpoint: 'GET /api/games',
      validators: [
        routeEntry({ field: 'yearFrom', in: 'query' }),
        routeEntry({ field: 'yearTo', in: 'query' }),
      ],
      handler: handler({ conditions: ['if (yearFrom > yearTo)'] }),
    })],
  });
  assert.ok(!rules(scan.packBoundary(map).findings).includes('BV-04'));
});

/* ------------------------------------------------------------------ *
 * Pack C — partitions
 * ------------------------------------------------------------------ */

test('EP-02 fires when the route makes a required field optional', () => {
  const map = oneField('hasMultiplayer', {
    model: { file: 'm.js', line: 1, type: 'Boolean', required: true },
    route: [routeEntry({ endpoint: 'POST /api/games', optional: true })],
  });
  const found = scan.packPartition(map).findings.filter((f) => f.rule === 'EP-02');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].confidence, 'confirmed');
});

test('EP-02 ignores an update route, which omits everything by design', () => {
  const map = oneField('hasMultiplayer', {
    model: { file: 'm.js', line: 1, type: 'Boolean', required: true },
    route: [
      routeEntry({ endpoint: 'POST /api/games', optional: false }),
      routeEntry({ endpoint: 'PUT /api/games/:id', optional: true }),
    ],
  });
  assert.ok(!rules(scan.packPartition(map).findings).includes('EP-02'));
});

test('EP-03 reports every access state when no test names the endpoint', () => {
  const map = mapOf({ routes: [route({ endpoint: 'POST /api/admin/users', guards: ['authenticateToken', 'requireOwner'] })] });
  const result = scan.packPartition(map);
  const found = result.findings.filter((f) => f.rule === 'EP-03');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].severity, 'high');
  assert.strictEqual(found[0].confidence, 'confirmed');
  assert.deepStrictEqual(result.roleMatrix[0].applicable, lib.ROLE_PARTITIONS);
});

test('EP-03 asks a public endpoint only about the anonymous case', () => {
  const map = mapOf({ routes: [route({ method: 'GET', endpoint: 'GET /api/games', guards: [] })] });
  const { roleMatrix } = scan.packPartition(map);
  assert.deepStrictEqual(roleMatrix[0].applicable, ['no token']);
});

test('EP-04 fires when the options endpoint advertises a filter nothing accepts', () => {
  const map = mapOf({
    routes: [
      route({
        method: 'GET',
        endpoint: 'GET /api/games',
        guards: [],
        validators: [routeEntry({ field: 'genre', in: 'query' })],
      }),
      route({
        method: 'GET',
        endpoint: 'GET /api/games/filters/options',
        guards: [],
        handler: handler({ responseKeys: ['genres', 'platforms', 'message'] }),
      }),
    ],
  });
  const found = scan.packPartition(map).findings.filter((f) => f.rule === 'EP-04');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].subject, 'platforms filter');
});

test('EP-04 fires on a documented parameter the handler never reads', () => {
  const map = mapOf({
    routes: [route({ method: 'GET', endpoint: 'GET /api/games', guards: [] })],
    docs: {
      schemas: {},
      parameters: [{ file: 'games.js', line: 12, path: '/games', method: 'GET', in: 'query', name: 'sort', required: false, schema: {} }],
    },
  });
  const found = scan.packPartition(map).findings.filter((f) => f.rule === 'EP-04');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].consequence, /sending it does nothing/);
});

/* ------------------------------------------------------------------ *
 * Pack D — security
 * ------------------------------------------------------------------ */

const noIo = { read: () => '', tracked: [] };

test('SEC-01 fires on an unguarded mutating route', () => {
  const map = mapOf({ routes: [route({ endpoint: 'POST /api/games', guards: [] })] });
  const { findings } = scan.packSecurity(map, noIo);
  assert.ok(rules(findings).includes('SEC-01'));
});

test('SEC-01 exempts login and register, and says so', () => {
  const map = mapOf({ routes: [route({ endpoint: 'POST /api/auth/login', guards: [] })] });
  const result = scan.packSecurity(map, noIo);
  assert.ok(!rules(result.findings).includes('SEC-01'));
  assert.deepStrictEqual(result.exempt, ['POST /api/auth/login']);
});

test('SEC-02 fires when the handler copies req.body into the document', () => {
  const map = mapOf({ routes: [route({ handler: handler({ massAssignment: true }) })] });
  assert.ok(rules(scan.packSecurity(map, noIo).findings).includes('SEC-02'));
});

test('SEC-03 fires when a query value reaches a regex', () => {
  const map = mapOf({ routes: [route({ method: 'GET', endpoint: 'GET /api/games', guards: [], handler: handler({ regexFromInput: true }) })] });
  const found = scan.packSecurity(map, noIo).findings.filter((f) => f.rule === 'SEC-03');
  assert.strictEqual(found.length, 1);
  assert.match(found[0].consequence, /ReDoS/);
});

test('SEC-07 fires on an id route that is authenticated but not authorised', () => {
  const map = mapOf({ routes: [route({ method: 'DELETE', endpoint: 'DELETE /api/games/:id', guards: ['authenticateToken'] })] });
  assert.ok(rules(scan.packSecurity(map, noIo).findings).includes('SEC-07'));
});

test('SEC-07 stays silent when the handler compares the record to req.user', () => {
  const map = mapOf({
    routes: [route({ method: 'DELETE', endpoint: 'DELETE /api/games/:id', guards: ['authenticateToken'], handler: handler({ conditions: ['if (game.createdBy !== req.user._id)'] }) })],
  });
  assert.ok(!rules(scan.packSecurity(map, noIo).findings).includes('SEC-07'));
});

test('SEC-04 recognises the limiter gate written either way round', () => {
  for (const gate of ["if (process.env.NODE_ENV !== 'test') { app.use(limiter); }",
    "const limiter = rateLimit({ skip: () => process.env.NODE_ENV === 'test' });"]) {
    const { findings } = scan.packSecurity(mapOf(), { read: () => gate, tracked: [] });
    assert.ok(rules(findings).includes('SEC-04'), gate);
  }
});

test('SEC-05 fires on a tracked env file that holds a secret', () => {
  const io = { read: () => 'JWT_SECRET=hunter2\nPORT=5000', tracked: ['e2e/.env', 'README.md'] };
  const found = scan.packSecurity(mapOf(), io).findings.filter((f) => f.rule === 'SEC-05');
  assert.ok(found.some((f) => f.subject === 'e2e/.env'));
});

test('SEC-05 ignores a tracked env file with no secret-shaped value', () => {
  const io = { read: () => 'PORT=5000\nHOST=localhost', tracked: ['docker/.env'] };
  assert.ok(!rules(scan.packSecurity(mapOf(), io).findings).includes('SEC-05'));
});

test('SEC-05 fires on a hard-coded fallback for a signing secret', () => {
  const map = mapOf({ meta: { routeFiles: ['server/routes/auth.js'] } });
  const io = { read: () => "const s = process.env.JWT_SECRET || 'dev-secret';", tracked: [] };
  const found = scan.packSecurity(map, io).findings.filter((f) => f.rule === 'SEC-05');
  assert.ok(found.some((f) => f.subject === 'JWT_SECRET'));
});

/* ------------------------------------------------------------------ *
 * Helpers and scoping
 * ------------------------------------------------------------------ */

test('regexCore ignores prose between two line comments', () => {
  const src = "if (!v) return true; // Allow empty\n const p = /^https?:\\/\\/.+/i;";
  assert.strictEqual(scan.regexCore(src), '^https?:\\/\\/.+');
});

test('regexCore returns null when there is no pattern at all', () => {
  assert.strictEqual(scan.regexCore('// just a comment about http://example.com'), null);
});

test('modelIsStricter recognises a prefix relationship and nothing else', () => {
  assert.strictEqual(scan.modelIsStricter('^https?://.+\\.(jpg)$', '^https?://.+'), true);
  assert.strictEqual(scan.modelIsStricter('^abc$', '^abc$'), false);
  assert.strictEqual(scan.modelIsStricter('^xyz', '^abc'), false);
});

test('effectiveBounds merges the route and schema view of one field', () => {
  const bounds = scan.effectiveBounds(field({
    model: { type: 'String', minlength: 2 },
    route: [routeEntry({ maxLength: 40 })],
  }));
  assert.deepStrictEqual(bounds, { kind: 'length', min: 2, max: 40 });
});

test('parseArgs defaults to every pack and rejects an unknown one', () => {
  assert.deepStrictEqual(parseArgsPacks([]), ['contract', 'boundary', 'partition', 'security']);
  assert.deepStrictEqual(parseArgsPacks(['--pack', 'security']), ['security']);
  assert.throws(() => scan.parseArgs(['--pack', 'bogus']), /Unknown pack/);
  assert.throws(() => scan.parseArgs(['--severity', 'critical']), /Unknown severity/);
  assert.throws(() => scan.parseArgs(['--nope']), /Unknown flag/);
});

function parseArgsPacks(argv) {
  return scan.parseArgs(argv).packs;
}

test('inScope filters by severity floor', () => {
  const scope = { severity: 'medium', files: null, resources: null };
  assert.strictEqual(scan.inScope({ severity: 'high', layers: [] }, scope), true);
  assert.strictEqual(scan.inScope({ severity: 'low', layers: [] }, scope), false);
});

test('inScope keeps an endpoint finding whose file belongs to the resource', () => {
  const scope = {
    severity: 'low',
    files: null,
    resources: ['Game'],
    resourceFiles: new Set(['server/routes/games.js']),
  };
  const endpointFinding = { severity: 'high', resource: null, layers: [{ file: 'server/routes/games.js' }] };
  const otherFinding = { severity: 'high', resource: 'User', layers: [{ file: 'server/routes/auth.js' }] };
  assert.strictEqual(scan.inScope(endpointFinding, scope), true);
  assert.strictEqual(scan.inScope(otherFinding, scope), false);
});

test('resourceFiles collects the model and every route that requires it', () => {
  const map = mapOf({
    resources: { Game: { model: 'server/models/Game.js', statics: {}, fields: {} } },
    routes: [route(), route({ file: 'server/routes/auth.js', resources: ['User'] })],
  });
  const files = scan.resourceFiles(map, ['Game']);
  assert.deepStrictEqual([...files].sort(), ['server/models/Game.js', 'server/routes/games.js']);
  assert.throws(() => scan.resourceFiles(map, ['Nope']), /Unknown resource/);
});

test('the report renders every section and names each finding once', () => {
  const map = mapOf({
    resources: { Game: { model: 'server/models/Game.js', statics: {}, fields: { name: field({ model: { file: 'm.js', line: 1, type: 'String', minlength: 2 }, route: [routeEntry({ minLength: 2 })] }) } } },
    routes: [route()],
    meta: { routeFiles: ['server/routes/games.js'], modelFiles: ['server/models/Game.js'], formFiles: [], testFiles: [], branch: 'test', sha: 'abc1234' },
  });
  const findings = scan.packContract(map);
  const md = scan.renderReport({
    findings,
    matrix: scan.packBoundary(map).matrix,
    roleMatrix: scan.packPartition(map).roleMatrix,
    exempt: [],
    map,
    opts: scan.parseArgs([]),
  });
  for (const heading of ['## 0. Scope', '## 1. Counts', '## 2. Findings', '## 3. Contract table',
    '## 4. Boundary matrix', '## 5. Role matrix', '## 6. Ready-to-run cases',
    '## 7. Coverage gaps', '## 8. Deferred']) {
    assert.ok(md.includes(heading), `missing ${heading}`);
  }
  assert.match(md, /owasp-security-check/);
  assert.match(md, /server\/routes\/games\.js/);
});

test('the extractor recognises every idiom for a handled Mongoose error', () => {
  // GET /api/games/:id maps a malformed id without ever naming CastError.
  const byKind = extract.parseRouteFile('r.js', `
    router.get('/:id', async (req, res) => {
      try { const g = await Game.findById(req.params.id); res.json({ g }); }
      catch (error) {
        if (error.kind === 'ObjectId') { return res.status(404).json({ message: 'Game not found' }); }
        res.status(500).json({ message: 'Server error' });
      }
    });
  `)[0];
  assert.strictEqual(byKind.handler.mapsCastError, true);
  assert.strictEqual(byKind.handler.readsById, true);

  const byName = extract.parseRouteFile('r.js', `
    router.put('/:id', async (req, res) => {
      try { await Game.findByIdAndUpdate(req.params.id, {}); }
      catch (error) {
        if (error.name === 'ValidationError') { return res.status(400).json({ message: 'bad' }); }
        res.status(500).json({ message: 'Server error' });
      }
    });
  `)[0];
  assert.strictEqual(byName.handler.mapsValidationError, true);
  assert.strictEqual(byName.handler.mapsCastError, false);
});
