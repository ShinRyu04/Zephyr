#!/usr/bin/env node
/**
 * uji-izin-web-mati.mjs — BUG `zeph-izin-web-mati-cepet` (temuan 2026-10-15).
 *
 * Masalah yang diuji
 * ------------------
 * Ketika `izinIsiWeb` mati (itu DEFAULT, `kebijakanIsiWeb.ts:98`), tiap kali
 * model mencoba mengambil isi web, tool menolak dengan teks yang memuat
 * `izin-isi-web-mati`. Penolakan itu benar - tetapi LOOP-nya tidak berhenti:
 * model mengulang fetch dengan argumen lain, ditolak lagi - dan TIDAK ADA REM
 * untuk itu: penghitung `BATAS_LANJUT_TANPA_TOOL` (`aiStore.ts:523`) hanya
 * menghitung giliran TANPA tool call, sedangkan `lanjutTanpaTool = 0` direset
 * pada tiap giliran yang memanggil tool (`aiStore.ts:6527`). Karena fetch tetap
 * sebuah tool call, rem itu tidak pernah tercapai dan run diseret sampai
 * `BATAS_TANPA_KEMAJUAN` / `MAX_AGENT_STEPS`. Pengguna melihat "thinking" lama
 * sekali tanpa penjelasan apa pun.
 *
 * Perbaikan yang diukur (`aiStore.ts`)
 * -----------------------------------
 *   - percobaan PERTAMA: hasil tool ditulis ulang menjadi perintah BERHENTI
 *     mencari di web + cara menyalakan izinnya;
 *   - percobaan KEDUA: run diakhiri (`agentBatal`) dengan `akhir` yang
 *     menjelaskan ke pengguna;
 *   - `agentBatal` ikut diperiksa di ujung tiap langkah, jadi guard lain
 *     (goal-satisfied / tanpa-kemajuan) tidak menimpa pesan itu.
 *
 * Tiga lapis bukti (semua deterministik, TANPA jaringan / TANPA app / TANPA CDP)
 * -----------------------------------------------------------------------------
 *  A. EKSEKUSI NYATA - `web_fetch.run` dan `web_search.run` ASLI dari
 *     `src/lib/zephyrTools/web.ts` dijalankan di node dengan `izinIsiWeb:false`
 *     (transport `cmd.webFetch` hanya MENGHITUNG panggilan). Angkanya membuktikan
 *     marker `izin-isi-web-mati` benar-benar muncul di jalur kirim sungguhan, dan
 *     bahwa izin diperiksa SEBELUM jaringan.
 *  B. TAPAK KENDALI - blok guard dibaca dari `aiStore.ts` apa adanya: variabel
 *     penghitung ada, kondisinya memuat `!ok` + marker, percobaan pertama
 *     menulis ulang hasil, percobaan kedua menghentikan run.
 *  C. SIMULASI LOOP - blok guard ASLI (hasil ekstraksi dari sumber, bukan
 *     salinan) dijalankan berulang terhadap hasil penolakan nyata dari lapis A.
 *     Dihitung berapa kali fetch benar-benar dieksekusi sebelum run berhenti,
 *     untuk dua skenario (model patuh / model bandel) dan untuk versi TANPA
 *     guard sebagai pembanding.
 *
 * Jalankan: node scripts/uji-izin-web-mati.mjs
 * Keluar 0 kalau semua LULUS, 1 kalau ada GAGAL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(AKAR, 'node_modules', '.cache-zephyr-uji');
const P_STORE = path.join(AKAR, 'src/lib/aiStore.ts');
const P_WEB = path.join(AKAR, 'src/lib/zephyrTools/web.ts');
const P_KEBIJAKAN = path.join(AKAR, 'src/lib/zephyrTools/kebijakanIsiWeb.ts');

const lulus = [];
const gagal = [];
const cek = (nama, kondisi, bukti) => (kondisi ? lulus : gagal).push({ nama, bukti });

/* ------------------------------------------------------------------ */
/* Bundel KHUSUS `web.ts` dengan STUB lapisan-app (pola uji-jangkauan-tool).
   Hanya `../store` yang mengembalikan setelan yang BISA DIUBAH di runtime,
   supaya satu bundel melayani dua keadaan: izin mati dan izin hidup.     */
