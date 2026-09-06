@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [PDS] Node.js 22+ is required. Install Node.js and reopen this file.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [PDS] npm was not found.
  pause
  exit /b 1
)
echo [PDS] Checking dependencies...
if not exist node_modules (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
)
echo [PDS] Starting Professional Director Station...
call npm run dev -- --host 127.0.0.1
exit /b %errorlevel%
:error
echo [PDS] Startup failed. See the error above.
pause
exit /b 1
