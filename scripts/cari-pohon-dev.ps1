# Cari induk (ancestors) dari zephyr.exe dan vite, supaya bisa dimatikan utuh satu pohon.
$all = Get-CimInstance Win32_Process

$z = $all | Where-Object {
    ($_.Name -eq 'zephyr.exe') -or
    ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*vite*')
}

if (-not $z) {
    Write-Output 'TIDAK ADA proses zephyr/vite yang jalan.'
    return
}

foreach ($p in $z) {
    Write-Output ('CHILD PID={0} NAME={1}' -f $p.ProcessId, $p.Name)
    $cur = $p
    for ($i = 0; $i -lt 6; $i++) {
        $par = $all | Where-Object { $_.ProcessId -eq $cur.ParentProcessId }
        if ($par) {
            $cmd = ''
            if ($par.CommandLine) {
                $cmd = $par.CommandLine.Substring(0, [Math]::Min(120, $par.CommandLine.Length))
            }
            Write-Output ('  ANCESTOR PID={0} NAME={1} :: {2}' -f $par.ProcessId, $par.Name, $cmd)
            $cur = $par
        } else {
            break
        }
    }
}
