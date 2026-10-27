@echo off
REM Double-click to run The World Engine on this computer. Keep this window open while the session runs.
cd /d "%~dp0"
if not exist node_modules call npm install --omit=dev
node scripts\host.mjs
pause
