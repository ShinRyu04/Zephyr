/**
 * uji-jawab-bahasa.mjs — ATURAN KEJUJURAN BAHASA: Zeph menjawab dalam bahasa
 * yang dipakai user, bukan pindah ke Inggris.
 *
 * BELUM DIJALANKAN. Jangan jalankan sekarang: app Zephyr + CDP + Vite HMR
 * sedang dipakai agen/harness lain, jadi hasilnya bisa palsu dan mengganggu
 * pekerjaan mereka. Berkas ini ditulis + `node --check` saja.
 *
 * CARA MENJALANKAN (setelah mesin uji bebas):
 *     node scripts/uji-jawab-bahasa.mjs [cdpPort]        # port bawaan 9223
 *   Env: MENIT=5  MOCK_PORT=8098
 *   Skrip meluncurkan mock-ai sendiri bila belum hidup (sama seperti
 *   uji-keadaan-prompt.mjs: spawn + cek `${MOCK}/__version`), mengarahkan
 *   provider ke mock lewat `window.__ZEPHYR_SET__` + `setKey`, lalu
 *   `cdp.close()` memulihkan SELURUH setelan (snapshot settings saat attach).
 *
 * YANG DIANGGAP LULUS (dua bagian, dua-duanya harus hijau):
 *   1. STATIS - prompt sistem yang disusun HALAMAN (bukan berkas kita) memuat
 *      aturan bahasa yang KERAS: balas dalam bahasa pengguna. Diperiksa pada
 *      prompt berbahasa `id` DAN `en`; sekurangnya satu pola keras harus ada di
 *      kedua-duanya, karena kalau hanya salah satu, user berbahasa lain lolos.
 *   2. DINAMIS - sebuah pertanyaan berbahasa INDONESIA tentang Zephyr dikirim,
 *      dan jawaban yang BENAR-BENAR diterima provider tidak boleh berupa
 *      kalimat Inggris penuh. Heuristik: pecah jawaban jadi kalimat; satu
 *      kalimat dianggap "Inggris penuh" bila memuat >=3 kata fungsi Inggris dan
 *      TIDAK memuat kata fungsi Indonesia. Satu saja kalimat begitu -> MERAH.
 *
 * CATATAN JUJUR (jangan dibaca sebagai kelulusan yang lebih dari kenyataan):
 *   - Dengan mock scripted, jawaban selalu teks bawaan mock (Indonesia), jadi
 *     uji DINAMIS di sini terutama menjaga ATURAN + ALUR (prompt memuat aturan
 *     bahasa, giliran keluar, jawaban tidak beralih bahasa oleh jalur kode),
 *     BUKAN menilai kualitas bahasa model nyata. Untuk menilai model sungguhan,
 *     arahkan provider ke kunci asli (lihat cek-pengetahuan-2lapis.mjs).
 *   - Heuristik bahasa sengaja konservatif (butuh kalimat Inggris PENUH); satu
 *     istilah Inggris di tengah kalimat Indonesia tidak dianggap pelanggaran.
 */
import { spawn } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const MENIT = Number(process.env.MENIT ?? 5);
const MOCK_PORT = process.env.MOCK_PORT ?? '8098';
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const R = reporter('Zeph menjawab dalam bahasa yang dipakai user (aturan bahasa)');

