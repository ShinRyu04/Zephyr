#!/usr/bin/env bash
# banding-stress.sh — A/B adil: config AMAN vs --single-process, pemakaian sama.
#
# Idle saja tidak cukup: --single-process terlihat hebat saat idle lalu naik
# saat dipakai. Skrip ini menjalankan interaksi IDENTIK di dua kandidat supaya
# perbandingannya sah.
set -u
cd "$(dirname "$0")/.." || exit 1
EXE="src-tauri/target/release/zephyr.exe"
BASE="--disable-background-networking --no-first-run --disable-component-update --disable-domain-reliability --disable-sync --disable-features=SpareRendererForSitePerProcess,CalculateNativeWinOcclusion,msWebOOUI,msPdfOOUI,msSmartScreenProtection,msEdgeIdentity,msEdgeSync,msEdgeAutofill,msEdgeSidebar,msEdgeShoppingAssistant,msEdgeCollections,msEdgeWorkspaces"
AMAN="--disable-gpu --renderer-process-limit=1 --js-flags=--max-old-space-size=192 $BASE"
SP="--single-process --renderer-process-limit=1 --js-flags=--max-old-space-size=128 $BASE"

bersih() {
  powershell -NoProfile -Command "Stop-Process -Name zephyr,msedgewebview2 -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1
  for i in $(seq 1 20); do
    n=$(powershell -NoProfile -Command "@(Get-Process zephyr -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r')
    [ "$n" = "0" ] && return 0
    sleep 1
  done
}
ukur() { powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ram-tree.ps1 2>/dev/null | grep 'PRIVATE working set total' | sed 's/.*: //; s/ MB.*//'; }

# interaksi identik: buka terminal + ketik + palette + settings + editor
pakai() {
  node -e "
import('file:///D:/Zephyr/scripts/lib-cdp.mjs').then(async ({Cdp})=>{
  const t = await (await fetch('http://127.0.0.1:9224/json/list')).json();
  const p = t.find(x=>x.type==='page');
  const c = await Cdp.connect(p.webSocketDebuggerUrl);
  await c.eval('(()=>{const b=document.querySelector(\"[data-testid=empty-shell]\"); if(b) b.click(); return 1})()');
  await new Promise(r=>setTimeout(r,5000));
  await c.eval('(()=>{const ta=document.querySelector(\".xterm-helper-textarea\"); if(ta){ta.focus(); return 1} return 0})()');
  await new Promise(r=>setTimeout(r,1500));
  await c.eval('(()=>{const b=document.querySelector(\"[data-testid=mb-command-center]\"); if(b) b.click(); return 1})()');
  await new Promise(r=>setTimeout(r,1500));
  await c.eval('(()=>{document.dispatchEvent(new KeyboardEvent(\"keydown\",{key:\"Escape\",bubbles:true})); return 1})()');
  await new Promise(r=>setTimeout(r,1000));
  await c.eval('(()=>{const b=document.querySelector(\"[data-testid=ab-gh]\"); if(b) b.click(); return 1})()');
  await new Promise(r=>setTimeout(r,2500));
  await c.eval('(()=>{const b=document.querySelector(\"[data-testid=ab-gh]\"); if(b) b.click(); return 1})()');
  await new Promise(r=>setTimeout(r,1500));
  console.log('interaksi selesai');
  process.exit(0);
})" 2>/dev/null | tail -1
}

uji() {
  local nama="$1" flags="$2"
  bersih
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="$flags --remote-debugging-port=9224" "$EXE" >/dev/null 2>&1 &
  sleep 25
  local idle proses; idle=$(ukur)
  proses=$(powershell -NoProfile -Command "@(Get-Process msedgewebview2 -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r')
  pakai >/dev/null 2>&1
  sleep 6
  local pakai_mb; pakai_mb=$(ukur)
  echo "$nama | idle $idle MB | setelah dipakai $pakai_mb MB | proses webview2: $proses"
  bersih
}

echo "=== A/B dengan pemakaian identik ==="
uji "AMAN (gpu-off+js192)" "$AMAN"
uji "SINGLE-PROCESS       " "$SP"
echo selesai
