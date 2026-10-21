Add-Type -AssemblyName System.Drawing
$img=[System.Drawing.Bitmap]::FromFile("D:\Referensi TRAE Agent Window\composer.png")
function Px($x,$y,$lbl){ $c=$img.GetPixel($x,$y); Write-Output ("  {0,-28} ({1,3},{2,3}) = {3},{4},{5}" -f $lbl,$x,$y,$c.R,$c.G,$c.B) }
Write-Output "=== latar & isi baris kontrol (y=140) ==="
Px 30 140 "gap sebelum +"
Px 50 140 "isi tombol +"
Px 80 140 "isi chip approval"
Px 130 140 "isi chip approval(2)"
Px 250 140 "isi chip @Agent"
Px 400 140 "gap besar"
Px 550 140 "isi chip model"
Px 700 140 "gap sebelum send"
Px 720 140 "ISI TOMBOL SEND"
Px 100 132 "teks approval (atas)"
Px 100 148 "teks approval (bawah)"
$img.Dispose()
