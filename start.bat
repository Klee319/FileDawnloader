@echo off
chcp 65001 >nul
title FileDawnloader

echo ========================================
echo   FileDawnloader - Starting Services
echo ========================================
echo.

cd /d "%~dp0"

:: Kill existing bun processes on port 3100
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3100 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Starting Server + Discord Bot...
start "FileDawnloader" /min cmd /c "bun run src/index.ts"

echo.
echo ========================================
echo   All services started!
echo ========================================
echo.
echo   Web Server: http://localhost:3100
echo   Admin URL:  See BASE_URL in .env
echo.
echo   Press any key to stop all services...
pause >nul

:: Stop all services
echo.
echo Stopping services...
taskkill /FI "WINDOWTITLE eq FileDawnloader*" /F >nul 2>&1
taskkill /IM bun.exe /F >nul 2>&1

echo All services stopped.
timeout /t 2 >nul
