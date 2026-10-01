Add-Type -AssemblyName System.Drawing, System.Windows.Forms
# Tangkap layar seluruh desktop (CopyFromScreen akurat untuk caption DWM;
# PrintWindow tidak menggambar caption di Windows 26200).
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$out = $args[0]
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "saved: $out ($([math]::Round((Get-Item $out).Length/1KB)) KB) size $($b.Width)x$($b.Height)"
