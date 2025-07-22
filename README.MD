# 🎮 Retro Video Games Portal - Setup Guide

A full-stack web application for managing and exploring retro video games with role-based authentication, modern UI, and comprehensive test automation.

## 📚 Documentation

- **[REQUIREMENTS.md](REQUIREMENTS.md)** - Project requirements and specifications
- **[TEST_AUTOMATION_STRATEGY.md](TEST_AUTOMATION_STRATEGY.md)** - Comprehensive testing strategy and implementation plan
- **[server/COVERAGE.md](server/COVERAGE.md)** - Test coverage documentation and metrics

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### 1. Clone and Install Dependencies

```bash
# Install root dependencies
npm install

# Install all dependencies (backend + frontend)
npm run install-all
```

### 2. Environment Configuration

Create a `.env` file in the `server` directory:

```bash
# Copy the example file
cp server/env.example server/.env
```

Edit `server/.env` with your configuration:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/retro-games-portal

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Owner Configuration
OWNER_EMAIL=dneprokos@gmail.com

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
```

### 3. Database Setup

Make sure MongoDB is running. The application will automatically create the necessary collections.

### 4. Start the Application

```bash
# Start both frontend and backend
npm run dev

# Or start them separately:
npm run server  # Backend on port 5000
npm run client  # Frontend on port 3000
```

## 🧪 Testing

### Backend Testing

The backend includes comprehensive unit and integration tests with coverage reporting.

#### Run Tests
```bash
cd server

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests with HTML coverage report
npm run test:coverage:html

# Run tests with coverage in watch mode
npm run test:coverage:watch

# Quick coverage summary
npm run test:coverage:summary

# Run tests with verbose output
npm run test:verbose
```

#### Test Coverage
Current coverage status (as of Phase 2 completion):

**Backend Coverage:**
| Component | Statements | Branches | Functions | Lines | Status |
|-----------|------------|----------|-----------|-------|--------|
| **Models** | 98% | 85.71% | 100% | 100% | ✅ Good |
| **Middleware** | 62.79% | 54.16% | 75% | 62.79% | ⚠️ Needs Improvement |
| **Routes** | 45.57% | 35.41% | 33.33% | 46.18% | ❌ Needs Work |
| **Overall Backend** | 56.11% | 44.02% | 62.5% | 56.68% | ❌ Below Threshold |

**Frontend Coverage:**
| Component | Statements | Branches | Functions | Lines | Status |
|-----------|------------|----------|-----------|-------|--------|
| **Components** | 27.97% | 12.06% | 29.82% | 28.49% | ❌ Needs Work |
| **GameCard** | 100% | 100% | 100% | 100% | ✅ Excellent |
| **FilterPanel** | 91.42% | 100% | 80% | 91.17% | ✅ Good |
| **ProtectedRoute** | 100% | 100% | 100% | 100% | ✅ Excellent |
| **Overall Frontend** | 10.12% | 5.86% | 10.27% | 10.37% | ❌ Below Threshold |

**Coverage Thresholds:** 80% for statements, branches, functions, and lines.

**Test Summary:**
- **Backend Tests:** 77 tests passing (4 test suites)
- **Frontend Tests:** 38 tests passing (3 test suites)
- **Total Tests:** 115 tests passing

For detailed coverage information, see [server/COVERAGE.md](server/COVERAGE.md).

#### Test Types Implemented

**Backend Tests:**
| File | Test Type | Description |
|------|-----------|-------------|
| `server/models/Game.test.js` | Unit Tests | Game model validation, methods, and schema tests |
| `server/models/User.test.js` | Unit Tests | User model validation, password hashing, and role methods |
| `server/middleware/auth.test.js` | Unit Tests | Authentication middleware function tests |
| `server/routes/games.test.js` | Integration Tests | Games API endpoints with Supertest |

**Frontend Tests:**
| File | Test Type | Description |
|------|-----------|-------------|
| `client/src/components/GameCard.test.js` | Component Tests | Game card rendering, image handling, platform display |
| `client/src/components/FilterPanel.test.js` | Component Tests | Filter panel functionality, API integration, user interactions |
| `client/src/components/ProtectedRoute.test.js` | Component Tests | Route protection, authentication states, role-based access |

### Frontend Testing

```bash
cd client

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests with HTML coverage report
npm run test:coverage:html

# Run tests with coverage in watch mode
npm run test:coverage:watch

# Run tests with verbose output
npm run test:verbose

# Run tests for CI/CD
npm run test:ci
```

### Test Automation Strategy

The project follows a comprehensive testing strategy with multiple layers:

- **Backend Unit Tests**: ✅ Model validation, middleware functions, utility methods
- **Backend Integration Tests**: ✅ API endpoints, database interactions
- **Frontend Component Tests**: ✅ React component rendering and behavior
- **End-to-End Tests**: 🔄 Complete user workflows (Phase 3 - planned)

**Current Progress:**
- **Phase 1: Backend Foundation** ✅ Complete (77 tests)
- **Phase 2: Frontend Foundation** ✅ Complete (38 tests)
- **Phase 3: E2E Implementation** 🔄 Planned
- **Phase 4: CI/CD Integration** 🔄 Planned

For detailed testing strategy, see [TEST_AUTOMATION_STRATEGY.md](TEST_AUTOMATION_STRATEGY.md).

## 🎯 First Time Setup

### 1. Create Owner Account

1. Navigate to `http://localhost:3000/register`
2. Use the email specified in your `.env` file (`OWNER_EMAIL`)
3. Create a password (minimum 6 characters)
4. Confirm the password
5. Click "Create Owner Account"

