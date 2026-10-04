/**
 * verify-katalog-mcp.mjs - kunci katalog pada angka dan nama yang tepat.
 *
 *   node scripts/verify-katalog-mcp.mjs
 *
 * Verifikasi ini MEMBACA KATALOG SUNGGUHAN, bukan salinan nama di dalam uji.
 * Itu bedanya penting: uji yang menyalin daftar akan tetap lulus walaupun
 * katalognya berubah, jadi ia mengunci kesalahan alih-alih mencegahnya.
 *
 * Kontrak yang dikunci:
 *   tool INTI (bawaan + MCP)  - terpasang DAN aktif sejak awal
 *   11 tool web/browser       - terpasang, TAPI mati sampai dinyalakan
 *   total = inti + web
 *
 * Angka-angkanya TIDAK dipatok di sini. Versi lama mematok 26/14/40/51 dan
 * harus disunting setiap kali satu tool ditambahkan - dan pada akhirnya ia
 * menolak keadaan yang benar: menambah `suggest_command` gagal di sini padahal
 * katalognya sehat. Yang diperiksa sekarang adalah HUBUNGAN antar-angka itu,
 * yang tetap benar berapa pun jumlah toolnya.
 *
 * Nama protokol tool MCP adalah `mcp__zephyr__`, dan awalan versi lama
 * DIANGGAP SALAH sampai dibuang total: bagian 8 memindai seluruh `src/` dan
 * gagal begitu ada awalan `mcp__<x>__` selain yang itu. Tanpa pemeriksaan itu
 * harness ini akan tetap hijau di tengah rename yang belum selesai.
 *
 * Sumber nama bawaan bukan lagi folder referensi yang sudah dihapus, melainkan
 * handler Zephyr sendiri, supaya berkas ini tidak bisa lulus palsu saat
 * referensinya hilang - dulu ia menemukan nol nama dan tetap melaporkan lulus.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(AKAR, 'src', 'lib', 'zephyrTools');

/* Awalan protokol yang WAJIB dipakai tool MCP. Tidak ada lagi yang lain. */
const PREFIX_MCP = 'mcp__zephyr__';

/* Awalan yang sudah dipensiunkan. Bukan nama yang boleh ditawarkan ke model,
   hanya INPUT yang harus diterima: sesi yang dilanjutkan, checkpoint, dan
   setelan tool tersimpan masih membawanya. Lihat bagian 8 untuk alasannya. */
const PREFIX_RETIRED = 'mcp__tedi__';

/* Berkas yang boleh menyebut awalan retired, dan alasannya. Di luar daftar ini
   kemunculannya berarti nama lama masih bocor ke tempat yang tidak perlu. */
const COMPAT_FILES = new Set([
  'src/lib/agentTools.ts',
  'src/lib/subagentStore.ts',
  'src/lib/zephyrTools/catalog.ts',
  'src/lib/zephyrTools/deskripsiTool.ts',
  // Ikon tool: setelan tool tersimpan di disk bisa masih membawa nama retired,
  // jadi pencarian ikon harus tetap menyelesaikannya, bukan jatuh ke ikon generik.
  'src/components/settings/AlatIkon.tsx',
]);

/* Berkas yang MEMBANGUN nama tool. Di sini awalan retired tidak boleh muncul
   sama sekali, bahkan di dalam penjelasan: di titik inilah nama jadi
   ditawarkan ke model. */
const NAME_BUILDERS = ['src/lib/zephyrTools/catalog.ts', 'src/lib/zephyrTools/mcp.ts'];

/* Tool web/browser yang harus ada tapi tidak boleh menyala sendiri. Ditulis
   tangan: daftar ini mewakili keputusan produk, bukan turunan kode. */
const WEB_NAMA = [
  'web_search', 'web_fetch', 'browser_open', 'browser_read', 'browser_click',
  'browser_type', 'browser_nav', 'browser_list', 'browser_close',
  'browser_download_url', 'system_browser_open',
];

let lulus = 0;
let gagal = 0;
function periksa(nama, syarat, rincian) {
  if (syarat) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    console.log('  GAGAL  ' + nama + (rincian ? '  -> ' + JSON.stringify(rincian) : ''));
  }
}

/* ------------------------------------------------------------------ */
/* Baca nama BAWAAN langsung dari sumber - jangan diketik ulang.       */
/* ------------------------------------------------------------------ */

/*
 * Nama bawaan dibaca dari `builtins.ts` HARUS cocok dengan katalog. Kalau satu
 * tool ditambahkan ke katalog tanpa handler (atau sebaliknya), di situlah
 * ketahuannya - dan itu lebih berguna daripada sekadar mencocokkan angka.
 */
