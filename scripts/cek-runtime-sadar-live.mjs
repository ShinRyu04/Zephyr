/*
 * BUKTI LIVE: Zephyr AI tahu KEADAAN RUNTIME-nya tiap giliran.
 * (kode kerja EXT-SADAR / AI-TAHU-100-2)
 *
 * Yang diuji, dan kenapa harus lewat jalur ini:
 *
 *   `src/lib/systemPrompt.ts` menyuntik `blokKeadaan()` dari
 *   `src/lib/zephyrRuntime.ts` di sebelah blok fakta statis. Membaca blok itu
 *   dari halaman (mis. `window.__ZEPHYR_PROMPT__.system()`) hanya membuktikan
 *   FUNGSI-nya mengembalikan teks - bukan bahwa teks itu benar-benar
 *   dikirim. Provider bisa saja dipanggil dengan prompt lain, atau blok itu
 *   dibuang di tengah jalan sebelum request keluar.
 *
 *   Jadi harness ini TIDAK memeriksa fungsi. Ia mengirim giliran SUNGGUHAN ke
 *   provider MOCK (127.0.0.1:8098), lalu membaca `body.messages` dari request
 *   yang BENAR-BENAR SAMPAI ke mock (`/__log`) dan memeriksa prompt sistem di
 *   dalamnya. Yang tercetak di bawah adalah potongan prompt itu apa adanya.
 *
 * Dua skenario yang MUSTAHIL ditebak, supaya "benar" tidak bisa dicapai dengan
 * menebak atau dengan teks statis:
 *
 *   A. daftar ekstensi diganti: 2 ekstensi aktif + 1 yang GAGAL dimuat dengan
 *      alasan karangan yang tidak ada di sumber mana pun. Prompt harus memuat
 *      nama, versi, dan ALASAN gagalnya - termasuk setelah spasi barisnya
 *      dirapatkan (alasan di disk multi-baris, prompt satu baris).
 *      Plus: ekstensi BAWAAN tidak boleh ikut dihitung sebagai terpasang.
 *   B. satu nilai setelan + isi panel diubah: prompt harus ikut berubah -
 *      nilai BARU muncul, nilai LAMA hilang, dan bloknya beda dari skenario A.
 *
 * Sebelum semua itu, giliran BASELINE dikirim dengan keadaan asli app: kalau
 * blok keadaan hanya karangan, ia tidak akan bisa menyebut versi app, folder
 * yang terbuka, tab aktif, dan alasan gagal ekstensi yang benar-benar ada.
 *
 * Prasyarat: app Zephyr jalan di dev (localhost:5173) dengan CDP :9223.
 * Mock-ai diluncurkan sendiri oleh skrip ini kalau belum hidup (port 8098).
 *
 * Jalankan (FOREGROUND, jangan di background):
 *   node scripts/cek-runtime-sadar-live.mjs
 */

import { spawn } from 'node:child_process';
import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';

const MOCK = 'http://127.0.0.1:8098';
const CDP_PORT = '9223';
const TEKS = 'Halo, bagaimana keadaanmu sekarang?';

const tunda = (ms) => new Promise((r) => setTimeout(r, ms));
const rep = reporter('EXT-SADAR / AI-TAHU-100-2');

/* ------------------------------------------------------------------ mock AI */

