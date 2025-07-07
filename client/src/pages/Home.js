import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Search, Filter, Gamepad2, Calendar, Users, Star } from 'lucide-react';
import GameCard from '../components/GameCard';
import FilterPanel from '../components/FilterPanel';

const Home = () => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    genre: '',
    yearFrom: '',
    yearTo: '',
    multiplayer: ''
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalGames: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [showFilters, setShowFilters] = useState(false);

  const fetchGames = async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page,
        limit: 12,
        ...filters
      });

      const response = await axios.get(`/api/games?${params}`);
      setGames(response.data.games);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Error fetching games:', error);
      toast.error('Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, [filters]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handlePageChange = (page) => {
    fetchGames(page);
  };

  const handleSearch = (searchTerm) => {
    setFilters(prev => ({ ...prev, search: searchTerm }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  if (loading && games.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="text-arcade-text">Loading games...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="neon-text text-4xl font-arcade mb-4">
          🎮 RETRO GAMES PORTAL 🎮
        </h1>
        <p className="text-arcade-text text-lg">
          Discover and explore classic video games from the golden age of gaming
        </p>
      </div>

      {/* Search and Filter Bar */}
      <div className="retro-card">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-arcade-text" />
            <input
              type="text"
              placeholder="Search games..."
              value={filters.search}
              onChange={(e) => handleSearch(e.target.value)}
              className="retro-input w-full pl-10"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="retro-button-secondary flex items-center space-x-2"
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <FilterPanel
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        )}
      </div>

      {/* Games Grid */}
      {games.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {games.map((game) => (
              <GameCard key={game._id} game={game} />
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrevPage}
                className="retro-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              <span className="text-arcade-text px-4">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNextPage}
                className="retro-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}

          {/* Results Count */}
          <div className="text-center text-arcade-text">
            Showing {games.length} of {pagination.totalGames} games
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <Gamepad2 className="h-16 w-16 text-arcade-border mx-auto mb-4" />
          <h2 className="text-2xl font-arcade text-neon-pink mb-2">No Games Found</h2>
          <p className="text-arcade-text">
            Try adjusting your search or filters to find more games.
          </p>
        </div>
      )}
    </div>
  );
};

export default Home; 