#!/usr/bin/env bash
# soak-sp.sh — uji ketahanan --single-process sebelum dipakai sebagai default.
#
# --single-process menggabungkan renderer+GPU+utility ke proses browser. Kalau
# ada satu saja komponen yang tidak suka digabung (xterm canvas, CodeMirror,
# iframe browser pane, conpty), gejalanya crash atau UI diam.
#
# Jadi: pakai app seperti orang pakai selama 3 menit, cek tiap 30 s.
set -u
cd "$(dirname "$0")/.." || exit 1
EXE="src-tauri/target/release/zephyr.exe"
FLAGS="--single-process --js-flags=--max-old-space-size=192 --renderer-process-limit=1 --disable-background-networking --no-first-run --disable-component-update --disable-domain-reliability --disable-sync --disable-features=SpareRendererForSitePerProcess,CalculateNativeWinOcclusion,msWebOOUI,msPdfOOUI,msSmartScreenProtection,msEdgeIdentity,msEdgeSync,msEdgeAutofill,msEdgeSidebar,msEdgeShoppingAssistant,msEdgeCollections,msEdgeWorkspaces"

powershell -NoProfile -Command "Stop-Process -Name zephyr,msedgewebview2 -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1
for i in $(seq 1 20); do
  n=$(powershell -NoProfile -Command "@(Get-Process zephyr -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r')
  [ "$n" = "0" ] && break
  sleep 1
done

WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="$FLAGS --remote-debugging-port=9224" "$EXE" >/dev/null 2>&1 &
sleep 25

hidup() { powershell -NoProfile -Command "@(Get-Process zephyr -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r'; }
ram()   { powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ram-tree.ps1 2>/dev/null | grep 'PRIVATE working set total' | sed 's/.*: //; s/ MB.*//'; }
ui() {
  node -e "
import('file:///D:/Zephyr/scripts/lib-cdp.mjs').then(async ({Cdp})=>{
  try {
    const t = await (await fetch('http://127.0.0.1:9224/json/list')).json();
    const p = t.find(x=>x.type==='page'); if(!p){console.log('TIDAK-ADA');process.exit(0)}
    const c = await Cdp.connect(p.webSocketDebuggerUrl);
    console.log(await c.eval('JSON.stringify({root:document.getElementById(\"root\")?.innerHTML.length||0, xterm:document.querySelectorAll(\".xterm\").length})'));
    process.exit(0);
  } catch(e){ console.log('CDP-MATI: '+e.message.slice(0,40)); process.exit(0) }
})" 2>/dev/null | tail -1
}

echo "t=0   | hidup=$(hidup) | $(ram) MB | $(ui)"

# putaran pemakaian: terminal → ketik → palette → settings → editor → ulang
for putaran in 1 2 3; do
  node -e "
import('file:///D:/Zephyr/scripts/lib-cdp.mjs').then(async ({Cdp})=>{
  const t = await (await fetch('http://127.0.0.1:9224/json/list')).json();
  const p = t.find(x=>x.type==='page');
  const c = await Cdp.connect(p.webSocketDebuggerUrl);
  // terminal: spawn kalau belum ada, lalu ketik perintah nyata
  await c.eval('(()=>{const b=document.querySelector(\"[data-testid=empty-shell]\"); if(b) b.click(); return 1})()');
  await new Promise(r=>setTimeout(r,3500));
  const ta = await c.eval('(()=>{const t=document.querySelector(\".xterm-helper-textarea\"); if(!t) return 0; t.focus(); return 1})()');
  if (ta) {
    for (const ch of 'echo soak-\$((6*7))\r') {
      await c.eval('(()=>{const t=document.querySelector(\".xterm-helper-textarea\"); if(t) t.dispatchEvent(new KeyboardEvent(\"keydown\",{key:'+JSON.stringify(ch)+',bubbles:true})); return 1})()');
    }
  }
  await new Promise(r=>setTimeout(r,2500));
  // palette
  await c.eval('(()=>{const b=document.querySelector(\"[data-testid=mb-command-center]\"); if(b) b.click(); return 1})()');
  await new Promise(r=>setTimeout(r,1200));
  await c.eval('(()=>{document.dispatchEvent(new KeyboardEvent(\"keydown\",{key:\"Escape\",bubbles:true})); return 1})()');
  await new Promise(r=>setTimeout(r,900));
  // settings buka-tutup
  await c.eval('(()=>{const b=document.querySelector(\"[data-testid=ab-gh]\"); if(b) b.click(); return 1})()');
  await new Promise(r=>setTimeout(r,2200));
  await c.eval('(()=>{const b=document.querySelector(\"[data-testid=ab-gh]\"); if(b) b.click(); return 1})()');
  await new Promise(r=>setTimeout(r,1200));
  console.log('putaran selesai');
  process.exit(0);
})" 2>/dev/null | tail -1
  sleep 12
  echo "putaran $putaran | hidup=$(hidup) | $(ram) MB | $(ui)"
done

echo "=== hasil akhir: keluaran terminal benar-benar ada? ==="
node -e "
import('file:///D:/Zephyr/scripts/lib-cdp.mjs').then(async ({Cdp})=>{
  const t = await (await fetch('http://127.0.0.1:9224/json/list')).json();
  const p = t.find(x=>x.type==='page');
  const c = await Cdp.connect(p.webSocketDebuggerUrl);
  const teks = await c.eval('(document.querySelector(\".xterm-rows\")?.textContent||\"\").slice(0,200)');
  console.log('isi terminal: ' + JSON.stringify(teks));
  process.exit(0);
})" 2>&1 | tail -1

echo "=== warna + screenshot akhir ==="
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/shot-jendela.ps1 "$LOCALAPPDATA/Temp/soak-sp.png" 2>&1 | tail -1
python - "$LOCALAPPDATA/Temp/soak-sp.png" <<'PY'
import sys, os
from PIL import Image
from collections import Counter
f=sys.argv[1]
if not os.path.exists(f): print("GAGAL shot"); raise SystemExit
c=Counter(Image.open(f).convert('RGB').getdata()); tot=sum(c.values())
k17=sum(v for k,v in c.items() if all(x%17==0 for x in k))
hijau=sum(v for k,v in c.items() if k[1]>60 and k[1]-k[0]>25 and k[1]-k[2]>15)
print("4-bit: %.2f%% | hijau: %.2f%% | dominan: %s" % (100.0*k17/tot, 100.0*hijau/tot, ' '.join('#%02X%02X%02X'%k for k,_ in c.most_common(3))))
PY
echo selesai