const tunda = (ms) => new Promise((r) => setTimeout(r, ms));
async function mockHidup() {
  try {
    return (await fetch(`${MOCK}/__version`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}
let anakMock = null;
if (!(await mockHidup())) {
  console.log(`(mock-ai belum hidup, diluncurkan sendiri di ${MOCK})`);
  anakMock = spawn(process.execPath, ['scripts/mock-ai.mjs', String(MOCK_PORT)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let i = 0; i < 40 && !(await mockHidup()); i++) await tunda(500);
}
if (!(await mockHidup())) {
  R.check('L0-mock', false, `mock AI tidak bisa diluncurkan di ${MOCK} - uji bahasa tidak bisa dinilai`);
  R.selesai();
  process.exit(1);
}

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

/* ---------- 1. STATIS: aturan bahasa keras di prompt yang disusun halaman ----
   Pola keras = kalimat yang MEMERINTAHKAN memakai bahasa pengguna. Dua kelompok:
   instruksi langsung, dan penanda blok bahasa ("# Language for this turn"). */
const POLA_KERAS = [
  /balas[^\n]{0,60}dalam bahasa (yang )?(dipakai|digunakan|ditulis)[^\n]{0,40}pengguna/i,
  /bahasa yang (dipakai|digunakan)[^\n]{0,40}(pengguna|user)[^\n]{0,80}(balas|jawab|tulis)/i,
  /(reply|respond|answer|write)[^\n]{0,60}in the (same )?language[^\n]{0,40}(the )?(user|they|you) /i,
  /same language (as|that) the user/i,
  /#\s*Language for this turn/i,
  /bahasa Indonesia/i,
];
const promptPer = await cdp.json(
  `return JSON.stringify((() => {
  const P = window.__ZEPHYR_PROMPT__;
  if (!P || !P.system) return { ada: false };
  return { ada: true, id: String(P.system('id', 'KONTEKS-UJI', 'ATURAN-UJI') || ''), en: String(P.system('en', 'KONTEKS-UJI', 'ATURAN-UJI') || '') };
})())`,
  30000,
);
if (!promptPer.ada) {
  R.check('L1a', false, 'bridge __ZEPHYR_PROMPT__.system tidak ada (app perlu reload?)');
  await cdp.close();
  R.selesai();
}
const cocokKeras = (teks) => POLA_KERAS.map((re) => re.test(teks)).some(Boolean);
const kerasId = cocokKeras(promptPer.id);
const kerasEn = cocokKeras(promptPer.en);
const polaDipakai = POLA_KERAS.filter((re) => re.test(promptPer.id) || re.test(promptPer.en))
  .map((re) => String(re).slice(0, 60));
console.log(`     prompt: id=${promptPer.id.length} char (aturan bahasa=${kerasId ? 'ADA' : 'TIDAK'}), en=${promptPer.en.length} char (${kerasEn ? 'ADA' : 'TIDAK'})`);
console.log(`     pola aturan bahasa yang cocok: ${JSON.stringify(polaDipakai)}`);
R.check('L1a', kerasId && kerasEn,
  `prompt (dua bahasa) memuat aturan bahasa keras: balas dalam bahasa pengguna (id=${kerasId}, en=${kerasEn})`);

/* ---------- 2. DINAMIS: pertanyaan Indonesia -> jawaban tidak boleh Inggris -- */
const SIAP = `
  const stz = window.__ZEPHYR__.getState();
  await window.__ZEPHYR_SET__.set({ models: { ...stz.settings.models, activeProvider: 'custom',
    providers: { ...(stz.settings.models?.providers ?? {}), custom: { baseUrl: '${MOCK}/v1', model: 'mock-model' } } } });
  await window.__ZEPHYR_SET__.setKey('custom', 'MOCK-KEY-BAHASA');
  const A = window.__ZEPHYR_AI__.store;
  if (typeof A.getState().sinkronProvider === 'function') A.getState().sinkronProvider();
  A.setState({ provider: 'custom', model: 'mock-model' });
  await A.getState().loadKeys();
  if (typeof A.getState().newChat === 'function') A.getState().newChat();
  A.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });
  return JSON.stringify({ provider: A.getState().provider, model: A.getState().model,
    busy: !!A.getState().agentBusy });
`;
const siap = await cdp.json(`return JSON.stringify(await (async () => { ${SIAP} })())`, 60000);
console.log(`     provider diarahkan ke mock ${MOCK_PORT}: ${JSON.stringify(siap)}`);
if (siap.busy) {
  R.check('L2a', false, 'agen masih sibuk - tidak menumpuk run; ulangi setelah idle');
  await cdp.close();
  R.selesai();
}

const SOAL = 'Panel terminal bawah di Zephyr gua hilang, gimana cara munculin lagi? Jawab singkat pakai bahasa Indonesia.';

const run = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentMode) A.getState().setAgentMode('agent');
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
  const t0 = Date.now();
  let galatKirim = null;
  try { void A.getState().send(${JSON.stringify(SOAL)}); }
  catch (e) { galatKirim = String(e && e.message ? e.message : e); }
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  while (Date.now() - t0 < ${MENIT} * 60000) {
    if (!A.getState().agentBusy) {
      const sn = A.getState().activeSession ? A.getState().activeSession() : null;
      const ms = (sn && sn.messages) ? sn.messages : [];
      const terakhir = ms.length ? ms[ms.length - 1] : null;
      return { ok: true, galatKirim, balasan: terakhir ? String(terakhir.content || '') : '',
        error: terakhir ? (terakhir.error || null) : null };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, timeout: true, galatKirim };
})())`,
  MENIT * 60000 + 60000,
);
const bal = String(run.balasan || '');
console.log(`     jawaban (${bal.length} char): ` + bal.trim().slice(0, 400).replace(/\n/g, ' '));

const ID_FUNGSI = /\b(yang|dan|di|ke|untuk|dengan|ini|itu|tidak|bisa|anda|kamu|adalah|dari|pada|akan|sudah|kalau|jika|atau|juga|saya|panel|setelan|buka|hilang)\b/i;
const EN_FUNGSI = /\b(the|is|are|this|that|with|your|you|and|to|of|for|in|on|it|will|can|should|would|have|has|not|there|from)\b/gi;
const kalimat = bal.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 12);
const inggrisPenuh = kalimat.filter((s) => {
  const n = (s.match(EN_FUNGSI) || []).length;
  return n >= 3 && !ID_FUNGSI.test(s);
});
console.log(`     kalimat dinilai=${kalimat.length} indonesia=${kalimat.length - inggrisPenuh.length} inggris-penuh=${inggrisPenuh.length}` +
  (inggrisPenuh.length ? ` contoh=${JSON.stringify(inggrisPenuh[0].slice(0, 120))}` : ''));

R.check('L2a', run.ok === true && run.galatKirim === null && bal.trim().length > 0,
  `giliran berbahasa Indonesia terkirim dan ada jawaban (galat=${run.galatKirim ?? 'tidak ada'}, jawaban=${bal.trim().length} char)`);
R.check('L2b', inggrisPenuh.length === 0,
  `jawaban untuk pertanyaan Indonesia tidak pindah ke bahasa Inggris penuh (kalimat Inggris penuh: ${inggrisPenuh.length})`);
R.check('L2c', ID_FUNGSI.test(bal),
  'jawaban tetap memakai penanda bahasa Indonesia (bukan Inggris saja)');

await cdp.close(); // memulihkan setelan/provider yang diarahkan ke mock
if (anakMock) {
  anakMock.kill();
  console.log('(mock-ai yang diluncurkan skrip ini dimatikan kembali)');
}
R.selesai();
