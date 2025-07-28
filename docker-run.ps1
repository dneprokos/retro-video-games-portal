# PowerShell script to run Retro Video Games Portal with Docker
# Run this script from the project root directory

Write-Host "🐳 Starting Retro Video Games Portal with Docker..." -ForegroundColor Cyan

# Check if Docker is running
try {
    docker version | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check if Docker Compose is available
try {
    docker-compose version | Out-Null
    Write-Host "✅ Docker Compose is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not available. Please install Docker Compose." -ForegroundColor Red
    exit 1
}

# Navigate to docker directory
Set-Location docker

# Copy environment file if it doesn't exist
if (-not (Test-Path ".env")) {
    Write-Host "📝 Creating .env file from template..." -ForegroundColor Yellow
    Copy-Item env.example .env
    Write-Host "✅ Environment file created" -ForegroundColor Green
}

# Start services
Write-Host "🚀 Starting all services..." -ForegroundColor Yellow
docker-compose up -d

# Wait a moment for services to start
Start-Sleep -Seconds 5

# Check service status
Write-Host "📊 Checking service status..." -ForegroundColor Yellow
docker-compose ps

# Display URLs
Write-Host ""
Write-Host "🌐 Application URLs:" -ForegroundColor Cyan
Write-Host "   🎮 Client App: http://localhost:9000" -ForegroundColor White
Write-Host "   🔧 API: http://localhost:5000" -ForegroundColor White
Write-Host "   📚 API Docs: http://localhost:5000/api-docs" -ForegroundColor White
Write-Host "   🗄️ MongoDB: localhost:27017" -ForegroundColor White

Write-Host ""
Write-Host "📋 Useful commands:" -ForegroundColor Cyan
Write-Host "   View logs: docker-compose logs -f" -ForegroundColor White
Write-Host "   Stop services: docker-compose down" -ForegroundColor White
Write-Host "   Restart services: docker-compose restart" -ForegroundColor White

Write-Host ""
Write-Host "🎉 Retro Video Games Portal is starting up!" -ForegroundColor Green
Write-Host "   Please wait a moment for all services to be ready." -ForegroundColor Yellow 