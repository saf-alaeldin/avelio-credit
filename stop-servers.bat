@echo off
REM Stop all Node.js processes for Kush Air

echo ========================================================
echo    STOPPING KUSH AIR SERVERS
echo ========================================================
echo.

echo Stopping all Node.js processes...

REM Kill all node processes
taskkill /F /IM node.exe >nul 2>&1

if %errorLevel% equ 0 (
    echo [OK] All servers stopped
) else (
    echo [!] No running servers found
)

echo.
echo ========================================================
pause
