Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\Zephyr"
sh.Run "cmd /c _dev-vite.bat", 0, False
