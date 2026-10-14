@echo off
REM Uji berat: aplikasi Electron catatan. Dijalankan lewat explorer.exe supaya
REM proses lepas dari Job Object sesi Hermes (kalau tidak, run ikut mati).
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
cd /d D:\Zephyr
set UJI_MENIT=15
"%NODE%" scripts\uji-electron-catatan.mjs 9223 D:/Testing/electron-catatan > "%LOCALAPPDATA%\Temp\zephyr-electron.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-electron.log"
