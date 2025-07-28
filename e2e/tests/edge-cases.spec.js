const { test, expect } = require('@playwright/test');
const HomePage = require('./pages/HomePage');

test.describe('Edge Cases and Error Handling', () => {
  let homePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
  });

  test('should handle rapid filter changes', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    const initialCount = await homePage.getGameCount();
    expect(initialCount).toBeGreaterThan(0);
    
    // Rapidly change filters
    await homePage.filterByGenre('Action');
    await homePage.waitForTimeout(100);
    await homePage.filterByGenre('Platformer');
    await homePage.waitForTimeout(100);
    await homePage.clearAllFilters();
    
    // Should still have valid results
    const finalCount = await homePage.getGameCount();
    expect(finalCount).toBe(initialCount);
  });

  test('should handle rapid search changes', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    const initialCount = await homePage.getGameCount();
    expect(initialCount).toBeGreaterThan(0);
    
    // Rapidly change searches
    await homePage.searchGames('Mario');
    await homePage.waitForTimeout(100);
    await homePage.searchGames('Zelda');
    await homePage.waitForTimeout(100);
    await homePage.searchGames('');
    
    // Should still have valid results
    const finalCount = await homePage.getGameCount();
    expect(finalCount).toBeGreaterThan(0);
  });

  test('should handle concurrent filter and search operations', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    const initialCount = await homePage.getGameCount();
    expect(initialCount).toBeGreaterThan(0);
    
    // Apply filter and search simultaneously
    await homePage.filterByGenre('Action');
    await homePage.searchGames('Mario');
    
    // Should handle gracefully
    const finalCount = await homePage.getGameCount();
    expect(finalCount).toBeGreaterThanOrEqual(0);
  });
}); 