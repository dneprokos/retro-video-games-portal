# 🐳 Docker Setup - Retro Video Games Portal

This directory contains all the Docker configuration files needed to run the Retro Video Games Portal application locally using Docker and Docker Compose.

## 📋 Prerequisites

- **Docker**: [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose**: [Install Docker Compose](https://docs.docker.com/compose/install/)

## 🚀 Quick Start

### 1. Configure Environment
```bash
# Navigate to the docker directory
cd docker

# Copy the example environment file
cp env.example .env

# Edit .env file to customize ports and settings (optional)
# Default ports: Client=9000, Server=5000, MongoDB=27017
```

### 2. Start All Services
```bash
# Start all services (MongoDB, Server, Client)
docker-compose up -d
```

### 3. Check Service Status
```bash
# View running containers
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Access the Application
- **🎮 Client App**: http://localhost:9000
- **🔧 API**: http://localhost:5000
- **📚 API Docs**: http://localhost:5000/api-docs
- **🗄️ MongoDB**: localhost:27017

## 🛠️ Available Commands

### Start Services
```bash
# Start all services in background
docker-compose up -d

# Start with logs
docker-compose up

# Start specific service
docker-compose up -d server
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ This will delete all data)
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f mongodb
```

### Rebuild Services
```bash
# Rebuild all services
docker-compose build --no-cache

# Rebuild specific service
docker-compose build --no-cache server
```

### Health Checks
```bash
# Check service health
docker-compose ps

# Test API health
curl http://localhost:5000/api/health

# Test client
curl http://localhost:9000
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │    │  Express API    │    │   MongoDB       │
│   (Port 9000)   │◄──►│  (Port 5000)    │◄──►│   (Port 27017)  │
│   (Nginx)       │    │   (Node.js)     │    │   (MongoDB)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📁 File Structure

```
docker/
├── Dockerfile.server      # Express.js API server
├── Dockerfile.client      # React client with Nginx
├── docker-compose.yml     # Main orchestration file
├── nginx.conf            # Nginx configuration for client
├── mongo-init.js         # MongoDB initialization script
├── .dockerignore         # Files to exclude from builds
├── env.example           # Environment variables template
└── README.md             # This file
```

## 🔧 Configuration

### Environment Variables

The application uses environment variables from the `.env` file. Copy `env.example` to `.env` and customize as needed:

#### Port Configuration
- `CLIENT_PORT`: 9000 (Client application port)
- `SERVER_PORT`: 5000 (API server port)
- `MONGODB_PORT`: 27017 (MongoDB port)

#### Server (API)
- `NODE_ENV`: development
- `JWT_SECRET`: your-super-secret-jwt-key-for-development
- `JWT_EXPIRES_IN`: 7d
- `OWNER_EMAIL`: dneprokos@gmail.com
- `CORS_ORIGIN`: http://localhost:${CLIENT_PORT} (auto-configured)
- `MAX_FILE_SIZE`: 5242880
- `UPLOAD_PATH`: ./uploads
- `RATE_LIMIT_*`: Rate limiting configuration

#### MongoDB
- `MONGO_INITDB_ROOT_USERNAME`: admin
- `MONGO_INITDB_ROOT_PASSWORD`: password123
- `MONGO_INITDB_DATABASE`: retro-games-portal

### Volumes

- `mongodb_data`: Persistent MongoDB data
- `server_uploads`: File uploads for the server

### Networks

- `retro-games-network`: Internal network for service communication

## 🗄️ Database

### MongoDB Connection
- **Host**: localhost (or mongodb from within containers)
- **Port**: 27017
- **Database**: retro-games-portal
- **Username**: admin
- **Password**: password123

### Sample Data
The MongoDB initialization script (`mongo-init.js`) creates:
- Database schema with validation
- Indexes for better performance
- Sample games data (Super Mario Bros, Zelda, Pac-Man)

### Access MongoDB
```bash
# Connect to MongoDB container
docker exec -it retro-games-mongodb mongosh -u admin -p password123

# Or connect from host
mongosh mongodb://admin:password123@localhost:27017/retro-games-portal?authSource=admin
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Check what's using the port
netstat -ano | findstr :9000
netstat -ano | findstr :5000
netstat -ano | findstr :27017

# Change ports in .env file
# Edit docker/.env and modify CLIENT_PORT, SERVER_PORT, or MONGODB_PORT
```

#### 2. MongoDB Connection Issues
```bash
# Check MongoDB logs
docker-compose logs mongodb

# Restart MongoDB
docker-compose restart mongodb
```

#### 3. API Not Starting
```bash
# Check server logs
docker-compose logs server

# Check if MongoDB is ready
docker-compose ps mongodb
```

#### 4. Client Build Issues
```bash
# Rebuild client
docker-compose build --no-cache client

# Check client logs
docker-compose logs client
```

#### 5. Permission Issues
```bash
# On Linux/Mac, you might need to fix permissions
sudo chown -R $USER:$USER .
```

### Reset Everything
```bash
# Stop and remove everything
docker-compose down -v

# Remove all images
docker rmi $(docker images -q retro-video-games-portal_*)

# Start fresh
docker-compose up -d
```

## 🧪 Development Workflow

### 1. Code Changes
```bash
# For server changes, rebuild and restart
docker-compose build server
docker-compose up -d server

# For client changes, rebuild and restart
docker-compose build client
docker-compose up -d client
```

### 2. Database Changes
```bash
# Reset database
docker-compose down -v
docker-compose up -d
```

### 3. View Logs
```bash
# Follow logs in real-time
docker-compose logs -f

# View specific service logs
docker-compose logs -f server
```

## 📊 Monitoring

### Health Checks
All services include health checks:
- **MongoDB**: Database connectivity
- **Server**: API health endpoint
- **Client**: Web server availability

### Logs
```bash
# View all logs
docker-compose logs

# Follow logs
docker-compose logs -f

# View specific service
docker-compose logs server
```

## 🚀 Production Considerations

For production deployment:

1. **Change default passwords** in `docker-compose.yml`
2. **Use environment files** for sensitive data
3. **Configure proper SSL/TLS**
4. **Set up monitoring and logging**
5. **Use production-grade MongoDB**
6. **Configure backup strategies**

## 📞 Support

- **Docker Issues**: Check Docker documentation
- **Application Issues**: Check the main project README
- **Database Issues**: Check MongoDB documentation

---

**🎮 Your Retro Video Games Portal is now running with Docker!** 