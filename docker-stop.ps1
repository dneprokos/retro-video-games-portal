# PowerShell script to stop Retro Video Games Portal Docker containers
Write-Host "Stopping Retro Video Games Portal Docker containers..." -ForegroundColor Yellow

# Check if Docker is running
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check if docker-compose is available
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker Compose is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Navigate to docker directory
if (Test-Path "docker") {
    Set-Location "docker"
    Write-Host "Changed to docker directory" -ForegroundColor Cyan
} else {
    Write-Host "Warning: docker directory not found, running from current location" -ForegroundColor Yellow
}

# Show currently running containers
Write-Host "`nCurrently running containers:" -ForegroundColor Cyan
docker ps --filter "name=retro-games" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Stop all services defined in docker-compose.yml
Write-Host "`nStopping all services..." -ForegroundColor Yellow
docker-compose down

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ All Docker containers stopped successfully!" -ForegroundColor Green
} else {
    Write-Host "`n❌ Error stopping Docker containers" -ForegroundColor Red
    exit 1
}

# Show final status
Write-Host "`nFinal container status:" -ForegroundColor Cyan
docker ps --filter "name=retro-games" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host "`nRetro Video Games Portal has been stopped!" -ForegroundColor Green
Write-Host "To start again, run: .\docker-run.ps1" -ForegroundColor White
