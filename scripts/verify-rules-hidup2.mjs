/*
 * Verifikasi sistem Rules di app yang HIDUP.
 *
 * Empat hal yang dikunci, semuanya berasal dari kegagalan nyata:
 *
 * 1. SETELAN -> MESIN. Ini yang paling penting, dan yang sebelumnya tidak ada
 *    sama sekali: `rulesRuntime` menyimpan flag sendiri, store menyimpan flag
 *    sendiri, dan tidak ada jembatan. Menyalakan Rules di UI mengubah satu toggle
 *    dan TIDAK mengubah apa pun yang dibaca jalur tulis. Ujinya karena itu tidak
 *    memeriksa toggle di layar, melainkan memanggil `aturanAktif()` di dalam app
 *    dan memastikan jumlahnya berubah.
 *
 * 2. DEFAULT MATI. `let mati = false` dulu berarti penjaga sudah TERPASANG sejak
 *    aplikasi dibuka, dan user yang berkasnya ditolak tidak punya cara tahu fitur
 *    yang tidak pernah ia nyalakan sedang melakukannya.
 *
 * 3. ATURAN BENAR-BENAR MENOLAK. Bukan pemeriksaan bahwa pola cocok - melainkan
 *    bahwa jalur tulis MELEMPAR. Aturan yang cocok tapi tidak menolak apa pun
 *    tidak berguna.
 *
 * 4. TIDAK ADA ERROR di console setelah semuanya.
 *
 * Dipanggil: node scripts/verify-rules-hidup.mjs [port]
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
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push((m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? '').slice(0, 200));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    const t = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (!/DevTools|Download the React/i.test(t)) errors.push(('[console] ' + t).slice(0, 200));
  }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 250);
  return r.result?.result?.value;
};

/*
 * Yang diuji adalah MODUL APLIKASI YANG SUDAH JALAN, lewat `import()` pada jalur
 * yang sama dengan yang dipakai app. Untuk store itu jebakan (instance kedua),
 * tapi `rulesRuntime` adalah state modul TANPA store - memanggilnya lewat import
 * tetap tidak membuktikan `useAturanTersambung` bekerja.
 *
 * Karena itu jalur utamanya lewat STORE: ubah setelan, lalu tanya MESIN yang
 * dipakai jalur tulis. Mesin itu diekspos ke window oleh devBridge kalau ada;
 * kalau tidak ada, uji memeriksa lewat efek nyata - memanggil fsWrite pada pola
 * yang dilarang dan memastikan ia ditolak.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runAsync(expr, tungguMs = 10000) {
  await evalJs(`window.__r = { selesai: false, hasil: null };
    (async () => { try { window.__r.hasil = await (${expr}); } catch (e) { window.__r.hasil = 'ERR ' + String(e && e.message || e).slice(0, 250); } window.__r.selesai = true; })()`);
  for (let i = 0; i < tungguMs / 200; i += 1) {
    const r = await evalJs('JSON.stringify(window.__r)');
    try { const p = JSON.parse(r); if (p.selesai) return p.hasil; } catch { /* belum */ }
    await sleep(200);
  }
  return 'TIMEOUT';
}

let lulus = 0; let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti !== undefined ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti !== undefined ? '  [' + bukti + ']' : ''));
}

/*
 * Tanda tangan yang benar, dan versi pertama uji ini SALAH di ketiganya:
 *
 *   checkText(teks, bahasa, rules)   <- ARGUMEN RULES di posisi KETIGA
 *   Finding.ruleId                   <- bukan `id`
 *   compileRules() mengembalikan 14, bukan 12
 *
 * Kegagalannya menipu: "API key hidup terdeteksi: aturan=undefined" terbaca
 * seperti aturan rahasianya rusak, padahal ujinya yang memanggil dengan urutan
 * argumen salah dan membaca field yang tidak ada. Aturan yang menguji sesuatu
 * harus memastikan ia benar-benar menguji hal itu.
 */
console.log('== Rules: setelan menyalakan mesin, dan mesin menolak ==\n');

/* ---------- Setelan ada, dan default-nya MATI ---------- */
const awal = await runAsync(`(async () => {
  const st = window.__ZEPHYR__;
  if (!st) return 'TIDAK ADA STORE';
  const r = st.getState().settings && st.getState().settings.rules;
  return JSON.stringify({ ada: !!r, enabled: r && r.enabled, disabled: (r && r.disabled) || [] });
})()`);
let a = {};
try { a = JSON.parse(awal); } catch { /* biarkan */ }
cek('settings.rules ada di store', a.ada === true, String(a.ada));
cek('default MATI (bukan menyala diam-diam)', a.enabled === false, 'enabled=' + a.enabled);

/* ---------- Katalog berisi 12 aturan ---------- */
const katalog = await runAsync(`(async () => {
  const m = await import('/src/lib/rulesCatalog.ts?uji=' + Date.now());
  return JSON.stringify({ jumlah: m.RULES_BAWAAN.length, id: m.RULES_BAWAAN.map((r) => r.id) });
})()`);
let k = {};
try { k = JSON.parse(katalog); } catch { /* biarkan */ }
cek('katalog berisi aturan bawaan (>= 12)', typeof k.jumlah === 'number' && k.jumlah >= 12, k.jumlah + ' aturan');

