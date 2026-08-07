@echo off
cd /d %~dp0
echo ============================================
echo   Weekly Ad Builder - first-time setup
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Download and install it from https://nodejs.org ^(LTS version^), then run this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Creating .env from .env.example ...
  copy .env.example .env >nul
  echo.
  echo IMPORTANT: open .env in Notepad and set SHARED_PASSWORD, ADMIN_PASSWORD, and SESSION_SECRET
  echo before starting the app for real. It will run with placeholder values until you do.
  echo.
)

echo Installing dependencies - this can take a minute...
call npm install

echo.
echo Setup complete.
echo   - To just try it out: double-click start.bat
echo   - To run it permanently in the background: run install-service.bat as Administrator
echo.
pause
