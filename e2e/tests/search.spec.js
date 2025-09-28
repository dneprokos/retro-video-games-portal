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
    
    // Get a game name from API to use for search (data-independent)
    const gamesResponse = await apiClient.getGames({ limit: 1 });
    expect(gamesResponse.status).toBe(200);
    expect(gamesResponse.data.games).toBeDefined();
    expect(gamesResponse.data.games.length).toBeGreaterThan(0);
    
    const searchGameName = gamesResponse.data.games[0].name;
    expect(searchGameName).toBeDefined();
    expect(searchGameName.length).toBeGreaterThan(0);
    
    // Perform search using the game name from API
    await homePage.searchGames(searchGameName);
    
    // Get UI results
    const uiGameCount = await homePage.getGameCount();
    const uiGameNames = await homePage.getGameNames();
    
    // Get API results
    const apiResponse = await apiClient.searchGames(searchGameName);
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
    
    // Wait for page to load (either with games or no results message)
    try {
      await homePage.waitForGamesToLoad();
    } catch (error) {
      // If no games are loaded initially, that's okay for this test
      console.log('No initial games loaded, proceeding with search test');
    }
    
    // Search for something that doesn't exist
    await homePage.searchGames('NonExistentGame12345');
    
    // Wait for search results to load
    await homePage.waitForGamesToLoad();
    
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
    
    // Get initial count for comparison
    const initialCount = await homePage.getGameCount();
    expect(initialCount).toBeGreaterThan(0);
    
    // Test empty search - should return all games
    await homePage.searchGames('');
    const emptySearchCount = await homePage.getGameCount();
    expect(emptySearchCount).toBe(initialCount);
    
    // Test special characters - should return no results
    await homePage.searchGames('!@#$%^&*()');
    const specialCharCount = await homePage.getGameCount();
    expect(specialCharCount).toBe(0);
    
    // Test very long search term - should return no results
    const longSearchTerm = 'a'.repeat(100);
    await homePage.searchGames(longSearchTerm);
    const longSearchCount = await homePage.getGameCount();
    expect(longSearchCount).toBe(0);
  });
}); 