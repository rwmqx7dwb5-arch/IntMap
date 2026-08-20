@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  pause
  exit /b 1
)
node scripts\handoff-inbox.mjs pull
if errorlevel 1 (
  echo.
  echo Could not sync the global GPT inbox. Existing local tasks are unchanged.
  pause
)
node scripts\handoff.mjs ui
if errorlevel 1 pause
