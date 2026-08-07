@echo off
cd /d %~dp0
echo This installs Weekly Ad Builder as a Windows Service so it:
echo   - starts automatically when this computer boots
echo   - keeps running in the background, no window to leave open
echo   - restarts itself if it ever crashes
echo.
echo This MUST be run as Administrator, or it will fail.
echo (Right-click this file - Run as administrator)
echo.
pause
node install-service.js
pause
