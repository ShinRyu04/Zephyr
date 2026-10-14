@echo off
rem Peluncur zephyr.exe (debug, WebView2 remote debugging :9223).
rem Dilewatkan lewat explorer.exe dari harness supaya prosesnya lepas dari Job Object sesi Hermes.
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223
cd /d D:\Zephyr\src-tauri
if not exist "%LOCALAPPDATA%\Temp" mkdir "%LOCALAPPDATA%\Temp"
.\target\debug\zephyr.exe > "%LOCALAPPDATA%\Temp\zephyr-app.log" 2>&1
