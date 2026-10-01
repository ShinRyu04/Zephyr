// isi-i18n.mjs — tambahkan kunci terjemahan ke i18n-extra.ts.
//
// Membaca daftar kunci dari tabel di dalam berkas ini, lalu menyisipkan
// entrinya ke setiap kamus bahasa. Kunci ditulis persis seperti teks
// Indonesia di komponen, karena translate() memakai teks Indonesia sebagai
// kunci pencarian.
//
// Jalankan: node scripts/isi-i18n.mjs [--periksa]

import fs from 'node:fs';

const PERIKSA = process.argv.includes('--periksa');
const BERKAS = 'src/lib/i18n-extra.ts';

/**
 * Kunci yang ditambahkan, per bahasa.
 *
 * `id` selalu sama dengan kuncinya sendiri: teks Indonesia adalah sumbernya.
 * Bahasa lain memakai padanan masing-masing; kunci yang tidak punya padanan
 * akan memakai teks Inggris sebagai cadangan (lihat TAMBAHAN di bawah).
 */
const KUNCI = {
  'mode terang/gelap; tema spesifik di section Tema': {
    en: 'light/dark mode; specific themes live in the Theme section',
    ja: 'ライト/ダークモード。個別テーマは「テーマ」セクションにあります',
    ko: '라이트/다크 모드. 개별 테마는 테마 섹션에 있습니다',
    zh: '浅色/深色模式；具体主题在“主题”部分',
    es: 'modo claro/oscuro; los temas concretos están en la sección Tema',
    fr: 'mode clair/sombre ; les thèmes précis sont dans la section Thème',
    de: 'Hell-/Dunkelmodus; einzelne Themes im Bereich Design',
    pt: 'modo claro/escuro; temas específicos ficam na seção Tema',
    ar: 'الوضع الفاتح/الداكن؛ السمات المحددة في قسم السمة',
  },
  'Tema mengubah UI, editor, dan terminal sekaligus. Mode di section Umum (terang/gelap) menang atas pilihan di sini — memilih tema gelap saat mode terang akan mengembalikannya ke Zephyr Light.': {
    en: 'A theme changes the UI, editor and terminal together. The light/dark mode in General wins over the choice here — picking a dark theme while in light mode switches it back to Zephyr Light.',
    ja: 'テーマは UI・エディター・ターミナルをまとめて変更します。「一般」のライト/ダーク設定がここでの選択より優先され、ライトモード中にダークテーマを選ぶと Zephyr Light に戻ります。',
    ko: '테마는 UI, 편집기, 터미널을 한꺼번에 바꿉니다. 일반 섹션의 라이트/다크 모드가 여기 선택보다 우선하며, 라이트 모드에서 어두운 테마를 고르면 Zephyr Light로 돌아갑니다.',
    zh: '主题会同时更改界面、编辑器和终端。通用部分的浅色/深色模式优先于这里的选择——在浅色模式下选择深色主题会切回 Zephyr Light。',
    es: 'Un tema cambia a la vez la interfaz, el editor y la terminal. El modo claro/oscuro de General manda sobre la elección de aquí: elegir un tema oscuro en modo claro lo devuelve a Zephyr Light.',
    fr: "Un thème modifie à la fois l'interface, l'éditeur et le terminal. Le mode clair/sombre de Général prime sur le choix ici — choisir un thème sombre en mode clair le renvoie vers Zephyr Light.",
    de: 'Ein Theme ändert Oberfläche, Editor und Terminal zugleich. Der Hell-/Dunkelmodus unter Allgemein hat Vorrang — ein dunkles Theme im Hellmodus springt zurück auf Zephyr Light.',
    pt: 'Um tema altera a interface, o editor e o terminal ao mesmo tempo. O modo claro/escuro em Geral tem prioridade sobre a escolha aqui — escolher um tema escuro no modo claro volta para o Zephyr Light.',
    ar: 'تغيّر السمة الواجهة والمحرر والطرفية معًا. وضع فاتح/داكن في «عام» يتقدّم على الاختيار هنا — اختيار سمة داكنة في الوضع الفاتح يعيدها إلى Zephyr Light.',
  },
};

const DAFTAR_LANG = ['ID', 'EN', 'JA', 'KO', 'ZH', 'ES', 'FR', 'DE', 'PT', 'AR'];
const KODE = { ID: 'id', EN: 'en', JA: 'ja', KO: 'ko', ZH: 'zh', ES: 'es', FR: 'fr', DE: 'de', PT: 'pt', AR: 'ar' };

const src = fs.readFileSync(BERKAS, 'utf8');

/** Escape teks agar aman dipakai di dalam string literal kutip tunggal. */
const esc = (t) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Cari awal tiap kamus: "const ID: Dict = {"
const posisi = {};
for (const lang of DAFTAR_LANG) {
  const m = new RegExp(`^const ${lang}: Dict = \\{$`, 'm').exec(src);
  if (!m) throw new Error(`kamus ${lang} tidak ditemukan`);
  posisi[lang] = m.index + m[0].length;
}

// Urutkan dari kamus TERAKHIR ke pertama supaya offset awal tidak bergeser.
const urut = [...DAFTAR_LANG].sort((a, b) => posisi[b] - posisi[a]);

let hasil = src;
const ringkas = [];
for (const lang of urut) {
  const kode = KODE[lang];
  const baris = [];
  for (const [kunci, padanan] of Object.entries(KUNCI)) {
    const nilai = kode === 'id' ? kunci : padanan[kode];
    if (!nilai) throw new Error(`padanan ${kode} untuk "${kunci.slice(0, 30)}…" tidak ada`);
    // Lewati kalau kunci sudah ada di kamus ini.
    const sebelum = hasil.slice(0, posisi[lang]);
    const akhirKamus = hasil.indexOf('\n};', posisi[lang]);
    const isi = hasil.slice(posisi[lang], akhirKamus);
    if (isi.includes(`'${esc(kunci)}':`)) continue;
    baris.push(`  '${esc(kunci)}': '${esc(nilai)}',`);
  }
  if (!baris.length) continue;
  ringkas.push(`${lang}: +${baris.length}`);
  hasil = hasil.slice(0, posisi[lang]) + '\n' + baris.join('\n') + hasil.slice(posisi[lang]);
}

console.log(`# kunci: ${Object.keys(KUNCI).length}`);
console.log('  ' + (ringkas.join(' · ') || 'semua sudah ada'));

if (PERIKSA) {
  console.log('\n(mode --periksa: berkas tidak diubah)');
  process.exit(0);
}

fs.writeFileSync(BERKAS, hasil);
console.log(`\n  ${BERKAS} diperbarui`);
