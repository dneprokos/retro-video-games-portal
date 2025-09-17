# Deploy to Azure App Service Script
Write-Host "Starting Azure deployment..." -ForegroundColor Green

$ResourceGroupName = "retro-games-rg"
$AppName = "retro-games-api"
$ZipFilePath = "deployment.zip"

# Check if deployment.zip exists
if (-not (Test-Path $ZipFilePath)) {
    Write-Host "Error: deployment.zip not found. Please run create-deployment-zip.ps1 first." -ForegroundColor Red
    exit 1
}

# Check if Azure CLI is installed
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Azure CLI is not installed. Please install it from https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Red
    exit 1
}
Write-Host "Azure CLI is available" -ForegroundColor Green

# Check if logged in to Azure
try {
    az account show | Out-Null
    Write-Host "Already logged in to Azure" -ForegroundColor Green
} catch {
    Write-Host "Not logged in to Azure. Opening browser for login..." -ForegroundColor Yellow
    az login --output none
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Azure login failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "Successfully logged in to Azure" -ForegroundColor Green
}

Write-Host "Deploying application to $AppName in resource group $ResourceGroupName..." -ForegroundColor Yellow
az webapp deploy --resource-group $ResourceGroupName --name $AppName --src-path $ZipFilePath --type zip

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment completed successfully!" -ForegroundColor Green
    Write-Host "Your API is available at: https://$AppName.azurewebsites.net" -ForegroundColor Cyan
    Write-Host "Health check: https://$AppName.azurewebsites.net/api/health" -ForegroundColor Cyan
    Write-Host "API Docs: https://$AppName.azurewebsites.net/api-docs" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "1. Update your React app to use the new API URL" -ForegroundColor White
    Write-Host "2. Test your API endpoints" -ForegroundColor White
} else {
    Write-Host "Deployment failed. Please check the logs for more details." -ForegroundColor Red
}