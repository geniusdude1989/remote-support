@echo off
title Launch Antigravity Remote Support
cd /d "%~dp0"
echo [1/2] Starting Cloud Signaling Server in background...
start "" cmd /c "cd /d %~dp0server && node src/index.js"
timeout /t 2 /nobreak >nul
echo [2/2] Launching Antigravity Remote Support Desktop App...
start "" "client\dist\win-unpacked\Antigravity Remote Support.exe"
exit
