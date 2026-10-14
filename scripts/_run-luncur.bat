@echo off
rem Jalankan Zephyr DEBUG + CDP 9223 lewat skrip luncur (tanpa merebut fokus).
rem Dipakai dari terminal Hermes: explorer.exe skrip ini supaya prosesnya
rem LEPAS dari Job Object sesi Hermes dan tidak ikut mati saat sesi dibersihkan.
rem Log: %LOCALAPPDATA%\Temp\zephyr-luncur.log
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Zephyr\scripts\luncur-zephyr.ps1 -Tunggu 60 > "%LOCALAPPDATA%\Temp\zephyr-luncur.log" 2>&1
