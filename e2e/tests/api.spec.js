const { test, expect } = require('@playwright/test');
const ApiClient = require('./utils/api-client');

test.describe('API Health and Integration', () => {
  let apiClient;

  test.beforeEach(async ({ request }) => {
    apiClient = new ApiClient(request);
  });

  test('should verify API health endpoint', async ({ request }) => {
    const healthResponse = await apiClient.getHealth();
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.data).toHaveProperty('status');
    expect(healthResponse.data.status).toBe('OK');
  });

  test('should validate game data structure from API', async ({ request }) => {
    const apiResponse = await apiClient.getGames();
    expect(apiResponse.status).toBe(200);
    
    // Validate structure of first game
    if (apiResponse.data.length > 0) {
      const validation = apiClient.validateGameStructure(apiResponse.data[0]);
      expect(validation.valid).toBe(true);
    }
  });
}); 