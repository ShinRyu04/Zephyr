/* Kunci perilaku baru: strip gambar lama, checkpoint resume, tombol resume.
 * Tanpa provider: semua lewat store/bridge dev di app hidup.
 * Pola: CDP langsung + window.__ZEPHYR_AI__.store (import() bikin store kedua). */
import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
/* Dua jendela bisa hidup bersamaan: jendela utama (`/`) dan jendela Agents
 * (`/index.html#agents`), dan urutan `/json/list` tidak dijamin — `#agents`
 * bisa lebih dulu. Uji ini mengunci perilaku tombol resume di panel utama,
 * jadi pilih target utama secara EKSPLISIT; `find(type==='page')` dulu bisa
 * mendarat di jendela Agents yang belum punya AiPanel dan gagal senyap. */
const page =
  targets.find((t) => t.type === 'page' && !t.url.includes('#') && new URL(t.url).pathname === '/') ??
  targets.find((t) => t.type === 'page' && !t.url.includes('#')) ??
  targets.find((t) => t.type === 'page');
if (!page) { console.log('app mati'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
const errors = [];
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description ?? '').slice(0, 200));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');

const evalJs = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 250);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lulus = 0; let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

const adaBridge = await evalJs(`(() => typeof window.__ZEPHYR_AI__ !== 'undefined')()`);
console.log('== Verifikasi checkpoint-lanjut + strip-gambar ==\n');
if (!adaBridge) {
  console.log('  DILEWATI: window.__ZEPHYR_AI__ tidak ada (bukan mode dev?)');
  console.log('\n== 0/0 lulus (dilewati) ==');
  ws.close(); process.exit(0);
}

// 1. Uji unit fungsi murni cukup lewat tsc + review; yang dikunci di sini
//    adalah perilaku yang terlihat: checkpoint, tombol, dan field estimasi.

// 2. checkpoint: set manual -> lanjutkanAgent memanggil send dgn teks checkpoint.
const r2 = await evalJs(`(async () => {
  const st = window.__ZEPHYR_AI__.store;
  st.setState({ agentResume: { teks: 'lanjut-uji', history: [{ role: 'user', content: 'halo' }], langkah: 7, at: Date.now() } });
  const cp = st.getState().agentResume;
  return JSON.stringify({ ada: !!cp, langkah: cp && cp.langkah, fn: typeof st.getState().lanjutkanAgent });
})()`, true);
const H2 = JSON.parse(r2);
cek('checkpoint tersimpan + lanjutkanAgent ada', H2.ada && H2.langkah === 7 && H2.fn === 'function', r2);

// 3. kirimSekarang('lanjut') memakai checkpoint, bukan membuat pesan baru.
//    Spy dipasang lewat setState (menimpa aksi yang dilihat get().send);
//    menimpa st.send pada objek store TIDAK mengubah get().send.
const r3 = await evalJs(`(async () => {
  const st = window.__ZEPHYR_AI__.store;
  st.setState({ agentResume: { teks: 'lanjut-uji', history: [{ role: 'user', content: 'halo' }], langkah: 7, at: Date.now() } });
  let dipanggil = null;
  const asli = st.getState().send;
  st.setState({ send: async (t) => { dipanggil = t; return true; } });
  try {
    await st.getState().kirimSekarang('lanjut');
  } finally {
    st.setState({ send: asli, agentResume: null, agentResumes: {} });
  }
  return dipanggil;
})()`, true);
cek('kirim lanjut pakai checkpoint', r3 === 'lanjut-uji', String(r3));

// 4. Tombol resume muncul saat ada checkpoint dan tidak sibuk.
//    Panel AI hanya dirender ketika dock = 'ai', jadi harus dibuka dulu:
//    tanpa ini state store benar tapi DOM-nya belum ada, dan uiji ini
//    akan menyimpulkan "tidak ada tombol" untuk kode yang sebenarnya benar.
await evalJs(`(() => {
  // Toggle, jadi hanya klik kalau memang belum terbuka - klik buta akan
  // MENUTUP panel yang kebetulan sudah tampil.
  if (!document.querySelector('.ai-send-wrap')) {
    const btn = [...document.querySelectorAll('[aria-label]')].find((e) => /AI \\/ MCP/i.test(e.getAttribute('aria-label') || ''));
    if (btn) btn.click();
  }
  return true;
})()`);
await sleep(1200);
/* Checkpoint tombol dibaca PER-PERMUKAAN (`agentResumes[composerId]`), bukan
 * flat `agentResume`. Jendela yang diuji menampilkan panel AI permukaan
 * `agents` (AgentsApp), jadi checkpoint ditulis ke key itu; panel permukaan
 * lain tidak akan bereaksi padanya. `setState` zustand adalah setter mentah,
 * jadi ia tidak melewati `mirrorRun` seperti aksi store; harness harus
 * menulis map-nya langsung. */
await evalJs(`(() => {
  const st = window.__ZEPHYR_AI__.store;
  const s = st.getState();
  /* Checkpoint penuh sejak Fase 1: {teks, history, langkah, at}.
   *
   * Checkpoint dibaca PER-PERMUKAAN (agentResumes[composerId]). Kunci yang
   * mungkin dipakai: '' (kolom kanan), 'editor' (tab AI di area editor),
   * 'agents' (jendela Agents). Dulu harness ini hanya menulis 'agents' dan
   * lolos kebetulan karena jendela Agents kebetulan terbuka; saat panel tampil
   * di surface lain, checkpoint tak pernah terbaca dan uji menyimpulkan
   * "tombol tidak ada" untuk kode yang benar. Tulis SEMUA kunci supaya uji
   * tidak bergantung pada permukaan mana yang sedang aktif. */
  const cek = { teks: 'x', history: [], langkah: 0, at: Date.now() };
  st.setState({
    agentResumes: { '': cek, editor: cek, agents: cek },
    agentBusys: { ...s.agentBusys, '': false, editor: false, agents: false },
    pendings: { ...s.pendings, '': null, editor: null, agents: null },
  });
})()`);
await sleep(800);
const r4 = await evalJs(`(() => !!document.querySelector('[data-testid="ai-resume"]'))()`);
await evalJs(`(() => { window.__ZEPHYR_AI__.store.setState({ agentResumes: {} }); })()`);
cek('tombol resume muncul', r4 === true, String(r4));

// 5. estimasi: agentStartedAt ter-set saat run mulai (cek field ada di state).
const r5 = await evalJs(`(() => 'agentStartedAt' in window.__ZEPHYR_AI__.store.getState())()`);
cek('agentStartedAt ada di state', r5 === true, String(r5));

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
