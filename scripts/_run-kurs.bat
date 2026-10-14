@echo off
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
cd /d D:\Zephyr
"%NODE%" scripts\uji-kurs-dollar.mjs 9223 > "%LOCALAPPDATA%\Temp\zephyr-kurs.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-kurs.log"
