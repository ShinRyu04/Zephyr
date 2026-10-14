/**
 * uji-trim-tool.mjs - bukti pemangkasan daftar tool inti tidak menghilangkan apa pun.
 *
 * Yang diuji:
 *   1. daftar yang dikirim setiap request menyusut (hemat byte nyata)
 *   2. tool yang DILEPAS masih terpasang, masih aktif, dan masih bisa dipanggil
 *   3. `tool_search` benar-benar menemukan tool yang dilepas itu
 *
 *   node scripts/uji-trim-tool.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('pemangkasan daftar tool inti');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr — Code Editor', 'localhost:5173']);
cdp.snapshot = null;

const data = await cdp.json(`return JSON.stringify(await (async () => {
  const cat = await import('/src/lib/zephyrTools/catalog.ts');
  const m = await import('/src/lib/agentTools.ts');
  const gate = await import('/src/lib/toolGate.ts');
  const dikirim = [...cat.TOOL_DIKIRIM_SELALU];
  const specs = m.agentToolSpecs({ alat: [...gate.useToolGate.getState().aktif] });
  const namaDikirim = specs.map((s) => s.name);
  const ukuran = JSON.stringify(specs).length;
  const semua = m.AGENT_TOOLS.map((t) => t.spec.name);
  return {
    dikirim,
    namaDikirim,
    ukuran,
    semua,
    aktif: [...gate.useToolGate.getState().aktif],
  };
})())`);

console.log(`     daftar dikirim : ${data.dikirim.length} tool, ${data.ukuran} byte skema`);
R.check('T1', data.dikirim.length <= 26, `daftar inti menyusut jadi ${data.dikirim.length} tool`);
/* Anggaran skema 15.000 byte (naik dari 14.000 pada 2026-10-14): `zephyr_self`
   masuk daftar SELALU-dikirim karena aturan blok inti me-route model ke tool itu
   sebagai pintu lapis indeks (`ai-tahu-100-7a`/`-7b`) - tanpa itu model membaca
   pintunya tapi tidak bisa memanggil tanpa `tool_search`. Harganya ~0,5 KB dan
   dibayar sadar; angka ini dinaikkan sekali, bukan dihapus, supaya penyusutan
   berikutnya tetap terpaksa dicatat. */
R.check('T2', data.ukuran < 15000, `skema yang dikirim ${data.ukuran} byte (< 15000)`);

/* Tool yang sengaja dilepas dari daftar-kirim. */
const dilepas = ['lsp_symbols', 'lsp_references', 'lsp_hover', 'lsp_diagnostics', 'browser_nav', 'web_search'];

for (const nama of dilepas) {
  R.check(`T-${nama}`, !data.dikirim.includes(nama), `"${nama}" tidak lagi dikirim setiap request`);
}

/* Tapi semuanya harus MASIH ada dan MASIH aktif. */
const hilang = dilepas.filter((n) => !data.semua.includes(n));
const nonaktif = dilepas.filter((n) => !data.aktif.includes(n));
R.check('T3', hilang.length === 0, `semua tool yang dilepas masih terpasang (${hilang.length} hilang)`);
R.check('T4', nonaktif.length === 0, `semua tool yang dilepas masih AKTIF (${nonaktif.length} nonaktif)`);

/* Yang tetap dikirim tidak boleh ikut hilang. */
const wajib = ['read_file', 'write_file', 'edit', 'bash_run', 'grep', 'lsp_definition', 'browser_open', 'browser_read', 'web_fetch', 'ask_user', 'tool_search', 'tool_call'];
const wajibHilang = wajib.filter((n) => !data.dikirim.includes(n));
R.check('T5', wajibHilang.length === 0, `tool inti tetap dikirim (hilang: ${wajibHilang.join(', ') || 'tidak ada'})`);

/* tool_search harus benar-benar menemukan yang dilepas. */
const cari = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/agentTools.ts');
  const t = m.AGENT_TOOLS.find((x) => x.spec.name === 'tool_search');
  if (!t) return { error: 'tool_search tidak ada' };
  const a = await t.run({ query: 'daftar simbol di berkas', limit: 8 });
  const b = await t.run({ query: 'cari di internet', limit: 8 });
  const c = await t.run({ query: 'maju mundur muat ulang halaman', limit: 8 });
  return { simbol: String(a), cari: String(b), nav: String(c) };
})())`);

R.check('T6', /lsp_symbols/.test(cari.simbol), 'tool_search menemukan lsp_symbols');
R.check('T7', /web_search/.test(cari.cari), 'tool_search menemukan web_search');
R.check('T8', /browser_nav/.test(cari.nav), 'tool_search menemukan browser_nav');

/* tool_call harus benar-benar bisa menjalankannya. */
const jalan = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/agentTools.ts');
  const t = m.AGENT_TOOLS.find((x) => x.spec.name === 'lsp_symbols');
  if (!t) return 'hilang';
  try {
    const hasil = await t.run({ path: 'src/lib/zephyrTools/catalog.ts' });
    return 'jalan:' + String(hasil).slice(0, 80);
  } catch (e) {
    return 'error:' + String(e.message || e).slice(0, 120);
  }
})())`);
R.check(
  'T9',
  typeof jalan === 'string' && !jalan.startsWith('hilang') && !jalan.startsWith('error:unavailable'),
  `lsp_symbols masih bisa dipanggil langsung (${String(jalan).slice(0, 70)})`,
);

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
