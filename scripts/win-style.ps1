$p = Get-Process zephyr -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Output "no zephyr"; exit 1 }

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WS {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
}
"@

$h = $p.MainWindowHandle
$style = [WS]::GetWindowLong($h, -16)
$wr = New-Object WS+R; [WS]::GetWindowRect($h, [ref]$wr) | Out-Null
$cr = New-Object WS+R; [WS]::GetClientRect($h, [ref]$cr) | Out-Null

$wW = $wr.Rt - $wr.L; $wH = $wr.B - $wr.T
$cW = $cr.Rt - $cr.L; $cH = $cr.B - $cr.T
$WS_CAPTION = 0x00C00000
$WS_THICKFRAME = 0x00040000

Write-Output "hwnd=$h style=0x$('{0:X8}' -f $style)"
Write-Output "caption=$([bool]($style -band $WS_CAPTION)) thickframe=$([bool]($style -band $WS_THICKFRAME))"
Write-Output "window=${wW}x${wH} client=${cW}x${cH} frameX=$($wW-$cW) frameY=$($wH-$cH)"
