@echo off
title Build Antigravity Remote Support Windows Executable
cd /d "%~dp0client"
echo Building Windows .exe installer and portable package...
npm run dist
echo.
echo Build complete! Check client\dist\
pause
