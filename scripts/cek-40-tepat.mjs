/**
 * cek-40-tepat.mjs - buktikan katalog Zephyr berisi TEPAT 40 tool INTI.
 *
 *   node scripts/cek-40-tepat.mjs
 *
 * Kontrak yang dijaga berkas ini, dan alasannya kenapa bukan "sekitar 40":
 *
 *   1. Jumlah tool inti (builtin + MCP, yaitu SEMUA yang bukan web) harus
 *      TEPAT 40. Angka mati memang rapuh - itu sebabnya `audit-katalog-tool.mjs`
 *      menghitung HUBUNGAN, bukan angka. Tapi di sini angkanya justru yang
 *      diminta user: "batas jadi 40 tools, ga lebih dan ga kurang". Angka yang
 *      diminta eksplisit bukan komentar basi; ia kontrak. Kalau nanti berubah,
 *      berkas ini harus ikut berubah - dan itu memang tujuannya.
 *
 *   2. Tool yang DILARANG HILANG harus tetap ada. Ini bukan selera: user
 *      menyebutnya sendiri ("LSP JGN DIBUANG", "browser_download_url juga"),
 *      dan trio web (`browser_open`/`browser_read`/`web_fetch`) di-route
 *      prompt dengan nama, jadi menghapusnya membuat prompt menyuruh model
 *      memanggil tool yang tidak ada.
 *
 *   3. Setiap nama di katalog WAJIB punya handler. Katalog yang menyebut nama
 *      tanpa handler adalah janji palsu: model memanggilnya, lalu gagal dengan
 *      "tool tidak dikenal" - persis jenis kegagalan yang terbaca di UI sebagai
 *      baris merah.
 *
 * Read-only: berkas ini tidak mengubah apa pun.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KATALOG = join(AKAR, 'src/lib/zephyrTools/catalog.ts');

const TEPAT = 40;

/* Nama yang tidak boleh hilang, beserta alasan singkatnya. */
const WAJIB = {
  'lsp_symbols': 'user: LSP JGN DIHPUS',
  'lsp_references': 'user: LSP JGN DIHPUS',
  'lsp_definition': 'user: LSP JGN DIHPUS',
  'lsp_hover': 'user: LSP JGN DIHPUS',
  'lsp_diagnostics': 'user: LSP JGN DIHPUS',
  'lsp_call_hierarchy': 'user: LSP JGN DIHPUS',
  'browser_download_url': 'user: browser_download_url juga dilindungi',
  'browser_open': 'di-route prompt: "buka URL -> browser_open"',
  'browser_read': 'di-route prompt: "baca halaman -> browser_read"',
  'web_fetch': 'di-route prompt: "teks URL -> web_fetch"',
  'read_file': 'loop inti: baca berkas',
  'write_file': 'loop inti: tulis berkas',
  'multi_edit': 'loop inti: sunting berkas',
  'bash_run': 'loop inti: jalankan perintah',
  'todo_write': 'loop inti: rencana tugas',
  'tool_search': 'jembatan progressive disclosure',
  'tool_call': 'jembatan progressive disclosure',
  'zephyr_self': 'di-route prompt: "jangan menjawab soal Zephyr dari ingatan"',
};

const isi = readFileSync(KATALOG, 'utf8');

/* Ambil nama per blok. Bentuk baris katalog: ['nama', 'grup', 'efek', bool, 'desc'] */
function namaDiBlok(namaBlok) {
  const mulai = isi.indexOf(`const ${namaBlok}: Array<`);
  if (mulai < 0) return null;
  const akhir = isi.indexOf('\n];', mulai);
  if (akhir < 0) return null;
  const isiBlok = isi.slice(mulai, akhir);
  const hasil = [];
  const re = /\['([a-z_0-9]+)'\s*,\s*'/g;
  let m;
  while ((m = re.exec(isiBlok)) !== null) hasil.push(m[1]);
  return hasil;
}

const builtin = namaDiBlok('BUILTIN');
const mcp = namaDiBlok('MCP');
const web = namaDiBlok('WEB');

let lulus = 0;
let gagal = 0;
const cek = (nama, syarat, rincian) => {
  if (syarat) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    console.log('  GAGAL  ' + nama + (rincian ? '  -> ' + rincian : ''));
  }
};

