/**
 * cek-panel-tools-bahasa.mjs - panel Tools mengikuti bahasa aktif.
 *
 *   node scripts/cek-panel-tools-bahasa.mjs 9223
 *
 * Ini uji terhadap KELUHAN NYATA user: "tools nya masih bahasa indonesia" dan
 * "masih banyak indo nya". Karena itu yang diperiksa adalah TEKS YANG TERLIHAT
 * DI LAYAR, bukan ada-tidaknya entri di kamus - entri kamus bisa lengkap
 * sementara panelnya tidak pernah memakainya.
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = Number(process.argv[2] || 9223);
const { cdp } = await Cdp.attach(PORT, 'Zephyr');
const r = reporter('cek-panel-tools-bahasa');

/* Kata Indonesia khas yang TIDAK boleh muncul saat bahasa English. */
const KATA_INDONESIA =
  /\b(Baca|Tulis|Berkas|Cari|Jalankan|Buka|Tutup|Simpan|Batal|Hapus|Ubah|Tambah|Gagal|Berhasil|Sedang|Menunggu|Selesai|Pengaturan|Jendela|Perintah|Pilih|Kirim|Alat|Tugas|Riwayat|Catatan|Jadwal|Hanya|Tanpa|Atau|Dengan|Untuk|Dari|Pada|Adalah|Bisa|Harus|Kalau|Setelah|Karena)\b/;

console.log('\n== Panel Tools mengikuti bahasa ==');

const d = await cdp.json(`return JSON.stringify(await (async () => {
  const { deskripsiTool } = await import('/src/lib/zephyrTools/deskripsiTool.ts');
  const { TOOL_CATALOG } = await import('/src/lib/zephyrTools/catalog.ts');
  const nama = TOOL_CATALOG.map((t) => t.name);

  const en = {}, id = {};
  for (const n of nama) { en[n] = deskripsiTool(n, 'en'); id[n] = deskripsiTool(n, 'id'); }

  /* Berapa deskripsi EN yang masih memuat kata Indonesia? */
  const KATA = /\\b(Baca|Tulis|Berkas|Cari|Jalankan|Buka|Tutup|Simpan|Batal|Hapus|Ubah|Tambah|Gagal|Berhasil|Sedang|Menunggu|Selesai|Pengaturan|Jendela|Perintah|Pilih|Kirim|Alat|Tugas|Riwayat|Catatan|Jadwal|Hanya|Tanpa|Atau|Dengan|Untuk|Dari|Pada|Adalah|Bisa|Harus|Kalau|Setelah|Karena)\\b/;
  const masihIndo = nama.filter((n) => KATA.test(en[n] || ''));
  const kosong = nama.filter((n) => !en[n]);

  /* Bahasa lain tidak boleh sama dengan Inggris untuk deskripsi prosa. */
  const ja = {};
  for (const n of nama) ja[n] = deskripsiTool(n, 'ja');
  const jumlahFallback = nama.filter((n) => ja[n] && ja[n] === en[n]).length;
  const contohFallback = nama.filter((n) => ja[n] && ja[n] === en[n]).slice(0, 5);
  const idDesc = {};
  for (const n of nama) idDesc[n] = deskripsiTool(n, 'id');

  return {
    total: nama.length,
    masihIndo,
    kosong,
    contohEn: en[nama[0]],
    jumlahFallback,
    contohFallback,
    jaKosong: nama.filter((n) => !ja[n]),
    idKosong: nama.filter((n) => !idDesc[n]),
  };
})())`);
const info = typeof d === 'string' ? JSON.parse(d) : d;

/*
 * T1 DULU `info.total === 54`. Angka kaku itu hanya mendeteksi bahwa ada tool
 * baru, bukan mendeteksi keadaan rusak - dan hanya jadi kegagalan palsu setiap
 * kali katalog bertambah (terbukti: 54 -> 56 saat `think` dan `calculator`
 * masuk). Yang dijaga di sini adalah katalog benar-benar terbaca.
 */
