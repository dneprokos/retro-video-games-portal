const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');
const adminRoutes = require('./routes/admin');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
app.set('trust proxy', 1); // Trust first proxy for rate limiting
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// Rate limiting (disabled for tests)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });
  app.use(limiter);
}

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/admin', adminRoutes);

// Swagger setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Retro Video Games Portal API',
      version: '1.0.0',
      description: 'API documentation for the Retro Video Games Portal',
    },
    servers: [
      { url: process.env.NODE_ENV === 'production' 
          ? `https://${process.env.WEBSITE_SITE_NAME || 'your-app'}.azurewebsites.net/api`
          : `http://localhost:${PORT}/api` 
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      { bearerAuth: [] }
    ]
  },
  apis: ['./routes/*.js'], // Scan route files for JSDoc comments
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Retro Games Portal API is running!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Only start the server if this file is run directly
if (require.main === module) {
  // Configure mongoose for better Azure compatibility
  mongoose.set('bufferCommands', false); // Disable mongoose buffering
  mongoose.set('bufferMaxEntries', 0); // Disable mongoose buffering

  // Start the server first, then try to connect to database
  app.listen(PORT, () => {
    console.log(`🎮 Retro Games Portal Server running on port ${PORT}`);
    console.log(`📧 Owner email: ${process.env.OWNER_EMAIL}`);
    console.log(`📚 Swagger API Docs: https://${process.env.WEBSITE_SITE_NAME || 'your-app'}.azurewebsites.net/api-docs`);
    
    // Try to connect to MongoDB (non-blocking)
    if (process.env.MONGODB_URI) {
      mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        bufferCommands: false,
        bufferMaxEntries: 0
      })
      .then(() => {
        console.log('✅ Connected to MongoDB');
      })
      .catch((err) => {
        console.error('❌ MongoDB connection error:', err.message);
        console.log('⚠️  App running without database connection');
      });
    } else {
      console.log('⚠️  No MONGODB_URI provided, running without database');
    }
  });
}

module.exports = app; 