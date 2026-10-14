/**
 * cek-pengetahuan-2lapis.mjs — KANONIK. "Zeph harus tahu semua soal Zephyr"
 * diuji pada app yang benar-benar jalan, dan diuji JUJUR dalam DUA LAPIS.
 *
 * (Berkas ini menggantikan bagian B/C `cek-pengetahuan-live.mjs` yang lama.
 *  Berkas lama DIBIARKAN apa adanya - ia masih menyimpan A + B/C versi run nyata
 *  satu-lapis; jangan dihapus. Versi yang dipakai sekarang adalah berkas INI.)
 *
 * Kenapa dua lapis (kejadian nyata 2026-10-14):
 *   Run lama mengukur pengetahuan lewat RUN NYATA. Di mesin ini provider app
 *   dikonfigurasi dengan kunci placeholder (`Incorrect API key provided:
 *   MOCK-KEY****`), jadi tiap giliran berakhir 401 dan B3/B4/B5 + C2/C3/C5
 *   merah - bukan karena pengetahuannya kurang, tapi karena kuncinya palsu.
 *   Menandai merah di situ adalah kebohongan: yang diukur kunci, bukan model.
 *
 *   Karena itu pertanyaannya dipecah, bukan diakali:
 *
 *   LAPIS 1 (deterministik, TIDAK butuh kunci provider) - BODY REQUEST yang
 *     SUNGGUH diterima provider (mock, lewat jembatan yang sama dengan app)
 *     diperiksa isinya. Untuk tiap fakta uji dibuktikan fakta itu SAMPAI ke
 *     provider lewat SALAH SATU jalur:
 *       (a) blok inti / prompt sistem, atau
 *       (b) hasil tool `zephyr_self` yang benar-benar dikirim balik sebagai
 *           pesan role=tool (mock MENERIMA pesan itu, bukan cuma dihasilkan di
 *           halaman). Tiap fakta melaporkan jalur mana yang memenuhi, dan untuk
 *           (b) kueri + potongan hasil yang cocok ikut dilaporkan.
 *     Lapis ini tidak menyentuh model, jadi hasilnya tidak bisa dipengaruhi 401.
 *
 *   LAPIS 2 (run nyata penuh) - pemeriksaan B/C yang lama dipindah APA ADANYA,
 *     tapi HANYA dijalankan kalau provider app punya kunci NYATA. Kalau tidak,
 *     ditandai SKIP + alasan yang tercetak - BUKAN merah palsu. Lapis 2 sengaja
 *     TIDAK mengarahkan provider ke mock: kalau ada kunci nyata, yang mau
 *     dinilai model/providernya, bukan naskah mock.
 *
 * Bagian A (komposisi prompt di halaman) tetap apa adanya: ia mengukur teks
 * yang disusun halaman dan tidak butuh provider sama sekali.
 *
 *   node scripts/cek-pengetahuan-2lapis.mjs [port]
 *   Env: MENIT=5   MOCK_PORT=8098   LAPIS2=1|0 (paksa jalankan/lewati lapis 2)
 */
import { spawn } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const MENIT = Number(process.env.MENIT ?? 5);
const MOCK_PORT = process.env.MOCK_PORT ?? '8098';
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const R = reporter('Zeph tahu Zephyr: prompt + body yang diterima provider (lapis 1) + run nyata (lapis 2)');

/* Pencatat SKIP: TIDAK masuk R.results, jadi ia tidak menambah "lulus" dan tidak
   menyalakan kode keluar 1. Ia ada supaya "tidak bisa dinilai" tercetak apa
   adanya, bukan menyamar jadi merah. */
let jumlahSkip = 0;
const SKIP = (id, alasan) => {
  jumlahSkip += 1;
  console.log(`SKIP   ${String(id).padEnd(6)} ${alasan}`);
};

/* Mock dipakai HANYA oleh lapis 1 (body yang benar-benar diterima provider).
   Lapis 2, kalau jalan, bicara ke provider app yang sebenarnya. Setelan yang
   diarahkan ke mock dipulihkan oleh `cdp.close()` (lib-cdp menyimpan snapshot
   settings saat attach). */
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
  R.check('A0-mock', false, `mock AI tidak bisa diluncurkan di ${MOCK} - lapis 1 tidak bisa diukur`);
  R.selesai();
  process.exit(1);
}

