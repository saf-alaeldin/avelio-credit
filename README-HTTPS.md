# HTTPS Setup Guide

## Overview
Your Avelio Credit application is now configured to support HTTPS for secure local development.

## What Was Done

### 1. SSL Certificates Generated
- Created self-signed SSL certificates using `mkcert`
- Certificates are located in `./certs/` directory
- Valid for: localhost, 127.0.0.1, ::1, and 192.168.7.114
- Expires: February 18, 2028

### 2. Backend Configuration (Express)
- Modified `avelio-backend/src/server.js` to support HTTPS
- Added HTTPS module and certificate loading
- Updated CORS to allow HTTPS origins
- Added `USE_HTTPS` environment variable

### 3. Frontend Configuration (React)
- Created `avelio-frontend/.env` with HTTPS settings
- Configured SSL certificate paths
- Updated API URL to use HTTPS

## Current URLs

### With HTTPS Enabled:
**Backend:**
- https://localhost:5001
- https://192.168.7.114:5001

**Frontend:**
- https://localhost:3000
- https://192.168.7.114:3000

## Switching Between HTTP and HTTPS

### To Use HTTPS:
1. In `avelio-backend/.env`, set: `USE_HTTPS=true`
2. Frontend will automatically use HTTPS via `.env` file
3. Restart servers: `./start-dev.sh`

### To Use HTTP:
1. In `avelio-backend/.env`, set: `USE_HTTPS=false`
2. Comment out HTTPS settings in `avelio-frontend/.env`:
   ```
   # HTTPS=true
   # SSL_CRT_FILE=../certs/localhost+3.pem
   # SSL_KEY_FILE=../certs/localhost+3-key.pem
   ```
3. Update API URL: `REACT_APP_API_URL=http://localhost:5001/api/v1`
4. Restart servers: `./start-dev.sh`

## Browser Certificate Trust

The certificates are self-signed, so browsers may show a warning. To trust the certificates:

### Chrome/Edge:
1. When you see "Your connection is not private", click "Advanced"
2. Click "Proceed to localhost (unsafe)"
3. Or run: `mkcert -install` (requires sudo password)

### Firefox:
1. When you see the warning, click "Advanced"
2. Click "Accept the Risk and Continue"

### Safari:
1. Run: `mkcert -install` (requires sudo password)
2. This installs the CA certificate system-wide

## Testing HTTPS

Test backend:
```bash
curl -k https://localhost:5001/health
```

Test frontend:
Open browser to https://localhost:3000

## Files Modified

1. `avelio-backend/src/server.js` - Added HTTPS support
2. `avelio-backend/.env` - Added `USE_HTTPS=true`
3. `avelio-frontend/.env` - Created with HTTPS configuration
4. `certs/` - Created directory with SSL certificates

## Troubleshooting

### Backend not starting with HTTPS:
- Check if certificates exist: `ls -la certs/`
- Verify paths in server.js are correct
- Check backend.log: `tail -f backend.log`

### Frontend not using HTTPS:
- Verify `.env` exists in avelio-frontend
- Check frontend.log: `tail -f frontend.log`
- Clear browser cache and restart

### CORS errors:
- Ensure backend CORS allows HTTPS origins
- Check that frontend is using correct API URL
- Verify both servers are using same protocol (both HTTP or both HTTPS)

## Security Notes

⚠️ These certificates are for **local development only**
- Do not use in production
- Do not commit certificates to git
- For production, use proper SSL certificates from a CA like Let's Encrypt

## Additional Resources

- mkcert: https://github.com/FiloSottile/mkcert
- Create React App HTTPS: https://create-react-app.dev/docs/using-https-in-development/
