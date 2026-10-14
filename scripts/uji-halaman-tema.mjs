/**
 * uji-halaman-tema.mjs - bukti item 181 (cari tema + pratinjau kaya tanpa
 * duplikasi) dan item 182 (sorot baris + teks bayangan ala Copilot).
 *
 * ## Kenapa tidak lewat CDP
 *
 * Harness tema yang sudah ada (`uji-t6-tema-mode.mjs`) menuntut aplikasi hidup
 * dan bridge dev terpasang. Yang diuji di sini adalah KODE-nya, bukan pikselnya:
 * apakah ada jalur cari, berapa komponen pratinjau, token apa yang benar-benar
 * dipakai, dan apakah dekorasi punya jalur hidup/mati. Semua itu bisa dibaca
 * langsung dari modul asli - karena itu modul TS/TSX di sini dibundel apa adanya
 * lewat esbuild lalu diimpor, bukan disalin logikanya.
 *
 * ## Yang diuji (dan kenapa tiap satunya layak ada)
 *
 *   A. CARI (item 181a)      - kueri menyaring NAMA + JENIS, kata jenis di dalam
 *                              kueri ikut berlaku, dan teks petunjuk yang
 *                              SUDAH diterjemahkan juga bisa dicari (kalau tidak,
 *                              orang mengetik kata yang ia lihat di kartu dan
 *                              mendapat "tidak ada tema yang cocok").
 *   B. SATU PRATINJAU (181c) - hanya SATU berkas di `src/` yang memuat
 *                              `data-tema-pratinjau`, halaman memakainya di dua
 *                              ukuran, dan markup kedua ukuran itu identik.
 *                              Markup pratinjau lama yang dihapus juga diperiksa,
 *                              supaya "satu komponen" tidak berarti "satu
 *                              komponen + sisa markup lama di sudut lain".
 *   C. TOKEN (181b)          - pratinjau memakai SEBELAS token `--syn-*` yang
 *                              benar-benar didefinisikan tema, tidak ada token
 *                              karangan, dan setiap tema punya kesebelasnya.
 *   D. DEKORASI (item 182)   - jalur hidup/mati dari Settings, terima/tolak
 *                              teks bayangan lewat penyedia yang DIUMPAN (tanpa
 *                              jaringan), dan warna dekorasi dari variabel tema.
 *
 * Jalankan: node scripts/uji-halaman-tema.mjs
 * Keluar 1 bila ada satu saja yang GAGAL.
 */
import { createRequire } from 'node:module';
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = reporter('halaman tema + dekorasi editor');

const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), 'utf8');
const ada = (rel) => fs.existsSync(path.join(AKAR, rel));
const petik = (s) => String(s).replace(/\s+/g, ' ').trim();

/* ── pembundel: modul asli, bukan salinan logika ─────────────────────────── */

const TMP = path.join(AKAR, 'node_modules', '.zpr-uji-halaman-tema');
fs.mkdirSync(TMP, { recursive: true });
let berkasKe = 0;

/* React/ReactDOM diimpor langsung oleh node, tidak ikut dibundel: build CommonJS
   `react-dom/server` memuat `stream` dengan `require()` dinamis, dan esbuild
   menolak bentuk itu di dalam bundel. Karena entri sementara ditulis di dalam
   node_modules, impor `react` dari berkas hasil bundel tetap ketemu sendiri. */
const requireRepo = createRequire(path.join(AKAR, 'package.json'));
const { renderToStaticMarkup } = requireRepo('react-dom/server');

