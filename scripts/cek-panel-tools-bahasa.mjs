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
 * T4 DULU memeriksa "deskripsi JA harus berbeda dari EN". Premis itu SALAH:
 * `deskripsiTool` hanya punya blok ID dan EN, jadi bahasa selain 'id' SELALU
 * jatuh ke Inggris - bukan karena ada yang lupa menerjemahkan, melainkan karena
 * deskripsi tool memang hanya shipping dua bahasa itu. Harness lama tidak
 * bisa lulus dalam keadaan yang benar.
 *
 * Dua bug di dalam satu baris lamanya:
 *   - `.slice(0, 5)` dipotong SEBELUM dihitung, jadi panjangnya tidak pernah
 *     lebih dari 5, dan ambang `< 5` sebenarnya berarti "<= 4". Angka itu
 *     hasil pemotongan, bukan hasil pengukuran.
 *   - ambang `< 5` dipilih supaya jumlah temuan enak dibaca, bukan supaya
 *     keadaan benar. Kalau jumlah sebenarnya 5, ia gagal - padahal kegagalan
 *     itu tidak artinya apa-apa.
 *
 * Yang dijaga sekarang adalah hal yang benar-benar bisa rusak: bahasa lain
 * harus mengembalikan deskripsi terisi (fallback bekerja, panel tidak pernah
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
  const { useStore } = await import('/src/lib/store.ts');
  const { useToolGate } = await import('/src/lib/toolGate.ts');
  const uiLangAsli = useStore.getState().settings.general.uiLang;
  const bukaAsli = useToolGate.getState().buka;

  /* Paksa bahasa English, buka panel Tools.
   *
   * Dua pemanggilan versi lama tidak pernah bekerja:
   *   - st.setSetting('general.uiLang', 'en') melempar TypeError, fungsi itu
   *     tidak ada di store. Store menyediakan applySettings.
   *   - st.setToolGateOpen?.(true) tidak ada sama sekali. Tanda '?' membuat
   *     pemanggilan yang hilang SUNYI - tidak ada error, tidak ada panel.
   *     Karena itu T5 sempat mengukur SELURUH halaman dan menuduh kata
   *     "Buka" dari sidebar sebagai kebocoran bahasa tool.
   * Panel digerakkan store-nya sendiri: useToolGate().setBuka(true).
   */
  await useStore.getState().applySettings({
    general: { ...useStore.getState().settings.general, uiLang: 'en' },
  });
  useToolGate.getState().setBuka(true);
  await new Promise((r) => setTimeout(r, 700));

  /* Kuncinya data-testid="toolgate". Kalau tidak ketemu, hasilnya TIDAK
     boleh diam-diam jatuh ke document.body: mengukur seluruh halaman bukan
     mengukur panel, dan hasilnya menuduh teks milik bagian lain. */
  const panel = document.querySelector('[data-testid="toolgate"]');
  const hasil = panel
    ? { panjang: (panel.innerText || '').length, cuplikan: (panel.innerText || '').slice(0, 600), adaPanel: true }
    : { panjang: 0, cuplikan: '', adaPanel: false };

  /* Kembalikan seperti semula: bahasa dan keadaan panel. Harness yang
     mengubah state global dan tidak memulihkannya membuat uji berikutnya
     bergantung urutan, dan kelihatan seperti produknya yang rusak. */
  useToolGate.getState().setBuka(bukaAsli);
  await useStore.getState().applySettings({
    general: { ...useStore.getState().settings.general, uiLang: uiLangAsli },
  });
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
