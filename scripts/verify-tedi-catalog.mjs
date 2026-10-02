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
 *   40 tool inti (26 bawaan + 14 MCP) - terpasang DAN aktif sejak awal
 *   11 tool web/browser             - terpasang, TAPI mati sampai dinyalakan
 *   51 total
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(AKAR, '.tedi', 'reference');

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

const berkasBawaan = ['fs', 'edit', 'fetch', 'search', 'shell', 'subagent', 'todo', 'notes', 'schedule'];
const bawaanSumber = [];
for (const f of berkasBawaan) {
  const isi = readFileSync(join(REF, 'tedi-tools', f + '.ts'), 'utf8');
  for (const m of isi.matchAll(/^ {4}([a-z_]+): tool\(\{/gm)) bawaanSumber.push(m[1]);
}

/* Nama MCP dari tabel handler. */
const mcpIsi = readFileSync(join(REF, 'tediMcpServer.ts'), 'utf8');
const awalTabel = mcpIsi.indexOf('const HANDLERS');
if (awalTabel < 0) {
  console.error('FATAL: tabel handler tidak ditemukan.');
  console.error('Menemukan nol tool diam-diam akan membuat setiap pemeriksaan lulus palsu.');
  process.exit(1);
}
const mcpSumber = [];
for (const m of mcpIsi.slice(awalTabel).matchAll(/^ {2}([a-z_]+): async/gm)) mcpSumber.push(m[1]);

/* ------------------------------------------------------------------ */
/* Muat katalog dengan esbuild.                                       */
/* ------------------------------------------------------------------ */

const { buildSync } = await import('esbuild');
const sementara = join(AKAR, 'node_modules', '.cache', 'verify-catalog.mjs');
await (await import('node:fs/promises')).mkdir(dirname(sementara), { recursive: true });
buildSync({
  entryPoints: [join(AKAR, 'src', 'lib', 'tediTools', 'catalog.ts')],
  outfile: sementara,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
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
periksa('26 tool bawaan', katalog.counts.builtin === 26, { dapat: katalog.counts.builtin });
periksa('14 tool MCP', katalog.counts.mcp === 14, { dapat: katalog.counts.mcp });
periksa('11 tool web/browser', katalog.counts.web === 11, { dapat: katalog.counts.web });
periksa('40 tool inti', katalog.counts.inti === 40, { dapat: katalog.counts.inti });
periksa('total 51 tool', katalog.counts.total === 51, { dapat: katalog.counts.total });
periksa('tidak ada nama ganda', new Set(nama).size === nama.length, {
  ganda: nama.filter((n, i) => nama.indexOf(n) !== i),
});

console.log('\n== 2. Nama bawaan sama persis dengan sumber ==');
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

console.log('\n== 5. Kontrak 40 inti ==');
periksa('TOOL_INTI berisi 40', katalog.inti.length === 40, { dapat: katalog.inti.length });
periksa('TOOL_INTI tidak memuat nama web', !katalog.inti.some((n) => WEB_NAMA.includes(n)), {
  bocor: katalog.inti.filter((n) => WEB_NAMA.includes(n)),
});
periksa('TOOL_INTI = 26 bawaan + 14 MCP', katalog.inti.length === bawaanSumber.length + mcpSumber.length);
{
  /* Yang paling penting: default aktif harus UTUH 40, bukan sebagian. */
  const kurang = katalog.inti.filter((n) => !katalog.aktif.includes(n));
  periksa('SEMUA 40 inti aktif sejak awal', kurang.length === 0, { kurang });
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
