@echo off
REM Keep the Zephyr debug app running with the CDP port open.
REM The app is launched detached so closing this window does not kill it, and
REM the loop restarts it if it exits (the panel work needs a live app to verify
REM against, and it kept dying between test runs).
setlocal
cd /d D:\Zephyr\src-tauri
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223

:loop
start "" /b zephyr.exe
timeout /t 3 /nobreak >nul
powershell -NoProfile -Command "Get-Process zephyr -ErrorAction SilentlyContinue | Out-Null"
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "if (-not (Get-Process zephyr -ErrorAction SilentlyContinue)) { exit 1 }"
if errorlevel 1 goto loop
echo zephyr running
