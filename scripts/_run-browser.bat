@echo off
REM Uji: agent buka browser pane + baca isi halaman. Lewat explorer.exe supaya
REM lepas dari Job Object sesi Hermes.
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
cd /d D:\Zephyr
"%NODE%" scripts\uji-browser-baca.mjs 9223 > "%LOCALAPPDATA%\Temp\zephyr-browser.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-browser.log"
