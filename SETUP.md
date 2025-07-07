# 🎮 Retro Video Games Portal - Setup Guide

A full-stack web application for managing and exploring retro video games with role-based authentication and modern UI.

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
│   ├── server.js          # Main server file
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
└── README.MD             # Project requirements
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

## 🧪 Testing

### Backend Testing

```bash
cd server
npm test
```

### Frontend Testing

```bash
cd client
npm test
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

### Development Tips

- Use browser dev tools to check API responses
- Monitor server logs for errors
- Check MongoDB collections for data integrity
- Test all user roles and permissions

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Happy Gaming! 🎮** 