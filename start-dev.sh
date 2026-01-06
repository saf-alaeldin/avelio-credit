#!/bin/bash

# Start both frontend and backend servers
# Works on Linux, macOS, and Windows (Git Bash/WSL)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "════════════════════════════════════════════════════"
echo "Starting Avelio Credit Development Servers"
echo "════════════════════════════════════════════════════"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Detect OS and kill existing processes appropriately
echo "Checking for existing processes..."
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]; then
    # Windows (Git Bash, MSYS, Cygwin)
    # Kill processes on port 3000
    for pid in $(netstat -ano 2>/dev/null | grep ':3000.*LISTENING' | awk '{print $5}' | sort -u); do
        taskkill //F //PID "$pid" 2>/dev/null && echo "Killed existing frontend process (PID: $pid)"
    done
    # Kill processes on port 5001
    for pid in $(netstat -ano 2>/dev/null | grep ':5001.*LISTENING' | awk '{print $5}' | sort -u); do
        taskkill //F //PID "$pid" 2>/dev/null && echo "Killed existing backend process (PID: $pid)"
    done
else
    # Linux/macOS
    lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "Killed existing frontend process" || true
    lsof -ti:5001 | xargs kill -9 2>/dev/null && echo "Killed existing backend process" || true
fi
echo ""

# Start backend
echo -e "${BLUE}Starting backend server...${NC}"
cd "$SCRIPT_DIR/avelio-backend"
npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}Backend started (PID: $BACKEND_PID)${NC}"
echo ""

# Wait a moment for backend to initialize
sleep 2

# Start frontend
echo -e "${BLUE}Starting frontend server...${NC}"
cd "$SCRIPT_DIR/avelio-frontend"
HOST=0.0.0.0 npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}Frontend started (PID: $FRONTEND_PID)${NC}"
echo ""

echo "════════════════════════════════════════════════════"
echo -e "${GREEN}Both servers started!${NC}"
echo "════════════════════════════════════════════════════"
echo ""
echo "Backend:"
echo "  -> http://localhost:5001"
echo ""
echo "Frontend:"
echo "  -> http://localhost:3000"
echo ""
echo "Logs:"
echo "  -> Backend: tail -f backend.log"
echo "  -> Frontend: tail -f frontend.log"
echo ""
echo "To stop servers:"
echo "  -> ./stop-servers.sh"
echo "  -> or: kill $BACKEND_PID $FRONTEND_PID"
echo "════════════════════════════════════════════════════"
