# E2E Test Organization

The e2e tests have been organized into separate files based on functionality for better maintainability and easier test execution.

## Test Files Structure

### Core Functionality Tests
- **`home-page.spec.js`** - Core home page functionality tests
  - Page loading and title verification
  - Game display and count validation
  - Image loading verification
  - Rating validation

### Search Functionality Tests
- **`search.spec.js`** - Search functionality tests
  - Basic search functionality with results
  - Search with no results handling
  - Edge case searches (empty, special characters, long terms)
  - API integration validation

### Filter Functionality Tests
- **`filters.spec.js`** - Filter functionality tests
  - Genre filtering with API validation
  - Platform filtering (when implemented)
  - Multiple filters applied together
  - Filter management (clearing filters)



### Edge Cases and Error Handling
- **`edge-cases.spec.js`** - Edge case and stress tests
  - Rapid filter changes
  - Rapid search changes
  - Concurrent filter and search operations

### Navigation and User Flow
- **`navigation.spec.js`** - Navigation and user flow tests
  - Page navigation between different sections
  - Filter state management
  - User journey validation

### API Health and Integration
- **`api.spec.js`** - API health and integration tests
  - Health endpoint verification
  - Data structure validation
  - API response format validation

## Running Tests

### Run All Tests
```bash
npm run test:e2e
```

### Run Specific Test Categories
```bash
# Run only home page tests
npx playwright test home-page.spec.js

# Run only search tests
npx playwright test search.spec.js

# Run only filter tests
npx playwright test filters.spec.js



# Run only edge cases tests
npx playwright test edge-cases.spec.js

# Run only navigation tests
npx playwright test navigation.spec.js

# Run only API tests
npx playwright test api.spec.js
```

### Run Tests with Specific Tags
```bash
# Run tests with specific tags (if implemented)
npx playwright test --grep "search"
npx playwright test --grep "filter"
```

## Test Data

Test data is centralized in `fixtures/test-data.js` and includes:
- Edge case scenarios for testing

## Page Objects

The tests use page object models located in `pages/`:
- `HomePage.js` - Home page interactions
- `BasePage.js` - Common page functionality

## Utilities

- `utils/api-client.js` - API interaction utilities
- `fixtures/test-data.js` - Centralized test data

## Benefits of This Organization

1. **Better Maintainability** - Tests are organized by functionality
2. **Easier Debugging** - Failures are isolated to specific areas
3. **Parallel Execution** - Tests can be run in parallel by category
4. **Focused Development** - Developers can work on specific areas
5. **Clearer Test Reports** - Results are organized by functionality
6. **Selective Testing** - Run only relevant tests during development

## Migration Notes

The original `retro-games-portal.spec.js` file has been replaced with a documentation comment explaining the new structure. All tests have been moved to their respective specialized files while maintaining the same test logic and assertions. 