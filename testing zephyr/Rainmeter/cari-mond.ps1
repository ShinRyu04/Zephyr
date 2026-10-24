$ProgressPreference = 'SilentlyContinue'
$ua = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
$urls = @(
  'https://www.deviantart.com/search?q=mond%20rainmeter',
  'https://visualskins.com/skin/mond',
  'https://www.rainmeter.net/discover'
)
foreach ($u in $urls) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -Headers $ua -TimeoutSec 20
    Write-Output ("=== $u  STATUS=" + $r.StatusCode + "  LEN=" + $r.Content.Length)
    $m = [regex]::Matches($r.Content, 'href="([^"]*mond[^"]*)"', 'IgnoreCase')
    $seen = @{}
    foreach ($x in $m) {
      $h = $x.Groups[1].Value
      if (-not $seen.ContainsKey($h)) { $seen[$h] = 1; Write-Output ("  LINK " + $h) }
    }
    if ($m.Count -eq 0) { Write-Output '  (tidak ada tautan mond)' }
  } catch {
    Write-Output ("=== $u  GAGAL: " + $_.Exception.Message)
  }
}
