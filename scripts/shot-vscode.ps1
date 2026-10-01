Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VC {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process Code -EA SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output '  VS Code tidak jalan'; exit 1 }
[void][VC]::ShowWindow($p.MainWindowHandle, 5)
[void][VC]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 1400
$r = New-Object VC+RECT
[void][VC]::GetWindowRect($p.MainWindowHandle, [ref]$r)
# menubar VS Code di offset 20; ambil 200x40 mulai 12 (8px margin atas)
$w = 200; $h = 40; $mulai = 12
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top + $mulai, 0, 0, (New-Object System.Drawing.Size($w, $h)))
$g.Dispose()
$f = 10
$besar = New-Object System.Drawing.Bitmap(($w*$f), ($h*$f))
$g2 = [System.Drawing.Graphics]::FromImage($besar)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g2.DrawImage($bmp, 0, 0, $besar.Width, $besar.Height)
$g2.Dispose()
$out = 'D:\Zephyr\vscode-menu.png'
$besar.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose(); $besar.Dispose()
Write-Output "  disimpan: $out"
