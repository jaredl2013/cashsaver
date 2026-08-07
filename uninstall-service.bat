@echo off
cd /d %~dp0
echo This removes the Weekly Ad Builder Windows Service.
echo Must be run as Administrator.
echo.
pause
node uninstall-service.js
pause
