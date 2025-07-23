import React, { act } from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock AuthContext
const MockAuthContext = React.createContext({
  user: null,
  loading: false,
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
  isAuthenticated: () => false,
  isAdmin: () => false,
  isOwner: () => false,
  hasRole: () => false
});

// Custom render function that includes providers
const AllTheProviders = ({ children }) => {
  return (
    <BrowserRouter>
      <MockAuthContext.Provider value={{
        user: null,
        loading: false,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        isAuthenticated: () => false,
        isAdmin: () => false,
        isOwner: () => false,
        hasRole: () => false
      }}>
        {children}
      </MockAuthContext.Provider>
    </BrowserRouter>
  );
};

const customRender = (ui, options) =>
  render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything except act (we'll use React's act)
export * from '@testing-library/react';

// Override render method and export React's act
export { customRender as render, act };

// Test data helpers
export const mockGame = {
  _id: '1',
  name: 'Super Mario Bros',
  genre: 'Platformer',
  platforms: ['NES'],
  releaseDate: '1985-09-13T00:00:00.000Z',
  hasMultiplayer: false,
  description: 'A classic platformer game',
  imageUrl: 'https://example.com/mario.jpg',
  rating: 9.5,
  createdBy: 'user123'
};

export const mockGames = [
  mockGame,
  {
    _id: '2',
    name: 'The Legend of Zelda',
    genre: 'Adventure',
    platforms: ['NES'],
    releaseDate: '1986-02-21T00:00:00.000Z',
    hasMultiplayer: false,
    description: 'An epic adventure game',
    imageUrl: 'https://example.com/zelda.jpg',
    rating: 9.8,
    createdBy: 'user123'
  },
  {
    _id: '3',
    name: 'Street Fighter II',
    genre: 'Fighting',
    platforms: ['SNES', 'Arcade'],
    releaseDate: '1991-02-06T00:00:00.000Z',
    hasMultiplayer: true,
    description: 'A classic fighting game',
    imageUrl: 'https://example.com/sf2.jpg',
    rating: 9.2,
    createdBy: 'user123'
  }
];

export const mockUser = {
  _id: 'user123',
  email: 'test@example.com',
  role: 'admin',
  isAdmin: () => true,
  isOwner: () => false
};

export const mockOwner = {
  _id: 'owner123',
  email: 'owner@example.com',
  role: 'owner',
  isAdmin: () => true,
  isOwner: () => true
};

export const mockGuest = {
  _id: 'guest123',
  email: 'guest@example.com',
  role: 'guest',
  isAdmin: () => false,
  isOwner: () => false
};

// Mock API responses
export const mockApiResponses = {
  games: {
    success: {
      games: mockGames,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalGames: 3,
        gamesPerPage: 12
      }
    },
    empty: {
      games: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalGames: 0,
        gamesPerPage: 12
      }
    }
  },
  game: {
    success: {
      game: mockGame
    }
  },
  auth: {
    login: {
      token: 'mock-jwt-token',
      user: mockUser
    },
    register: {
      token: 'mock-jwt-token',
      user: mockOwner
    }
  }
};

// Helper to create a mock function that returns a promise
export const createMockApiCall = (response, delay = 0) => {
  return jest.fn().mockImplementation(() => 
    new Promise(resolve => 
      setTimeout(() => resolve(response), delay)
    )
  );
};

// Helper to create a mock function that rejects
export const createMockApiError = (error, delay = 0) => {
  return jest.fn().mockImplementation(() => 
    new Promise((resolve, reject) => 
      setTimeout(() => reject(error), delay)
    )
  );
}; 