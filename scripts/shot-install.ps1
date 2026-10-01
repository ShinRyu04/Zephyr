# shot-install.ps1 - potret jendela Zephyr terinstal (bukan dev).
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WI {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process zephyr -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like '*Desktop\Zephyr*' -and $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1
if (-not $p) { Write-Output '  Zephyr terinstal tidak jalan'; exit 1 }
Write-Output ('  pakai: ' + $p.Path)
[void][WI]::ShowWindow($p.MainWindowHandle, 5)
[void][WI]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 1500
$r = New-Object WI+RECT
[void][WI]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top + 18, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$g.Dispose()
$bmp.Save('D:\Zephyr\install-jendela.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ('  disimpan: D:\Zephyr\install-jendela.png  ' + $w + 'x' + $h)
