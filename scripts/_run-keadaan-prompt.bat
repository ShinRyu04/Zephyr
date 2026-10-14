@echo off
rem Jalankan harness bukti "keadaan runtime ada di prompt yang dikirim" di luar
rem Job Object sesi Hermes (dipanggil via explorer.exe oleh runner).
rem Hasilnya ditulis ke %LOCALAPPDATA%\Temp\zephyr-keadaan.log (dan baris laporan
rem ikut ke zephyr-keadaan-uji.log lewat UJI_LOG).
set NODE=C:\Users\Zyrex\AppData\Local\hermes\tools\node-26.7.0-win32-x64\node.exe
cd /d D:\Zephyr
set UJI_LOG=%LOCALAPPDATA%\Temp\zephyr-keadaan-uji.log
"%NODE%" scripts\uji-keadaan-prompt.mjs 9223 8098 > "%LOCALAPPDATA%\Temp\zephyr-keadaan.log" 2>&1
echo EXIT=%ERRORLEVEL% >> "%LOCALAPPDATA%\Temp\zephyr-keadaan.log"
