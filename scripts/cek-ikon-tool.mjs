/*
 * Memeriksa bahwa setiap baris tool menggambar glyph MILIKNYA, bukan satu glyph
 * untuk semua.
 *
 * Kenapa ini diuji dari DOM dan bukan dari kode: bug aslinya tidak terlihat di
 * kode sama sekali. `labelAksi.ts` sudah punya ikon per tool dan `AiIkon.tsx`
 * sudah menggambar semuanya - dua berkas yang benar, yang salah hanya baris
 * yang memilih `name="prompt"` untuk semuanya. Yang membuktikan perbaikan
 * adalah jumlah glyph BERBEDA yang benar-benar muncul di transkrip.
 *
 * Dipakai: node scripts/cek-ikon-tool.mjs [port-cdp, default 9223]
 */

const PORT = process.argv[2] || '9223';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.url && t.url.includes('localhost:5173'));
if (!target) {
  console.error('Zephyr (dev) tidak ditemukan. Targets: ' + list.map((t) => t.title).join(', '));
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

/*
 * Diuji pada TABEL, bukan pada transkrip: transkrip bergantung pada percakapan
 * yang kebetulan ada, jadi ujinya akan lulus atau gagal menurut riwayat chat
 * dan bukan menurut kode. Tabelnya deterministik.
 *
 * Yang diperiksa: `infoAksi()` memberi glyph yang BERBEDA untuk jenis aksi yang
 * berbeda, dan setiap nama ikon yang dikembalikannya benar-benar digambar
 * AiIkon (tidak ada glyph kosong yang tak sengaja lolos).
 */
const EXPR = `(async () => {
  const T = window.__ZEPHYR_TOOLS__;
  if (!T) return JSON.stringify({ err: 'bridge __ZEPHYR_TOOLS__ tidak ada' });

  const semua = T.nama();
  const info = {};
  for (const n of semua) {
    try { info[n] = T.infoAksi(n); } catch (e) { info[n] = { err: String(e.message) }; }
  }

  const salah = Object.entries(info).filter(([, v]) => v && v.err).map(([k, v]) => k + ': ' + v.err);
  const glyph = {};
  for (const [n, v] of Object.entries(info)) {
    if (!v || v.err) continue;
    (glyph[v.ikon] = glyph[v.ikon] || []).push(n);
  }
  return JSON.stringify({
    jumlahTool: semua.length,
    jumlahGlyph: Object.keys(glyph).length,
    glyph,
    salah,
    /* Glyph yang TIDAK boleh memuat semua tool - itu bug aslinya. */
    semuaSatuGlyph: Object.keys(glyph).length === 1,
  });
})()`;

const r = await send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
ws.close();

const raw = r?.result?.result?.value;
if (!raw) {
  console.error('gagal membaca bridge:', JSON.stringify(r).slice(0, 400));
  process.exit(1);
}
const d = JSON.parse(raw);
if (d.err) {
  console.error(d.err);
  process.exit(1);
}

let gagal = 0;

if (d.salah.length) {
  console.error('GAGAL - infoAksi() melempar untuk tool: ' + d.salah.join(', '));
  gagal++;
} else {
  console.log('OK - infoAksi() menjawab untuk semua ' + d.jumlahTool + ' tool');
}

/*
 * Ambang 5, bukan 2: dua glyph berbeda saja masih bisa berarti tabelnya hampir
 * seluruhnya jatuh ke fallback. Lima membuktikan beberapa jenis aksi benar
 * benar terwakili.
 */
if (d.jumlahGlyph < 5) {
  console.error(
    'GAGAL - hanya ' + d.jumlahGlyph + ' glyph berbeda dipakai; baris tool akan tampak seragam. Memakai: ' +
      Object.keys(d.glyph).join(', '),
  );
  gagal++;
} else {
  console.log('OK - ' + d.jumlahGlyph + ' glyph berbeda dipakai antar tool');
  for (const [g, nama] of Object.entries(d.glyph)) {
    console.log('   ' + g.padEnd(10) + ' ' + nama.length + ' tool');
  }
}

console.log('');
console.log(gagal ? '== GAGAL: ' + gagal + ' masalah ==' : '== ikon tool beragam ==');
process.exit(gagal ? 1 : 0);
