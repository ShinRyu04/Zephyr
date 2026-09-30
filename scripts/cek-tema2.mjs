/**
 * Buka Settings lewat path resmi, klik nav Appearance/Theme, baca daftar tema.
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
  if (r?.result?.exceptionDetails) return { error: String(r.result.exceptionDetails.text).slice(0, 200) };
  return r?.result?.result?.value;
};
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. cari bridge store yang ada
const jembatan = await ev(`(() => {
  const k = Object.keys(window).filter((x) => x.startsWith('__ZEPHYR'));
  return { kunci: k, adaPanel: !!window.__ZEPHYR_PANEL__ };
})()`);
console.log('jembatan:', JSON.stringify(jembatan));

// 2. klik ikon Settings di ActivityBar (ikon gear)
const klik = await ev(`(() => {
  const kandidat = [...document.querySelectorAll('button, [role="button"], .ab-item, [class*="activity"] button')];
  const gear = kandidat.find((b) => /settings|gear|setelan/i.test(
    (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.className || '')));
  if (gear) { gear.click(); return { ok: true, label: gear.getAttribute('aria-label') || gear.getAttribute('title') || gear.className }; }
  // fallback: semua tombol activity bar
  return { ok: false, tombol: kandidat.slice(0, 14).map((b) => (b.getAttribute('aria-label') || b.getAttribute('title') || b.className || '').toString().slice(0, 40)) };
})()`);
console.log('klik settings:', JSON.stringify(klik));
await jeda(1500);

// 3. baca nav Settings + apakah halaman terbuka
const nav = await ev(`(() => {
  const halaman = document.querySelector('[class*="settings"]');
  const btn = [...document.querySelectorAll('[class*="settings-nav"] button, nav button, [class*="settings"] button')];
  return {
    halamanAda: !!halaman,
    nav: btn.slice(0, 24).map((b) => (b.textContent || '').trim().slice(0, 34)).filter(Boolean),
  };
})()`);
console.log('nav settings:', JSON.stringify(nav));

// 4. klik nav tema / appearance
const tema = await ev(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /^(theme|tema|appearance|tampilan)$/i.test((b.textContent||'').trim()));
  if (btn) { btn.click(); return (btn.textContent||'').trim(); }
  return null;
})()`);
console.log('klik nav tema:', tema);
await jeda(1500);

const isi = await ev(`(() => {
  const out = []; const seen = new Set();
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.display === 'none' || cs.visibility === 'hidden') return;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const t = n.textContent.trim();
      if (t.length < 3 || t.length > 90 || seen.has(t)) continue;
      seen.add(t); out.push(t);
    }
  });
  return out;
})()`);
console.log('\\n=== teks halaman tema (' + (isi?.length ?? 0) + ') ===');
for (const t of (isi ?? []).slice(0, 70)) console.log('  ' + t);
ws.close();
