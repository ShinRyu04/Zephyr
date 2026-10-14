@echo off
REM Jalankan uji pane start-dingin dan tulis lognya ke %LOCALAPPDATA%\Temp\zephyr-dingin.log
cd /d D:\Zephyr
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
"%NODE%" scripts\uji-pane-dingin.mjs 9223 > "%LOCALAPPDATA%\Temp\zephyr-dingin.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-dingin.log"
