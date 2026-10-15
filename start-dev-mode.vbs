' Jalankan mode dev Zephyr TANPA ikut Job Object Hermes.
' Dilepas lewat explorer.exe, jadi prosesnya awet setelah sesi agent dibersihkan.
Dim sh, fso, logPath, proj
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

proj = "D:\Zephyr"
logPath = proj & "\dev-mode.log"

' tulis kepala log supaya kelihatan kapan dijalankan
Dim ts
Set ts = fso.CreateTextFile(logPath, True)
ts.WriteLine "=== ZEPHYR DEV MODE LAUNCH ==="
ts.WriteLine "waktu: " & Now
ts.WriteLine "proj : " & proj
ts.Close

sh.CurrentDirectory = proj
' CDP 9223 hanya kebuka kalau env var ini diset SEBELUM WebView2 lahir.
' Dipakai harness (AGENTS.md#2 terminal B); port 9223 dilarang jadi fallback MCP.
sh.Environment("PROCESS")("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") = "--remote-debugging-port=9223"
' 0 = jendela disembunyikan; keluaran dialihkan ke log
sh.Run "cmd /c npm run tauri:dev >> """ & logPath & """ 2>&1", 0, False
