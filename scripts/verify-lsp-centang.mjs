/*
 * Verifikasi: hanya server LSP yang TERPASANG boleh tercentang.
 *
 * Keluhan user: "tombol LSP emang harus hidup, tapi ga ke centang semua juga loh,
 * cuma yang udah ada bahasanya yang terinstall."
 *
 * Sebelumnya `checked={semua && ov[id]?.enabled !== false}` - dan override yang
 * tidak ada dianggap `enabled`, sehingga SEMUA server tampil tercentang walau
 * binary-nya tidak ada di PATH.
 *
 * Yang diuji:
 *  1. Ada server terpasang DAN server tidak terpasang pada mesin ini (kalau
 *     semua terpasang, uji ini tidak bisa membuktikan apa pun - maka dilewati).
 *  2. Setiap server terpasang -> aria-checked = "true".
 *  3. Setiap server TIDAK terpasang -> aria-checked = "false".
 *  4. Tidak ada centang yang bertentangan dengan penanda hijau.
 *  5. Tombol refresh tetap hidup (permintaan user: "tombol LSP harus hidup").
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.log('app mati'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
const errors = [];
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description ?? '').slice(0, 200));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 250);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lulus = 0;
let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

async function klik(testid) {
  for (const blok of ['center', 'nearest']) {
    await evalJs(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (e) e.scrollIntoView({ block: '${blok}' }); })()`);
    await sleep(260);
    const r = await evalJs(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (!e) return null; const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const a = document.elementFromPoint(x, y); return JSON.stringify({ x: Math.round(x), y: Math.round(y), sampai: a ? (a === e || e.contains(a)) : false }); })()`);
    if (!r) return false;
    const p = JSON.parse(r);
    if (!p.sampai) continue;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    return true;
  }
  return false;
}

console.log('== Hanya server terpasang yang tercentang ==\n');

/* Buka halaman LSP. */
const sudah = await evalJs(`(() => !!document.querySelector('[data-testid="set-nav-lsp"]'))()`);
if (!sudah) {
  await evalJs(`(() => [ ...document.querySelectorAll('[data-activity]') ].filter(e => e.getAttribute('data-activity') === 'settings').forEach(b => b.click()))()`);
  await sleep(1100);
}
await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-lsp"]'); if (b) b.click(); })()`);
await sleep(1800);

/* Nyalakan saklar induk: tanpa itu semuanya memang tidak tercentang. */
async function setSaklar(ingin) {
  for (let i = 0; i < 4; i += 1) {
    await evalJs(`(() => { const s = document.querySelector('[data-testid="lsp-global"]'); if (!s) return; let e = s; while (e && e !== document.body) { const g = getComputedStyle(e); if ((g.overflowY === 'auto' || g.overflowY === 'scroll') && e.scrollHeight > e.clientHeight) { e.scrollTop = 0; return; } e = e.parentElement; } })()`);
    await sleep(320);
    const kini = await evalJs(`(() => document.querySelector('[data-testid="lsp-global"]')?.getAttribute('aria-checked'))()`);
    if (kini === null) return false;
    if ((kini === 'true') === ingin) return true;
    await klik('lsp-global');
    await sleep(950);
  }
  return false;
}
const induk = await setSaklar(true);
cek('saklar induk bisa dinyalakan', induk === true);

/* Tunggu probe selesai (auto-probe saat halaman dibuka). */
for (let i = 0; i < 12; i += 1) {
  const n = await evalJs(`(() => document.querySelectorAll('[data-testid$="-siap"]').length)()`);
  if (typeof n === 'number' && n > 0) break;
  await sleep(1000);
}

/* Peta: tiap baris -> terpasang? tercentang? */
const peta = await evalJs(`
  (() => {
    const baris = [...document.querySelectorAll('.lsp-baris')];
    const data = baris.map((b) => {
      const t = b.querySelector('[data-testid$="-toggle"]');
      const id = t ? t.dataset.testid.replace(/^lsp-/, '').replace(/-toggle$/, '') : null;
      return {
        id,
        terpasang: !!b.querySelector('[data-testid$="-siap"]'),
        tercentang: t ? t.getAttribute('aria-checked') : null,
        adaRefresh: !!b.querySelector('[data-testid$="-reload"]'),
        refreshDisabled: (() => { const r = b.querySelector('[data-testid$="-reload"]'); return r ? r.disabled : null; })(),
      };
    });
    return JSON.stringify(data);
  })()
`);
const P = JSON.parse(peta);
const ada = P.filter((x) => x.terpasang);
const tidak = P.filter((x) => !x.terpasang);
console.log('server terpasang: ' + ada.length + ' (' + ada.map((x) => x.id).join(', ') + ')');
console.log('server tidak terpasang: ' + tidak.length);

if (!ada.length || !tidak.length) {
  console.log('\n  DILEWATI: uji ini butuh KEDUA jenis server pada mesin ini');
} else {
  cek('server terpasang tercentang', ada.every((x) => x.tercentang === 'true'), ada.filter((x) => x.tercentang !== 'true').map((x) => x.id).join(',') || 'semua benar');
  cek('server TIDAK terpasang tidak tercentang', tidak.every((x) => x.tercentang === 'false'), tidak.filter((x) => x.tercentang !== 'false').map((x) => x.id).join(',') || 'semua benar');
  cek('centang tidak bertentangan dengan penanda hijau', P.every((x) => (x.tercentang === 'true') === x.terpasang));
  cek('tombol refresh ada di setiap baris', P.every((x) => x.adaRefresh), P.filter((x) => !x.adaRefresh).map((x) => x.id).join(',') || 'semua ada');
  cek('tombol refresh HIDUP saat induk nyala', P.every((x) => x.refreshDisabled === false), 'ada yang mati: ' + P.filter((x) => x.refreshDisabled).length);
}

/* Kembalikan saklar ke mati seperti keadaan awal. */
await setSaklar(false);

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
