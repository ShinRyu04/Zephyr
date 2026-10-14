Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\Zephyr"
sh.Run "cmd /c _dev-zephyr.bat", 0, False
