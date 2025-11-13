# Performance Optimization Guide

## Quick Diagnosis

Run the performance diagnostic script:
```bash
./diagnose-performance.sh
```

## Common Performance Issues & Solutions

### 🐌 Issue 1: Slow Response from Network Devices

**Symptoms:**
- Pages load slowly from other devices
- Requests timeout occasionally
- System becomes unreachable sometimes

**Solutions:**

#### A. WiFi Signal Strength
```bash
# Check WiFi signal
/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I

# Signal strength guide:
# -50 dBm or higher = Excellent
# -60 dBm = Good
# -70 dBm = Fair
# -80 dBm or lower = Poor (move closer to router)
```

**Fixes:**
- Move Mac closer to WiFi router
- Switch to 5GHz band (faster, less interference)
- Reduce WiFi interference (turn off unnecessary devices)
- Restart router if consistently slow

#### B. Database Connection Pool
The system has been optimized with:
- Pool size increased from 20 to 50 connections
- Minimum 5 connections kept ready
- Longer idle timeout (60s) to keep connections alive
- Increased connection timeout (10s) for slower networks

#### C. Router Configuration
- Ensure router has sufficient bandwidth
- Check if QoS (Quality of Service) is limiting connections
- Disable AP Isolation if enabled
- Update router firmware

### 🔥 Issue 2: System Becomes Unreachable

**Symptoms:**
- Connection drops randomly
- "Cannot connect to server" errors
- Works fine locally but fails from network

**Solutions:**

#### A. macOS Sleep Settings
```bash
# Prevent Mac from sleeping
System Settings > Energy Saver/Battery
- Turn off "Put hard disks to sleep when possible"
- Set "Prevent automatic sleeping" when power adapter connected
```

#### B. Network Power Management
```bash
# Disable WiFi power saving
sudo pmset -a womp 0
```

#### C. Keep Server Alive
Create a keep-alive script to prevent disconnections:
```bash
# Add to server startup
while true; do
    curl -s http://localhost:5001/health > /dev/null
    sleep 30
done &
```

### 💾 Issue 3: Database Performance

**Symptoms:**
- Slow query responses
- Creating receipts takes too long
- Agency list loads slowly

**Solutions:**

#### A. Regular Maintenance
```bash
# Optimize database (run weekly)
psql -d avelio_db -c "VACUUM ANALYZE;"

# Check for slow queries
psql -d avelio_db -c "
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;"
```

#### B. Database Indexes
```sql
-- Check if indexes are being used
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan;

-- Tables with many sequential scans may need indexes
SELECT schemaname, tablename, seq_scan, seq_tup_read
FROM pg_stat_user_tables
WHERE schemaname = 'public'
AND seq_scan > 1000
ORDER BY seq_tup_read DESC;
```

#### C. Connection Pooling
Already optimized in `db.js`:
- Max pool: 50 connections
- Min pool: 5 connections
- Connection timeout: 10 seconds
- Idle timeout: 60 seconds

### 🚀 Issue 4: Slow Frontend Loading

**Symptoms:**
- Initial page load is slow
- Large JavaScript files
- Images take time to load

**Solutions:**

#### A. Production Build
```bash
# Create optimized production build
cd avelio-frontend
npm run build

# Serve production build (optional - requires serve package)
npm install -g serve
serve -s build -l 3000
```

#### B. Enable Compression
Install compression middleware:
```bash
cd avelio-backend
npm install compression
```

Add to `server.js` (after line 21):
```javascript
const compression = require('compression');

// Enable gzip compression
app.use(compression());
```

#### C. Browser Caching
Already configured in manifest.json with proper cache headers.

### 📊 Issue 5: Too Many Concurrent Users

**Symptoms:**
- System slows down when multiple people use it
- Rate limit errors
- Connection timeouts

**Solutions:**

#### A. Rate Limiting (Already Optimized)
- Increased to 500 requests per 15 minutes
- Local network IPs (192.168.x.x) skip rate limiting

#### B. Database Pool (Already Optimized)
- 50 concurrent connections supported
- Minimum 5 connections kept ready

#### C. Server Resources
```bash
# Check Node.js memory usage
ps aux | grep node

# If memory usage > 2GB, restart servers
killall node
npm run start:network
```

### 🔧 Issue 6: Memory Leaks

