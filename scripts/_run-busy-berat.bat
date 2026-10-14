@echo off
rem Jalankan uji agentBusy berat di luar Job Object sesi Hermes (dipanggil via explorer.exe).
rem Hasilnya ditulis ke %TEMP%\zephyr-busyberat3.log - log yang hanya berisi baris
rem "menunggu idle..." berarti node-nya tidak pernah sampai attach, bukan "masih sibuk".
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
cd /d D:\Zephyr
set MENIT=8
set STABIL=10
del /q "%LOCALAPPDATA%\Temp\zephyr-busyberat3.log" 2>nul
"%NODE%" scripts\util-tunggu-idle.mjs 9223 >> "%LOCALAPPDATA%\Temp\zephyr-busyberat3.log" 2>&1
echo IDLE=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-busyberat3.log"
"%NODE%" scripts\uji-busy-berat.mjs 9223 D:/Testing/busy-berat >> "%LOCALAPPDATA%\Temp\zephyr-busyberat3.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-busyberat3.log"
