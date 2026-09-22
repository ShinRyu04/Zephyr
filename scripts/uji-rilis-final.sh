#!/usr/bin/env bash
# uji-rilis-final.sh — ukur artefak RILIS 1.1.10 apa adanya (tanpa env var).
#
# Yang dibuktikan sekaligus:
#   1. flag RAM benar-benar ada di command line webview2 build rilis
#   2. RAM (private working set, whole tree) — angka Task Manager
#   3. UI benar-benar termuat + warna normal (screenshot jendela asli)
#
# Catatan: single-instance plugin memblokir instance kedua, jadi dev harus
# dimatikan dulu. Skrip ini TIDAK menyalakan dev lagi — itu langkah terpisah.
set -u
cd "$(dirname "$0")/.." || exit 1

SHOT="$LOCALAPPDATA/Temp/ram-1110-final.png"

echo "=== 1. matikan semua zephyr/webview2, tunggu benar-benar 0 ==="
powershell -NoProfile -Command "Stop-Process -Name zephyr,msedgewebview2 -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1
n="?"
for i in $(seq 1 25); do
  n=$(powershell -NoProfile -Command "@(Get-Process zephyr -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r')
  [ "$n" = "0" ] && break
  sleep 1
done
echo "sisa proses zephyr: $n"

echo "=== 2. jalankan build rilis (TANPA env var sama sekali) ==="
env -u WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS src-tauri/target/release/zephyr.exe >/dev/null 2>&1 &
sleep 25

echo "=== 3. flag RAM benar-benar terpasang? ==="
powershell -NoProfile -Command "\$p = @(Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object { \$_.CommandLine -match 'renderer-process-limit' }); Write-Output ('proses webview2 dengan flag Zephyr: ' + \$p.Count); if (\$p.Count -gt 0) { (\$p[0].CommandLine -split ' ') | Where-Object { \$_ -match '^-{2}(disable-gpu|in-process-gpu|renderer-process-limit|js-flags|disable-background-networking)' } }" 2>/dev/null | tr -d '\r'

echo "=== 4. RAM (angka Task Manager) ==="
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ram-tree.ps1 2>/dev/null | grep -E "zephyr: |PRIVATE working set total"

echo "=== 5. screenshot jendela asli ==="
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shot-jendela.ps1 "$SHOT" 2>&1 | tail -2

echo "=== 6. analisis warna + isi UI ==="
python - "$SHOT" <<'PY'
import sys, os
from PIL import Image
from collections import Counter
f = sys.argv[1]
if not os.path.exists(f):
    print("GAGAL: screenshot tidak ada"); raise SystemExit(1)
im = Image.open(f).convert('RGB')
c = Counter(im.getdata()); tot = sum(c.values())
k17 = sum(v for k, v in c.items() if all(x % 17 == 0 for x in k))
hijau = sum(v for k, v in c.items() if k[1] > 60 and k[1]-k[0] > 25 and k[1]-k[2] > 15)
biru_edge = sum(v for k, v in c.items() if abs(k[0]-0x00) < 25 and abs(k[1]-0x78) < 30 and abs(k[2]-0xD4) < 30)
print("ukuran   : %dx%d" % im.size)
print("4-bit    : %.2f%%  (harus ~0)" % (100.0*k17/tot))
print("hijau    : %.2f%%  (harus ~0)" % (100.0*hijau/tot))
print("biru Edge: %.2f%%  (halaman error kalau besar)" % (100.0*biru_edge/tot))
print("dominan  : %s" % ' '.join('#%02X%02X%02X' % k for k, _ in c.most_common(4)))
PY
echo selesai
