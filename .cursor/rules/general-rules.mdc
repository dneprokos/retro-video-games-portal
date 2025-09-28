---
description: General development rules for Retro Video Games Portal
globs: ["**/*"]
alwaysApply: true
---

# Project Instructions

## Project Context
- Full-stack web application with role-based access control
- Monorepo with separate client/server directories
- Node.js + Express + MongoDB + JWT authentication
- React with hooks, context, and modern patterns
- Jest + React Testing Library + Playwright testing
- Docker containerization with CI/CD

## Code Organization
- Use consistent directory structure across client and server
- Separate concerns: models, routes, middleware, components, pages
- Follow single responsibility principle
- Keep files focused and maintainable
- Use descriptive naming conventions

## Naming Conventions
- Components: PascalCase (GameCard.js)
- Utilities: camelCase (gameUtils.js)
- Constants: UPPER_SNAKE_CASE
- Files: kebab-case for non-components
- Test files: ComponentName.test.js
- Docker files: Dockerfile.service

## Import/Export Patterns
- Use named exports for utilities
- Use default exports for components
- Group imports: external libraries, internal modules, relative imports
- Use absolute imports with path mapping when possible

## Error Handling
- Always include try-catch blocks for async operations
- Use consistent error response format
- Use error boundaries for React components
- Log errors with structured logging
- Don't expose sensitive data in error messages

## Security Best Practices
- Validate all inputs on both client and server
- Use JWT tokens with proper expiration
- Implement role-based access control (Guest, Admin, Owner)
- Hash passwords with bcrypt (salt rounds: 12)
- Use environment variables for sensitive data
- Use Helmet.js for security headers
- Implement CORS configuration
- Use rate limiting for API protection

## Performance Optimization
- Use database indexing for performance
- Implement proper pagination
- Use connection pooling
- Include caching strategies
- Use React.memo for expensive components
- Implement proper loading states
- Use lazy loading for routes
- Optimize bundle sizes
- Use code splitting

## Testing Standards
- Place test files adjacent to the modules they test
- Use `.test.js` suffix for test files
- Organize tests into unit, integration, and end-to-end categories
- Use descriptive test names that clearly state expected behavior
- Minimum 80% test coverage overall
- Follow testing rules in `.cursor/rules/testing-rules.mdc` for detailed patterns

## Code Quality Standards
- Use JSDoc for functions and classes
- Include Swagger/OpenAPI for API endpoints
- Write clear commit messages
- Include README files for setup instructions
- Document environment variables

## Code Review Checklist
- All functions have proper error handling
- Input validation is implemented
- Security best practices are followed
- Tests are written and passing
- Code is properly documented
- Performance considerations are addressed

## Git Workflow Standards
- Commit message format: `type(scope): description`
- Branch naming: `feature/feature-name`, `bugfix/issue-description`
- Use conventional commits
- Include proper commit descriptions

## Docker Standards
- Use multi-stage builds for optimization
- Include health checks for containers
- Use proper environment variable handling
- Include database initialization scripts
- Use docker-compose for local development

## Monitoring & Logging
- Use structured logging with JSON format
- Monitor API response times
- Track database query performance
- Monitor frontend bundle sizes
- Track test execution times
- Monitor deployment success rates

## UI/UX Standards
- Use semantic HTML elements
- Include proper ARIA labels
- Ensure keyboard navigation works
- Maintain proper color contrast
- Include alt text for images
- Use mobile-first approach
- Test on multiple screen sizes
- Use CSS Grid and Flexbox

## Development Workflow
- Use environment variables for configuration
- Include hot reloading for development
- Use linting and formatting tools
- Include pre-commit hooks
- Use consistent code formatting

## Quality Metrics
- Test Coverage: Minimum 80% overall
- Code Duplication: < 5%
- Complexity: Cyclomatic complexity < 10
- Performance: API response time < 200ms for 95% of requests
- Reliability: Test flakiness < 1% false failures

## Continuous Integration
- Run tests on every pull request
- Include coverage reporting
- Use automated security scanning
- Include performance testing
- Monitor build success rates

## Common Anti-Patterns to Avoid
- Not handling async errors properly
- Exposing sensitive data in error messages
- Not validating input data
- Using synchronous operations in async contexts
- Not implementing proper logging
- Not handling loading states
- Not implementing error boundaries
- Not optimizing re-renders
- Not handling edge cases
- Not implementing proper accessibility
- Testing implementation details instead of behavior
- Not cleaning up test data
- Using real API calls in unit tests
- Not testing error scenarios
- Writing tests that are too brittle

## Success Criteria
- Code is written and tested
- All tests are passing
- Code review is completed
- Documentation is updated
- Security review is completed
- Performance is acceptable
- Accessibility requirements are met
- Deployment is successful

## Specialized Rules
- Backend: See `.cursor/rules/backend-rules.mdc` for server-specific patterns
- Frontend: See `.cursor/rules/frontend-rules.mdc` for client-specific patterns
- Testing: See `.cursor/rules/testing-rules.mdc` for comprehensive testing standards