async function mockHidup() {
  try {
    const r = await fetch(`${MOCK}/__version`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

let anak = null;
if (!(await mockHidup())) {
  console.log(`(mock-ai belum hidup, diluncurkan sendiri di ${MOCK})`);
  anak = spawn(process.execPath, ['scripts/mock-ai.mjs', '8098'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let i = 0; i < 40 && !(await mockHidup()); i++) await tunda(500);
}
if (!(await mockHidup())) {
  console.log(`GAGAL: mock AI tidak bisa diluncurkan di ${MOCK}`);
  keluarBersih(1);
}
const versiMock = (await (await fetch(`${MOCK}/__version`)).json()).version;
console.log(`mock-ai versi ${versiMock} hidup di ${MOCK}`);

const logBersih = async () => {
  await fetch(`${MOCK}/__reset`);
};
const logAmbil = async () => {
  const r = await fetch(`${MOCK}/__log`);
  return r.json();
};

/* ---------------------------------------------------------------------- CDP */

const { cdp } = await Cdp.attach(CDP_PORT, ['Zephyr', 'localhost']);

/** Jalankan blok async di halaman; nilai kembaliannya lewat JSON. */
const jalan = (src, ms = 60000) => cdp.json(`return JSON.stringify(await (async () => { ${src} })())`, ms);

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

/** Potongan blok keadaan dari prompt yang benar-benar terkirim. */
function potong(prompt) {
  const i = prompt.indexOf("# Zephyr's live state");
  if (i < 0) return '(blok keadaan TIDAK ADA di prompt yang terkirim)';
  return prompt.slice(i, i + 780);
}

/* ------------------------------------------------------------ kode sisi app */

const SNAP = `
  const S = window.__ZEPHYR__.getState();
  const mod = await import('/src/lib/zephyrRuntime.ts');
  const blok = mod.blokKeadaan();
  return {
    versi: S.appInfo?.version ?? null,
    workspace: S.workspace ?? null,
    activity: S.activity ?? null,
    panelTab: window.__ZEPHYR_PANEL__.activeTab(),
    panelTabs: window.__ZEPHYR_PANEL__.visibleTabs(),
    ekstensi: window.__ZEPHYR_EXT__.list().filter((x) => !x.builtin)
      .map((x) => ({ id: x.id, name: x.name, version: x.version, enabled: !!x.enabled, error: x.error ?? null })),
    setelan: {
      answerLang: S.settings?.models?.answerLang ?? null,
      answerStyle: S.settings?.models?.answerStyle ?? null,
      rag: !!S.settings?.models?.ragEnabled,
    },
    panjang: blok.length,
    batas: mod.BATAS_KEADAAN,
    stabil: blok === mod.blokKeadaan(),
    diPromptLokal: window.__ZEPHYR_PROMPT__.system('en', '', '').includes("# Zephyr's live state"),
  };
`;

/* Latar diarahkan ke mock; snapshot keadaan ASLI diambil DULU supaya pemulihan
   di akhir tidak menuliskan keadaan yang sudah tercemar. */
const SIAP = `
  const S = window.__ZEPHYR__.getState();
  window.__ASLI_RUNTIME__ = {
    setelan: JSON.parse(JSON.stringify(S.settings)),
    ekstensi: window.__ZEPHYR_EXT__.list(),
    panelTabs: window.__ZEPHYR_PANEL__.visibleTabs(),
    panelTab: window.__ZEPHYR_PANEL__.activeTab(),
  };
  await window.__ZEPHYR_SET__.set({ models: { ...S.settings.models, activeProvider: 'custom',
    providers: { ...(S.settings.models?.providers ?? {}), custom: { baseUrl: '${MOCK}/v1', model: 'mock-model' } } } });
  await window.__ZEPHYR_SET__.setKey('custom', 'MOCK-KEY-RUNTIME');
  const A = window.__ZEPHYR_AI__.store;
  /* setProvider sudah tidak ada di store; jalur yang benar adalah menulis
     settings (activeProvider + providers.custom) lalu menyinkronkan panel.
     provider/model juga ditulis langsung supaya giliran ini pasti keluar
     ke mock, bukan ke provider asli user. */
  if (typeof A.getState().sinkronProvider === 'function') A.getState().sinkronProvider();
  A.setState({ provider: 'custom', model: 'mock-model' });
  await A.getState().loadKeys();
  const g = A.getState();
  if (typeof g.newChat === 'function') g.newChat();
  A.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });
  return { provider: A.getState().provider, model: A.getState().model,
           hasKey: typeof A.getState().hasKey === 'function' ? A.getState().hasKey() : null,
           baseUrl: window.__ZEPHYR__.getState().settings.models?.providers?.custom?.baseUrl ?? null,
           busy: !!A.getState().agentBusy, modulAda: !!(await import('/src/lib/zephyrRuntime.ts')) };
`;

/** Satu giliran NYATA: kirim, tunggu request sampai ke mock, ambil promptnya. */
async function giliran(nama) {
  await jalan(`
    const g = window.__ZEPHYR_AI__.store.getState();
    if (typeof g.newChat === 'function') g.newChat();
    return true;
  `);
  const snap = await jalan(SNAP);
  await logBersih();
  const dikirim = await jalan(`
    try {
      window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TEKS)});
      return 'dikirim';
    } catch (e) { return 'GAGAL KIRIM: ' + String((e && e.message) || e); }
  `);
  if (dikirim !== 'dikirim') {
    rep.check('X', false, `giliran ${nama} tidak terkirim: ${dikirim}`);
    return { snap, entri: null, prompt: '' };
  }

  let entri = null;
  for (let i = 0; i < 60; i++) {
    await tunda(500);
    const lg = await logAmbil();
    if (Array.isArray(lg) && lg.length) {
      entri = lg[lg.length - 1];
      break;
    }
  }
  /* Run harus selesai sebelum giliran berikutnya: `send()` saat agentBusy
     ditolak diam-diam, dan uji berikutnya lalu gagal karena sebab yang salah. */
  for (let i = 0; i < 80; i++) {
    const sibuk = await jalan(`return !!window.__ZEPHYR_AI__.store.getState().agentBusy;`);
    if (!sibuk) break;
    await tunda(500);
  }
  const prompt = entri ? promptSistem(entri.body) : '';
  console.log(`\n--- giliran ${nama}: potongan prompt yang BENAR-BENAR diterima provider ---`);
  console.log(potong(prompt));
  console.log('--- akhir potongan ---');
  return { snap, entri, prompt };
}

/** Prompt sistem yang dikirim = sistem + blok keadaan + blok fakta statis. */
const adaDiPrompt = (prompt, teks) => prompt.includes(teks);

/* Satu baris blok keadaan berdasarkan awalnya. Pemeriksaan harus DIBATASI ke
   baris ini, bukan ke seluruh prompt: blok fakta statis menyebut pola yang sama
   (`answerStyle=short` muncul di daftar bawaan), jadi `includes()` pada seluruh
   prompt akan lulus untuk nilai LAMA yang justru sedang diuji. */
const barisDari = (prompt, awal) => {
  const b = prompt.split('\n').find((x) => x.startsWith(awal));
  return b ?? '(baris tidak ada)';
};

/* Daftar tab boleh lebih panjang dari yang ditulis prompt (MAKS_TAB_PANEL=5 di
   zephyrRuntime.ts) - cerminan yang sama dipakai di sini supaya perbandingan
   tetap "sama persis", bukan "kira-kira". */
const ringkasDaftar = (xs, n = 5) => xs.slice(0, n).join(', ') + (xs.length > n ? ` and ${xs.length - n} more` : '');

function cekDi(prompt, id, teks, harusAda = true, catatan = '') {
  const ada = adaDiPrompt(prompt, teks);
  rep.check(
    id,
    ada === harusAda,
    `${harusAda ? 'ada' : 'TIDAK ada'} ${JSON.stringify(teks.length > 72 ? `${teks.slice(0, 72)}…` : teks)}` +
      `${catatan ? ` (${catatan})` : ''} -> ${ada ? 'ada' : 'tidak ada'}`,
  );
}

/** Sama seperti cekDi, tapi hanya di dalam satu baris blok keadaan. */
function cekBaris(prompt, id, awal, teks, harusAda = true, catatan = '') {
  const b = barisDari(prompt, awal);
  const ada = b.includes(teks);
  rep.check(
    id,
    ada === harusAda,
    `${harusAda ? 'ada' : 'TIDAK ada'} ${JSON.stringify(teks)} DI DALAM baris ${JSON.stringify(awal)}` +
      `${catatan ? ` (${catatan})` : ''} -> ${ada ? 'ada' : 'tidak ada'}`,
  );
  return b;
}

/* ============================================================ R1: modul hidup */

const siap = await jalan(SIAP);
console.log('siap:', JSON.stringify(siap));
if (siap?.busy) {
  console.log('GAGAL: masih ada run berjalan - tunggu idle dulu.');
  await cdp.close();
  keluarBersih(1);
}

const snapAwal = await jalan(SNAP);
rep.check('R1', !!snapAwal?.diPromptLokal, 'blok keadaan terpasang di prompt sistem lokal (systemPrompt.ts memanggil zephyrRuntime)');
rep.check('R2', snapAwal.panjang <= snapAwal.batas, `ukuran blok ${snapAwal.panjang} <= batas ${snapAwal.batas} karakter`);
rep.check('R2b', snapAwal.stabil === true, 'dua panggilan berturut-turut pada keadaan yang sama menghasilkan teks IDENTIK (deterministik)');

/* =========================================== R3: baseline, keadaan ASLI app */

const base = await giliran('BASELINE (keadaan asli app)');
rep.check('R3', !!base.entri, 'prompt sistem dibaca dari request yang diterima mock, bukan dari fungsi lokal');
const pBase = base.prompt;
if (base.snap.versi) cekDi(pBase, 'R3a', `- App: Zephyr ${base.snap.versi}`, true, 'versi app dari store');
if (base.snap.workspace) cekDi(pBase, 'R3b', base.snap.workspace, true, 'folder yang sedang terbuka');
else cekDi(pBase, 'R3b', 'no folder open', true, 'tidak ada folder terbuka -> prompt mengatakannya, bukan bertanya');
cekDi(pBase, 'R3c', `sidebar=${base.snap.activity}`, true, 'tata letak dari store');
cekDi(pBase, 'R3d', `bottom panel shows ${base.snap.panelTab}`, true, 'tab panel yang sedang aktif');
const gagalAsli = (base.snap.ekstensi ?? []).filter((e) => e.error);
if (gagalAsli.length) {
  const g = gagalAsli[0];
  cekDi(pBase, 'R3e', `Extension FAILED to load: ${g.name} ${g.version}`, true, 'nama ekstensi yang BENAR-BENAR gagal di app ini');
  cekDi(pBase, 'R3f', String(g.error).split(/\s+/).slice(0, 5).join(' '), true, 'alasan gagalnya, dari store');
} else {
  rep.check('R3e', true, 'tidak ada ekstensi gagal saat ini (dilewati, diuji di skenario A)');
}
/* Nama karangan belum ada di store: kalau muncul di prompt baseline, blok ini
   pasti teks statis, bukan pembacaan store. */
cekDi(pBase, 'R3g', 'Rimpang Kunyit', false, 'nama karangan belum ada di store -> belum boleh muncul');
cekDi(pBase, 'R3h', 'Bedug Subuh', false, 'idem');

/* ================================= R4/R5: skenario A - ekstensi karangan + panel */

const SUNTIK_A = `
  const E = window.__ZEPHYR_EXT__;
  const e = (id, name, version, enabled, error) => ({
    id, name, version, enabled, builtin: false, description: '', path: 'C:/uji/' + id,
    main: 'index.js', mainBytes: 512, commands: [],
    /* Sengaja multi-baris: prompt harus merapatkannya jadi satu baris. */
    error: error ?? null,
  });
  E.store.setState({ list: [
    e('ext.uji-a1', 'Rimpang Kunyit', '3.7.2', true, null),
    e('ext.uji-a2', 'Selat Malaka', '0.4.9', true, null),
    e('ext.uji-a3', 'Bedug Subuh', '1.2.0', true, 'manifest: field "main" tidak ada\\n\\tindex.js tidak ditemukan di paket'),
    { id: 'z9-bawaan', name: 'Bawaan Z9', version: '9.9.9', enabled: true, builtin: true,
      description: '', path: 'C:/zephyr/z9', error: null, commands: [] },
  ] });
  window.__ZEPHYR_PANEL__.hydrate(['problems', 'output', 'ports'], 'problems');
  return true;
`;
await jalan(SUNTIK_A);
const A = await giliran('A (3 ekstensi karangan, 1 GAGAL + panel diubah)');
const pA = A.prompt;
cekDi(pA, 'R4', 'Extensions on: Rimpang Kunyit 3.7.2, Selat Malaka 0.4.9', true, 'dua ekstensi aktif, nama+versinya');
cekDi(pA, 'R4b', '(3 installed, 1 failed, built-ins excluded)', true, 'hitung 3 terpasang + 1 gagal, ekstensi bawaan TIDAK dihitung');
cekDi(pA, 'R4c', 'Extension FAILED to load: Bedug Subuh 1.2.0', true, 'nama + versi ekstensi gagal');
cekDi(pA, 'R4d', 'manifest: field "main" tidak ada index.js tidak ditemukan di paket', true, 'ALASAN gagal, spasi/baris dirapatkan');
cekDi(pA, 'R4e', 'Bawaan Z9', false, 'ekstensi bawaan tidak dilaporkan sebagai terpasang');
/* Ekstensi yang gagal dimuat TIDAK boleh sekaligus disebut "on": kalau ia
   muncul di dua tempat, model akan menjawab "Bedug Subuh aktif" padahal mati. */
cekBaris(pA, 'R4f', '- Extensions on:', 'Bedug Subuh', false, 'yang gagal dimuat tidak diklaim aktif');
cekBaris(pA, 'R4g', '- Extensions on:', 'Rimpang Kunyit 3.7.2', true, 'yang benar-benar jalan tetap disebut');
cekDi(pA, 'R5', `bottom panel shows ${A.snap.panelTab} of ${ringkasDaftar(A.snap.panelTabs)}`, true, 'panel mengikuti hydrate(), dibandingkan dengan store saat itu');
cekDi(pA, 'R5b', 'Bedug Subuh 1.2.0 - manifest', true, 'format baris gagal: nama versi - alasan');
/* Baris aturan ("jangan tanya folder") harus SELAMAT walau keadaan sedang
   padat: itu bagian yang mengubah perilaku, bukan hiasan. */
cekDi(pA, 'R5d', 'This block wins over any stale note about Zephyr above it', true, 'baris aturan selamat saat blok sedang panjang');
rep.check('R5c', A.snap.panjang <= A.snap.batas, `ukuran blok pada keadaan terburuk ${A.snap.panjang} <= ${A.snap.batas}`);

/* ==================================== R6: skenario B - satu setelan + panel */

const SUNTIK_B = `
  const S = window.__ZEPHYR__.getState();
  await S.applySettings({ models: { ...S.settings.models, answerLang: 'en', answerStyle: 'detail', ragEnabled: true } });
  window.__ZEPHYR_PANEL__.hydrate(['output', 'problems'], 'output');
  return true;
`;
await jalan(SUNTIK_B);
const B = await giliran('B (setelan + panel diubah)');
const pB = B.prompt;
/* Nilai setelan diperiksa DI DALAM baris "- Settings in use:", bukan di seluruh
   prompt: blok fakta statis memuat teks "answerStyle=short" di daftar bawaannya,
   jadi `includes()` global akan lulus untuk nilai LAMA yang justru diuji. */
cekBaris(pB, 'R6', '- Settings in use:', 'answerLang=en', true, 'nilai BARU ikut ke prompt');
cekBaris(pB, 'R6b', '- Settings in use:', 'answerStyle=detail', true, 'nilai BARU ikut ke prompt');
cekBaris(pB, 'R6c', '- Settings in use:', 'rag=on', true, 'nilai BARU ikut ke prompt');
cekBaris(pB, 'R6d', '- Settings in use:', 'answerStyle=short', false, 'nilai LAMA tidak lagi diklaim');
cekBaris(pB, 'R6d2', '- Settings in use:', 'rag=off', false, 'nilai LAMA tidak lagi diklaim');
/* Panel: tab aktif & daftarnya harus ikut berubah - dibandingkan dengan store. */
cekBaris(pB, 'R6e', '- Layout:', `shows ${B.snap.panelTab} of ${ringkasDaftar(B.snap.panelTabs)}`, true, 'tab aktif baru + daftar tab baru');
cekBaris(pB, 'R6e2', '- Layout:', 'shows problems of', false, 'tab aktif LAMA tidak lagi diklaim');
const blokA = potong(pA);
const blokB = potong(pB);
rep.check('R6f', blokA !== blokB && !blokB.includes('(TIDAK ADA'), 'blok keadaan BERUBAH saat keadaan berubah (bukan dibekukan saat start)');

/* ========================= R7: isi prompt == store saat itu (dibandingkan) */

const sB = B.snap;
let n7 = 0;
const cocok = (teks, catatan) => {
  n7++;
  cekDi(pB, `R7${String.fromCharCode(96 + n7)}`, teks, true, catatan);
};
if (sB.versi) cocok(`- App: Zephyr ${sB.versi}`, 'versi app = store');
cocok(`sidebar=${sB.activity}`, 'sidebar = store');
cocok(`bottom panel shows ${sB.panelTab} of ${ringkasDaftar(sB.panelTabs)}`, 'panel = store (tab + daftar tab)');
for (const e of sB.ekstensi.filter((x) => x.enabled && !x.error)) cocok(e.name, `ekstensi aktif ${e.name} = store`);
for (const e of sB.ekstensi.filter((x) => x.error)) {
  cocok(String(e.error).split(/\s+/).slice(0, 6).join(' '), `alasan gagal ${e.name} = store`);
}
cocok(`answerStyle=${sB.setelan.answerStyle}`, 'setelan answerStyle = store');
cocok(`- LSP: `, 'baris LSP ada');
cocok(`- MCP: `, 'baris MCP ada');
/* Blok harus berada di pesan BERPERAN system dan hanya sekali. Kalau suntikan
   jatuh ke pesan user atau tergandakan, model bisa mengabaikan/menganggapnya
   sebagai ucapan user biasa - jadi peran ≠ system sama saja tidak tersuntik. */
const peranBlok = (B.entri?.body?.messages ?? [])
  .filter((m) => JSON.stringify(m.content ?? '').includes("# Zephyr's live state"))
  .map((m) => m.role);
rep.check(
  'R7j',
  peranBlok.length === 1 && peranBlok[0] === 'system',
  `blok keadaan ada di tepat satu pesan berperan=system -> peran=${JSON.stringify(peranBlok)}`,
);
const nBlok = (pB.match(/# Zephyr's live state/g) ?? []).length;
rep.check('R7k', nBlok === 1, `blok keadaan muncul ${nBlok}x di prompt sistem (tidak tergandakan)`);

/* ========================== R8: pemulihan - store dikembalikan, prompt ikut */

await jalan(`
  const a = window.__ASLI_RUNTIME__;
  window.__ZEPHYR_EXT__.store.setState({ list: a.ekstensi });
  window.__ZEPHYR_PANEL__.hydrate(a.panelTabs, a.panelTab);
  await window.__ZEPHYR_SET__.set({
    models: { ...a.setelan.models },
    general: { ...a.setelan.general },
    lsp: { ...a.setelan.lsp },
    mcp: { ...a.setelan.mcp },
    subagent: { ...a.setelan.subagent },
  });
  return true;
`);
const C = await giliran('C (setelah dipulihkan)');
const pC = C.prompt;
cekDi(pC, 'R8', 'Rimpang Kunyit', false, 'nama karangan hilang setelah store dipulihkan');
cekDi(pC, 'R8b', 'Bedug Subuh', false, 'idem');
cekDi(pC, 'R8c', `bottom panel shows ${C.snap.panelTab} of ${ringkasDaftar(C.snap.panelTabs)}`, true, 'panel kembali ke nilai asli');
cekBaris(pC, 'R8d', '- Settings in use:', `answerStyle=${C.snap.setelan.answerStyle}`, true, 'setelan kembali ke nilai asli');
rep.check('R8e', C.snap.stabil === true, 'blok tetap deterministik setelah pemulihan');

await cdp.close();
if (anak) {
  anak.kill();
  console.log('(mock-ai yang diluncurkan skrip ini dimatikan kembali)');
}
const { lulus, total } = rep.selesai();
console.log(`ringkasan: ${lulus}/${total} lulus; mock versi ${versiMock}`);
keluarBersih(lulus === total ? 0 : 1);
