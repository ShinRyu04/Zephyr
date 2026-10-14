/**
 * cek-pengetahuan-live.mjs — "Zeph harus tahu semua soal Zephyr" diuji pada app
 * yang benar-benar jalan, bukan pada berkas fakta yang dibaca mata kita.
 *
 * Dua hal yang dibuktikan, dan keduanya butuh app hidup:
 *   A. Prompt yang SUNGGUH disusun `__ZEPHYR_PROMPT__.system(...)` memuat blok
 *      fakta Zephyr (identitas, port, kunci setelan, seksi Chat Settings,
 *      aturan anti-ngarang, aturan folder shell). Berkas fakta yang benar tapi
 *      tidak pernah masuk ke prompt adalah fakta mati - jadi yang diperiksa
 *      hasil komposisi, bukan sumbernya.
 *   B. Run agen NYATA yang dijawab dari pengetahuan itu. Pertanyaannya soal
 *      Zephyr sendiri (kunci setelan + port + letak kontrol), jawabannya
 *      dicocokkan ke sumber kebenaran: `agents.maxPanes`, MCP 9222, CDP 9223,
 *      dan kontrol sub-agent di Chat Settings.
 *
 * Sekaligus bukti kedua: run ini dibuka TANPA workspace (tidak ada
 * openWorkspace). Kalau "chat butuh folder dulu" masih berlaku, run-nya akan
 * menolak atau menjawab minta folder - dan itu terbaca dari balasannya.
 *
 *   node scripts/cek-pengetahuan-live.mjs [port]
 *   Env: MENIT=5
 */
import { spawn } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const MENIT = Number(process.env.MENIT ?? 5);
const MOCK_PORT = process.env.MOCK_PORT ?? '8098';
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const R = reporter('Zeph tahu Zephyr: prompt + jawaban run nyata (tanpa workspace)');

/* Bagian B/C mengukur PENGETAHUAN lewat run nyata, jadi provider yang dipakai
   harus mock. Kalau app masih menunjuk provider asli, yang terbaca cuma galat
   kredensial (401 "API key salah/kadaluarsa") dan SEMUA pemeriksaan jawaban
   merah - bukan karena pengetahuannya kurang (kejadian nyata 2026-10-14: 16/22,
   B3/B4/B5 + C2/C3/C5 merah dengan balasan 401). Harness ini karena itu
   meluncurkan mock-ai-nya sendiri dan mengarahkan provider ke sana; setelan
   aslinya dikembalikan oleh `cdp.close()` (lib-cdp menyimpan snapshot settings). */
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
  R.check('A0-mock', false, `mock AI tidak bisa diluncurkan di ${MOCK} - bagian B/C tidak bisa diukur`);
  R.selesai();
  process.exit(1);
}

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

/* ---------- A. prompt yang benar-benar disusun app ---------- */

const prompt = await cdp.json(
  `return JSON.stringify((() => {
  const P = window.__ZEPHYR_PROMPT__;
  if (!P || !P.system) return { ada: false };
  const kandidat = ['id', 'en'].map((lang) => String(P.system(lang, 'KONTEKS-UJI', 'ATURAN-UJI') || ''));
  const teks = kandidat.sort((a, b) => b.length - a.length)[0] || '';
  return { ada: true, panjang: teks.length, teks };
})())`,
  30000,
);

if (!prompt.ada) {
  R.check('A0', false, 'bridge __ZEPHYR_PROMPT__.system tidak ada di halaman (app perlu reload?)');
  await cdp.close();
  R.selesai();
}

const T = prompt.teks;
const punya = (re) => re.test(T);
const label = (re) => (re.source || '').slice(0, 40);

console.log(`     prompt nyata: ${prompt.panjang} char (dua bahasa dicoba, yang terpanjang dipakai)`);

R.check('A1', punya(/the app you are running inside/i) && punya(/Tauri/),
  'blok fakta Zephyr ikut terkirim (identitas: editor Tauri + React)');
R.check('A2', punya(/9222/) && punya(/9223/) && punya(/5173/),
  'port nyata ada di prompt: MCP 9222, CDP/debug 9223, dev UI 5173');
R.check('A3', punya(/agents[^\\n]*maxPanes/) && punya(/subagent[^\\n]*maxParallel/),
  'kunci setelan nyata ada (agents.maxPanes, subagent.maxParallel) - bukan nama karangan');
