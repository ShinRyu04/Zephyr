# Matikan SELURUH pohon dev Zephyr (root: cmd.exe yang jalanin `npm run tauri:dev`).
# Windows tidak membunuh anak ketika induk dimatikan, jadi kumpulkan semua keturunan dulu.
param([int]$RootPid = 26500)

$all = Get-CimInstance Win32_Process
$byParent = @{}
foreach ($p in $all) {
    if (-not $byParent.ContainsKey($p.ParentProcessId)) { $byParent[$p.ParentProcessId] = @() }
    $byParent[$p.ParentProcessId] += $p
}

# BFS turun mencari semua keturunan root
$kill = New-Object System.Collections.ArrayList
$queue = New-Object System.Collections.Queue
$queue.Enqueue($RootPid)
$seen = @{}
while ($queue.Count -gt 0) {
    $id = $queue.Dequeue()
    if ($seen.ContainsKey($id)) { continue }
    $seen[$id] = $true
    [void]$kill.Add($id)
    if ($byParent.ContainsKey($id)) {
        foreach ($c in $byParent[$id]) { $queue.Enqueue($c.ProcessId) }
    }
}

Write-Output ('Pohon yang akan dimatikan ({0} proses): {1}' -f $kill.Count, ($kill -join ', '))

foreach ($id in $kill) {
    try {
        Stop-Process -Id $id -Force -ErrorAction Stop
        Write-Output ('  mati PID {0}' -f $id)
    } catch {
        Write-Output ('  lewat PID {0} (sudah mati / bukan milik kita)' -f $id)
    }
}

Start-Sleep -Seconds 3

# Pastikan tidak ada sisa
$sisa = Get-Process zephyr -ErrorAction SilentlyContinue
if ($sisa) { Write-Output 'PERINGATAN: zephyr.exe masih hidup.' } else { Write-Output 'zephyr.exe sudah tidak ada. BERSIH.' }