/* ---------------------------------------------------------------- *
 * CDP WAJIB HIDUP. Skrip ini tidak bisa mengukur apa pun tanpa app yang
 * berjalan dengan remote debugging. Dulu jalur ini mati dengan
 * `TypeError: fetch failed` + `ECONNREFUSED 127.0.0.1:9223` tanpa petunjuk
 * (Cdp.attach, scripts/lib-cdp.mjs:181-182 -> fetch /json/list). Sekarang
 * port-nya diperiksa dulu dan sebabnya disebut apa adanya; kode keluar 2
 * berarti "tidak bisa diukur", BUKAN "lulus" dan BUKAN "merah".
 * ---------------------------------------------------------------- */
const KANDIDAT_PORT = [...new Set([PORT, process.env.ZEPHYR_CDP_PORT, '9223', '9222'].filter(Boolean))];
async function cdpHidup(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}
let portHidup = null;
for (const p of KANDIDAT_PORT) {
  if (await cdpHidup(p)) {
    portHidup = p;
    break;
  }
}
if (!portHidup) {
  anakMock?.kill();
  console.log('');
  console.log('TIDAK BISA DIUKUR: tidak ada CDP hidup di ' + KANDIDAT_PORT.join(', '));
  console.log('');
  console.log('  Sebab: instance app yang berjalan TIDAK diluncurkan dengan remote debugging.');
  console.log('  Port 9223 hanya ada kalau env WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS diisi:');
  console.log('    - scripts/jalankan-zephyr.cmd:8   set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223');
  console.log('    - scripts/luncur-zephyr.ps1:49    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = \'--remote-debugging-port=9223\'');
  console.log('  Titik yang gagal: scripts/cek-pengetahuan-2lapis.mjs:87 Cdp.attach(PORT)');
  console.log('                    -> scripts/lib-cdp.mjs:181-182 fetch http://127.0.0.1:<port>/json/list');
  console.log('  Jalankan lewat peluncur di atas (atau set env itu lalu start app), baru ulangi skrip ini.');
  console.log('  Tidak ada pemeriksaan yang ditandai lulus di jalur ini.');
  process.exit(2);
}
const { cdp } = await Cdp.attach(String(portHidup), ['Zephyr', 'Zephyr — Code Editor', 'localhost']);
/* ---------- deteksi kunci ASLI (SEBELUM apa pun menyentuh provider) ---------
   Sumber kebenaran: PublicModel[] dari AI store (`{provider, hasKey, preview}`)
   + provider aktif dari setelan. `preview` = mask kunci (4 depan…4 belakang),
   jadi kunci placeholder `MOCK-KEY*` terbaca `MOCK…xxxx`, dan kunci <=8 char
   jadi deretan titik. Keduanya BUKAN kunci nyata -> lapis 2 SKIP. */
