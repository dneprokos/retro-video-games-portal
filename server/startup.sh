#!/bin/bash

echo "=== Azure Deployment Startup Script ==="
echo "Current working directory: $(pwd)"
echo "Current user: $(whoami)"
echo ""

echo "=== Directory Structure ==="
echo "Contents of current directory:"
ls -la
echo ""

echo "=== Checking for routes files ==="
if [ -f "routes/auth.js" ] && [ -f "routes/games.js" ] && [ -f "routes/admin.js" ]; then
    echo "✅ routes files found"
else
    echo "❌ routes files NOT found"
fi
echo ""

echo "=== Checking for models files ==="
if [ -f "models/User.js" ] && [ -f "models/Game.js" ]; then
    echo "✅ models files found"
else
    echo "❌ models files NOT found"
fi
echo ""

echo "=== Checking for middleware files ==="
if [ -f "middleware/auth.js" ]; then
    echo "✅ middleware files found"
else
    echo "❌ middleware files NOT found"
fi
echo ""

echo "=== Checking for node_modules ==="
if [ -d "node_modules" ]; then
    echo "✅ node_modules folder found"
else
    echo "❌ node_modules folder NOT found"
fi
echo ""

echo "=== Checking for package.json ==="
if [ -f "package.json" ]; then
    echo "✅ package.json found"
else
    echo "❌ package.json NOT found"
fi
echo ""

echo "=== Checking for server.js ==="
if [ -f "server.js" ]; then
    echo "✅ server.js found"
else
    echo "❌ server.js NOT found"
fi
echo ""

echo "Making startup.sh executable..."
chmod +x startup.sh

echo "Installing dependencies..."
npm install --production

echo "Starting application..."
npm start