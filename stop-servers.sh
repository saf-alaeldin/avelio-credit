#!/bin/bash

# Stop both frontend and backend servers

echo "🛑 Stopping Avelio Credit servers..."
echo ""

# Kill processes on port 3000 (frontend)
echo "Stopping frontend..."
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "✓ Frontend stopped" || echo "✗ No frontend process found"

# Kill processes on port 5001 (backend)
echo "Stopping backend..."
lsof -ti:5001 | xargs kill -9 2>/dev/null && echo "✓ Backend stopped" || echo "✗ No backend process found"

echo ""
echo "✅ Done!"
