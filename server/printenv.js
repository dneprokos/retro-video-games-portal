const dotenv = require('dotenv');

// Explicitly load the .env file
dotenv.config({ path: './.env' });

console.log('Environment variables after loading .env:');
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('JWT_SECRET:', process.env.JWT_SECRET);
console.log('OWNER_EMAIL:', process.env.OWNER_EMAIL);
console.log('PORT:', process.env.PORT); 