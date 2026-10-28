@echo off
title Antigravity Remote Support Server
cd /d "%~dp0server"
echo Starting Cloud Signaling and Authentication Server...
npm start
pause
