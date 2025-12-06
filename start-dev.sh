#!/bin/bash

# Start both frontend and backend servers

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "════════════════════════════════════════════════════"
echo "🚀 Starting Avelio Credit Development Servers"
echo "════════════════════════════════════════════════════"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Kill any existing processes on ports 3000 and 5001
echo "Checking for existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "✓ Killed existing frontend process" || true
lsof -ti:5001 | xargs kill -9 2>/dev/null && echo "✓ Killed existing backend process" || true
echo ""

# Start backend
echo -e "${BLUE}Starting backend server...${NC}"
cd "$SCRIPT_DIR/avelio-backend"
npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"
echo ""

# Wait a moment for backend to initialize
sleep 2

# Start frontend
echo -e "${BLUE}Starting frontend server...${NC}"
cd "$SCRIPT_DIR/avelio-frontend"
HOST=0.0.0.0 npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"
echo ""

echo "════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Both servers started!${NC}"
echo "════════════════════════════════════════════════════"
echo ""
echo "Backend:"
echo "  → http://localhost:5001"
echo "  → http://192.168.7.114:5001"
echo ""
echo "Frontend:"
echo "  → http://localhost:3000"
echo "  → http://192.168.7.114:3000"
echo ""
echo "Logs:"
echo "  → Backend: tail -f backend.log"
echo "  → Frontend: tail -f frontend.log"
echo ""
echo "To stop servers:"
echo "  → ./stop-servers.sh"
echo "  → or: kill $BACKEND_PID $FRONTEND_PID"
echo "════════════════════════════════════════════════════"
