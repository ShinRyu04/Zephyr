// verify-i18n-dom.mjs — VERIFIKASI: dengan bahasa non-Indonesia, tidak boleh ada
// teks Indonesia yang tampil di DOM.
//
// Ini uji yang sebenarnya (bukan hitung string di kode): ambil SEMUA teks yang
// benar-benar dirender, lalu cari kata Indonesia. Kalau ketemu, laporkan
// elemennya supaya bisa diperbaiki — bukan sekadar bilang "masih ada sisa".
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

// Hanya kata yang benar-benar Indonesia dan TIDAK dipakai sebagai kata Inggris
// di UI. Kata seperti "pane", "tab", "new", "open", "file", "format" dulu
// membuat hampir semua tooltip Inggris ditandai "Indonesia" (false positive).
const KATA_ID = [
  'Lompat', 'Buka', 'Simpan', 'Hapus', 'Tutup', 'Cari', 'Ubah', 'Tambah', 'Buang',
  'Kirim', 'Jalankan', 'Muat', 'Salin', 'Tempel', 'Ganti', 'Pilih', 'Terapkan',
  'Sisipkan', 'Izinkan', 'Batalkan', 'Lanjut', 'Kembali', 'Selesai', 'Gagal',
  'Berhasil', 'Klik', 'Tekan', 'sedang', 'belum', 'sudah', 'perintah', 'berkas',
  'jendela', 'pengaturan', 'kesalahan', 'peringatan', 'kosong',
  'riwayat', 'tugas', 'yang', 'dengan', 'untuk', 'dari', 'tidak',
  'semua', 'harus', 'wajib', 'sebelumnya', 'berikutnya', 'dokumen', 'tampilan',
  'perbesar', 'perkecil', 'menyimpan', 'membuka', 'pemberitahuan', 'diperbarui',
];

const { cdp } = await Cdp.attach('9223');
await sleep(400);

// pastikan bahasa aktif bukan Indonesia
const lang = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    try { return window.__ZEPHYR__.getState().settings.general.uiLang; }
    catch { return '(?)'; }
  })()`,
  returnByValue: true,
});
// Uji ini hanya bermakna saat bahasa BUKAN Indonesia; kalau masih 'id',
// penanda Indonesia memang wajar. Pastikan dulu bahasa aktifnya.
const bahasa = lang?.result?.result?.value ?? '(?)';
if (bahasa === 'id') {
  console.log('bahasa aktif : id');
  console.log('SKIP: bahasa masih Indonesia; set bahasa non-id dulu untuk menguji.');
  process.exit(0);
}

const expr = `(() => {
  const hasil = [];
  const jalan = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) jalan(el.shadowRoot);
      // hanya simpul teks langsung
      for (const n of el.childNodes) {
        if (n.nodeType !== 3) continue;
        const t = (n.textContent || '').trim();
        if (t.length < 4) continue;
        hasil.push({
          teks: t.slice(0, 70),
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 40),
          testid: el.getAttribute('data-testid') || '',
          title: (el.getAttribute('title') || '').slice(0, 60),
        });
      }
      // atribut title & placeholder & aria-label juga terlihat user
      for (const at of ['title', 'placeholder', 'aria-label']) {
        const v = el.getAttribute && el.getAttribute(at);
        if (v && v.trim().length >= 4) hasil.push({ teks: v.trim().slice(0, 70), tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40), testid: el.getAttribute('data-testid') || '', at });
      }
    }
  };
  jalan(document.body);
  return JSON.stringify(hasil);
})()`;

const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
const semua = JSON.parse(r?.result?.result?.value ?? '[]');

const KATA = KATA_ID;
const re = new RegExp('\\b(' + KATA.join('|') + ')\\b');
const kena = semua.filter((s) => re.test(s.teks));

console.log('bahasa aktif :', bahasa);
console.log('simpul teks  :', semua.length);
console.log('teks Indonesia:', kena.length);
console.log('');
const unik = new Map();
for (const k of kena) if (!unik.has(k.teks)) unik.set(k.teks, k);
for (const [t, k] of [...unik].slice(0, 40)) {
  console.log(`  [${k.tag}${k.cls ? '.' + k.cls.split(' ')[0] : ''}] ${t}`);
}
process.exit(kena.length ? 1 : 0);
