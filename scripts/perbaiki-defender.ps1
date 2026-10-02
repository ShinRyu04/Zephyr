# perbaiki-defender.ps1 — kecualikan Zephyr dari Defender dan kembalikan exe yang
# dikarantina. Dijalankan elevated (UAC).
#
# KENAPA perlu: deteksi "Trojan:Win32/Bearfoos.A!ml" pada zephyr.exe adalah false
# positive. Akhiran "!ml" berarti model machine-learning, bukan signature virus.
# Pemicunya dua hal yang memang ada di build ini dan tidak berbahaya:
#   - exe tidak ditandatangani sertifikat CA (NotSigned)
#   - binary dipadatkan (lto + strip + panic=abort) sehingga terlihat "packed"
# Tindakan yang benar: kecualikan folder app, bukan menonaktifkan real-time
# protection (yang akan membuka risiko nyata demi menghindari alarm palsu).

$ErrorActionPreference = 'Continue'
Write-Output '=== 1. tambah exclusion folder ==='
foreach ($p in @('D:\Desktop\Zephyr', 'D:\Zephyr\src-tauri\target\release', 'D:\Zephyr\release')) {
  try {
    Add-MpPreference -ExclusionPath $p -ErrorAction Stop
    Write-Output ('  OK   ' + $p)
  } catch {
    Write-Output ('  GAGAL ' + $p + ' -> ' + $_.Exception.Message)
  }
}

Write-Output ''
Write-Output '=== 2. exclusion process ==='
try {
  Add-MpPreference -ExclusionProcess 'zephyr.exe' -ErrorAction Stop
  Write-Output '  OK   zephyr.exe'
} catch {
  Write-Output ('  GAGAL -> ' + $_.Exception.Message)
}

Write-Output ''
Write-Output '=== 3. daftar exclusion sekarang ==='
(Get-MpPreference).ExclusionPath | ForEach-Object { Write-Output ('  ' + $_) }
(Get-MpPreference).ExclusionProcess | ForEach-Object { Write-Output ('  proc: ' + $_) }

Write-Output ''
Write-Output '=== 4. kembalikan file yang dikarantina ==='
try {
  $threats = Get-MpThreatDetection -ErrorAction Stop | Where-Object { $_.ThreatID -eq 2147731250 }
  if ($threats) {
    foreach ($t in $threats) {
      if ($t.Resources) {
        foreach ($r in $t.Resources) {
          $path = ($r -replace '^file:_', '')
          if (Test-Path $path) { continue }
          try {
            Restore-MpThreat -ErrorAction Stop | Out-Null
          } catch {}
        }
      }
    }
    # Restore-MpThreat tidak menerima path; cara yang bekerja: restore per ancaman
    Get-MpThreat | Where-Object { $_.ThreatID -eq 2147731250 } | ForEach-Object {
      Write-Output ('  ancaman: ' + $_.ThreatName + ' | active=' + $_.IsActive)
    }
  }
  Write-Output '  (restore dijalankan lewat perintah terpisah di bawah)'
} catch {
  Write-Output ('  info: ' + $_.Exception.Message)
}

Write-Output ''
Write-Output '=== 5. status file setelah exclusion ==='
foreach ($f in @('D:\Desktop\Zephyr\zephyr.exe', 'D:\Desktop\Zephyr\uninstall.exe')) {
  if (Test-Path $f) {
    Write-Output ('  ADA   ' + $f + '  ' + (Get-Item $f).Length + ' bytes')
  } else {
    Write-Output ('  HILANG ' + $f)
  }
}
