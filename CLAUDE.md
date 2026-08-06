# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo of **four independent npm packages**, each with its own `node_modules` and lockfile:

| Package | Path | Stack |
|---|---|---|
| root | `/` | orchestration scripts only (`concurrently`) |
| server | `server/` | Express 4 + Mongoose 8 + JWT, port 5000 |
| client | `client/` | React 18 via Create React App 5 + Tailwind |
| e2e | `e2e/` | Playwright 1.40 (Chromium only) |

`npm run install-all` installs root + server + client. **It does not install `e2e/`** — run `cd e2e && npm ci` separately.

## Commands

### Run the app
```bash
npm run install-all          # root + server + client deps
npm run dev                  # concurrently: server (nodemon) + client (CRA)
npm run server               # server only
npm run client               # client only
npm run build                # production build of client
cd server && npm run seed    # populate demo catalogue
```

Docker (full stack incl. MongoDB):
```powershell
./docker-run.ps1             # copies docker/env.example -> docker/.env, then docker-compose up -d
./docker-stop.ps1
```
```bash
./docker-run.sh
```

### Backend tests (`cd server`)
```bash
npm test                                     # all jest tests
npm run test:unit                            # --testPathPattern=unit
npm run test:integration                     # --testPathPattern=integration
npm run test:coverage                        # enforces 80% threshold
npx jest models/Game.test.js                 # single file
npx jest -t "rejects future release date"    # single test by name
npm test -- --testPathPattern="models|middleware"   # what CI calls "unit"
npm test -- --testPathPattern=routes                # what CI calls "integration"
```

