Add-Type -AssemblyName System.Drawing
function Peta($path,$label){
  $img=[System.Drawing.Bitmap]::FromFile($path)
  Write-Output "=== $label ($($img.Width)x$($img.Height)) ==="
  Write-Output "-- horizontal y=500 (batas kolom) --"
  $prev=$null
  for($x=0;$x -lt $img.Width;$x++){
    $c=$img.GetPixel($x,500); $k="$($c.R),$($c.G),$($c.B)"
    if($k -ne $prev){ Write-Output ("   x={0,4} {1}" -f $x,$k); $prev=$k }
  }
  $img.Dispose()
}
Peta "D:\Referensi TRAE Agent Window\1.png" "TRAE"
Peta "D:\Referensi TRAE Agent Window\agents zephyr 2.png" "ZEPHYR"
