const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  role: {
    type: String,
    enum: ['guest', 'admin', 'owner'],
    default: 'guest'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user is owner
userSchema.methods.isOwner = function() {
  return this.role === 'owner';
};

// Method to check if user is admin or owner
userSchema.methods.isAdmin = function() {
  return this.role === 'admin' || this.role === 'owner';
};

// Static method to create owner account
userSchema.statics.createOwner = async function(email, password) {
  const owner = new this({
    email,
    password,
    role: 'owner'
  });
  return await owner.save();
};

// Static method to check if owner exists
userSchema.statics.ownerExists = async function() {
  const owner = await this.findOne({ role: 'owner' });
  return !!owner;
};

// Static method to get owner email from environment
userSchema.statics.getOwnerEmail = function() {
  return process.env.OWNER_EMAIL;
};

module.exports = mongoose.model('User', userSchema); 