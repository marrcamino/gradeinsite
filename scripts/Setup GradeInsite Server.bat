@echo off
REM GradeInsite - school server setup.
REM
REM Double-click this. It asks for administrator rights (the installer writes
REM into xampp\htdocs, registers Apache as a service and opens port 80), then
REM hands over to setup-server.ps1 beside it.
REM
REM The -ExecutionPolicy Bypass below is why this file exists at all: a .ps1
REM opens in Notepad when double-clicked, and Windows refuses unsigned scripts
REM by default. Bypass applies to this one run and changes no machine setting.

setlocal
set "SCRIPT=%~dp0setup-server.ps1"

if not exist "%SCRIPT%" (
  echo Cannot find setup-server.ps1 next to this file.
  echo Unzip the whole folder and run it from there.
  pause
  exit /b 1
)

REM Re-launch elevated if this is not already an administrator shell.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Asking for administrator rights...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*

echo.
pause