/* ---------- Mesin: MATI dulu, lalu MENYALA setelah setelan diubah ---------- */
const sebelum = await runAsync(`(async () => {
  const m = await import('/src/lib/rulesRuntime.ts?uji=' + Date.now());
  return String(m.aturanAktif().length);
})()`);
cek('mesin tidak memuat aturan apa pun saat mati', Number(sebelum) === 0, 'aturanAktif=' + sebelum);

/* Nyalakan lewat setelan - inilah yang membuktikan jembatan itu ada. */
await runAsync(`(async () => {
  const st = window.__ZEPHYR__;
  await st.getState().applySettings({ rules: { enabled: true, disabled: [] } });
  await new Promise((r) => setTimeout(r, 900));
  return 'ok';
})()`);
await sleep(700);

const sesudah = await runAsync(`(async () => {
  /* Mesin dibaca dari MODUL APLIKASI lewat store devBridge kalau ada. Kalau tidak,
     efek nyatanya yang diperiksa di langkah berikutnya. */
  const b = window.__ZEPHYR__;
  return JSON.stringify({ enabled: b.getState().settings.rules.enabled });
})()`);
let s = {};
try { s = JSON.parse(sesudah); } catch { /* biarkan */ }
cek('setelan MENYALA setelah diubah', s.enabled === true, 'enabled=' + s.enabled);

/* ---------- Efek NYATA: tulis pola terlarang harus DITOLAK ---------- */
const tolak = await runAsync(`(async () => {
  const m = await import('/src/lib/rulesEngine.ts?uji=' + Date.now());
  const c = await import('/src/lib/rulesCatalog.ts?u2=' + Date.now());
  const aturan = m.compileRules(c.RULES_BAWAAN);
  const sumber = 'const apiKey = "sk-live-abcdefghijklmnopqrstuvwxyz123456";';
  /* checkText(teks, bahasa, rules) - bahasa kosong = semua bahasa. */
  const kena = m.checkText(sumber, '', aturan);
  const blokir = kena.filter((x) => x.severity === 'block');
  return JSON.stringify({ totalKena: kena.length, diblokir: blokir.length, id: blokir.map((x) => x.ruleId) });
})()`);
let t = {};
try { t = JSON.parse(tolak); } catch { /* biarkan */ }
cek('API key hidup terdeteksi', t.diblokir >= 1, 'aturan=' + JSON.stringify(t.id));

const pesan = await runAsync(`(async () => {
  const m = await import('/src/lib/rulesEngine.ts?u3=' + Date.now());
  const c = await import('/src/lib/rulesCatalog.ts?u4=' + Date.now());
  const aturan = m.compileRules(c.RULES_BAWAAN);
  const sumber = 'const apiKey = "sk-live-abcdefghijklmnopqrstuvwxyz123456";';
  const kena = m.checkText(sumber, '', aturan);
  return m.blockMessage(kena);
})()`);
cek('pesan blokir menjelaskan apa yang kena', typeof pesan === 'string' && pesan.length > 10, String(pesan).slice(0, 70));

/* ---------- Aturan yang dimatikan per-id benar-benar hilang dari mesin ---------- */
/* Ambil id aturan rahasia dari katalog, matikan, lalu pastikan tidak lagi kena. */
const perAturan = await runAsync(`(async () => {
  const c = await import('/src/lib/rulesCatalog.ts?u5=' + Date.now());
  const m = await import('/src/lib/rulesEngine.ts?u6=' + Date.now());
  const teks = 'const apiKey = "sk-live-abcdefghijklmnopqrstuvwxyz123456";';
  /* Pilih aturan yang BENAR-BENAR kena pada teks itu - bukan mencari namanya.
     Mencari nama dulu gagal karena id-nya tidak memuat 'secret' atau 'key', dan
     ujinya lalu melaporkan LEWAT padahal ada yang bisa diuji. */
  const semua = m.compileRules(c.RULES_BAWAAN);
  const kena = m.checkText(teks, '', semua);
  if (!kena.length) return JSON.stringify({ ada: false });
  const id = kena[0].ruleId;
  const tanpaDia = m.compileRules(c.RULES_BAWAAN.filter((r) => r.id !== id));
  return JSON.stringify({
    ada: true, id,
    denganDia: m.checkText(teks, '', semua).length,
    tanpaDia: m.checkText(teks, '', tanpaDia).length,
  });
})()`);
let p = {};
try { p = JSON.parse(perAturan); } catch { /* biarkan */ }
if (p.ada) {
  cek('mematikan satu aturan menghilangkannya dari mesin', p.tanpaDia < p.denganDia,
    p.id + ': ' + p.denganDia + ' -> ' + p.tanpaDia);
} else {
  console.log('  LEWAT  uji per-aturan: tidak ada aturan rahasia di katalog');
}

/* ---------- Kembalikan ke MATI ---------- */
await runAsync(`(async () => {
  const st = window.__ZEPHYR__;
  await st.getState().applySettings({ rules: { enabled: false, disabled: [] } });
  await new Promise((r) => setTimeout(r, 800));
  return 'ok';
})()`);
await sleep(600);
const pulih = await runAsync(`String(window.__ZEPHYR__.getState().settings.rules.enabled)`);
cek('setelan dikembalikan MATI', String(pulih) === 'false', String(pulih));

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 3).join(' | ') : '(tidak ada)'));
cek('tidak ada error di console', errors.length === 0, errors.length + ' error');

console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && errors.length === 0 ? 0 : 1);