r.check('T1', info.total > 0, `${info.total} tool di katalog`);
r.check('T2', info.kosong.length === 0, `${info.kosong.length} deskripsi kosong` + (info.kosong.length ? ` :: ${info.kosong.join(', ')}` : ''));
r.check('T3', info.masihIndo.length === 0, `${info.masihIndo.length} deskripsi EN masih memuat kata Indonesia` + (info.masihIndo.length ? ` :: ${info.masihIndo.join(', ')}` : ''));

/*
 * T4 DULU memeriksa "deskripsi JA harus berbeda dari EN". Pada saat itu premis
 * itu SALAH: `deskripsiTool` hanya punya blok ID dan EN, jadi bahasa selain
 * 'id' SELALU jatuh ke Inggris - bukan karena ada yang lupa menerjemahkan,
 * melainkan karena deskripsi tool memang baru mengangkut dua bahasa itu.
 * Harness lama tidak bisa lulus dalam keadaan yang benar.
 *
 * Sejak delapan bahasa lain menyusul (ja, ko, zh, es, fr, de, pt, ar), premis
 * "JA harus berbeda dari EN" menjadi BENAR - tapi T4 tetap TIDAK memakainya
 * sebagai ambang, karena aturan itu sudah diuji jauh lebih keras di
 * `cek-panel-tools-10bahasa.mjs`: di sana sepuluh bahasa diuji dari DOM yang
 * hidup, masing-masing dengan penanda aksaranya sendiri. Mengulangnya di sini
 * sebagai ambang hanya akan menambah tempat yang harus disunting setiap kali
 * ada bahasa baru.
 *
 * Dua bug di dalam satu baris lamanya, tetap dicatat supaya tidak terulang:
 *   - `.slice(0, 5)` dipotong SEBELUM dihitung, jadi panjangnya tidak pernah
 *     lebih dari 5, dan ambang `< 5` sebenarnya berarti "<= 4". Angka itu
 *     hasil pemotongan, bukan hasil pengukuran.
 *   - ambang `< 5` dipilih supaya jumlah temuan enak dibaca, bukan supaya
 *     keadaan benar. Kalau jumlah sebenarnya 5, ia gagal - padahal kegagalan
 *     itu tidak artinya apa-apa.
 *
 * Yang dijaga di sini adalah hal yang benar-benar bisa rusak: setiap bahasa
 * harus mengembalikan deskripsi TERISI (fallback bekerja, panel tidak pernah
 * menampilkan baris kosong). Berapa banyak yang memakai fallback dilaporkan,
 * bukan dipakai sebagai ambang.
 */
r.check(
  'T4',
  info.jaKosong.length === 0 && info.idKosong.length === 0,
  `fallback ke EN dipakai ${info.jumlahFallback}/${info.total} deskripsi`
    + (info.jaKosong.length ? ` :: ${info.jaKosong.join(', ')}` : '')
    + (info.contohFallback.length ? ` (contoh: ${info.contohFallback.join(', ')})` : ''),
);

/*
 * Teks yang benar-benar TERLIHAT: buka panel Tools lewat store dan baca DOM.
 * Ini yang membedakan "kamusnya lengkap" dari "layarnya benar".
 */
