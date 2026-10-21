Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\1.png")
Write-Output "ukuran: $($img.Width) x $($img.Height)"
$img.Dispose()
