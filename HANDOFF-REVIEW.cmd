@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  pause
  exit /b 1
)
node scripts\handoff.mjs ui
if errorlevel 1 pause
