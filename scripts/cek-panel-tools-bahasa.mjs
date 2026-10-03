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
  const { deskripsiTool } = await import('/src/lib/tediTools/deskripsiTool.ts');
  const { TOOL_CATALOG } = await import('/src/lib/tediTools/catalog.ts');
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
  const jaSamaDenganEn = nama.filter((n) => ja[n] && ja[n] === en[n]).slice(0, 5);

  return { total: nama.length, masihIndo, kosong, contohEn: en[nama[0]], jaSamaDenganEn };
})())`);
const info = typeof d === 'string' ? JSON.parse(d) : d;

r.check('T1', info.total === 54, `${info.total} tool di katalog`);
r.check('T2', info.kosong.length === 0, `${info.kosong.length} deskripsi kosong` + (info.kosong.length ? ` :: ${info.kosong.join(', ')}` : ''));
r.check('T3', info.masihIndo.length === 0, `${info.masihIndo.length} deskripsi EN masih memuat kata Indonesia` + (info.masihIndo.length ? ` :: ${info.masihIndo.join(', ')}` : ''));
r.check('T4', info.jaSamaDenganEn.length < 5, `${info.jaSamaDenganEn.length} deskripsi JA sama persis dengan EN (prosa yang tidak diterjemahkan)`);

/*
 * Teks yang benar-benar TERLIHAT: buka panel Tools lewat store dan baca DOM.
 * Ini yang membedakan "kamusnya lengkap" dari "layarnya benar".
 */
console.log('\n== Teks yang benar-benar terlihat ==');
const layar = await cdp.json(`return JSON.stringify(await (async () => {
  const { useStore } = await import('/src/lib/store.ts');
  /* Paksa bahasa English, buka panel Tools. */
  useStore.getState().setSetting('general.uiLang', 'en');
  useStore.getState().setToolGateOpen?.(true);
  await new Promise((r) => setTimeout(r, 600));
  const panel = document.querySelector('[data-testid="tool-gate-panel"]')
    || document.querySelector('.tool-gate-panel')
    || document.querySelector('[class*="tool-picker"]')
    || document.body;
  const teks = (panel.innerText || '').slice(0, 4000);
  return { panjang: teks.length, cuplikan: teks.slice(0, 600), adaPanel: panel !== document.body };
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