const envKunci = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  try { if (typeof A.getState().loadKeys === 'function') await A.getState().loadKeys(); } catch (e) {}
  const st = window.__ZEPHYR__ ? window.__ZEPHYR__.getState() : null;
  const models = st && st.settings ? st.settings.models : null;
  const aktif = (models && models.activeProvider) || null;
  const keys = (A.getState().keys || []).map((k) => ({ provider: k.provider, hasKey: !!k.hasKey, preview: String(k.preview || '') }));
  const entri = keys.find((k) => k.provider === aktif) || keys.find((k) => k.hasKey) || null;
  const placeholder = !!entri && (/mock/i.test(entri.preview) || /^[\u2022]+$/.test(entri.preview));
  const kunciAsli = !!entri && entri.hasKey && !!entri.preview && !placeholder;
  return { aktif, entri, placeholder, kunciAsli };
})())`,
  60000,
);

const PAKSA = String(process.env.LAPIS2 ?? '').trim(); // '1' paksa jalankan, '0' paksa lewati
const kunciAsli = PAKSA === '1' ? true : PAKSA === '0' ? false : envKunci.kunciAsli;
const ALASAN_SKIP =
  `run nyata (B/C) tak dijalankan: provider aktif=${envKunci.aktif ?? '(tak diketahui)'} ` +
  `hasKey=${envKunci.entri ? envKunci.entri.hasKey : '(tak ada entri)'} preview=${JSON.stringify(envKunci.entri ? envKunci.entri.preview : '')}` +
  `${envKunci.placeholder ? ' (placeholder/MOCK-KEY terdeteksi -> kunci palsu)' : ''}` +
  `; nilai B/C akan mengukur kredensial, bukan pengetahuan. Pakai LAPIS 1 (deterministik).`;

console.log(`     kunci provider: aktif=${envKunci.aktif ?? '(?)'} kunciAsli=${kunciAsli}${PAKSA ? ` (dipaksa LAPIS2=${PAKSA})` : ''}`);

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

console.log(`     prompt nyata: ${prompt.panjang} char (dua bahasa dicoba, yang terpanjang dipakai)`);

R.check('A1', punya(/the app you are running inside/i) && punya(/Tauri/),
  'blok fakta Zephyr ikut terkirim (identitas: editor Tauri + React)');
R.check('A2', punya(/9222/) && punya(/9223/) && punya(/5173/),
  'port nyata ada di prompt: MCP 9222, CDP/debug 9223, dev UI 5173');
R.check('A3', punya(/agents[^\n]*maxPanes/) && punya(/subagent[^\n]*maxParallel/),
  'kunci setelan nyata ada (agents.maxPanes, subagent.maxParallel) - bukan nama karangan');
R.check('A4', punya(/Chat Settings/) && punya(/sub-?agents|Sub-agents/i) && punya(/permissions/i),
  'seksi Chat Settings nyata disebut (Sub-agents, Tools, Permissions)');
R.check('A5', punya(/never invent|not in this block/i),
  'aturan anti-ngarang ada (wajib pakai nama yang tercantum)');
R.check('A6', punya(/start in the folder of the file that is open/),
  'aturan folder shell ada (perintah mulai di folder berkas yang dibuka)');
R.check('A7', !/Minta user membuka folder dulu \(File -> Open Folder\)/.test(T),
  'prompt tidak lagi menuntut workspace sebelum bisa bekerja');
R.check('A8', punya(/__ZEPHYR_AI__/) && punya(/__ZEPHYR_TODO__/),
  'nama bridge nyata disebut (__ZEPHYR_AI__, __ZEPHYR_TODO__)');
/* Blok fakta harus MEMBAWA caranya: pertanyaan soal Zephyr dijawab dari situ,
   bukan dengan menyisir proyek. Tanpa kalimat ini, model tahu faktanya tapi
   tetap mencari - dan itu terbukti memakan satu run penuh. */
R.check('A9', punya(/## Answering questions about Zephyr itself/) &&
    (punya(/answered from the Zephyr facts block above, not by searching/) ||
      punya(/dijawab dari blok fakta Zephyr di atas, bukan dengan mencari/)) &&
    (punya(/Folder-scoped tools \(list_directory, glob, grep\) are not offered/) ||
      punya(/Tool ber-scope folder \(list_directory, glob, grep \) tidak ditawarkan/)),
  'prompt terkirim memuat: jawab dari fakta + tool folder tidak ditawarkan tanpa folder');

/* ---------- helper run agen (dipakai lapis 2 dan lapis 1) ---------- */

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

/* ==========================================================================
 * LAPIS 2 - run nyata penuh. B/C lama, APA ADANYA, hanya kalau ada kunci asli.
 * ========================================================================== */

if (kunciAsli) {
  console.log('\n===== LAPIS 2: run nyata (provider app ber-key asli) =====');

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

  /* ---- C. user kena MASALAH: Zeph harus menuntun, bukan menyisir -----------
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
} else {
  console.log('\n===== LAPIS 2: DILEWATI (tidak ada kunci asli) =====');
  SKIP('B*', ALASAN_SKIP);
  SKIP('C*', ALASAN_SKIP);
}

/* ==========================================================================
 * LAPIS 1 - deterministik, dari BODY REQUEST yang SUNGGUH diterima provider.
 * ========================================================================== */

console.log('\n===== LAPIS 1: body request yang diterima mock (tanpa kunci provider) =====');

/* Arahkan provider ke mock, HANYA untuk lapis 1. cdp.close() memulihkan. */
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

if (siap.busy) {
  R.check('L1-idle', false, 'agen masih sibuk - tidak menumpuk run; ulangi setelah idle');
  await cdp.close();
  R.selesai();
}

/** Prompt sistem dari body request yang diterima mock (OpenAI & Anthropic). */
function promptSistem(body) {
  if (!body) return '';
  if (Array.isArray(body.messages)) {
    const sys = body.messages.find((m) => m.role === 'system' || m.role === 'developer');
    if (sys) return typeof sys.content === 'string' ? sys.content : JSON.stringify(sys.content);
  }
  if (typeof body.system === 'string') return body.system;
  if (body.system) return JSON.stringify(body.system);
  return '';
}
/** Semua isi pesan role=tool/function di dalam satu body (bukti hasil tool
    BENAR-BENAR diteruskan ke provider, bukan cuma dihasilkan di halaman). */
function pesanTool(body) {
  const ms = Array.isArray(body?.messages) ? body.messages : [];
  const keluar = ms
    .filter((m) => m && (m.role === 'tool' || m.role === 'function'))
    .map((m) => String(typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')));
  /* Anthropic: tool_result menumpang di role=user. Tetap dihitung. */
  for (const m of ms) {
    const c = typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '');
    if (Array.isArray(m?.content) && m.content.some((b) => b && (b.type === 'tool_result' || b.tool_use_id))) keluar.push(c);
  }
  return keluar;
}
/** Satu giliran nyata ke mock; kembalikan seluruh log request yang diterima. */
async function giliranMock(teks) {
  await fetch(`${MOCK}/__reset`);
  const res = await jalankan(teks);
  const log = await (await fetch(`${MOCK}/__log`)).json();
  return { res, log: Array.isArray(log) ? log : [] };
}

/* Pertanyaan yang MEMANG menanyakan keenam fakta uji (isi pesan user tidak
   mengubah blok inti, tapi supaya laporan jujur "fakta yang ditanya", tanyanya
   memang menyebut semuanya). */
const TANYA_L1 =
  'Pertanyaan soal Zephyr sendiri (aplikasi ini), bukan soal berkas: ' +
  '(1) kunci setelan apa yang mengatur jumlah pane terminal per tab, dan berapa nilai bawaannya? ' +
  '(2) port bawaan server MCP berapa, dan port mana yang dicadangkan untuk debug WebView2/CDP? ' +
  '(3) kontrol sub-agent (maxParallel, allowWrite) dibuka dari mana? ' +
  '(4) pintasan apa yang menampilkan/menyembunyikan panel bawah? ' +
  '(5) di berkas apa nilai-nilai setelan itu hidup? ' +
  'Jawab singkat, sebutkan nama kunci/pintasan/jalurnya apa adanya. Tidak perlu membaca berkas.';

/* (1) giliran utama -> body pertama yang diterima provider. */
const g1 = await giliranMock(TANYA_L1);
const body1 = g1.log.length ? g1.log[0].body : null;
const sistem = promptSistem(body1);
console.log(`     giliran 1: ${g1.log.length} request diterima mock; prompt sistem ${sistem.length} char; langkah=${(g1.res.nama ?? []).join(' -> ') || 'kosong'}`);
console.log('     jawaban (mock): ' + String(g1.res.balasan || '').trim().slice(0, 200).replace(/\n/g, ' '));
R.check('L1a', sistem.length > 0,
  `body request diterima provider memuat prompt sistem (${sistem.length} char) - giliran benar-benar keluar dari app`);

/* (2) giliran penanda: mock DIMINTA memanggil zephyr_self; hasilnya harus balik
   ke provider sebagai pesan role=tool yang memuat signature ZEPHYR_SELF. */
const g2 = await giliranMock('Periksa Zephyr sendiri soal setelan/port (tanpa folder): TOOLCALL:zephyr_self');
const pesanToolSemua = [...g1.log.flatMap((e) => pesanTool(e.body)), ...g2.log.flatMap((e) => pesanTool(e.body))];
const selfLewatKawat = pesanToolSemua.some((c) => /ZEPHYR_SELF/.test(c));
console.log(`     giliran penanda: ${g2.log.length} request; total ${pesanToolSemua.length} pesan role=tool ke provider; signature ZEPHYR_SELF terlihat=${selfLewatKawat ? 'YA' : 'tidak'}`);
R.check('L1b', pesanToolSemua.length > 0,
  `provider MENERIMA ${pesanToolSemua.length} pesan role=tool (hasil tool benar-benar diteruskan ke provider, bukan cuma dihasilkan di halaman)` +
    `${selfLewatKawat ? ' - termasuk hasil zephyr_self (signature ZEPHYR_SELF)' : ''}`);

/* (3) pintu zephyr_self: dijalankan lewat jalur tool agen yang SAMA dengan yang
   dilihat model. Hasilnya dikumpulkan untuk jalur (b). */
const ambilSelf = async (args) =>
  await cdp.json(
    `return JSON.stringify(await (async () => {
  let T = null;
  for (let i = 0; i < 40 && !(T && typeof T.jalankanAgen === 'function'); i++) {
    T = window.__ZEPHYR_TOOLS__;
    if (!(T && typeof T.jalankanAgen === 'function')) await new Promise((r) => setTimeout(r, 250));
  }
  if (T && typeof T.jalankanAgen === 'function') {
    try { return { via: 'jalankanAgen', out: String(await T.jalankanAgen('zephyr_self', ${JSON.stringify(args)})) }; }
    catch (e) { /* jatuh ke import di bawah */ }
  }
  const m = await import('/src/lib/zephyrTools/zephyrSelf.ts');
  return { via: 'import', out: String(await m.jalankanZephyrSelf(${JSON.stringify(args)})) };
})())`,
    45000,
  );

const FAKTA_UJI = [
  {
    id: 'L1.1',
    label: 'agents.maxPanes + nilai bawaan (6)',
    cek: (t) => /maxPanes/i.test(t) && /maxPanes[^\n]{0,50}[=:]\s*6/i.test(t),
    kueri: [{ bagian: 'fakta', kueri: 'maxPanes', kategori: 'setelan' }, { bagian: 'setelan', kueri: 'maxPanes' }],
  },
  {
    id: 'L1.2',
    label: 'port MCP bawaan 9222',
    cek: (t) => /9222/.test(t) && /(?:mcp[^\n]{0,80}9222)|(?:9222[^\n]{0,80}mcp)/i.test(t),
    kueri: [{ bagian: 'fakta', kueri: '9222', kategori: 'port' }, { bagian: 'setelan', kueri: '9222' }],
  },
  {
    id: 'L1.3',
    label: 'port debug CDP/WebView2 9223',
    cek: (t) => /9223/.test(t) && /(?:9223[^\n]{0,80}(?:cdp|debug|webview))|(?:(?:cdp|debug|webview)[^\n]{0,80}9223)/i.test(t),
    kueri: [{ bagian: 'fakta', kueri: '9223', kategori: 'port' }],
  },
  {
    id: 'L1.4',
    label: 'kontrol sub-agent maxParallel/allowWrite di Chat Settings',
    cek: (t) => /maxParallel/i.test(t) && /allowWrite/i.test(t) && /chat settings/i.test(t),
    kueri: [{ bagian: 'fakta', kueri: 'maxParallel', kategori: 'setelan' }, { bagian: 'fakta', kueri: 'allowWrite', kategori: 'setelan' }],
  },
  {
    id: 'L1.5',
    label: 'Ctrl+J untuk panel bawah',
    cek: (t) => /ctrl\+j/i.test(t) && /(?:bottom panel|panel bawah)/i.test(t),
    kueri: [{ bagian: 'fakta', kueri: 'Ctrl+J', kategori: 'pintasan' }, { bagian: 'fakta', kueri: 'panel bawah', kategori: 'pintasan' }],
  },
  {
    id: 'L1.6',
    label: 'settings.json tempat nilai setelan hidup',
    cek: (t) => /settings\.json/i.test(t) && /(?:%appdata%|zephyr)/i.test(t),
    kueri: [{ bagian: 'fakta', kueri: 'settings.json' }, { bagian: 'setelan', kueri: 'settings.json' }],
  },
];

/** Potongan baris hasil zephyr_self yang cocok dengan sebuah fakta. */
function cuplikFakta(teks, cek) {
  const baris = String(teks).split('\n').find((l) => cek(l));
  return (baris ? baris.trim() : String(teks).slice(0, 200).replace(/\s+/g, ' ')).slice(0, 180);
}

const selfHasil = {};
for (const f of FAKTA_UJI) {
  let teks = '';
  const via = [];
  for (const q of f.kueri) {
    const r = await ambilSelf(q);
    teks += '\n' + r.out;
    via.push(`${r.via}:${JSON.stringify(q)}`);
  }
  selfHasil[f.id] = { teks, via };
}
const semuaSelf = Object.values(selfHasil).map((x) => x.teks).join('\n');
R.check('L1c', semuaSelf.length > 0 && /ZEPHYR_SELF/.test(semuaSelf),
  `pintu zephyr_self hidup dan menjawab dari indeks bundel (${semuaSelf.length} char dikumpulkan)`);

for (const f of FAKTA_UJI) {
  const diPrompt = f.cek(sistem);
  const diSelf = f.cek(selfHasil[f.id].teks);
  const jalur = [diPrompt ? 'prompt-inti' : null, diSelf ? 'zephyr_self' : null].filter(Boolean);
  const extra = diSelf
    ? ` | jalur zephyr_self: kueri=${JSON.stringify(selfHasil[f.id].via)} cuplik=${JSON.stringify(cuplikFakta(selfHasil[f.id].teks, f.cek))}`
    : '';
  R.check(f.id, jalur.length > 0,
    `fakta "${f.label}" sampai ke provider via ${jalur.join('+') || 'TIDAK ADA JALUR'}${extra}`);
}

await cdp.close(); // memulihkan setelan/provider yang diarahkan ke mock
if (anakMock) {
  anakMock.kill();
  console.log('(mock-ai yang diluncurkan skrip ini dimatikan kembali)');
}
const { lulus, total } = R.selesai();
if (jumlahSkip) console.log(`(${jumlahSkip} pemeriksaan SKIP: tidak dinilai - lihat alasan di atas; bukan kegagalan)`);
console.log(`ringkas: ${total} dinilai (${lulus} lulus), ${jumlahSkip} skip`);
