Add-Type -AssemblyName System.Drawing
function Profil($path,$label,$skala){
  $img=[System.Drawing.Bitmap]::FromFile($path)
  Write-Output "=== $label  ($($img.Width)x$($img.Height), skala=$skala) ==="
  $midX=[int]($img.Width/2)
  $prev=$null
  for($y=0;$y -lt $img.Height;$y++){
    $c=$img.GetPixel($midX,$y); $k="$($c.R),$($c.G),$($c.B)"
    if($k -ne $prev){ Write-Output ("  y={0,4} css={1,6:N1}  {2}" -f $y,($y/$skala),$k); $prev=$k }
  }
  $img.Dispose()
}
Profil "D:\Referensi TRAE Agent Window\composer zephyr 2.png" "ZEPHYR" 2
