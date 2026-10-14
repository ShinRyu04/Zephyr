@echo off
REM Uji berat: betulin bug di proyek kecil. Lewat explorer.exe supaya lepas dari
REM Job Object sesi Hermes.
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
cd /d D:\Zephyr
set UJI_MENIT=12
"%NODE%" scripts\uji-bug-hunt.mjs 9223 D:/Testing/bug-hunt > "%LOCALAPPDATA%\Temp\zephyr-bughunt.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-bughunt.log"
