'use strict';

/**
 * Extract the validation contract of every field, from every layer that
 * enforces or documents one, into .static-scan/contract-map.json.
 *
 * The four layers are hand-maintained and independent, so the only way to know
 * whether they agree is to read all four and put them side by side:
 *
 *   route   express-validator chains in server/routes/*.js
 *   handler explicit `if (...) return res.status(4xx)` guards inside the same route
 *   model   Mongoose schema rules in server/models/*.js
 *   client  form attributes and validateForm() branches in client/src/**\/*Form.js
 *   doc     Swagger JSDoc schemas and parameters in server/routes/*.js
 *
 * Extraction is regex + brace matching rather than an AST walk: the repo has no
 * parser dependency, and build-map.js in the neighbouring skill already sets
 * that precedent. Every extractor records the file and line it read, so a wrong
 * reading is checkable rather than mysterious.
 */

const {
  read,
  walk,
  rel,
  git,
  lineOf,
  maskComments,
  stripLineComments,
  docBlocks,
  matchBalanced,
  readArtifact,
  writeScanArtifact,
} = require('./lib');

const ROUTE_DIR = 'server/routes';
const MODEL_DIR = 'server/models';
const CLIENT_DIRS = ['client/src/components', 'client/src/pages'];
const TEST_GLOB = /\.(test|spec)\.jsx?$/;

/* ------------------------------------------------------------------ *
 * Small YAML subset, for the Swagger blocks
 * ------------------------------------------------------------------ */

/**
 * Parse the indentation-structured subset of YAML that Swagger JSDoc blocks
 * use: `key:`, `key: value`, and `- ` list items. Anything fancier (anchors,
 * flow mappings, multi-line scalars) is not present in this repo and is
 * deliberately not supported — a silent partial parse is better than a crash,
 * so unparseable lines are skipped.
 *
 * @param {string} block raw JSDoc block including the comment markers
 * @returns {object} nested plain object
 */
function parseDocBlock(block) {
  const lines = block
    .split('\n')
    .map((l) => l.replace(/^\s*\/?\*+\/?/, ''))
    .filter((l) => l.trim() !== '' && !/^\s*@swagger\s*$/.test(l));

  const root = {};
  // Stack of {indent, container}. A container is an object or an array.
  const stack = [{ indent: -1, container: root }];

  for (const raw of lines) {
    const indent = raw.length - raw.replace(/^ +/, '').length;
    const text = raw.trim();
    if (!text) continue;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].container;

    if (text.startsWith('- ')) {
      const item = text.slice(2).trim();
      if (!Array.isArray(parent.__list)) parent.__list = [];
      const inline = item.match(/^([\w$-]+):\s*(.*)$/);
      if (inline) {
        const obj = {};
        if (inline[2]) obj[inline[1]] = stripScalar(inline[2]);
        else obj[inline[1]] = {};
        parent.__list.push(obj);
        stack.push({ indent, container: inline[2] ? obj : obj[inline[1]] });
      } else {
        parent.__list.push(stripScalar(item));
      }
      continue;
    }

    const m = text.match(/^([\w$/{}.-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2];

    if (value === '' || value === '{}') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, container: child });
    } else if (/^\[.*\]$/.test(value)) {
      // Inline flow sequence: `enum: [Action, Adventure, ...]`.
      parent[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => stripScalar(s))
        .filter((s) => s !== '');
    } else {
      parent[key] = stripScalar(value);
    }
  }
  return root;
}

