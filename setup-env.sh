#!/bin/bash

# Avelio Credit - Setup Environment Files for Network Deployment
# This script creates .env files with the correct network configuration

echo "════════════════════════════════════════════════════"
echo "🔧 Avelio Credit - Environment Setup"
echo "════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script's directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Creating backend .env file..."

# Create backend .env
cat > "$SCRIPT_DIR/avelio-backend/.env" << 'EOF'
# Server Configuration
PORT=5001
HOST=0.0.0.0
NODE_ENV=production

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=avelio_db
DB_USER=postgres
DB_PASSWORD=Zainer@345968548

# JWT Secret (IMPORTANT: Change this to a secure random string)
JWT_SECRET=avelio_production_secret_key_change_this_12345
JWT_EXPIRES_IN=24h

# CORS (Frontend URL)
FRONTEND_URL=http://192.168.7.114:3000

# Optional: Email Service (for later)
# EMAIL_SERVICE=gmail
# EMAIL_USER=your_email@gmail.com
# EMAIL_PASSWORD=your_app_password
EOF

echo -e "${GREEN}✅ Backend .env created${NC}"

echo "Creating frontend .env file..."

# Create frontend .env
cat > "$SCRIPT_DIR/avelio-frontend/.env" << 'EOF'
# Avelio Credit Frontend - Local Network Deployment

# Backend API URL - Network IP
REACT_APP_API_URL=http://192.168.7.114:5001/api/v1

# Node environment
NODE_ENV=production

# App version
REACT_APP_VERSION=1.0.0

# Enable debug logging
REACT_APP_DEBUG=false
EOF

echo -e "${GREEN}✅ Frontend .env created${NC}"

echo ""
echo "════════════════════════════════════════════════════"
echo "✅ Environment files created successfully!"
echo "════════════════════════════════════════════════════"
echo ""
echo "Configuration:"
echo "  Frontend URL: http://192.168.7.114:3000"
echo "  Backend API:  http://192.168.7.114:5001"
echo ""
echo "Next steps:"
echo "  1. Clear frontend cache:"
echo "     cd avelio-frontend && rm -rf node_modules/.cache build"
echo ""
echo "  2. Start the servers:"
echo "     npm run start:network"
echo ""
echo "  3. Open in browser:"
echo "     http://192.168.7.114:3000"
echo ""
echo "════════════════════════════════════════════════════"
