/**
 * uji-browser-baca.mjs - uji NYATA "agent bisa buka browser & baca isinya".
 *
 * Dua bagian:
 *   1) LANGSUNG  - harness memanggil tool `browser` (aksi open/read) sendiri
 *                  (lewat bridge __ZEPHYR_TOOLS__.jalankan) pada halaman yang
 *                  isinya BARU ADA setelah JavaScript jalan. Halaman itu
 *                  dilayani http server milik harness ini, jadi isinya pasti:
 *                  teks "SKRIP-BERJALAN: 42 dan alfa/beta" HANYA muncul kalau
 *                  DOM benar-benar dirender, bukan HTML mentah hasil fetch.
 *   2) AGENT     - model diminta membuka halaman itu, membacanya, dan
 *                  menyebutkan angka yang tertulis. Angka 42 tidak ada di HTML
 *                  mentah, jadi jawaban yang benar = bukti bacaan sungguhan.
 *
 *   node scripts/uji-browser-baca.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';
import http from 'http';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('agent buka tab Browser + baca isi halaman');
const PORT_WEB = 5199;
const HALAMAN = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Halaman Uji Baca</title></head>
<body>
  <h1>Halaman Uji</h1>
  <div id="isi">(kosong sebelum skrip)</div>
  <a href="https://example.com/">ke example</a>
  <script>
    document.getElementById('isi').textContent = 'SKRIP-BERJALAN: ' + (6 * 7) + ' dan ' + ['alfa', 'beta'].join('/');
  </script>
</body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HALAMAN);
});
await new Promise((s) => server.listen(PORT_WEB, '127.0.0.1', s));
console.log(`     http server uji: http://localhost:${PORT_WEB} (isinya dirender skrip)`);

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

/* Bersihkan tab Browser dari uji sebelumnya - tab yang tertinggal membuat uji
   berikutnya membaca halaman yang salah. Browser kini satu tab tetap di area
   editor (id tab-browser), bukan pane di tab terminal. */
const bersih = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  if (!S) return 'bridge editor tidak ada';
  const tabs = S.getState().tabs.filter((x) => x.view === 'browser');
  for (const t of tabs) { try { S.getState().forceCloseTab(t.id); } catch (e) { /* biarkan */ } }
  return 'ditutup: ' + (tabs.map((t) => t.id).join(', ') || '(tidak ada)');
})())`);
console.log('     bersihkan tab browser -> ' + bersih);

const url = `http://localhost:${PORT_WEB}`;

/* ── 1) LANGSUNG: open + read, dijalankan harness sendiri ─────────────── */
const buka = await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'open', url: ${JSON.stringify(url)} }))`);
console.log(`     browser open -> ${buka}`);

let dibaca = '';
for (let i = 0; i < 20; i++) {
  await new Promise((s) => setTimeout(s, 1000));
  dibaca = String(await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'read' }))`));
  if (dibaca.length > 60) break;
}
console.log('     --- isi yang dibaca agen (potongan) ---');
console.log('     ' + dibaca.replace(/\\n/g, ' | ').slice(0, 700));

R.check('B1', dibaca.includes('SKRIP-BERJALAN: 42 dan alfa/beta'),
  'browser read membaca DOM yang SUDAH dirender skrip (bukan HTML mentah)');
R.check('B2', !/<script|<div|<html/i.test(dibaca),
  'yang terbaca teks halaman, bukan tag HTML mentah');

/* Halaman luar nyata, bukti kedua. */
const bukaLuar = await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'open', url: "https://example.com" }))`);
let luar = '';
for (let i = 0; i < 20; i++) {
  await new Promise((s) => setTimeout(s, 1200));
  const l = await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'list' }))`);
  luar = String(await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'read' }))`));
  if (/example domain/i.test(luar)) break;
  if (i === 3 && l) console.log('     browser sekarang: ' + l.replace(/\\s+/g, ' ').slice(0, 200));
}
R.check('B3', /example domain|this domain is for use/i.test(luar),
  'situs luar (example.com) terbaca isinya');
if (!/example domain/i.test(luar)) console.log('     potongan: ' + luar.slice(0, 300));

/* ── 2) AGENT: suruh model melakukannya ──────────────────────────────── */
const tugas =
  `Buka ${url} di tab Browser pakai tool browser (aksi open), lalu baca isinya pakai tool browser (aksi read). ` +
  'Sebutkan persis isi halaman itu, TERMASUK angka yang tertulis di dalamnya.';

await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  if (A.newChat) A.newChat();
  if (A.setApprovalMode) A.setApprovalMode('auto');
  if (A.setAgentSteps) A.setAgentSteps([]);
  const T = window.__ZEPHYR_TOOLS__;
  return true;
})())`);

const t0 = Date.now();
await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(tugas)});
  return true;
})())`);
console.log(`     tugas ke agen dikirim (${new Date().toISOString()})`);

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  let n = -1, macet = Date.now();
  while (Date.now() - t0 < 300000) {
    const s = A.getState();
    const steps = (s.agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
    const sesi = s.activeSession ? s.activeSession() : null;
    const msgs = (sesi && sesi.messages) ? sesi.messages : [];
    const last = msgs[msgs.length - 1] || null;
    if (!s.agentBusy) {
      return { ok: true, ms: Date.now() - t0, nama: steps.map((x) => x.name),
               gagal: steps.filter((x) => x.ok === false || x.error).map((x) => x.name),
               balasan: last ? String(last.content || '').slice(0, 1200) : '',
               error: last ? (last.error || null) : null };
    }
    if (steps.length !== n) { n = steps.length; macet = Date.now(); }
    else if (Date.now() - macet > 120000) return { ok: false, macet: true, ms: Date.now() - t0, nama: steps.map((x) => x.name) };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, timeout: true, ms: Date.now() - t0 };
})())`,
  320000,
);

const detik = Math.round((Date.now() - t0) / 1000);
R.check('B4', hasil.ok === true, `agen menyelesaikan tugas sendiri dalam ${detik}s${hasil.macet ? ' (MACET)' : ''}${hasil.timeout ? ' (TIMEOUT)' : ''}`);
R.check('B5', !hasil.error, `tanpa error provider (${hasil.error ?? 'bersih'})`);
R.check('B6', (hasil.nama ?? []).includes('browser'),
  `agen benar-benar memakai tool browser (${(hasil.nama ?? []).join(' -> ')})`);
R.check('B7', /42/.test(String(hasil.balasan ?? '')),
  'jawaban agen memuat angka 42 (hanya ada kalau DOM dirender dibaca agen)');

console.log('\n--- jawaban agen ---');
console.log(String(hasil.balasan ?? '').trim().slice(0, 1200) || '(kosong)');
console.log('--------------------\n');

/* Bersihkan: tutup tab Browser, matikan server uji. */
try { await cdp.json(`return JSON.stringify(await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'close' }))`); } catch {}
R.selesai();
await cdp.close();
server.close();
process.exit(R.results.some((r) => !r.ok) ? 1 : 0);