R.check('A4', punya(/Chat Settings/) && punya(/sub-?agents|Sub-agents/i) && punya(/permissions/i),
  'seksi Chat Settings nyata disebut (Sub-agents, Tools, Permissions)');
R.check('A5', punya(/never invent|not in this block/i),
  'aturan anti-ngarang ada (wajib pakai nama yang tercantum)');
R.check('A6', punya(/start in the folder of the file that is open/),
  'aturan folder shell ada (perintah mulai di folder berkas yang dibuka)');
R.check('A7', !/Minta user membuka folder dulu \\(File -> Open Folder\\)/.test(T),
  'prompt tidak lagi menuntut workspace sebelum bisa bekerja');
R.check('A8', punya(/__ZEPHYR_AI__/) && punya(/__ZEPHYR_TODO__/),
  'nama bridge nyata disebut (__ZEPHYR_AI__, __ZEPHYR_TODO__)');
/* Blok fakta harus MEMBAWA caranya: pertanyaan soal Zephyr dijawab dari situ,
   bukan dengan menyisir proyek. Tanpa kalimat ini, model tahu faktanya tapi
   tetap mencari - dan itu terbukti memakan satu run penuh. */
/* Prompt bisa tersusun dalam bahasa apa pun; yang wajib ada adalah MAKNANYA.
   Dua kalimat ini yang mengubah kelakuan: (1) jawab dari blok fakta, jangan
   menyisir proyek; (2) tanpa folder, tool folder tidak ditawarkan. Sebelumnya
   kalimat (2) mati total - ia menumpang di cabang "konteks kosong" yang nyaris
   tak pernah terjadi - jadi yang diuji di sini bukan sekadar teks ada, tapi
   teks yang benar-benar terkirim ke model. */