Note the CI job names do not match the npm script names: `test:unit`/`test:integration` filter on the words *unit*/*integration* in the path, but no test file contains them. CI instead filters on `models|middleware` vs `routes`.

### Frontend tests (`cd client`)
```bash
npm run test:coverage                                  # runs ALL tests (preferred)
npm test -- --watchAll=false --testPathPattern="Home"  # single file / pattern
npm run test:ci                                        # CI form, lcov output
```
Plain `npm test` only runs tests for files changed since the last commit — use `test:coverage` or pass `--watchAll=false`.

### E2E tests (`cd e2e`)
```bash
npm ci && npx playwright install chromium
npm test                                # all specs
npx playwright test tests/search.spec.js
npx playwright test -g "filters by genre"
npm run test:headed / test:ui / test:debug
npm run test:report
```
`playwright.config.js` has **no `webServer` block** — the app must already be running. Default `baseURL` is `http://localhost:3000`; override with `BASE_URL`.

### Lint
There is no lint script in any package. CI's `build-and-lint` job calls `npm run lint || echo "No lint script found"` and always passes. ESLint runs only implicitly through `react-scripts`.

## Architecture

### Server (`server/server.js`)
Express app is **exported without listening**; `app.listen` only fires under `require.main === module`. That is what lets `supertest` mount the app directly in tests.

Startup deliberately **listens before connecting to Mongo**, and a failed connection is logged but non-fatal — the API stays up and DB-backed routes fail at request time. `mongoose.set('bufferCommands', false)` makes those failures immediate rather than hanging.

Middleware order: `helmet` → rate limit (**skipped entirely when `NODE_ENV === 'test'`**) → CORS (`CORS_ORIGIN`, default `http://localhost:3000`) → JSON body (10 mb) → static `/uploads` → routes → Swagger → health → error handler → 404.

Mounted routers: `/api/auth`, `/api/games`, `/api/admin`, plus `/api/health` and Swagger UI at `/api-docs`.

Swagger scans `'./routes/*.js'` — a **cwd-relative** path, so the server must be started from inside `server/` or the docs come up empty.

### Auth & roles
Three roles on `User.role`: `guest` | `admin` | `owner`. `User.isAdmin()` returns true for both admin and owner; `isOwner()` is owner-only.

`server/middleware/auth.js` exports four guards:
- `authenticateToken` — requires `Authorization: Bearer <jwt>`, loads the user, 401 on missing/invalid/expired
- `requireAdmin` / `requireOwner` — 401 if unauthenticated, 403 if wrong role
- `optionalAuth` — attaches `req.user` when a valid token is present, never fails

Owner bootstrap: `POST /api/auth/register` is a **single-use** endpoint. It only accepts the address in `OWNER_EMAIL` and refuses once `User.ownerExists()` is true. Admins are created afterwards by the owner via `POST /api/admin/users`. There is no public signup.

Passwords are hashed in a `pre('save')` hook with bcrypt salt rounds 12 — never hash at the call site.

### Client
`client/src/App.js` is the whole route table. `AuthProvider` wraps `Router`, so auth state is available to every route.

`contexts/AuthContext.js` owns session state: token in `localStorage`, mirrored into `axios.defaults.headers.common.Authorization`, and re-validated against `/api/auth/me` on every mount. A failed check calls `logout()`. `loading` is true until that check resolves — `ProtectedRoute` must respect it or protected pages flash a redirect on reload.

There is no Redux/Zustand; Context plus local state only. Requests go through bare `axios` with relative `/api/...` paths, resolved by the CRA `proxy` field in dev and by nginx in Docker.

### Ports — read before debugging a connection failure
Three conflicting values are in the repo:
- `client/package.json` sets `"proxy": "http://localhost:5000"` and CRA defaults to **3000**
- `client/.env` sets `PORT=5173` — CRA honours this, so `npm run client` actually serves on **5173**, while `playwright.config.js` and the CI workflow both assume **3000**
- `docker/env.example` publishes the client on **9000**

`client/.env` also defines `VITE_API_BASE_URL`, which is inert: this is CRA, not Vite, and CRA only exposes `REACT_APP_*` variables.

### Testing setup
**Backend** (`server/jest.config.js`): `testEnvironment: node`, tests co-located as `*.test.js`, coverage collected from `models/`, `routes/`, `middleware/` with an 80% global threshold. `server/test/setup.js` starts a `mongodb-memory-server` in `beforeAll`, wipes every collection in `afterEach`, and exposes `global.testUtils.createTestUser` / `createTestGame` / `generateToken`. Because that setup file always spins up an in-memory Mongo, backend tests never need a real database — even the ones CI runs against a live `mongo:7.0` service.

**Frontend**: CRA's Jest. `client/src/setupTests.js` globally `jest.mock`s `react-hot-toast` and **`lucide-react` icon-by-icon** — a component importing an icon not in that list renders `undefined`. Add new icons to the mock.

MSW is installed and `client/src/mocks/` is populated, but it is **commented out** in `setupTests.js` (polyfill issues). Tests mock axios directly instead.

`client/src/test-utils.js` exports a custom `render` wrapping children in `BrowserRouter` and a **separate mock context object**, not the real `AuthContext`. Components that call `useAuth()` will therefore still hit the real provider and throw unless it is supplied. `Home.test.js.disabled` is parked for this reason.

**E2E** (`e2e/tests/`): Page Object Model in `tests/pages/` (`BasePage`, `HomePage`), API helper in `tests/utils/api-client.js`, data in `tests/fixtures/test-data.js`. Only public/guest journeys are covered — there are no authenticated E2E flows, and no Login/Register page objects exist despite `e2e/.env` supplying credentials.

### CI (`.github/workflows/build.yml`)
Six jobs. `backend-unit-tests`, `frontend-unit-tests`, `integration-tests`, `build-and-lint` run in parallel; `e2e-tests` is gated on all four succeeding; `test-summary` always runs. The E2E job boots Mongo, starts the server, seeds, starts CRA, installs Chromium, then runs Playwright against `http://localhost:3000`.

## Conventions

From `.cursor/rules/` (see those files for the full set):
- Components `PascalCase.js`, utilities `camelCase.js`, other files kebab-case, tests `Name.test.js` adjacent to the module
- Default export for components, named exports for utilities
- Consistent JSON error shape; validation on both client and server (`express-validator` on routes, Mongoose schema rules on models — both layers, deliberately)
- JSDoc on functions; Swagger JSDoc blocks on every route
- Conventional commits: `type(scope): description`; branches `feature/*`, `bugfix/*`

## Related docs

- `docs/requirements.md` — feature spec (F-01…F-15) with numbered functional requirements and acceptance criteria; mirrored as epics/stories in the Jira project `SCRUM` (Dneprokos-test-project)
- `README.MD` — setup and testing walkthrough
- `TEST_AUTOMATION_STRATEGY.md`, `TESTING_SUMMARY.md`, `server/COVERAGE.md` — testing detail
- `docker/README.md`, `e2e/README.md`, `.github/workflows/README.md`

## Known traps

- `server/seed.js` **deletes every user unconditionally** before seeding. Running it against a live database destroys the Owner and all Admins. `docker/mongo-init.js` holds a second, divergent seed set.
- Image URL validation disagrees between layers: the route accepts any `http(s)` URL, the model requires an image extension or a Wikimedia host — a URL like `https://example.com/cover` passes validation then fails at save with an opaque 500.
- Platform filtering is advertised (the filter-options endpoint returns 26 platforms) but not implemented: no query parameter, no UI control, and the E2E page object and API client are explicit no-op stubs.
- `multer`, `/uploads`, and `MAX_FILE_SIZE` are all wired up, but no upload route exists.
- `e2e/.env` and `client/.env` are committed, and `e2e/.env` contains real-looking credentials. Do not add more secrets to tracked env files.
