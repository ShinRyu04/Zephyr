@echo off
rem Peluncur vite dev (5173) untuk sesi uji Zephyr.
rem Dilewatkan lewat explorer.exe dari harness supaya prosesnya lepas dari Job Object sesi Hermes.
cd /d D:\Zephyr
if not exist "%LOCALAPPDATA%\Temp" mkdir "%LOCALAPPDATA%\Temp"
npm run dev > "%LOCALAPPDATA%\Temp\zephyr-vite.log" 2>&1
