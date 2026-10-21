$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
cd D:\Zephyr
npm run tauri:dev 2>&1 | Out-File -Encoding utf8 "$env:TEMP\zephyr-dev.log"
