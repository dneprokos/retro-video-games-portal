import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';

const FilterPanel = ({ filters, onFilterChange }) => {
  const [filterOptions, setFilterOptions] = useState({
    genres: [],
    platforms: [],
    yearRange: { min: 1970, max: new Date().getFullYear() }
  });
  const [localFilters, setLocalFilters] = useState(filters);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const fetchFilterOptions = async () => {
    try {
      const response = await axios.get('/api/games/filters/options');
      setFilterOptions(response.data);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
  };

  const applyFilters = () => {
    onFilterChange(localFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      search: localFilters.search,
      genre: '',
      yearFrom: '',
      yearTo: '',
      multiplayer: ''
    };
    setLocalFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  const generateYearOptions = () => {
    const years = [];
    for (let year = filterOptions.yearRange.max; year >= filterOptions.yearRange.min; year--) {
      years.push(year);
    }
    return years;
  };

  return (
    <div className="mt-6 p-4 border-t border-arcade-border" data-testid="filter-panel-content">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Genre Filter */}
        <div>
          <label className="block text-neon-pink font-bold mb-2">Genre</label>
          <select
            value={localFilters.genre}
            onChange={(e) => handleFilterChange('genre', e.target.value)}
            className="retro-select w-full"
            data-testid="genre-filter"
          >
            <option value="">All Genres</option>
            {filterOptions.genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </div>

        {/* Year From Filter */}
        <div>
          <label className="block text-neon-blue font-bold mb-2">Year From</label>
          <select
            value={localFilters.yearFrom}
            onChange={(e) => handleFilterChange('yearFrom', e.target.value)}
            className="retro-select w-full"
          >
            <option value="">Any Year</option>
            {generateYearOptions().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* Year To Filter */}
        <div>
          <label className="block text-neon-blue font-bold mb-2">Year To</label>
          <select
            value={localFilters.yearTo}
            onChange={(e) => handleFilterChange('yearTo', e.target.value)}
            className="retro-select w-full"
          >
            <option value="">Any Year</option>
            {generateYearOptions().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* Multiplayer Filter */}
        <div>
          <label className="block text-neon-green font-bold mb-2">Multiplayer</label>
          <select
            value={localFilters.multiplayer}
            onChange={(e) => handleFilterChange('multiplayer', e.target.value)}
            className="retro-select w-full"
          >
            <option value="">All Games</option>
            <option value="true">Multiplayer Only</option>
            <option value="false">Single Player Only</option>
          </select>
        </div>
      </div>

      {/* Filter Actions */}
      <div className="flex justify-between items-center mt-4 pt-4 border-t border-arcade-border">
        <button
          onClick={clearFilters}
          className="text-arcade-text hover:text-neon-pink transition-colors duration-300 flex items-center space-x-2"
          data-testid="clear-filters"
        >
          <X className="h-4 w-4" />
          <span>Clear Filters</span>
        </button>

        <button
          onClick={applyFilters}
          className="retro-button"
          data-testid="apply-filters"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
};

export default FilterPanel; 