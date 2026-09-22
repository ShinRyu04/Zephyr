#!/usr/bin/env bash
# ram-sweep-cepat.sh — sweep flag via env var (TERBUKTI menang atas config di build rilis).
#
# Kenapa ini valid: WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS di-set → nilai config
# diabaikan (dibuktikan: js-flags=777 dari env menang atas 192 dari config).
# Jadi sweep di sini mengukur kombinasi yang sama persis dengan yang nanti
# ditulis ke config.
#
# Setiap kandidat: kill → tunggu 0 → launch → cek UI benar-benar termuat
# (bukan halaman error) → ukur RAM. Tanpa cek UI, angka kecil itu palsu.
set -u
cd "$(dirname "$0")/.." || exit 1
EXE="src-tauri/target/release/zephyr.exe"
BASE="--disable-background-networking --no-first-run --disable-component-update --disable-domain-reliability --disable-sync --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,msEdgeIdentity,msEdgeSync,msEdgeAutofill,msEdgeSidebar,msEdgeShoppingAssistant,msEdgeCollections,msEdgeWorkspaces"

bersih() {
  powershell -NoProfile -Command "Stop-Process -Name zephyr,msedgewebview2 -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1
  for i in $(seq 1 20); do
    n=$(powershell -NoProfile -Command "@(Get-Process zephyr -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r')
    [ "$n" = "0" ] && return 0
    sleep 1
  done
}

cek_ui() {
  node -e "
import('file:///D:/Zephyr/scripts/lib-cdp.mjs').then(async ({Cdp})=>{
  try {
    const t = await (await fetch('http://127.0.0.1:9224/json/list')).json();
    const p = t.find(x=>x.type==='page'); if(!p){console.log('TIDAK-ADA-PAGE');process.exit(0)}
    const c = await Cdp.connect(p.webSocketDebuggerUrl);
    console.log(await c.eval('JSON.stringify({u:location.href,r:document.getElementById(\"root\")?.innerHTML.length||0})'));
    process.exit(0);
  } catch(e) { console.log('GAGAL-CDP'); process.exit(0) }
})" 2>/dev/null | tail -1
}

ukur() { powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ram-tree.ps1 2>/dev/null | grep 'PRIVATE working set total' | sed 's/.*: //; s/ MB.*//'; }

uji() {
  local nama="$1" flags="$2"
  bersih
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="$flags --remote-debugging-port=9224" "$EXE" >/dev/null 2>&1 &
  sleep 24
  local ui ram
  ui=$(cek_ui); ram=$(ukur)
  echo "$nama | $ram MB | $ui"
  bersih
}

echo "=== sweep flag (UI dicek tiap kandidat) ==="
uji "A gpu-off+js192 (config skrg)" "--disable-gpu --renderer-process-limit=1 --js-flags=--max-old-space-size=192 $BASE"
uji "B in-process-gpu"              "--in-process-gpu --renderer-process-limit=1 --js-flags=--max-old-space-size=192 $BASE"
uji "C gpu-off+js128"               "--disable-gpu --renderer-process-limit=1 --js-flags=--max-old-space-size=128 $BASE"
uji "D gpu-off+js96"                "--disable-gpu --renderer-process-limit=1 --js-flags=--max-old-space-size=96 $BASE"
uji "E gpu-off+js128+spare-off"     "--disable-gpu --renderer-process-limit=1 --js-flags=--max-old-space-size=128 --disable-features=SpareRendererForSitePerProcess,CalculateNativeWinOcclusion,msWebOOUI,msPdfOOUI,msSmartScreenProtection,msEdgeIdentity,msEdgeSync,msEdgeAutofill,msEdgeSidebar,msEdgeShoppingAssistant,msEdgeCollections,msEdgeWorkspaces"
uji "F single-process"              "--single-process --js-flags=--max-old-space-size=128 $BASE"
echo selesai
