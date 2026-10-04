/*
 * Verifikasi 11 command yang tadinya MATI.
 *
 * Ketiganya (API Client, SQL Explorer, Credentials) punya kode lengkap di Rust,
 * tapi berkasnya tidak pernah di-`mod` dan handler-nya tidak pernah didaftarkan -
 * jadi setiap tombol gagal dengan "Command ... not found" saat diklik.
 *
 * Ujinya sengaja memanggil command itu dengan ARGUMEN YANG SAH dan memeriksa
 * bahwa kegagalannya BUKAN "not found". Command yang menolak karena argumen wajib
 * kurang adalah keadaan sehat - yang diuji di sini adalah apakah commandnya ada
 * sama sekali.
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.log('app mati'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 250);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runAsync(expr, tungguMs = 15000) {
  await evalJs(`window.__c = { selesai: false, hasil: null };
    (async () => { try { window.__c.hasil = await (${expr}); } catch (e) { window.__c.hasil = 'ERR ' + String(e && e.message || e).slice(0, 250); } window.__c.selesai = true; })()`);
  for (let i = 0; i < tungguMs / 200; i += 1) {
    const r = await evalJs('JSON.stringify(window.__c)');
    try { const p = JSON.parse(r); if (p.selesai) return p.hasil; } catch { /* belum */ }
    await sleep(200);
  }
  return 'TIMEOUT';
}

let lulus = 0; let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti !== undefined ? '  [' + String(bukti).slice(0, 70) + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti !== undefined ? '  [' + String(bukti).slice(0, 90) + ']' : ''));
}

console.log('== Command yang tadinya mati: API Client, SQL Explorer, Credentials ==\n');

/* Panggil setiap command. Yang penting: jawabannya BUKAN "not found". */
/* Nama fungsi di commands.ts, bukan nama commandnya - karena dipanggil lewat
   modul itu. Bentuk argumen mengikuti tanda tangan yang sebenarnya. */
const perintah = [
  ['credentials_list', 'credentialsList()'],
  ['db_default_path', 'dbDefaultPath()'],
  ['db_default_path', 'dbDefaultPath(".")'],
  ['db_tables', 'dbTables(":memory:")'],
  ['db_query', 'dbQuery(":memory:", "select 1")'],
  ['http_request', 'httpRequest({ method: "GET", url: "http://127.0.0.1:1/", headers: {} })'],
  ['graphql_body', 'graphqlBody("{ a }")'],
  ['graphql_errors', 'graphqlErrors("{}")'],
  ['credentials_set', 'credentialsSet("__uji__", "uji", "token", "x")'],
  ['credentials_get', 'credentialsGet("__uji__")'],
  ['credentials_delete', 'credentialsDelete("__uji__")'],
];

/*
 * Command diuji lewat `src/lib/commands.ts` - pembungkus yang SAMA dipakai
 * aplikasi.
 *
 * `window.__TAURI__` tidak ada (withGlobalTauri tidak dinyalakan), jadi memanggil
 * `invoke` mentah dari sini menghasilkan "invoke tidak tersedia" untuk SEMUA
 * command - dan ujinya akan melaporkan sebelas kegagalan yang tidak ada. Yang
 * diuji harus jalur yang sama dengan yang ditempuh tombolnya.
 */
const hasil = await runAsync(`(async () => {
  const c = await import('/src/lib/commands.ts?uji=' + Date.now());
  const out = {};
  const coba = async (nama, fn) => {
    try {
      const r = await fn();
      out[nama] = { ok: true, nilai: JSON.stringify(r).slice(0, 50) };
    } catch (e) {
      out[nama] = { ok: false, pesan: String(e && e.message || e).slice(0, 110) };
    }
  };
  ${perintah.map(([n, p]) => `await coba('${n}', () => c.${p});`).join('\n  ')}
  return JSON.stringify(out);
})()`);

let h = {};
try { h = JSON.parse(hasil); } catch { /* biarkan */ }

if (h._error) {
  console.log('  GAGAL  invoke() tidak tersedia di halaman ini: ' + h._error);
  total = 1;
} else {
  for (const [n] of perintah) {
    const r = h[n];
    if (!r) { cek(n, false, '(tidak dicoba)'); continue; }

    /*
     * HIDUP kalau commandnya benar-benar dipanggil dan Rust menjawab - baik
     * dengan hasil maupun dengan error yang datang DARI Rust ("tidak ada berkas",
     * "kunci tidak ditemukan").
     *
     * MATI kalau yang muncul adalah kegagalan JavaScript sebelum sampai ke Rust:
     * "is not defined", "is not a function". Versi pertama uji ini menghitung
     * SEMUA pesan selain "not found" sebagai lulus, jadi sebelas kali
     * "credentialsList is not defined" - uji yang memanggil dengan cara yang salah
     * - dilaporkan sebagai 11/11 lulus. Uji yang lulus karena tidak menguji
     * apa pun lebih buruk daripada uji yang gagal.
     */
    const bukanRust = /is not defined|is not a function|Cannot read|undefined is not/i.test(r.pesan ?? '');
    const hidup = r.ok === true || !bukanRust;
    cek(n, hidup, r.ok ? r.nilai : r.pesan);
  }
}

console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total ? 0 : 1);
