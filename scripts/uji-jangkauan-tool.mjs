#!/usr/bin/env node
/**
 * uji-jangkauan-tool.mjs — BUKTI JANGKAUAN tool "baca kode" (zephyr_kode) &
 * "ambil web" (web_fetch) SAMPAI ke jalur kirim yang benar-benar dipakai model,
 * bukan sekadar modul yang ada di repo.
 *
 * Pertanyaan yang dijawab:
 *   (a) ada/tidak di KATALOG tool? (runtime: TOOL_CATALOG)
 *   (b) ada/tidak di SUBSET yang dikirim (cap <= 20)? (runtime: pilihToolTugas)
 *   (c) ada/tidak SKEMA argumen? (runtime + bukti baris sumber)
 *   (d) ada/tidak EKSEKUTOR/handler nyata? (runtime + bukti baris sumber)
 *   + jarak modul -> jalur kirim (rantai impor nyata, atau "NOL importer").
 *   + uji negatif baca-kode (traversal, /.env /*.pem /*.key, folder rahasia).
 *   + uji negatif ambil-web (skema, host luar izin, localhost/IP privat,
 *     pemotongan + angkanya, JSON terbaca, nol shell).
 *   + determinisme.
 *
 * SIFAT: node murni, deterministik, TANPA jaringan / TANPA app / TANPA CDP.
 * DUA BUNDEL esbuild dari `src/lib/**` ASLI:
 *   1. MODUL MURNI (catalog, subsetTugas, subsetAlat, bacaKode, kebijakanIsiWeb,
 *      ambilWeb) -> satu CJS, `require` biasa.
 *   2. MODUL JALUR-KIRIM (web.ts) -> ESM dengan modul lapisan-browser
 *      (store/aiStore/commands/agentGuard/... + `@tauri-apps/*`) dialias ke STUB.
 *      Inilah yang membuat `web_fetch.run` bisa DIPANGGIL SUNGGUHAN: penolakan
 *      http/host diuji lewat EKSEKUTOR NYATA + transport penghitung, sehingga
 *      "nol jaringan" jadi angka, bukan klaim. (Bukti lama lewat `ambilWeb.ts`
 *      tetap ada, tapi modul itu memang mati - bukan jalur kirim.)
 * Sisa berkas lapisan-app yang tak layak di-`require` (agentTools.ts: tersangkut
 * zephyrSelf/indeks raksasa) tetap dibuktikan dari BARIS SUMBER (berkas + baris).
 *
 * Jalankan: node scripts/uji-jangkauan-tool.mjs
 * Keluar 0 kalau semua LULUS, 1 kalau ada GAGAL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireDariRepo = createRequire(pathToFileURL(path.join(AKAR, 'package.json')));

/* ------------------------------------------------------------------ */
/* Kerangka uji                                                       */
/* ------------------------------------------------------------------ */
let lulus = 0;
const gagal = [];
let grupSekarang = '';
function grup(nama) {
  grupSekarang = nama;
}
function cek(nama, syarat, bukti) {
  const tag = `${grupSekarang} :: ${nama}`;
  if (syarat) {
    lulus++;
    console.log(`  \u2713 ${nama}`);
  } else {
    gagal.push(tag);
    console.log(`  \u2717 ${nama}\n      bukti: ${bukti}`);
  }
}

/* ------------------------------------------------------------------ */
/* Utilitas bukti-baris (berkas + nomor baris)                        */
/* ------------------------------------------------------------------ */
const _cacheBerkas = new Map();
function barisBerkas(rel) {
  if (_cacheBerkas.has(rel)) return _cacheBerkas.get(rel);
  const abs = path.join(AKAR, rel);
  const ada = fs.existsSync(abs);
  const baris = ada ? fs.readFileSync(abs, 'utf8').split(/\r?\n/) : [];
  const hasil = { ada, baris };
  _cacheBerkas.set(rel, hasil);
  return hasil;
}
/** semua nomor baris (1-indexed) di rel yang memuat `needle`. */
function barisDengan(rel, needle) {
  const { baris } = barisBerkas(rel);
  const out = [];
  for (let i = 0; i < baris.length; i++) if (baris[i].includes(needle)) out.push(i + 1);
  return out;
}
function adaDiBerkas(rel, needle) {
  return barisDengan(rel, needle).length > 0;
}
/** cek beberapa needle ada dalam jendela `span` baris sesudah baris `anchor`. */
function jendelaSetelah(rel, anchorNeedle, span, needles) {
  const { baris } = barisBerkas(rel);
  const mulai = barisDengan(rel, anchorNeedle);
  if (!mulai.length) return { ok: false, garis: [] };
  const i0 = mulai[0] - 1;
  const potong = baris.slice(i0, i0 + span).join('\n');
  const hilang = needles.filter((n) => !potong.includes(n));
  return { ok: hilang.length === 0, garis: mulai, hilang };
}
/** daftar berkas .ts/.tsx di src/ yang meng-import modul ber-nama dasar `base`. */
function pengimpor(base) {
  const hasil = [];
  const tumpuk = [path.join(AKAR, 'src')];
  while (tumpuk.length) {
    const dir = tumpuk.pop();
    let isi;
    try {
      isi = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of isi) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        tumpuk.push(abs);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        const rel = path.relative(AKAR, abs).replace(/\\/g, '/');
        if (path.basename(rel, path.extname(rel)) === base) continue; // diri sendiri
        const txt = fs.readFileSync(abs, 'utf8');
        const re = /from\s+['"]([^'"]+)['"]/g;
        let m;
        while ((m = re.exec(txt)) !== null) {
          const spec = m[1];
          if (spec.split('/').pop() === base) {
            hasil.push(rel);
            break;
          }
        }
      }
    }
  }
  return hasil;
}

/* ------------------------------------------------------------------ */
/* Bundel modul murni dari src/lib/** ASLI -> CJS -> require          */
/* ------------------------------------------------------------------ */
const CACHE = path.join(AKAR, 'node_modules', '.cache', 'zephyr-jangkauan');
const OUT = path.join(CACHE, 'jangkauan.cjs');

/* ------------------------------------------------------------------ */
/* Bundel modul JALUR-KIRIM (web.ts) + stub modul lapisan-browser      */
/*                                                                     */
/* Stub ini SENGAJA jadi satu-satunya "jaringan" di harness:           */
/* `webFetch` menaikkan `hitunganTransport`, jadi 0 berarti transport  */
/* benar-benar tidak pernah dipanggil (bukan sekadar tak ada respons). */
/* ------------------------------------------------------------------ */
const OUT_APP = path.join(CACHE, 'app');
let hitunganTransport = 0;
let setelanUji = { izinIsiWeb: true, allowlistWeb: ['example.org'] };