const isiBawaan = readFileSync(join(REF, 'builtins.ts'), 'utf8');
const bawaanSumber = [];
for (const m of isiBawaan.matchAll(/^ {6}name: '([a-z_]+)',/gm)) bawaanSumber.push(m[1]);
if (bawaanSumber.length === 0) {
  console.error('FATAL: tidak menemukan nama tool di builtins.ts.');
  console.error('Nol nama membuat setiap pemeriksaan lulus palsu; berhenti di sini.');
  process.exit(1);
}

/* Nama MCP dari handler Zephyr sendiri (`src/lib/zephyrTools/mcp.ts`). */
const mcpIsi = readFileSync(join(REF, 'mcp.ts'), 'utf8');
const mcpSumber = [];
for (const m of mcpIsi.matchAll(new RegExp("name: '" + PREFIX_MCP + "([a-z_]+)'", 'g'))) mcpSumber.push(m[1]);
if (mcpSumber.length === 0) {
  console.error('FATAL: nama tool MCP tidak ditemukan di mcp.ts.');
  console.error('Menemukan nol tool diam-diam akan membuat setiap pemeriksaan lulus palsu.');
  process.exit(1);
}

/*
 * Semua awalan protokol yang masih hidup di SELURUH `src/`, berikut berkas
 * tempat ia ditemukan.
 *
 * Sifatnya sengaja umum: pola `mcp__<x>__` menangkap awalan apa pun, jadi
 * pemeriksaan ini tidak bergantung pada menuliskan nama lama secara harfiah -
 * dan berkas harness ini sendiri pun tidak ikut memuat kata yang sedang
 * dibuang dari repo. Yang diperiksa nanti bukan "adanya x", melainkan apakah
 * himpunan awalan itu hanya berisi PREFIX_MCP.
 */
function pindaiAwalan(dir) {
  const ketemu = new Map();
  const tumpukan = [dir];
  while (tumpukan.length) {
    const d = tumpukan.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        tumpukan.push(p);
        continue;
      }
      if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/\bmcp__[a-z0-9]+__/g)) {
        if (!ketemu.has(m[0])) ketemu.set(m[0], new Set());
        ketemu.get(m[0]).add(relative(AKAR, p));
      }
    }
  }
  return ketemu;
}

/* ------------------------------------------------------------------ */
/* Muat katalog dengan esbuild.                                       */
/* ------------------------------------------------------------------ */

const { buildSync } = await import('esbuild');
const sementara = join(AKAR, 'node_modules', '.cache', 'verify-catalog.mjs');
await (await import('node:fs/promises')).mkdir(dirname(sementara), { recursive: true });

/*
 * `self` harus ada SEBELUM bundel dimuat.
 *
 * `catalog.ts` kini menarik `deskripsiTool.ts`, dan rantai impor di sekitarnya
 * menyentuh `terminalStore` -> `xtermRegistry` -> `@xterm/addon-fit`. xterm
 * menganggap dirinya berjalan di browser dan menyentuh `self` saat dimuat,
 * sehingga bundel ini GAGAL TOTAL di Node - dan itu muncul sebagai
 * "FATAL: katalog tidak bisa dimuat", bukan sebagai kegagalan pemeriksaan.
 *
 * Penyebabnya bukan katalognya: katalog tetap murni data. Yang berubah adalah
 * panjang rantai impornya. Ditemukan hanya karena harness ini dijalankan lagi
 * setelah perubahan itu, bukan karena ada yang menyentuh berkasnya.
 *
 * xterm tidak pernah dipakai di sini - yang diperiksa hanya DAFTAR nama.
 */
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ style: {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild() {}, removeChild() {} },
    documentElement: { style: {} },
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

buildSync({
  entryPoints: [join(AKAR, 'src', 'lib', 'zephyrTools', 'catalog.ts')],
  outfile: sementara,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  define: {
    'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'production' }),
  },
});

let katalog;
try {
  const mod = await import(pathToFileURL(sementara).href);
  katalog = {
    names: mod.TOOL_CATALOG.map((t) => t.name),
    counts: mod.TOOL_COUNTS,
    masalah: mod.periksaKatalog(),
    aktif: [...mod.TOOL_BAWAAN_AKTIF],
    inti: [...mod.TOOL_INTI],
  };
} catch (e) {
  console.error('FATAL: katalog tidak bisa dimuat. Pesan:');
  console.error(String(e.stack || e.message).slice(0, 1200));
  process.exit(1);
}

