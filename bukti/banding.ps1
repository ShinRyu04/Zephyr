# banding.ps1 — susun referensi (kiri) + app (kanan) berdampingan.
# Dipakai untuk bukti visual permukaan Experts; butuh System.Drawing (bawaan Windows).
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot          # D:\Zephyr-lab
$ref  = 'D:/Zephyr/Referensi Qoder Expert'
$out  = $PSScriptRoot

$pasangan = @(
  @{ nama = 'banding-chat';     kiri = 'Screenshot 2026-10-30 022540.png'; kanan = 'app-chat.png';    tinggi = 420 },
  @{ nama = 'banding-created';  kiri = 'Screenshot 2026-11-01 044850.png'; kanan = 'app-creating.png'; tinggi = 300 },
  @{ nama = 'banding-created2'; kiri = 'Screenshot 2026-11-01 044920.png'; kanan = 'app-chatfull.png'; tinggi = 620 },
  @{ nama = 'banding-tasktab';  kiri = 'Screenshot 2026-10-30 022709.png'; kanan = 'app-tasktab.png'; tinggi = 900 },
  @{ nama = 'banding-strip';    kiri = 'Screenshot 2026-10-30 110036.png'; kanan = 'app-strip.png';   tinggi = 900 },
  @{ nama = 'banding-queue';    kiri = 'Screenshot 2026-10-30 064955.png'; kanan = 'app-queue.png';   tinggi = 420 }
)

$pad = 18
$judul = 26

foreach ($p in $pasangan) {
  $kiriPath  = Join-Path $ref  $p.kiri
  $kananPath = Join-Path $out  $p.kanan
  if (-not (Test-Path $kiriPath))  { Write-Host "lewati $($p.nama): referensi tidak ada"; continue }
  if (-not (Test-Path $kananPath)) { Write-Host "lewati $($p.nama): potret app tidak ada"; continue }

  $kiri  = [System.Drawing.Image]::FromFile($kiriPath)
  $kanan = [System.Drawing.Image]::FromFile($kananPath)

  # Skala kedua sisi ke TINGGI yang sama supaya bisa dibandingkan baris per baris.
  $h = [int]$p.tinggi
  $wk = [int]($kiri.Width  * $h / $kiri.Height)
  $wc = [int]($kanan.Width * $h / $kanan.Height)

  $lebar  = $wk + $wc + $pad * 3
  $tinggi = $h + $pad * 2 + $judul
  $bmp = New-Object System.Drawing.Bitmap($lebar, $tinggi)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::FromArgb(20, 20, 20))

  $font = New-Object System.Drawing.Font('Segoe UI', 11)
  $kuas = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(190, 190, 190))
  $g.DrawString('REFERENSI QODER', $font, $kuas, $pad, 6)
  $g.DrawString('ZEPHYR (SANDBOX)', $font, $kuas, ($pad * 2 + $wk), 6)

  $g.DrawImage($kiri,  $pad,              ($pad + $judul), $wk, $h)
  $g.DrawImage($kanan, ($pad * 2 + $wk),  ($pad + $judul), $wc, $h)

  $tujuan = Join-Path $out ($p.nama + '.png')
  $bmp.Save($tujuan, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose(); $bmp.Dispose(); $kiri.Dispose(); $kanan.Dispose(); $font.Dispose(); $kuas.Dispose()
  Write-Host "tulis $tujuan"
}
