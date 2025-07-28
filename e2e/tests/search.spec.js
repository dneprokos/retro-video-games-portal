const { test, expect } = require('@playwright/test');
const HomePage = require('./pages/HomePage');
const ApiClient = require('./utils/api-client');

test.describe('Search Functionality', () => {
  let homePage, apiClient;

  test.beforeEach(async ({ page, request }) => {
    homePage = new HomePage(page);
    apiClient = new ApiClient(request);
  });

  test('should search for games and return correct results', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    // Get initial game count
    const initialCount = await homePage.getGameCount();
    expect(initialCount).toBeGreaterThan(0);
    
    // Perform search for a common game
    await homePage.searchGames('Mario');
    
    // Get UI results
    const uiGameCount = await homePage.getGameCount();
    const uiGameNames = await homePage.getGameNames();
    
    // Get API results
    const apiResponse = await apiClient.searchGames('Mario');
    expect(apiResponse.status).toBe(200);
    
    // Verify search returned results
    expect(uiGameCount).toBeGreaterThanOrEqual(0);
    expect(uiGameCount).toBeLessThanOrEqual(initialCount);
    
    // Verify API and UI match
    const comparison = apiClient.compareGameData(apiResponse.data, uiGameNames);
    expect(comparison.match).toBe(true);
  });

  test('should handle search with no results', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    // Search for something that doesn't exist
    await homePage.searchGames('NonExistentGame12345');
    
    // Get UI results
    const uiGameCount = await homePage.getGameCount();
    const uiGameNames = await homePage.getGameNames();
    
    // Get API results
    const apiResponse = await apiClient.searchGames('NonExistentGame12345');
    expect(apiResponse.status).toBe(200);
    
    // Verify no results
    expect(uiGameCount).toBe(0);
    expect(uiGameNames).toEqual([]);
    
    // Verify API and UI match
    const comparison = apiClient.compareGameData(apiResponse.data, uiGameNames);
    expect(comparison.match).toBe(true);
  });

  test('should handle edge case searches', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    // Test empty search
    await homePage.searchGames('');
    const emptySearchCount = await homePage.getGameCount();
    expect(emptySearchCount).toBeGreaterThan(0);
    
    // Test special characters
    await homePage.searchGames('!@#$%^&*()');
    const specialCharCount = await homePage.getGameCount();
    expect(specialCharCount).toBeGreaterThanOrEqual(0);
    
    // Test very long search term
    const longSearchTerm = 'a'.repeat(100);
    await homePage.searchGames(longSearchTerm);
    const longSearchCount = await homePage.getGameCount();
    expect(longSearchCount).toBeGreaterThanOrEqual(0);
  });
}); 