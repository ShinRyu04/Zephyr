@echo off
REM Tugas raksasa 44 berkas; log ke %LOCALAPPDATA%\Temp\zephyr-raksasa.log
cd /d D:\Zephyr
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
"%NODE%" scripts\uji-raksasa.mjs 9223 D:/Testing 45 > "%LOCALAPPDATA%\Temp\zephyr-raksasa.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-raksasa.log"
