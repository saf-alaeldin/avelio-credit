#!/bin/bash

# Script to fix PostgreSQL user configuration

echo "════════════════════════════════════════════════════"
echo "🔧 PostgreSQL User Configuration Fix"
echo "════════════════════════════════════════════════════"
echo ""

# Get current Mac username
CURRENT_USER=$(whoami)

echo "Your Mac username is: $CURRENT_USER"
echo ""

echo "Checking if 'postgres' user exists..."

# Try to connect as postgres
if psql -U postgres -d postgres -c "SELECT 1;" &>/dev/null; then
    echo "✅ 'postgres' user exists and works!"
    exit 0
fi

echo "❌ 'postgres' user doesn't exist or can't connect"
echo ""

echo "Trying to connect with your Mac username ($CURRENT_USER)..."

# Try to connect with Mac username
if psql -U "$CURRENT_USER" -d postgres -c "SELECT 1;" &>/dev/null; then
    echo "✅ Connected successfully with username: $CURRENT_USER"
    echo ""
    echo "Option 1: Create 'postgres' superuser role"
    echo "=========================================="
    echo "Run this command:"
    echo "  psql -d postgres"
    echo ""
    echo "Then in the PostgreSQL prompt, run:"
    echo "  CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'Zainer@345968548';"
    echo "  \\q"
    echo ""
    echo "Option 2: Update .env to use $CURRENT_USER"
    echo "=========================================="
    echo "Edit avelio-backend/.env and change:"
    echo "  DB_USER=postgres"
    echo "to:"
    echo "  DB_USER=$CURRENT_USER"
    echo ""
    echo "And remove or comment out the password line:"
    echo "  # DB_PASSWORD=Zainer@345968548"
    echo ""
    echo "Which option would you prefer?"
    echo "1) Create postgres user (recommended)"
    echo "2) Use $CURRENT_USER (simpler)"
    echo ""
    read -p "Enter choice (1 or 2): " choice

    if [ "$choice" = "1" ]; then
        echo ""
        echo "Creating postgres role..."
        psql -U "$CURRENT_USER" -d postgres -c "CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'Zainer@345968548';" 2>/dev/null

        if [ $? -eq 0 ]; then
            echo "✅ postgres user created successfully!"
            echo ""
            echo "Now run: npm run start:network"
        else
            echo "❌ Failed to create postgres user"
            echo "You may need to create it manually"
        fi
    elif [ "$choice" = "2" ]; then
        echo ""
        echo "Updating .env file to use $CURRENT_USER..."

        SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

        # Update DB_USER in backend .env
        if [ -f "$SCRIPT_DIR/avelio-backend/.env" ]; then
            sed -i.bak "s/DB_USER=postgres/DB_USER=$CURRENT_USER/" "$SCRIPT_DIR/avelio-backend/.env"
            sed -i.bak "s/DB_PASSWORD=Zainer@345968548/# DB_PASSWORD=/" "$SCRIPT_DIR/avelio-backend/.env"
            echo "✅ Updated avelio-backend/.env"
            echo ""
            echo "Now run: npm run start:network"
        else
            echo "❌ .env file not found. Run ./setup-env.sh first"
        fi
    fi
else
    echo "❌ Can't connect to PostgreSQL with either 'postgres' or '$CURRENT_USER'"
    echo ""
    echo "Troubleshooting:"
    echo "1. Make sure PostgreSQL is running:"
    echo "   brew services list | grep postgres"
    echo ""
    echo "2. Start PostgreSQL if needed:"
    echo "   brew services start postgresql@14"
    echo ""
    echo "3. Check which users exist:"
    echo "   psql -l"
fi
