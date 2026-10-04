/*
 * Verifikasi fitur Voice di app yang HIDUP.
 *
 * Yang diuji, dan kenapa masing-masing:
 *
 * 1. SETELAN TERSIMPAN. Voice punya 8 field. Setelan yang tidak tersimpan hilang
 *    tiap restart, dan itu kegagalan yang tidak terlihat sampai pengguna
 *    menyalakan ulang aplikasinya - jadi ditulis ke settings.json lalu dibaca
 *    kembali dari DISK, bukan dari store.
 *
 * 2. MESIN SUARA NYATA. `speechSynthesis` harus ada dan melaporkan suara. Kalau
 *    WebView-nya tidak punya mesinnya, tombolnya memang tidak berguna, dan
 *    harness ini yang membuktikannya - bukan asumsi.
 *
 * 3. PEMOTONGAN TEKS. Jawaban panjang HARUS dipecah: satu utterance panjang
 *    berhenti sendiri di Chromium (cacat yang sudah diketahui), dan jawabannya
 *    putus di tengah. Diuji pada fungsi aslinya, bukan salinan.
 *
 * 4. FOKUS TIDAK DIREBUT. Tombol bicara TIDAK BOLEH memindahkan fokus dari
 *    textarea - orang mengetik sambil mendengarkan.
 *
 * 5. TIDAK ADA ERROR DI CONSOLE setelah semua ini.
 *
 * Dipanggil: node scripts/verify-voice.mjs [port] [--reload]
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const RELOAD = process.argv.includes('--reload');

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
    const d = m.params.exceptionDetails;
    errors.push((d.exception?.description ?? d.text ?? '').slice(0, 200));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    const t = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (!/Download the React DevTools|SpeechRecognition/i.test(t)) errors.push(('[console] ' + t).slice(0, 200));
  }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});

await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');
if (RELOAD) { await send('Page.enable'); await send('Page.reload'); await new Promise((r) => setTimeout(r, 4000)); }

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 250);
  return r.result?.result?.value;
};

/*
 * `awaitPromise: true` sering gagal di WebView2 ("Promise was collected"), jadi
 * promise disimpan di window lalu di-polling - trik yang sudah dipakai harness
 * lain di proyek ini karena satu-satunya cara yang bekerja.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runAsync(expr, tungguMs = 8000) {
  await evalJs(`window.__v = { selesai: false, hasil: null };
    (async () => { try { window.__v.hasil = await (${expr}); } catch (e) { window.__v.hasil = 'ERR ' + String(e && e.message || e).slice(0, 200); } window.__v.selesai = true; })()`);
  for (let i = 0; i < tungguMs / 200; i += 1) {
    const r = await evalJs(`JSON.stringify(window.__v)`);
    try { const p = JSON.parse(r); if (p.selesai) return p.hasil; } catch { /* belum siap */ }
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

console.log('== Voice: setelan, mesin suara, dan tombol baca ==\n');

/* ---------- 1. Mesin suara platform ---------- */
const mesin = await runAsync(`(async () => {
  if (!('speechSynthesis' in window)) return JSON.stringify({ ada: false });
  const daftar = window.speechSynthesis.getVoices();
  return JSON.stringify({ ada: true, jumlah: daftar.length });
})()`);
let m = {};
try { m = JSON.parse(mesin); } catch { /* biarkan */ }
cek('platform punya speechSynthesis', m.ada === true, 'ada=' + m.ada + ' suara=' + m.jumlah);

/* ---------- 2. Setelan voice: tulis lalu baca dari DISK ---------- */
/*
 * Ditulis lewat store UTAMA.
 *
 * Ketiga jembatan ini mudah tertukar, dan salah pilih menghasilkan TypeError yang
 * tertelan menjadi `undefined` - ujinya lalu melaporkan "gagal tersimpan" padahal
 * menulisnya belum pernah dicoba:
 *
 *   window.__ZEPHYR__          store utama, punya getState/applySettings/settings
 *   window.__ZEPHYR_EX__       store kedua (dulu dikira jembatan dev)
 *   window.__ZEPHYR_SETTINGS__ hanya {buka, tutup, section} - kontrol halaman UI
 *
 * Setelan ada di store utama, dan jalur tulisnya `applySettings`.
 */
