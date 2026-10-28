@echo off
title HawkRDP Cloud Server (Public Internet)
cd /d "%~dp0"

echo ========================================================
echo        STARTING HAWKRDP CLOUD SERVER & TUNNEL
echo ========================================================
echo [1/2] Starting local HawkRDP server on port 8080...
start "" cmd /c "cd /d %~dp0server && node src/index.js"
timeout /t 2 /nobreak >nul

echo [2/2] Connecting to Cloudflare global public network...
echo.
echo Look for the link ending in .trycloudflare.com below!
echo That is your public cloud server URL.
echo ========================================================
echo.
"%~dp0tools\cloudflared.exe" tunnel --url http://localhost:8080
pause
