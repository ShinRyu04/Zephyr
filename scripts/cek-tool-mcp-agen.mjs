/**
 * cek-tool-mcp-agen.mjs - buktikan tool dari MCP server yang DIPASANG benar-benar
 * sampai ke agen (bukan cuma tampil di panel).
 *
 *   node scripts/cek-tool-mcp-agen.mjs [port]
 *
 * Pertanyaan yang dijawab: setelah user memasang server MCP dari katalog, apakah
 * model benar-benar menerima tool itu? Panel yang menampilkan "Installed" bukan
 * bukti - yang membuktikan adalah daftar tool yang dipakai loop agen.
 *
 * Read-only: tidak memasang, tidak memanggil tool, tidak mengubah setelan.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';

/*
 * TIGA hal yang harus dibaca dari SUMBER yang benar (semuanya pernah salah di
 * versi skrip sebelumnya, dan ketiganya sama-sama melaporkan "0"):
 *
 *   1. `mcpRingkas()` mengembalikan `dipakai`/`total`, BUKAN `jumlah`. Membaca
 *      `x.jumlah` selalu `undefined`, dan `undefined` yang dijumlahkan jadi NaN
 *      yang tercetak "0" walau registry penuh.
 *   2. `AGENT_TOOLS` adalah tabel STATIS milik Zephyr; tool MCP luar masuk lewat
 *      `agentToolSpecs()`. Membaca array statis = mengukur daftar yang tidak
 *      pernah berisi tool luar.
 *   3. Setelah HMR, `import('/src/lib/…')` dari CDP bisa mengembalikan SALINAN
 *      modul yang lama - registry di salinan itu kosong walau app yang dirender
 *      penuh. Karena itu skrip ini memakai JEMBATAN DEV (`window.__ZEPHYR_*__`),
 *      yang memegang instance modul yang SAMA dengan yang dipakai aplikasi.
 */
const SKRIP = `
  const out = {};
  if (!window.__ZEPHYR_MCP__ || !window.__ZEPHYR_AI__ || !window.__ZEPHYR_TOOLS__) {
    return JSON.stringify({ bridge: false });
  }
  out.bridge = true;
  /* Segarkan registry dari server yang terdaftar - jalur yang sama dipakai app. */
  try { await window.__ZEPHYR_MCP__.refreshServers(); } catch (e) { out.refreshErr = String(e).slice(0, 200); }
  const ringkas = window.__ZEPHYR_AI__.mcpRingkas();
  out.serverDenganTool = ringkas.map((x) => ({ id: x.serverId, dipakai: x.dipakai, total: x.total }));
  out.totalTool = ringkas.reduce((a, x) => a + x.dipakai, 0);
  /* Spec yang BENAR-BENAR ditawarkan ke agen - bukan tabel statis AGENT_TOOLS. */
  const nama = window.__ZEPHYR_TOOLS__.untukSubagent(true, 0);
  out.totalSpecs = nama.length;
  out.toolMcpDariAgen = nama.filter((n) => n.startsWith('mcp__') && !n.startsWith('mcp__zephyr__'));
  return JSON.stringify(out);
`;

/*
 * Retry: agen lain bisa mengedit berkas dan memicu reload HMR di tengah uji.
 * Halaman yang reload kehilangan konteks CDP, jadi attach ulang dan coba lagi -
 * bukan gagal dengan pesan yang terbaca seperti bug aplikasi.
 */
let s = null;
let terakhir = '';
for (let i = 1; i <= 4; i++) {
  try {
    const page = await halamanZephyr(PORT);
    const { cdp } = await Cdp.attach(PORT, page.title);
    const r = await cdp.runAsync(SKRIP);
    await cdp.close();
    s = typeof r === 'string' ? JSON.parse(r) : r;
    break;
  } catch (e) {
    terakhir = String(e?.message ?? e);
    if (!/RELOAD di tengah uji|socket CDP/.test(terakhir)) throw e;
    console.log(`percobaan ${i}: halaman reload (HMR), ulangi...`);
    await new Promise((res) => setTimeout(res, 3000));
  }
}
if (!s) {
  console.log('GAGAL: halaman terus reload di tengah uji —', terakhir.slice(0, 200));
  process.exit(1);
}
if (!s.bridge) {
  console.log('GAGAL: jembatan dev (window.__ZEPHYR_*__) tidak ada — aplikasi bukan mode dev?');
  process.exit(1);
}

if (s.refreshErr) console.log('refresh error:', s.refreshErr);
console.log('server yang mengirim tool :', s.serverDenganTool.length);
for (const x of s.serverDenganTool) console.log('   -', x.id, '->', x.dipakai, 'dari', x.total, 'tool');
console.log('TOTAL tool MCP eksternal  :', s.totalTool);
console.log('total spec ke agen        :', s.totalSpecs);
console.log('tool MCP non-zephyr ke agen :', s.toolMcpDariAgen.length, s.toolMcpDariAgen.slice(0, 8).join(', '));
if (s.totalTool <= 0 || s.toolMcpDariAgen.length <= 0) {
  console.log('HASIL: 0 — tidak ada tool MCP yang sampai ke agen.');
  process.exit(1);
}
console.log('HASIL: OK — tool MCP sampai ke agen.');

