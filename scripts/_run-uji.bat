@echo off
rem Jalankan harness uji berat di luar Job Object sesi Hermes (dipanggil via explorer.exe).
rem Hasilnya ditulis ke %TEMP%\zephyr-uji.log
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
cd /d D:\Zephyr
set UJI_MENIT=10
"%NODE%" scripts\uji-tugas-berat.mjs 9223 D:/Testing/berat > "%LOCALAPPDATA%\Temp\zephyr-uji4.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-uji4.log"
