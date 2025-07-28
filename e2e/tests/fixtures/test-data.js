const testData = {
  // Edge case scenarios for testing
  edgeCases: {
    emptySearch: {
      term: '',
      expectedCount: 12 // All games should be shown
    },
    specialCharacters: {
      term: '!@#$%^&*()',
      expectedCount: 0
    },
    veryLongSearch: {
      term: 'a'.repeat(1000),
      expectedCount: 0
    },
    sqlInjection: {
      term: "'; DROP TABLE games; --",
      expectedCount: 0
    }
  }
};

module.exports = testData; 