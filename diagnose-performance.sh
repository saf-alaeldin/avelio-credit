#!/bin/bash

echo "═══════════════════════════════════════════════════"
echo "⚡ Kush Air Performance Diagnostics"
echo "═══════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Check PostgreSQL Performance
echo "1️⃣  Checking PostgreSQL performance..."
echo ""

if command -v psql &> /dev/null; then
    DB_CONNECTIONS=$(psql -d avelio_db -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='avelio_db';")
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Active database connections: $DB_CONNECTIONS"

        # Check for slow queries
        SLOW_QUERIES=$(psql -d avelio_db -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='avelio_db' AND state='active' AND query_start < now() - interval '5 seconds';")
        if [ "$SLOW_QUERIES" -gt "0" ]; then
            echo -e "${YELLOW}⚠${NC}  $SLOW_QUERIES slow queries detected (>5 seconds)"
        else
            echo -e "${GREEN}✓${NC} No slow queries detected"
        fi
    else
        echo -e "${YELLOW}⚠${NC}  Could not check database connections"
    fi
else
    echo -e "${YELLOW}⚠${NC}  psql not found - skipping database checks"
fi

echo ""

# 2. Check System Resources
echo "2️⃣  Checking system resources..."
echo ""

# CPU usage
CPU_USAGE=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//')
if [ -n "$CPU_USAGE" ]; then
    CPU_VALUE=$(echo "$CPU_USAGE" | sed 's/\..*//')
    if [ "$CPU_VALUE" -gt "80" ]; then
        echo -e "${RED}✗${NC} High CPU usage: ${CPU_USAGE}%"
        echo "   Fix: Close other applications or upgrade hardware"
    else
        echo -e "${GREEN}✓${NC} CPU usage: ${CPU_USAGE}%"
    fi
fi

# Memory usage
MEMORY_PRESSURE=$(memory_pressure 2>/dev/null | grep "System-wide memory free percentage" | awk '{print $5}' | sed 's/%//')
if [ -n "$MEMORY_PRESSURE" ]; then
    if [ "$MEMORY_PRESSURE" -lt "20" ]; then
        echo -e "${RED}✗${NC} Low memory: Only ${MEMORY_PRESSURE}% free"
        echo "   Fix: Close other applications or restart your Mac"
    else
        echo -e "${GREEN}✓${NC} Memory: ${MEMORY_PRESSURE}% free"
    fi
fi

echo ""

# 3. Check Network Performance
echo "3️⃣  Testing network performance..."
echo ""

IP_ADDRESS=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

if [ -n "$IP_ADDRESS" ]; then
    # Test backend response time
    BACKEND_TIME=$(curl -o /dev/null -s -w '%{time_total}\n' http://localhost:5001/health 2>/dev/null)
    if [ -n "$BACKEND_TIME" ]; then
        BACKEND_MS=$(echo "$BACKEND_TIME * 1000" | bc)
        if (( $(echo "$BACKEND_TIME > 1.0" | bc -l) )); then
            echo -e "${YELLOW}⚠${NC}  Backend response time: ${BACKEND_MS}ms (slow)"
        else
            echo -e "${GREEN}✓${NC} Backend response time: ${BACKEND_MS}ms"
        fi
    fi

    # Test frontend response time
    FRONTEND_TIME=$(curl -o /dev/null -s -w '%{time_total}\n' http://localhost:3000 2>/dev/null)
    if [ -n "$FRONTEND_TIME" ]; then
        FRONTEND_MS=$(echo "$FRONTEND_TIME * 1000" | bc)
        if (( $(echo "$FRONTEND_TIME > 2.0" | bc -l) )); then
            echo -e "${YELLOW}⚠${NC}  Frontend response time: ${FRONTEND_MS}ms (slow)"
        else
            echo -e "${GREEN}✓${NC} Frontend response time: ${FRONTEND_MS}ms"
        fi
    fi

    # Test network IP response
    NETWORK_TIME=$(curl -o /dev/null -s -w '%{time_total}\n' http://$IP_ADDRESS:5001/health 2>/dev/null)
    if [ -n "$NETWORK_TIME" ]; then
        NETWORK_MS=$(echo "$NETWORK_TIME * 1000" | bc)
        if (( $(echo "$NETWORK_TIME > 1.5" | bc -l) )); then
            echo -e "${YELLOW}⚠${NC}  Network response time: ${NETWORK_MS}ms (slow)"
            echo "   Issue: WiFi signal may be weak or router overloaded"
        else
            echo -e "${GREEN}✓${NC} Network response time: ${NETWORK_MS}ms"
        fi
    fi
fi

echo ""

# 4. Check Node.js Performance
echo "4️⃣  Checking Node.js processes..."
echo ""

NODE_PROCESSES=$(pgrep -f "node.*avelio" | wc -l)
if [ "$NODE_PROCESSES" -gt "4" ]; then
    echo -e "${YELLOW}⚠${NC}  Multiple Node processes running: $NODE_PROCESSES"
    echo "   Fix: Stop old processes with 'killall node' and restart"
else
    echo -e "${GREEN}✓${NC} Node processes: $NODE_PROCESSES"
fi

# Check for memory leaks
NODE_MEM=$(ps aux | grep -E "node.*avelio" | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
if [ -n "$NODE_MEM" ]; then
    NODE_MEM_MB=$(printf "%.0f" "$NODE_MEM")
    if [ "$NODE_MEM_MB" -gt "2000" ]; then
        echo -e "${YELLOW}⚠${NC}  High Node.js memory usage: ${NODE_MEM_MB}MB"
        echo "   Fix: Restart the servers to free memory"
    else
        echo -e "${GREEN}✓${NC} Node.js memory usage: ${NODE_MEM_MB}MB"
    fi
fi

echo ""

# 5. Check WiFi Performance
echo "5️⃣  Checking WiFi performance..."
echo ""

# Get WiFi info (macOS specific)
WIFI_INFO=$(/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I 2>/dev/null)

if [ -n "$WIFI_INFO" ]; then
    RSSI=$(echo "$WIFI_INFO" | grep "agrCtlRSSI" | awk '{print $2}')
    NOISE=$(echo "$WIFI_INFO" | grep "agrCtlNoise" | awk '{print $2}')

    if [ -n "$RSSI" ]; then
        if [ "$RSSI" -lt "-70" ]; then
            echo -e "${YELLOW}⚠${NC}  Weak WiFi signal: ${RSSI} dBm"
            echo "   Fix: Move closer to router or use 5GHz band"
        else
            echo -e "${GREEN}✓${NC} WiFi signal strength: ${RSSI} dBm (good)"
        fi
    fi

    TX_RATE=$(echo "$WIFI_INFO" | grep "lastTxRate" | awk '{print $2}')
    if [ -n "$TX_RATE" ]; then
        if [ "$TX_RATE" -lt "50" ]; then
            echo -e "${YELLOW}⚠${NC}  Slow WiFi speed: ${TX_RATE} Mbps"
            echo "   Fix: Switch to 5GHz band or reduce interference"
        else
            echo -e "${GREEN}✓${NC} WiFi transmission rate: ${TX_RATE} Mbps"
        fi
    fi
fi

echo ""

# 6. Database Query Performance
echo "6️⃣  Checking database query performance..."
echo ""

if command -v psql &> /dev/null; then
    # Check for missing indexes
    MISSING_INDEXES=$(psql -d avelio_db -t -c "
        SELECT COUNT(*)
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        AND seq_scan > 1000
        AND seq_tup_read / NULLIF(seq_scan, 0) > 10000;
    " 2>/dev/null)

    if [ -n "$MISSING_INDEXES" ] && [ "$MISSING_INDEXES" -gt "0" ]; then
        echo -e "${YELLOW}⚠${NC}  $MISSING_INDEXES tables may need indexes for better performance"
        echo "   Run: VACUUM ANALYZE to update statistics"
    else
        echo -e "${GREEN}✓${NC} Database indexes look good"
    fi

    # Check table bloat
    echo "   Running VACUUM ANALYZE to optimize database..."
    psql -d avelio_db -c "VACUUM ANALYZE;" > /dev/null 2>&1
    echo -e "${GREEN}✓${NC} Database optimized"
fi

echo ""

# 7. Frontend Bundle Size
echo "7️⃣  Checking frontend bundle size..."
echo ""

if [ -d "avelio-frontend/build" ]; then
    BUNDLE_SIZE=$(du -sh avelio-frontend/build | awk '{print $1}')
    echo "   Build folder size: $BUNDLE_SIZE"

    JS_SIZE=$(du -sh avelio-frontend/build/static/js 2>/dev/null | awk '{print $1}')
    if [ -n "$JS_SIZE" ]; then
        echo "   JavaScript bundle: $JS_SIZE"
    fi
else
    echo -e "${YELLOW}⚠${NC}  No production build found"
    echo "   For better performance, create a production build:"
    echo "   cd avelio-frontend && npm run build"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "📋 Performance Recommendations"
echo "═══════════════════════════════════════════════════"
echo ""
echo "For Slow Network Performance:"
echo "  1. Check WiFi signal strength - move closer to router"
echo "  2. Use 5GHz WiFi band instead of 2.4GHz"
echo "  3. Reduce interference - turn off other WiFi devices"
echo "  4. Restart router if performance is consistently slow"
echo ""
echo "For Database Slowness:"
echo "  5. Run 'psql -d avelio_db -c \"VACUUM ANALYZE;\"' regularly"
echo "  6. Check for slow queries in the backend logs"
echo "  7. Consider adding database indexes if needed"
echo ""
echo "For General Performance:"
echo "  8. Restart servers: killall node && npm run start:network"
echo "  9. Close unused applications to free memory"
echo "  10. Use production build for better frontend performance"
echo ""
echo "═══════════════════════════════════════════════════"
