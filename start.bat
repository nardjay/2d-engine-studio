@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if not errorlevel 1 (
  start "Clicker Studio server" /D "%~dp0" py -m http.server 8000 --bind 127.0.0.1
) else (
  where python >nul 2>&1
  if errorlevel 1 (
    echo Python was not found. Install Python or open this folder with VS Code Live Server.
    pause
    exit /b 1
  )
  start "Clicker Studio server" /D "%~dp0" python -m http.server 8000 --bind 127.0.0.1
)

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/"
