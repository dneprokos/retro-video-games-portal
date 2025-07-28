const BasePage = require('./BasePage');

class HomePage extends BasePage {
  constructor(page) {
    super(page);
    
    // Selectors using data-testid attributes for better reliability
    this.selectors = {
      gameCard: '[data-testid="game-card"]',
      gameName: '[data-testid="game-name"]',
      gameRating: '[data-testid="game-rating"] span',
      gameImage: '[data-testid="game-card"] img',
      filterPanel: '[data-testid="filter-panel"]',
      filterPanelContent: '[data-testid="filter-panel-content"]',
      genreFilter: '[data-testid="genre-filter"]',
      platformFilter: 'select[value*="platform"]',
      searchInput: '[data-testid="search-input"]',
      clearFilters: '[data-testid="clear-filters"]',
      noResults: '[data-testid="no-results"]',
      loadingSpinner: '[data-testid="loading-spinner"]',
      loadingScreen: '[data-testid="loading-screen"]',
      errorMessage: '.text-red-400',
      filterToggle: '[data-testid="filter-toggle"]',
      applyFilters: '[data-testid="apply-filters"]',
      gamesGrid: '[data-testid="games-grid"]',
      resultsCount: 'div:has-text("Showing")',
      pagination: 'button:has-text("Previous"), button:has-text("Next")'
    };
  }

  async load() {
    await this.goto('/');
    await this.waitForPageLoad();
  }

  async getGameCards() {
    return await this.page.locator(this.selectors.gameCard);
  }

  async getGameNames() {
    const gameCards = await this.getGameCards();
    const names = [];
    for (let i = 0; i < await gameCards.count(); i++) {
      const name = await gameCards.nth(i).locator(this.selectors.gameName).textContent();
      names.push(name);
    }
    return names;
  }

  async getGameRatings() {
    const gameCards = await this.getGameCards();
    const ratings = [];
    for (let i = 0; i < await gameCards.count(); i++) {
      const rating = await gameCards.nth(i).locator(this.selectors.gameRating).textContent();
      ratings.push(parseFloat(rating));
    }
    return ratings;
  }

  async filterByGenre(genre) {
    // First, make sure filter panel is visible
    await this.toggleFilterPanel();
    // Wait a bit for the panel to fully render
    await this.waitForTimeout(500);
    
    // Wait for the genre filter to be visible
    await this.waitForElement(this.selectors.genreFilter);
    // Select the genre from the dropdown
    await this.page.selectOption(this.selectors.genreFilter, genre);
    
    // Wait for the apply filters button to be visible
    await this.waitForElement(this.selectors.applyFilters);
    // Apply the filter
    await this.clickElement(this.selectors.applyFilters);
    
    // Wait for the filter to be applied
    await this.waitForTimeout(2000);
  }

  async filterByPlatform(platform) {
    // Note: The current FilterPanel doesn't have platform filter, only genre, year, and multiplayer
    // This method would need to be implemented when platform filter is added
    console.log('Platform filter not yet implemented in the UI');
    await this.waitForTimeout(1000);
  }

  async toggleFilterPanel() {
    // Check if filter panel is already visible
    const isVisible = await this.isElementVisible(this.selectors.filterPanel);
    
    if (!isVisible) {
      // Click the toggle button to open the panel
      await this.clickElement(this.selectors.filterToggle);
      // Wait for the filter panel to be visible
      await this.waitForElement(this.selectors.filterPanel);
      await this.waitForTimeout(500);
    }
  }

  async searchGames(searchTerm) {
    await this.fillInput(this.selectors.searchInput, searchTerm);
    await this.waitForTimeout(1000);
  }

  async clearAllFilters() {
    // First, make sure filter panel is visible
    await this.toggleFilterPanel();
    // Wait a bit for the panel to fully render
    await this.waitForTimeout(500);
    
    // Wait for the clear filters button to be visible
    await this.waitForElement(this.selectors.clearFilters);
    await this.clickElement(this.selectors.clearFilters);
    
    // Wait for the filter change to take effect
    await this.waitForTimeout(2000);
  }

  async clickFirstGame() {
    await this.clickElement(`${this.selectors.gameCard}:first-child`);
  }

  async getGameCount() {
    return await this.getElementCount(this.selectors.gameCard);
  }

  async isNoResultsVisible() {
    return await this.isElementVisible(this.selectors.noResults);
  }

  async isFilterPanelVisible() {
    return await this.isElementVisible(this.selectors.filterPanel);
  }

  async isErrorVisible() {
    return await this.isElementVisible(this.selectors.errorMessage);
  }

  async getErrorText() {
    return await this.getText(this.selectors.errorMessage);
  }

  async waitForGamesToLoad() {
    // Wait for either games to load or no results message
    try {
      await this.page.waitForSelector(`${this.selectors.gamesGrid}, ${this.selectors.noResults}`, { timeout: 10000 });
    } catch (error) {
      // If timeout, check if loading screen is still visible
      const isLoadingVisible = await this.isElementVisible(this.selectors.loadingScreen);
      if (isLoadingVisible) {
        throw new Error('Games failed to load - loading screen still visible');
      }
      throw error;
    }
  }

  async getGameImages() {
    const images = await this.page.locator(this.selectors.gameImage);
    const srcs = [];
    for (let i = 0; i < await images.count(); i++) {
      const src = await images.nth(i).getAttribute('src');
      srcs.push(src);
    }
    return srcs;
  }
}

module.exports = HomePage; 