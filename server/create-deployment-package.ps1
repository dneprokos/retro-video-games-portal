# Azure Deployment Package Creation Script
Write-Host "Creating Azure deployment package..." -ForegroundColor Green

# Remove existing deployment package if it exists
if (Test-Path "deployment.zip") {
    Remove-Item "deployment.zip" -Force
    Write-Host "Removed existing deployment package" -ForegroundColor Yellow
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install --production --silent

# Create a temporary directory for packaging
$tempDir = "temp-deployment"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

Write-Host "Copying files to temporary directory..." -ForegroundColor Yellow

# Copy all files and folders
Copy-Item "server.js" $tempDir
Copy-Item "package.json" $tempDir
Copy-Item "package-lock.json" $tempDir
Copy-Item ".deployment" $tempDir
Copy-Item "startup.sh" $tempDir
Copy-Item "routes" $tempDir -Recurse
Copy-Item "models" $tempDir -Recurse
Copy-Item "middleware" $tempDir -Recurse
Copy-Item "node_modules" $tempDir -Recurse

# Create ZIP from temp directory
Write-Host "Creating ZIP from temporary directory..." -ForegroundColor Yellow
Compress-Archive -Path "$tempDir\*" -DestinationPath "deployment.zip" -Force

# Clean up temp directory
Remove-Item $tempDir -Recurse -Force

Write-Host "Deployment package created: deployment.zip" -ForegroundColor Green
$packageSize = [math]::Round((Get-Item "deployment.zip").Length / 1MB, 2)
Write-Host "Package size: $packageSize MB" -ForegroundColor Cyan

Write-Host ""
Write-Host "Ready for deployment!" -ForegroundColor Yellow
Write-Host "Run: .\deploy.ps1" -ForegroundColor White