/* ------------------------------------------------------------------ */
const STUB = new Map([
  ['@tauri-apps/plugin-opener', 'exports.openUrl = () => Promise.resolve();'],
  [
    '../store',
    `const setelan = globalThis.__SET_UJI__;
     exports.useStore = { getState: () => ({ settings: setelan, tabs: [], activeTabId: null, setActiveTab: () => {}, setTabUrl: () => {}, requestCloseTab: () => {}, bukaViewAi: () => {} }), setState: () => {}, subscribe: () => () => {} };`,
  ],
  [
    '../terminalStore',
    `exports.useTerminal = { getState: () => ({ terminalTabs: [], activeTabId: null, activePaneId: null, visible: false, toast: () => {}, allPanes: () => [], addPane: async () => null, closePane: async () => {}, setActiveTab: () => {}, setActivePane: () => {}, setVisible: () => {} }) };`,
  ],
  ['../agentGuard', 'exports.periksaTulis = () => ({ ok: true });'],
  [
    '../commands',
    `exports.webFetch = async (url, maxChars) => { globalThis.__NET__.push(url); return '<html><body>isi contoh</body></html>'; };
     exports.webSearch = async () => { globalThis.__NET__.push('search'); return '<a href="https://example.org/a">hasil</a>'; };
     exports.browserPaneEval = async () => null;
     exports.browserPaneNav = async () => {};
     exports.fsWrite = async () => {};`,
  ],
  [
    './builtins',
    `exports.potong = (s) => String(s);
     exports.wajib = (a, k) => { const v = a ? a[k] : undefined; if (v === undefined || v === null) throw new Error('argumen wajib hilang: ' + k); return v; };`,
  ],
  [
    '../agentsBrowserStore',
    `exports.ID_PANE_AGENTS = 'agents-browser';
     exports.daftarPaneAgents = () => [];
     exports.diJendelaAgents = () => false;
     exports.paneAgents = () => null;
     exports.mintaPaneAgents = () => false;
     exports.mintaBukaDiAgents = () => {};`,
  ],
  ['../checkpoint', 'exports.catat = async () => {};'],
]);

const pluginStub = {
  name: 'stub-uji-izin-web',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => (STUB.has(a.path) ? { path: a.path, namespace: 'stub' } : null));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUB.get(a.path), loader: 'js' }));
  },
};

async function muatWebTs() {
  globalThis.__SET_UJI__ = { izinIsiWeb: false, allowlistWeb: ['example.org'], portWeb: [80, 443] };
  globalThis.__NET__ = [];
  const out = path.join(CACHE, 'izin-web-mati');
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({
    entryPoints: [P_WEB],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    outfile: path.join(out, 'web.cjs'),
    absWorkingDir: AKAR,
    plugins: [pluginStub],
    logLevel: 'silent',
  });
  return import(pathToFileURL(path.join(out, 'web.cjs')).href);
}

/* ------------------------------------------------------------------ */
/* Lapis A - eksekusi jalur kirim NYATA                                 */
/* ------------------------------------------------------------------ */
const TOOL_WEB = (await muatWebTs()).TOOL_WEB;
const cari = (nama) => {
  const t = TOOL_WEB.find((x) => x.spec.name === nama);
  if (!t) throw new Error('tool tidak ada di katalog web.ts: ' + nama);
  return t;
};

globalThis.__SET_UJI__.izinIsiWeb = false;
globalThis.__NET__ = [];
const hasilFetchMati = await cari('web_fetch').run({ url: 'https://example.org/halaman' });
const jaringanSaatMati = globalThis.__NET__.length;
const hasilSearchMati = await cari('web_search').run({ query: 'kurs dolar' });
const jaringanSearchMati = globalThis.__NET__.length;

cek('A1 web_fetch (izin mati) memuat marker izin-isi-web-mati',
  hasilFetchMati.includes('izin-isi-web-mati'), hasilFetchMati.slice(0, 90));
cek('A2 web_search (izin mati) memuat marker izin-isi-web-mati',
  hasilSearchMati.includes('izin-isi-web-mati'), hasilSearchMati.slice(0, 90));
cek('A3 izin diperiksa SEBELUM jaringan (nol transport saat izin mati)',
  jaringanSaatMati === 0 && jaringanSearchMati === 0, `fetch=${jaringanSaatMati} search=${jaringanSearchMati}`);

