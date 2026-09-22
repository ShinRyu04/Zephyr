# ram-tree.ps1 — ukur RAM satu proses + SEMUA turunannya (webview2 dll).
#
# Kenapa bukan Get-Process WorkingSet64: working set tiap proses ikut menghitung
# DLL bersama (msedgewebview2.dll ~150 MB) berulang kali, jadi jumlah 6 proses
# bisa terlihat 428 MB padahal nyata jauh lebih kecil. Task Manager memakai
# "Memory (private working set)" — itu yang kita ukur di sini.
param([string]$Name = 'zephyr')

$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
$root = $all | Where-Object { $_.Name -eq "$Name.exe" }
if (-not $root) { Write-Output "$Name tidak jalan"; exit }

# telusuri anak-cucu
$ids = New-Object System.Collections.Generic.HashSet[int]
foreach ($r in $root) { [void]$ids.Add([int]$r.ProcessId) }
$changed = $true
while ($changed) {
  $changed = $false
  foreach ($p in $all) {
    if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
      [void]$ids.Add([int]$p.ProcessId); $changed = $true
    }
  }
}

$totalPriv = 0.0; $totalWs = 0.0; $rows = @()
foreach ($id in $ids) {
  $c = Get-Counter "\Process(*)\ID Process" -ErrorAction SilentlyContinue
  break
}
# PerformanceCounter per-PID lebih tepat
foreach ($id in $ids) {
  try {
    $priv = (Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
      Where-Object { $_.IDProcess -eq $id } | Select-Object -First 1).WorkingSetPrivate
    $ws = (Get-Process -Id $id -ErrorAction SilentlyContinue).WorkingSet64
  } catch { $priv = $null; $ws = $null }
  if ($null -eq $priv) { $priv = 0 }
  $totalPriv += [double]$priv
  if ($ws) { $totalWs += [double]$ws }
  $nm = ($all | Where-Object { $_.ProcessId -eq $id } | Select-Object -First 1).Name
  $rows += [pscustomobject]@{ pid = $id; name = $nm; privateMB = [math]::Round([double]$priv/1MB,1) }
}

$rows | Sort-Object privateMB -Descending | Format-Table -AutoSize | Out-String -Width 120 | Write-Output
Write-Output ("{0}: {1} proses" -f $Name, $ids.Count)
Write-Output ("PRIVATE working set total : {0:N1} MB   <- angka Task Manager" -f ($totalPriv/1MB))
Write-Output ("working set total (dobel) : {0:N1} MB" -f ($totalWs/1MB))
