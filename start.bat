@echo off
cd /d %~dp0
title Weekly Ad Builder (close this window to stop the server)
echo Starting Weekly Ad Builder...
echo.
echo Leave this window open while you're using the tool.
echo Closing it stops the server for everyone using it.
echo.
node server.js
pause
