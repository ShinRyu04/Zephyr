/**
 * verify-peta.mjs — `peta` mencari di indeks fakta NYATA, di app hidup.
 *
 * Pakai:  node scripts/verify-peta.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223 dan vite di :5173.
 *
 * ## Kenapa lewat app, bukan Node
 *
 * `peta.ts` mengimpor `zephyrCari` -> `zephyrIndeks`, yang menarik seluruh
 * bundel fakta (1 MB, ribuan entri) dan beberapa modul aplikasi. Node tidak bisa
 * meresolusi rantai itu tanpa transpiler, dan repo ini tidak punya satu pun di
 * devDependencies. Menyalin logikanya ke harness akan menguji salinan, bukan
 * kode - jadi yang dipakai adalah modul ASLI di dalam app.
 *
 * ## Yang diuji
 *
 *   P1  pertanyaan nyata menemukan entri nyata
 *   P2  kategori mempersempit hasil
 *   P3  nol hasil dinyatakan nol + menyuruh tidak mengarang
 *   P4  kategori asing ditolak dengan daftar pilihan
 *   P5  header menyebut ukuran indeks + versi
 */
import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const R = reporter('peta');

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
if (!t) {
  R.check('P0', false, 'target app tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const { jalankanAgentTool } = await import("/src/lib/agentTools.ts");',
    'const panggil = async (args) => {',
    '  try { return String(await jalankanAgentTool("peta", args)); }',
    '  catch (e) { return "ERR: " + e.message; }',
    '};',
    'out.ada = typeof jalankanAgentTool === "function";',
    'out.tema = await panggil({ kueri: "theme" });',
    'out.port = await panggil({ kueri: "mcp.port", kategori: "setelan" });',
    'out.pintasan = await panggil({ kueri: "Ctrl+Shift+P", kategori: "pintasan" });',
    'out.kosong = await panggil({ kueri: "xyzzy plugh frobnicate" });',
    'out.asing = await panggil({ kueri: "x", kategori: "melayang" });',
    'return out;',
  ].join('\n'),
  180000,
);

R.check('P0', out.ada === true, 'tool `peta` bisa dipanggil dari tabel agen');
R.check('P1', /hasil untuk "theme"/.test(out.tema), `"theme" -> ${String(out.tema).split('\n').pop()?.slice(0, 90)}`);
R.check('P2', /mcp\.port/.test(out.port), `"mcp.port" di kategori setelan -> ${String(out.port).split('\n').pop()?.slice(0, 90)}`);
R.check('P3', /Tidak ada entri yang cocok/.test(out.kosong) && /jangan mengarang/i.test(out.kosong), `"xyzzy" -> ${String(out.kosong).split('\n').pop()?.slice(0, 90)}`);
R.check('P4', /kategori "melayang" tidak dikenal/.test(out.asing), `kategori asing -> ${String(out.asing).slice(0, 90)}`);
R.check(
  'P5',
  /Peta Zephyr: \d+ entri, versi \d+\.\d+\.\d+, hash [0-9a-f]+/.test(out.tema),
  `header: ${String(out.tema).split('\n')[0]?.slice(0, 100)}`,
);
R.check('P6', /Ctrl\+Shift\+P/i.test(out.pintasan), 'pintasan bisa dicari lewat tombolnya');

console.log('\n  contoh hasil "theme":');
console.log(
  String(out.tema)
    .split('\n')
    .slice(0, 6)
    .map((l) => '    ' + l.slice(0, 120))
    .join('\n'),
);

R.selesai();
keluarBersih(process.exitCode === 1 ? 1 : 0);
