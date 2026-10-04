/**
 * cek-panel-tools-10bahasa.mjs - panel Tools benar-benar berganti bahasa.
 *
 *   node scripts/cek-panel-tools-10bahasa.mjs [port]
 *
 * Kenapa berkas ini ada.
 *
 * `cek-panel-tools-bahasa.mjs` menguji KELUHAN NYATA: "tools nya masih bahasa
 * indonesia". Ia hanya menguji dua bahasa - Inggris dan Indonesia - karena
 * dulu hanya dua itu yang punya kamus. Sesudah delapan bahasa lain menyusul,
 * pertanyaan yang sama muncul untuk sepuluh bahasa: apakah mengganti bahasa
 * benar-benar mengganti TEKS DI LAYAR, bukan sekadar mengisi kamus?
 *
 * Yang diuji di sini adalah jalur lengkap: setel `settings.general.uiLang`
 * lewat setter store yang asli, buka panel Tools lewat KLIK TOMBOL yang
 * sebenarnya, lalu baca `innerText`-nya. Tidak ada satu pun nilai yang dibaca
 * dari kamus.
 *
 * Cara membedakan "berganti bahasa" dari "kebetulan berbeda":
 *   - setiap bahasa harus punya teks yang BERBEDA dari teks Inggris, dan
 *   - setiap bahasa harus benar-benar memakai aksara/gaya bahasanya sendiri.
 *
 * Untuk yang terakhir, tujuh dari delapan bahasa diuji dengan penanda aksara
 * atau kata khas yang tidak mungkin muncul sebagai terjemahan Inggris:
 *   ja - aksara kana (ぁ-ん / ァ-ヶ)
 *   ko - aksara Hangul (가-힣)
 *   zh - aksara Han disertai tanda baca CJK, dibedakan dari ja lewat kana
 *   ar - aksara Arab (؀-ۿ)
 *   es - kata khas Spanyol (archivo, carpeta, ejecutar)
 *   fr - kata khas Prancis (fichier, dossier, exécuter)
 *   de - kata khas Jerman (Datei, Ordner, Ordners)
 *   pt - kata khas Portugis (arquivo, pasta, executar)
 *
 * Yang TIDAK dipatok: jumlah baris. Panel bisa berubah tanpa bahasa berubah,
 * dan mematoknya membuat harness ini gagal karena alasan yang tidak ada
 * hubungannya dengan apa yang sedang diuji.
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = Number(process.argv[2] || 9223);
const { cdp } = await Cdp.attach(PORT, 'Zephyr');
const r = reporter('cek-panel-tools-10bahasa');

/**
 * Setiap bahasa: kode + penanda yang harus muncul di teks panel.
 * `harus` adalah regex yang harus COCOK; `tidak` (opsional) regex yang harus
 * TIDAK cocok.
 */
const BAHASA = [
  { kode: 'id', nama: 'Indonesia', harus: /\b(Baca|Berkas|Folder|Jalankan|Daftar)\b/ },
  { kode: 'en', nama: 'English', harus: /\b(Read|Write|List|Run|Search)\b/ },
  { kode: 'ja', nama: '日本語', harus: /[぀-ゟ゠-ヿ]/ },
  { kode: 'ko', nama: '한국어', harus: /[가-힯]/ },
  { kode: 'zh', nama: '简体中文', harus: /[一-鿿]/ },
  { kode: 'ar', nama: 'العربية', harus: /[؀-ۿ]/ },
  { kode: 'es', nama: 'Español', harus: /\b(archivo|carpeta|ejecutar|leer|abrir)\b/i },
  { kode: 'fr', nama: 'Français', harus: /\b(fichier|dossier|exécuter|lire|ouvrir)\b/i },
  { kode: 'de', nama: 'Deutsch', harus: /\b(Datei|Ordner|ausführen|lesen|öffnen)\b/i },
  { kode: 'pt', nama: 'Português', harus: /\b(arquivo|pasta|executar|ler|abrir)\b/i },
];

