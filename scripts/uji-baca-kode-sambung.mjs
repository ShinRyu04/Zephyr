#!/usr/bin/env node
/**
 * uji-baca-kode-sambung.mjs — BUKTI SAMBUNGAN tool `zephyr_kode` ke JALUR NYATA.
 *
 * Item ZEPH-BACA-KODE-SAMBUNG. Berkas ini MILIK item itu; harness lane lain
 * (`uji-jangkauan-tool.mjs`) mengunci keadaan LAMA ("zephyr_kode TIDAK ADA di
 * katalog") dan TIDAK disentuh dari sini.
 *
 * Pertanyaan yang dijawab — semuanya lewat runtime modul ASLI, bukan grep:
 *   (a) `zephyr_kode` ADA di katalog + di SUBSET yang benar-benar dikirim
 *       (jumlah terkirim disebut, harus <= BATAS_TOOL_TUGAS) + punya SKEMA
 *       argumen + EKSEKUTOR nyata, dan tiap jawabannya menyebut berkas + baris.
 *   (b) JEMBATAN benar-benar terpasang lewat rantai impor nyata
 *       (`jalankanAgentTool` -> `pasangJembatanBacaKodeDariWorkspace` ->
 *       `pasangJembatanBacaKode`), lalu membaca BERKAS NYATA dari disk.
 *   (c) uji NEGATIF baca: traversal, absolut, UNC, .env/*.pem/*.key/id_rsa/
 *       .ssh/.git, berkas di luar akar repo -> SEMUA DITOLAK.
 *   (d) keluaran DIPOTONG dengan ANGKA batasnya (baris/karakter/baris-panjang/
 *       ukuran berkas/berkas-per-panggilan/anggaran sesi).
 *   (e) NOL jalur tulis (Proxy mencatat SETIAP akses properti ke jembatan).
 *   (f) determinisme (dua jalan identik).
 *   (g) REALPATH SUNGGUHAN: perintah `fs_realpath` (Rust: resolve symlink/
 *       junction + tolak jalur keluar akar) benar-benar dipakai jalur tool.
 *       Stub `invoke('fs_realpath')` di berkas ini MENIRU perintah itu (baca
 *       disk nyata + pagar akar); tautan NYATA (junction) dibuat di disk untuk
 *       membuktikan yang keluar akar DITOLAK dan yang di dalam akar DITERIMA,
 *       plus fail-closed saat perintahnya tidak tersedia / tidak menyelesaikan
 *       jalur / tidak ada akar workspace.
 *
 * SIFAT: node murni, deterministik, TANPA jaringan / TANPA app / TANPA CDP.
 * `src/lib/**` ASLI di-bundle esbuild ke CJS; perintah Tauri `invoke` diganti
 * stub yang membaca DISK NYATA (hanya baca - tidak ada tulis sama sekali).
 *
 * Jalankan: node scripts/uji-baca-kode-sambung.mjs   (exit 0 kalau semua lulus)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
const grup = (n) => {
  grupSekarang = n;
  console.log(`\n-- ${n}`);
};
function cek(nama, syarat, bukti) {
  if (syarat) {
    lulus++;
    console.log(`  \u2713 ${nama}`);
  } else {
    gagal.push(`${grupSekarang} :: ${nama}`);
    console.log(`  \u2717 ${nama}\n      bukti: ${bukti}`);
  }
}

/* ------------------------------------------------------------------ */
/* Bundel src/lib/** ASLI -> CJS, dengan stub Tauri (baca-saja)        */
/* ------------------------------------------------------------------ */
const CACHE = path.join(AKAR, 'node_modules', '.cache', 'zephyr-baca-kode-sambung');
const OUT = path.join(CACHE, 'sambung.cjs');

const STUB_TAURI = `
import fs from 'node:fs';
import path from 'node:path';
/* Kelengkapan yang diminta modul lain yang ikut ter-bundle (plugin-updater
   mengimpor Resource/Channel dari modul yang sama). Tidak ada yang berjalan. */
export class Resource {
  constructor(rid) {
    this.rid = rid;
  }
  async close() {}
  static async close() {}
}
export class Channel {
  constructor() {
    this.onmessage = null;
    this.id = 0;
  }
  toJSON() {
    return { id: this.id };
  }
  async send() {}
}
export async function invoke(cmd, args) {
  const a = args || {};
  if (cmd === 'fs_read') {
    const teks = fs.readFileSync(String(a.path), 'utf8');
    globalThis.__stubBaca = (globalThis.__stubBaca || 0) + 1;
    return { content: teks, detectedEncoding: 'utf8', lineEnding: 'lf', readOnly: false };
  }
  if (cmd === 'fs_stat') {
    const st = fs.statSync(String(a.path));
    globalThis.__stubStat = (globalThis.__stubStat || 0) + 1;
    return { size: st.size, isDir: st.isDirectory(), mtime: st.mtimeMs };
  }
  if (cmd === 'fs_realpath') {
    /* Meniru perintah Rust \`fs_realpath\` (src-tauri/src/fs_utils.rs):
       selesaikan symlink/junction ke bentuk kanonik, lalu TOLAK kalau hasilnya
       keluar dari akar workspace. Akar workspace dititipkan harness di
       \`globalThis.__ujiWorkspace\` (di app: state Tauri - tanpa workspace,
       perintahnya menolak, sama seperti fail-closed di Rust). */
    const akarWs = globalThis.__ujiWorkspace;
    if (!akarWs) {
      throw new Error('WorkspaceOutside: tidak ada folder workspace terbuka, jadi tidak ada batas yang bisa dipakai untuk memeriksa');
    }
    const p = String(a.path);
    const abs = path.isAbsolute(p) ? p : path.join(String(akarWs), p);
    let nyata;
    try {
      nyata = fs.realpathSync.native(abs);
    } catch (e) {
      throw new Error('NotFound: tidak bisa membaca jalur: ' + p);
    }
    const norm = (x) => {
      let d = String(x).split(String.fromCharCode(92)).join('/');
      if (d.indexOf('//?/') === 0) d = d.slice(4);
      while (d.length > 1 && d.endsWith('/')) d = d.slice(0, -1);
      return d.toLowerCase();
    };
    const n = norm(nyata);
    const k = norm(fs.realpathSync.native(String(akarWs)));
    if (n !== k && n.indexOf(k + '/') !== 0) {
      throw new Error('WorkspaceOutside: tautan menunjuk keluar akar workspace: ' + p + ' -> ' + nyata);
    }
    globalThis.__stubRealpath = (globalThis.__stubRealpath || 0) + 1;
    return nyata;
  }
  throw new Error('stub uji: perintah Tauri tidak dikenal: ' + cmd);
}
`;

