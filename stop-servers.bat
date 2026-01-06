@echo off
REM Stop Kush Air servers on specific ports (3000 and 5001)

echo ========================================================
echo    STOPPING KUSH AIR SERVERS
echo ========================================================
echo.

REM Stop frontend on port 3000
echo Stopping frontend server (port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 echo [OK] Frontend stopped (PID: %%a)
)

REM Stop backend on port 5001
echo Stopping backend server (port 5001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    if not errorlevel 1 echo [OK] Backend stopped (PID: %%a)
)

echo.
echo ========================================================
echo Servers stopped.
echo ========================================================
pause
