# Membuat Mond.rmskin dari folder ini.
# Jalankan di PowerShell pada folder tempat skrip ini berada:
#   powershell -ExecutionPolicy Bypass -File .\build-rmskin.ps1
# Hasil: Mond.rmskin di folder yang sama.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out  = Join-Path $root 'Mond.rmskin'

if (Test-Path $out) { Remove-Item $out -Force }

$zip = Join-Path $env:TEMP ('mond-' + [guid]::NewGuid().ToString('N') + '.zip')

Compress-Archive -Path (Join-Path $root 'Skins'), (Join-Path $root 'Layouts'), (Join-Path $root 'RMSKIN.ini') -DestinationPath $zip -Force
Move-Item $zip $out -Force

Write-Host "Selesai: $out"
Write-Host ("Ukuran: {0:N0} byte" -f (Get-Item $out).Length)
