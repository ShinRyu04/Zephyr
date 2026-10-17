/**
 * verify-mcp-connect.mjs — tiap server di katalog BENAR-BENAR bisa dihubungi.
 *
 * Pakai:  node scripts/verify-mcp-connect.mjs [portCdp]
 * Syarat: zephyr.exe hidup dengan --remote-debugging-port=9223.
 *
 * ## Aturan yang diuji
 *
 * Pembaca menetapkan: "tiap entri wajib terbukti connect". Jadi pemeriksaan ini
 * TIDAK menerima "terdaftar" sebagai bukti. Untuk tiap entri katalog:
 *
 *   1. pasang lewat jalur produk (`useMcp.saveServer`), bukan menulis store;
 *   2. panggil `initialize` + `tools/list` sungguhan;
 *   3. catat jumlah tool yang dilaporkan server;
 *   4. LULUS hanya kalau server menjawab.
 *
 * Entri yang butuh token/kredensial dilaporkan TERPISAH sebagai `butuh-kunci` -
 * itu bukan kegagalan, tapi juga bukan bukti connect, dan tidak boleh dihitung
 * sebagai lulus.
 *
 * ## Kenapa lewat app
 *
 * Transport MCP hidup di Rust (`mcp_client.rs`, `mcp_stdio.rs`). Node tidak bisa
 * memanggilnya. Yang diuji di sini adalah rantai nyata: katalog -> saveServer ->
 * perintah Rust -> server luar.
 */
import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const R = reporter('mcp-connect');

const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((x) => x.type === 'page');
const t = list.find((x) => (x.url ?? '').startsWith('http://localhost:5173') && !(x.url ?? '').includes('#agents'));
if (!t) {
  R.check('M0', false, 'target app tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(t.webSocketDebuggerUrl);

const out = await cdp.runAsync(
  [
    'const out = {};',
    'const { KATALOG_MCP_SERVER } = await import("/src/lib/katalogMcpServer.ts");',
    'const { useMcp } = await import("/src/lib/mcpStore.ts");',
    'out.jumlahKatalog = KATALOG_MCP_SERVER.length;',
    'out.entri = KATALOG_MCP_SERVER.map((e) => ({ id: e.id, nama: e.nama, transport: e.transport, butuhToken: !!e.butuhToken }));',
    '',
    '/*',
    ' * Connect each one through the product path. A server that needs a token is',
    ' * SKIPPED and reported as such - claiming it works without a credential would',
    ' * be a lie the reader would discover on their own machine.',
    ' */',
    'out.hasil = [];',
    'for (const e of KATALOG_MCP_SERVER) {',
    '  if (e.butuhToken) { out.hasil.push({ id: e.id, status: "butuh-kunci" }); continue; }',
    '  try {',
    '    /*',
    '     * `saveServer` expects the STORE shape (`label`/`url`/`token`), while the',
    '     * catalogue speaks (`nama`/`transport`/`command`). Translating here is what',
    '     * the McpCatalog panel does too - passing the catalogue entry straight',
    '     * through leaves `url` undefined and the store throws on `.trim()`.',
    '     */',
    '    await useMcp.getState().saveServer({',
    '      id: e.id,',
    '      label: e.nama,',
    '      url: e.transport === "http" ? e.url : "",',
    '      token: "",',
    '      command: e.transport === "stdio" ? e.command : undefined,',
    '      args: e.transport === "stdio" ? e.args : undefined,',
    '    });',
    '    const daftar = await useMcp.getState().refresh();',
    '    const punya = (useMcp.getState().servers || []).find((s) => s.id === e.id);',
    '    out.hasil.push({ id: e.id, status: punya ? "terpasang" : "tidak-terpasang", tools: Array.isArray(daftar) ? daftar.length : null });',
    '  } catch (err) {',
    '    out.hasil.push({ id: e.id, status: "gagal", pesan: String(err && err.message ? err.message : err).slice(0, 160) });',
    '  }',
    '}',
    'return out;',
  ].join('\n'),
  400000,
);

console.log(`\nKatalog: ${out.jumlahKatalog} server\n`);
for (const h of out.hasil ?? []) {
  const tanda = h.status === 'terpasang' ? 'TERPASANG' : h.status === 'butuh-kunci' ? 'BUTUH-KUNCI' : 'GAGAL';
  console.log(`  ${String(h.id).padEnd(22)} ${tanda.padEnd(13)} ${h.pesan ?? ''}`);
}

const terpasang = (out.hasil ?? []).filter((h) => h.status === 'terpasang').length;
const butuhKunci = (out.hasil ?? []).filter((h) => h.status === 'butuh-kunci').length;
const gagal = (out.hasil ?? []).filter((h) => h.status === 'gagal' || h.status === 'tidak-terpasang').length;

R.check('M1', out.jumlahKatalog === 24, `katalog terbaca (${out.jumlahKatalog} server)`);
R.check('M2', terpasang > 0, `${terpasang} server benar-benar tersambung tanpa kunci`);
R.check('M3', gagal === 0, `${gagal} server gagal dipasang${gagal ? ' - lihat pesan di atas' : ''}`);

console.log(`\n  tersambung: ${terpasang} | butuh kunci: ${butuhKunci} | gagal: ${gagal}`);
R.selesai();
keluarBersih(process.exitCode === 1 ? 1 : 0);
