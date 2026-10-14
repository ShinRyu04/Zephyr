@echo off
REM Ukur jeda agentBusy setelah run kelar; log ke %LOCALAPPDATA%\Temp\zephyr-busy.log
cd /d D:\Zephyr
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
"%NODE%" scripts\uji-busy-reset.mjs 9223 > "%LOCALAPPDATA%\Temp\zephyr-busy.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-busy.log"
