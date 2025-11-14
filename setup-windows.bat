@echo off
REM Kush Air Credit System - Windows Network Deployment Setup
REM This script sets up the system for network deployment on Windows

echo ========================================================
echo    KUSH AIR CREDIT SYSTEM - WINDOWS SETUP
echo ========================================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

echo Step 1: Checking requirements...
echo.

REM Check Node.js
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [X] Node.js is NOT installed
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Download the LTS version and install it
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo [OK] Node.js is installed: %NODE_VERSION%
)

REM Check npm
npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [X] npm is NOT installed
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
    echo [OK] npm is installed: %NPM_VERSION%
)

REM Check PostgreSQL
psql --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [X] PostgreSQL is NOT installed
    echo.
    echo Please install PostgreSQL from: https://www.postgresql.org/download/windows/
    echo During installation:
    echo   - Remember the password you set for 'postgres' user
    echo   - Keep the default port: 5432
    echo   - Install pgAdmin 4 (GUI tool)
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('psql --version') do set PG_VERSION=%%i
    echo [OK] PostgreSQL is installed: %PG_VERSION%
)

echo.
echo ========================================================
echo Step 2: Getting your IP address...
echo ========================================================
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
    set IP_ADDRESS=%%a
    goto :ip_found
)

:ip_found
set IP_ADDRESS=%IP_ADDRESS:~1%
echo Your Windows IP Address: %IP_ADDRESS%
echo.
echo This is the address other devices will use to access the system.
echo Example: http://%IP_ADDRESS%:3000
echo.

echo ========================================================
echo Step 3: Installing project dependencies...
echo ========================================================
echo.

if not exist "package.json" (
    echo ERROR: package.json not found
    echo Please run this script from the project root directory
    pause
    exit /b 1
)

echo Installing root dependencies...
call npm install
if %errorLevel% neq 0 (
    echo ERROR: Failed to install root dependencies
    pause
    exit /b 1
)

echo.
echo Installing backend dependencies...
cd avelio-backend
call npm install
if %errorLevel% neq 0 (
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)
cd ..

echo.
echo Installing frontend dependencies...
cd avelio-frontend
call npm install
if %errorLevel% neq 0 (
    echo ERROR: Failed to install frontend dependencies
    pause
    exit /b 1
)
cd ..

echo.
echo ========================================================
echo Step 4: Configuring environment files...
echo ========================================================
echo.

REM Create backend .env file
echo Creating backend/.env file...
(
echo # Database Configuration
echo DB_HOST=localhost
echo DB_PORT=5432
echo DB_NAME=avelio_db
echo DB_USER=postgres
echo DB_PASSWORD=YOUR_POSTGRES_PASSWORD_HERE
echo.
echo # Server Configuration
echo PORT=5001
echo HOST=0.0.0.0
echo NODE_ENV=development
echo.
echo # JWT Configuration
echo JWT_SECRET=kushair-super-secret-key-change-this-in-production-2025
echo JWT_EXPIRES_IN=12h
echo.
echo # CORS ^(Frontend URL^)
echo FRONTEND_URL=http://%IP_ADDRESS%:3000
) > avelio-backend\.env

echo.
echo [!] IMPORTANT: Edit avelio-backend\.env and set your PostgreSQL password
echo     The password you set during PostgreSQL installation
echo.

REM Create frontend .env file
echo Creating frontend/.env file...
(
echo REACT_APP_API_URL=http://%IP_ADDRESS%:5001/api/v1
) > avelio-frontend\.env

echo.
echo ========================================================
echo Step 5: Configuring Windows Firewall...
echo ========================================================
echo.

echo Adding firewall rules for ports 3000 and 5001...

netsh advfirewall firewall delete rule name="Kush Air Frontend" >nul 2>&1
netsh advfirewall firewall add rule name="Kush Air Frontend" dir=in action=allow protocol=TCP localport=3000
if %errorLevel% equ 0 (
    echo [OK] Firewall rule added for port 3000
) else (
    echo [!] Failed to add firewall rule for port 3000
)

netsh advfirewall firewall delete rule name="Kush Air Backend" >nul 2>&1
netsh advfirewall firewall add rule name="Kush Air Backend" dir=in action=allow protocol=TCP localport=5001
if %errorLevel% equ 0 (
    echo [OK] Firewall rule added for port 5001
) else (
    echo [!] Failed to add firewall rule for port 5001
)

echo.
echo ========================================================
echo Setup Complete!
echo ========================================================
echo.
echo IMPORTANT NEXT STEPS:
echo.
echo 1. Edit avelio-backend\.env and set DB_PASSWORD to your PostgreSQL password
echo.
echo 2. Create the database:
echo    - Open pgAdmin 4
echo    - Right-click "Databases" and create "avelio_db"
echo    - Or run: psql -U postgres -c "CREATE DATABASE avelio_db;"
echo.
echo 3. Initialize database schema:
echo    psql -U postgres -d avelio_db -f avelio-backend\schema.sql
echo.
echo 4. Create users:
echo    cd avelio-backend
echo    node setup-kushair-production.js
echo    cd ..
echo.
echo 5. Start the system:
echo    Run: start-network.bat
echo.
echo 6. Access from any device on your network:
echo    http://%IP_ADDRESS%:3000
echo.
echo ========================================================
pause