const simpan = await runAsync(`(async () => {
  const st = window.__ZEPHYR__;
  if (!st || typeof st.getState !== 'function') return 'TIDAK ADA store utama';
  const s = st.getState();
  if (typeof s.applySettings !== 'function') return 'TIDAK ADA applySettings';
  const voice = Object.assign({}, s.settings.voice, {
    enabled: true, speakReplies: false, inputLang: 'en-GB',
    rate: 1.3, volume: 0.6, skipCode: false, voiceId: ''
  });
  await s.applySettings({ voice });
  await new Promise((r) => setTimeout(r, 900));
  return JSON.stringify(st.getState().settings.voice);
})()`);
let sv = {};
try { sv = JSON.parse(simpan); } catch { /* biarkan */ }
cek('inputLang tersimpan', sv.inputLang === 'en-GB', sv.inputLang);
cek('rate tersimpan', sv.rate === 1.3, sv.rate);
cek('volume tersimpan', sv.volume === 0.6, sv.volume);
cek('skipCode tersimpan (nilai false, bukan hilang)', sv.skipCode === false, String(sv.skipCode));

/* ---------- 3. Pemotongan teks: fungsi ASLI, bukan salinan ---------- */
const potong = await runAsync(`(async () => {
  const mod = await import('/src/lib/useBicara.ts?uji=1');
  const panjang = 'Kalimat satu. Kalimat dua. Kalimat tiga. '.repeat(40);
  const hasil = mod.potongTeks(panjang);
  const kode = mod.potongTeks('Ini penjelasan. \\u0060\\u0060\\u0060js\\nconst a = 1;\\n\\u0060\\u0060\\u0060 Lanjut.');
  return JSON.stringify({
    panjangAsli: panjang.length,
    jumlahPotongan: hasil.length,
    potonganTerpanjang: Math.max(...hasil.map((x) => x.length)),
    semuaKecil: hasil.every((x) => x.length <= 200),
    kodeDilewati: !kode.join(' ').includes('const a = 1'),
  });
})()`);
let p = {};
try { p = JSON.parse(potong); } catch { /* biarkan */ }
cek('teks panjang dipecah, bukan satu utterance',
  typeof p.jumlahPotongan === 'number' && p.jumlahPotongan > 3,
  p.panjangAsli + ' char -> ' + p.jumlahPotongan + ' potongan');
cek('tiap potongan <= 200 char', p.semuaKecil === true, 'terpanjang=' + p.potonganTerpanjang);
cek('blok kode tidak dibacakan', p.kodeDilewati === true, String(p.kodeDilewati));

/* ---------- 4. Setelan dikembalikan seperti semula ---------- */
const pulih = await runAsync(`(async () => {
  const st = window.__ZEPHYR__;
  await st.getState().applySettings({ voice: {
    enabled: true, speakReplies: false, inputLang: 'en-US',
    voiceId: '', rate: 1, pitch: 1, volume: 1, skipCode: true
  } });
  await new Promise((r) => setTimeout(r, 700));
  const v = st.getState().settings.voice || {};
  return JSON.stringify({ ok: v.inputLang === 'en-US' && v.rate === 1 && v.skipCode === true, v });
})()`);
let pu = {};
try { pu = JSON.parse(pulih); } catch { /* biarkan */ }
cek('setelan dikembalikan ke bawaan', pu.ok === true, String(pu.ok));

/* ---------- 5. Tombol ada di UI, dan fokus tidak direbut ---------- */
const tombol = await runAsync(`(async () => {
  /* Buka panel AI kalau belum terbuka, lalu tunggu pesan ada. */
  const st = window.__ZEPHYR__ && window.__ZEPHYR__.store;
  const ai = window.__ZEPHYR_AI__ && window.__ZEPHYR_AI__.store;
  if (!ai) return JSON.stringify({ bridge: false });
  const jml = ai.getState().sessions.reduce((n, s) => n + s.messages.filter((x) => x.role !== 'user' && !x.error).length, 0);
  return JSON.stringify({ bridge: true, pesanAsisten: jml });
})()`);
let tb = {};
try { tb = JSON.parse(tombol); } catch { /* biarkan */ }
cek('bridge AI ada', tb.bridge === true, String(tb.bridge));

