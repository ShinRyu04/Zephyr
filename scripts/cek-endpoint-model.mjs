/*
 * BUG 1 - "Test connection" harus menguji endpoint yang BENAR.
 *
 * Gejala asli: pengguna melihat "Test connection OK" padahal chat gagal 404.
 * Sebabnya bukan key-nya. Provider `custom` tidak punya default masuk akal,
 * jadi cabang `_` di Rust diam-diam menguji api.openai.com - kunci yang sah
 * untuk gateway pengguna dikirim ke host lain, dan vonisnya tentang OpenAI,
 * bukan tentang gateway itu.
 *
 * Uji ini memanggil jalur yang SAMA dengan tombol di Settings
 * (`window.__ZEPHYR_SET__.testKey`, yang memanggil `test_model_connection`),
 * lalu memeriksa dua hal untuk tiap kasus:
 *   1. apakah vonisnya benar (gagal untuk URL salah, OK untuk URL benar), dan
 *   2. apakah pesannya MENYEBUT URL yang benar-benar diuji.
 *
 * Syarat: aplikasi hidup dengan port debug 9223.
 *   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" ./target/debug/zephyr.exe
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && (t.url.includes('localhost:5173') || t.url.includes('tauri')));
if (!page) {
  console.error('GAGAL: tidak ada target Zephyr di port 9223');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let seq = 0;
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

/*
 * WebView2 mengumpulkan promise yang di-await lewat Runtime.evaluate
 * ("Promise was collected"), jadi promise-nya disimpan di window lalu dipoll -
 * pola yang sama dipakai scripts/probe.mjs.
 */
const runAsync = async (expr, ms = 20000) => {
  const key = '__CEK_EP_' + ++seq;
  await ev(`window['${key}'] = { done:false, val:null, err:null };
    (async () => { try { window['${key}'].val = await ${expr}; }
      catch(e) { window['${key}'].err = String((e && e.message) || e); }
      finally { window['${key}'].done = true; } })(); 'ok'`);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const o = JSON.parse(await ev(`JSON.stringify(window['${key}'])`));
    if (o.done) {
      await ev(`delete window['${key}']`);
      if (o.err) return { __err: o.err };
      return o.val;
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error('timeout menunggu ' + expr);
};

const hasil = [];
const cek = (nama, lulus, detail) => {
  hasil.push(lulus);
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${detail ? '  ->  ' + detail : ''}`);
};

/*
 * `testKey` di bridge memanggil `test_model_connection` LANGSUNG, sedangkan
 * `ui.testConnection` membungkusnya dan menyimpan hasil ke store. Jalur Rust-nya
 * sama, jadi memanggil testKey sudah cukup untuk menguji bug ini - dan lebih
 * langsung, karena hasilnya tidak perlu dibaca ulang dari store.
 *
 * Key yang dipakai adalah key `custom` yang sudah tersimpan. Nama-nama provider
 * dibaca dari `secrets_snapshot` (isi berkas, bukan nilai key) - satu-satunya
 * cara melihat key apa saja yang ada tanpa menyentuh nilainya. Yang penting di
 * sini hanya NAMANYA, jadi tidak ada key yang pernah ditampilkan.
 *
 * Kalau tidak ada key, uji ini tidak bisa membuktikan host mana yang diuji:
 * Rust berhenti di pemeriksaan key lebih dulu. Karena itu ia berhenti dengan
 * status GAGAL, bukan hijau palsu.
 */
const snapshot = await runAsync('window.__ZEPHYR_SECRETS__.snapshot()');
const providerAdaKey = Object.keys(JSON.parse(snapshot || '{}'));
console.log(`provider dengan key tersimpan: ${providerAdaKey.join(', ') || '(tidak ada)'}`);

if (!providerAdaKey.includes('custom')) {
  console.error('\nGAGAL: tidak ada API key untuk provider custom, jadi endpoint tidak pernah diuji.');
  console.error('        Isi key lewat Settings -> AI Models, lalu jalankan lagi.');
  ws.close();
  process.exit(1);
}
console.log(`jalur: __ZEPHYR_SET__.testKey('custom', baseUrl) -> test_model_connection (Rust)\n`);


// --- 1. baseUrl sengaja salah -> WAJIB gagal, dan pesannya menyebut URL itu.
const salah = await runAsync(`window.__ZEPHYR_SET__.testKey('custom', 'https://rute-salah.invalid/v1')`);
console.log('salah  ->', JSON.stringify(salah));
cek('baseUrl salah DIVONIS GAGAL', salah && salah.ok === false);
cek(
  'pesan menyebut URL yang diuji (bukan OpenAI)',
  !!salah && String(salah.message || '').includes('rute-salah.invalid') && !String(salah.message || '').includes('openai.com'),
  salah?.message,
);

// --- 2. baseUrl kosong -> error JELAS, tidak jatuh ke OpenAI.
const kosong = await runAsync(`window.__ZEPHYR_SET__.testKey('custom', '')`);
console.log('kosong ->', JSON.stringify(kosong));
const teksKosong = JSON.stringify(kosong || {});
cek('baseUrl kosong tidak menguji api.openai.com', !teksKosong.includes('openai.com'), teksKosong.slice(0, 140));
cek(
  'baseUrl kosong memberi pesan yang bisa dibaca',
  teksKosong.toLowerCase().includes('base url'),
  kosong?.__err ?? kosong?.message,
);

// --- 3. baseUrl benar -> benar-benar diuji, dan pesannya menyebutnya.
const benar = await runAsync(`window.__ZEPHYR_SET__.testKey('custom', 'https://modelrouter.id/v1')`, 25000);
console.log('benar  ->', JSON.stringify(benar));
cek(
  'baseUrl benar menyebut modelrouter.id di pesan',
  !!benar && String(benar.message || '').includes('modelrouter.id'),
  benar?.message,
);
cek('baseUrl benar tidak menyebut OpenAI', !String(benar?.message || '').includes('openai'), benar?.message);

/*
 * 4. Provider bernama lain tidak ikut jatuh ke OpenAI.
 *
 * Asersi ini HANYA boleh dijalankan kalau provider itu punya key. Tanpa key,
 * Rust berhenti di "No API key" SEBELUM memilih endpoint, jadi hasilnya tidak
 * membuktikan apa pun soal host - dan menandainya gagal berarti menyalahkan
 * kode atas batas harness. Default loopback `local` sendiri sudah dipin oleh
 * unit test Rust (endpoint_provider_lain_tidak_jatuh_ke_openai), jadi di sini
 * cukup dipastikan lewat jalur hidup bila key-nya ada.
 */
if (providerAdaKey.includes('local')) {
  const lokal = await runAsync(`window.__ZEPHYR_SET__.testKey('local', '')`);
  console.log('local  ->', JSON.stringify(lokal));
  cek(
    'provider local menuju loopback, bukan OpenAI',
    JSON.stringify(lokal || {}).includes('127.0.0.1') && !JSON.stringify(lokal || {}).includes('openai'),
    lokal?.message ?? lokal?.__err,
  );
} else {
  console.log('SKIP   provider local menuju loopback  ->  tidak ada key `local`; default-nya dipin unit test Rust');
}

const lulus = hasil.filter(Boolean).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
ws.close();
process.exit(lulus === hasil.length ? 0 : 1);
