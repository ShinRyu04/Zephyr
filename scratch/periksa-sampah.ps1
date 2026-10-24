$root = 'D:\Zephyr'
$items = @('.tmp-secaudit','.tmp-secaudit-cf','.tmp-secaudit-clone','.zeph-tmp-secaudit','.zephyr-tmp','scratch','verify-logs','verifikasi-rilis','testfiles','screenshots')
"{0,-24} {1,10} {2,8} {3,12}" -f 'FOLDER','MB','FILES','GIT'
foreach ($d in $items) {
  $p = Join-Path $root $d
  if (-not (Test-Path $p)) { "{0,-24} {1,10}" -f $d,'TIDAK ADA'; continue }
  $files = Get-ChildItem $p -Recurse -File -Force -ErrorAction SilentlyContinue
  $mb = [math]::Round((($files | Measure-Object Length -Sum).Sum)/1MB, 2)
  $tracked = (git -C $root ls-files -- $d 2>$null | Measure-Object).Count
  $state = if ($tracked -gt 0) { "tracked:$tracked" } else { 'untracked' }
  "{0,-24} {1,10} {2,8} {3,12}" -f $d, $mb, $files.Count, $state
}