// Kontrol: dengan izin HIDUP, marker hilang dan transport benar-benar dipanggil.
globalThis.__SET_UJI__.izinIsiWeb = true;
globalThis.__NET__ = [];
const hasilFetchHidup = await cari('web_fetch').run({ url: 'https://example.org/halaman' });
const jaringanSaatHidup = globalThis.__NET__.length;
cek('A4 kontrol izin hidup: TANPA marker dan jaringan dipakai',
  !hasilFetchHidup.includes('izin-isi-web-mati') && jaringanSaatHidup === 1,
  `jaringan=${jaringanSaatHidup} hasil=${hasilFetchHidup.slice(0, 60)}`);

/* ------------------------------------------------------------------ */
/* Lapis B + C - guard di aiStore.ts (dibaca dari sumber)               */
/* ------------------------------------------------------------------ */
const src = fs.readFileSync(P_STORE, 'utf8');

// Penghitung lama yang dulu menjadi satu-satunya rem.
const mBatas = /BATAS_LANJUT_TANPA_TOOL\s*=\s*(\d+)/.exec(src);
if (!mBatas) throw new Error('BATAS_LANJUT_TANPA_TOOL tidak ditemukan di aiStore.ts');
const BATAS_LAMA = Number(mBatas[1]);

function ekstrakBlok(mulai) {
  const i = src.indexOf('{', mulai);
  let kedalaman = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') kedalaman++;
    else if (c === '}') {
      kedalaman--;
      if (kedalaman === 0) return src.slice(mulai, j + 1);
    }
  }
  return null;
}

const iGuard = src.indexOf("if (!ok && hasil.includes('izin-isi-web-mati')) {");
cek('B1 blok guard izin-isi-web-mati ADA di aiStore.ts', iGuard >= 0, iGuard < 0 ? 'tidak ditemukan' : `baris ${src.slice(0, iGuard).split('\n').length}`);

const iDeklarasi = src.indexOf('let izinWebMatiPercobaan = 0;');
cek('B2 penghitung izinWebMatiPercobaan dideklarasikan', iDeklarasi >= 0, iDeklarasi < 0 ? 'tidak ditemukan' : `baris ${src.slice(0, iDeklarasi).split('\n').length}`);

// Penghitung harus berada DI LUAR loop langkah, supaya dihitung sekali per run.
const iLoopLangkah = src.indexOf('for (; langkah < MAX_AGENT_STEPS; langkah++)');
cek('B3 penghitung dideklarasikan SEBELUM loop langkah (sekali per run)',
  iDeklarasi >= 0 && iLoopLangkah > iDeklarasi,
  `deklarasi=${src.slice(0, iDeklarasi).split('\n').length} loop=${src.slice(0, iLoopLangkah).split('\n').length}`);

const blokGuard = iGuard >= 0 ? ekstrakBlok(iGuard) : null;
if (blokGuard) {
  const baris = blokGuard.split('\n');
  cek('B4 percobaan pertama MENULIS ULANG hasil (menyuruh berhenti)',
    /izinWebMatiPercobaan === 1/.test(blokGuard) && /do NOT retry/i.test(blokGuard),
    baris.slice(0, 3).join(' | ').slice(0, 100));
  cek('B5 percobaan kedua MENGHENTIKAN run (agentBatal + akhir)',
    /izinWebMatiPercobaan === 1[\s\S]*agentBatal = true/.test(blokGuard) && /\bakhir\s*=/.test(blokGuard),
    'agentBatal=true pada cabang percobaan != 1');
  cek('B6 guard dijaga oleh "!ok" (membaca berkas berisi marker TIDAK dihitung)',
    /!ok && hasil\.includes\('izin-isi-web-mati'\)/.test(blokGuard), 'kondisi guard');
} else {
  cek('B4..B6 blok guard gagal diekstrak', false, 'ekstraksi gagal');
}

// agentBatal harus ikut diperiksa di ujung tiap langkah, supaya guard lain
// (goal-satisfied / tanpa-kemajuan) tidak menimpa pesan akhir.
const mBreak = /if \(taskComplete \|\| navigationOpened \|\| agentBatal\) break;/.exec(src);
cek('B7 agentBatal ikut di-check di ujung tiap langkah (pesan akhir tidak ditimpa)',
  !!mBreak, mBreak ? `baris ${src.slice(0, mBreak.index).split('\n').length}` : 'tidak ditemukan');

