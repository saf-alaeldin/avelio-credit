#!/bin/bash

# Avelio Credit - Network Deployment Script
# This script helps deploy the application to local network

echo "════════════════════════════════════════════════════"
echo "🚀 Avelio Credit - Network Deployment"
echo "════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if running from correct directory
if [ ! -f "NETWORK_DEPLOYMENT_GUIDE.md" ]; then
    print_error "Please run this script from the avelio-credit root directory"
    exit 1
fi

# Step 1: Check Node.js
echo "Step 1: Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_success "Node.js is installed: $NODE_VERSION"
else
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Step 2: Check PostgreSQL
echo ""
echo "Step 2: Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    print_success "PostgreSQL is installed"
else
    print_warning "PostgreSQL not found. Make sure it's installed and running."
fi

# Step 3: Check .env files
echo ""
echo "Step 3: Checking configuration files..."
if [ -f "avelio-backend/.env" ]; then
    print_success "Backend .env file exists"
else
    print_error "Backend .env file is missing!"
    echo "Please create it from avelio-backend/.env.example"
    exit 1
fi

if [ -f "avelio-frontend/.env" ]; then
    print_success "Frontend .env file exists"
else
    print_error "Frontend .env file is missing!"
    echo "Please create it from avelio-frontend/.env.example"
    exit 1
fi

# Step 4: Install backend dependencies
echo ""
echo "Step 4: Installing backend dependencies..."
cd avelio-backend
if npm install; then
    print_success "Backend dependencies installed"
else
    print_error "Failed to install backend dependencies"
    exit 1
fi
cd ..

# Step 5: Install frontend dependencies
echo ""
echo "Step 5: Installing frontend dependencies..."
cd avelio-frontend
if npm install; then
    print_success "Frontend dependencies installed"
else
    print_error "Failed to install frontend dependencies"
    exit 1
fi
cd ..

# Step 6: Ask about database password
echo ""
echo "════════════════════════════════════════════════════"
echo "⚠️  IMPORTANT: Database Configuration"
echo "════════════════════════════════════════════════════"
echo ""
echo "Before proceeding, please ensure:"
echo "1. PostgreSQL is running"
echo "2. Database 'avelio_db' exists"
echo "3. Database password in avelio-backend/.env is correct"
echo ""
read -p "Have you configured the database? (y/n): " db_configured

if [ "$db_configured" != "y" ]; then
    print_warning "Please configure the database first:"
    echo "  1. Edit avelio-backend/.env"
    echo "  2. Set DB_PASSWORD to your PostgreSQL password"
    echo "  3. Run this script again"
    exit 0
fi

# Step 7: Create users
echo ""
echo "Step 6: Creating deployment users..."
cd avelio-backend
if node seed-users-deployment.js; then
    print_success "Users created successfully"
else
    print_error "Failed to create users"
    print_warning "You can try creating users manually later"
fi
cd ..

# Step 8: Final instructions
echo ""
echo "════════════════════════════════════════════════════"
echo "✅ Deployment Preparation Complete!"
echo "════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "1. Start the Backend Server (in this terminal):"
echo "   cd avelio-backend"
echo "   npm start"
echo ""
echo "2. Start the Frontend Server (in a NEW terminal):"
echo "   cd avelio-frontend"
echo "   PORT=3000 HOST=0.0.0.0 npm start"
echo ""
echo "3. Access the application:"
echo "   Frontend: http://192.168.7.114:3000"
echo "   Backend:  http://192.168.7.114:5001"
echo ""
echo "4. Login credentials are in the output above"
echo ""
echo "For detailed instructions, see: NETWORK_DEPLOYMENT_GUIDE.md"
echo ""
echo "════════════════════════════════════════════════════"
