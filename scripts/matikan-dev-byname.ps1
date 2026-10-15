# Matikan semua proses yang terlibat dev-mode Zephyr, dengan mencocokkan command line.
# Dipakai karena pelacakan induk (parent PID) tidak selalu andal di mesin ini.
$all = Get-CimInstance Win32_Process

$targets = @()
foreach ($p in $all) {
    $cmd = ''
    if ($p.CommandLine) { $cmd = $p.CommandLine }

    $kena = $false
    if ($p.Name -eq 'zephyr.exe') { $kena = $true }
    elseif ($p.Name -eq 'cargo.exe' -and $cmd -like '*Zephyr*') { $kena = $true }
    elseif ($cmd -like '*D:\Zephyr*' -and ($cmd -like '*vite*' -or $cmd -like '*tauri*')) { $kena = $true }

    if ($kena) {
        $targets += [pscustomobject]@{ Id = $p.ProcessId; Name = $p.Name }
    }
}

if ($targets.Count -eq 0) {
    Write-Output 'Tidak ada proses dev Zephyr yang cocok. Sudah bersih.'
    return
}

Write-Output ('Mematikan {0} proses:' -f $targets.Count)
foreach ($t in $targets) {
    try {
        Stop-Process -Id $t.Id -Force -ErrorAction Stop
        Write-Output ('  mati PID {0} ({1})' -f $t.Id, $t.Name)
    } catch {
        Write-Output ('  lewat PID {0} ({1})' -f $t.Id, $t.Name)
    }
}

Start-Sleep -Seconds 4

$sisaZ = Get-Process zephyr -ErrorAction SilentlyContinue
if ($sisaZ) { Write-Output 'PERINGATAN: zephyr.exe masih hidup.' } else { Write-Output 'zephyr.exe sudah tidak ada.' }
