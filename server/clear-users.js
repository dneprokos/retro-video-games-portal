const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config({ path: __dirname + '/.env' });

const clearUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear all users (GAMES ARE PRESERVED)
    const result = await User.deleteMany({});
    console.log(`🗑️  Deleted ${result.deletedCount} users from the database`);
    console.log('✅ Users cleared successfully! (Games are preserved)');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error clearing users:', error);
    process.exit(1);
  }
};

// Run the user clearing
clearUsers();
