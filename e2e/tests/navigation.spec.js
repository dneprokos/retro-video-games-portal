const { test, expect } = require('@playwright/test');
const HomePage = require('./pages/HomePage');

test.describe('Navigation and User Flow', () => {
  let homePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
  });

  test('should load home page correctly', async ({ page }) => {
    // Start at home page
    await homePage.load();
    expect(await page.title()).toContain('Retro Games Portal');
    
    // Verify home page elements are visible
    // Filter panel should be hidden by default
    expect(await homePage.isFilterPanelVisible()).toBe(false);
    expect(await homePage.getGameCount()).toBeGreaterThan(0);
  });

  test('should clear filters and restore all games', async ({ page }) => {
    await homePage.load();
    await homePage.waitForGamesToLoad();
    
    const initialCount = await homePage.getGameCount();
    
    // Apply a filter
    await homePage.filterByGenre('Action');
    const filteredCount = await homePage.getGameCount();
    expect(filteredCount).toBeLessThan(initialCount);
    
    // Clear filters
    await homePage.clearAllFilters();
    const restoredCount = await homePage.getGameCount();
    expect(restoredCount).toBe(initialCount);
  });
}); 