console.log('\n== Teks yang benar-benar terlihat ==');
const layar = await cdp.json(`return JSON.stringify(await (async () => {
  /* PENTING: jangan mengimpor store dari skrip ini.
   *
   * Dynamic import('/src/lib/toolGate.ts') memberi instance modul yang BERBEDA
   * dari yang sedang dipakai komponen yang hidup, jadi setBuka(true) menulis ke
   * store yang tidak ada subscribed-nya. Akibatnya 'buka' terbaca true di store
   * harness sementara panel tidak pernah muncul - persis keadaan yang membuat T5
   * terlihat seperti bug produk. devBridge.ts sendiri sudah memperingatkan ini:
   * "mistaken for an application bug more than once".
   *
   * Yang dipakai di bawah, bukan menebak:
   *   __ZEPHYR__       = store aplikasi (baca)
   *   __ZEPHYR_SET__   = setter applySettings yang benar
   *   __ZEPHYR_SETTINGS__ = hanya buka/tutup HALAMAN Settings, bukan setter
   */
  const S = window.__ZEPHYR_SET__;
  const uiLangAsli = window.__ZEPHYR__.getState().settings.general.uiLang;

  /* Buka picker tool lewat jalur UI nyata: tombol "..." (ai-more) -> menu ->
     "Chat Settings" (ai-open-chat-settings) -> nav Tools (cset-nav-tools) ->
     "Open tool sets…" (cset-tools). Entri menu "Tool Sets"
     (ai-open-toolsets) dan tombol lama 'ai-toolgate' sudah dihapus. */
  const bukaGate = async () => {
    if (document.querySelector('[data-testid="toolgate"]')) return true;
    const more = document.querySelector('[data-testid="ai-more"]');
    if (!more) return false;
    more.click(); await new Promise((r) => setTimeout(r, 300));
    const cs = document.querySelector('[data-testid="ai-open-chat-settings"]');
    if (!cs) return false;
    cs.click(); await new Promise((r) => setTimeout(r, 500));
    document.querySelector('[data-testid="cset-nav-tools"]')?.click();
    await new Promise((r) => setTimeout(r, 400));
    const tombol = document.querySelector('[data-testid="cset-tools"]');
    if (!tombol) return false;
    tombol.click();
    await new Promise((r) => setTimeout(r, 600));
    return !!document.querySelector('[data-testid="toolgate"]');
  };
  if (!(await bukaGate())) {
    return JSON.stringify({ adaPanel: false, panjang: 0, cuplikan: '', sebab: 'picker tool tidak terbuka lewat menu \"..." -> Chat Settings -> Tools -> cset-tools' });
  }

  /* Paksa bahasa English lewat store ASLI, lalu buka panel lewat KLIK TOMBOL
     yang sebenarnya - bukan lewat setBuka. Klik memakai store milik komponen,
     jadi kalau panel tetap tidak muncul itu berarti produknya, bukan harness. */
  await S.set({ general: { ...window.__ZEPHYR__.getState().settings.general, uiLang: 'en' } });
  await new Promise((r) => setTimeout(r, 400));

  await bukaGate();

  /* Kuncinya data-testid="toolgate". Kalau tidak ketemu, hasilnya TIDAK
     boleh diam-diam jatuh ke document.body: mengukur seluruh halaman bukan
     mengukur panel, dan hasilnya menuduh teks milik bagian lain. */
  const panel = document.querySelector('[data-testid="toolgate"]');
  const hasil = panel
    ? { panjang: (panel.innerText || '').length, cuplikan: (panel.innerText || '').slice(0, 600), adaPanel: true }
    : { panjang: 0, cuplikan: '', adaPanel: false, sebab: 'klik tombol tidak menghasilkan panel' };

  /* Kembalikan seperti semula: bahasa dan keadaan panel. Harness yang
     mengubah state global dan tidak memulihkannya membuat uji berikutnya
     bergantung urutan, dan kelihatan seperti produknya yang rusak.
     Panel ditutup lewat jalur asli (Escape), bukan dengan mengklik ulang
     pembukanya - pembukanya sekarang item menu, bukan tombol toggle. */
  if (panel) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 400)); }
  await S.set({ general: { ...window.__ZEPHYR__.getState().settings.general, uiLang: uiLangAsli } });
  return hasil;
})())`);
const l = typeof layar === 'string' ? JSON.parse(layar) : layar;
console.log(`  panel terdeteksi: ${l.adaPanel} | panjang teks: ${l.panjang}`);
if (l.cuplikan) console.log('  cuplikan: ' + JSON.stringify(l.cuplikan.slice(0, 220)));

if (l.panjang > 0) {
  const kena = l.cuplikan.match(KATA_INDONESIA);
  r.check('T5', !kena, kena ? `teks Indonesia terlihat: ${JSON.stringify(kena[0])}` : 'tidak ada kata Indonesia di cuplikan');
} else {
  r.check('T5', false, 'panel Tools tidak menghasilkan teks - uji tidak membuktikan apa pun');
}

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
