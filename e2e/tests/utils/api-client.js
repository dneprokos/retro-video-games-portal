class ApiClient {
  constructor(request) {
    this.request = request;
    this.baseURL = 'http://localhost:5000/api';
  }

  async getGames(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${this.baseURL}/games${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.request.get(url);
    return {
      status: response.status(),
      data: await response.json()
    };
  }

  async getGameById(id) {
    const response = await this.request.get(`${this.baseURL}/games/${id}`);
    return {
      status: response.status(),
      data: await response.json()
    };
  }

  async searchGames(query) {
    const response = await this.request.get(`${this.baseURL}/games?search=${encodeURIComponent(query)}`);
    return {
      status: response.status(),
      data: await response.json()
    };
  }

  async getGamesByGenre(genre) {
    const response = await this.request.get(`${this.baseURL}/games?genre=${encodeURIComponent(genre)}`);
    return {
      status: response.status(),
      data: await response.json()
    };
  }

  async getGamesByPlatform(platform) {
    // Note: Platform filter is not implemented in the current API
    // This would need to be implemented when platform filtering is added
    const response = await this.request.get(`${this.baseURL}/games`);
    return {
      status: response.status(),
      data: await response.json()
    };
  }



  async getHealth() {
    const response = await this.request.get(`${this.baseURL}/health`);
    return {
      status: response.status(),
      data: await response.json()
    };
  }

  // Helper method to compare API and UI data
  compareGameData(apiResponse, uiGames) {
    const apiGames = apiResponse.games || apiResponse;
    if (apiGames.length !== uiGames.length) {
      return {
        match: false,
        reason: `Count mismatch: API has ${apiGames.length}, UI has ${uiGames.length}`
      };
    }

    const apiNames = apiGames.map(game => game.name).sort();
    const uiNames = uiGames.sort();

    for (let i = 0; i < apiNames.length; i++) {
      if (apiNames[i] !== uiNames[i]) {
        return {
          match: false,
          reason: `Name mismatch at index ${i}: API="${apiNames[i]}", UI="${uiNames[i]}"`
        };
      }
    }

    return { match: true };
  }

  // Helper method to validate game data structure
  validateGameStructure(game) {
    const requiredFields = ['name', 'genre', 'platforms', 'releaseDate', 'hasMultiplayer'];
    const missingFields = requiredFields.filter(field => !(field in game));
    
    if (missingFields.length > 0) {
      return {
        valid: false,
        missingFields
      };
    }

    return { valid: true };
  }
}

module.exports = ApiClient; 