/* ------------------------------------------------------------------ */
/* Lapis C - jalankan blok guard ASLI terhadap hasil penolakan NYATA     */
/* ------------------------------------------------------------------ */
const PENOLAKAN_NYATA = hasilFetchMati; // dari lapis A

function buatGuard(blok) {
  if (!blok) return null;
  // `blok` adalah kode ASLI hasil ekstraksi; hanya dibungkus variabel lingkungan.
  return new Function(
    'hasil', 'ok', 'lingkungan',
    `let { akhir, agentStopReason, agentBatal, izinWebMatiPercobaan } = lingkungan;\n` +
      `${blok}\n` +
      `return { hasil, ok, akhir, agentStopReason, agentBatal, izinWebMatiPercobaan };`,
  );
}

/** Meniru loop agen: tiap giliran model memanggil web_fetch sampai run berhenti. */
function simulasi(guard, { patuh, batas }) {
  let fetch = 0;
  let langkah = 0;
  const lingkungan = { akhir: '', agentStopReason: '', agentBatal: false, izinWebMatiPercobaan: 0 };
  while (langkah < batas) {
    if (lingkungan.agentBatal) break; // loop langkah berhenti
    langkah++;
    fetch++; // model memanggil web_fetch lagi
    const hasil = PENOLAKAN_NYATA;
    if (guard) Object.assign(lingkungan, guard(hasil, false, lingkungan));
    // Model nurut pada peringatan pertama: berhenti dan menjawab pengguna.
    if (patuh && lingkungan.izinWebMatiPercobaan >= 1) break;
  }
  return { fetch, langkah, ...lingkungan };
}

const guard = buatGuard(blokGuard);
const batasUji = BATAS_LAMA + 10; // 30: cukup untuk melihat siapa yang berhenti duluan
const patuh = simulasi(guard, { patuh: true, batas: batasUji });
const bandel = simulasi(guard, { patuh: false, batas: batasUji });
const tanpaGuard = simulasi(null, { patuh: false, batas: batasUji });

cek('C1 model PATUH: berhenti setelah 1 percobaan fetch, sisanya menjawab pengguna',
  patuh.fetch === 1, `fetch=${patuh.fetch} langkah=${patuh.langkah}`);
cek('C2 model BANDEL: run berhenti jauh sebelum batas (maksimal 2 fetch)',
  bandel.fetch <= 2 && bandel.agentBatal === true,
  `fetch=${bandel.fetch} agentBatal=${bandel.agentBatal} alasan=${bandel.agentStopReason}`);
cek('C3 TANPA guard: loop tidak berhenti sendiri dalam batas uji (tak ada rem izin web)',
  tanpaGuard.fetch === batasUji && tanpaGuard.agentBatal === false,
  `fetch=${tanpaGuard.fetch} batasUji=${batasUji}`);
cek('C4 pesan akhir berisi cara menyalakan izin',
  typeof bandel.akhir === 'string' && /izinIsiWeb|Web fetching/i.test(bandel.akhir),
  String(bandel.akhir).slice(0, 80));

// Kenapa guard ini perlu sama sekali: rem LAMA tidak menahan fetch berulang.
// `lanjutTanpaTool = 0;` muncul dua kali - deklarasi (`let`) dan RESET di jalur
// giliran yang memanggil tool. Yang diukur hanya yang reset, bukan deklarasinya.
const semuaReset = [...src.matchAll(/lanjutTanpaTool = 0;/g)].map((m) => m.index);
const iReset = semuaReset.find((i) => !src.startsWith('let ', i - 4));
const jendelaReset = iReset === undefined ? '' : src.slice(Math.max(0, iReset - 240), iReset);
cek('C5 rem lama direset pada giliran yang memanggil tool (tidak menahan fetch berulang)',
  iReset !== undefined && /masih bekerja/.test(jendelaReset),
  iReset === undefined ? 'reset tidak ditemukan' : `baris ${src.slice(0, iReset).split('\n').length}`);

/* ------------------------------------------------------------------ */
/* Lapor                                                                  */
/* ------------------------------------------------------------------ */
for (const x of lulus) console.log(`  LULUS  ${x.nama}  [${x.bukti}]`);
for (const x of gagal) console.log(`  GAGAL  ${x.nama}  [${x.bukti}]`);
console.log(`\n${lulus.length} LULUS, ${gagal.length} GAGAL (BATAS_LAMA=${BATAS_LAMA})`);
process.exit(gagal.length ? 1 : 0);
