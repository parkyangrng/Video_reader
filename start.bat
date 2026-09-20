@echo off
REM Double-click to launch the app locally on Windows. Requires Node.js;
REM see README.md for a Python fallback.
cd /d "%~dp0"
node server.js
pause
