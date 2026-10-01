# cek-dekorasi.ps1 — bukti DEFINITIF ada/tidaknya title bar native.
#
# Kenapa bukan screenshot: CopyFromScreen mengambil apa pun yang tampil di
# layar pada koordinat itu — kalau jendela lain menutupi, yang tertangkap
# jendela lain (pernah kejadian: yang tertangkap window Abel, bukan Zephyr).
#
# Cara yang tidak bisa salah: baca STYLE BIT jendela.
#   WS_CAPTION (0x00C00000) = jendela punya title bar native.
# Kalau decorations:false, bit ini TIDAK terpasang. Plus cek geometri:
# jendela ber-caption lebih tinggi ~31px dari client area-nya.
#
# Pakai: powershell -File scripts/cek-dekorasi.ps1 [namaProses]

param([string]$Name = "zephyr")

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinStyle {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$WS_CAPTION    = 0x00C00000
$WS_THICKFRAME = 0x00040000
$GWL_STYLE     = -16

$procs = Get-Process -Name $Name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
if (-not $procs) { Write-Output "GAGAL: jendela '$Name' tidak ditemukan"; exit 1 }

foreach ($p in $procs) {
  $h = $p.MainWindowHandle
  $style = [WinStyle]::GetWindowLong($h, $GWL_STYLE)

  $hasCaption = ($style -band $WS_CAPTION) -eq $WS_CAPTION
  $hasFrame   = ($style -band $WS_THICKFRAME) -eq $WS_THICKFRAME

  $wr = New-Object WinStyle+RECT
  $cr = New-Object WinStyle+RECT
  [WinStyle]::GetWindowRect($h, [ref]$wr) | Out-Null
  [WinStyle]::GetClientRect($h, [ref]$cr) | Out-Null

  $winW = $wr.Right - $wr.Left; $winH = $wr.Bottom - $wr.Top
  $cliW = $cr.Right - $cr.Left; $cliH = $cr.Bottom - $cr.Top
  $selisih = $winH - $cliH

  Write-Output ("pid={0}  judul=[{1}]" -f $p.Id, $p.MainWindowTitle)
  Write-Output ("  window {0}x{1} | client {2}x{3} | selisih tinggi {4}px" -f $winW, $winH, $cliW, $cliH, $selisih)
  # CATATAN PENTING: Tauri v2 dengan decorations:false TETAP memakai style
  # WS_CAPTION|WS_THICKFRAME di level Win32 (dipakai untuk resize border),
  # jadi bit style BUKAN penanda yang bisa dipercaya. Yang menentukan adalah
  # SELISIH TINGGI: border resize saja ~8-15px, title bar native ~30-38px.
  Write-Output ("  WS_CAPTION (informatif)       : {0}" -f $(if ($hasCaption) { "ADA (normal untuk Tauri frameless)" } else { "TIDAK ADA" }))
  Write-Output ("  WS_THICKFRAME (border resize) : {0}" -f $(if ($hasFrame) { "ADA (border resize)" } else { "TIDAK ADA" }))
  Write-Output ("  VERDICT: {0}" -f $(if ($selisih -gt 20) { "ADA TITLE BAR NATIVE (duplikat)" } else { "BERSIH - hanya border resize, tanpa title bar" }))
}
