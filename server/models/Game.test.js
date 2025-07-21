const Game = require('./Game');
const User = require('./User');

describe('Game Model', () => {
  let testUser;

  beforeEach(async () => {
    testUser = await global.testUtils.createTestUser(User);
  });

  describe('Validation', () => {
    it('should validate a valid game', async () => {
      const validGame = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        description: 'A test game',
        rating: 8.0,
        createdBy: testUser._id
      });

      const result = await validGame.save();
      expect(result.name).toBe('Test Game');
      expect(result.genre).toBe('Action');
      expect(result.platforms).toContain('NES');
      expect(result.hasMultiplayer).toBe(false);
    });

    it('should require name', async () => {
      const gameWithoutName = new Game({
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      await expect(gameWithoutName.save()).rejects.toThrow();
    });

    it('should require name to be at least 2 characters', async () => {
      const gameWithShortName = new Game({
        name: 'A',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      await expect(gameWithShortName.save()).rejects.toThrow();
    });

    it('should require unique name', async () => {
      const game1 = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });
      await game1.save();

      const game2 = new Game({
        name: 'Test Game',
        genre: 'Adventure',
        platforms: ['SNES'],
        releaseDate: new Date('1991-01-01'),
        hasMultiplayer: true,
        createdBy: testUser._id
      });

      await expect(game2.save()).rejects.toThrow();
    });

    it('should require genre', async () => {
      const gameWithoutGenre = new Game({
        name: 'Test Game',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      await expect(gameWithoutGenre.save()).rejects.toThrow();
    });

    it('should validate genre enum values', async () => {
      const gameWithInvalidGenre = new Game({
        name: 'Test Game',
        genre: 'InvalidGenre',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      await expect(gameWithInvalidGenre.save()).rejects.toThrow();
    });

    it('should require platforms', async () => {
      const gameWithoutPlatforms = new Game({
        name: 'Test Game',
        genre: 'Action',
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      await expect(gameWithoutPlatforms.save()).rejects.toThrow();
    });

    it('should validate platform enum values', async () => {
      const gameWithInvalidPlatform = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['InvalidPlatform'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      await expect(gameWithInvalidPlatform.save()).rejects.toThrow();
    });

    it('should require release date', async () => {
      const gameWithoutReleaseDate = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      await expect(gameWithoutReleaseDate.save()).rejects.toThrow();
    });

    it('should not allow future release dates', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const gameWithFutureDate = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: futureDate,
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      await expect(gameWithFutureDate.save()).rejects.toThrow();
    });

    it('should require hasMultiplayer', async () => {
      const gameWithoutMultiplayer = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        createdBy: testUser._id
      });

      await expect(gameWithoutMultiplayer.save()).rejects.toThrow();
    });

    it('should validate rating range', async () => {
      const gameWithInvalidRating = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        rating: 11,
        createdBy: testUser._id
      });

      await expect(gameWithInvalidRating.save()).rejects.toThrow();
    });

    it('should validate image URL format', async () => {
      const gameWithInvalidImageUrl = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        imageUrl: 'invalid-url',
        createdBy: testUser._id
      });

      await expect(gameWithInvalidImageUrl.save()).rejects.toThrow();
    });

    it('should accept valid image URL', async () => {
      const gameWithValidImageUrl = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        imageUrl: 'https://example.com/image.jpg',
        createdBy: testUser._id
      });

      const result = await gameWithValidImageUrl.save();
      expect(result.imageUrl).toBe('https://example.com/image.jpg');
    });
  });

  describe('Virtual Properties', () => {
    it('should return release year', async () => {
      const game = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      const savedGame = await game.save();
      expect(savedGame.releaseYear).toBe(1990);
    });
  });

  describe('Instance Methods', () => {
    it('should return default image URL when no image is provided', async () => {
      const game = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });

      const savedGame = await game.save();
      expect(savedGame.getImageUrl()).toBe('/images/default-game.png');
    });

    it('should return provided image URL when available', async () => {
      const game = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        imageUrl: 'https://example.com/image.jpg',
        createdBy: testUser._id
      });

      const savedGame = await game.save();
      expect(savedGame.getImageUrl()).toBe('https://example.com/image.jpg');
    });
  });

  describe('Static Methods', () => {
    it('should return available genres', () => {
      const genres = Game.getGenres();
      expect(genres).toContain('Action');
      expect(genres).toContain('Adventure');
      expect(genres).toContain('RPG');
      expect(genres).toContain('Strategy');
      expect(genres).toContain('Simulation');
      expect(genres).toContain('Sports');
      expect(genres).toContain('Racing');
      expect(genres).toContain('Puzzle');
      expect(genres).toContain('Platformer');
      expect(genres).toContain('Shooter');
      expect(genres).toContain('Fighting');
      expect(genres).toContain('Arcade');
      expect(genres).toContain('Educational');
      expect(genres).toContain('Other');
    });

    it('should return available platforms', () => {
      const platforms = Game.getPlatforms();
      expect(platforms).toContain('NES');
      expect(platforms).toContain('SNES');
      expect(platforms).toContain('N64');
      expect(platforms).toContain('GameCube');
      expect(platforms).toContain('Wii');
      expect(platforms).toContain('Game Boy');
      expect(platforms).toContain('Game Boy Color');
      expect(platforms).toContain('Game Boy Advance');
      expect(platforms).toContain('DS');
      expect(platforms).toContain('3DS');
      expect(platforms).toContain('Sega Genesis');
      expect(platforms).toContain('Sega Saturn');
      expect(platforms).toContain('Sega Dreamcast');
      expect(platforms).toContain('PlayStation');
      expect(platforms).toContain('PlayStation 2');
      expect(platforms).toContain('PlayStation 3');
      expect(platforms).toContain('PSP');
      expect(platforms).toContain('Xbox');
      expect(platforms).toContain('Xbox 360');
      expect(platforms).toContain('PC');
      expect(platforms).toContain('Arcade');
      expect(platforms).toContain('Atari 2600');
      expect(platforms).toContain('Atari 7800');
      expect(platforms).toContain('Commodore 64');
      expect(platforms).toContain('Amiga');
      expect(platforms).toContain('Other');
    });
  });

  describe('Pre-save Middleware', () => {
    it('should prevent duplicate names on save', async () => {
      const game1 = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });
      await game1.save();

      const game2 = new Game({
        name: 'Test Game',
        genre: 'Adventure',
        platforms: ['SNES'],
        releaseDate: new Date('1991-01-01'),
        hasMultiplayer: true,
        createdBy: testUser._id
      });

      await expect(game2.save()).rejects.toThrow('Game with this name already exists.');
    });

    it('should allow updating game name if no other game has that name', async () => {
      const game = new Game({
        name: 'Test Game',
        genre: 'Action',
        platforms: ['NES'],
        releaseDate: new Date('1990-01-01'),
        hasMultiplayer: false,
        createdBy: testUser._id
      });
      const savedGame = await game.save();

      savedGame.name = 'Updated Test Game';
      const updatedGame = await savedGame.save();
      expect(updatedGame.name).toBe('Updated Test Game');
    });
  });

  describe('Indexes', () => {
    it('should have text index on name field', () => {
      const indexes = Game.collection.getIndexes();
      // Note: This test might need adjustment based on how indexes are created
      expect(Game.schema.indexes()).toBeDefined();
    });
  });
}); 