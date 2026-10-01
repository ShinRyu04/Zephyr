# ram-bersih.ps1 — pisahkan RAM Zephyr sendiri dari proses anak terminal (shell PTY).
#
# Kenapa perlu: ram-tree.ps1 menelusuri SEMUA anak-cucu zephyr.exe, jadi
# setiap pane terminal menambahkan RAM powershell.exe ke "total". Angka itu
# benar untuk "biaya menjalankan Zephyr + shell yang kamu buka", tapi salah
# kalau dipakai menjawab "Zephyr makan berapa RAM".
#
# Metrik: WorkingSetPrivate (kolom "Memory" di Task Manager), sama seperti
# ram-tree.ps1. WorkingSet64 dobel-hitung DLL bersama.

$ErrorActionPreference = 'SilentlyContinue'

# --- semua proses dalam pohon zephyr.exe ---
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
$root = @($all | Where-Object { $_.Name -eq 'zephyr.exe' })
if ($root.Count -eq 0) { Write-Output 'zephyr tidak jalan'; exit }

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

$appMB = 0.0; $appN = 0; $shellMB = 0.0; $shellN = 0; $rows = @()
foreach ($id in $ids) {
    $priv = (Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
        Where-Object { $_.IDProcess -eq $id } | Select-Object -First 1).WorkingSetPrivate
    if ($null -eq $priv) { continue }
    $mb = [double]$priv / 1MB
    $nm = ($all | Where-Object { $_.ProcessId -eq $id } | Select-Object -First 1).Name
    if ($nm -match 'zephyr|msedgewebview2') { $appMB += $mb; $appN++ }
    else { $shellMB += $mb; $shellN++ }
    $rows += [pscustomobject]@{ pid = $id; name = $nm; MB = [math]::Round($mb, 1) }
}

$rows | Sort-Object MB -Descending | Format-Table -AutoSize | Out-String -Width 120 | Write-Output
Write-Output ('ZEPHYR SENDIRI (exe + webview2) : {0,7:N1} MB  ({1} proc)   <- target < 100 MB' -f $appMB, $appN)
Write-Output ('shell anak PTY (punya kamu)     : {0,7:N1} MB  ({1} proc)' -f $shellMB, $shellN)