const pluginStub = {
  name: 'tauri-stub-baca-saja',
  setup(build) {
    build.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: 'stub-tauri-core', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: STUB_TAURI, loader: 'js' }));
  },
};

async function bangunBundel() {
  fs.mkdirSync(CACHE, { recursive: true });
  await esbuild.build({
    stdin: {
      contents:
        `export * as agentTools from './src/lib/agentTools';\n` +
        `export * as catalog from './src/lib/zephyrTools/catalog';\n` +
        `export * as subsetTugas from './src/lib/subsetTugas';\n` +
        `export * as bacaKode from './src/lib/bacaKode';\n` +
        `export * as toolGate from './src/lib/toolGate';\n` +
        `export * as store from './src/lib/store';\n`,
      resolveDir: AKAR,
      loader: 'ts',
      sourcefile: 'sambung-entry.ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: OUT,
    absWorkingDir: AKAR,
    logLevel: 'silent',
    /* `import.meta.env` hanya ada di Vite; di node diganti bentuk statis supaya
       modul lapisan-app (toolGate/store/web) bisa di-require apa adanya. */
    define: { 'import.meta.env': '{"DEV":true,"PROD":false}' },
    plugins: [pluginStub],
  });
  return requireDariRepo(OUT);
}

/* ------------------------------------------------------------------ */
/* Utilitas bukti-baris sumber (untuk klaim statis)                    */
/* ------------------------------------------------------------------ */
function barisDengan(rel, needle, abaikanKomentar = false) {
  const abs = path.join(AKAR, rel);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readFileSync(abs, 'utf8')
    .split(/\r?\n/)
    .map((t, i) => {
      const p = t.trim();
      if (abaikanKomentar && (p.startsWith('*') || p.startsWith('//') || p.startsWith('/*') || p.startsWith('*/'))) return 0;
      return t.includes(needle) ? i + 1 : 0;
    })
    .filter((n) => n > 0);
}

/** Nomor baris keluaran tool: padStart sesuai lebar nomor terbesar -> `001| isi`. */
const BARIS_BERNOMOR = /^\d{1,}\| /m;

/* ================================================================== */
async function main() {
  /* Shim minimal supaya bundel CJS modul lapisan-app bisa di-require. */
  globalThis.self = globalThis;
  globalThis.window = globalThis;

  let m;
  try {
    m = await bangunBundel();
  } catch (e) {
    console.error('GAGAL bundel esbuild:', (e && e.message) || e);
    process.exit(1);
  }
  const AT = m.agentTools;
  const C = m.catalog;
  const ST = m.subsetTugas;
  const BK = m.bacaKode;
  const TG = m.toolGate;
  const S = m.store;

  const BATAS = ST.BATAS_TOOL_TUGAS;
  const NAMA_KATALOG = [...C.TOOL_NAMES];
  const NAMA_AGENT = AT.AGENT_TOOLS.map((t) => t.spec.name);
  const AKTIF = [...new Set([...C.TOOL_BAWAAN_AKTIF, ...C.TOOL_WEB_AKTIF_AWAL, 'zephyr_kode'])];

  console.log('== SAMBUNGAN BACA-KODE (node murni, offline, tanpa app) ==');
  console.log(`katalog: ${NAMA_KATALOG.length} tool | AGENT_TOOLS: ${NAMA_AGENT.length} | BATAS_TOOL_TUGAS=${BATAS}`);

  /* ================================================================ */
  grup('A. KATALOG + REGISTRY + SKEMA + EKSEKUTOR (runtime modul asli)');
  {
    cek(
      'zephyr_kode ADA di katalog (TOOL_NAMES runtime)',
      NAMA_KATALOG.includes('zephyr_kode'),
      `TOOL_NAMES.includes('zephyr_kode')=${NAMA_KATALOG.includes('zephyr_kode')}; baris catalog.ts: ${barisDengan('src/lib/zephyrTools/catalog.ts', "'zephyr_kode'").join(',') || '-'}`,
    );
    cek(
      'zephyr_kode ADA di registry AGENT_TOOLS (bisa di-resolve)',
      NAMA_AGENT.includes('zephyr_kode'),
      `AGENT_TOOLS(${NAMA_AGENT.length}) memuat=${NAMA_AGENT.includes('zephyr_kode')}`,
    );
    cek(
      'TIDAK ADA tool kembar: tepat SATU entri zephyr_kode di katalog & registry',
      NAMA_KATALOG.filter((n) => n === 'zephyr_kode').length === 1 &&
        NAMA_AGENT.filter((n) => n === 'zephyr_kode').length === 1,
      `katalog=${NAMA_KATALOG.filter((n) => n === 'zephyr_kode').length}; registry=${NAMA_AGENT.filter((n) => n === 'zephyr_kode').length}`,
    );

    const spec = BK.SPEC_BACA_KODE;
    cek(
      'SKEMA argumen lengkap (berkas/dari/sampai/simbol, required=[berkas])',
      !!spec?.parameters?.properties &&
        ['berkas', 'dari', 'sampai', 'simbol'].every((k) => k in spec.parameters.properties) &&
        spec.parameters.required.includes('berkas'),
      `props=${spec && spec.parameters && Object.keys(spec.parameters.properties).join(',')}; required=${JSON.stringify(spec?.parameters?.required)}`,
    );
    cek(
      'SPESIFIKASI yang dipakai registry = SPEC_BACA_KODE (satu skema, bukan kembar)',
      AT.AGENT_TOOLS.find((t) => t.spec.name === 'zephyr_kode').spec === BK.SPEC_BACA_KODE,
      `identik=${AT.AGENT_TOOLS.find((t) => t.spec.name === 'zephyr_kode').spec === BK.SPEC_BACA_KODE}`,
    );
    cek(
      'EKSEKUTOR nyata: run zephyr_kode === jalankanBacaKode (bukan fungsi kosong)',
      typeof AT.AGENT_TOOLS.find((t) => t.spec.name === 'zephyr_kode').run === 'function' &&
        AT.AGENT_TOOLS.find((t) => t.spec.name === 'zephyr_kode').run === BK.jalankanBacaKode,
      `run=${typeof AT.AGENT_TOOLS.find((t) => t.spec.name === 'zephyr_kode').run}; identik=${AT.AGENT_TOOLS.find((t) => t.spec.name === 'zephyr_kode').run === BK.jalankanBacaKode}`,
    );
  }

  /* ================================================================ */
  grup(`B. SUBSET KIRIM (jalur NYATA: pilihToolTugas, cap <= ${BATAS})`);
  let kirimBaca = [];
  let kirimTulis = [];
  {
    const tugasBaca = 'jelaskan cara kerja src/lib/bacaKode.ts lalu perbaiki kalau ada bug';
    kirimBaca = ST.pilihToolTugas(tugasBaca, AKTIF, true);
    kirimTulis = ST.pilihToolTugas('jalankan tes lalu commit', AKTIF, true);
    console.log(`  info: terkirim tugas "baca kode" = ${kirimBaca.length} tool -> ${kirimBaca.join(',')}`);
    console.log(`  info: terkirim tugas "tes+commit" = ${kirimTulis.length} tool`);
    cek(
      `pilihToolTugas() MENYERTAKAN zephyr_kode untuk tugas membaca kode (${kirimBaca.length} tool terkirim, cap ${BATAS})`,
      kirimBaca.includes('zephyr_kode'),
      `terkirim(${kirimBaca.length})=${kirimBaca.join(',')}`,
    );
    cek(
      `cap DIHORMATI: ${kirimBaca.length} <= ${BATAS}`,
      kirimBaca.length <= BATAS && kirimTulis.length <= BATAS,
      `baca=${kirimBaca.length}, tes=${kirimTulis.length}, cap=${BATAS}`,
    );
    cek(
      'tool inti tidak tersingkir oleh zephyr_kode (read_file/think/tool_call tetap ada)',
      ['read_file', 'think', 'tool_call', 'tool_search'].every((n) => kirimBaca.includes(n)),
      `terkirim=${kirimBaca.join(',')}`,
    );
    cek(
      'rumah keluarga navigasi-kode: zephyr_kode terdaftar sebagai rumah (cadangan terjangkau)',
      JSON.stringify(ST.keluargaTool('zephyr_kode')) === JSON.stringify(['navigasi-kode']) &&
        barisDengan('src/lib/subsetTugas.ts', "'navigasi-kode': ['lsp_definition'").length === 1 &&
        barisDengan('src/lib/subsetTugas.ts', "'navigasi-kode': ['lsp_definition'")[0] > 0 &&
        fs
          .readFileSync(path.join(AKAR, 'src/lib/subsetTugas.ts'), 'utf8')
          .split(/\r?\n/)
          [
            barisDengan('src/lib/subsetTugas.ts', "'navigasi-kode': ['lsp_definition'")[0] - 1
          ].includes("'zephyr_kode'"),
      `keluargaTool('zephyr_kode')=${JSON.stringify(ST.keluargaTool('zephyr_kode'))}; baris RUMAH=${barisDengan('src/lib/subsetTugas.ts', "'navigasi-kode': ['lsp_definition'").join(',')}`,
    );
    const j = ST.jejakPemilihan('jelaskan cara kerja src/lib/bacaKode.ts', AKTIF, true);
    cek(
      'jejakPemilihan() mencatat zephyr_kode sebagai "tambahan kelas" (asal-usul terlihat)',
      j.dikirim.includes('zephyr_kode') && JSON.stringify(j).includes('zephyr_kode'),
      `jejak.dikirim(${j.dikirim.length}) memuat=${j.dikirim.includes('zephyr_kode')}`,
    );
  }

  /* ================================================================ */
  grup('C. JEMBATAN: terpasang + terpanggil + membaca DISK NYATA');
  const berkasUji = 'src/lib/bacaKode.ts';
  let jawab1 = '';
  {
    cek(
      'sebelum ada pemanggilan: jembatan BELUM terpasang (bukan dipasang diam-diam saat impor)',
      BK.jembatanBacaKode() === null,
      `jembatanBacaKode()=${BK.jembatanBacaKode() === null ? 'null' : 'terpasang'}`,
    );
    cek(
      'tanpa workspace: tidak ada folder terbuka => jembatan TIDAK dipasang (tidak menebak akar)',
      AT.pasangJembatanBacaKodeDariWorkspace() === false && BK.jembatanBacaKode() === null,
      `workspace=${JSON.stringify(S.useStore.getState().workspace)}; dipasang=${AT.pasangJembatanBacaKodeDariWorkspace()}`,
    );

    /* Workspace dibuka seperti app: setState (di app = openFolder). */
    S.useStore.setState({ workspace: AKAR });
    /* Akar workspace untuk stub `fs_realpath` (di app: state Tauri). */
    globalThis.__ujiWorkspace = AKAR;
    TG.useToolGate.setState({ aktif: new Set([...TG.useToolGate.getState().aktif, 'zephyr_kode']) });

    /* Rantai nyata: jalankanAgentTool -> pasangJembatanBacaKodeDariWorkspace ->
       pasangJembatanBacaKode -> bacaBerkasKode -> fsRead (stub disk nyata). */
    jawab1 = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji, dari: 1, sampai: 5 });
    cek(
      'RANTAI NYATA: jalankanAgentTool(zephyr_kode) MEMASANG jembatan (sebelum: null, sesudah: terpasang)',
      BK.jembatanBacaKode() !== null && BK.jembatanBacaKode().akar === AKAR,
      `jembatan.akar=${JSON.stringify(BK.jembatanBacaKode()?.akar)}`,
    );
    cek(
      'jawaban menjawab dari DISK nyata: memuat BERKAS + RENTANG BARIS (bukan "belum tersambung")',
      jawab1.includes(berkasUji) && /:\d+-\d+/.test(jawab1) && !/belum tersambung/.test(jawab1),
      `jawaban(120 char)=${JSON.stringify(jawab1.slice(0, 120))}`,
    );
    /* Baris keluaran: `002| <teks-berkas apa adanya>`. Setelah membuang prefiks
       nomor, teksnya harus SAMA PERSIS dengan baris berkas di disk. */
    const isiNyata = fs.readFileSync(path.join(AKAR, berkasUji), 'utf8').split(/\r?\n/);
    const barisJawab = jawab1.split('\n').filter((l) => /^\d{1,}\| /.test(l));
    const isiJawab = barisJawab.map((l) => l.replace(/^\d{1,}\| /, ''));
    cek(
      'tiap baris jawaban bernomor + isinya IDENTIK dengan berkas di disk',
      barisJawab.length === 5 && isiJawab.every((t, i) => t === isiNyata[i]),
      `5 baris bernomor=${barisJawab.length}; cocok-semua=${isiJawab.every((t, i) => t === isiNyata[i])}; contoh jawab=${JSON.stringify(isiJawab[1])} vs disk=${JSON.stringify(isiNyata[1])}`,
    );
    const panggilanDisk = globalThis.__stubBaca || 0;
    cek(
      'disk benar-benar dibaca lewat jembatan aplikasi (fs_read nyata dipanggil)',
      panggilanDisk >= 1 && typeof globalThis.__stubStat === 'number',
      `fs_read=${panggilanDisk}; fs_stat=${globalThis.__stubStat || 0}`,
    );
    const viaSearch = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji, simbol: 'pasangJembatanBacaKode' });
    cek(
      'mode `simbol` juga jalan di jalur nyata: menyebut nama simbol + baris definisinya',
      viaSearch.includes('simbol pasangJembatanBacaKode@') && /\|\s*export function pasangJembatanBacaKode/.test(viaSearch),
      `jawaban(140 char)=${JSON.stringify(viaSearch.split('\n')[0]?.slice(0, 140))}`,
    );
    cek(
      'SETIAP jawaban menyebut berkas + baris (kepala [baca_kode] + baris bernomor)',
      [jawab1, viaSearch].every((t) => t.split('\n')[0].includes(berkasUji) && BARIS_BERNOMOR.test(t)),
      `kepala-1=${JSON.stringify(jawab1.split('\n')[0]?.slice(0, 90))}`,
    );
    cek(
      'tanpa folder terbuka (workspace null): jawaban jujur "belum tersambung", nol bacaan disk',
      await (async () => {
        BK.pasangJembatanBacaKode(null);
        S.useStore.setState({ workspace: null });
        globalThis.__ujiWorkspace = null;
        const t = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji });
        S.useStore.setState({ workspace: AKAR });
        globalThis.__ujiWorkspace = AKAR;
        return /belum tersambung/.test(t);
      })(),
      'dijalankan saat workspace=null',
    );
  }

  /* ================================================================ */
  grup('D. UJI NEGATIF BACA (gerbang `bolehDibacaKode` + jalur nyata)');
  {
    const tolak = [
      ['traversal ../', '../etc/passwd'],
      ['traversal bersarang', 'src/../../rahasia.ts'],
      ['absolut POSIX', '/etc/hosts'],
      ['absolut Windows', 'C:/Windows/win.ini'],
      ['berkas di LUAR akar repo (home user)', 'C:/Users/Zyrex/.ssh/id_rsa'],
      ['UNC', '\\\\srv\\share\\a.ts'],
      ['berkas rahasia .env', '.env'],
      ['berkas rahasia .env.*', 'config/.env.local'],
      ['kunci *.pem', 'server.pem'],
      ['kunci *.key', 'tls.key'],
      ['kunci privat id_rsa', 'id_rsa'],
      ['folder .ssh', '.ssh/id_rsa'],
      ['folder .git', '.git/config'],
      ['byte kontrol', 'src/lib/a\u0001b.ts'],
      ['daftar berkas (2 berkas/panggilan)', ['src/lib/a.ts', 'src/lib/b.ts']],
    ];
    for (const [nama, j] of tolak) {
      const h = BK.bolehDibacaKode(j);
      cek(`TOLAK ${nama} -> ${JSON.stringify(j)}`, h.ok === false, `hasil=${JSON.stringify(h)}`);
    }
    cek(
      'KONTROL: berkas kode sah di dalam repo DIIZINKAN',
      BK.bolehDibacaKode(berkasUji).ok === true,
      `hasil=${JSON.stringify(BK.bolehDibacaKode(berkasUji))}`,
    );

    /* Nol sentuhan disk saat ditolak + jalur NYATA juga menolak. */
    let sentuh = 0;
    const hitung = new Proxy(
      {
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
      {
        get(t, k) {
          if (typeof k === 'string' && !['then'].includes(k)) globalThis.__kunciDisentuh.push(String(k));
          return t[k];
        },
      },
    );
    globalThis.__kunciDisentuh = [];
    const hTolak = await BK.bacaBerkasKode({ berkas: '.env' }, { akar: AKAR, cmd: hitung });
    cek(
      'ditolak SEBELUM jembatan disentuh (jejak KOSONG, 0 sentuhan disk)',
      hTolak.ok === false && sentuh === 0 && hTolak.jejak.length === 0,
      `ok=${hTolak.ok}; sentuh=${sentuh}; jejak=${JSON.stringify(hTolak.jejak)}`,
    );

    /* realpath menunjuk KELUAR akar (simulasi symlink) -> pagar menolak. */
    const jembatanLuar = {
      akar: AKAR,
      cmd: {
        fsRead: async () => ({ content: 'x' }),
        fsStat: async () => ({ size: 1 }),
        realpath: async (p) => (String(p).includes('ok.ts') ? 'C:/Users/Zyrex/rahasia/ok.ts' : AKAR),
      },
    };
    const luar = await BK.bacaBerkasKode({ berkas: 'src/ok.ts' }, jembatanLuar);
    cek(
      'TOLAK berkas yang realpath-nya KELUAR akar repo (pagar symlink)',
      luar.ok === false && /KELUAR akar/.test(luar.alasan),
      `ok=${luar.ok}; alasan=${luar.alasan}`,
    );

    /* Lewat jalur NYATA: jalankanAgentTool juga menolak. */
    const jawabTolak = await AT.jalankanAgentTool('zephyr_kode', { berkas: '../../../etc/passwd' });
    cek(
      'jalur NYATA menolak traversal: jawaban diawali "ditolak:" (bukan isi berkas)',
      /^ditolak:/.test(jawabTolak) && !/@root/.test(jawabTolak),
      `jawaban=${JSON.stringify(jawabTolak.slice(0, 120))}`,
    );
  }

  /* ================================================================ */
  grup('E. KELUARAN DIPOTONG — ANGKANYA disebut');
  {
    const isi300 = Array.from({ length: 300 }, (_, i) => `baris ${i + 1}`).join('\n');
    const p1 = BK.bacaPotongan(isi300, 'src/x.ts', { dari: 1, sampai: 300 });
    cek(
      `batas BARIS: minta 300 baris -> dikirim ${BK.BATAS_BARIS_POTONGAN} baris (sebabPotong=${p1.ok ? p1.potongan.sebabPotong : p1.alasan})`,
      p1.ok && p1.potongan.baris.length === BK.BATAS_BARIS_POTONGAN && p1.potongan.sebabPotong === 'batas-baris' &&
        BK.rakitPotongan(p1.potongan).includes(`batas ${BK.BATAS_BARIS_POTONGAN} baris/pembacaan`),
      `BATAS_BARIS_POTONGAN=${BK.BATAS_BARIS_POTONGAN}; dikirim=${p1.ok ? p1.potongan.baris.length : 0}`,
    );
    const barisPanjang = 'x'.repeat(BK.BATAS_KARAKTER_BARIS + 120);
    const p2 = BK.bacaPotongan(`${barisPanjang}\npendek`, 'src/x.ts', { dari: 1, sampai: 2 });
    cek(
      `batas KARAKTER/BARIS: baris ${barisPanjang.length} char dipangkas ke ~${BK.BATAS_KARAKTER_BARIS} + dilaporkan`,
      p2.ok && p2.potongan.dipangkas.includes(1) && p2.potongan.baris[0].length <= BK.BATAS_KARAKTER_BARIS &&
        BK.rakitPotongan(p2.potongan).includes(`dipangkas pada ${BK.BATAS_KARAKTER_BARIS} karakter`),
      `BATAS_KARAKTER_BARIS=${BK.BATAS_KARAKTER_BARIS}; panjang-1=${p2.ok ? p2.potongan.baris[0].length : '-'}; dipangkas=${p2.ok ? JSON.stringify(p2.potongan.dipangkas) : '-'}`,
    );
    const isiGemuk = Array.from({ length: 200 }, () => 'y'.repeat(200)).join('\n');
    const p3 = BK.bacaPotongan(isiGemuk, 'src/x.ts', { dari: 1, sampai: 200 });
    cek(
      `batas ANGGARAN KARAKTER: potongan dijaga ~${BK.BATAS_CHAR_POTONGAN} char (sebabPotong=${p3.ok ? p3.potongan.sebabPotong : p3.alasan})`,
      p3.ok && p3.potongan.sebabPotong === 'batas-karakter' &&
        BK.rakitPotongan(p3.potongan).includes(`batas ${BK.angkaTitik(BK.BATAS_CHAR_POTONGAN)} karakter/pembacaan`),
      `BATAS_CHAR_POTONGAN=${BK.BATAS_CHAR_POTONGAN}; baris terkirim=${p3.ok ? p3.potongan.baris.length : '-'}`,
    );
    const cmd = {
      fsRead: async () => ({ content: 'a' }),
      fsStat: async (p) => ({ size: String(p).includes('besar.ts') ? BK.BATAS_BYTE_BERKAS + 1 : 3 }),
      realpath: async (p) => p,
    };
    const besar = await BK.bacaBerkasKode({ berkas: 'src/besar.ts' }, { akar: AKAR, cmd });
    cek(
      `batas UKURAN BERKAS: ${BK.BATAS_BYTE_BERKAS} B (${BK.BATAS_BYTE_BERKAS / 1024} KiB) ditolak dengan angkanya`,
      besar.ok === false && besar.alasan.includes(BK.angkaTitik(BK.BATAS_BYTE_BERKAS)) && /512 KiB/.test(besar.alasan),
      `alasan=${besar.alasan}`,
    );
    const anggaran = BK.buatAnggaranBaca();
    let ditolakSesi = '';
    for (let i = 0; i < BK.BATAS_BACAAN_SESI + 1; i++) {
      const r = await BK.bacaBerkasKode({ berkas: `src/f${i}.ts` }, { akar: AKAR, cmd }, anggaran);
      if (!r.ok && /anggaran pembacaan sesi habis/.test(r.alasan)) ditolakSesi = r.alasan;
    }
    cek(
      `ANGGARAN SESI: pembacaan ke-${BK.BATAS_BACAAN_SESI + 1} ditolak dengan angka batasnya`,
      ditolakSesi.includes(String(BK.BATAS_BACAAN_SESI)) && /anggaran pembacaan sesi habis/.test(ditolakSesi),
      `BATAS_BACAAN_SESI=${BK.BATAS_BACAAN_SESI}; alasan=${ditolakSesi || 'TIDAK ADA PENOLAKAN'}`,
    );
    cek(
      `batas BERKAS/PANGGILAN = ${BK.BATAS_BERKAS_PER_PANGGILAN} (daftar berkas ditolak, bukan diproses sebagian)`,
      BK.BATAS_BERKAS_PER_PANGGILAN === 1 && BK.bolehDibacaKode(['a.ts']).alasan.includes('1 berkas per panggilan'),
      `alasan=${BK.bolehDibacaKode(['a.ts']).alasan}`,
    );
  }

  /* ================================================================ */
  grup('F. NOL JALUR TULIS');
  {
    const kunci = [...new Set(globalThis.__kunciDisentuh || [])].sort();
    cek(
      'jembatan hanya menyentuh fsRead/fsStat/realpath (Proxy mencatat SEMUA akses properti)',
      kunci.every((k) => ['fsRead', 'fsStat', 'realpath'].includes(k)),
      `kunci yang benar-benar disentuh=${JSON.stringify(kunci)}`,
    );
    const F_SRC = 'src/lib/bacaKode.ts';
    const apiTulis = ['fsWrite', 'fsDelete', 'fsRename', 'fsCreateFile', 'fsCreateDir', 'child_process', 'execSync', 'spawn(', 'writeFileSync', 'invoke('];
    /* Abaikan baris komentar: komentar justru MENYATAKAN tidak ada kemampuan
       tulis (bacaKode.ts:55), jadi ia bukan pemanggilan. */
    const hit = apiTulis.filter((a) => barisDengan(F_SRC, a, true).length > 0);
    cek(
      'bacaKode.ts tidak memanggil API tulis/shell apa pun',
      hit.length === 0,
      `hit=${hit.join(',') || 'TIDAK ADA'} di ${F_SRC}`,
    );
    const kunciJembatan = Object.keys(BK.TOOL_BACA_KODE).sort().join(',');
    cek(
      'permukaan tool = {spec, run} saja (tidak ada kanal tulis yang bocor ke model)',
      kunciJembatan === 'run,spec',
      `kunci=${kunciJembatan}`,
    );
    cek(
      'jembatan aplikasi hanya boleh {akar, cmd:{fsRead,fsStat,realpath}} (diperiksa bacaKode)',
      await (async () => {
        const h = await BK.bacaBerkasKode({ berkas: berkasUji }, { akar: AKAR, cmd: { fsRead: async () => ({ content: 'x' }) } });
        return h.ok === false && /jembatan berkas belum lengkap/.test(h.alasan);
      })(),
      'cmd tanpa fsStat/realpath ditolak',
    );
  }

  /* ================================================================ */
  grup('G. DETERMINISME (2 jalan identik)');
  {
    const a1 = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji, dari: 100, sampai: 110 });
    const a2 = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji, dari: 100, sampai: 110 });
    cek('jawaban tool identik dua kali (byte-for-byte)', a1 === a2, `panjang ${a1.length} vs ${a2.length}`);
    const k1 = ST.pilihToolTugas('jelaskan cara kerja src/lib/bacaKode.ts', AKTIF, true).join(',');
    const k2 = ST.pilihToolTugas('jelaskan cara kerja src/lib/bacaKode.ts', AKTIF, true).join(',');
    cek('pilihToolTugas() identik dua kali', k1 === k2, `${k1.slice(0, 80)} != ${k2.slice(0, 80)}`);
    const g1 = JSON.stringify(BK.bolehDibacaKode('../x.ts'));
    const g2 = JSON.stringify(BK.bolehDibacaKode('../x.ts'));
    cek('gerbang jalur deterministik', g1 === g2, `${g1} != ${g2}`);
  }

  /* ================================================================ */
  grup('H. REALPATH SUNGGUHAN (perintah `fs_realpath` + tautan NYATA di disk)');
  {
    /* Provider realpath = yang disuntikkan `src/lib/commands.ts` saat bundel
       dimuat (rantai impor nyata). Kalau ini null, jalur tool masih memakai
       realpath identitas seperti sebelum perbaikan. */
    const terpasang = BK.realpathBacaKode();
    const SUMBER_COMMANDS = fs.readFileSync(path.join(AKAR, 'src', 'lib', 'commands.ts'), 'utf8');
    const nyata = (p) =>
      typeof terpasang === 'function' ? terpasang(String(p)) : Promise.reject(new Error('realpath tidak terpasang'));

    cek(
      'H1 realpath SUNGGUHAN terpasang lewat rantai impor (commands.ts -> pasangRealpathBacaKode -> fsRealpath)',
      typeof terpasang === 'function' &&
        /import \{ pasangRealpathBacaKode \} from '\.\/bacaKode'/.test(SUMBER_COMMANDS) &&
        /pasangRealpathBacaKode\(\(path\) => fsRealpath\(path\)\)/.test(SUMBER_COMMANDS) &&
        /invoke<string>\('fs_realpath'/.test(SUMBER_COMMANDS),
      `typeof realpathBacaKode()=${typeof terpasang}; penyambungan di commands.ts ada=${/pasangRealpathBacaKode\(\(path\) => fsRealpath\(path\)\)/.test(SUMBER_COMMANDS)}`,
    );

    /* -- Tautan NYATA di disk (junction: tidak butuh hak istimewa di Windows).
          `keluar` -> folder sementara DI LUAR akar repo; `dalam` -> src/lib.
          Penghapusan tautan memakai rmdir/unlink (TIDAK rekursif) supaya
          sasaran tautan tidak pernah tersentuh. */
    const TAUTAN = path.join(AKAR, 'node_modules', '.cache', 'zephyr-realpath-uji');
    fs.mkdirSync(TAUTAN, { recursive: true });
    const LUAR = fs.mkdtempSync(path.join(os.tmpdir(), 'zephyr-luar-akar-'));
    const PENANDA = 'PENANDA_BOCOR_DI_LUAR_AKAR_REPO';
    fs.writeFileSync(path.join(LUAR, 'bocor.ts'), `// ${PENANDA}\nexport const bocor = 1;\n`, 'utf8');
    const TAUTAN_KELUAR = path.join(TAUTAN, 'keluar');
    const TAUTAN_DALAM = path.join(TAUTAN, 'dalam');
    const lepasTautan = (link) => {
      try { fs.rmdirSync(link); return 'rmdir'; } catch (e) { /* lanjut */ }
      try { fs.unlinkSync(link); return 'unlink'; } catch (e) { return 'GAGAL: ' + e.message; }
    };
    lepasTautan(TAUTAN_KELUAR);
    lepasTautan(TAUTAN_DALAM);
    const relDari = (abs) => path.relative(AKAR, abs).split(path.sep).join('/');
    const cobaTautan = (target, link) => {
      try { fs.symlinkSync(target, link, 'junction'); return true; } catch (e) { return String(e.message); }
    };
    const okKeluar = cobaTautan(LUAR, TAUTAN_KELUAR);
    const okDalam = cobaTautan(path.join(AKAR, 'src', 'lib'), TAUTAN_DALAM);
    const REL_KELUAR = relDari(path.join(TAUTAN_KELUAR, 'bocor.ts'));
    const REL_DALAM = relDari(path.join(TAUTAN_DALAM, 'konteksRepo.ts'));

    cek(
      'H2 tautan uji NYATA dibuat di disk (junction keluar akar + junction ke src/lib)',
      okKeluar === true && okDalam === true,
      `keluar=${REL_KELUAR} (${okKeluar}); dalam=${REL_DALAM} (${okDalam})`,
    );

    const cmdNyata = {
      fsRead: async (p) => ({ content: fs.readFileSync(String(p), 'utf8') }),
      fsStat: async (p) => { const st = fs.statSync(String(p)); return { size: st.size, isDir: st.isDirectory() }; },
      realpath: (p) => nyata(p),
    };

    /* -- realpath nyata DIPAKAI jalur tool + membaca disk. */
    const rSebelum = globalThis.__stubRealpath || 0;
    const jNyata = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji, dari: 1, sampai: 3 });
    const rSesudah = globalThis.__stubRealpath || 0;
    cek(
      'H3 jalur TOOL memakai perintah `fs_realpath` NYATA (invoke dipanggil) + isi disk nyata',
      /:\d+-\d+/.test(jNyata) && jNyata.includes(berkasUji) && rSesudah > rSebelum,
      `fs_realpath dipanggil ${rSesudah - rSebelum}x; jawaban=${JSON.stringify(jNyata.slice(0, 90))}`,
    );

    /* -- Bentuk KANONIK: masukan kotor diselesaikan perintah, dipakai pagar. */
    const kotor = `${AKAR}/./src/lib/../lib/bacaKode.ts`;
    const kanon = await nyata(kotor);
    const harap = `${fs.realpathSync.native(AKAR).split(path.sep).join('/')}/src/lib/bacaKode.ts`.toLowerCase();
    const hKanon = await BK.bacaBerkasKode({ berkas: berkasUji }, { akar: AKAR, cmd: cmdNyata });
    cek(
      'H4 jalur KANONIK yang dipakai pagar/laporan (masukan ../. diselesaikan, bukan diteruskan apa adanya)',
      String(kanon).split(path.sep).join('/').toLowerCase() === harap &&
        String(kanon) !== kotor &&
        hKanon.ok === true &&
        hKanon.jejak.includes('realpath(akar)') &&
        hKanon.jejak.some((x) => /^realpath\(.+\)$/.test(String(x))),
      `masuk=${kotor} -> ${kanon} (bedasarkan masukan=${String(kanon) !== kotor}); jejak=${hKanon.jejak.join(' | ')}`,
    );

    /* -- Tautan nyata yang menunjuk KELUAR akar: DITOLAK (perintah + tool). */
    let pesanPerintah = '';
    try { pesanPerintah = `LOLOS -> ${await nyata(path.join(AKAR, REL_KELUAR))}`; }
    catch (e) { pesanPerintah = String(e && e.message ? e.message : e); }
    cek(
      'H5 perintah `fs_realpath` MENOLAK tautan nyata yang menunjuk KELUAR akar (junction sungguhan di disk)',
      /keluar akar workspace/.test(pesanPerintah) && !/^LOLOS/.test(pesanPerintah),
      `pesan=${JSON.stringify(pesanPerintah)}; tautan=${REL_KELUAR} -> ${LUAR}`,
    );

    const rDua = globalThis.__stubRealpath || 0;
    const jKeluar = await AT.jalankanAgentTool('zephyr_kode', { berkas: REL_KELUAR });
    cek(
      'H6 jalur TOOL menolak tautan keluar akar: diawali "ditolak:", isi LUAR tidak bocor ke jawaban',
      /^ditolak:/.test(jKeluar) && !jKeluar.includes(PENANDA) && !jKeluar.includes('bocor = 1'),
      `fs_realpath dipanggil ${(globalThis.__stubRealpath || 0) - rDua}x; jawaban=${JSON.stringify(jKeluar.slice(0, 130))}`,
    );

    /* Pagar bacaKode tetap menolak kalau realpath MENGEMBALIKAN (bukan
       melempar) jalur luar - pengganti perintah Rust yang berubah kelak. */
    BK.pasangRealpathBacaKode(async (p) =>
      String(p).includes('/keluar/') ? path.join(LUAR, 'bocor.ts') : fs.realpathSync.native(String(p)),
    );
    const jBohong = await AT.jalankanAgentTool('zephyr_kode', { berkas: REL_KELUAR });
    BK.pasangRealpathBacaKode(nyata);
    cek(
      'H7 pagar bacaKode menolak kalau realpath MENGEMBALIKAN jalur luar (bukan melempar)',
      /KELUAR akar repo/.test(jBohong) && !jBohong.includes(PENANDA),
      `jawaban=${JSON.stringify(jBohong.slice(0, 150))}`,
    );

    /* -- Tautan nyata yang masih DI DALAM akar: DITERIMA, isinya = disk. */
    const jDalam = await AT.jalankanAgentTool('zephyr_kode', { berkas: REL_DALAM, dari: 1, sampai: 3 });
    const asli = fs.readFileSync(path.join(AKAR, 'src', 'lib', 'konteksRepo.ts'), 'utf8').split(/\r?\n/);
    const barisDalam = jDalam
      .split('\n')
      .map((l) => (l.match(/^\s*(\d+)\s*\|\s?(.*)$/) || [])[2])
      .filter((x) => typeof x === 'string');
    cek(
      'H8 tautan nyata yang masih DI DALAM akar DITERIMA: tiap baris = berkas asli di disk',
      /:\d+-\d+/.test(jDalam) && barisDalam.length >= 1 && barisDalam.every((t, i) => t === asli[i]),
      `jawaban=${JSON.stringify(jDalam.slice(0, 90))}; baris cocok=${barisDalam.filter((t, i) => t === asli[i]).length}/${barisDalam.length}`,
    );

    /* -- FAIL-CLOSED: perintah tidak ada di backend (persis stub LAMA). */
    BK.pasangRealpathBacaKode(async () => { throw new Error('stub uji: perintah Tauri tidak dikenal: fs_realpath'); });
    const b1 = globalThis.__stubBaca || 0;
    const jTanpa = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji });
    const b2 = globalThis.__stubBaca || 0;
    BK.pasangRealpathBacaKode(nyata);
    cek(
      'H9 FAIL-CLOSED: perintah `fs_realpath` tidak ada di backend => jalur tool MENOLAK, nol bacaan berkas',
      /^ditolak:/.test(jTanpa) && /realpath/.test(jTanpa) && b2 === b1,
      `jawaban=${JSON.stringify(jTanpa.slice(0, 130))}; fs_read ${b1}->${b2}`,
    );

    /* -- FAIL-CLOSED: realpath identitas disuntikkan (bentuk lama). */
    BK.pasangRealpathBacaKode(async (p) => String(p));
    const b3 = globalThis.__stubBaca || 0;
    const jId = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji });
    const b4 = globalThis.__stubBaca || 0;
    BK.pasangRealpathBacaKode(nyata);
    cek(
      'H10 FAIL-CLOSED: realpath identitas (bentuk lama agenTools) TIDAK dipakai - jalur tool menolak',
      /^ditolak:/.test(jId) && b4 === b3,
      `jawaban=${JSON.stringify(jId.slice(0, 130))}; fs_read ${b3}->${b4}`,
    );

    /* -- FAIL-CLOSED: tidak ada akar workspace di backend. */
    const wsSimpan = globalThis.__ujiWorkspace;
    globalThis.__ujiWorkspace = null;
    const b5 = globalThis.__stubBaca || 0;
    const jAkarNull = await AT.jalankanAgentTool('zephyr_kode', { berkas: berkasUji });
    const b6 = globalThis.__stubBaca || 0;
    globalThis.__ujiWorkspace = wsSimpan;
    cek(
      'H11 tanpa akar workspace perintah menolak (fail-closed) => jalur tool menolak, nol bacaan',
      /^ditolak:/.test(jAkarNull) && b6 === b5,
      `jawaban=${JSON.stringify(jAkarNull.slice(0, 130))}; fs_read ${b5}->${b6}`,
    );

    /* -- DETERMINISME 2x pada jalur realpath (diterima + ditolak). */
    const d1 = await AT.jalankanAgentTool('zephyr_kode', { berkas: REL_DALAM, dari: 1, sampai: 3 });
    const d2 = await AT.jalankanAgentTool('zephyr_kode', { berkas: REL_DALAM, dari: 1, sampai: 3 });
    const t1 = await AT.jalankanAgentTool('zephyr_kode', { berkas: REL_KELUAR });
    const t2 = await AT.jalankanAgentTool('zephyr_kode', { berkas: REL_KELUAR });
    cek(
      'H12 determinisme jalur realpath: jawaban diterima + penolakan tautan identik 2x (byte-for-byte)',
      d1 === d2 && t1 === t2 && d1.length > 0 && /^ditolak:/.test(t1),
      `diterima ${d1.length}/${d2.length}; ditolak ${t1.length}/${t2.length}`,
    );

    /* -- Bersihkan artefak uji (tanpa menyentuh sasaran tautan). */
    const lepasKeluar = lepasTautan(TAUTAN_KELUAR);
    const lepasDalam = lepasTautan(TAUTAN_DALAM);
    try { fs.rmSync(LUAR, { recursive: true, force: true }); } catch (e) { /* dibiarkan */ }
    cek(
      'H13 artefak uji dibersihkan (tautan + folder luar akar hilang dari disk)',
      !fs.existsSync(TAUTAN_KELUAR) && !fs.existsSync(TAUTAN_DALAM) && !fs.existsSync(LUAR),
      `lepas keluar=${lepasKeluar} dalam=${lepasDalam}; sisa keluar=${fs.existsSync(TAUTAN_KELUAR)} dalam=${fs.existsSync(TAUTAN_DALAM)} luar=${fs.existsSync(LUAR)}`,
    );
  }

  /* ================================================================ */
  const total = lulus + gagal.length;
  console.log(`\n== ${lulus}/${total} lulus ==`);
  if (gagal.length) {
    for (const g of gagal) console.log(`  GAGAL: ${g}`);
    console.log('(harness ini punya exit 1 karena ada kasus merah di atas)');
    process.exit(1);
  }
  console.log('SEMUA LULUS.');
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR tak terduga:', e);
  process.exit(1);
});
