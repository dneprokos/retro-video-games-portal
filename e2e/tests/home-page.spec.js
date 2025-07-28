const { test, expect } = require('@playwright/test');
const HomePage = require('./pages/HomePage');
const ApiClient = require('./utils/api-client');

test.describe('Home Page - Core Functionality', () => {
  let homePage, apiClient;

  test.beforeEach(async ({ page, request }) => {
    homePage = new HomePage(page);
    apiClient = new ApiClient(request);
  });

  test('should load home page with games and compare with API', async ({ page }) => {
    await homePage.load();
    
    // Verify page loads correctly
    await expect(page).toHaveTitle('Retro Games Portal');
    // Filter panel should be hidden by default
    await expect(homePage.isFilterPanelVisible()).resolves.toBe(false);
    
    // Wait for games to load
    await homePage.waitForGamesToLoad();
    
    // Get UI data
    const uiGameCount = await homePage.getGameCount();
    const uiGameNames = await homePage.getGameNames();
    
    // Get API data
    const apiResponse = await apiClient.getGames();
    expect(apiResponse.status).toBe(200);
    
    // Compare UI and API data
    const comparison = apiClient.compareGameData(apiResponse.data, uiGameNames);
    expect(comparison.match).toBe(true);
    
    // Verify expected game count (adjust based on actual data)
    expect(uiGameCount).toBeGreaterThan(0);
  });

  test('should display all game images correctly', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    const images = await homePage.getGameImages();
    
    // Verify all games have images
    expect(images.length).toBeGreaterThan(0);
    
    // Verify all images have valid URLs
    for (const src of images) {
      expect(src).toBeTruthy();
      expect(src).toContain('http');
    }
  });

  test('should display game ratings within valid range', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    const ratings = await homePage.getGameRatings();
    
    // Verify all games have ratings
    expect(ratings.length).toBeGreaterThan(0);
    
    // Verify ratings are within valid range (0-10)
    for (const rating of ratings) {
      expect(rating).toBeGreaterThanOrEqual(0);
      expect(rating).toBeLessThanOrEqual(10);
    }
  });
}); 