const nama = katalog.names;

/* ------------------------------------------------------------------ */

console.log('\n== 1. Jumlah ==');
periksa('11 tool web/browser', katalog.counts.web === 11, { dapat: katalog.counts.web });
periksa('inti = bawaan + MCP', katalog.counts.inti === katalog.counts.builtin + katalog.counts.mcp, {
  inti: katalog.counts.inti,
  bawaan: katalog.counts.builtin,
  mcp: katalog.counts.mcp,
});
periksa('total = inti + web', katalog.counts.total === katalog.counts.inti + katalog.counts.web, {
  total: katalog.counts.total,
  inti: katalog.counts.inti,
  web: katalog.counts.web,
});
periksa('bawaan di katalog = bawaan berhandler', katalog.counts.builtin === bawaanSumber.length, {
  katalog: katalog.counts.builtin,
  handler: bawaanSumber.length,
});
periksa('tidak ada nama ganda', new Set(nama).size === nama.length, {
  ganda: nama.filter((n, i) => nama.indexOf(n) !== i),
});

console.log('\n== 2. Nama bawaan sama persis dengan handler ==');
{
  const diharapkan = [...bawaanSumber].sort();
  const dapat = nama.filter((n) => !n.startsWith('mcp__') && !WEB_NAMA.includes(n)).sort();
  periksa(`jumlah nama bawaan cocok (${bawaanSumber.length})`, dapat.length === diharapkan.length, {
    diharapkan: diharapkan.length,
    dapat: dapat.length,
  });
  periksa('tidak ada nama bawaan yang hilang', diharapkan.every((n) => dapat.includes(n)), {
    hilang: diharapkan.filter((n) => !dapat.includes(n)),
  });
  periksa('tidak ada nama bawaan tambahan', dapat.every((n) => diharapkan.includes(n)), {
    lebih: dapat.filter((n) => !diharapkan.includes(n)),
  });
}

console.log('\n== 3. Nama MCP sama persis dengan tabel handler ==');
{
  const diharapkan = mcpSumber.map((n) => PREFIX_MCP + n).sort();
  const dapat = nama.filter((n) => n.startsWith(PREFIX_MCP)).sort();
  periksa(`jumlah nama MCP cocok (${mcpSumber.length})`, dapat.length === diharapkan.length, {
    diharapkan: diharapkan.length,
    dapat: dapat.length,
  });
  periksa('daftar nama MCP identik', JSON.stringify(dapat) === JSON.stringify(diharapkan), {
    hilang: diharapkan.filter((n) => !dapat.includes(n)),
    lebih: dapat.filter((n) => !diharapkan.includes(n)),
  });
/* Katalog hanya boleh memuat AWALAN yang sah. Nama berawalan protokol lain
     apa pun di dalamnya adalah sisa rename, bukan tool baru. */
  const asing = nama.filter((n) => n.startsWith('mcp__') && !n.startsWith(PREFIX_MCP));
  periksa(`semua nama protokol berawalan ${PREFIX_MCP}`, asing.length === 0, { asing });
}

console.log('\n== 4. Tool web/browser terpasang ==');
for (const n of WEB_NAMA) periksa('ada: ' + n, nama.includes(n));

console.log('\n== 5. Kontrak inti ==');
periksa('TOOL_INTI = bawaan + MCP', katalog.inti.length === bawaanSumber.length + mcpSumber.length, {
  inti: katalog.inti.length,
  harap: bawaanSumber.length + mcpSumber.length,
});
periksa('TOOL_INTI tidak memuat nama web', !katalog.inti.some((n) => WEB_NAMA.includes(n)), {
  bocor: katalog.inti.filter((n) => WEB_NAMA.includes(n)),
});
{
  /* Yang paling penting: default aktif harus UTUH, bukan sebagian. */
  const kurang = katalog.inti.filter((n) => !katalog.aktif.includes(n));
  periksa('SEMUA tool inti aktif sejak awal', kurang.length === 0, { kurang });
}
{
  /* Dan tidak satu pun tool web boleh menyala sendiri. */
  const bocor = katalog.aktif.filter((n) => WEB_NAMA.includes(n));
  periksa('TIDAK ADA tool web yang menyala default', bocor.length === 0, { bocor });
}

