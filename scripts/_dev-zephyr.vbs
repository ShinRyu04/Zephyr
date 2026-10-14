' Jalankan Zephyr dev dengan port debug WebView2 9223.
' Dipanggil lewat explorer.exe supaya prosesnya lepas dari Job Object sesi Hermes.
Set sh = CreateObject("WScript.Shell")
sh.Environment("PROCESS")("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") = "--remote-debugging-port=9223"
sh.CurrentDirectory = "D:\Zephyr\src-tauri"
sh.Run """D:\Zephyr\src-tauri\target\debug\zephyr.exe""", 0, False