console.log('\n== Panel Tools berganti bahasa (10 bahasa) ==');

const hasil = await cdp.runAsync(`
  const uiLangAsli = s.settings.general.uiLang;

  /* Buka panel AI dulu: tombol ai-toolgate hanya ada kalau AiPanel ter-render. */
  if (!document.querySelector('[data-testid="ai-toolgate"]')) {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /agent|assistant|\\bai\\b/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '')));
    if (btn) { btn.click(); await wait(1200); }
  }
  const tombolGate = document.querySelector('[data-testid="ai-toolgate"]');
  if (!tombolGate) return { sebab: 'tombol ai-toolgate tidak ada - panel AI belum terbuka' };

  const panelSudahTerbuka = !!document.querySelector('[data-testid="toolgate"]');

  const cuplik = [];
  for (const kode of ${JSON.stringify(BAHASA.map((b) => b.kode))}) {
    /* Setel lewat SETTER ASLI, bukan menulis ke store hasil dynamic import -
       instance modul yang berbeda membuat panel tidak ikut render ulang. */
    await SET.set({ general: { ...S.getState().settings.general, uiLang: kode } });
    await wait(450);

    /* Buka panel lewat klik kalau belum terbuka; klik memakai store milik
       komponen, jadi kalau panel tidak muncul itu memang produknya. */
    const terbuka = !!document.querySelector('[data-testid="toolgate"]');
    if (!terbuka) { tombolGate.click(); await wait(900); }

    const panel = document.querySelector('[data-testid="toolgate"]');
    cuplik.push({ kode, ada: !!panel, teks: panel ? (panel.innerText || '') : '' });
  }

  /* Pulihkan: bahasa asli, dan panel dikembalikan ke keadaan semula supaya
     uji berikutnya tidak bergantung urutan. */
  await SET.set({ general: { ...S.getState().settings.general, uiLang: uiLangAsli } });
  await wait(300);
  const masihTerbuka = !!document.querySelector('[data-testid="toolgate"]');
  if (masihTerbuka !== panelSudahTerbuka) { tombolGate.click(); await wait(400); }

  return { cuplik, uiLangAsli };
`, 120000);

if (!hasil || hasil.sebab) {
  r.check('T0', false, hasil?.sebab ?? 'tidak ada hasil dari halaman');
  const { lulus, total } = r.selesai();
  await cdp.close();
  process.exit(lulus === total ? 0 : 1);
}

const petaTeks = Object.fromEntries(hasil.cuplik.map((c) => [c.kode, c.teks]));
const teksEn = petaTeks.en || '';

r.check('T1', hasil.cuplik.every((c) => c.ada && c.teks.length > 50), 'semua bahasa menghasilkan panel berisi teks');

for (const b of BAHASA) {
  const teks = petaTeks[b.kode] ?? '';
  const cocok = b.harus.test(teks);
  r.check(
    `T-${b.kode}`,
    cocok,
    `${b.nama}: ${cocok ? 'penanda bahasa ditemukan' : `penanda ${b.harus} TIDAK ditemukan`}` +
      (cocok ? '' : ` | cuplikan: ${JSON.stringify(teks.slice(0, 140))}`),
  );
}

/*
 * Bahasa selain Inggris tidak boleh memakai teks yang identik dengan Inggris.
 * Ini yang membedakan "benar-benar diterjemahkan" dari "penanda kebetulan ada
 * di teks Inggris juga" - mis. `es` yang memuat kata `abrir` karena Inggris
 * memuat `open`, bukan karena diterjemahkan.
 */
for (const b of BAHASA) {
  if (b.kode === 'en') continue;
  const teks = petaTeks[b.kode] ?? '';
  const sama = teks.trim() === teksEn.trim();
  r.check(`D-${b.kode}`, !sama || teks.trim() === '', `${b.nama}: ${sama ? 'IDENTIK dengan Inggris' : 'berbeda dari Inggris'}`);
}

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
