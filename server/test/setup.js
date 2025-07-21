const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Setup MongoDB Memory Server
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Disconnect any existing connections
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  await mongoose.connect(mongoUri);
  
  // Set JWT_SECRET for testing
  process.env.JWT_SECRET = 'test-secret-key';
});

// Clean up after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
});

// Clean up after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Global test utilities
global.testUtils = {
  // Helper to create a test user
  createTestUser: async (User, userData = {}) => {
    const defaultUser = {
      email: 'test@example.com',
      password: 'password123',
      role: 'admin'
    };
    return await User.create({ ...defaultUser, ...userData });
  },

  // Helper to create a test game
  createTestGame: async (Game, gameData = {}) => {
    const defaultGame = {
      name: 'Test Game',
      genre: 'Action',
      platforms: ['NES'],
      releaseDate: new Date('1990-01-01'),
      hasMultiplayer: false,
      description: 'A test game for testing purposes',
      rating: 8.0
    };
    return await Game.create({ ...defaultGame, ...gameData });
  },

  // Helper to generate JWT token
  generateToken: (userId) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret-key', { expiresIn: '1h' });
  }
}; 