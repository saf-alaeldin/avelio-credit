#!/bin/bash

# Complete restart script with cache clearing

echo "════════════════════════════════════════════════════"
echo "🔄 Avelio Credit - Complete Restart"
echo "════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Step 1: Verifying .env files exist..."

if [ -f "$SCRIPT_DIR/avelio-backend/.env" ]; then
    echo -e "${GREEN}✅ Backend .env exists${NC}"
    echo "Backend CORS setting:"
    grep "FRONTEND_URL" "$SCRIPT_DIR/avelio-backend/.env"
else
    echo -e "${RED}❌ Backend .env missing!${NC}"
    echo "Run ./setup-env.sh first"
    exit 1
fi

if [ -f "$SCRIPT_DIR/avelio-frontend/.env" ]; then
    echo -e "${GREEN}✅ Frontend .env exists${NC}"
    echo "Frontend API URL:"
    grep "REACT_APP_API_URL" "$SCRIPT_DIR/avelio-frontend/.env"
else
    echo -e "${RED}❌ Frontend .env missing!${NC}"
    echo "Run ./setup-env.sh first"
    exit 1
fi

echo ""
echo "Step 2: Clearing all caches..."

# Clear frontend caches
echo "Clearing React cache..."
rm -rf "$SCRIPT_DIR/avelio-frontend/node_modules/.cache" 2>/dev/null
rm -rf "$SCRIPT_DIR/avelio-frontend/build" 2>/dev/null
rm -rf "$SCRIPT_DIR/avelio-frontend/.env.local" 2>/dev/null
rm -rf "$SCRIPT_DIR/avelio-frontend/.env.development.local" 2>/dev/null

echo -e "${GREEN}✅ Cache cleared${NC}"

echo ""
echo "Step 3: Killing any processes on ports 3000 and 5001..."

# Kill processes on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "Killed process on port 3000" || echo "No process on port 3000"

# Kill processes on port 5001
lsof -ti:5001 | xargs kill -9 2>/dev/null && echo "Killed process on port 5001" || echo "No process on port 5001"

echo ""
echo "════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Ready to start!${NC}"
echo "════════════════════════════════════════════════════"
echo ""
echo "Now run:"
echo "  npm run start:network"
echo ""
echo "Then open browser to:"
echo "  http://192.168.7.114:3000"
echo ""
echo "And press Cmd+Shift+R to hard refresh!"
echo "════════════════════════════════════════════════════"
