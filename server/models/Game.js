const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Game name is required'],
    unique: true,
    trim: true,
    minlength: [2, 'Game name must be at least 2 characters long']
  },
  genre: {
    type: String,
    required: [true, 'Genre is required'],
    enum: [
      'Action',
      'Adventure',
      'RPG',
      'Strategy',
      'Simulation',
      'Sports',
      'Racing',
      'Puzzle',
      'Platformer',
      'Shooter',
      'Fighting',
      'Arcade',
      'Educational',
      'Other'
    ]
  },
  platforms: {
    type: [String],
    required: [true, 'At least one platform is required'],
    validate: {
      validator: function(platforms) {
        return platforms && platforms.length > 0;
      },
      message: 'At least one platform must be selected'
    },
    enum: {
      values: [
        'NES',
        'SNES',
        'N64',
        'GameCube',
        'Wii',
        'Game Boy',
        'Game Boy Color',
        'Game Boy Advance',
        'DS',
        '3DS',
        'Sega Genesis',
        'Sega Saturn',
        'Sega Dreamcast',
        'PlayStation',
        'PlayStation 2',
        'PlayStation 3',
        'PSP',
        'Xbox',
        'Xbox 360',
        'PC',
        'Arcade',
        'Atari 2600',
        'Atari 7800',
        'Commodore 64',
        'Amiga',
        'Other'
      ],
      message: 'Invalid platform selected'
    }
  },
  releaseDate: {
    type: Date,
    required: [true, 'Release date is required'],
    validate: {
      validator: function(date) {
        return date <= new Date();
      },
      message: 'Release date cannot be in the future'
    }
  },
  hasMultiplayer: {
    type: Boolean,
    required: [true, 'Multiplayer support must be specified']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    trim: true
  },
  imageUrl: {
    type: String,
    validate: {
      validator: function(url) {
        if (!url) return true; // Optional field
        const urlPattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i;
        return urlPattern.test(url);
      },
      message: 'Please enter a valid image URL'
    }
  },
  rating: {
    type: Number,
    min: [0, 'Rating cannot be less than 0'],
    max: [10, 'Rating cannot be more than 10'],
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for search functionality
gameSchema.index({ name: 'text' });

// Virtual for release year
gameSchema.virtual('releaseYear').get(function() {
  return this.releaseDate.getFullYear();
});

// Method to get default image URL
gameSchema.methods.getImageUrl = function() {
  return this.imageUrl || '/images/default-game.png';
};

// Static method to get available genres
gameSchema.statics.getGenres = function() {
  return this.schema.path('genre').enumValues;
};

// Static method to get available platforms
gameSchema.statics.getPlatforms = function() {
  return this.schema.path('platforms').enumValues;
};

// Pre-save middleware to ensure name uniqueness
gameSchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    const existingGame = await this.constructor.findOne({ 
      name: this.name, 
      _id: { $ne: this._id } 
    });
    if (existingGame) {
      throw new Error('Game with this name already exists.');
    }
  }
  next();
});

module.exports = mongoose.model('Game', gameSchema); 