#!/bin/bash

echo "═══════════════════════════════════════════════════"
echo "🔍 Kush Air Network Access Troubleshooting"
echo "═══════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check if servers are running
echo "1️⃣  Checking if servers are running..."
echo ""

FRONTEND_RUNNING=$(lsof -ti:3000)
BACKEND_RUNNING=$(lsof -ti:5001)

if [ -n "$FRONTEND_RUNNING" ]; then
    echo -e "${GREEN}✓${NC} Frontend server is running on port 3000"
else
    echo -e "${RED}✗${NC} Frontend server is NOT running on port 3000"
    echo "   Fix: Run 'npm run start:network' from the project root"
fi

if [ -n "$BACKEND_RUNNING" ]; then
    echo -e "${GREEN}✓${NC} Backend server is running on port 5001"
else
    echo -e "${RED}✗${NC} Backend server is NOT running on port 5001"
    echo "   Fix: Run 'npm run start:network' from the project root"
fi

echo ""

# 2. Check network interface
echo "2️⃣  Checking network configuration..."
echo ""

IP_ADDRESS=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -n "$IP_ADDRESS" ]; then
    echo -e "${GREEN}✓${NC} Your Mac's IP address: $IP_ADDRESS"
    if [ "$IP_ADDRESS" != "192.168.7.114" ]; then
        echo -e "${YELLOW}⚠${NC}  WARNING: Your IP is $IP_ADDRESS but configured for 192.168.7.114"
        echo "   You need to update the IP in:"
        echo "   - avelio-backend/.env (FRONTEND_URL)"
        echo "   - package.json (start:frontend:network)"
    fi
else
    echo -e "${RED}✗${NC} Could not determine IP address"
    echo "   Make sure you're connected to Wi-Fi"
fi

echo ""

# 3. Check if ports are listening on all interfaces
echo "3️⃣  Checking if servers are listening on network (0.0.0.0)..."
echo ""

if [ -n "$FRONTEND_RUNNING" ]; then
    FRONTEND_LISTEN=$(lsof -i:3000 -P -n | grep LISTEN | awk '{print $9}')
    if echo "$FRONTEND_LISTEN" | grep -q "\*:3000"; then
        echo -e "${GREEN}✓${NC} Frontend is listening on all interfaces (accessible from network)"
    else
        echo -e "${RED}✗${NC} Frontend is only listening on localhost"
        echo "   Fix: Make sure HOST=0.0.0.0 is set when starting the frontend"
    fi
fi

if [ -n "$BACKEND_RUNNING" ]; then
    BACKEND_LISTEN=$(lsof -i:5001 -P -n | grep LISTEN | awk '{print $9}')
    if echo "$BACKEND_LISTEN" | grep -q "\*:5001"; then
        echo -e "${GREEN}✓${NC} Backend is listening on all interfaces (accessible from network)"
    else
        echo -e "${RED}✗${NC} Backend is only listening on localhost"
        echo "   Fix: Check avelio-backend/src/server.js has HOST=0.0.0.0"
    fi
fi

echo ""

# 4. Check macOS Firewall
echo "4️⃣  Checking macOS Firewall..."
echo ""

FIREWALL_STATUS=$(defaults read /Library/Preferences/com.apple.alf globalstate 2>/dev/null)
if [ "$FIREWALL_STATUS" == "0" ]; then
    echo -e "${GREEN}✓${NC} Firewall is OFF (no blocking)"
elif [ "$FIREWALL_STATUS" == "1" ]; then
    echo -e "${YELLOW}⚠${NC}  Firewall is ON - may be blocking connections"
    echo "   Fix options:"
    echo "   A) Disable firewall temporarily:"
    echo "      System Settings > Network > Firewall > Turn Off"
    echo ""
    echo "   B) Add Node to allowed apps:"
    echo "      System Settings > Network > Firewall > Options"
    echo "      Click '+' and add: /usr/local/bin/node"
elif [ "$FIREWALL_STATUS" == "2" ]; then
    echo -e "${RED}✗${NC} Firewall is ON with strict rules"
    echo "   Fix: Add Node to allowed applications in Firewall settings"
else
    echo -e "${YELLOW}?${NC} Could not determine firewall status"
fi

echo ""

# 5. Test local access
echo "5️⃣  Testing local access..."
echo ""

if curl -s --max-time 3 http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Frontend is accessible from localhost"
else
    echo -e "${RED}✗${NC} Frontend is NOT accessible from localhost"
fi

if curl -s --max-time 3 http://localhost:5001/api/v1/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend is accessible from localhost"
else
    echo -e "${RED}✗${NC} Backend is NOT accessible from localhost"
fi

echo ""

# 6. Network access test
echo "6️⃣  Testing network interface access..."
echo ""

if [ -n "$IP_ADDRESS" ]; then
    if curl -s --max-time 3 http://$IP_ADDRESS:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Frontend is accessible from network IP ($IP_ADDRESS:3000)"
    else
        echo -e "${RED}✗${NC} Frontend is NOT accessible from network IP"
        echo "   This is likely a firewall issue"
    fi

    if curl -s --max-time 3 http://$IP_ADDRESS:5001/api/v1/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Backend is accessible from network IP ($IP_ADDRESS:5001)"
    else
        echo -e "${RED}✗${NC} Backend is NOT accessible from network IP"
        echo "   This is likely a firewall issue"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "📋 Summary & Next Steps"
echo "═══════════════════════════════════════════════════"
echo ""
echo "If you see any ${RED}✗${NC} or ${YELLOW}⚠${NC} above, follow the fixes suggested."
echo ""
echo "Common solutions:"
echo "1. Disable macOS Firewall temporarily for testing"
echo "2. Make sure servers are running with 'npm run start:network'"
echo "3. Verify your IP address matches 192.168.7.114"
echo ""
echo "To test from another device on the network:"
echo "  Open browser and go to: http://$IP_ADDRESS:3000"
echo ""
echo "═══════════════════════════════════════════════════"
