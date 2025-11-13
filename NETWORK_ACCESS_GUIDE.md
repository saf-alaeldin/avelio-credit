# Network Access Troubleshooting Guide

## Quick Diagnosis

Run the troubleshooting script:
```bash
./troubleshoot-network.sh
```

## Common Issues & Solutions

### 🔥 Issue 1: macOS Firewall Blocking Connections

**Symptoms:**
- You can access http://localhost:3000 on your Mac
- Others on the network cannot access http://192.168.7.114:3000

**Solution A - Disable Firewall (Quick Test):**
1. Open **System Settings** (or System Preferences)
2. Go to **Network** → **Firewall**
3. Click **Turn Off** firewall
4. Try accessing from another device

**Solution B - Add Node to Allowed Apps (Recommended):**
1. Open **System Settings** → **Network** → **Firewall**
2. Click **Options** or **Firewall Options**
3. Click the **+** button
4. Navigate to `/usr/local/bin/node` (or wherever Node is installed)
5. Add it and set to **Allow incoming connections**
6. Click **OK**

### 🌐 Issue 2: Wrong IP Address

**Symptoms:**
- Configuration uses 192.168.7.114 but your Mac has a different IP

**Check Your IP:**
```bash
ipconfig getifaddr en0
# or
ipconfig getifaddr en1
```

**If IP is different, update these files:**

1. **avelio-backend/.env**
   ```
   FRONTEND_URL=http://YOUR_IP_HERE:3000
   ```

2. **package.json** (root) - line 13:
   ```json
   "start:frontend:network": "cd avelio-frontend && REACT_APP_API_URL=http://YOUR_IP_HERE:5001/api/v1 PORT=3000 HOST=0.0.0.0 npm start"
   ```

### 🚀 Issue 3: Servers Not Running Correctly

**Make sure both servers are running:**
```bash
# Stop any existing servers (Ctrl+C)

# Start with network configuration
npm run start:network
```

**Verify servers are running:**
```bash
# Check if ports are in use
lsof -i:3000
lsof -i:5001
```

### 🔌 Issue 4: Not Listening on All Interfaces

**Check if servers are bound to 0.0.0.0:**
```bash
lsof -i:3000 -P -n | grep LISTEN
lsof -i:5001 -P -n | grep LISTEN
```

You should see `*:3000` and `*:5001` (not `127.0.0.1:3000`)

**If showing 127.0.0.1, ensure:**
- Frontend: `HOST=0.0.0.0` is set in start command
- Backend: `server.js` has `HOST = process.env.HOST || '0.0.0.0'`

### 📱 Issue 5: Device Not on Same Network

**Verify:**
- Your Mac and the other device are on the same Wi-Fi network
- No VPN is active on either device
- Guest network isolation is not enabled on your router

## Testing Network Access

### From Your Mac:
```bash
# Test localhost
curl http://localhost:3000
curl http://localhost:5001/api/v1/health

# Test network IP
curl http://192.168.7.114:3000
curl http://192.168.7.114:5001/api/v1/health
```

### From Another Device:
1. Open web browser
2. Go to: `http://192.168.7.114:3000`
3. You should see the Kush Air login page

## Port Forwarding (If Using Router)

If you're trying to access from outside your local network, you'll need port forwarding:

1. Log into your router admin panel
2. Find **Port Forwarding** settings
3. Forward ports 3000 and 5001 to your Mac's IP (192.168.7.114)
4. Access using your public IP or domain

## Still Not Working?

### Check Network Configuration:
```bash
# View all network interfaces
ifconfig

# Check active network connection
networksetup -listallhardwareports
```

### Check for Proxy or VPN:
- Disable any VPN connections
- Check System Settings → Network → Advanced → Proxies
- Ensure "Auto Proxy Discovery" is off

### Restart Network Services:
```bash
# Restart servers
# Press Ctrl+C to stop, then run:
npm run start:network
```

## Security Considerations

**Production Deployment:**
- Never disable firewall in production
- Use proper firewall rules to allow specific ports
- Consider using nginx as a reverse proxy
- Enable HTTPS with SSL certificates
- Use environment-specific configurations

**Development (Current Setup):**
- Firewall can be disabled temporarily for testing
- Make sure to re-enable after testing
- Only use on trusted networks

## Quick Start Checklist

- [ ] Servers running with `npm run start:network`
- [ ] IP address correct (192.168.7.114)
- [ ] macOS Firewall disabled or Node allowed
- [ ] Both devices on same Wi-Fi network
- [ ] Can access from Mac using network IP
- [ ] Can access from other device

## Support

If you've tried all solutions and still have issues:

1. Check server logs for errors
2. Verify PostgreSQL is running
3. Check `.env` files are configured correctly
4. Review browser console for errors
5. Test with another device on the network

---

**Last Updated:** 2025-01-13
**System:** Kush Air Credit Management System
**Version:** 1.0.0