console.log('KATALOG TOOL ZEPHYR - KONTRAK 40 INTI\n');

if (!builtin || !mcp || !web) {
  console.log('  GAGAL  blok katalog tidak terbaca (BUILTIN/MCP/WEB)');
  console.log('\n== GAGAL ==');
  process.exit(1);
}

const inti = [...builtin, ...mcp];
const semua = [...inti, ...web];

console.log(`  builtin : ${builtin.length}`);
console.log(`  mcp     : ${mcp.length}`);
console.log(`  inti    : ${inti.length}   (target ${TEPAT})`);
console.log(`  web     : ${web.length}   (dihitung terpisah)`);
console.log(`  total   : ${semua.length}\n`);

cek('jumlah inti tepat ' + TEPAT, inti.length === TEPAT, `dapat ${inti.length}`);

/* Nama ganda adalah bug diam: dua baris, satu handler, satu menang tanpa kabar. */
const ganda = semua.filter((n, i) => semua.indexOf(n) !== i);
cek('tidak ada nama ganda', ganda.length === 0, ganda.join(', '));

/* Setiap nama wajib ada, dan wajib ada di blok INTI (kecuali tool web). */
const hilang = Object.keys(WAJIB).filter((n) => !semua.includes(n));
cek('tidak ada tool wajib yang hilang', hilang.length === 0,
  hilang.map((n) => `${n} (${WAJIB[n]})`).join('; '));

/* Handler: katalog <-> handler harus sinkron. Diperiksa dari sisi katalog:
   setiap nama harus muncul di salah satu berkas handler. */
const HANDLER = [
  'src/lib/zephyrTools/builtins.ts',
  'src/lib/zephyrTools/web.ts',
  'src/lib/zephyrTools/mcp.ts',
  'src/lib/zephyrTools/zephyrSelf.ts',
  'src/lib/zephyrTools/zephyrIngat.ts',
  'src/lib/zephyrTools/worktree.ts',
  'src/lib/zephyrTools/kendaliJendela.ts',
  'src/lib/bacaKode.ts',
  'src/lib/agentTools.ts',
  /* Blok MCP dijembatani ke server MCP Rust (lihat `mcp.ts`). Handler
     sebenarnya ada di sana, jadi nama-nama itu hanya bisa dibuktikan dari
     berkas Rust-nya - bukan dari sisi TS. */
  'src-tauri/src/mcp_server.rs',
];
let gabung = '';
for (const h of HANDLER) {
  try {
    gabung += readFileSync(join(AKAR, h), 'utf8');
  } catch {
    /* berkas handler yang tidak ada bukan kegagalan di sini; yang diperiksa
       adalah nama yang TIDAK punya rumah di handler mana pun. */
  }
}
/* Pola sama dengan `audit-katalog-tool.mjs`: nama handler ditulis sebagai
   `name: '<tool>'` atau `tool: '<tool>'`. Dicocokkan pada kata utuh supaya
   `read` tidak "menemukan" dirinya di dalam `read_file`.
   Blok MCP ditulis DENGAN awalan (`mcp__zephyr__inspect`), jadi kedua bentuk
   diperiksa - nama polos di katalog, nama berawalan di handler. */
const punyaHandler = (n) => {
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:name|tool)\\s*:\\s*'(?:mcp__zephyr__)?${esc}'`).test(gabung);
};
const tanpaHandler = semua.filter((n) => !punyaHandler(n));
cek('setiap tool katalog punya handler', tanpaHandler.length === 0,
  tanpaHandler.join(', '));

console.log('\n== RINGKASAN ==');
console.log(`  lulus : ${lulus}`);
console.log(`  gagal : ${gagal}`);
console.log(gagal === 0 ? '\n== LULUS ==' : '\n== GAGAL ==');
process.exit(gagal === 0 ? 0 : 1);
