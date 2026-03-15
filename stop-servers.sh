#!/bin/bash

# Stop both frontend and backend servers
# Works on Linux, macOS, and Windows (Git Bash/WSL)

echo "Stopping Avelio Credit servers..."
echo ""

# Detect OS and kill processes appropriately
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]; then
    # Windows (Git Bash, MSYS, Cygwin)

    # Kill processes on port 3000 (frontend)
    echo "Stopping frontend..."
    FOUND=0
    for pid in $(netstat -ano 2>/dev/null | grep ':3000.*LISTENING' | awk '{print $5}' | sort -u); do
        taskkill //F //PID "$pid" 2>/dev/null && echo "Frontend stopped (PID: $pid)" && FOUND=1
    done
    [ $FOUND -eq 0 ] && echo "No frontend process found"

    # Kill processes on port 5001 (backend)
    echo "Stopping backend..."
    FOUND=0
    for pid in $(netstat -ano 2>/dev/null | grep ':5001.*LISTENING' | awk '{print $5}' | sort -u); do
        taskkill //F //PID "$pid" 2>/dev/null && echo "Backend stopped (PID: $pid)" && FOUND=1
    done
    [ $FOUND -eq 0 ] && echo "No backend process found"
else
    # Linux/macOS

    # Kill processes on port 3000 (frontend)
    echo "Stopping frontend..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "Frontend stopped" || echo "No frontend process found"

    # Kill processes on port 5001 (backend)
    echo "Stopping backend..."
    lsof -ti:5001 | xargs kill -9 2>/dev/null && echo "Backend stopped" || echo "No backend process found"
fi

echo ""
echo "Done!"
