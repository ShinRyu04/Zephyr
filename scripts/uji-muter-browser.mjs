/**
 * uji-muter-browser.mjs - bukti guard treadmill browser.
 *
 * Dua keluhan user yang diuji di sini:
 *   1. "gua suruh buka page, dia masih kerja terus bukan berhenti"
 *      -> halaman terbuka, lalu model memanggil browser_read berkali-kali.
 *         Sebelum perbaikan, `halamanTerbuka` tidak pernah menyala untuk
 *         permintaan biasa, jadi guard-nya mati dan loop jalan sampai 120 langkah.
 *   2. "cuma muter di layar thinking tanpa tool baru"
 *      -> perilaku normal SELAMA halaman BELUM terbuka: penghitung tidak boleh
 *         naik, karena membuka halaman baru tetap kemajuan yang sah.
 *
 *   node scripts/uji-muter-browser.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('guard treadmill browser');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);
cdp.snapshot = null;

const ada = await cdp.eval(`!!(window.__ZEPHYR_MUTER__ && window.__ZEPHYR_MUTER__.cek)`);
R.check('M1', ada === true, 'bridge guard tersedia di mode dev');
if (!ada) {
  R.selesai();
  await cdp.close();
  process.exit(1);
}

const batas = await cdp.eval(`window.__ZEPHYR_MUTER__.batas`);
R.check('M2', batas === 3, `batas muter = ${batas} langkah berturut-turut`);

/**
 * Jalankan urutan panggilan tool, kembalikan jejak penghitung + kapan berhenti.
 */
async function jalankan(urutan) {
  return cdp.json(`return JSON.stringify((() => {
    const M = window.__ZEPHYR_MUTER__;
    let terbuka = false;
    let muter = 0;
    const urls = [];
    const jejak = [];
    for (const [nama, args, suksesOpen] of ${JSON.stringify(urutan)}) {
      const hasil = M.cek(terbuka, muter, urls, nama, args || {});
      muter = hasil.muter;
      jejak.push({ nama, muter, berhenti: hasil.berhenti });
      if (hasil.berhenti) break;
      if (suksesOpen) {
        terbuka = true;
        const u = String((args && args.url) || '').trim().toLowerCase().replace(/\\/+$/, '');
        if (u && !urls.includes(u)) urls.push(u);
      }
    }
    return { jejak, jumlahLangkah: jejak.length, berhentiDi: jejak.findIndex((j) => j.berhenti) };
  })())`);
}

/*
 * Skenario 1: permintaan BIASA (bukan navigation-only).
 * Model buka halaman, lalu ngotot membacanya berulang kali.
 */
const biasa = await jalankan([
  ['browser_open', { url: 'https://example.com' }, true],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
]);

R.check(
  'M3',
  biasa.jumlahLangkah <= 6 && biasa.jumlahLangkah >= batas + 1,
  `run BERHENTI setelah ${biasa.jumlahLangkah} langkah, bukan jalan sampai MAX_AGENT_STEPS (berhenti di indeks ${biasa.berhentiDi})`,
);
R.check(
  'M4',
  biasa.jejak.filter((j) => j.berhenti).length === 1,
  'guard menembak tepat sekali',
);

/*
 * Skenario 2: membuka halaman BARU selalu kemajuan.
 * Counter harus mereset tiap kali URL yang belum pernah dibuka muncul.
 */
const baru = await jalankan([
  ['browser_open', { url: 'https://a.com' }, true],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_open', { url: 'https://b.com' }, true],
  ['browser_read', {}, false],
  ['browser_open', { url: 'https://c.com' }, true],
  ['browser_read', {}, false],
]);

const resetTerjadi = baru.jejak.filter((j, i) => i > 0 && j.muter === 0).length;
R.check('M5', resetTerjadi === 2, `membuka url baru mereset penghitung (${resetTerjadi} reset, harap 2)`);
R.check('M6', baru.jejak.every((j) => !j.berhenti), 'tiga halaman berbeda tidak pernah dihentikan');

/*
 * Skenario 3: membuka ULANG url yang sama bukan kemajuan.
 */
const ulang = await jalankan([
  ['browser_open', { url: 'https://a.com' }, true],
  ['browser_open', { url: 'https://a.com' }, false],
  ['browser_open', { url: 'https://a.com' }, false],
  ['browser_open', { url: 'https://a.com' }, false],
  ['browser_open', { url: 'https://a.com' }, false],
]);
R.check('M7', ulang.jejak.some((j) => j.berhenti), 'membuka ulang url yang sama akhirnya dihentikan');

/*
 * Skenario 4: sebelum halaman terbuka, TIDAK ADA yang dihitung muter.
 * Ini yang menjaga "buka halaman X" tetap bisa jalan sampai berhasil.
 */
const belum = await jalankan([
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
  ['browser_read', {}, false],
]);
R.check(
  'M8',
  belum.jejak.every((j) => j.muter === 0 && !j.berhenti),
  'sebelum ada halaman, penghitung tidak naik - membuka tetap boleh',
);

/* Klasifikasi permintaan navigasi - memengaruhi jalur "selesai setelah buka". */
const nav1 = await cdp.eval(`window.__ZEPHYR_MUTER__.isNavigasi('buka google.com')`);
const nav2 = await cdp.eval(`window.__ZEPHYR_MUTER__.isNavigasi('baca D:/Talos/index.html lalu ringkas isinya')`);
R.check('M9', nav1 === true, `"buka google.com" dikenali sebagai navigasi (dapat: ${nav1})`);
R.check('M10', nav2 === false, `perintah kerja biasa BUKAN navigasi (dapat: ${nav2})`);

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