### 2. Login and Explore

1. Login with your owner credentials
2. Navigate to the Owner Panel to manage admin users
3. Use the Admin Panel to add retro games
4. Explore the games catalog as a guest

## 🏗️ Project Structure

```
retro-video-games-portal/
├── server/                 # Backend API
│   ├── models/            # MongoDB schemas
│   ├── routes/            # API endpoints
│   ├── middleware/        # Authentication & validation
│   ├── test/              # Test setup and utilities
│   ├── __tests__/         # Test files
│   ├── server.js          # Main server file
│   ├── jest.config.js     # Jest configuration
│   ├── COVERAGE.md        # Test coverage documentation
│   └── package.json       # Backend dependencies
├── client/                # Frontend React app
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── contexts/      # React contexts
│   │   └── App.js         # Main app component
│   ├── public/            # Static assets
│   └── package.json       # Frontend dependencies
├── package.json           # Root package.json
├── REQUIREMENTS.md        # Project requirements and specifications
├── TEST_AUTOMATION_STRATEGY.md # Testing strategy and implementation plan
└── README.md             # This setup guide
```

## 🔐 Authentication & Roles

### User Roles

| Role | Permissions |
|------|-------------|
| **Guest** | Browse games, search, view details |
| **Admin** | All guest permissions + Add/edit/delete games |
| **Owner** | All admin permissions + Manage admin users |

### Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- Protected API routes
- Input validation and sanitization

## 🎮 Game Management

### Adding Games

1. Login as Admin or Owner
2. Navigate to Admin Panel
3. Click "Add Game"
4. Fill in required fields:
   - **Name**: Unique game name (min 2 chars)
   - **Genre**: Select from predefined list
   - **Platforms**: Choose at least one
   - **Release Date**: Cannot be in the future
   - **Multiplayer**: Yes/No
   - **Description**: Optional (max 500 chars)
   - **Image URL**: Optional (valid URL)
   - **Rating**: Optional (0-10 scale)

### Game Validation

- Name uniqueness enforced
- Release date validation
- Image URL validation
- Required field validation
- Platform and genre validation

## 🔍 Search & Filtering

### Search Features

- **Text Search**: Case-insensitive game name search
- **Genre Filter**: Filter by game genre
- **Year Range**: Filter by release year
- **Multiplayer Filter**: Filter by multiplayer support
- **Pagination**: 12 games per page

### Filter Options

- **Genres**: Action, Adventure, RPG, Strategy, etc.
- **Platforms**: NES, SNES, PlayStation, Xbox, etc.
- **Year Range**: Based on existing games
- **Multiplayer**: Yes/No toggle

## 🎨 UI/UX Features

### Retro Gaming Theme

- Dark arcade-style design
- Neon color scheme
- Retro fonts and animations
- Responsive design
- Hover effects and transitions

### Components

- **Game Cards**: Grid layout with hover effects
- **Search Bar**: Real-time search with filters
- **Forms**: Validation with error messages
- **Navigation**: Role-based menu items
- **Modals**: Add/edit forms
- **Tables**: Admin management views

## 🚀 Deployment

### Environment Variables for Production

```env
NODE_ENV=production
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-jwt-secret
CORS_ORIGIN=your-frontend-domain
OWNER_EMAIL=your-owner-email
```

### Build Commands

```bash
# Build frontend for production
npm run build

# Start production server
npm start
```

## 📝 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Owner registration
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - User logout

### Games
- `GET /api/games` - Get games with filters
- `GET /api/games/:id` - Get single game
- `POST /api/games` - Create game (Admin/Owner)
- `PUT /api/games/:id` - Update game (Admin/Owner)
- `DELETE /api/games/:id` - Delete game (Admin/Owner)
- `GET /api/games/filters/options` - Get filter options

### Admin Management (Owner Only)
- `GET /api/admin/users` - Get admin users
- `POST /api/admin/users` - Create admin user
- `DELETE /api/admin/users/:id` - Delete admin user
- `GET /api/admin/stats` - Get admin statistics

## 🔧 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check connection string in `.env`
   - Verify database permissions

2. **JWT Token Issues**
   - Check JWT_SECRET in `.env`
   - Ensure token expiration is valid
   - Clear browser localStorage if needed

3. **CORS Errors**
   - Verify CORS_ORIGIN in `.env`
   - Check frontend URL matches backend config

4. **Owner Registration Issues**
   - Ensure OWNER_EMAIL matches registration email
   - Check if owner account already exists
   - Verify password requirements

5. **Test Failures**
   - Ensure MongoDB Memory Server is working
   - Check JWT_SECRET is set for tests
   - Verify all dependencies are installed

### Development Tips

- Use browser dev tools to check API responses
- Monitor server logs for errors
- Check MongoDB collections for data integrity
- Test all user roles and permissions
- Run tests before committing changes
- Check test coverage regularly

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and ensure coverage
5. Submit a pull request

---

**Happy Gaming! 🎮** 