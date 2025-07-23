import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '../test-utils';
import Home from './Home';

// Mock all dependencies
jest.mock('axios', () => ({
  get: jest.fn()
}));

jest.mock('react-hot-toast', () => ({
  error: jest.fn()
}));

jest.mock('../components/GameCard', () => {
  return function MockGameCard({ game }) {
    return <div data-testid={`game-card-${game._id}`}>{game.name}</div>;
  };
});

jest.mock('../components/FilterPanel', () => {
  return function MockFilterPanel() {
    return <div data-testid="filter-panel">Filter Panel</div>;
  };
});

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Search: () => <div data-testid="search-icon">Search</div>,
  Filter: () => <div data-testid="filter-icon">Filter</div>,
  Gamepad2: () => <div data-testid="gamepad-icon">Gamepad</div>
}));

import axios from 'axios';

describe('Home Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the main title and description', async () => {
    // Mock successful API response
    axios.get.mockResolvedValue({
      data: {
        games: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalGames: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });

    render(<Home />);
    
    await waitFor(() => {
      expect(screen.getByText('🎮 RETRO GAMES PORTAL 🎮')).toBeInTheDocument();
      expect(screen.getByText('Discover and explore classic video games from the golden age of gaming')).toBeInTheDocument();
    });
  });

  it('renders search input and filter button', async () => {
    // Mock successful API response
    axios.get.mockResolvedValue({
      data: {
        games: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalGames: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });

    render(<Home />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search games...')).toBeInTheDocument();
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    // Mock a delayed API response to show loading state
    axios.get.mockImplementation(() => new Promise(() => {}));

    render(<Home />);
    
    expect(screen.getByText('Loading games...')).toBeInTheDocument();
  });

  it('displays games when API returns data', async () => {
    const mockGames = [
      { _id: '1', name: 'Super Mario Bros' },
      { _id: '2', name: 'The Legend of Zelda' }
    ];

    axios.get.mockResolvedValue({
      data: {
        games: mockGames,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalGames: 2,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });

    render(<Home />);
    
    // Wait for games to appear
    await waitFor(() => {
      expect(screen.getByText('Super Mario Bros')).toBeInTheDocument();
      expect(screen.getByText('The Legend of Zelda')).toBeInTheDocument();
    });
  });

  it('shows "No Games Found" when API returns empty results', async () => {
    axios.get.mockResolvedValue({
      data: {
        games: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalGames: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });

    render(<Home />);
    
    await waitFor(() => {
      expect(screen.getByText('No Games Found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search or filters to find more games.')).toBeInTheDocument();
    });
  });

  it('displays results count when games are loaded', async () => {
    const mockGames = [
      { _id: '1', name: 'Super Mario Bros' },
      { _id: '2', name: 'The Legend of Zelda' }
    ];

    axios.get.mockResolvedValue({
      data: {
        games: mockGames,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalGames: 2,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });

    render(<Home />);
    
    await waitFor(() => {
      expect(screen.getByText('Showing 2 of 2 games')).toBeInTheDocument();
    });
  });

  it('shows pagination when there are multiple pages', async () => {
    const mockGames = [{ _id: '1', name: 'Super Mario Bros' }];

    axios.get.mockResolvedValue({
      data: {
        games: mockGames,
        pagination: {
          currentPage: 1,
          totalPages: 3,
          totalGames: 30,
          hasNextPage: true,
          hasPrevPage: false
        }
      }
    });

    render(<Home />);
    
    await waitFor(() => {
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });
  });

  it('handles search input changes and displays "No Games Found"', async () => {
    // Mock initial API response with games
    axios.get.mockResolvedValueOnce({
      data: {
        games: [{ _id: '1', name: 'Super Mario Bros' }],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalGames: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });

    render(<Home />);
    
    // Wait for initial games to load
    await waitFor(() => {
      expect(screen.getByText('Super Mario Bros')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search games...');
    
    // Mock API response for search that returns no results
    axios.get.mockResolvedValueOnce({
      data: {
        games: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalGames: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });

    // Type in search input to trigger search
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
    });

    // Wait for "No Games Found" to appear
    await waitFor(() => {
      expect(screen.getByText('No Games Found')).toBeInTheDocument();
    });

    // Verify search input still exists and has the value
    expect(searchInput).toBeInTheDocument();
    expect(searchInput.value).toBe('nonexistent');
  });

  it('allows typing in search input and maintains value', async () => {
    // Mock API response
    axios.get.mockResolvedValue({
      data: {
        games: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalGames: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      }
    });

    render(<Home />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('No Games Found')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText('Search games...');
    
    // Type multiple characters
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'abc' } });
    });

    // Verify input has correct value
    expect(searchInput.value).toBe('abc');
  });
}); 