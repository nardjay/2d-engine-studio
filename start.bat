@echo off
setlocal
cd /d "%~dp0"

rem 2D Engine Studio launcher.
rem Primary: built-in PowerShell server (nothing to install).
rem Fallback: Python, if PowerShell is unavailable or blocked.

where powershell >nul 2>&1
if not errorlevel 1 (
  start "2D Engine Studio server" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
  exit /b 0
)

where py >nul 2>&1
if not errorlevel 1 (
  start "2D Engine Studio server" /D "%~dp0" py -m http.server 8000 --bind 127.0.0.1
  timeout /t 2 /nobreak >nul
  start "" "http://127.0.0.1:8000/"
  exit /b 0
)

where python >nul 2>&1
if not errorlevel 1 (
  start "2D Engine Studio server" /D "%~dp0" python -m http.server 8000 --bind 127.0.0.1
  timeout /t 2 /nobreak >nul
  start "" "http://127.0.0.1:8000/"
  exit /b 0
)

echo Could not start a local server (no PowerShell, no Python).
pause
