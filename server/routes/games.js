const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Game = require('../models/Game');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /games:
 *   get:
 *     summary: Get all games with search and filters
 *     tags: [Games]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by game name
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *         description: Filter by genre
 *       - in: query
 *         name: yearFrom
 *         schema:
 *           type: integer
 *         description: Filter by release year (from)
 *       - in: query
 *         name: yearTo
 *         schema:
 *           type: integer
 *         description: Filter by release year (to)
 *       - in: query
 *         name: multiplayer
 *         schema:
 *           type: boolean
 *         description: Filter by multiplayer support
 *     responses:
 *       200:
 *         description: List of games
 */
// @route   GET /api/games
// @desc    Get all games with search and filters
// @access  Public
router.get('/', [
  query('search').optional().isString(),
  query('genre').optional().isString(),
  query('yearFrom').optional().custom((value) => {
    if (value === '' || value === undefined) return true;
    const year = parseInt(value);
    return !isNaN(year) && year >= 1970 && year <= new Date().getFullYear();
  }).withMessage('Year must be between 1970 and current year'),
  query('yearTo').optional().custom((value) => {
    if (value === '' || value === undefined) return true;
    const year = parseInt(value);
    return !isNaN(year) && year >= 1970 && year <= new Date().getFullYear();
  }).withMessage('Year must be between 1970 and current year'),
  query('multiplayer').optional().custom((value) => {
    if (value === '' || value === undefined) return true;
    return value === 'true' || value === 'false';
  }).withMessage('Multiplayer must be true or false'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: errors.array() 
      });
    }

    const {
      search,
      genre,
      yearFrom,
      yearTo,
      multiplayer,
      page = 1,
      limit = 12
    } = req.query;

    // Build filter object
    const filter = {};

    // Search by name
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    // Filter by genre
    if (genre) {
      filter.genre = genre;
    }

    // Filter by release year range
    if (yearFrom || yearTo) {
      filter.releaseDate = {};
      if (yearFrom) {
        filter.releaseDate.$gte = new Date(yearFrom, 0, 1);
      }
      if (yearTo) {
        filter.releaseDate.$lte = new Date(yearTo, 11, 31);
      }
    }

    // Filter by multiplayer
    if (multiplayer !== undefined && multiplayer !== '') {
      filter.hasMultiplayer = multiplayer === 'true';
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const games = await Game.find(filter)
      .sort({ name: 1 }) // Sort alphabetically by name (1 = ascending)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'email');

    // Get total count for pagination
    const total = await Game.countDocuments(filter);

    res.json({
      games,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalGames: total,
        hasNextPage: skip + games.length < total,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /games/{id}:
 *   get:
 *     summary: Get a single game by ID
 *     tags: [Games]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The game ID
 *     responses:
 *       200:
 *         description: Game details
 *       404:
 *         description: Game not found
 */
// @route   GET /api/games/:id
// @desc    Get single game by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id)
      .populate('createdBy', 'email')
      .populate('updatedBy', 'email');

    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    res.json({ game });
  } catch (error) {
    console.error('Get game error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Game not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /games:
 *   post:
 *     summary: Create a new game
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               genre:
 *                 type: string
 *               platforms:
 *                 type: array
 *                 items:
 *                   type: string
 *               releaseDate:
 *                 type: string
 *                 format: date
 *               hasMultiplayer:
 *                 type: boolean
 *               description:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *               rating:
 *                 type: number
 *     responses:
 *       201:
 *         description: Game created
 *       400:
 *         description: Validation error
 */
// @route   POST /api/games
// @desc    Create new game
// @access  Private (Admin/Owner)
router.post('/', [
  authenticateToken,
  requireAdmin,
  body('name').isLength({ min: 2 }).withMessage('Game name must be at least 2 characters long'),
  body('genre').isIn(Game.getGenres()).withMessage('Invalid genre'),
  body('platforms').isArray({ min: 1 }).withMessage('At least one platform must be selected'),
  body('platforms.*').isIn(Game.getPlatforms()).withMessage('Invalid platform'),
  body('releaseDate').isISO8601().withMessage('Invalid release date'),
  body('hasMultiplayer').isBoolean().withMessage('Multiplayer must be true or false'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('imageUrl').optional().custom((value) => {
    if (!value || value.trim() === '') return true; // Allow empty or whitespace-only values
    // Check if it's a valid URL or contains wikimedia/wikipedia
    const urlPattern = /^https?:\/\/.+/i;
    return urlPattern.test(value) || value.includes('wikimedia.org') || value.includes('wikipedia.org');
  }).withMessage('Invalid image URL'),
  body('rating').optional().isFloat({ min: 0, max: 10 }).withMessage('Rating must be between 0 and 10')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: errors.array() 
      });
    }

    const {
      name,
      genre,
      platforms,
      releaseDate,
      hasMultiplayer,
      description,
      imageUrl,
      rating
    } = req.body;

    // Check if release date is in the future
    if (new Date(releaseDate) > new Date()) {
      return res.status(400).json({ message: 'Release date cannot be in the future.' });
    }

    // Check if game name already exists
    const existingGame = await Game.findOne({ name });
    if (existingGame) {
      return res.status(400).json({ message: 'Game with this name already exists.' });
    }

    // Create new game
    const game = new Game({
      name,
      genre,
      platforms,
      releaseDate,
      hasMultiplayer,
      description,
      imageUrl,
      rating,
      createdBy: req.user._id
    });

    await game.save();

    res.status(201).json({
      message: 'Game created successfully',
      game
    });
  } catch (error) {
    console.error('Create game error:', error);
    if (error.message === 'Game with this name already exists.') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /games/{id}:
 *   put:
 *     summary: Update a game
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The game ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Game updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Game not found
 */
// @route   PUT /api/games/:id
// @desc    Update game
// @access  Private (Admin/Owner)
router.put('/:id', [
  authenticateToken,
  requireAdmin,
  body('name').optional().isLength({ min: 2 }).withMessage('Game name must be at least 2 characters long'),
  body('genre').optional().isIn(Game.getGenres()).withMessage('Invalid genre'),
  body('platforms').optional().isArray({ min: 1 }).withMessage('At least one platform must be selected'),
  body('platforms.*').optional().isIn(Game.getPlatforms()).withMessage('Invalid platform'),
  body('releaseDate').optional().isISO8601().withMessage('Invalid release date'),
  body('hasMultiplayer').optional().isBoolean().withMessage('Multiplayer must be true or false'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('imageUrl').optional().custom((value) => {
    if (!value || value.trim() === '') return true; // Allow empty or whitespace-only values
    // Check if it's a valid URL or contains wikimedia/wikipedia
    const urlPattern = /^https?:\/\/.+/i;
    return urlPattern.test(value) || value.includes('wikimedia.org') || value.includes('wikipedia.org');
  }).withMessage('Invalid image URL'),
  body('rating').optional().isFloat({ min: 0, max: 10 }).withMessage('Rating must be between 0 and 10')
], async (req, res) => {
  try {
    console.log('DEBUG: Update request for game ID:', req.params.id);
    console.log('DEBUG: Request body:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('DEBUG: Validation errors:', errors.array());
      return res.status(400).json({ 
        message: 'Validation error',
        errors: errors.array() 
      });
    }

    const game = await Game.findById(req.params.id);
    if (!game) {
      console.log('DEBUG: Game not found with ID:', req.params.id);
      return res.status(404).json({ message: 'Game not found' });
    }
    
    console.log('DEBUG: Found game to update:', game.name);

    // Check if release date is in the future
    if (req.body.releaseDate && new Date(req.body.releaseDate) > new Date()) {
      return res.status(400).json({ message: 'Release date cannot be in the future.' });
    }

    // Update game
    console.log('DEBUG: Updating game with data:', req.body);
    Object.assign(game, req.body);
    game.updatedBy = req.user._id;
    console.log('DEBUG: About to save game:', game.name);
    await game.save();
    console.log('DEBUG: Game saved successfully');

    res.json({
      message: 'Game updated successfully',
      game
    });
  } catch (error) {
    console.error('Update game error:', error);
    if (error.message === 'Game with this name already exists.') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /games/{id}:
 *   delete:
 *     summary: Delete a game
 *     tags: [Games]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The game ID
 *     responses:
 *       200:
 *         description: Game deleted
 *       404:
 *         description: Game not found
 */
// @route   DELETE /api/games/:id
// @desc    Delete game
// @access  Private (Admin/Owner)
router.delete('/:id', [authenticateToken, requireAdmin], async (req, res) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }

    await Game.findByIdAndDelete(req.params.id);

    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Delete game error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /games/filters/options:
 *   get:
 *     summary: Get filter options (genres, platforms, year range)
 *     tags: [Games]
 *     responses:
 *       200:
 *         description: Filter options
 */
// @route   GET /api/games/filters/options
// @desc    Get filter options (genres, platforms, year range)
// @access  Public
router.get('/filters/options', async (req, res) => {
  try {
    const genres = Game.getGenres();
    const platforms = Game.getPlatforms(); // Always return all possible platforms
    
    // Get year range from existing games
    const yearStats = await Game.aggregate([
      {
        $group: {
          _id: null,
          minYear: { $min: { $year: '$releaseDate' } },
          maxYear: { $max: { $year: '$releaseDate' } }
        }
      }
    ]);

    const yearRange = yearStats.length > 0 ? {
      min: yearStats[0].minYear,
      max: yearStats[0].maxYear
    } : { min: 1970, max: new Date().getFullYear() };

    res.json({
      genres,
      platforms, // Ensure platforms is always included
      yearRange
    });
  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 