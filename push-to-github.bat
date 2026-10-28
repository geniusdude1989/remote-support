@echo off
title Push Remote Support to GitHub
cd /d "%~dp0"
echo Pushing to https://github.com/geniusdude1989/remote-support.git...
git branch -M main
git push -u origin main
echo.
echo Done! If you see "Branch 'main' set up to track remote branch", your code is on GitHub!
pause