R.check('A9', punya(/## Answering questions about Zephyr itself/) &&
    (punya(/answered from the Zephyr facts block above, not by searching/) ||
      punya(/dijawab dari blok fakta Zephyr di atas, bukan dengan mencari/)) &&
    (punya(/Folder-scoped tools \(list_directory, glob, grep\) are not offered/) ||
      punya(/Tool ber-scope folder \(list_directory, glob, grep\) tidak ditawarkan/)),
  'prompt terkirim memuat: jawab dari fakta + tool folder tidak ditawarkan tanpa folder');

/* ---------- arahkan provider ke mock (tanpa ini bagian B/C cuma membaca 401) ---------- */

const SIAP = `
  const stz = window.__ZEPHYR__.getState();
  await window.__ZEPHYR_SET__.set({ models: { ...stz.settings.models, activeProvider: 'custom',
    providers: { ...(stz.settings.models?.providers ?? {}), custom: { baseUrl: '${MOCK}/v1', model: 'mock-model' } } } });
  await window.__ZEPHYR_SET__.setKey('custom', 'MOCK-KEY-PENGETAHUAN');
  const A = window.__ZEPHYR_AI__.store;
  if (typeof A.getState().sinkronProvider === 'function') A.getState().sinkronProvider();
  A.setState({ provider: 'custom', model: 'mock-model' });
  await A.getState().loadKeys();
  if (typeof A.getState().newChat === 'function') A.getState().newChat();
  A.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });
  return JSON.stringify({ provider: A.getState().provider, model: A.getState().model,
    baseUrl: window.__ZEPHYR__.getState().settings.models?.providers?.custom?.baseUrl ?? null,
    busy: !!A.getState().agentBusy });
`;
const siap = await cdp.json(`return JSON.stringify(await (async () => { ${SIAP} })())`, 60000);
console.log(`     provider diarahkan ke mock ${MOCK_PORT}: ${JSON.stringify(siap)}`);

/* ---------- B. run agen nyata, tanpa workspace ---------- */

const pra = await cdp.json(
  `return JSON.stringify({
  busy: window.__ZEPHYR_AI__.store.getState().agentBusy,
  ws: (window.__ZEPHYR__ && window.__ZEPHYR__.getState) ? (window.__ZEPHYR__.getState().workspace ?? null) : null,
})`,
  30000,
);
if (pra.busy) {
  R.check('B0', false, 'agen masih sibuk - tidak menumpuk run; ulangi setelah idle');
  await cdp.close();
  R.selesai();
}

const TANYA =
  'Pertanyaan soal Zephyr sendiri (aplikasi ini), bukan soal berkas apa pun: ' +
  '(1) kunci setelan mana yang mengatur berapa pane terminal boleh jalan bersamaan, dan berapa nilai bawaannya? ' +
  '(2) port berapa yang dipakai server MCP secara bawaan, dan port mana yang dicadangkan untuk debug WebView2/CDP? ' +
  '(3) kontrol sub-agent (maxParallel, allowWrite) muncul di halaman mana? ' +
  'Jawab singkat 3 poin, sebutkan nama kunci setelannya apa adanya. Tidak perlu membaca berkas.';

const jalankan = async (soal) =>
  await cdp.json(
    `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  /* Sengaja TIDAK memanggil openWorkspace: inilah uji "chat tanpa workspace". */
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentMode) A.getState().setAgentMode('agent');
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
  const wsAwal = (window.__ZEPHYR__ && window.__ZEPHYR__.getState) ? (window.__ZEPHYR__.getState().workspace ?? null) : null;

  const t0 = Date.now();
  let galatKirim = null;
  try { void A.getState().send(${JSON.stringify(soal)}); }
  catch (e) { galatKirim = String(e && e.message ? e.message : e); }
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  const mulaiBusy = A.getState().agentBusy;

  const langkah = () => (A.getState().agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
  let akhirLangkah = -1, diam = Date.now();
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const n = langkah().length;
    if (!s.agentBusy) {
      const sn = s.activeSession ? s.activeSession() : null;
      const ms = (sn && sn.messages) ? sn.messages : [];
      const terakhir = ms.length ? ms[ms.length - 1] : null;
      return {
        ok: true, ms: Date.now() - t0, langkah: n, nama: langkah().map((x) => x.name),
        galatKirim, mulaiBusy, wsAwal,
        wsSesudah: (window.__ZEPHYR__ && window.__ZEPHYR__.getState) ? (window.__ZEPHYR__.getState().workspace ?? null) : null,
        balasan: terakhir ? String(terakhir.content || '') : '',
        error: terakhir ? (terakhir.error || null) : null,
        gagal: langkah().filter((x) => x.ok === false || x.error).map((x) => x.name),
      };
    }
    if (n !== akhirLangkah) { akhirLangkah = n; diam = Date.now(); }
    else if (Date.now() - diam > 180000) {
      return { ok: false, macet: true, ms: Date.now() - t0, langkah: n, nama: langkah().map((x) => x.name) };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, timeout: true };
})())`,
    MENIT * 60000 + 60000,
  );

/* Satu sampel bisa meleset walau faktanya ada di prompt: model kadang menyebut
   satu poin "tidak ada di blok" padahal barisnya jelas tertulis. Karena itu
   jawaban yang gagal pada poin PENGETAHUAN diulang sekali, dan kedua percobaan
   dilaporkan - bukan disembunyikan. Kalau percobaan kedua juga meleset, itu
   temuan nyata, bukan derau. */
const cocokPengetahuan = (t) =>
  /maxPanes/i.test(t) && /9222/.test(t) && /9223/.test(t) && /chat settings/i.test(t);

let hasil = await jalankan(TANYA);
let percobaan = 1;
while (percobaan < 2 && hasil.ok === true && !cocokPengetahuan(String(hasil.balasan || ''))) {
  console.log('\n     percobaan 1 meleset pada poin pengetahuan; mengulang sekali...');
  console.log('     jawaban percobaan 1: ' + String(hasil.balasan || '').trim().slice(0, 400).replace(/\n/g, ' '));
  percobaan += 1;
  hasil = await jalankan(TANYA);
}

const bal = String(hasil.balasan || '');
console.log(`\n     run: ${hasil.ok ? Math.round(hasil.ms / 1000) + 's, ' + hasil.langkah + ' langkah' : hasil.macet ? 'MACET' : 'TIMEOUT'}` +
  `  workspace awal=${hasil.wsAwal ?? 'kosong'}`);
console.log('     langkah: ' + ((hasil.nama ?? []).join(' -> ') || 'tidak ada tool dipakai').slice(0, 300));
console.log('\n--- jawaban Zeph ---');
console.log('     ' + (bal.trim().slice(0, 900).replace(/\n/g, '\n     ') || '(kosong)'));

R.check('B1', hasil.galatKirim === null && hasil.mulaiBusy === true,
  `chat diterima tanpa workspace (galat=${hasil.galatKirim ?? 'tidak ada'}, sibuk=${hasil.mulaiBusy})`);
R.check('B2', hasil.ok === true && !hasil.error,
  `run berakhir sendiri (${hasil.ok ? Math.round(hasil.ms / 1000) + 's' : 'tidak selesai'}; error=${hasil.error ?? 'bersih'})`);

const sebut = (re) => re.test(bal);
R.check('B3', sebut(/maxPanes/i), 'jawaban menyebut kunci setelan nyata: agents.maxPanes');
R.check('B4', sebut(/9222/) && sebut(/9223/), 'jawaban benar soal port: MCP 9222 + CDP/debug 9223');
R.check('B5', sebut(/chat settings/i), 'jawaban menaruh kontrol sub-agent di Chat Settings (bukan nav Settings)');
R.check('B6', !/buka folder|open folder|belum ada (folder|workspace)|butuh workspace|perlu workspace/i.test(bal),
  'tidak menuntut workspace untuk menjawab');
R.check('B7', (hasil.gagal ?? []).length === 0,
  `tidak ada langkah gagal (${(hasil.gagal ?? []).join(',') || 'bersih'})`);
/* Tanpa folder, tool folder tidak boleh muncul ATAU dicoba: satu panggilan
   grep yang ditolak dulu menghabiskan 110 detik run tanpa jawaban. */
const namaLangkah = (hasil.nama ?? []).join(' ');
R.check('B8', !/list_directory|\bglob\b|\bgrep\b/.test(namaLangkah),
  `tanpa folder, tidak ada tool folder yang dicoba (langkah: ${namaLangkah || 'kosong'})`);

/* ---- C. user kena MASALAH: Zeph harus menuntun, bukan menyisir -------------
   Ini sisi kedua permintaan Ryu ("biar user pada tau juga kalau ada masalah").
   Pertanyaan gejala adalah jebakan: bentuknya seperti laporan bug, jadi agen
   cenderung "memeriksa" - dulu ia menjalankan bash_run untuk membaca
   settings.json sendiri, kutipannya kacau di cmd, dan jawabannya berakhir
   dengan "mau saya kerjakan apa?" tanpa satu pun petunjuk berguna. Yang benar:
   sebut setelan/panel/pintasan yang mengaturnya dari blok fakta, lalu TAWARKAN
   pemeriksaan lanjutan. */
const gejala = await jalankan(
  'Panel bawah (terminal) di Zephyr gua hilang dan gak bisa munculin lagi. Ini kenapa dan gue harus cek di mana?' +
  ' Jangan buka folder atau nyari-nyari di proyek, jawab dari yang kamu tahu soal Zephyr.',
);
const balG = String(gejala.balasan || '');
const langkahG = (gejala.nama ?? []).join(' ');
console.log('\n--- jawaban Zeph (gejala) ---');
console.log('     ' + (balG.trim().slice(0, 700).replace(/\n/g, '\n     ') || '(kosong)'));
const cekGejala = {
  pintasan: /Ctrl\+J/i.test(balG),
  grupPanel: /panel/i.test(balG) && /height|visibleTabs|activeTab/i.test(balG),
  tempat: /settings\.json/i.test(balG),
  tanpaTool: !langkahG,
  tawaran: /mau|want|bilang saja|offer|buka(kan)? /i.test(balG),
};
console.log('     gejala: ' + JSON.stringify(cekGejala) + '  langkah: ' + (langkahG || 'kosong'));
R.check('C1', gejala.ok === true && !gejala.error,
  `run gejala berakhir sendiri (${gejala.ok ? Math.round(gejala.ms / 1000) + 's' : 'tidak selesai'}; error=${gejala.error ?? 'bersih'})`);
R.check('C2', cekGejala.pintasan && cekGejala.grupPanel,
  'gejala dijelaskan dari setelan/pintasan nyata (Ctrl+J + grup panel dengan kunci asli)');
R.check('C3', cekGejala.tempat, 'menyebut tempat nilai itu hidup (settings.json)');
R.check('C4', cekGejala.tanpaTool,
  `tidak menjalankan perintah/tool untuk pertanyaan gejala (langkah: ${langkahG || 'kosong'})`);
R.check('C5', cekGejala.tawaran,
  'menawarkan pemeriksaan lanjutan, bukan langsung memeriksa sendiri');

await cdp.close(); // memulihkan setelan/provider yang diarahkan ke mock
if (anakMock) {
  anakMock.kill();
  console.log('(mock-ai yang diluncurkan skrip ini dimatikan kembali)');
}
R.selesai();
