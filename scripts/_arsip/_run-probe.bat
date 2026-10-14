@echo off
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
cd /d D:\Zephyr
"%NODE%" scripts\_probe-eval.mjs 9223 http://localhost:5173 > "%LOCALAPPDATA%\Temp\zephyr-probe.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-probe.log"
