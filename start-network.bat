@echo off
REM Kush Air Credit System - Start on Network
REM This script starts both frontend and backend servers for network access

echo ========================================================
echo    KUSH AIR CREDIT SYSTEM - STARTING SERVERS
echo ========================================================
echo.

REM Get IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
    set IP_ADDRESS=%%a
    goto :ip_found
)

:ip_found
set IP_ADDRESS=%IP_ADDRESS:~1%

echo Your IP Address: %IP_ADDRESS%
echo.
echo Access the system from any device on your network:
echo   http://%IP_ADDRESS%:3000
echo.
echo Login credentials:
echo   Admin:  Username: mohamed.saeed  Password: KushAir@2025
echo   Staff:  Username: asami          Password: asami
echo   Staff:  Username: sarah.lado     Password: KushAir@2025
echo.
echo ========================================================
echo Starting servers...
echo ========================================================
echo.

REM Check if .env files exist
if not exist "avelio-backend\.env" (
    echo ERROR: Backend .env file not found
    echo Please run setup-windows.bat first
    pause
    exit /b 1
)

if not exist "avelio-frontend\.env" (
    echo ERROR: Frontend .env file not found
    echo Please run setup-windows.bat first
    pause
    exit /b 1
)

REM Kill any existing processes on ports 3000 and 5001
echo Checking for existing processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Killing existing frontend process (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5001 ^| findstr LISTENING') do (
    echo Killing existing backend process (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)
echo.

REM Start backend in new window
echo Starting backend server on port 5001...
start "Kush Air - Backend" cmd /k "cd avelio-backend && npm start"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo Starting frontend server on port 3000...
start "Kush Air - Frontend" cmd /k "cd avelio-frontend && set PORT=3000 && set HOST=0.0.0.0 && npm start"

echo.
echo ========================================================
echo Servers are starting...
echo ========================================================
echo.
echo Two new windows will open:
echo   1. Backend Server (Port 5001)
echo   2. Frontend Server (Port 3000)
echo.
echo Wait for both servers to finish starting, then access:
echo   http://%IP_ADDRESS%:3000
echo.
echo Or from this computer:
echo   http://localhost:3000
echo.
echo To stop servers: Close both server windows or press Ctrl+C in each
echo ========================================================
echo.

REM Wait a bit then try to open browser
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo.
echo Press any key to close this window (servers will keep running)
pause >nul