function stubZephyrApp() {
  const noop = async () => undefined;
  return {
    /* commands: satu-satunya transport yang boleh terpanggil. */
    webFetch: async () => {
      hitunganTransport++;
      return '<html><body>HALO DARI STUB TRANSPORT</body></html>';
    },
    asZephyrError: (e) => String(e && e.message ? e.message : e),
    fsRead: noop, fsWrite: noop, fsStat: noop, fsExists: noop, scanDir: noop,
    searchFiles: noop, workspaceOpen: noop, listWorkspaceFiles: noop,
    instructionRead: noop, getSettings: noop, gitStatus: noop, logFrontend: noop,
    /* store: `kebijakan()` di web.ts membaca useStore.getState().settings */
    useStore: { getState: () => ({ settings: setelanUji }) },
    useAi: { getState: () => ({}) },
    useTerminal: { getState: () => ({}) },
    useUpdater: { getState: () => ({}) },
    useMcp: { getState: () => ({}) },
    useExtensions: { getState: () => ({}) },
    MAX_TODOS: 0, ATTACH_LIMIT: 0, MAX_MSGS: 0, MSG_LIMIT: 0,
    todoTerpangkas: (x) => x, jejakPemadatan: () => ({}), jalurKonteksKerja: () => '',
    periksaBaca: () => ({ ok: true }), periksaTulis: () => ({ ok: true }),
    periksaPerintahShell: () => ({ ok: true }),
    infoAksi: () => null, kutipUrlDiPerintah: (s) => s,
    mcpExternalSpecs: () => [], pecahNamaMcp: (n) => ({ server: '', tool: n }),
  };
}

const POLA_STUB_APP =
  /(^|\/)(commands|store|terminalStore|agentGuard|checkpoint|aiStore|aiMemori|updaterStore|mcpStore|extensionStore|zephyrCari|mcpTools|labelAksi|kutipPerintah|agentExec)$/;

const pluginStubApp = {
  name: 'zephyr-stub-app',
  setup(b) {
    b.onResolve({ filter: /^@tauri-apps\// }, (a) => ({ path: a.path, namespace: 'zephyr-stub' }));
    b.onResolve({ filter: POLA_STUB_APP }, (a) => ({ path: a.path, namespace: 'zephyr-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'zephyr-stub' }, () => ({
      contents: 'module.exports = globalThis.__ZEPHYR_STUB_APP;',
      loader: 'js',
    }));
  },
};

async function bangunBundelApp() {
  globalThis.__ZEPHYR_STUB_APP = stubZephyrApp();
  fs.mkdirSync(OUT_APP, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(AKAR, 'src/lib/zephyrTools/web.ts')],
    bundle: true,
    format: 'esm',
    splitting: true,
    platform: 'node',
    target: 'es2022',
    outdir: OUT_APP,
    absWorkingDir: AKAR,
    plugins: [pluginStubApp],
    logLevel: 'silent',
  });
  fs.writeFileSync(path.join(OUT_APP, 'package.json'), '{"type":"module"}', 'utf8');
  const entri = fs.readdirSync(OUT_APP).find((n) => /^web(-[A-Z0-9]+)?\.js$/.test(n));
  if (!entri) throw new Error('bundel app: entri web*.js tidak ditemukan');
  return import(pathToFileURL(path.join(OUT_APP, entri)).href);
}

async function bangunBundel() {
  fs.mkdirSync(CACHE, { recursive: true });
  await esbuild.build({
    stdin: {
      contents:
        `export * as catalog from './src/lib/zephyrTools/catalog';\n` +
        `export * as subsetTugas from './src/lib/subsetTugas';\n` +
        `export * as subsetAlat from './src/lib/subsetAlat';\n` +
        `export * as bacaKode from './src/lib/bacaKode';\n` +
        `export * as kebijakan from './src/lib/zephyrTools/kebijakanIsiWeb';\n` +
        `export * as ambilWeb from './src/lib/zephyrTools/ambilWeb';\n`,
      resolveDir: AKAR,
      loader: 'ts',
      sourcefile: 'jangkauan-entry.ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: OUT,
    absWorkingDir: AKAR,
    logLevel: 'silent',
  });
  return requireDariRepo(OUT);
}

/* ------------------------------------------------------------------ */
/* Bundel KHUSUS jalur HIDUP `web_fetch` (web.ts) -> dijalankan di node */
/*                                                                      */
/* web.ts mengimpor lapisan-app (store React, perintah Tauri) yang tidak */
/* bisa hidup di luar aplikasi. Modul-modul itu DIGANTI STUB di sini,   */
/* supaya kode ASLI `lantaiHttpsWeb` + eksekutor `TOOL_WEB.web_fetch`   */
/* benar-benar DIJALANKAN dan diuji - bukan cuma dibaca sebagai baris.  */
/*                                                                      */
/* Yang dipalsukan HANYA transport `cmd.webFetch`: di stub ia sekadar    */
/* MENGHITUNG panggilan. Justru itu buktinya - "nol panggilan transport" */
/* berarti penolakan terjadi SEBELUM transport/fetch dipanggil.         */
/* (Replika modul mati `ambilWeb` TIDAK dijadikan gerbang di sini.)     */
/* ------------------------------------------------------------------ */
const OUT_WEB_UJI = path.join(CACHE, 'web-fetch-uji.cjs');
const STUB_WEB_UJI = new Map([
  ['@tauri-apps/plugin-opener', 'exports.openUrl = () => Promise.resolve();'],
  [
    '../store',
    `const setelan = { izinIsiWeb: true, allowlistWeb: ['example.org'] };
     globalThis.__setelanZephyrUji = setelan;
     exports.useStore = { getState: () => ({ settings: setelan }), setState: () => {}, subscribe: () => () => {} };`,
  ],
  [
    '../terminalStore',
    `exports.useTerminal = { getState: () => ({ terminalTabs: [], activeTabId: null, activePaneId: null, visible: false, toast: null,
       allPanes: () => [], addPane: async () => null, closePane: async () => {}, setPaneUrl: () => {},
       setActiveTab: () => {}, setActivePane: () => {}, setVisible: () => {} }) };`,
  ],
  ['../agentGuard', 'exports.periksaTulis = () => ({ ok: true });'],
  [
    '../commands',
    `exports.webFetch = async (url, maxChars) => { globalThis.__netZephyr.push({ url: url, maxChars: maxChars });
       return '<html><body>ok</body></html>'; };
     exports.browserPaneEval = async () => null;
     exports.browserPaneNav = async () => {};
     exports.fsWrite = async () => {};`,
  ],
  [
    './builtins',
    `exports.potong = (s) => String(s);
     exports.wajib = (a, k) => { const v = a ? a[k] : undefined; if (v === undefined || v === null) throw new Error('arg wajib: ' + k); return String(v); };`,
  ],
  ['../checkpoint', 'exports.catat = async () => {};'],
]);

function pluginStubWebUji() {
  return {
    name: 'stub-web-uji',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (STUB_WEB_UJI.has(args.path)) return { path: args.path, namespace: 'stub-zephyr-uji' };
        return null;
      });
      build.onLoad({ filter: /.*/, namespace: 'stub-zephyr-uji' }, (args) => ({
        contents: STUB_WEB_UJI.get(args.path),
        loader: 'js',
      }));
    },
  };
}