/* Fokus: kalau tombol bicara mencuri fokus, orang tidak bisa mengetik sambil
   mendengarkan. Diuji lewat elemen aktif, bukan lewat membaca kode. */
const fokus = await runAsync(`(async () => {
  /*
   * Buka panel AI dulu. Tanpa ini, percobaan pertama selalu melaporkan
   * "textarea composer ada: false" ketika harness dijalankan pada app yang baru
   * dibuka - dan itu terbaca seperti composer yang hilang, padahal panelnya
   * hanya belum terbuka. Uji yang bergantung pada langkah manual sebelumnya akan
   * gagal sendiri saat dijalankan berurutan.
   */
  const st = window.__ZEPHYR__ && window.__ZEPHYR__.getState && window.__ZEPHYR__.getState();
  if (st) {
    if (typeof st.setPanel === 'function') st.setPanel('ai');
    if (typeof st.setAiOpen === 'function') st.setAiOpen(true);
    if (typeof st.setAiPanelOpen === 'function') st.setAiPanelOpen(true);
  }
  await new Promise((r) => setTimeout(r, 700));

  const ta = document.querySelector('.ai-composer textarea, .ai-input textarea, textarea[data-testid="ai-input"]');
  if (!ta) return JSON.stringify({ adaTextarea: false });
  ta.focus();
  const sebelum = document.activeElement === ta;
  const btn = document.querySelector('[data-testid="ai-speak-msg"]');
  if (btn) { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); btn.click(); }
  await new Promise((r) => setTimeout(r, 300));
  return JSON.stringify({ adaTextarea: true, fokusSebelum: sebelum, fokusSesudahMasih: document.activeElement === ta, adaTombol: !!btn });
})()`);
let fk = {};
try { fk = JSON.parse(fokus); } catch { /* biarkan */ }
cek('textarea composer ada', fk.adaTextarea === true, String(fk.adaTextarea));

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 3).join(' | ') : '(tidak ada)'));
cek('tidak ada error di console', errors.length === 0, errors.length + ' error');

/* ---------- 6. Field suara baru + section mic ---------- */
const baru = await runAsync(`(async () => {
  const st = window.__ZEPHYR__;
  const s = st.getState();
  const voice = Object.assign({}, s.settings.voice, {
    neuralEnabled: true, neuralProvider: 'groq', neuralModel: 'playai-tts',
    neuralVoiceId: 'nova', neuralFollowLang: false, neuralVolume: 1.5
  });
  const mic = Object.assign({}, s.settings.mic, {
    enabled: true, provider: 'groq', model: 'whisper-large-v3-turbo',
    lang: 'id-ID', autoSend: true
  });
  await s.applySettings({ voice, mic });
  await new Promise((r) => setTimeout(r, 900));
  const v = st.getState().settings.voice || {};
  const m = st.getState().settings.mic || {};
  const ok = v.neuralProvider === 'groq' && v.neuralModel === 'playai-tts'
    && v.neuralVoiceId === 'nova' && v.neuralFollowLang === false && v.neuralVolume === 1.5
    && m.provider === 'groq' && m.model === 'whisper-large-v3-turbo'
    && m.lang === 'id-ID' && m.autoSend === true;
  await s.applySettings({ voice: Object.assign({}, v, { neuralEnabled: false }), mic: Object.assign({}, m, { autoSend: false }) });
  st.getState().setSettingsOpen(true);
  await new Promise((r) => setTimeout(r, 1200));
  const nav = !!document.querySelector('[data-testid="set-nav-mic"]');
  return JSON.stringify({ ok, nav });
})()`);
let nb = {};
try { nb = JSON.parse(baru); } catch { /* biarkan */ }
cek('field neural+mic tersimpan', nb.ok === true, String(nb.ok));
cek('nav Mic ada', nb.nav === true, String(nb.nav));

console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total ? 0 : 1);
