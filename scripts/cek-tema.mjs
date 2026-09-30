/**
 * Buka Settings → Tema, baca label + hint tiap tema, dan hitung teks Indonesia
 * yang terlihat. Tema di-generate dari Rust, jadi ini uji end-to-end.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && (t.title || '').includes('Zephyr'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const tunggu = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r));
const kirim = (method, params = {}) => new Promise((r) => {
  const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await kirim('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r?.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r?.result?.result?.value;
};

// buka halaman Settings lewat store
await ev(`(() => { window.__ZEPHYR_SETUI__?.getState?.().setSettingsOpen?.(true); return 1; })()`);
await new Promise((r) => setTimeout(r, 1200));

// klik nav Tema
await ev(`(() => {
  const btn = [...document.querySelectorAll('button, [role="tab"], a')]
    .find((b) => /theme|tema/i.test((b.textContent || '').trim()));
  if (btn) btn.click();
  return btn ? (btn.textContent || '').trim() : null;
})()`);
await new Promise((r) => setTimeout(r, 1200));

const tema = await ev(`(() => {
  const out = [];
  const kandidat = [...document.querySelectorAll('*')].filter((el) => {
    const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
    return t.length > 4 && t.length < 90;
  });
  for (const el of kandidat) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const t = n.textContent.trim();
      if (t.length < 4) continue;
      out.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,40), teks: t.slice(0,105) });
    }
  }
  const uniq = []; const seen = new Set();
  for (const x of out) { if (seen.has(x.teks)) continue; seen.add(x.teks); uniq.push(x); }
  return uniq;
})()`);

const KATA = ['yang','tidak','sudah','untuk','dari','akan','bisa','harus','belum','kalau','karena',
  'hanya','saja','pakai','dengan','adalah','terang','gelap','nyaman','hangat','dingin','malam','siang',
  'tema','warna','tampilan','pengaturan','kontras','lembut','klasik','bersih'];
const re = new RegExp('\\b(' + KATA.join('|') + ')\\b', 'i');
const indo = tema.filter((x) => re.test(x.teks));

console.log('=== jumlah teks terlihat:', tema.length, '| Indonesia:', indo.length, '===');
console.log('\n--- teks tema (40 pertama) ---');
for (const x of tema.slice(0, 40)) console.log(`  [${x.tag}] ${x.teks}`);
if (indo.length) { console.log('\n--- INDONESIA ---'); for (const x of indo) console.log(`  [${x.tag}] ${x.teks}`); }
ws.close();
