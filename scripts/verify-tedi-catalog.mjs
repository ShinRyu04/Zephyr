/**
 * verify-tedi-catalog.mjs - kunci katalog pada angka dan nama yang tepat.
 *
 *   node scripts/verify-tedi-catalog.mjs
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
 * Sumber nama bawaan TIDAK lagi `.tedi/reference` (sudah dihapus) melainkan
 * handler Zephyr sendiri, supaya berkas ini tidak bisa lulus palsu saat
 * referensinya hilang - dulu ia menemukan nol nama dan tetap melaporkan lulus.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(AKAR, 'src', 'lib', 'tediTools');

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

/* Nama MCP dari handler Zephyr sendiri (`src/lib/tediTools/mcp.ts`). */
const mcpIsi = readFileSync(join(REF, 'mcp.ts'), 'utf8');
const mcpSumber = [];
for (const m of mcpIsi.matchAll(/name: 'mcp__tedi__([a-z_]+)'/g)) mcpSumber.push(m[1]);
if (mcpSumber.length === 0) {
  console.error('FATAL: nama tool MCP tidak ditemukan di mcp.ts.');
  console.error('Menemukan nol tool diam-diam akan membuat setiap pemeriksaan lulus palsu.');
  process.exit(1);
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
  entryPoints: [join(AKAR, 'src', 'lib', 'tediTools', 'catalog.ts')],
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
  const diharapkan = mcpSumber.map((n) => 'mcp__tedi__' + n).sort();
  const dapat = nama.filter((n) => n.startsWith('mcp__tedi__')).sort();
  periksa(`jumlah nama MCP cocok (${mcpSumber.length})`, dapat.length === diharapkan.length, {
    diharapkan: diharapkan.length,
    dapat: dapat.length,
  });
  periksa('daftar nama MCP identik', JSON.stringify(dapat) === JSON.stringify(diharapkan), {
    hilang: diharapkan.filter((n) => !dapat.includes(n)),
    lebih: dapat.filter((n) => !diharapkan.includes(n)),
  });
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

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
process.exit(gagal === 0 ? 0 : 1);
