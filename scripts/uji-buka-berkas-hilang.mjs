/*
 * Buktikan: membuka berkas yang TIDAK ADA tidak lagi melempar.
 *
 * Ini yang mematikan loop agent. Bukti dari log Zephyr:
 *
 *   07:42:00  fs_write   situs/index.html
 *   07:42:48  ERROR webview: unhandledrejection
 *             {"code":"NotFound","message":"not found: situs/styles.css is missing"}
 *
 * Model sedang menulis tiga berkas, dan menyebut `situs/styles.css` di
 * kalimatnya SEBELUM berkasnya ada. Rujukan ke berkas yang belum ditulis itu
 * keadaan NORMAL untuk agent yang membangun - bukan kasus tepi.
 *
 * Uji ini memanggil openPathAt dengan berkas yang memang tidak ada, lalu
 * memeriksa dua hal:
 *   1. promise-nya TIDAK ditolak (tidak ada unhandledrejection baru)
 *   2. error di console tidak bertambah
 *
 * Tanpa 2, uji hanya membuktikan promise-nya selesai - bukan bahwa renderer
 * bersih dari lemparan yang tidak tertangani.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
if (!page) {
  console.log('Zephyr tidak ketemu');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
const peristiwa = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown' || m.method === 'Runtime.consoleAPICalled') peristiwa.push(m);
};
const ev = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) {
    return 'GALAT: ' + String(r.result.exceptionDetails.exception?.description ?? '').split('\n')[0];
  }
  return r.result?.result?.value;
};

await send('Runtime.enable', {});
peristiwa.length = 0;

console.log('=== membuka berkas yang TIDAK ada, lewat perintah yang sama dipakai pengguna ===');
/*
 * Dipanggil lewat __ZEPHYR_CMD__ (bukan store langsung), karena itu jalur yang
 * benar-benar dipakai klik pengguna dan rujukan berkas di jawaban model.
 */
const hasil = await ev(
  `(async () => {
    try {
      await window.__ZEPHYR_CMD__('open', { path: 'situs/berkas-yang-tidak-ada.css' });
      return 'selesai tanpa lemparan';
    } catch (e) {
      return 'MELEMPAR: ' + String(e && e.message || e);
    }
  })()`,
  true,
);
console.log('  ->', hasil);

/* Beri waktu microtask & render selesai, supaya penolakan yang tertunda terlihat. */
await new Promise((r) => setTimeout(r, 1500));

let lulus = 0;
let total = 0;
const uji = (nama, ok, bukti) => {
  total++;
  if (ok) {
    console.log(`  LULUS  ${nama}`);
    lulus++;
  } else console.log(`  GAGAL  ${nama}${bukti !== undefined ? '  -> ' + JSON.stringify(bukti) : ''}`);
};

uji('openPathAt selesai tanpa melempar', hasil === 'selesai tanpa lemparan', hasil);

const lemparan = peristiwa.filter(
  (p) => p.method === 'Runtime.exceptionThrown' || (p.params?.args || []).some((a) => /NotFound|is missing/i.test(String(a.value ?? ''))),
);
console.log(`\n  peristiwa error tertangkap: ${lemparan.length}`);
for (const l of lemparan.slice(0, 3)) {
  console.log('   ', JSON.stringify(l.params).slice(0, 220));
}
uji('tidak ada unhandledrejection baru', lemparan.length === 0, lemparan.length);

/* Store masih hidup sesudahnya - ini yang sebenarnya dipertaruhkan. */
const hidup = await ev(`(() => {
  const a = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({ adaStore: !!window.__ZEPHYR_AI__, sesi: a.sessions.length });
})()`);
console.log('  store sesudahnya:', hidup);
uji('store masih sehat', typeof hidup === 'string' && hidup.includes('"adaStore":true'), hidup);

ws.close();
console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
