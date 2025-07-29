const { test, expect } = require('@playwright/test');
const HomePage = require('./pages/HomePage');
const ApiClient = require('./utils/api-client');

test.describe('Game Card Functionality', () => {
  let homePage, apiClient;

  test.beforeEach(async ({ page, request }) => {
    homePage = new HomePage(page);
    apiClient = new ApiClient(request);
  });

  test('should navigate to game details page and verify data', async ({ page }) => {
    // Get a game from API to use for navigation (data-independent)
    const gamesResponse = await apiClient.getGames({ limit: 1 });
    expect(gamesResponse.status).toBe(200);
    expect(gamesResponse.data.games).toBeDefined();
    expect(gamesResponse.data.games.length).toBeGreaterThan(0);
    
    const game = gamesResponse.data.games[0];
    const gameId = game._id;
    const gameName = game.name;
    
    expect(gameId).toBeDefined();
    expect(gameName).toBeDefined();
    
    // Navigate directly to the game details page
    await page.goto(`http://localhost:9000/game/${gameId}`);
    
    // Wait for the page to load - use a more reliable approach
    await page.waitForSelector('[data-testid="game-name"]', { timeout: 10000 });
    
    // Verify page title (currently static, not dynamic)
    await expect(page).toHaveTitle('Retro Games Portal');
    
    // Get the game data from the API for comparison
    const gameResponse = await apiClient.getGameById(gameId);
    expect(gameResponse.status).toBe(200);
    expect(gameResponse.data).toBeDefined();
    
    const apiGame = gameResponse.data;
    
    // Verify key game information is displayed correctly
    // Game name
    const displayedName = await page.locator('[data-testid="game-name"]').textContent();
    expect(displayedName).toBe(gameName);
    
    // Game genre
    if (apiGame.genre) {
      const displayedGenre = await page.locator('[data-testid="game-genre"]').textContent();
      expect(displayedGenre).toContain(apiGame.genre);
    }
    
    // Game platforms
    if (apiGame.platforms && apiGame.platforms.length > 0) {
      const displayedPlatforms = await page.locator('[data-testid="game-platforms"]').textContent();
      apiGame.platforms.forEach(platform => {
        expect(displayedPlatforms).toContain(platform);
      });
    }
    
    // Game rating (if exists)
    if (apiGame.rating) {
      const displayedRating = await page.locator('[data-testid="game-rating"]').textContent();
      expect(displayedRating).toContain(apiGame.rating.toString());
    }
    
    // Game description (if exists)
    if (apiGame.description) {
      const displayedDescription = await page.locator('[data-testid="game-description"]').textContent();
      expect(displayedDescription).toContain(apiGame.description);
    }
    
    // Game image (if exists)
    if (apiGame.imageUrl) {
      const gameImage = await page.locator('[data-testid="game-image"]');
      await expect(gameImage).toBeVisible();
      const imageSrc = await gameImage.getAttribute('src');
      expect(imageSrc).toBe(apiGame.imageUrl);
    }
    
    // Verify release date (if exists)
    if (apiGame.releaseDate) {
      const displayedReleaseDate = await page.locator('[data-testid="game-release-date"]').textContent();
      const releaseYear = new Date(apiGame.releaseDate).getFullYear().toString();
      expect(displayedReleaseDate).toContain(releaseYear);
    }
    
    // Verify multiplayer information (if exists)
    if (apiGame.hasMultiplayer !== undefined) {
      const displayedMultiplayer = await page.locator('[data-testid="game-multiplayer"]').textContent();
      const expectedMultiplayerText = apiGame.hasMultiplayer ? 'Multiplayer' : 'Single Player';
      expect(displayedMultiplayer).toContain(expectedMultiplayerText);
    }
  });

  test('should handle invalid game ID gracefully', async ({ page }) => {
    // Navigate to a non-existent game ID
    const invalidGameId = 'invalid-game-id-12345';
    await page.goto(`http://localhost:9000/game/${invalidGameId}`);
    
    // Wait for the page to load - use a more reliable approach
    await page.waitForSelector('[data-testid="error-message"]', { timeout: 10000 });
    
    // Verify error message is displayed
    const errorMessage = await page.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    
    const errorText = await errorMessage.textContent();
    expect(errorText).toContain('Game Not Found');
  });

  test('should navigate back to home page from game details', async ({ page }) => {
    // Get a game from API
    const gamesResponse = await apiClient.getGames({ limit: 1 });
    expect(gamesResponse.status).toBe(200);
    expect(gamesResponse.data.games).toBeDefined();
    expect(gamesResponse.data.games.length).toBeGreaterThan(0);
    
    const gameId = gamesResponse.data.games[0]._id;
    
    // Navigate to game details page
    await page.goto(`http://localhost:9000/game/${gameId}`);
    await page.waitForSelector('[data-testid="game-name"]', { timeout: 10000 });
    
    // Click back to home button (if exists)
    const backButton = await page.locator('[data-testid="back-to-home"]');
    if (await backButton.isVisible()) {
      await backButton.click();
      
      // Verify we're back on the home page
      await expect(page).toHaveURL('http://localhost:9000/');
      await expect(page).toHaveTitle('Retro Games Portal');
    }
  });
}); 