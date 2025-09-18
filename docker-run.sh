#!/bin/bash

# Shell script to run Retro Video Games Portal with Docker
# Run this script from the project root directory

echo "🐳 Starting Retro Video Games Portal with Docker..."

# Check if Docker is running
if ! docker version > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! docker-compose version > /dev/null 2>&1; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# Navigate to docker directory
cd docker

# Copy environment file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "✅ Environment file created"
fi

# Start services
echo "🚀 Starting all services..."
docker-compose up -d

# Wait a moment for services to start
sleep 5

# Check service status
echo "📊 Checking service status..."
docker-compose ps

# Display URLs
echo ""
echo "🌐 Application URLs:"
echo "   🎮 Client App: http://localhost:9000"
echo "   🔧 API: http://localhost:5000"
echo "   📚 API Docs: http://localhost:5000/api-docs"
echo "   🗄️ MongoDB: localhost:27017"

echo ""
echo "📋 Useful commands:"
echo "   View logs: docker-compose -f docker/docker-compose.yml logs -f"
echo "   Stop services: docker-compose -f docker/docker-compose.yml  down"
echo "   Restart services: docker-compose -f docker/docker-compose.yml  restart"

echo ""
echo "🎉 Retro Video Games Portal is starting up!"
echo "   Please wait a moment for all services to be ready." 
