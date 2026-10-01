#!/usr/bin/env bash
# uji-browser-pane.sh — pane browser (iframe) di --single-process.
#
# --single-process mematikan site isolation; pane browser Zephyr memuat iframe
# ke dev server lokal. Ini fitur unggulan, jadi harus dibuktikan jalan.
# Tombol "Split With Browser" hanya ada saat pane kosong → uji dari start bersih.
set -u
cd "$(dirname "$0")/.." || exit 1
EXE="src-tauri/target/release/zephyr.exe"
FLAGS="${1:---single-process --js-flags=--max-old-space-size=192 --renderer-process-limit=1 --disable-background-networking --no-first-run --disable-component-update --disable-domain-reliability --disable-sync --disable-features=SpareRendererForSitePerProcess,CalculateNativeWinOcclusion,msWebOOUI,msPdfOOUI,msSmartScreenProtection,msEdgeIdentity,msEdgeSync,msEdgeAutofill,msEdgeSidebar,msEdgeShoppingAssistant,msEdgeCollections,msEdgeWorkspaces}"

powershell -NoProfile -Command "Stop-Process -Name zephyr,msedgewebview2 -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1
for i in $(seq 1 20); do
  n=$(powershell -NoProfile -Command "@(Get-Process zephyr -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r')
  [ "$n" = "0" ] && break
  sleep 1
done

WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="$FLAGS --remote-debugging-port=9224" "$EXE" >/dev/null 2>&1 &
sleep 25

echo "=== klik 'Split With Browser' ==="
node -e "
import('file:///D:/Zephyr/scripts/lib-cdp.mjs').then(async ({Cdp})=>{
  const t = await (await fetch('http://127.0.0.1:9224/json/list')).json();
  const p = t.find(x=>x.type==='page');
  const c = await Cdp.connect(p.webSocketDebuggerUrl);
  console.log(await c.eval('(()=>{const b=document.querySelector(\"[data-testid=empty-split-browser]\"); if(!b) return \"tombol tidak ada\"; b.click(); return \"diklik\"})()'));
  await new Promise(r=>setTimeout(r,7000));
  console.log(await c.eval('JSON.stringify({iframe:document.querySelectorAll(\"iframe\").length, loads:document.querySelector(\"iframe\")?.getAttribute(\"data-loads\")||\"-\", xterm:document.querySelectorAll(\".xterm\").length})'));
  process.exit(0);
})" 2>&1 | tail -2

echo "=== hidup + RAM ==="
powershell -NoProfile -Command "@(Get-Process zephyr -ErrorAction SilentlyContinue).Count" 2>&1 | tr -d '\r' | tail -1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ram-tree.ps1 2>/dev/null | grep -E "zephyr: |PRIVATE working"
echo selesai
