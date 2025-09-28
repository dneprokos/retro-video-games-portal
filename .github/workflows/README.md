# GitHub Actions Workflow

## Build and Test Workflow

This workflow runs on every pull request and push to main/develop branches.

### Jobs Overview

1. **Backend Unit Tests** - Tests server models, middleware, and utilities
2. **Frontend Unit Tests** - Tests React components, hooks, and utilities  
3. **Integration Tests** - Tests API endpoints with real database
4. **Build and Lint** - Builds both client and server, runs linting
5. **Test Summary** - Provides summary of all test results

### Test Coverage

- **Backend**: Models, routes, middleware with MongoDB Memory Server
- **Frontend**: Components, hooks, pages with React Testing Library
- **Integration**: API endpoints with real MongoDB database
- **Coverage**: Minimum 80% overall coverage required

### Test Scripts

#### Backend (server/)
- `npm test` - Run all tests
- `npm run test:coverage` - Run tests with coverage
- `npm run test:integration` - Run integration tests
- `npm run test:unit` - Run unit tests only

#### Frontend (client/)
- `npm test` - Run all tests
- `npm run test:coverage` - Run tests with coverage
- `npm run test:ci` - Run tests for CI with coverage

### Environment Variables

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT secret for testing
- `NODE_ENV` - Set to 'test' for testing

### Coverage Reports

Coverage reports are uploaded to Codecov with separate flags:
- Backend coverage: `backend` flag
- Frontend coverage: `frontend` flag

### Test Structure

```
server/
├── models/
│   ├── Game.unit.test.js
│   └── User.unit.test.js
├── routes/
│   └── games.integration.test.js
└── middleware/
    └── auth.unit.test.js

client/src/
├── components/
│   └── GameCard.unit.test.js
├── hooks/
│   └── useAuth.unit.test.js
└── pages/
    └── Home.unit.test.js
```

### Best Practices

1. **Unit Tests**: Test individual functions and components in isolation
2. **Integration Tests**: Test API endpoints with real database
3. **Coverage**: Aim for 90%+ coverage on business logic
4. **Mocking**: Use proper mocks for external dependencies
5. **Test Data**: Use realistic test data that matches production
6. **Cleanup**: Properly clean up test data after each test

### Running Tests Locally

```bash
# Backend tests
cd server
npm test
npm run test:coverage
npm run test:integration

# Frontend tests  
cd client
npm test
npm run test:coverage

# All tests
npm run test:all
```

### Troubleshooting

- **MongoDB Connection**: Ensure MongoDB is running for integration tests
- **Test Timeouts**: Increase timeout for slow tests
- **Coverage**: Check coverage thresholds in jest.config.js
- **Dependencies**: Ensure all test dependencies are installed