/** Strip quotes and coerce the scalars Swagger blocks actually contain. */
function stripScalar(v) {
  const t = v.trim().replace(/^['"]|['"]$/g, '');
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  return t;
}

/** Lists parsed by parseDocBlock live under __list; normalise that away. */
function listOf(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node;
  if (Array.isArray(node.__list)) return node.__list;
  return [];
}

/* ------------------------------------------------------------------ *
 * Layer 1 + 2: routes (express-validator chains and handler guards)
 * ------------------------------------------------------------------ */

const VERBS = ['get', 'post', 'put', 'patch', 'delete'];
const GUARDS = ['authenticateToken', 'requireAdmin', 'requireOwner', 'optionalAuth'];

/**
 * Pull `{min, max}` out of a validator option object such as `{ min: 1, max: 1000 }`.
 * @param {string} text
 * @returns {{min: number|null, max: number|null}}
 */
function optionBounds(text) {
  const min = text.match(/\bmin\s*:\s*(-?\d+(?:\.\d+)?)/);
  const max = text.match(/\bmax\s*:\s*(-?\d+(?:\.\d+)?)/);
  return {
    min: min ? parseFloat(min[1]) : null,
    max: max ? parseFloat(max[1]) : null,
  };
}

/**
 * Read one express-validator chain into a constraint record.
 * @param {string} chain source text of the chain, from `body('x')` to its end
 * @returns {object}
 */
function parseValidatorChain(chain) {
  const c = {
    optional: /\.optional\s*\(/.test(chain),
    notEmpty: /\.notEmpty\s*\(/.test(chain),
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
  };

  const len = chain.match(/\.isLength\s*\(\s*\{([^}]*)\}/);
  if (len) {
    const b = optionBounds(len[1]);
    c.minLength = b.min;
    c.maxLength = b.max;
  }

  const num = chain.match(/\.(isInt|isFloat)\s*\(\s*\{([^}]*)\}/);
  if (num) {
    const b = optionBounds(num[2]);
    c.min = b.min;
    c.max = b.max;
    c.type = num[1] === 'isInt' ? 'integer' : 'number';
  } else if (/\.isInt\s*\(/.test(chain)) c.type = 'integer';
  else if (/\.isFloat\s*\(/.test(chain)) c.type = 'number';

  const arr = chain.match(/\.isArray\s*\(\s*\{([^}]*)\}/);
  if (arr) {
    c.type = 'array';
    c.minItems = optionBounds(arr[1]).min;
  } else if (/\.isArray\s*\(/.test(chain)) c.type = 'array';

  if (/\.isBoolean\s*\(/.test(chain)) c.type = 'boolean';
  if (/\.isString\s*\(/.test(chain)) c.type = 'string';
  if (/\.isISO8601\s*\(/.test(chain)) c.format = 'date';
  if (/\.isEmail\s*\(/.test(chain)) c.format = 'email';
  if (/\.isURL\s*\(/.test(chain)) c.format = 'url';

  const isInIdx = chain.indexOf('.isIn(');
  if (isInIdx !== -1) {
    const open = chain.indexOf('(', isInIdx);
    const close = matchBalanced(chain, open);
    c.enumRef = (close === -1 ? chain.slice(open + 1) : chain.slice(open + 1, close)).trim();
    // `.isIn(Game.getGenres())` delegates to the model's own list, so the two
    // layers cannot drift. A literal array can.
    c.enumFromModel = /^[A-Z]\w*\.\w+\(\s*\)$/.test(c.enumRef);
    if (/^\[/.test(c.enumRef)) c.enumValues = stringArray(c.enumRef);
  }

  const customIdx = chain.indexOf('.custom(');
  if (customIdx !== -1) {
    const open = chain.indexOf('(', customIdx);
    const close = matchBalanced(chain, open);
    c.custom = close === -1 ? chain.slice(open) : chain.slice(open + 1, close);
  }

  for (const s of ['trim', 'normalizeEmail', 'escape', 'toInt', 'toFloat']) {
    if (new RegExp(`\\.${s}\\s*\\(`).test(chain)) c.sanitizers.push(s);
  }

  const msg = /\.withMessage\s*\(\s*['"]([^'"]*)['"]\s*\)/g;
  let m;
  while ((m = msg.exec(chain)) !== null) c.messages.push(m[1]);

  return c;
}

/**
 * Field names tested by an `if` whose body returns a 4xx. These are guards the
 * validator chain does not show — `POST /api/games` rejects future release
 * dates in the handler, not in the chain — and missing them turns a correct
 * implementation into a false finding.
 *
 * Only identifiers from the **condition** count. An earlier version widened to
 * a fixed lookbehind window and swept up the `const { name, genre, imageUrl }
 * = req.body` destructuring that sits above the first guard, marking every
 * field in the request as guarded and suppressing every real finding.
 *
 * @param {string} handler handler source
 * @returns {string[]} identifiers tested by a condition that returns 4xx
 */
function handlerGuardedFields(handler) {
  const out = new Set();
  const re = /\bif\s*\(/g;
  let m;
  while ((m = re.exec(handler)) !== null) {
    const open = handler.indexOf('(', m.index);
    const close = matchBalanced(handler, open);
    if (close === -1) continue;

    const brace = handler.indexOf('{', close);
    let body;
    if (brace !== -1 && handler.slice(close + 1, brace).trim() === '') {
      const end = matchBalanced(handler, brace);
      body = end === -1 ? handler.slice(brace, brace + 300) : handler.slice(brace, end);
    } else {
      body = handler.slice(close + 1, close + 200);
    }
    if (!/res\s*\.\s*status\s*\(\s*4\d\d\s*\)/.test(body)) continue;

    // String literals are blanked first: the catch block's
    // `if (error.message === 'Game with this name already exists.')` otherwise
    // contributes `name` and marks the field guarded.
    const cond = handler.slice(open + 1, close).replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
    for (const id of cond.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []) out.add(id);
  }
  return [...out];
}

/**
 * Fields the handler looks up before writing, e.g. `Game.findOne({ name })`.
 * A model-level `unique: true` backed by one of these is enforced, not missing.
 * @param {string} handler
 * @returns {string[]}
 */
function handlerUniquenessChecks(handler) {
  const out = new Set();
  const re = /\.(?:findOne|exists|countDocuments)\s*\(\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(handler)) !== null) {
    for (const id of m[1].match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []) out.add(id);
  }
  return [...out];
}

/**
 * Top-level keys of every object the handler responds with. The filter-options
 * endpoint advertises the catalogue's filterable dimensions this way, so these
 * keys are what "advertised" means in EP-04.
 * @param {string} handler
 * @returns {string[]}
 */
function handlerResponseKeys(handler) {
  const out = new Set();
  const re = /res\s*(?:\.\s*status\s*\(\s*\d+\s*\))?\s*\.\s*json\s*\(\s*\{/g;
  let m;
  while ((m = re.exec(handler)) !== null) {
    const brace = handler.indexOf('{', m.index);
    const end = matchBalanced(handler, brace);
    if (end === -1) continue;
    // Both `genres: x` and the shorthand `genres` appear; trailing line
    // comments survive maskComments when they follow code, so strip them.
    for (const chunk of splitTopLevel(handler.slice(brace + 1, end))) {
      const key = chunk.replace(/\/\/[^\n]*/g, '').trim().match(/^['"]?([\w$]+)['"]?\s*(?::|$)/);
      if (key) out.add(key[1]);
    }
  }
  return [...out];
}

/**
 * Fields this handler actually writes to the database, and whether it writes
 * the request body wholesale.
 *
 * This is what separates "the route validates a field" from "the route stores
 * a field". `POST /api/auth/login` validates `password` and stores only
 * `lastLogin`; comparing its password validator against the schema's password
 * rule reports a mismatch that can never fire, because the value never reaches
 * the schema as plain text.
 *
 * @param {string} handler
 * @returns {{fields: string[], wildcard: boolean}}
 */
function handlerPersistedFields(handler) {
  const out = new Set();

  const re = /new\s+[A-Z]\w*\s*\(\s*\{/g;
  let m;
  while ((m = re.exec(handler)) !== null) {
    const brace = handler.indexOf('{', m.index);
    const end = matchBalanced(handler, brace);
    if (end === -1) continue;
    for (const chunk of splitTopLevel(handler.slice(brace + 1, end))) {
      const key = chunk.replace(/\/\/[^\n]*/g, '').trim().match(/^['"]?([\w$]+)['"]?\s*(?::|$)/);
      if (key) out.add(key[1]);
    }
  }

  const assign = /\b\w+\.(\w+)\s*=(?!=)/g;
  let a;
  while ((a = assign.exec(handler)) !== null) out.add(a[1]);

  return {
    fields: [...out],
    wildcard: /Object\.assign\s*\([^,]+,\s*req\.body|\.\.\.\s*req\.body/.test(handler),
  };
}

/**
 * Every route in one route file, with its guards, validators and handler facts.
 * @param {string} file repo-relative path, used for the reported location
 * @param {string} [source] source to parse instead of reading the file; the
 *   tests pass synthetic fixtures so they stay valid as the application changes
 * @returns {object[]}
 */
function parseRouteFile(file, source) {
  const src = source !== undefined ? source : read(file);
  if (!src) return [];
  const masked = maskComments(src);
  const routes = [];

  const re = new RegExp(`router\\s*\\.\\s*(${VERBS.join('|')})\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(masked)) !== null) {
    const open = masked.indexOf('(', m.index + m[0].length - 1);
    const close = matchBalanced(masked, open);
    if (close === -1) continue;
    const args = masked.slice(open + 1, close);

    const pathMatch = args.match(/^\s*['"]([^'"]*)['"]/);
    if (!pathMatch) continue;

    // Split middleware from handler at the first `(req, res)` arrow function.
    const handlerMatch = args.match(/(?:async\s*)?\(\s*req\s*,\s*res\s*\)\s*=>/);
    const handlerStart = handlerMatch ? handlerMatch.index : args.length;
    const middleware = args.slice(pathMatch[0].length, handlerStart);
    const handler = args.slice(handlerStart);

    const guards = GUARDS.filter((g) => new RegExp(`\\b${g}\\b`).test(middleware));

    const validators = [];
    const vre = /\b(body|query|param)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const starts = [];
    let v;
    while ((v = vre.exec(middleware)) !== null) {
      starts.push({ location: v[1], field: v[2], index: v.index });
    }
    starts.forEach((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : middleware.length;
      const chain = middleware.slice(s.index, end);
      validators.push({
        field: s.field,
        in: s.location,
        line: lineOf(src, open + 1 + pathMatch[0].length + s.index),
        ...parseValidatorChain(chain),
      });
    });

    routes.push({
      method: m[1].toUpperCase(),
      path: pathMatch[1],
      file,
      line: lineOf(src, m.index),
      guards,
      validators,
      handler: {
        guardedFields: handlerGuardedFields(handler),
        uniquenessChecks: handlerUniquenessChecks(handler),
        responseKeys: handlerResponseKeys(handler),
        // `new Date(x)` must not count as a write; requiring an object literal
        // argument separates `new Game({...})` from every built-in constructor.
        writesModel: /new\s+[A-Z]\w*\s*\(\s*\{|\.(?:save|create\w*|insertMany|findByIdAndUpdate|findOneAndUpdate|updateOne|updateMany)\s*\(/.test(handler),
        readsById: /\.findById\w*\s*\(/.test(handler),
        persisted: handlerPersistedFields(handler),
        conditions: [...new Set((handler.match(/\bif\s*\([^)]{0,200}\)/g) || []).map((c) => c.replace(/\s+/g, ' ')))],
        // Both errors are recognised by more than one idiom. `GET /api/games/:id`
        // maps a malformed id with `error.kind === 'ObjectId'` and never names
        // CastError, so matching only the class name reports a route that
        // already does the right thing.
        mapsValidationError: /['"]ValidationError['"]|Error\.ValidationError/.test(handler),
        mapsCastError: /['"]CastError['"]|kind\s*===?\s*['"]ObjectId['"]|Error\.CastError/.test(handler),
        has500: /res\s*\.\s*status\s*\(\s*500\s*\)/.test(handler),
        // Only the generic failure path counts. A deliberate
        // `return res.status(400).json({ message: error.message })` for a known
        // business rule is a designed message, not a leak.
        leaksError: /status\s*\(\s*5\d\d\s*\)[\s\S]{0,120}?(err|error)\.(message|stack)/.test(handler),
        massAssignment: /new\s+[A-Z]\w*\s*\(\s*req\.body\s*\)|Object\.assign\s*\([^,]+,\s*req\.body|\.\.\.\s*req\.body/.test(handler),
        regexFromInput: /new\s+RegExp\s*\(\s*(?!['"])/.test(handler) || /\$regex\s*:\s*(?!['"/])/.test(handler),
        readsParams: [...new Set((handler.match(/req\.(query|body|params)\.([A-Za-z_$][\w$]*)/g) || []))],
      },
    });
  }

  return routes;
}

/* ------------------------------------------------------------------ *
 * Layer 3: Mongoose models
 * ------------------------------------------------------------------ */

/**
 * Split an object literal body on its top-level commas, ignoring commas nested
 * in brackets or quotes.
 * @param {string} body text between the braces
 * @returns {string[]} chunks, in order
 */
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (start < body.length) out.push(body.slice(start));
  return out;
}

/**
 * Split an object literal body into its top-level `key: value` entries.
 * @param {string} body text between the braces
 * @returns {Array<{key: string, value: string, offset: number}>}
 */
function topLevelEntries(body) {
  const out = [];
  let cursor = 0;
  for (const chunk of splitTopLevel(body)) {
    const m = chunk.match(/^\s*['"]?([\w$]+)['"]?\s*:\s*([\s\S]*)$/);
    if (m) out.push({ key: m[1], value: m[2], offset: cursor + chunk.indexOf(m[1]) });
    cursor += chunk.length + 1;
  }
  return out;
}

/** Parse a `[value, 'message']` or bare-value Mongoose option. */
function mongooseOption(value) {
  const arr = value.match(/^\s*\[\s*([^,\]]+)/);
  const raw = (arr ? arr[1] : value).trim();
  if (/^-?\d+(\.\d+)?$/.test(raw)) return parseFloat(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw.replace(/^['"]|['"]$/g, '');
}

/** String members of an array literal. */
function stringArray(text) {
  return (text.match(/['"]([^'"]+)['"]/g) || []).map((s) => s.slice(1, -1));
}

/**
 * Extract one model file: its schema fields and its array-returning statics.
 * @param {string} file
 * @returns {{name: string, file: string, fields: object, statics: object}|null}
 */
function parseModelFile(file, source) {
  const src = source !== undefined ? source : read(file);
  if (!src) return null;
  const masked = maskComments(src);

  const schemaIdx = masked.search(/new\s+mongoose\.Schema\s*\(/);
  if (schemaIdx === -1) return null;
  const paren = masked.indexOf('(', schemaIdx);
  const brace = masked.indexOf('{', paren);
  const end = matchBalanced(masked, brace);
  if (end === -1) return null;
  const body = masked.slice(brace + 1, end);
  const bodyOffset = brace + 1;

  const fields = {};
  for (const entry of topLevelEntries(body)) {
    const line = lineOf(src, bodyOffset + entry.offset);
    const v = entry.value.trim();

    // `field: String` shorthand carries no constraints beyond its type.
    if (!v.startsWith('{')) {
      fields[entry.key] = { file, line, type: v.replace(/[,\s]+$/, ''), required: false };
      continue;
    }

    const inner = v.slice(1, matchBalanced(v, 0));
    const f = { file, line, required: false };

    for (const opt of topLevelEntries(inner)) {
      switch (opt.key) {
        case 'type':
          f.type = opt.value.trim().replace(/[,\s]+$/, '');
          break;
        case 'required':
          f.required = mongooseOption(opt.value) !== false;
          break;
        case 'unique': case 'trim': case 'lowercase': case 'uppercase':
          f[opt.key] = mongooseOption(opt.value) === true;
          break;
        case 'minlength': case 'maxlength': case 'min': case 'max':
          f[opt.key] = mongooseOption(opt.value);
          break;
        case 'default':
          f.default = opt.value.trim().replace(/[,\s]+$/, '');
          break;
        case 'match': {
          const re = opt.value.match(/\/((?:[^/\\]|\\.)+)\//);
          f.match = re ? re[0] : opt.value.trim();
          break;
        }
        case 'enum': {
          const values = opt.value.match(/values\s*:\s*\[([\s\S]*?)\]/);
          f.enum = stringArray(values ? values[1] : opt.value);
          break;
        }
        case 'validate': {
          const validator = opt.value.match(/validator\s*:\s*(?:function\s*)?\(?([\s\S]*)$/);
          f.validate = stripLineComments(validator ? validator[1] : opt.value)
            .replace(/\s+/g, ' ')
            .replace(/,?\s*message\s*:\s*['"][^'"]*['"]\s*\}?\s*$/, '')
            .trim()
            .slice(0, 400);
          const msg = opt.value.match(/message\s*:\s*['"]([^'"]+)['"]/);
          if (msg) f.validateMessage = msg[1];
          break;
        }
        default:
          break;
      }
    }
    fields[entry.key] = f;
  }

  const statics = {};
  const sre = /\w+\.statics\.(\w+)\s*=\s*function[\s\S]{0,80}?return\s*(\[[\s\S]*?\])\s*;/g;
  let s;
  while ((s = sre.exec(masked)) !== null) statics[s[1]] = stringArray(s[2]);

  const nameMatch = masked.match(/mongoose\.model\s*\(\s*['"](\w+)['"]/);
  return {
    name: nameMatch ? nameMatch[1] : file.split('/').pop().replace(/\.js$/, ''),
    file,
    fields,
    statics,
  };
}

/* ------------------------------------------------------------------ *
 * Layer 4: client forms
 * ------------------------------------------------------------------ */

/**
 * Extract the constraints a React form enforces before the request is sent:
 * JSX validation attributes, and the branches of `validateForm()`.
 * @param {string} file
 * @returns {{file: string, fields: object}|null}
 */
function parseFormFile(file, source) {
  const src = source !== undefined ? source : read(file);
  if (!src) return null;
  const masked = maskComments(src);
  const fields = {};

  const touch = (name, line) => {
    if (!fields[name]) fields[name] = { file, line };
    return fields[name];
  };

  const tagRe = /<(input|textarea|select)\b([^>]*)>/g;
  let t;
  while ((t = tagRe.exec(masked)) !== null) {
    const attrs = t[2];
    const nameAttr = attrs.match(/\bname\s*=\s*["']([\w.]+)["']/);
    if (!nameAttr) continue;
    const f = touch(nameAttr[1], lineOf(src, t.index));
    if (/\brequired\b(?!\s*=\s*\{false\})/.test(attrs)) f.required = true;
    const num = (attr) => {
      const m = attrs.match(new RegExp(`\\b${attr}\\s*=\\s*[{"']?(-?\\d+)`));
      return m ? parseFloat(m[1]) : undefined;
    };
    const minLength = num('minLength');
    const maxLength = num('maxLength');
    const min = num('min');
    const max = num('max');
    if (minLength !== undefined) f.minLength = minLength;
    if (maxLength !== undefined) f.maxLength = maxLength;
    if (min !== undefined) f.min = min;
    if (max !== undefined) f.max = max;
    const dynamicMax = attrs.match(/\bmax\s*=\s*\{([^}]+)\}/);
    if (dynamicMax && max === undefined) f.maxExpr = dynamicMax[1].trim();
    const type = attrs.match(/\btype\s*=\s*["']([\w]+)["']/);
    if (type) f.inputType = type[1];
  }

  const errRe = /newErrors\.([\w]+)\s*=\s*['"]([^'"]*)['"]/g;
  let e;
  while ((e = errRe.exec(masked)) !== null) {
    const f = touch(e[1], lineOf(src, e.index));
    f.clientMessages = f.clientMessages || [];
    f.clientMessages.push(e[2]);
    const before = masked.slice(Math.max(0, e.index - 200), e.index);
    const cond = before.match(/if\s*\(([^)]*)\)\s*\{?\s*$/);
    if (cond) {
      f.conditions = f.conditions || [];
      f.conditions.push(cond[1].replace(/\s+/g, ' ').trim());
    }
  }

  return Object.keys(fields).length ? { file, fields } : null;
}

/* ------------------------------------------------------------------ *
 * Layer 5: Swagger documentation
 * ------------------------------------------------------------------ */

/**
 * Line a documented field is declared on, so the report cites the property
 * rather than the top of a 200-line Swagger block.
 * @param {string} src whole file
 * @param {{line: number, text: string}} block
 * @param {string} field
 * @returns {number}
 */
function docFieldLine(src, block, field) {
  const offset = block.text.split('\n').findIndex((l) => new RegExp(`^\\s*\\*\\s*${field}:`).test(l));
  return offset === -1 ? block.line : block.line + offset;
}

/**
 * Documented constraints, keyed by schema name then field.
 * @param {string[]} routeFiles
 * @returns {{schemas: object, parameters: object[]}}
 */
function parseDocs(routeFiles) {
  const schemas = {};
  const parameters = [];

  for (const file of routeFiles) {
    const src = read(file);
    if (!src) continue;
    for (const block of docBlocks(src)) {
      if (!/@swagger/.test(block.text)) continue;
      const doc = parseDocBlock(block.text);

      const defs = doc.components && doc.components.schemas;
      if (defs) {
        for (const [name, schema] of Object.entries(defs)) {
          if (!schema || typeof schema !== 'object') continue;
          const props = schema.properties;
          if (!props) continue;
          const required = listOf(schema.required).map(String);
          schemas[name] = schemas[name] || { file, line: block.line, fields: {} };
          for (const [field, spec] of Object.entries(props)) {
            if (!spec || typeof spec !== 'object') continue;
            schemas[name].fields[field] = {
              file,
              line: docFieldLine(src, block, field),
              type: spec.type,
              format: spec.format,
              minLength: spec.minLength,
              maxLength: spec.maxLength,
              minimum: spec.minimum,
              maximum: spec.maximum,
              enum: listOf(spec.enum).map(String),
              required: required.includes(field),
            };
          }
        }
      }

      for (const [pathKey, pathItem] of Object.entries(doc)) {
        if (!pathKey.startsWith('/') || !pathItem || typeof pathItem !== 'object') continue;
        for (const [verb, op] of Object.entries(pathItem)) {
          if (!VERBS.includes(verb) || !op || typeof op !== 'object') continue;
          for (const p of listOf(op.parameters)) {
            if (!p || typeof p !== 'object') continue;
            parameters.push({
              file,
              line: block.line,
              path: pathKey,
              method: verb.toUpperCase(),
              in: p.in,
              name: p.name,
              required: p.required === true,
              schema: p.schema || {},
            });
          }
        }
      }
    }
  }

  return { schemas, parameters };
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

/** Every test file in the repo, backend, frontend and e2e. */
function testFiles() {
  return [...walk('server', TEST_GLOB), ...walk('client/src', TEST_GLOB), ...walk('e2e/tests', TEST_GLOB)];
}

/**
 * Index test lines by the identifier they mention, so a rule can ask
 * "is this field's upper bound asserted anywhere?" without re-reading files.
 * @returns {{files: string[], lines: Array<{file: string, line: number, text: string, title: string}>}}
 */
function buildTestIndex() {
  const files = testFiles();
  const lines = [];
  for (const file of files) {
    const src = read(file);
    if (!src) continue;
    let title = '';
    src.split('\n').forEach((text, i) => {
      const t = text.match(/\b(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)/);
      if (t) title = t[1];
      lines.push({ file, line: i + 1, text: text.trim().slice(0, 200), title });
    });
  }
  return { files, lines };
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

/** Which model a route file mutates, by its require statements. */
function routeResources(file) {
  const src = read(file) || '';
  return [...new Set((src.match(/require\(['"][^'"]*models\/(\w+)['"]\)/g) || [])
    .map((r) => r.match(/models\/(\w+)/)[1]))];
}

/** Mount prefixes from server.js, so a route path becomes a real endpoint. */
function mountPrefixes() {
  const src = read('server/server.js') || '';
  const masked = maskComments(src);
  const requires = {};
  // The require may or may not carry the `.js` extension; server.js uses both
  // styles across the three route modules.
  const rre = /const\s+(\w+)\s*=\s*require\(['"]\.\/routes\/(\w+)(?:\.js)?['"]\)/g;
  let r;
  while ((r = rre.exec(masked)) !== null) requires[r[1]] = `server/routes/${r[2]}.js`;

  const mounts = {};
  const ure = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g;
  let u;
  while ((u = ure.exec(masked)) !== null) {
    if (requires[u[2]]) mounts[requires[u[2]]] = u[1];
  }
  return mounts;
}

/** Form file → resource, by the model whose fields it edits. */
function formResource(file, models) {
  const name = file.split('/').pop().replace(/\.js$/, '').toLowerCase();
  for (const model of Object.keys(models)) {
    if (name.startsWith(model.toLowerCase())) return model;
  }
  // AdminForm edits Users; the name of the form is a role, not a model.
  if (/admin|owner|user|login|register/.test(name)) return 'User';
  return null;
}

/** Doc schema name → resource, e.g. GameInput and Game both describe Game. */
function docResource(schemaName, models) {
  for (const model of Object.keys(models)) {
    if (schemaName.toLowerCase().startsWith(model.toLowerCase())) return model;
  }
  return null;
}

function main() {
  const routeFiles = walk(ROUTE_DIR).filter((f) => !TEST_GLOB.test(f));
  const modelFiles = walk(MODEL_DIR).filter((f) => !TEST_GLOB.test(f));
  const formFiles = CLIENT_DIRS.flatMap((d) => walk(d)).filter((f) => !TEST_GLOB.test(f));

  const models = {};
  for (const file of modelFiles) {
    const model = parseModelFile(file);
    if (model) models[model.name] = model;
  }

  const mounts = mountPrefixes();
  const routes = [];
  for (const file of routeFiles) {
    const prefix = mounts[file] || '';
    for (const route of parseRouteFile(file)) {
      const full = `${prefix}${route.path === '/' ? '' : route.path}` || '/';
      routes.push({ ...route, endpoint: `${route.method} ${full}`, resources: routeResources(file) });
    }
  }

  const forms = [];
  for (const file of formFiles) {
    const form = parseFormFile(file);
    if (form) forms.push({ ...form, resource: formResource(file, models) });
  }

  const docs = parseDocs(routeFiles);
  const tests = buildTestIndex();

  // Fold every layer into one field-keyed table per resource.
  const resources = {};
  const resourceOf = (name) => {
    if (!resources[name]) resources[name] = { model: null, statics: {}, fields: {} };
    return resources[name];
  };
  const fieldOf = (resource, field) => {
    const r = resourceOf(resource);
    if (!r.fields[field]) r.fields[field] = { route: [], model: null, client: null, doc: null, tests: [] };
    return r.fields[field];
  };

  for (const [name, model] of Object.entries(models)) {
    const r = resourceOf(name);
    r.model = model.file;
    r.statics = model.statics;
    for (const [field, spec] of Object.entries(model.fields)) fieldOf(name, field).model = spec;
  }

  for (const route of routes) {
    const resource = route.resources[0];
    if (!resource) continue;
    for (const v of route.validators) {
      // `platforms` and `platforms.*` are two chains describing one field: the
      // first bounds the array, the second constrains each member. Kept apart,
      // the array chain looks like a field with no enum and the member chain
      // like a field with no length rule, and both misreadings become findings.
      const field = v.field.replace(/\.\*$/, '');
      const entry = fieldOf(resource, field);
      const existing = entry.route.find((r) => r.endpoint === route.endpoint);
      const record = {
        endpoint: route.endpoint,
        file: route.file,
        guardedInHandler: route.handler.guardedFields.includes(field),
        persisted: route.handler.persisted.wildcard || route.handler.persisted.fields.includes(field),
        writesModel: route.handler.writesModel,
        ...v,
      };
      if (!existing) {
        entry.route.push(record);
        continue;
      }
      for (const [key, value] of Object.entries(record)) {
        const empty = existing[key] === null || existing[key] === undefined
          || existing[key] === false || (Array.isArray(existing[key]) && !existing[key].length);
        if (empty && value !== null && value !== undefined) existing[key] = value;
      }
    }
  }

  for (const form of forms) {
    if (!form.resource) continue;
    for (const [field, spec] of Object.entries(form.fields)) {
      fieldOf(form.resource, field).client = spec;
    }
  }

  for (const [schemaName, schema] of Object.entries(docs.schemas)) {
    const resource = docResource(schemaName, models);
    if (!resource) continue;
    for (const [field, spec] of Object.entries(schema.fields)) {
      const target = fieldOf(resource, field);
      // Input schemas describe what a request may send; prefer them over
      // response schemas, which describe what the server returns.
      if (!target.doc || /input/i.test(schemaName)) target.doc = { schema: schemaName, ...spec };
    }
  }

  for (const [resource, r] of Object.entries(resources)) {
    for (const [field, entry] of Object.entries(r.fields)) {
      const re = new RegExp(`\\b${field}\\b`);
      entry.tests = tests.lines
        .filter((l) => re.test(l.text))
        .slice(0, 40)
        .map((l) => ({ file: l.file, line: l.line, title: l.title, text: l.text }));
      void resource;
    }
  }

  const map = {
    meta: {
      sha: git(['rev-parse', '--short', 'HEAD'], { allowFail: true }) || 'unknown',
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true }) || 'unknown',
      routeFiles,
      modelFiles,
      formFiles: forms.map((f) => f.file),
      testFiles: tests.files,
      impactMap: readArtifact('impact-map.json') ? '.impact/impact-map.json' : null,
    },
    resources,
    routes,
    docs,
    testLines: tests.lines.length,
  };

  const target = writeScanArtifact('contract-map.json', map);
  const fieldCount = Object.values(resources).reduce((n, r) => n + Object.keys(r.fields).length, 0);
  process.stdout.write(
    `contract map: ${Object.keys(resources).length} resources, ${fieldCount} fields, ` +
    `${routes.length} routes, ${tests.files.length} test files -> ${rel(target)}\n`
  );
  return map;
}

if (require.main === module) main();

module.exports = {
  parseDocBlock,
  parseValidatorChain,
  handlerGuardedFields,
  handlerUniquenessChecks,
  handlerResponseKeys,
  handlerPersistedFields,
  parseRouteFile,
  splitTopLevel,
  topLevelEntries,
  parseModelFile,
  parseFormFile,
  parseDocs,
  mountPrefixes,
  buildTestIndex,
  main,
};
