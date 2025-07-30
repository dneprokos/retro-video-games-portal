import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Calendar, 
  Users, 
  Star, 
  Gamepad2,
  Loader2
} from 'lucide-react';

const GameDetails = () => {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchGame = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/games/${id}`);
      setGame(response.data.game);
    } catch (error) {
      console.error('Error fetching game:', error);
      // Don't navigate away, just set game to null to show error message
      setGame(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this game? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(true);
      await axios.delete(`/api/games/${id}`);
      toast.success('Game deleted successfully');
      navigate('/');
    } catch (error) {
      console.error('Error deleting game:', error);
      toast.error('Failed to delete game');
    } finally {
      setDeleting(false);
    }
  };

  const getImageUrl = () => {
    if (game?.imageUrl) {
      return game.imageUrl;
    }
    return '/images/default-game.svg';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;

    for (let i = 0; i < fullStars; i++) {
      stars.push(<Star key={i} className="h-5 w-5 text-neon-yellow fill-current" />);
    }

    if (hasHalfStar) {
      stars.push(<Star key="half" className="h-5 w-5 text-neon-yellow fill-current" style={{ clipPath: 'inset(0 50% 0 0)' }} />);
    }

    const emptyStars = 10 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Star key={`empty-${i}`} className="h-5 w-5 text-arcade-border" />);
    }

    return stars;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <Loader2 className="loading-spinner mx-auto mb-4" />
          <p className="text-arcade-text">Loading game details...</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center py-12" data-testid="error-message">
        <h2 className="text-2xl font-arcade text-neon-pink mb-2">Game Not Found</h2>
        <p className="text-arcade-text mb-4">The game you're looking for doesn't exist.</p>
        <Link to="/" className="retro-button">Back to Games</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div>
        <Link 
          to="/" 
          className="inline-flex items-center space-x-2 text-arcade-text hover:text-neon-pink transition-colors duration-300"
          data-testid="back-to-home"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Games</span>
        </Link>
      </div>

      {/* Game Header */}
      <div className="retro-card">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Game Image */}
          <div className="lg:w-1/2">
            <img
              src={getImageUrl()}
              alt={game.name}
              className="w-full h-96 object-cover rounded-lg"
              data-testid="game-image"
              onError={(e) => {
                e.target.src = '/images/default-game.svg';
              }}
            />
          </div>

          {/* Game Info */}
          <div className="lg:w-1/2 space-y-4">
            <div className="flex justify-between items-start">
              <h1 className="neon-text text-3xl font-arcade" data-testid="game-name">{game.name}</h1>
              
              {/* Admin Actions */}
              {isAdmin() && (
                <div className="flex space-x-2">
                  <Link
                    to={`/admin?edit=${game._id}`}
                    className="retro-button-secondary flex items-center space-x-1"
                  >
                    <Edit className="h-4 w-4" />
                    <span>Edit</span>
                  </Link>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-red-600 text-white px-3 py-2 rounded border-2 border-red-600 hover:bg-transparent hover:text-red-600 transition-all duration-300 flex items-center space-x-1 disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>

            {/* Basic Info */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2" data-testid="game-genre">
                <Gamepad2 className="h-5 w-5 text-neon-green" />
                <span className="text-arcade-text font-bold">Genre:</span>
                <span className="text-arcade-text">{game.genre}</span>
              </div>

              <div className="flex items-center space-x-2" data-testid="game-release-date">
                <Calendar className="h-5 w-5 text-neon-blue" />
                <span className="text-arcade-text font-bold">Released:</span>
                <span className="text-arcade-text">{formatDate(game.releaseDate)}</span>
              </div>

              <div className="flex items-center space-x-2" data-testid="game-multiplayer">
                <Users className="h-5 w-5 text-neon-purple" />
                <span className="text-arcade-text font-bold">Multiplayer:</span>
                <span className="text-arcade-text">
                  {game.hasMultiplayer ? 'Yes' : 'No'}
                </span>
              </div>

              {game.rating && (
                <div className="flex items-center space-x-2" data-testid="game-rating">
                  <span className="text-arcade-text font-bold">Rating:</span>
                  <div className="flex items-center space-x-1">
                    {renderStars(game.rating)}
                    <span className="text-arcade-text ml-2">({game.rating}/10)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Platforms */}
            <div data-testid="game-platforms">
              <h3 className="text-neon-yellow font-bold mb-2">Platforms:</h3>
              <div className="flex flex-wrap gap-2">
                {game.platforms.map((platform) => (
                  <span
                    key={platform}
                    className="bg-arcade-border text-arcade-text px-3 py-1 rounded-full text-sm"
                  >
                    {platform}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {game.description && (
        <div className="retro-card">
          <h2 className="text-xl font-arcade text-neon-pink mb-4">Description</h2>
          <p className="text-arcade-text leading-relaxed" data-testid="game-description">{game.description}</p>
        </div>
      )}

      {/* Created/Updated Info */}
      <div className="retro-card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-arcade-text">
          <div>
            <span className="font-bold">Created by:</span> {game.createdBy?.email || 'Unknown'}
          </div>
          {game.updatedBy && (
            <div>
              <span className="font-bold">Last updated by:</span> {game.updatedBy.email}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameDetails; 