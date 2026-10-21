$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9223'
cd D:\Zephyr
& "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run tauri:dev 2>&1 | Out-File -Encoding utf8 "$env:TEMP\zephyr-dev2.log"