**Symptoms:**
- Performance degrades over time
- Memory usage keeps increasing
- Eventually becomes unresponsive

**Solutions:**

#### A. Regular Restarts
```bash
# Stop servers
killall node

# Clear Node cache
rm -rf avelio-backend/node_modules/.cache
rm -rf avelio-frontend/node_modules/.cache

# Restart
npm run start:network
```

#### B. Monitor Memory
```bash
# Check Node.js processes
ps aux | grep -E "node.*avelio"

# Check memory per process
top -o mem | grep node
```

#### C. Database Connections
```bash
# Check active connections
psql -d avelio_db -c "SELECT count(*) FROM pg_stat_activity WHERE datname='avelio_db';"

# Kill idle connections (if > 40)
psql -d avelio_db -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'avelio_db'
AND state = 'idle'
AND state_change < now() - interval '5 minutes';"
```

## Performance Optimization Checklist

### Network Optimization
- [ ] Mac's IP address is static (System Settings > Network)
- [ ] WiFi signal strength > -70 dBm
- [ ] Using 5GHz WiFi band
- [ ] Router firmware is up to date
- [ ] Mac sleep settings disabled
- [ ] Firewall allows Node.js

### Database Optimization
- [ ] PostgreSQL is running
- [ ] VACUUM ANALYZE run recently
- [ ] Database pool size increased (50 connections)
- [ ] No slow queries (check logs)
- [ ] Connection timeout increased (10s)

### Server Optimization
- [ ] Latest code pulled from git
- [ ] Servers restarted recently
- [ ] No memory leaks (< 2GB per process)
- [ ] CORS configured for network
- [ ] Rate limiting optimized

### Frontend Optimization
- [ ] Production build created (optional)
- [ ] Static assets cached
- [ ] Images optimized
- [ ] No console errors

## Testing Performance

### From Your Mac
```bash
# Test backend response time
time curl http://localhost:5001/health

# Test frontend response time
time curl http://localhost:3000

# Test database query time
time psql -d avelio_db -c "SELECT COUNT(*) FROM receipts;"
```

### From Network Device
```bash
# Test backend (replace IP with your Mac's IP)
time curl http://192.168.7.114:5001/health

# Expected: < 500ms
# Slow: > 1000ms
```

### Performance Benchmarks

**Good Performance:**
- Backend API: < 100ms
- Frontend load: < 500ms
- Database queries: < 50ms
- Network latency: < 50ms

**Acceptable:**
- Backend API: 100-500ms
- Frontend load: 500ms-2s
- Database queries: 50-200ms
- Network latency: 50-200ms

**Slow (Needs Investigation):**
- Backend API: > 500ms
- Frontend load: > 2s
- Database queries: > 200ms
- Network latency: > 200ms

## Quick Fixes (Try These First)

1. **Restart Everything**
   ```bash
   killall node
   npm run start:network
   ```

2. **Optimize Database**
   ```bash
   psql -d avelio_db -c "VACUUM ANALYZE;"
   ```

3. **Clear Caches**
   ```bash
   rm -rf avelio-frontend/node_modules/.cache
   rm -rf avelio-backend/node_modules/.cache
   ```

4. **Check WiFi**
   - Move closer to router
   - Switch to 5GHz band
   - Restart router

5. **Pull Latest Optimizations**
   ```bash
   git pull origin claude/incomplete-request-011CV5YxB9HFzKyzdJQ26zvx
   ```

## Advanced Monitoring

### Enable PostgreSQL Statistics
```sql
-- Enable query statistics (requires restart)
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';

-- Restart PostgreSQL
-- Then create extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### Monitor Real-time Performance
```bash
# Watch database connections
watch -n 2 "psql -d avelio_db -c 'SELECT count(*), state FROM pg_stat_activity GROUP BY state;'"

# Watch Node.js memory
watch -n 2 "ps aux | grep -E 'node.*avelio' | grep -v grep"

# Watch network traffic
nettop -m tcp
```

## Getting Help

If performance issues persist after trying these solutions:

1. Run `./diagnose-performance.sh` and save the output
2. Check server logs for errors
3. Monitor network with Activity Monitor
4. Check PostgreSQL logs at `/usr/local/var/postgres/server.log`

---

**Last Updated:** 2025-01-13
**System:** Kush Air Credit Management System
**Version:** 1.0.0
