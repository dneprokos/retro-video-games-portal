# 📊 Test Coverage Documentation

## Overview
This document describes the test coverage setup and available commands for the Retro Video Games Portal backend.

## Coverage Commands

### Basic Coverage
```bash
# Run tests with coverage (text output)
npm run test:coverage

# Run tests with HTML coverage report
npm run test:coverage:html

# Run tests with coverage in watch mode
npm run test:coverage:watch
```

### CI/CD Coverage
```bash
# Coverage for CI/CD pipelines (text + lcov)
npm run test:coverage:ci

# Quick coverage summary (no verbose output)
npm run test:coverage:summary
```

### Other Test Commands
```bash
# Run tests normally
npm test

# Run tests with verbose output
npm run test:verbose
```

## Coverage Thresholds

The project has set coverage thresholds at **80%** for:
- **Statements**: 80%
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%

## Current Coverage Status

| Component | Statements | Branches | Functions | Lines | Status |
|-----------|------------|----------|-----------|-------|--------|
| **Models** | 98% | 85.71% | 100% | 100% | ✅ Good |
| **Middleware** | 62.79% | 54.16% | 75% | 62.79% | ⚠️ Needs Improvement |
| **Routes** | 45.57% | 35.41% | 33.33% | 46.18% | ❌ Needs Work |
| **Overall** | 56.11% | 44.02% | 62.5% | 56.68% | ❌ Below Threshold |

## Coverage Reports

### HTML Report
After running `npm run test:coverage:html`, open `coverage/index.html` in your browser for a detailed interactive coverage report.

### LCOV Report
The `coverage/lcov.info` file can be used with coverage reporting tools like:
- Codecov
- Coveralls
- SonarQube

## Areas Needing Improvement

### 1. Routes Coverage (45.57%)
**Missing coverage in:**
- `routes/admin.js` - Only 20% coverage
- `routes/auth.js` - Only 20.96% coverage
- `routes/games.js` - 70.17% coverage (better but needs improvement)

**Action needed:** Add tests for admin and auth routes

### 2. Middleware Coverage (62.79%)
**Missing coverage in:**
- `middleware/auth.js` - Missing tests for `authenticateToken` and `optionalAuth` functions

**Action needed:** Add unit tests for authentication token validation

### 3. Models Coverage (98%)
**Status:** Excellent coverage, only minor improvements needed

## Coverage Configuration

Coverage is configured in `jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  }
}
```

## Best Practices

1. **Run coverage before commits:** `npm run test:coverage:summary`
2. **Use HTML report for detailed analysis:** `npm run test:coverage:html`
3. **Monitor coverage trends** in CI/CD pipelines
4. **Aim for 80%+ coverage** in all components
5. **Focus on critical paths** rather than just hitting numbers

## Next Steps

1. **Add missing route tests** for admin and auth endpoints
2. **Complete middleware testing** for authentication functions
3. **Add error handling tests** for edge cases
4. **Implement coverage badges** for README
5. **Set up coverage reporting** in CI/CD pipeline 