console.log('\n== 6. Nama tool lama sudah tidak ada ==');
const LAMA = [
  'file_read', 'file_list', 'file_write', 'file_edit', 'file_patch', 'file_delete',
  'file_move', 'file_copy', 'dir_create', 'editor_read', 'editor_write', 'editor_save',
  'shell_exec', 'terminal_exec', 'terminal_read', 'terminal_wait', 'terminal_kill',
  'list_panes', 'get_problems', 'get_output', 'start_server', 'server_status', 'server_stop',
  'run_tests', 'run_task', 'cron_create', 'cron_list', 'cron_delete', 'memory_read',
  'memory_write', 'subagent_list', 'subagent_run', 'skill_list', 'skill_view',
  'skill_write', 'skill_delete', 'mcp_call', 'read_image', 'task_complete', 'plan_mode',
  'screenshot_ui', 'schedule_task', 'wait_terminal',
];
const tersisa = LAMA.filter((n) => nama.includes(n));
periksa('tidak ada nama lama yang ikut', tersisa.length === 0, { tersisa });

console.log('\n== 7. Katalog memeriksa dirinya sendiri ==');
periksa('periksaKatalog() bersih', katalog.masalah.length === 0, { masalah: katalog.masalah });

/*
 * Sisa awalan lama di SELURUH `src/`.
 *
 * Bagian 1-7 hanya bisa menolak sisa rename pada berkas yang kebetulan dibaca
 * harness ini. Peta label, panel, atau penyimpanan bisa masih memakai awalan
 * lama tanpa satu pun pemeriksaan di atas menyentuhnya - dan itu persis rename
 * setengah jalan. Karena itu semua `.ts`/`.tsx` di `src/` dipindai.
 *
 * Yang diuji BUKAN "tidak ada awalan retired sama sekali". Itu tidak mungkin
 * dijamin tanpa memutus kompatibilitas mundur, dan kompatibilitas mundur itu
 * wajib: giliran yang dilanjutkan, checkpoint, dan setelan tool tersimpan
 * masih membawa awalan lama. Menerimanya KECIL biaya (satu regex) sedangkan
 * membuangnya besar: giliran yang dilanjutkan berhenti di tengah jalan, dan
 * lebih buruk - pemeriksaan perintah berbahaya dilewati untuk giliran yang
 * direkam dengan awalan lama.
 *
 * Invarian yang benar lebih sempit dan bisa dipalsukan:
 *   - awalan retired HANYA boleh ada di COMPAT_FILES;
 *   - awalan retired tidak boleh muncul di satu pun NAME_BUILDERS, kecuali
 *     di dalam regex penerimaan (dicek terpisah di bawah);
 *   - awalan retired tidak boleh menjadi bagian dari nama yang DIPERIKSA
 *     untuk 연출 label (bagian 1-7 sudah menguji itu).
 */
console.log('\n== 8. Awalan retired di src hanya untuk kompatibilitas ==');
{
  const awalan = pindaiAwalan(join(AKAR, 'src'));

  /* Penegate lebih dulu: kalau pemindaiannya sendiri rusak, himpunan kosong
     akan membuat semua pemeriksaan di bawah lulus tanpa bukti. */
  periksa(`awalan ${PREFIX_MCP} benar-benar ada di sumber`, awalan.has(PREFIX_MCP), {
    ditemukan: [...awalan.keys()],
  });

  const berkasRetired = awalan.has(PREFIX_RETIRED) ? awalan.get(PREFIX_RETIRED) : new Set();
  const diLuar = [...berkasRetired]
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !COMPAT_FILES.has(f));
  periksa(
    `awalan ${PREFIX_RETIRED} hanya di ${COMPAT_FILES.size} berkas kompatibilitas`,
    diLuar.length === 0,
    { diLuar, kompat: [...COMPAT_FILES] },
  );

  /* Penjaga kedua, dan ini yang paling mudah lolos: di berkas pembangun nama,
     awalan retired hanya boleh muncul sebagai bagian dari regex penerimaan
     backwards-compatible. Minute satu saja di luar itu berarti katalog masih
     MENAWARKAN nama lama ke model - dan itulah yang ingin dicegah. */
  const diLuarRegex = [];
  for (const rel of NAME_BUILDERS) {
    const isi = readFileSync(join(AKAR, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    /* Buang dulu semua kemunculan di dalam regex, sisanya adalah nama nyata. */
    const tanpaRegex = isi.replace(/=\s*\/\^?[^/\n]*\/[a-z]*;/g, '');
    if (tanpaRegex.includes(PREFIX_RETIRED)) diLuar.push(rel);
  }
  periksa('berkas pembangun nama tidak menawarkan awalan retired', diLuar.length === 0, {
    diLuar,
  });
}

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
process.exit(gagal === 0 ? 0 : 1);
