import React from 'react';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import FilterPanel from './FilterPanel';

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn()
}));

import axios from 'axios';

describe('FilterPanel', () => {
  const mockFilters = {
    search: '',
    genre: '',
    yearFrom: '',
    yearTo: '',
    multiplayer: ''
  };

  const mockOnFilterChange = jest.fn();

  const mockFilterOptions = {
    genres: ['Action', 'Adventure', 'RPG', 'Strategy'],
    platforms: ['NES', 'SNES', 'PlayStation'],
    yearRange: { min: 2020, max: 2024 }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue({ data: mockFilterOptions });
  });

  it('renders filter panel with all filter options', async () => {
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} />);

    // Check if filter labels are displayed
    expect(screen.getByText('Genre')).toBeInTheDocument();
    expect(screen.getByText('Year From')).toBeInTheDocument();
    expect(screen.getByText('Year To')).toBeInTheDocument();
    expect(screen.getByText('Multiplayer')).toBeInTheDocument();

    // Check if action buttons are displayed
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
    expect(screen.getByText('Apply Filters')).toBeInTheDocument();

    // Wait for API call to complete
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith('/api/games/filters/options');
    }, { timeout: 3000 });
  });

  it('displays genre options after API call', async () => {
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} />);

    await waitFor(() => {
      expect(screen.getByText('Action')).toBeInTheDocument();
      expect(screen.getByText('Adventure')).toBeInTheDocument();
      expect(screen.getByText('RPG')).toBeInTheDocument();
      expect(screen.getByText('Strategy')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('displays multiplayer options', () => {
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} />);

    expect(screen.getByText('All Games')).toBeInTheDocument();
    expect(screen.getByText('Multiplayer Only')).toBeInTheDocument();
    expect(screen.getByText('Single Player Only')).toBeInTheDocument();
  });

  it('handles genre filter change', async () => {
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} />);

    await waitFor(() => {
      const genreSelect = screen.getByDisplayValue('All Genres');
      fireEvent.change(genreSelect, { target: { value: 'Action' } });
    }, { timeout: 3000 });

    // The change should be stored locally but not applied yet
    expect(mockOnFilterChange).not.toHaveBeenCalled();
  });

  it('applies filters when Apply Filters button is clicked', async () => {
    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} />);

    await waitFor(() => {
      const applyButton = screen.getByText('Apply Filters');
      fireEvent.click(applyButton);
    }, { timeout: 3000 });

    expect(mockOnFilterChange).toHaveBeenCalledWith(mockFilters);
  });

  it('clears filters when Clear Filters button is clicked', async () => {
    const filtersWithValues = {
      search: 'mario',
      genre: 'Action',
      yearFrom: '2020',
      yearTo: '2024',
      multiplayer: 'true'
    };

    render(<FilterPanel filters={filtersWithValues} onFilterChange={mockOnFilterChange} />);

    await waitFor(() => {
      const clearButton = screen.getByText('Clear Filters');
      fireEvent.click(clearButton);
    }, { timeout: 3000 });

    expect(mockOnFilterChange).toHaveBeenCalledWith({
      search: 'mario', // search should be preserved
      genre: '',
      yearFrom: '',
      yearTo: '',
      multiplayer: ''
    });
  });

  it('handles API error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    axios.get.mockRejectedValue(new Error('API Error'));

    render(<FilterPanel filters={mockFilters} onFilterChange={mockOnFilterChange} />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching filter options:', expect.any(Error));
    }, { timeout: 3000 });

    consoleErrorSpy.mockRestore();
  });
}); 