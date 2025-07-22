import { rest } from 'msw';
import { mockGames, mockGame, mockUser, mockOwner } from '../test-utils';

// Base URL for API
const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const handlers = [
  // Games API
  rest.get(`${baseURL}/api/games`, (req, res, ctx) => {
    const search = req.url.searchParams.get('search');
    const genre = req.url.searchParams.get('genre');
    const yearFrom = req.url.searchParams.get('yearFrom');
    const yearTo = req.url.searchParams.get('yearTo');
    const multiplayer = req.url.searchParams.get('multiplayer');
    const page = parseInt(req.url.searchParams.get('page')) || 1;
    const limit = parseInt(req.url.searchParams.get('limit')) || 12;

    let filteredGames = [...mockGames];

    // Apply filters
    if (search) {
      filteredGames = filteredGames.filter(game =>
        game.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (genre) {
      filteredGames = filteredGames.filter(game => game.genre === genre);
    }

    if (yearFrom) {
      const yearFromNum = parseInt(yearFrom);
      filteredGames = filteredGames.filter(game =>
        new Date(game.releaseDate).getFullYear() >= yearFromNum
      );
    }

    if (yearTo) {
      const yearToNum = parseInt(yearTo);
      filteredGames = filteredGames.filter(game =>
        new Date(game.releaseDate).getFullYear() <= yearToNum
      );
    }

    if (multiplayer !== null && multiplayer !== '') {
      const isMultiplayer = multiplayer === 'true';
      filteredGames = filteredGames.filter(game => game.hasMultiplayer === isMultiplayer);
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedGames = filteredGames.slice(startIndex, endIndex);

    return res(
      ctx.status(200),
      ctx.json({
        games: paginatedGames,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(filteredGames.length / limit),
          totalGames: filteredGames.length,
          gamesPerPage: limit
        }
      })
    );
  }),

  rest.get(`${baseURL}/api/games/:id`, (req, res, ctx) => {
    const { id } = req.params;
    const game = mockGames.find(g => g._id === id);

    if (!game) {
      return res(
        ctx.status(404),
        ctx.json({ message: 'Game not found' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({ game })
    );
  }),

  rest.post(`${baseURL}/api/games`, (req, res, ctx) => {
    const gameData = req.body;
    
    // Check for duplicate name
    const existingGame = mockGames.find(g => g.name === gameData.name);
    if (existingGame) {
      return res(
        ctx.status(400),
        ctx.json({ message: 'Game with this name already exists' })
      );
    }

    const newGame = {
      _id: Date.now().toString(),
      ...gameData,
      createdBy: mockUser._id,
      createdAt: new Date().toISOString()
    };

    return res(
      ctx.status(201),
      ctx.json({ game: newGame })
    );
  }),

  rest.put(`${baseURL}/api/games/:id`, (req, res, ctx) => {
    const { id } = req.params;
    const updateData = req.body;

    const gameIndex = mockGames.findIndex(g => g._id === id);
    if (gameIndex === -1) {
      return res(
        ctx.status(404),
        ctx.json({ message: 'Game not found' })
      );
    }

    // Check for duplicate name (excluding current game)
    const existingGame = mockGames.find(g => g.name === updateData.name && g._id !== id);
    if (existingGame) {
      return res(
        ctx.status(400),
        ctx.json({ message: 'Game with this name already exists' })
      );
    }

    const updatedGame = {
      ...mockGames[gameIndex],
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    return res(
      ctx.status(200),
      ctx.json({ game: updatedGame })
    );
  }),

  rest.delete(`${baseURL}/api/games/:id`, (req, res, ctx) => {
    const { id } = req.params;
    const gameIndex = mockGames.findIndex(g => g._id === id);

    if (gameIndex === -1) {
      return res(
        ctx.status(404),
        ctx.json({ message: 'Game not found' })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({ message: 'Game deleted successfully' })
    );
  }),

  rest.get(`${baseURL}/api/games/filters/options`, (req, res, ctx) => {
    const genres = [...new Set(mockGames.map(game => game.genre))];
    const platforms = [...new Set(mockGames.flatMap(game => game.platforms))];
    const years = mockGames.map(game => new Date(game.releaseDate).getFullYear());

    return res(
      ctx.status(200),
      ctx.json({
        genres,
        platforms,
        yearRange: {
          min: Math.min(...years),
          max: Math.max(...years)
        }
      })
    );
  }),

  // Authentication API
  rest.post(`${baseURL}/api/auth/login`, (req, res, ctx) => {
    const { email, password } = req.body;

    // Mock authentication logic
    if (email === 'admin@test.com' && password === 'password123') {
      return res(
        ctx.status(200),
        ctx.json({
          token: 'mock-jwt-token-admin',
          user: mockUser
        })
      );
    }

    if (email === 'owner@test.com' && password === 'password123') {
      return res(
        ctx.status(200),
        ctx.json({
          token: 'mock-jwt-token-owner',
          user: mockOwner
        })
      );
    }

    return res(
      ctx.status(401),
      ctx.json({ message: 'Invalid credentials' })
    );
  }),

  rest.post(`${baseURL}/api/auth/register`, (req, res, ctx) => {
    const { email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res(
        ctx.status(400),
        ctx.json({ message: 'Passwords must match' })
      );
    }

    if (password.length < 6) {
      return res(
        ctx.status(400),
        ctx.json({ message: 'Password must be at least 6 characters' })
      );
    }

    // Mock owner registration
    return res(
      ctx.status(201),
      ctx.json({
        token: 'mock-jwt-token-owner',
        user: mockOwner
      })
    );
  }),

  rest.get(`${baseURL}/api/auth/me`, (req, res, ctx) => {
    // Mock getting current user (would normally check JWT token)
    return res(
      ctx.status(200),
      ctx.json({ user: mockUser })
    );
  }),

  // Admin API
  rest.get(`${baseURL}/api/admin/users`, (req, res, ctx) => {
    const adminUsers = [
      { _id: '1', email: 'admin1@test.com', role: 'admin', createdAt: '2024-01-01' },
      { _id: '2', email: 'admin2@test.com', role: 'admin', createdAt: '2024-01-02' }
    ];

    return res(
      ctx.status(200),
      ctx.json({ users: adminUsers })
    );
  }),

  rest.post(`${baseURL}/api/admin/users`, (req, res, ctx) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res(
        ctx.status(400),
        ctx.json({ message: 'Email and password are required' })
      );
    }

    if (password.length < 6) {
      return res(
        ctx.status(400),
        ctx.json({ message: 'Password must be at least 6 characters' })
      );
    }

    const newAdmin = {
      _id: Date.now().toString(),
      email,
      role: 'admin',
      createdAt: new Date().toISOString()
    };

    return res(
      ctx.status(201),
      ctx.json({ user: newAdmin })
    );
  }),

  rest.delete(`${baseURL}/api/admin/users/:id`, (req, res, ctx) => {
    const { id } = req.params;

    return res(
      ctx.status(200),
      ctx.json({ message: 'Admin user deleted successfully' })
    );
  }),

  rest.get(`${baseURL}/api/admin/stats`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        totalGames: mockGames.length,
        totalUsers: 5,
        totalAdmins: 3
      })
    );
  })
]; 