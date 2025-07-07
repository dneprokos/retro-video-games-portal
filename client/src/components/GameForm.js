import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';

const GameForm = ({ game, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    genre: '',
    platforms: [],
    releaseDate: '',
    hasMultiplayer: false,
    description: '',
    imageUrl: '',
    rating: ''
  });
  const [filterOptions, setFilterOptions] = useState({
    genres: [],
    platforms: []
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchFilterOptions();
    if (game) {
      setFormData({
        name: game.name || '',
        genre: game.genre || '',
        platforms: game.platforms || [],
        releaseDate: game.releaseDate ? new Date(game.releaseDate).toISOString().split('T')[0] : '',
        hasMultiplayer: game.hasMultiplayer || false,
        description: game.description || '',
        imageUrl: game.imageUrl || '',
        rating: game.rating || ''
      });
    }
  }, [game]);

  const fetchFilterOptions = async () => {
    try {
      const response = await axios.get('/api/games/filters/options');
      setFilterOptions(response.data);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handlePlatformChange = (platform) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform]
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Game name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Game name must be at least 2 characters';
    }

    if (!formData.genre) {
      newErrors.genre = 'Genre is required';
    }

    if (formData.platforms.length === 0) {
      newErrors.platforms = 'At least one platform must be selected';
    }

    if (!formData.releaseDate) {
      newErrors.releaseDate = 'Release date is required';
    } else if (new Date(formData.releaseDate) > new Date()) {
      newErrors.releaseDate = 'Release date cannot be in the future';
    }

    if (formData.imageUrl && !isValidUrl(formData.imageUrl)) {
      newErrors.imageUrl = 'Please enter a valid image URL';
    }

    if (formData.rating && (formData.rating < 0 || formData.rating > 10)) {
      newErrors.rating = 'Rating must be between 0 and 10';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        ...formData,
        rating: formData.rating ? parseFloat(formData.rating) : null
      };
      
      await onSubmit(submitData);
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Game Name */}
        <div className="md:col-span-2">
          <label className="block text-neon-pink font-bold mb-2">
            Game Name *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={`retro-input w-full ${errors.name ? 'border-red-400' : ''}`}
            placeholder="Enter game name"
          />
          {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
        </div>

        {/* Genre */}
        <div>
          <label className="block text-neon-pink font-bold mb-2">
            Genre *
          </label>
          <select
            name="genre"
            value={formData.genre}
            onChange={handleChange}
            className={`retro-select w-full ${errors.genre ? 'border-red-400' : ''}`}
          >
            <option value="">Select Genre</option>
            {filterOptions.genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
          {errors.genre && <p className="text-red-400 text-sm mt-1">{errors.genre}</p>}
        </div>

        {/* Release Date */}
        <div>
          <label className="block text-neon-pink font-bold mb-2">
            Release Date *
          </label>
          <input
            type="date"
            name="releaseDate"
            value={formData.releaseDate}
            onChange={handleChange}
            max={new Date().toISOString().split('T')[0]}
            className={`retro-input w-full ${errors.releaseDate ? 'border-red-400' : ''}`}
          />
          {errors.releaseDate && <p className="text-red-400 text-sm mt-1">{errors.releaseDate}</p>}
        </div>

        {/* Platforms */}
        <div className="md:col-span-2">
          <label className="block text-neon-pink font-bold mb-2">
            Platforms *
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {filterOptions.platforms.map((platform) => (
              <label key={platform} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.platforms.includes(platform)}
                  onChange={() => handlePlatformChange(platform)}
                  className="rounded border-arcade-border bg-arcade-card text-neon-pink focus:ring-neon-pink"
                />
                <span className="text-arcade-text text-sm">{platform}</span>
              </label>
            ))}
          </div>
          {errors.platforms && <p className="text-red-400 text-sm mt-1">{errors.platforms}</p>}
        </div>

        {/* Multiplayer */}
        <div>
          <label className="block text-neon-pink font-bold mb-2">
            Multiplayer Support *
          </label>
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name="hasMultiplayer"
                value="true"
                checked={formData.hasMultiplayer === true}
                onChange={handleChange}
                className="border-arcade-border bg-arcade-card text-neon-pink focus:ring-neon-pink"
              />
              <span className="text-arcade-text">Yes</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name="hasMultiplayer"
                value="false"
                checked={formData.hasMultiplayer === false}
                onChange={handleChange}
                className="border-arcade-border bg-arcade-card text-neon-pink focus:ring-neon-pink"
              />
              <span className="text-arcade-text">No</span>
            </label>
          </div>
        </div>

        {/* Rating */}
        <div>
          <label className="block text-neon-pink font-bold mb-2">
            Rating (0-10)
          </label>
          <input
            type="number"
            name="rating"
            value={formData.rating}
            onChange={handleChange}
            min="0"
            max="10"
            step="0.1"
            className={`retro-input w-full ${errors.rating ? 'border-red-400' : ''}`}
            placeholder="Enter rating (optional)"
          />
          {errors.rating && <p className="text-red-400 text-sm mt-1">{errors.rating}</p>}
        </div>

        {/* Image URL */}
        <div className="md:col-span-2">
          <label className="block text-neon-pink font-bold mb-2">
            Image URL
          </label>
          <input
            type="url"
            name="imageUrl"
            value={formData.imageUrl}
            onChange={handleChange}
            className={`retro-input w-full ${errors.imageUrl ? 'border-red-400' : ''}`}
            placeholder="Enter image URL (optional)"
          />
          {errors.imageUrl && <p className="text-red-400 text-sm mt-1">{errors.imageUrl}</p>}
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-neon-pink font-bold mb-2">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows="4"
            maxLength="500"
            className="retro-textarea w-full"
            placeholder="Enter game description (optional, max 500 characters)"
          />
          <p className="text-arcade-text text-sm mt-1">
            {formData.description.length}/500 characters
          </p>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="retro-button-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="retro-button flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <span>{game ? 'Update Game' : 'Add Game'}</span>
          )}
        </button>
      </div>
    </form>
  );
};

export default GameForm; 