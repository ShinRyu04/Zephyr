@echo off
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223
cd /d D:\Zephyr\src-tauri
start "" "D:\Zephyr\src-tauri\target\debug\zephyr.exe"
