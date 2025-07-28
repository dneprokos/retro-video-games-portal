# 🧪 End-to-End Testing - Retro Video Games Portal

This directory contains comprehensive end-to-end tests for the Retro Video Games Portal using Playwright.

## 📋 Prerequisites

- **Node.js**: Version 18 or higher
- **Docker**: For running the application locally
- **Playwright**: Will be installed automatically

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd e2e
npm install
```

### 2. Install Playwright Browsers
```bash
npm run test:install
```

### 3. Start the Application
Make sure the application is running with Docker:
```bash
# From project root
cd docker
docker-compose up -d
```

### 4. Run Tests
```bash
# Run all tests
npm test

# Run tests in headed mode (see browser)
npm run test:headed

# Run tests with UI mode
npm run test:ui

# Run tests in debug mode
npm run test:debug
```

## 📁 Test Structure

```
e2e/
├── tests/
│   ├── retro-games-portal.spec.js # Main comprehensive test suite
│   ├── pages/                     # Page Object Model classes
│   │   ├── BasePage.js           # Base page class
│   │   ├── HomePage.js           # Home page interactions
│   │   ├── LoginPage.js          # Login page interactions
│   │   └── RegisterPage.js       # Register page interactions
│   ├── utils/
│   │   └── api-client.js         # API client for integration testing
│   └── fixtures/
│       └── test-data.js          # Parameterized test data
├── playwright.config.js          # Playwright configuration
├── package.json                  # Test dependencies
└── README.md                     # This file
```

## 🧪 Test Categories

### 1. Core Functionality (`retro-games-portal.spec.js`)
- **Home Page**: Game display, images, ratings validation
- **Search**: Parameterized tests for various search terms
- **Filtering**: Parameterized tests for genre and platform filters
- **Registration**: Parameterized tests for user registration
- **Login**: Parameterized tests for authentication
- **Edge Cases**: Error handling, empty database, network issues
- **API Integration**: Health checks, data validation, UI/API comparison

### 2. Testing Strategy
Following the **Testing Pyramid** approach:
- **Unit Tests**: Component-level tests (in client/ and server/)
- **Integration Tests**: API endpoint tests (in server/)
- **E2E Tests**: Critical user journeys only (this directory)

### 3. Key Features
- **Page Object Model**: Reusable page classes
- **Parameterized Tests**: Multiple test scenarios with same logic
- **API Integration**: Compare UI results with API responses
- **Edge Case Testing**: Network failures, empty data, malformed responses
- **Request Interception**: Simulate various server conditions

## 🛠️ Available Commands

### Test Execution
```bash
# Run all tests
npm test

# Run specific test file
npx playwright test main.spec.js

# Run tests in headed mode
npm run test:headed

# Run tests with UI mode (interactive)
npm run test:ui

# Run tests in debug mode
npm run test:debug
```

### Test Management
```bash
# Install Playwright browsers
npm run test:install

# Show test report
npm run test:report

# Generate test code
npm run test:codegen

# Update snapshots
npm run test:update-snapshots
```

### Browser-Specific Testing
```bash
# Test on specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Test on mobile
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"
```

## 🔧 Configuration

### Playwright Config (`playwright.config.js`)
- **Base URL**: `http://localhost:9000` (Docker client port)
- **Browsers**: Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari
- **Retries**: 2 retries on CI, 0 locally
- **Screenshots**: On failure only
- **Videos**: Retained on failure
- **Traces**: On first retry

### Test Data
- **Sample Games**: 12 classic retro games with real images
- **Test Users**: Generated during test execution
- **Fixtures**: Reusable test data in `fixtures/` directory

## 📊 Test Reports

### HTML Report
After running tests, view the HTML report:
```bash
npm run test:report
```

### JUnit Report
For CI/CD integration, JUnit reports are generated in `test-results/results.xml`

### JSON Report
Detailed test results in `test-results/results.json`

## 🐛 Debugging

### Debug Mode
```bash
npm run test:debug
```
This opens Playwright Inspector for step-by-step debugging.

### Code Generation
```bash
npm run test:codegen
```
This opens Playwright Codegen to record and generate test code.

### Screenshots and Videos
- **Screenshots**: Automatically captured on test failure
- **Videos**: Recorded for failed tests
- **Traces**: Generated for debugging complex issues

## 🔍 Test Selectors

Tests use `data-testid` attributes for reliable element selection:

```javascript
// Examples of test selectors used
'[data-testid="game-card"]'           // Game cards
'[data-testid="filter-panel"]'        // Filter panel
'[data-testid="search-input"]'        // Search input
'[data-testid="login-link"]'          // Login link
'[data-testid="register-form"]'       // Registration form
'[data-testid="error-message"]'       // Error messages
```

## 🚨 Common Issues

### 1. Application Not Running
```bash
# Ensure Docker containers are running
cd docker
docker-compose ps
docker-compose up -d
```

### 2. Port Conflicts
If port 9000 is in use, update the base URL in `playwright.config.js`:
```javascript
baseURL: 'http://localhost:YOUR_PORT'
```

### 3. Browser Installation Issues
```bash
# Reinstall browsers
npm run test:install
```

### 4. Test Timeouts
Increase timeout in `playwright.config.js`:
```javascript
timeout: 30000, // 30 seconds
```

## 📈 CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd e2e && npm install
      - run: cd e2e && npm run test:install
      - run: cd ../docker && docker-compose up -d
      - run: cd e2e && npm test
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
```

## 🎯 Best Practices

### 1. Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Keep tests independent and isolated

### 2. Selectors
- Use `data-testid` attributes for reliable selection
- Avoid CSS selectors that might change
- Prefer semantic selectors over visual ones

### 3. Assertions
- Use specific assertions
- Check both positive and negative cases
- Verify user-visible behavior

### 4. Performance
- Use `waitForTimeout` sparingly
- Prefer `waitForSelector` or `waitForLoadState`
- Run tests in parallel when possible

## 📞 Support

- **Playwright Docs**: https://playwright.dev/
- **Test Issues**: Check test reports and screenshots
- **Application Issues**: Verify Docker containers are running

---

**🎮 Happy Testing!** 🧪 