async function bundel(nama, isi) {
  berkasKe += 1;
  const masuk = path.join(TMP, `${nama}-${berkasKe}.tsx`);
  const keluar = path.join(TMP, `${nama}-${berkasKe}.mjs`);
  fs.writeFileSync(masuk, isi, 'utf8');
  await esbuild.build({
    entryPoints: [masuk],
    outfile: keluar,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(keluar).href}?n=${berkasKe}`);
}

const src = (rel) => path.join(AKAR, 'src', rel).replace(/\\/g, '/');
const jeda = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* ── A. jalur cari ───────────────────────────────────────────────────────── */

const A = await bundel(
  'filter',
  `export * from ${JSON.stringify(src('components/settings/temaFilter.ts'))};`,
);

const DAFTAR = [
  { id: 'zephyr-dark', label: 'Zephyr Dark', kind: 'dark', hint: 'theme.hint.zephyrDark' },
  { id: 'nord', label: 'Nord', kind: 'dark', hint: 'theme.hint.nord' },
  { id: 'nord-light', label: 'Nord Light', kind: 'light', hint: 'theme.hint.nordLight' },
  { id: 'everforest-dark', label: 'Everforest', kind: 'dark', hint: 'theme.hint.everforest' },
  { id: 'solarized-light', label: 'Solarized Light', kind: 'light', hint: 'theme.hint.solarizedLight' },
];

/* Kamus mainan: dua kunci sengaja punya teks Indonesia yang tidak memuat
   kunci kamusnya, persis seperti kartu tema yang sebenarnya. */
const KAMUS = {
  'theme.hint.everforest': 'Hijau hutan, nyaman di mata',
  'theme.hint.nordLight': 'Nord terang, biru dingin',
  'theme.hint.nord': 'Biru dingin ala Nord',
  'theme.hint.zephyrDark': 'Bawaan Zephyr',
  'theme.hint.solarizedLight': 'Krem klasik',
};
const tr = (k) => KAMUS[k] ?? k;
const ids = (l) => l.map((t) => t.id).join(',');

const semua = A.saringTema(DAFTAR, '', 'semua', tr);
R.check('A1', semua.length === DAFTAR.length, `kueri kosong = daftar penuh (${semua.length}/${DAFTAR.length})`);

const nord = A.saringTema(DAFTAR, 'nord', 'semua', tr);
R.check('A2', ids(nord) === 'nord,nord-light', `cari nama 'nord' -> ${ids(nord)}`);
R.check('A3', ids(A.saringTema(DAFTAR, 'NORD LIGHT', 'semua', tr)) === 'nord-light', 'huruf besar/kecil tidak penting');

const terang = A.saringTema(DAFTAR, 'terang', 'semua', tr);
R.check(
  'A4',
  terang.length === 2 && terang.every((t) => t.kind === 'light'),
  `kata jenis di dalam kueri: 'terang' -> ${ids(terang)}`,
);
const gelap = A.saringTema(DAFTAR, 'gelap', 'semua', tr);
R.check(
  'A5',
  gelap.length === 3 && gelap.every((t) => t.kind === 'dark'),
  `'gelap' -> ${ids(gelap)}`,
);
R.check('A6', ids(A.saringTema(DAFTAR, 'light', 'semua', tr)) === 'nord-light,solarized-light', "'light' (Inggris) sama artinya");
R.check('A7', ids(A.saringTema(DAFTAR, 'gelap light', 'semua', tr)) === '', 'dua kata jenis yang bertentangan = tidak ada jawaban, bukan daftar penuh');

const pil = A.saringTema(DAFTAR, '', 'light', tr);
R.check('A8', pil.length === 2 && pil.every((t) => t.kind === 'light'), `pil jenis 'light' -> ${ids(pil)}`);
R.check('A9', ids(A.saringTema(DAFTAR, 'nord', 'light', tr)) === 'nord-light', 'pil DAN kueri berlaku bersamaan');
R.check('A10', ids(A.saringTema(DAFTAR, 'gelap', 'light', tr)) === '', "pil 'light' + kueri 'gelap' = kosong (bukan diam-diam daftar penuh)");
R.check('A11', ids(A.saringTema(DAFTAR, 'tema nord', 'semua', tr)) === 'nord,nord-light', "kata benda 'tema' dibuang, sisanya tetap dicari");

const hutan = A.saringTema(DAFTAR, 'hutan', 'semua', tr);
R.check('A12', ids(hutan) === 'everforest-dark', `cari teks petunjuk yang SUDAH diterjemahkan -> ${ids(hutan)}`);
/* Kalau kamus belum punya terjemahannya, `tr` mengembalikan kuncinya sendiri -
   jadi teks kartunya berisi kunci mentah, dan mengetik potongan kunci itu tetap
   menemukan temanya. Tanpa kejatuhan ini, tema yang belum diterjemahkan menjadi
   tidak bisa dicari sama sekali. */
const kunci = A.saringTema(DAFTAR, 'theme.hint.solarized', 'semua', (s) => s);
R.check('A13', ids(kunci) === 'solarized-light', `tanpa terjemahan, kunci kamus sendiri yang jadi teks dan tetap bisa dicari -> ${ids(kunci)}`);
R.check(
  'A14',
  A.saringTema(DAFTAR, 'hutan', 'semua', (s) => s).length === 0,
  'tanpa penerjemah teks petunjuk, pencarian teks jadi tidak cocok (bukti suntikan tr memang dipakai)',
);

/* Jalur halaman: penyaring yang sama harus benar-benar dipakai halaman. */
const halaman = baca('src/components/settings/SectionsBasic.tsx');
R.check('A15', /saringTema\(semua, kueri, jenis, tr\)/.test(halaman), 'halaman memanggil saringTema(semua, kueri, jenis, tr)');
R.check('A16', /testid="theme-search"/.test(halaman) && /onChange=\{setKueri\}/.test(halaman), 'kotak cari terpasang ke state kueri (testid theme-search)');
R.check(
  'A17',
  /testid="theme-jenis"/.test(halaman) &&
    /value=\{jenis\}/.test(halaman) &&
    /\{ value: 'dark', label: 'Gelap' \}/.test(halaman) &&
    /\{ value: 'light', label: 'Terang' \}/.test(halaman),
  'pil jenis terpasang ke state jenis, berlabel Gelap/Terang (kata yang sama dengan yang dikenali saringTema)',
);
R.check('A18', /\{tampil\.map\(/.test(halaman) && /\{tampil\.length\} \/ \{semua\.length\}/.test(halaman), 'kisi, hitungan n/m, dan keadaan kosong memakai SATU hasil penyaring');
R.check('A19', /tampil\.length === 0/.test(halaman), 'keadaan kosong memakai hasil penyaring yang sama');
R.check(
  'A20',
  /data-testid="theme-kosong"/.test(halaman) && /Tidak ada tema yang cocok/.test(halaman),
  'keadaan kosong punya penanda sendiri (theme-kosong) dan menyebut kueri yang dicari',
);

/* ── B + C. pratinjau ────────────────────────────────────────────────────── */

const ENTRI_P = `
export * from ${JSON.stringify(src('components/settings/TemaPratinjau.tsx'))};
`;
let P = null;
let temaModul = null;
let catatanTema = '';
try {
  P = await bundel('pratinjau', `${ENTRI_P}export * as tema from ${JSON.stringify(src('lib/themes.ts'))};`);
  temaModul = P.tema;
} catch (e) {
  /* `themes.ts` menarik modul lain; kalau salah satunya menyentuh hal yang tidak
     ada di node, pratinjau tetap bisa diuji dan daftar tema dibaca dari sumber. */
  const pesan = String(e?.message ?? e);
  catatanTema = (pesan.split('\n').find((b) => /ERROR|Cannot|error/.test(b)) ?? 'gagal dibundel').trim();
  P = await bundel('pratinjau-tanpa-tema', ENTRI_P);
}

/* Berkas apa saja di src/ yang memuat pola ini? Dipakai untuk membuktikan
   "tidak ada yang lain" tanpa menebak nama berkas. */
function berkasDengan(pola) {
  const hasil = [];
  const telusur = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) telusur(p);
      else if (/\.(tsx?|jsx?|css)$/.test(e.name) && pola.test(fs.readFileSync(p, 'utf8')))
        hasil.push(path.relative(AKAR, p).replace(/\\/g, '/'));
    }
  };
  telusur(path.join(AKAR, 'src'));
  return hasil;
}

/* Berapa berkas di src/ yang memuat markup pratinjau? Harus SATU. */
function berkasPratinjau(dir, keluar = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) berkasPratinjau(p, keluar);
    else if (/\.(tsx?|jsx?|css)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('data-tema-pratinjau'))
      keluar.push(path.relative(AKAR, p).replace(/\\/g, '/'));
  }
  return keluar;
}
const PEMILIK = berkasPratinjau(path.join(AKAR, 'src'));
R.check(
  'B1',
  PEMILIK.length === 1 && PEMILIK[0].endsWith('TemaPratinjau.tsx'),
  `berkas pemilik markup pratinjau: ${PEMILIK.join(', ') || '(tidak ada)'}`,
);
R.check(
  'B2',
  !/className="[^"]*\btp-(kw|str|fn|side|line)\b|className="theme-preview/.test(halaman),
  'markup pratinjau LAMA (strip tiga batang / sisi palsu) sudah tidak dirender halaman',
);
/* Kelas lama masih punya aturan di `src/styles/settings.css` (berkas milik lane
   lain). Aturan mati bukan komponen kedua, tapi tetap dicatat: lihat
   docs/USULAN-TEMA-DAN-DEKORASI.md. */
const kelasLamaDipakai = berkasDengan(/className="[^"]*\btp-(kw|str|fn|side|line)\b/);
R.check(
  'B2b',
  kelasLamaDipakai.length === 0,
  `tidak ada berkas di src/ yang merender kelas pratinjau lama; masih memakai: ${kelasLamaDipakai.join(', ') || '(tidak ada)'}`,
);
R.check(
  'B3',
  /<PratinjauTema themeId=\{besarId\} ukuran="besar"/.test(halaman) &&
    /<PratinjauTema themeId=\{th\.id\}/.test(halaman),
  'halaman memakai komponen yang sama untuk kartu DAN pratinjau besar',
);

const idTema = (() => {
  try {
    const t = temaModul?.THEMES ?? temaModul?.semuaTema?.() ?? [];
    if (t.length) return { daftar: t, dari: `THEMES (modul asli)${catatanTema ? ` - catatan: ${catatanTema}` : ''}` };
  } catch {
    /* jatuh ke pembacaan sumber */
  }
  const s = baca('src/lib/themes.ts');
  const daftar = [...s.matchAll(/id:\s*'([a-z0-9-]+)'[^}]*kind:\s*'(dark|light)'/g)].map((m) => ({
    id: m[1],
    kind: m[2],
  }));
  return { daftar, dari: `sumber themes.ts (regex)${catatanTema ? ` - ${catatanTema}` : ''}` };
})();

const htmlKartu = idTema.daftar.map((t) => renderToStaticMarkup(P.PratinjauTema({ themeId: t.id, ukuran: 'kartu' })));
const htmlBesar = idTema.daftar.map((t) => renderToStaticMarkup(P.PratinjauTema({ themeId: t.id, ukuran: 'besar' })));
const satuBesar = renderToStaticMarkup(P.PratinjauTema({ themeId: idTema.daftar[0].id, ukuran: 'besar', accent: '#ff0000' }));

const hitung = (html, pola) => (html.match(pola) ?? []).length;
R.check('B4', idTema.daftar.length >= 15, `tema diuji: ${idTema.daftar.length} (sumber: ${idTema.dari})`);

const sama =
  htmlBesar[0].replace(/\stpv-(kartu|besar)/, '').replace(/\sdata-ukuran="(kartu|besar)"/, '') ===
  htmlKartu[0].replace(/\stpv-(kartu|besar)/, '').replace(/\sdata-ukuran="(kartu|besar)"/, '');
R.check(
  'B5',
  sama,
  'markup kedua ukuran IDENTIK setelah kelas skala dan penanda ukuran disamakan (satu komponen, dua skala)',
);
R.check(
  'B6',
  idTema.daftar.every((_, i) => hitung(htmlKartu[i], /data-tok=/g) === hitung(htmlBesar[i], /data-tok=/g)) &&
    idTema.daftar.every((_, i) => hitung(htmlKartu[i], /data-cip=/g) === hitung(htmlBesar[i], /data-cip=/g)),
  'jumlah token dan cip sama di kedua ukuran untuk semua tema',
);
R.check(
  'B7',
  /\.tpv-kartu \.tpv-label\{display:none\}/.test(P.GAYA_PRATINJAU) && /\.tpv-besar \.tpv-kode/.test(P.GAYA_PRATINJAU),
  'perbedaan kedua ukuran hanyalah gaya (label token disembunyikan di kartu, kode diperbesar di pratinjau besar)',
);
const tokUnik = new Set([...htmlBesar[0].matchAll(/data-tok="([^"]+)"/g)].map((m) => m[1]));
R.check(
  'B8',
  tokUnik.size >= 10,
  `potongan kode memakai ${tokUnik.size} token berbeda di teks (bukan strip tiga batang): ${[...tokUnik].join(' ')}`,
);

/* Token: sebelas, dan hanya yang benar-benar didefinisikan tema. */
const TOK = [...P.TOKEN_SINTAKS];
R.check('C1', TOK.length === 11 && new Set(TOK).size === 11, `TOKEN_SINTAKS berisi ${TOK.length} token unik: ${TOK.join(' ')}`);
R.check(
  'C2',
  P.WARNA_UI.length === 8 && new Set(P.WARNA_UI).size === 8,
  `sampel warna antarmuka: ${P.WARNA_UI.join(' ')}`,
);

/* Definisi di CSS: `:root` + blok `[data-theme='x']`. */
const gayaFiles = fs
  .readdirSync(path.join(AKAR, 'src/styles'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ f, isi: baca(`src/styles/${f}`) }));
const definisi = new Map(); // selector -> Map(token -> nilai)
for (const { f, isi } of gayaFiles) {
  const blok = isi.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const m of blok) {
    const sel = petik(m[1].split('*/').pop() ?? m[1]);
    const isiBlok = m[2];
    const tok = [...isiBlok.matchAll(/(--syn-[a-z-]+)\s*:\s*([^;]+);/g)];
    if (!tok.length) continue;
    for (const bagian of sel.split(',')) {
      const s = petik(bagian);
      if (s !== ':root' && !/^\[data-theme=/.test(s) && !s.startsWith(':root')) continue;
      const kunci = s === ':root' ? ':root' : (/\[data-theme=['"]?([a-z0-9-]+)/.exec(s)?.[1] ?? s);
      const isi2 = definisi.get(kunci) ?? new Map();
      for (const t of tok) isi2.set(t[1], petik(t[2]));
      definisi.set(kunci, isi2);
    }
  }
  void f;
}
const akarTok = definisi.get(':root') ?? new Map();
const akarSet = new Set(akarTok.keys());
R.check(
  'C3',
  akarSet.size === 11 && TOK.every((t) => akarSet.has(t)) && TOK.length === akarSet.size,
  `token di :root = token yang dipakai pratinjau (${akarSet.size} di CSS, ${TOK.length} di komponen)`,
);
const blokTema = [...definisi.keys()].filter((k) => k !== ':root');
const ganjil = blokTema.filter((k) => {
  const set = definisi.get(k);
  return set.size > 0 && set.size !== 11;
});
R.check(
  'C4',
  ganjil.length === 0,
  `${blokTema.length} blok tema mendefinisikan --syn-*; yang jumlahnya bukan 11: ${ganjil.join(', ') || '(tidak ada)'}`,
);
const kurangDiTema = idTema.daftar
  .filter((t) => {
    const punya = definisi.get(t.id);
    return punya && [...akarTok.keys()].some((k) => !punya.has(k));
  })
  .map((t) => t.id);
R.check('C5', kurangDiTema.length === 0, `tema dengan token tidak lengkap di bloknya sendiri: ${kurangDiTema.join(', ') || '(tidak ada)'}`);

/* Tiap tema, tiap token: benar-benar dipakai sebagai var(). */
const temaKurang = [];
for (let i = 0; i < idTema.daftar.length; i += 1) {
  const html = htmlBesar[i];
  const dipakai = new Set([...html.matchAll(/var\((--syn-[a-z-]+)\)/g)].map((m) => m[1]));
  const tidakAda = TOK.filter((t) => !dipakai.has(t));
  const cip = [...html.matchAll(/data-cip="([^"]+)"/g)].map((m) => m[1]);
  const cipTidakAda = TOK.filter((t) => !cip.includes(t));
  if (tidakAda.length || cipTidakAda.length) temaKurang.push(`${idTema.daftar[i].id}[${[...tidakAda, ...cipTidakAda].join(' ')}]`);
}
R.check(
  'C6',
  temaKurang.length === 0,
  `SEMUA ${idTema.daftar.length} tema memakai kesebelas token (baik sebagai warna token maupun cip); kurang: ${temaKurang.join(' ') || '(tidak ada)'}`,
);
R.check(
  'C7',
  idTema.daftar.every((_, i) => htmlBesar[i].includes(`data-tema-pratinjau="${idTema.daftar[i].id}"`) && htmlBesar[i].includes(`data-theme="${idTema.daftar[i].id}"`)),
  'tiap pratinjau memasang data-theme temanya sendiri (token tema itu yang dipakai walau belum dipilih)',
);
R.check(
  'C8',
  P.WARNA_UI.every((t) => htmlBesar[0].includes(`data-cip="${t}"`)),
  'sampel warna antarmuka utama ikut dirender sebagai cip',
);

/* Warna: tidak ada nilai keras. */
const gayaKeras = /#[0-9a-fA-F]{3,8}\b/.test(P.GAYA_PRATINJAU);
const inlineKeras = [...new Set([...htmlBesar[0].matchAll(/style="([^"]*)"/g)].flatMap((m) => m[1].split(';')))].filter(
  (d) => d.trim() && /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(d),
);
R.check('C9', !gayaKeras, 'gaya tata letak pratinjau tanpa satu pun nilai warna keras');
R.check('C10', inlineKeras.length === 0, `semua warna inline dari var(--...): ${inlineKeras.join(' | ') || 'bersih'}`);
R.check('C11', /var\(--accent\)|--accent/.test(satuBesar) && P.GAYA_PRATINJAU.length > 0, 'aksen pilihan pembaca diteruskan ke pratinjau (dan gaya tata letak terpasang)');

/* ── D. dekorasi editor (item 182) ───────────────────────────────────────── */

const D = await bundel(
  'dekorasi',
  `
export * from ${JSON.stringify(src('components/editor/dekorasiMurni.ts'))};
export * from ${JSON.stringify(src('components/editor/dekorasiCopilot.ts'))};
export { EditorState } from '@codemirror/state';
`,
);

const sumberKopilot = baca('src/components/editor/dekorasiCopilot.ts');
const sumberEditor = baca('src/components/editor/CodeMirrorEditor.tsx');

R.check('D1', D.kelasBaris('added') === 'cm-dekorasi-baru' && D.kelasBaris('modified') === 'cm-dekorasi-ubah', `kelas baris: ${D.kelasBaris('added')} / ${D.kelasBaris('modified')}`);
R.check('D2', D.kelasBaris('deleted') === '', 'baris dihapus tidak menghasilkan kelas (tidak menyorot baris yang tidak disentuh siapa pun)');

const kotor = [
  { line: 2, jenis: 'added' },
  { line: 2, jenis: 'modified' },
  { line: 4, jenis: 'modified' },
  { line: 9, jenis: 'added' },
  { line: 3, jenis: 'deleted' },
  { line: 0, jenis: 'added' },
  { line: 1.5, jenis: 'added' },
];
const bersih = D.barisUnik(kotor, 5);
R.check(
  'D3',
  bersih.map((b) => `${b.line}:${b.jenis}`).join(' ') === '2:added 4:modified',
  `barisUnik: ganda diambil yang pertama, di luar dokumen dibuang, urut menaik -> ${bersih.map((b) => `${b.line}:${b.jenis}`).join(' ')}`,
);
R.check('D4', D.barisUnik([...Array(600)].map((_, i) => ({ line: i + 1, jenis: 'added' })), 1000).length === D.SOROT_MAX, `batas sorotan ${D.SOROT_MAX} baris ditegakkan`);

/* Teks bayangan: potong pantulan yang sudah diketik + tolak yang tidak menambah apa pun. */
R.check(
  'D5',
  D.usulanLayak('const a = 1; const b = 2;', { sebelum: 'const a = 1;', sesudah: '' }) === ' const b = 2;',
  'pantulan yang sudah diketik dipotong dari saran',
);
R.check(
  'D6',
  D.usulanLayak('x = 1;', { sebelum: 'x = 1;', sesudah: '' }) === '',
  'saran yang isinya sudah sama dengan yang diketik ditolak (tidak menduplikasi teks)',
);
R.check('D7', D.usulanLayak('   \n  ', { sebelum: '', sesudah: '' }) === '', 'saran kosong ditolak');
R.check('D8', D.usulanLayak('y = 2;', { sebelum: '', sesudah: 'y = 2;' }) === '', 'saran yang sudah ada di kanan kursor ditolak');

/* Jalur hidup/mati. */
R.check('D9', D.dekorasiCopilot().length === 0, 'kedua sakelar mati -> nol ekstensi (tidak ada field/keymap/timer yang dipasang)');
const hidupSorot = D.dekorasiCopilot({ sorotBaris: true });
const hidupUsulan = D.dekorasiCopilot({ usulanInline: true });
const hidupDua = D.dekorasiCopilot({ sorotBaris: true, usulanInline: true });
R.check(
  'D10',
  hidupSorot.includes(D.sorotField) && !hidupSorot.includes(D.usulanField),
  'sakelar sorot saja -> hanya field sorot',
);
R.check(
  'D11',
  hidupUsulan.includes(D.usulanField) && !hidupUsulan.includes(D.sorotField),
  'sakelar teks bayangan saja -> hanya field usulan (+ tombol + pemicu)',
);
R.check(
  'D12',
  hidupDua.includes(D.sorotField) && hidupDua.includes(D.usulanField) && hidupDua.length > hidupSorot.length,
  `kedua sakelar -> ${hidupDua.length} ekstensi (sorot sendiri ${hidupSorot.length}, usulan sendiri ${hidupUsulan.length})`,
);

/* Jalur editor: satu diff, dua dekorasi, satu dispatch. */
R.check(
  'D13',
  /import \{ dekorasiBarisUbah, dekorasiCopilot \} from '\.\/dekorasiCopilot'/.test(sumberEditor),
  'editor mengimpor dekorasiCopilot + dekorasiBarisUbah',
);
R.check(
  'D14',
  /dekorasiCopilot\(\{ sorotBaris: e\.gitGutter, usulanInline: e\.ghostText \}\)/.test(sumberEditor),
  'jalur hidup/mati dekorasi diambil dari Settings (gitGutter + ghostText)',
);
R.check(
  'D15',
  /const baris = parseDiff\(patch\)/.test(sumberEditor) &&
    /effects: \[setBarsEffect\(baris\), dekorasiBarisUbah\(baris\)\]/.test(sumberEditor),
  'satu parseDiff mengisi batang gutter DAN sorot baris dalam satu dispatch',
);
R.check(
  'D16',
  /effects: \[setBarsEffect\(\[\]\), dekorasiBarisUbah\(\[\]\)\]/.test(sumberEditor),
  'kedua dekorasi dibersihkan bersamaan saat sakelar mati / berkas bukan repo',
);

/* Tanpa jaringan: tidak ada jalur ambil sendiri di modul dekorasi. */
const jaringan = ['fetch(', 'http://', 'https://', 'invoke(', 'aiChat', 'listen(', 'XMLHttpRequest'].filter((k) =>
  sumberKopilot.includes(k),
);
R.check(
  'D17',
  jaringan.length === 0 && /export function pasangPenyediaUsulan/.test(sumberKopilot),
  `dekorasi tanpa jalur jaringan sendiri (ditemukan: ${jaringan.join(', ') || 'tidak ada'}); sumber saran = fungsi yang diumpan`,
);

/* Uji nyata: state CodeMirror + penyedia yang diumpan (tanpa model). */
let st = D.EditorState.create({ doc: 'a\nb\nc\nd\ne', extensions: [D.sorotField] });
st = st.update({ effects: D.dekorasiBarisUbah(bersih) }).state;
const kelasTerpasang = [];
st.field(D.sorotField).between(0, st.doc.length, (_f, _t, v) => {
  kelasTerpasang.push(v.spec.class);
});
R.check(
  'D18',
  kelasTerpasang.length === 2 && kelasTerpasang.every((k) => k === 'cm-dekorasi-baru' || k === 'cm-dekorasi-ubah'),
  `efek dekorasiBarisUbah menghasilkan ${kelasTerpasang.length} kelas di state: ${kelasTerpasang.join(' ')}`,
);
const stSetelahUbah = st.update({ changes: { from: 0, insert: 'x' } }).state;
R.check(
  'D19',
  stSetelahUbah.field(D.sorotField).size === 0,
  'suntingan membersihkan sorot (nomor baris dari diff HEAD tidak lagi cocok dengan buffer)',
);

function viewPalsu(doc, kepala, ext = [D.usulanField]) {
  let s = D.EditorState.create({ doc, selection: { anchor: kepala }, extensions: ext });
  return {
    get state() {
      return s;
    },
    get hasFocus() {
      return true;
    },
    dispatch(spec) {
      s = s.update(spec).state;
    },
  };
}

D.pasangPenyediaUsulan(null);
const v1 = viewPalsu('const a = 1;\n', 12);
R.check(
  'D20',
  D.mintaUsulan(v1) === false && D.usulanTeks(v1) === null,
  'tanpa penyedia terpasang tidak ada saran dan TIDAK ada panggilan jaringan (fungsi mengembalikan false, bukan promise kosong)',
);

let konteksDilihat = null;
D.pasangPenyediaUsulan(async (k) => {
  konteksDilihat = k;
  return 'const a = 1; const b = 2;';
});
const v2 = viewPalsu('const a = 1;\n', 12);
const diminta = D.mintaUsulan(v2, 'typescript');
await jeda(60);
R.check('D21', diminta === true && D.usulanTeks(v2) === ' const b = 2;', `saran dari penyedia yang diumpan, dipotong pantulannya -> ${JSON.stringify(D.usulanTeks(v2))}`);
R.check(
  'D22',
  konteksDilihat?.baris === 'const a = 1;' && konteksDilihat?.line === 1 && konteksDilihat?.lang === 'typescript',
  `konteks dikirim apa adanya: baris ${konteksDilihat?.line} = ${JSON.stringify(konteksDilihat?.baris)}, lang ${konteksDilihat?.lang}`,
);

const terima = D.terimaUsulan(v2);
R.check(
  'D23',
  terima === true && v2.state.doc.toString() === 'const a = 1; const b = 2;\n' && D.usulanTeks(v2) === null,
  `Terima: teks masuk di kursor dan widget dibersihkan -> ${JSON.stringify(v2.state.doc.toString())}`,
);
R.check('D24', D.terimaUsulan(v2) === false, 'Terima tanpa saran menunggu = false (tidak menyisipkan apa pun)');

const v3 = viewPalsu('const a = 1;\n', 12);
D.mintaUsulan(v3);
await jeda(60);
const sebelumTolak = v3.state.doc.toString();
const tolak = D.tolakUsulan(v3);
R.check(
  'D25',
  tolak === true && v3.state.doc.toString() === sebelumTolak && D.usulanTeks(v3) === null,
  'Tolak: widget dibuang, dokumen tidak disentuh',
);
R.check('D26', D.tolakUsulan(v3) === false, 'Tolak tanpa saran menunggu = false');

/* Pindah kursor membatalkan saran yang menjawab posisi lama. */
const v4 = viewPalsu('const a = 1;\n', 12);
D.mintaUsulan(v4);
await jeda(60);
const adaSebelum = D.adaUsulan(v4);
v4.dispatch({ selection: { anchor: 3 } });
R.check('D27', adaSebelum && !D.adaUsulan(v4), 'saran dibatalkan saat kursor pindah (tidak ditempel di posisi yang tidak diminta)');

/* Warna dekorasi dari tema. */
const hexKopilot = /#[0-9a-fA-F]{3,8}\b/.test(sumberKopilot);
R.check(
  'D28',
  /var\(--added\)/.test(sumberKopilot) && /var\(--modified\)/.test(sumberKopilot) && !hexKopilot,
  'warna dekorasi dari variabel tema (--added/--modified), tanpa nilai keras',
);
R.check(
  'D29',
  /cm-dekorasi-baru/.test(sumberKopilot) && /cm-dekorasi-ubah/.test(sumberKopilot) && /var\(--added-tipis/.test(sumberKopilot),
  'kelas yang dihasilkan kelasBaris memang yang diberi gaya (latar tipis + garis tepi)',
);
R.check(
  'D30',
  /background: `var\(\$\{t\}\)`|background: `var\(/.test(baca('src/components/settings/TemaPratinjau.tsx')) ||
    /var\(--syn-keyword\)/.test(htmlBesar[0]),
  'pratinjau dan dekorasi sama-sama mewarnai lewat variabel, bukan warna keras',
);

const { lulus, total } = R.selesai();
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {
  /* sisa berkas sementara tidak boleh menjatuhkan hasil uji */
}
void lulus;
void total;
void ada;