async function bangunBundelWebUji() {
  fs.mkdirSync(CACHE, { recursive: true });
  await esbuild.build({
    stdin: {
      contents: `export * as web from './src/lib/zephyrTools/web';\n`,
      resolveDir: AKAR,
      loader: 'ts',
      sourcefile: 'web-fetch-entry.ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: OUT_WEB_UJI,
    absWorkingDir: AKAR,
    plugins: [pluginStubWebUji()],
    define: { 'import.meta.env': 'importMetaEnv' },
    banner: { js: 'var importMetaEnv = { DEV: true, PROD: false, MODE: "test" }; globalThis.__netZephyr = [];' },
    logLevel: 'silent',
  });
  return requireDariRepo(OUT_WEB_UJI);
}

/* ------------------------------------------------------------------ */
/* Data statis yang dipakai berulang                                  */
/* ------------------------------------------------------------------ */
const F_BACA = 'src/lib/bacaKode.ts';
const F_WEB = 'src/lib/zephyrTools/web.ts';
const F_CATALOG = 'src/lib/zephyrTools/catalog.ts';
const F_SUBSET = 'src/lib/subsetTugas.ts';
const F_AGENT = 'src/lib/agentTools.ts';
const F_AI = 'src/lib/aiStore.ts';
const F_AMBIL = 'src/lib/zephyrTools/ambilWeb.ts';
const F_KEBIJAKAN = 'src/lib/zephyrTools/kebijakanIsiWeb.ts';

/* ================================================================== */
async function main() {
  let m;
  try {
    m = await bangunBundel();
  } catch (e) {
    console.error('GAGAL bundel esbuild:', e && e.message ? e.message : e);
    process.exit(1);
  }
  const C = m.catalog;
  const ST = m.subsetTugas;
  const BK = m.bacaKode;
  const KB = m.kebijakan;
  const AW = m.ambilWeb;

  /*
   * Bundel KEDUA: jalur HIDUP `web_fetch` (web.ts) dengan lapisan-app di-stub,
   * supaya `lantaiHttpsWeb` + eksekutor `web_fetch` bisa DIJALANKAN di node.
   * Kalau bundel ini gagal, grup G2 melaporkan GAGAL dengan sebabnya - bukan
   * diam-diam dilewati.
   */
  let MW = null;
  let galatBundelWeb = '';
  try {
    MW = (await bangunBundelWebUji()).web;
  } catch (e) {
    galatBundelWeb = e && e.message ? e.message : String(e);
  }

  const TOOL_NAMES = [...C.TOOL_NAMES];
  const BATAS = ST.BATAS_TOOL_TUGAS;
  const AKTIF_SELALU = [...new Set(C.TOOL_DIKIRIM_SELALU)];
  const AKTIF_PENUH = [...new Set([...C.TOOL_BAWAAN_AKTIF, ...C.TOOL_WEB_AKTIF_AWAL])];

  console.log('== JEJAK JANGKAUAN TOOL (node murni, offline) ==\n');
  console.log(`katalog: ${TOOL_NAMES.length} tool | BATAS_TOOL_TUGAS=${BATAS}`);
  console.log(`basis-aktif selalu-saja: ${AKTIF_SELALU.length} | basis-aktif penuh: ${AKTIF_PENUH.length}\n`);

  /* ================================================================ */
  grup('A. REGISTRASI tool di KATALOG (runtime)');
  {
    const l = barisDengan(F_CATALOG, "'web_fetch'");
    cek(
      'web_fetch ADA di katalog tool (TOOL_NAMES runtime)',
      TOOL_NAMES.includes('web_fetch'),
      `TOOL_NAMES.includes('web_fetch')=${TOOL_NAMES.includes('web_fetch')}; kandidat baris catalog.ts ${l.join(',') || '-'}`,
    );
    cek(
      'web_fetch ADA di TOOL_DIKIRIM_SELALU (selalu dikirim)',
      C.TOOL_DIKIRIM_SELALU.includes('web_fetch'),
      `TOOL_DIKIRIM_SELALU=${JSON.stringify(C.TOOL_DIKIRIM_SELALU)} | kandidat baris: ${barisDengan(F_CATALOG, 'TOOL_DIKIRIM_SELALU').join(',')}`,
    );
    cek(
      'web_fetch ADA di TOOL_BY_NAME (bisa di-resolve tool_call)',
      C.TOOL_BY_NAME.has('web_fetch'),
      `TOOL_BY_NAME.has('web_fetch')=${C.TOOL_BY_NAME.has('web_fetch')}`,
    );
    cek(
      'zephyr_kode ADA di katalog tool (TOOL_NAMES runtime) - dulu MODUL MATI',
      TOOL_NAMES.includes('zephyr_kode'),
      `TOOL_NAMES.includes('zephyr_kode')=${TOOL_NAMES.includes('zephyr_kode')}; TOOL_NAMES.len=${TOOL_NAMES.length}; baris catalog.ts: ${barisDengan(F_CATALOG, 'zephyr_kode').join(',')}`,
    );
    cek(
      'zephyr_kode bisa di-resolve tool_call (TOOL_BY_NAME) - TERJANGKAU',
      C.TOOL_BY_NAME.has('zephyr_kode'),
      `TOOL_BY_NAME.has('zephyr_kode')=${C.TOOL_BY_NAME.has('zephyr_kode')}; ukuran TOOL_BY_NAME=${C.TOOL_BY_NAME.size}`,
    );
    cek(
      'entri katalog zephyr_kode: sumber builtin + kelompok Code intelligence + efek read (runtime)',
      (() => {
        const e = C.TOOL_CATALOG.find((t) => t && t.name === 'zephyr_kode');
        return !!e && e.source === 'builtin' && e.group === 'Code intelligence' && e.effect === 'read';
      })(),
      `entri=${JSON.stringify(C.TOOL_CATALOG.find((t) => t && t.name === 'zephyr_kode'))}`,
    );
    cek(
      'zephyr_kode TIDAK di TOOL_DIKIRIM_SELALU (muatan selalu tetap; terjangkau lewat tool_search/tool_call)',
      !C.TOOL_DIKIRIM_SELALU.includes('zephyr_kode'),
      `TOOL_DIKIRIM_SELALU(${C.TOOL_DIKIRIM_SELALU.length})=${JSON.stringify(C.TOOL_DIKIRIM_SELALU)}`,
    );
    cek(
      'nama tool TIDAK duplikat setelah entri baru (TOOL_NAMES unik; TOOL_BY_NAME = panjang katalog)',
      new Set(TOOL_NAMES).size === TOOL_NAMES.length && C.TOOL_BY_NAME.size === C.TOOL_CATALOG.length,
      `unik=${new Set(TOOL_NAMES).size}/${TOOL_NAMES.length}; TOOL_BY_NAME=${C.TOOL_BY_NAME.size} vs TOOL_CATALOG=${C.TOOL_CATALOG.length}`,
    );
  }

  /* ================================================================ */
  grup('B. SUBSET yang DIKIRIM ke model (cap <= ' + BATAS + ', runtime)');
  {
    const tugas = 'buka https://example.org/artikel lalu ambil isinya';
    const kirim = ST.pilihToolTugas(tugas, AKTIF_PENUH, true);
    const jejak = ST.jejakPemilihan(tugas, AKTIF_PENUH, true);
    cek(
      'pilihToolTugas(web) MENYERTAKAN web_fetch',
      kirim.includes('web_fetch'),
      `dikirim(${kirim.length})=${kirim.join(',')}`,
    );
    cek(
      `pilihToolTugas(web) menghormati cap <= ${BATAS}`,
      kirim.length <= BATAS,
      `panjang=${kirim.length} (cap ${BATAS}); baris BATAS_TOOL_TUGAS: ${barisDengan(F_SUBSET, 'BATAS_TOOL_TUGAS =').join(',')}`,
    );
    // zephyr_kode: WAJIB muncul untuk tugas yang membaca kode (dulu: tak pernah muncul).
    const tugasUji = [
      'baca isi src/lib/bacaKode.ts dan jelaskan',
      'cari berkas yang mengimpor modul ini',
      'ambil https://example.org/x',
      'perbaiki bug di src/lib/aiStore.ts',
      'jalankan tes lalu commit',
      '',
      null,
    ];
    let munculDi = 0;
    let maksSubset = 0;
    for (const t of tugasUji) {
      const d = ST.pilihToolTugas(t, AKTIF_PENUH, true);
      maksSubset = Math.max(maksSubset, d.length);
      if (d.includes('zephyr_kode')) munculDi++;
    }
    const tugasBaca = 'baca isi src/lib/bacaKode.ts dan jelaskan';
    const kirimBaca = ST.pilihToolTugas(tugasBaca, AKTIF_PENUH, true);
    cek(
      'zephyr_kode MUNCUL di subset tugas baca-kode (dulu: TIDAK PERNAH)',
      kirimBaca.includes('zephyr_kode'),
      `subset tugas-baca(${kirimBaca.length})=${kirimBaca.join(',')}`,
    );
    cek(
      `cap tetap terjaga: subset terpanjang lintas ${tugasUji.length} tugas = ${maksSubset} <= ${BATAS}`,
      maksSubset <= BATAS && kirimBaca.length <= BATAS,
      `maks=${maksSubset}; tugas-baca=${kirimBaca.length}; cap=${BATAS}; baris BATAS_TOOL_TUGAS: ${barisDengan(F_SUBSET, 'BATAS_TOOL_TUGAS =').join(',')}`,
    );
    {
      /* SEBELUM vs SESUDAH: basis-aktif TANPA zephyr_kode = dunia sebelum patch
         (dulu nama itu memang tak ada di katalog, jadi tak ada di basis-aktif). */
      const sebelum = ST.pilihToolTugas(tugasBaca, AKTIF_PENUH.filter((n) => n !== 'zephyr_kode'), true);
      const sesudah = kirimBaca;
      const tergeser = sebelum.filter((n) => !sesudah.includes(n));
      const nambah = sesudah.filter((n) => !sebelum.includes(n));
      let kh;
      try {
        kh = JSON.stringify(ST.keluargaHilang(sebelum, sesudah));
      } catch (e) {
        kh = 'galat: ' + (e && e.message ? e.message : e);
      }
      cek(
        'masuknya zephyr_kode tidak melampaui cap & tak menggusur lebih dari 1 tool (sebelum vs sesudah)',
        sesudah.length <= BATAS && sebelum.length <= BATAS && nambah.includes('zephyr_kode') && tergeser.length <= 1,
        `sebelum(${sebelum.length})=${sebelum.join(',')} | sesudah(${sesudah.length})=${sesudah.join(',')} | tergeser=[${tergeser.join(',')}] | nambah=[${nambah.join(',')}] | keluargaHilang=${kh}`,
      );
    }
    cek(
      'zephyr_kode sekeluarga dengan lsp_* (navigasi-kode) - keluarga yang sama tetap terjangkau',
      JSON.stringify(ST.keluargaTool('zephyr_kode')).includes('navigasi-kode') && kirimBaca.includes('lsp_diagnostics'),
      `keluargaTool('zephyr_kode')=${JSON.stringify(ST.keluargaTool('zephyr_kode'))}; lsp_diagnostics di subset=${kirimBaca.includes('lsp_diagnostics')}`,
    );
    cek(
      'jejakPemilihan() memuat web_fetch (jalur kirim nyata ada)',
      jejak.dikirim.includes('web_fetch'),
      `jejak.dikirim(${jejak.dikirim.length}) mengandung web_fetch=${jejak.dikirim.includes('web_fetch')}`,
    );
    // alatUntukTugas = fungsi LAMA tanpa cap (subsetAlat.ts); kini juga menjangkau zephyr_kode.
    const lama = m.subsetAlat.alatUntukTugas(tugas, AKTIF_PENUH, true);
    cek(
      'zephyr_kode juga TERJANGKAU di fungsi LAMA alatUntukTugas (subsetAlat.ts) - dulu TIDAK',
      lama.includes('zephyr_kode'),
      `alatUntukTugas(len=${lama.length}) mengandung zephyr_kode=${lama.includes('zephyr_kode')} | pilihToolTugas(len=${kirim.length})`,
    );
  }

  /* ================================================================ */
  grup('C. SKEMA ARGUMEN (runtime utk zephyr_kode; baris sumber utk web_fetch)');
  {
    const spec = BK.SPEC_BACA_KODE;
    cek(
      'zephyr_kode punya SKEMA argumen lengkap (berkas/dari/sampai/simbol, required=[berkas])',
      !!spec && !!spec.parameters && !!spec.parameters.properties &&
        ['berkas', 'dari', 'sampai', 'simbol'].every((k) => k in spec.parameters.properties) &&
        spec.parameters.required.includes('berkas'),
      `props=${spec && spec.parameters && Object.keys(spec.parameters.properties).join(',')}; required=${spec && spec.parameters && JSON.stringify(spec.parameters.required)}`,
    );
    cek(
      "zephyr_kode: name==='zephyr_kode' + parameters di berkas sumber",
      !!(spec && spec.name === 'zephyr_kode') && adaDiBerkas(F_BACA, "name: 'zephyr_kode'") && adaDiBerkas(F_BACA, 'parameters:'),
      `baris name: ${barisDengan(F_BACA, "name: 'zephyr_kode'").join(',')} | parameters: ${barisDengan(F_BACA, 'parameters:').slice(0, 3).join(',')}`,
    );
    const w = jendelaSetelah(F_WEB, "name: 'web_fetch'", 12, ['parameters:', 'url', 'max_chars', 'required']);
    cek(
      'web_fetch punya SKEMA argumen (url + max_chars, required=[url]) di web.ts (baris sumber)',
      w.ok,
      `baris name web_fetch: ${barisDengan(F_WEB, "name: 'web_fetch'").join(',')} | kurang=${JSON.stringify(w.hilang)}`,
    );
  }

  /* ================================================================ */
  grup('D. EKSEKUTOR/HANDLER nyata');
  {
    cek(
      'zephyr_kode punya eksekutor nyata (TOOL_BACA_KODE.run = fungsi)',
      typeof BK.TOOL_BACA_KODE.run === 'function' && BK.TOOL_BACA_KODE.spec === BK.SPEC_BACA_KODE,
      `typeof run=${typeof BK.TOOL_BACA_KODE.run}; baris: ${barisDengan(F_BACA, 'run: jalankanBacaKode').join(',')}`,
    );
    cek(
      'web_fetch punya eksekutor nyata di web.ts (name+run berpasangan)',
      adaDiBerkas(F_WEB, "name: 'web_fetch'") && barisDengan(F_WEB, 'run: async').length > 0,
      `baris run: ${barisDengan(F_WEB, 'run: async').slice(0, 3).join(',')}; pasangan nama di baris ${barisDengan(F_WEB, "name: 'web_fetch'").join(',')}`,
    );
    cek(
      'web_fetch TERDAFTAR di AGENT_TOOLS (spread ...TOOL_WEB) — registry tool agent',
      adaDiBerkas(F_AGENT, '...TOOL_WEB') && adaDiBerkas(F_AGENT, "from './zephyrTools/web'"),
      `agentTools.ts import: ${barisDengan(F_AGENT, "from './zephyrTools/web'").join(',')} | spread: ${barisDengan(F_AGENT, '...TOOL_WEB').join(',')}`,
    );
    cek(
      'zephyr_kode TERDAFTAR di AGENT_TOOLS (agentTools.ts impor TOOL_BACA_KODE) - dulu TIDAK',
      adaDiBerkas(F_AGENT, "from './bacaKode'") && adaDiBerkas(F_AGENT, 'TOOL_BACA_KODE'),
      `agentTools.ts impor bacaKode di baris ${barisDengan(F_AGENT, "from './bacaKode'").join(',')} | TOOL_BACA_KODE di baris ${barisDengan(F_AGENT, 'TOOL_BACA_KODE').join(',')}`,
    );
    cek(
      'U-JT4: jembatan baca-kode DIPASANG dari agentTools.ts (bukan aiStore.ts)',
      adaDiBerkas(F_AGENT, 'pasangJembatanBacaKode') && !adaDiBerkas(F_AI, 'pasangJembatanBacaKode'),
      `agentTools.ts baris ${barisDengan(F_AGENT, 'pasangJembatanBacaKode').join(',')} | aiStore.ts: ${barisDengan(F_AI, 'pasangJembatanBacaKode').join(',') || 'TIDAK menyentuh'}`,
    );
  }

  /* ================================================================ */
  grup('E. JARAK MODUL -> JALUR KIRIM (rantai impor nyata)');
  {
    const impBaca = pengimpor('bacaKode');
    cek(
      'bacaKode.ts KINI diimpor agentTools.ts (dulu NOL importer = modul mati)',
      impBaca.includes('src/lib/agentTools.ts'),
      `pengimpor bacaKode = ${impBaca.join(',') || 'NOL'}`,
    );
    const impAmbil = pengimpor('ambilWeb');
    cek(
      'ambilWeb.ts: NOL importer (modul mati)',
      impAmbil.length === 0,
      `pengimpor ambilWeb = ${impAmbil.length === 0 ? 'NOL' : impAmbil.join(',')}`,
    );
    const impWeb = pengimpor('web');
    cek(
      "web.ts: ADA importer (agentTools.ts) — rantai hidup",
      impWeb.includes('src/lib/agentTools.ts'),
      `pengimpor web = ${impWeb.join(',') || 'NOL'}`,
    );
    cek(
      'RANTAI KIRIM: aiStore.ts -> pilihToolTugas (subsetTugas) -> katalog',
      adaDiBerkas(F_AI, 'pilihToolTugas') &&
        barisDengan(F_AI, 'pilihToolTugas(').length > 0 &&
        adaDiBerkas(F_AI, "from './subsetTugas'"),
      `aiStore.ts impor subsetTugas: ${barisDengan(F_AI, "from './subsetTugas'").join(',')} | panggil: ${barisDengan(F_AI, 'pilihToolTugas(').join(',')}`,
    );
    cek(
      'RANTAI IMPOR: web.ts -> agentTools.ts -> AGENT_TOOLS',
      adaDiBerkas(F_AGENT, "from './zephyrTools/web'") && adaDiBerkas(F_AGENT, '...TOOL_WEB'),
      `lihat bukti grup D`,
    );
  }

  /* ================================================================ */
  grup('F. UJI NEGATIF BACA-KODE (gerbang bolehDibacaKode, jalur zephyr_kode)');
  {
    const tolak = [
      ['traversal ../', '../etc/passwd'],
      ['traversal bersarang', 'src/../../x.ts'],
      ['absolut POSIX', '/etc/hosts'],
      ['absolut Windows', 'C:/Windows/win.ini'],
      ['UNC', '\\\\srv\\share\\a.ts'],
      ['rahasia .env', '.env'],
      ['rahasia .env.*', 'config/.env.local'],
      ['rahasia *.pem', 'server.pem'],
      ['rahasia *.key', 'tls.key'],
      ['kunci privat id_rsa', 'id_rsa'],
      ['folder .ssh', '.ssh/id_rsa'],
      ['folder .git', '.git/config'],
      ['folder user di luar repo (absolut)', 'C:/Users/Zyrex/.ssh/id_rsa'],
    ];
    for (const [nama, j] of tolak) {
      const h = BK.bolehDibacaKode(j);
      cek(`TOLAK ${nama} -> ${JSON.stringify(j)}`, h.ok === false, `hasil=${JSON.stringify(h)}`);
    }
    const izin = BK.bolehDibacaKode('src/lib/bacaKode.ts');
    cek(
      'KONTROL: berkas kode yang sah DIIZINKAN',
      izin.ok === true,
      `hasil=${JSON.stringify(izin)}`,
    );
    // gerbang menolak SEBELUM menyentuh jembatan disk.
    let sentuh = 0;
    const jembatan = {
      akar: AKAR,
      cmd: {
        fsRead: async () => {
          sentuh++;
          return { content: 'x' };
        },
        fsStat: async () => {
          sentuh++;
          return { size: 1 };
        },
        realpath: async (p) => {
          sentuh++;
          return p;
        },
      },
    };
    const hasilTolak = await BK.bacaBerkasKode({ berkas: '.env' }, jembatan);
    cek(
      'jembatan disk TIDAK disentuh saat jalur ditolak (.env) — jejak KOSONG',
      sentuh === 0 && hasilTolak.ok === false && hasilTolak.jejak.length === 0,
      `ok=${hasilTolak.ok}; sentuh=${sentuh}; jejak=${JSON.stringify(hasilTolak.jejak)}`,
    );

    // jalur relatif yang REALPATH-nya menunjuk KELUAR akar repo -> ditolak pagar.
    const jembatanLuar = {
      akar: AKAR,
      cmd: {
        fsRead: async () => ({ content: 'x' }),
        fsStat: async () => ({ size: 1 }),
        realpath: async (p) => (String(p).includes('ok.ts') ? 'C:/Users/Zyrex/rc/ok.ts' : AKAR),
      },
    };
    const luar = await BK.bacaBerkasKode({ berkas: 'src/ok.ts' }, jembatanLuar);
    cek(
      'TOLAK berkas yang realpath-nya DI LUAR akar repo (folder user luar repo)',
      luar.ok === false && /KELUAR akar/.test(luar.alasan),
      `ok=${luar.ok}; alasan=${luar.alasan}`,
    );

    // KONTROL positif end-to-end: jembatan palsu, isi berkas nyata -> ok.
    const isiNyata = fs.readFileSync(path.join(AKAR, 'src/lib/bacaKode.ts'), 'utf8');
    const jembatanNyata = {
      akar: AKAR,
      cmd: {
        fsRead: async () => ({ content: isiNyata }),
        fsStat: async () => ({ size: isiNyata.length }),
        realpath: async (p) => String(p),
      },
    };
    const bacaOk = await BK.bacaBerkasKode({ berkas: 'src/lib/bacaKode.ts', dari: 1, sampai: 5 }, jembatanNyata);
    cek(
      'KONTROL positif: bacaBerkasKode() end-to-end membaca berkas nyata (offline)',
      bacaOk.ok === true && /\d/.test(bacaOk.teks) && bacaOk.jejak.includes('fsRead'),
      `ok=${bacaOk.ok}; jejak=${JSON.stringify(bacaOk.jejak)}; teks.50=${bacaOk.teks.slice(0, 50)}`,
    );
  }

  /* ================================================================ */
  grup('G. UJI NEGATIF AMBIL-WEB');
  {
    // --- G1: gerbang NYATA yang dipakai web_fetch = kebijakanIsiWeb.periksaUrl
    const kb = { izinIsiWeb: true, allowlist: ['example.org'], batasByte: 2097152, batasKarakter: 20000 };
    cek('web_fetch: file:// DITOLAK (skema-terlarang)',
      KB.periksaUrl('file:///etc/passwd', kb).ok === false,
      JSON.stringify(KB.periksaUrl('file:///etc/passwd', kb)));
    cek('web_fetch: javascript: DITOLAK',
      KB.periksaUrl('javascript:alert(1)', kb).ok === false,
      JSON.stringify(KB.periksaUrl('javascript:alert(1)', kb)));
    cek('web_fetch: data: DITOLAK',
      KB.periksaUrl('data:text/html,hi', kb).ok === false,
      JSON.stringify(KB.periksaUrl('data:text/html,hi', kb)));
    cek('web_fetch: host di LUAR allowlist DITOLAK',
      KB.periksaUrl('https://evil.test/x', kb).ok === false,
      JSON.stringify(KB.periksaUrl('https://evil.test/x', kb)));
    cek('web_fetch: localhost DITOLAK',
      KB.periksaUrl('https://localhost/x', kb).ok === false,
      JSON.stringify(KB.periksaUrl('https://localhost/x', kb)));
    cek('web_fetch: IP privat 127.0.0.1 DITOLAK',
      KB.periksaUrl('http://127.0.0.1/x', kb).ok === false,
      JSON.stringify(KB.periksaUrl('http://127.0.0.1/x', kb)));
    cek('web_fetch: IP privat 10.x/192.168.x DITOLAK',
      KB.periksaUrl('https://10.0.0.5/x', kb).ok === false &&
        KB.periksaUrl('https://192.168.1.1/x', kb).ok === false,
      JSON.stringify(KB.periksaUrl('https://10.0.0.5/x', kb)));
    cek('web_fetch: metadata 169.254.169.254 DITOLAK',
      KB.periksaUrl('https://169.254.169.254/latest', kb).ok === false,
      JSON.stringify(KB.periksaUrl('https://169.254.169.254/latest', kb)));
    cek('web_fetch: port tak lazim (8080) DITOLAK',
      KB.periksaUrl('https://example.org:8080/x', kb).ok === false,
      JSON.stringify(KB.periksaUrl('https://example.org:8080/x', kb)));
    cek('web_fetch: izin OFF => DITOLAK SEMUA (gagal-tertutup)',
      KB.periksaUrl('https://example.org/x', { ...kb, izinIsiWeb: false }).ok === false,
      JSON.stringify(KB.periksaUrl('https://example.org/x', { ...kb, izinIsiWeb: false })));
    const bolehOk = KB.periksaUrl('https://example.org/x', kb);
    cek('web_fetch: KONTROL https allowlist DIIZINKAN',
      bolehOk.ok === true,
      JSON.stringify(bolehOk));

    // --- G2: lantai https-only hidup di ambilWeb (modul MATI) -----------
    const izinTolak = AW.IZIN_TOLAK;
    const gHttp = AW.periksaUrlAmbilWeb('http://example.org/x', { host: ['example.org'], lokal: false, httpLokal: false });
    cek('ambilWeb: SKEMA_IZIN=https: => http DITOLAK',
      AW.SKEMA_IZIN === 'https:' && gHttp.ok === false,
      `SKEMA_IZIN=${AW.SKEMA_IZIN}; periksaUrlAmbilWeb(http)=${JSON.stringify(gHttp)}`);
    cek('ambilWeb: https allowlist DIIZINKAN (kontrol)',
      AW.periksaUrlAmbilWeb('https://example.org/x', { host: ['example.org'], lokal: false, httpLokal: false }).ok === true,
      JSON.stringify(AW.periksaUrlAmbilWeb('https://example.org/x', { host: ['example.org'], lokal: false, httpLokal: false })));
    cek('ambilWeb: izin default = TOLAK SEMUA (IZIN_TOLAK host kosong)',
      Array.isArray(izinTolak.host) && izinTolak.host.length === 0 && izinTolak.lokal === false,
      JSON.stringify(izinTolak));

    // --- G3: pemotongan keluaran + ANGKANYA -----------------------------
    const panjang = KB.potongKeluaran('A'.repeat(25000), kb);
    cek('web_fetch: keluaran DIPOTONG di BATAS_KARAKTER_KELUARAN=20000',
      KB.BATAS_KARAKTER_KELUARAN === 20000 && panjang.dipotong === true && panjang.batas === 20000,
      `BATAS_KARAKTER_KELUARAN=${KB.BATAS_KARAKTER_KELUARAN}; dipotong=${panjang.dipotong}; batas=${panjang.batas}; asli=${panjang.asli}; teks.len=${panjang.teks.length}`);
    cek('web_fetch: batas karakter di-CLAMP ke 20000 (periksaBatasKarakter)',
      KB.batasKarakterBerlaku(999999) === 20000,
      `batasKarakterBerlaku(999999)=${KB.batasKarakterBerlaku(999999)}`);
    cek('web_fetch: batas BYTE di-CLAMP ke 8 MiB (BATAS_BYTE_MAKS)',
      KB.batasByteBerlaku(99999999) === 8 * 1024 * 1024,
      `BATAS_BYTE_MAKS=${KB.BATAS_BYTE_MAKS}; batasByteBerlaku(99999999)=${KB.batasByteBerlaku(99999999)}`);
    const potongAw = AW.potongKarakter('B'.repeat(50000), AW.MAKS_KARAKTER_BAWAAN);
    cek('ambilWeb: pemotongan punya angka batas bawaan (15.000 kar.)',
      AW.MAKS_KARAKTER_BAWAAN === 15000 && potongAw.dipotong === true,
      `MAKS_KARAKTER_BAWAAN=${AW.MAKS_KARAKTER_BAWAAN}; potongKarakter.dipotong=${potongAw.dipotong}`);

    // --- G4: JSON bisa dibaca LANGSUNG (data ter-urai) ------------------
    const transportJson = async (url) => ({
      status: 200,
      header: { 'content-type': 'application/json' },
      body: '{"nama":"Zephyr","jumlah":3}',
      url,
    });
    const hasilJson = await AW.ambilWeb(
      { url: 'https://example.org/api', izin: { host: ['example.org'], lokal: false, httpLokal: false } },
      transportJson,
    );
    cek('ambilWeb: JSON dibaca LANGSUNG (data ter-urai, bukan teks mentah)',
      hasilJson.ok === true && hasilJson.json === true && hasilJson.data && hasilJson.data.nama === 'Zephyr',
      `ok=${hasilJson.ok}; json=${hasilJson.json}; data=${JSON.stringify(hasilJson.data)}`);

    // --- G5: NOL shell + nol jaringan saat ditolak ----------------------
    // Cek SINTAKS nyata (impor/panggilan), bukan kata di komentar.
    const shellPola = ["'child_process'", '"child_process"', "'node:child_process'", 'execSync(', 'spawnSync(', 'execFileSync(', 'spawn('];
    let shellHit = [];
    for (const f of [F_WEB, F_AMBIL, F_KEBIJAKAN]) {
      for (const p of shellPola) if (adaDiBerkas(f, p)) shellHit.push(`${f}:${p}`);
    }
    cek('NOL shell di modul web (tak impor child_process / tak panggil exec/spawn)',
      shellHit.length === 0,
      `hit=${shellHit.join(',') || 'TIDAK ADA'}`);
    let jaringan = 0;
    const transportHitung = async (url) => {
      jaringan++;
      return { status: 200, body: 'x', url };
    };
    const ditolak = await AW.ambilWeb(
      { url: 'http://example.org/x', izin: { host: ['example.org'], lokal: false, httpLokal: false } },
      transportHitung,
    );
    cek('ambilWeb: URL ditolak => transport TIDAK dipanggil (nol jaringan)',
      ditolak.ok === false && jaringan === 0,
      `ok=${ditolak.ok}; sebab=${ditolak.sebab}; panggilan transport=${jaringan}`);
  }

  /* ================================================================ */
  console.log('\n-- G3. LANTAI HTTPS + IZIN HOST jalur HIDUP web_fetch (runtime, transport stub) --');
  grup('G3. LANTAI HTTPS + IZIN HOST jalur HIDUP web_fetch (runtime, transport stub)');
  {
    /*
     * Di sini yang diuji adalah KODE ASLI `web.ts`: `lantaiHttpsWeb()` dan
     * eksekutor `TOOL_WEB.web_fetch.run()` - bukan salinan, bukan baris sumber
     * saja. Modul lapisan-app di-stub, dan TRANSPORT (`cmd.webFetch`) diganti
     * PENGHITUNG panggilan: itulah bukti "penolakan terjadi SEBELUM transport
     * dipanggil" (nol panggilan = nol permintaan keluar).
     */
    if (!MW) {
      cek(
        'web_fetch: bundel jalur HIDUP web.ts bisa dijalankan di node (prasyarat grup ini)',
        false,
        `bundel web.ts gagal: ${galatBundelWeb}`,
      );
    } else {
      const tWeb = MW.TOOL_WEB.find((t) => t.spec && t.spec.name === 'web_fetch');
      const kbUji = { izinIsiWeb: true, allowlist: ['example.org'], batasByte: 2097152, batasKarakter: 20000 };
      const net = () => globalThis.__netZephyr;
      const setelanUji = () => globalThis.__setelanZephyrUji;

      cek(
        'web_fetch: eksekutor ASLI terjangkau di node (TOOL_WEB.web_fetch.run = fungsi)',
        !!tWeb && typeof tWeb.run === 'function',
        `tool ditemukan=${!!tWeb}; typeof run=${typeof (tWeb && tWeb.run)}`,
      );
      cek(
        "web_fetch: lantai skema = https: dan modul MATI ambilWeb TIDAK disambungkan (bukan gerbang ketiga)",
        MW.SKEMA_WEB_FETCH === 'https:' && !adaDiBerkas(F_WEB, "from './ambilWeb'") && pengimpor('ambilWeb').length === 0,
        `SKEMA_WEB_FETCH=${MW.SKEMA_WEB_FETCH}; web.ts impor ambilWeb? ${adaDiBerkas(F_WEB, "from './ambilWeb'")}; pengimpor ambilWeb=${pengimpor('ambilWeb').length === 0 ? 'NOL' : pengimpor('ambilWeb').join(',')}`,
      );

      /* (a)+(b) DAFTAR PENOLAKAN: skema non-https, host internal, metadata. */
      const TOLAK = [
        ['http:// ditolak (lantai skema)', 'http://example.org/x', 'skema-bukan-https'],
        ['ftp:// ditolak', 'ftp://example.org/x', 'skema-terlarang'],
        ['file:// ditolak', 'file:///etc/passwd', 'skema-terlarang'],
        ['javascript: ditolak', 'javascript:alert(1)', 'skema-terlarang'],
        ['localhost ditolak', 'https://localhost/x', 'nama-lokal'],
        ['127.0.0.1 ditolak', 'https://127.0.0.1/x', 'ip-privat'],
        ['10.0.0.5 ditolak', 'https://10.0.0.5/x', 'ip-privat'],
        ['172.16.0.1 ditolak', 'https://172.16.0.1/x', 'ip-privat'],
        ['192.168.1.1 ditolak', 'https://192.168.1.1/x', 'ip-privat'],
        ['[::1] ditolak', 'https://[::1]/x', 'ip-privat'],
        ['metadata 169.254.169.254 ditolak', 'https://169.254.169.254/latest/meta-data/', 'ip-privat'],
        ['host di luar izin ditolak', 'https://evil.test/x', 'host-luar-allowlist'],
        ['batas izin host: example.org.jahat.test ditolak', 'https://example.org.jahat.test/x', 'host-luar-allowlist'],
        ['userinfo (jahat@example.org) ditolak', 'https://jahat@example.org/x', 'userinfo-ditolak'],
      ];
      for (const [nama, u, harap] of TOLAK) {
        const h = MW.lantaiHttpsWeb(u, kbUji);
        cek(
          `web_fetch: ${nama}`,
          h.ok === false && String(h.alasan).includes(harap),
          `lantaiHttpsWeb(${u})=${JSON.stringify(h)} (harap memuat '${harap}')`,
        );
      }

      /* (c) PENOLAKAN SEBELUM TRANSPORT: penjumlahan pemanggilan fetcher = 0. */
      net().length = 0;
      const pesanTolak = [];
      for (const [, u] of TOLAK) pesanTolak.push(String(await tWeb.run({ url: u })));
      const semuaDitolak = pesanTolak.every((p) => p.startsWith('(isi web ditolak: '));
      cek(
        `web_fetch: ${TOLAK.length} URL ditolak => transport TIDAK PERNAH dipanggil (nol permintaan keluar)`,
        net().length === 0 && semuaDitolak,
        `panggilan transport=${net().length}; semua pesan "(isi web ditolak: "...=${semuaDitolak}; contoh=${JSON.stringify(pesanTolak[0])}`,
      );

      /* (d) KONTROL POSITIF: https ke host yang DIIZINKAN sampai ke transport. */
      net().length = 0;
      const hasilOk = String(await tWeb.run({ url: 'https://example.org/artikel' }));
      cek(
        'web_fetch: KONTROL POSITIF https host diizinkan => transport DIPANGGIL 1x + isi kembali',
        net().length === 1 && net()[0].url === 'https://example.org/artikel' && hasilOk.includes('ok'),
        `panggilan transport=${net().length}; args=${JSON.stringify(net()?.[0] ?? null)}; hasil=${JSON.stringify(hasilOk)}`,
      );
      const sub = MW.lantaiHttpsWeb('https://sub.example.org/x', kbUji);
      cek(
        'web_fetch: KONTROL subdomain host terdaftar DIIZINKAN (sub.example.org)',
        sub.ok === true,
        JSON.stringify(sub),
      );
      net().length = 0;
      const hasilBatas = String(await tWeb.run({ url: 'https://example.org/x', max_chars: 100 }));
      cek(
        'web_fetch: max_chars model di-clamp lalu diteruskan ke transport (batas byte nyata)',
        net().length === 1 && net()[0].maxChars === 2 * KB.batasKarakterBerlaku(100),
        `panggilan transport=${net().length}; maxChars transport=${net()[0] && net()[0].maxChars}; harap=${2 * KB.batasKarakterBerlaku(100)}; hasil.len=${hasilBatas.length}`,
      );

      /* Gagal-tertutup: izin OFF => ditolak, transport tetap nol. */
      net().length = 0;
      const setelan = setelanUji();
      const izinAsli = setelan.izinIsiWeb;
      setelan.izinIsiWeb = false;
      const hasilIzinMati = String(await tWeb.run({ url: 'https://example.org/x' }));
      setelan.izinIsiWeb = izinAsli;
      cek(
        'web_fetch: izin isi web OFF => DITOLAK SEMUA + nol transport (gagal-tertutup)',
        net().length === 0 && hasilIzinMati.includes('izin-isi-web-mati'),
        `panggilan transport=${net().length}; hasil=${JSON.stringify(hasilIzinMati)}`,
      );

      /* Determininisme: dua kali jalan, hasil & jumlah transport identik. */
      const l1 = JSON.stringify(MW.lantaiHttpsWeb('http://example.org/x', kbUji));
      const l2 = JSON.stringify(MW.lantaiHttpsWeb('http://example.org/x', kbUji));
      net().length = 0;
      const r1 = String(await tWeb.run({ url: 'http://example.org/x' }));
      const r2 = String(await tWeb.run({ url: 'http://example.org/x' }));
      cek(
        'web_fetch: determinisme - lantai 2x identik, eksekutor 2x identik, transport tetap 0',
        l1 === l2 && r1 === r2 && net().length === 0,
        `lantai: ${l1} vs ${l2}; eksekutor: ${JSON.stringify(r1)} vs ${JSON.stringify(r2)}; transport=${net().length}`,
      );

      /* Bukti SUMBER: lantai diputuskan SEBELUM transport di jalur web_fetch. */
      const urut = jendelaSetelah(F_WEB, 'const lantai = lantaiHttpsWeb(url, kb);', 5, [
        'if (!lantai.ok)',
        'ambilIsiWeb',
        'cmd.webFetch(',
      ]);
      cek(
        'Sumber: di jalur web_fetch lantai diperiksa LEBIH DULU, lalu ambil isi, baru transport',
        urut.ok,
        `baris lantai=${barisDengan(F_WEB, 'const lantai = lantaiHttpsWeb(url, kb);').join(',')}; kurang dalam 5 baris=${JSON.stringify(urut.hilang)}`,
      );
      const desk = jendelaSetelah(F_WEB, "name: 'web_fetch'", 14, ['HTTPS ONLY', 'refused before']);
      cek(
        'Sumber: deskripsi web_fetch ke model menyebut HTTPS ONLY + ditolak sebelum permintaan',
        desk.ok,
        `baris name web_fetch=${barisDengan(F_WEB, "name: 'web_fetch'").join(',')}; kurang=${JSON.stringify(desk.hilang)}`,
      );
    }
  }

  /* ================================================================ */
  grup('H. DETERMINISME');
  {
    const tugas = 'buka https://example.org/x dan baca src/lib/aiStore.ts';
    const a1 = ST.pilihToolTugas(tugas, AKTIF_PENUH, true).join(',');
    const a2 = ST.pilihToolTugas(tugas, AKTIF_PENUH, true).join(',');
    cek('pilihToolTugas() deterministik (2 panggilan identik)', a1 === a2, `${a1} != ${a2}`);
    const b1 = JSON.stringify(BK.bolehDibacaKode('../x.ts'));
    const b2 = JSON.stringify(BK.bolehDibacaKode('../x.ts'));
    cek('bolehDibacaKode() deterministik', b1 === b2, `${b1} != ${b2}`);
    const kb = { izinIsiWeb: true, allowlist: ['example.org'], batasByte: 2097152, batasKarakter: 20000 };
    const c1 = JSON.stringify(KB.periksaUrl('https://evil.test/x', kb));
    const c2 = JSON.stringify(KB.periksaUrl('https://evil.test/x', kb));
    cek('periksaUrl() deterministik', c1 === c2, `${c1} != ${c2}`);
    cek('katalog stabil antar-baca (TOOL_NAMES.length tetap)',
      TOOL_NAMES.length === C.TOOL_CATALOG.length,
      `TOOL_NAMES=${TOOL_NAMES.length} vs TOOL_CATALOG=${C.TOOL_CATALOG.length}`);
  }

  /* ================================================================ */
  const total = lulus + gagal.length;
  console.log(`\n== RINGKASAN: ${lulus}/${total} LULUS, ${gagal.length} GAGAL ==`);
  if (gagal.length) {
    for (const g of gagal) console.log(`  GAGAL: ${g}`);
    process.exit(1);
  }
  console.log('SEMUA LULUS.');
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR tak terduga:', e);
  process.exit(1);
});
