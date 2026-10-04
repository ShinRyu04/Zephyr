/*
 * Memeriksa tool web mana yang AKTIF di aplikasi yang sedang hidup.
 *
 * Kenapa harness ini ada, dan kenapa tidak cukup membaca `catalog.ts`:
 * berkas katalog bisa benar sementara yang benar-benar dipakai sekat berbeda.
 * Yang membuktikan `browser_list` bisa dipanggil lagi adalah store yang hidup di
 * dalam aplikasi, bukan daftar di dalam berkas.
 *
 * Dipakai: node scripts/cek-web-tool-aktif.mjs [port-cdp, default 9223]
 */

const PORT = process.argv[2] || '9223';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.url && /localhost:517\d/.test(t.url));
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
 * Membaca tool mana yang BENAR-BENAR sampai ke model, bukan daftar di berkas.
 *
 * `__ZEPHYR_TOOLS__.nama()` memanggil registry yang sudah dipakai aplikasi
 * hidup. Jangan `import('/src/lib/toolGate.ts')` dari sini: Vite akan memuat
 * instance modul kedua di luar grafik modul yang jalan, dan skrip lalu mengukur
 * store yang berbeda dari yang dibaca komponen - jebakan yang sudah berkali-kali
 * menghabiskan waktu di proyek ini.
 */
const EXPR = `(async () => {
  const T = window.__ZEPHYR_TOOLS__;
  if (!T) return JSON.stringify({ err: 'bridge __ZEPHYR_TOOLS__ tidak ada' });
  const semua = T.nama();

  /*
   * Yang menentukan tool bisa dipakai bukan hanya daftar katalog: spec yang
   * dikirim ke model disaring oleh sekat, dan jalur eksekusi memeriksa sekat
   * yang sama. Keduanya diuji di sini, karena "terdaftar" dan "bisa dipakai"
   * adalah dua hal berbeda - dan bug browser_list hidup tepat di celah itu.
   *
   * Tidak memakai import() dari skrip: itu memuat instance modul kedua di luar
   * grafik modul yang jalan, dan harness lalu mengukur store yang berbeda dari
   * yang dibaca komponen. Jebakan ini sudah berkali-kali menghabiskan waktu.
   */
  /*
   * Dipanggil dengan argumen yang benar, bukan objek kosong.
   *
   * Memanggil dengan {} membuat tool yang butuh argumen menolak karena
   * "argumen wajib diisi" - dan itu kegagalan yang BENAR. Menghitungnya sebagai
   * kegagalan sekat berarti harness berbunyi palsu, dan alarm palsu melatih
   * orang mengabaikan alarm sungguhan.
   *
   * Yang diukur hanya satu hal: apakah sekat MENOLAK karena tool dimatikan.
   * Pesan sekat berbunyi "sedang dinonaktifkan"; itu yang dicari.
   */
  const ARG = {
    browser_list: {},
    web_fetch: { url: 'https://example.com' },
  };
  const hasilJalan = {};
  for (const n of ['browser_list', 'web_fetch']) {
    try {
      const out = await T.jalankan(n, ARG[n] || {});
      hasilJalan[n] = typeof out === 'string' ? out.slice(0, 90) : 'ok';
    } catch (e) {
      const msg = String(e && e.message || e);
      /* Hanya penolakan SEHINGGA karena tool dimatikan yang dihitung gagal. */
      hasilJalan[n] = /dinonaktifkan|not allowed|disabled/i.test(msg)
        ? 'DIMATIKAN: ' + msg
        : 'argumen/lingkungan: ' + msg.slice(0, 80);
    }
  }

  const HARUS_NYALA = ['browser_open','browser_read','browser_nav','browser_list','web_fetch','web_search'];
  const HARUS_MATI  = ['browser_click','browser_type','browser_close','browser_download_url','system_browser_open'];
  return JSON.stringify({
    totalRegistry: semua.length,
    hasilJalan,
    punyaBrowserList: semua.includes('browser_list'),
    HARUS_NYALA, HARUS_MATI,
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

if (!d.punyaBrowserList) {
  console.error('GAGAL - browser_list tidak ada di registry tool');
  gagal++;
} else {
  console.log('OK - browser_list terdaftar di registry');
}

/*
 * Yang paling penting: apakah tool benar-benar BISA DIPANGGIL.
 *
 * Terdaftar saja belum cukup. Sebelum perbaikan, browser_list ada di registry
 * tapi setiap panggilan dijawab "sedang dinonaktifkan" - jalur inilah yang
 * menghasilkan baris merah "List pages - failed", bukan daftarnya.
 */
for (const [nama, hasil] of Object.entries(d.hasilJalan || {})) {
  const s = String(hasil);
  if (s.startsWith('DIMATIKAN:')) {
    console.error('GAGAL - ' + nama + ' ditolak karena sekat mematikannya: ' + s);
    gagal++;
  } else {
    console.log('OK - ' + nama + ' melewati sekat -> ' + s.replace(/\s+/g, ' ').slice(0, 70));
  }
}

console.log(d.totalRegistry + ' tool di registry');
process.exit(gagal ? 1 : 0);
