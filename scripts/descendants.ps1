# descendants.ps1 — daftar seluruh proses turunan sebuah PID (rekursif).
# Dipakai scripts/verify05.mjs untuk membuktikan Ctrl+C benar-benar
# menghabisi pohon proses (npm -> node -> ...), bukan hanya anak pertama.
#
# Pakai:  powershell -NoLogo -NoProfile -File scripts/descendants.ps1 -Pid 1234
# Keluaran: satu baris per proses -> "<pid>:<nama>"

param([Parameter(Mandatory = $true)][int]$RootPid)

$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
$byParent = @{}
foreach ($p in $all) {
  $ppid = [int]$p.ParentProcessId
  if (-not $byParent.ContainsKey($ppid)) { $byParent[$ppid] = @() }
  $byParent[$ppid] += $p
}

$queue = New-Object System.Collections.Queue
$queue.Enqueue($RootPid)
$seen = @{}

while ($queue.Count -gt 0) {
  $cur = [int]$queue.Dequeue()
  if ($byParent.ContainsKey($cur)) {
    foreach ($c in $byParent[$cur]) {
      $cpid = [int]$c.ProcessId
      if (-not $seen.ContainsKey($cpid)) {
        $seen[$cpid] = $true
        Write-Output ("{0}:{1}" -f $cpid, $c.Name)
        $queue.Enqueue($cpid)
      }
    }
  }
}
