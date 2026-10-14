/*
 * uji-perintah-tema-nyata.mjs — perintah `theme.<id>` di command palette diuji
 * terhadap daftar tema yang BENAR-BENAR ditawarkan (tanpa app hidup, tanpa CDP).
 *
 * Kenapa harness ini ada (item kanonik `zeph-perintah-tema-tersembunyi`):
 * perintah per tema dibuat dari tabel tema di `src/lib/commandRegistry.ts`.
 * Selama tabel itu dipakai MENTAH, palet mendaftarkan `theme.github-dark` dan
 * `theme.min-light` padahal kedua tema kembar itu sudah disembunyikan dari
 * pemilih (`tersembunyi` di `src/lib/themes.ts`): memilih perintah itu menulis
 * `theme.current` ke id yang tidak ada di pemilih mana pun. Menghitungnya di DOM
 * tidak cukup — palet bisa saja bersih sementara jalur lain (findCommand,
 * COMMAND_BY_ID, siklus tema) masih memegang id tersembunyi. Jadi yang diperiksa
 * di sini adalah fungsi aslinya, dijalankan di Node.
 *
 * CARA: `commandRegistry.ts` di-bundle esbuild dengan modul app (store, React,
 * CodeMirror, i18n) DIGANTI stub, lalu bundelnya dijalankan. Yang TIDAK
 * distub — karena justru itu yang sedang diuji — adalah `src/lib/themes.ts` dan
 * `src/lib/commandIds.ts` (dua berkas daun tanpa impor). Jadi "satu sumber
 * kebenaran" di sini berarti: daftar tersembunyi yang dibaca perintah tema
 * adalah tabel yang sama yang dibaca pemilih tema, bukan salinannya.
 *
 * Yang dituntut:
 *   (a) tidak ada perintah `theme.*` untuk tema tersembunyi,
 *   (b) setiap tema yang masih ditawarkan `semuaTema()` PUNYA perintahnya,
 *   (c) tidak ada id perintah ganda,
 *   (d) perintah pindah-tema masih menemukan tema yang valid,
 *   (e) tema tersembunyi tidak hilang dari jalur baca (isKnownTheme/resolveTheme),
 *   (f) sumbernya tidak menyalin syarat "tersembunyi" (satu sumber kebenaran).
 *
 * Kalau sesuatu gagal, skrip keluar != 0 dan mencetak `== n/n lulus ==`.
 */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const akarRepo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BERKAS_REGISTRY = join(akarRepo, 'src', 'lib', 'commandRegistry.ts');

/* ── 1. Baca impor static dari commandRegistry.ts supaya stubnya punya nama ──
 *
 * esbuild menolak impor bernama yang tidak ada di modul stub, jadi setiap stub
 * harus mengekspor persis nama yang diminta. Nama itu diambil dari sumber yang
 * sama yang sedang diuji — bukan dari daftar tulis-tangan yang bisa basi.
 */
export function namaImpor(sumber) {
  const hasil = new Map();
  const tambah = (spec, nama) => {
    if (!hasil.has(spec)) hasil.set(spec, new Set());
    if (nama) hasil.get(spec).add(nama);
  };
  for (const m of sumber.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const bagian of m[1].split(',')) {
      /* `import { HOME as HOME_BROWSER }` — yang harus diekspor stub adalah nama
         ASLI (`HOME`), karena itu yang diminta esbuild. */
      const bersih = bagian.trim().replace(/^type\s+/, '');
      const nama = bersih.split(/\s+as\s+/)[0]?.trim();
      if (nama) tambah(m[2], nama);
    }
  }
  for (const m of sumber.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]([^'"]+)['"]/g)) {
    tambah(m[2], m[1]);
  }
  for (const m of sumber.matchAll(/import\s+['"]([^'"]+)['"]/g)) tambah(m[1], null);
  return hasil;
}

/* ── 2. Stub permissive ──────────────────────────────────────────────────────
 *
 * Satu objek kontrol di globalThis, dipakai stub DAN harness, jadi harness bisa
 * menyetel `theme.current` lalu memeriksa `applySettings` yang benar-benar
 * dipanggil. Properti yang tidak dikenal menjadi fungsi yang bisa dipanggil,
 * di-iterasi kosong, dan dikonversi ke string — cukup untuk melewati kode app
 * tanpa pernah menjalankannya.
 */
const PREAMBEL = `
const H = (globalThis.__TEMA_HARNESS__ = globalThis.__TEMA_HARNESS__ || {});
function P(mod, nama) {
  H.kunci = H.kunci || new Map();
  const key = mod + '#' + nama;
  if (H.kunci.has(key)) return H.kunci.get(key);
  const target = function () {};
  const p = new Proxy(target, {
    get(_t, k) {
      if (k === 'getState') return () => H.state();
      if (k === 'then' || k === 'catch' || k === 'finally') return undefined;
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toStringTag) return 'stub-tema';
      if (k === 'toString') return () => 'stub:' + key;
      if (k === 'valueOf') return () => 0;
      if (k === 'name') return nama;
      return P(key, String(k));
    },
    apply(_t, _this, args) {
      return H.hasil(key, args);
    },
    construct() {
      return {};
    },
    has() {
      return true;
    },
  });
  H.kunci.set(key, p);
  return p;
}
`;

function kodeStub(spec, nama) {
  const baris = [...nama].map(
    (n) => `export const ${n} = P(${JSON.stringify(spec)}, ${JSON.stringify(n)});`,
  );
  return PREAMBEL + baris.join('\n') + '\n';
}

/* ── 3. Bundle ─────────────────────────────────────────────────────────────── */
const sumberRegistry = readFileSync(BERKAS_REGISTRY, 'utf8');
const impor = namaImpor(sumberRegistry);
const kodeStubPer = new Map();
for (const [spec, nama] of impor) kodeStubPer.set(spec, kodeStub(spec, nama));

/* tiga berkas daun/modul-uji yang WAJIB asli: registry + tabel tema + himpunan
   id perintah. Sisanya (store, React, CodeMirror, i18n) stub. */
const ASLI = new Set(
  ['commandRegistry.ts', 'themes.ts', 'commandIds.ts'].map((f) =>
    join(akarRepo, 'src', 'lib', f).toLowerCase(),
  ),
);

const dir = mkdtempSync(join(tmpdir(), 'uji-tema-perintah-'));
const keluar = join(dir, 'registry.mjs');

const pluginStub = {
  name: 'stub-app-tema',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return null;
      /* Hanya dua modul daun ini yang dibaca dari disk; sisanya (termasuk
         paket node_modules seperti @codemirror/*) jadi stub. */
      if (args.path.startsWith('.')) {
        const kandidat = ['.ts', '.tsx', ''].map((ext) =>
          resolve(args.resolveDir, args.path + ext).toLowerCase(),
        );
        if (kandidat.some((k) => ASLI.has(k))) return null;
      }
      return { path: args.path, namespace: 'stub-tema' };
    });
    b.onLoad({ filter: /.*/, namespace: 'stub-tema' }, (args) => ({
      contents: kodeStubPer.get(args.path) ?? PREAMBEL,
      loader: 'js',
    }));
  },
};

await build({
  stdin: {
    contents: [
      "export * from './commandRegistry';",
      "export * from './themes';",
      "export * from './commandIds';",
    ].join('\n'),
    resolveDir: join(akarRepo, 'src', 'lib'),
    sourcefile: 'harness-tema.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: keluar,
  logLevel: 'silent',
  plugins: [pluginStub],
});

/* ── 4. Objek kontrol yang dipegang stub ──────────────────────────────────── */

/*
 * Proxy "apa saja": bisa dipanggil, di-iterasi kosong, dikonversi ke string, dan
 * `length` = 0. Dipakai untuk nilai yang harus lolos dari kode app tanpa
 * dijalankan — stub yang memulangkan `undefined` justru meledak di kode seperti
 * `[...T.daftar()]` (TypeError: not iterable), dan kegagalan itu milik harness,
 * bukan milik kode yang diuji.
 */
const bebasCache = new Map();
function bebas(nama) {
  if (bebasCache.has(nama)) return bebasCache.get(nama);
  const p = new Proxy(function () {}, {
    get(_t, k) {
      if (k === 'then' || k === 'catch' || k === 'finally') return undefined;
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toStringTag) return 'stub-harness';
      if (k === 'toString') return () => 'stub-harness:' + nama;
      if (k === 'valueOf') return () => 0;
      if (k === 'name') return nama;
      if (k === 'length') return 0;
      return bebas(nama + '.' + String(k));
    },
    apply() {
      return bebas(nama + '()');
    },
    construct() {
      return {};
    },
    has() {
      return true;
    },
  });
  bebasCache.set(nama, p);
  return p;
}

const diterapkan = [];
const H = {
  diterapkan,
  curr: 'zephyr-dark',
  mode: 'dark',
  kunci: new Map(),
  state() {
    return new Proxy(
      {
        settings: {
          general: { theme: H.mode, aiPanel: 'right' },
          theme: { current: H.curr },
          editor: {},
        },
        tabs: [],
        activeTabId: null,
        sidebarVisible: true,
        applySettings: (patch) => {
          diterapkan.push(patch);
          if (patch?.theme?.current) H.curr = patch.theme.current;
          if (patch?.general?.theme) H.mode = patch.general.theme;
          return Promise.resolve();
        },
        setStatus: (s) => {
          H.status = s;
        },
      },
      {
        get(t, k) {
          if (k in t) return t[k];
          if (k === 'then') return undefined;
          if (typeof k === 'symbol') return undefined;
          return bebas('state.' + String(k));
        },
      },
    );
  },
  hasil(key) {
    return bebas(String(key));
  },
};
globalThis.__TEMA_HARNESS__ = H;

const M = await import(pathToFileURL(keluar).href + '?v=' + Date.now());
if (process.env.DEBUG_TEMA) console.log('DEBUG ekspor bundel:', Object.keys(M).join(', '), '\nDEBUG stub:', [...kodeStubPer.keys()].join(' | '));

/* ── 5. Pemeriksaan ───────────────────────────────────────────────────────── */
let lulus = 0;
let total = 0;
const gagal = [];
const cek = (nama, syarat, bukti = '') => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  LULUS  ${nama}${bukti ? `  [${bukti}]` : ''}`);
  } else {
    gagal.push(nama);
    console.log(`  GAGAL  ${nama}${bukti ? `  [${bukti}]` : ''}`);
  }
};

console.log('=== Perintah tema nyata vs daftar tema yang ditawarkan ===\n');

/* Daftar "benar" diambil dari modul tema yang SAMA yang dipakai aplikasi. */
const tersembunyi = M.THEMES.filter((t) => t.tersembunyi).map((t) => t.id);
const terlihat = M.semuaTema();
const terlihatId = terlihat.map((t) => t.id);

let daftarPalet = null;
let catatanPalet = '';
try {
  daftarPalet = M.availableCommands();
} catch (e) {
  catatanPalet = String(e?.message ?? e).slice(0, 120);
}
const idPalet = daftarPalet ? daftarPalet.map((c) => c.id) : M.COMMANDS.map((c) => c.id);
if (!daftarPalet) {
  console.log(
    `  CATATAN HARNESS: availableCommands() tidak bisa dievaluasi dengan stub (${catatanPalet});\n` +
      '                   pemeriksaan palet jatuh ke COMMANDS (perintah tema memang statis di sana).\n',
  );
} else {
  console.log(`  CATATAN HARNESS: palet dievaluasi lewat availableCommands() — ${daftarPalet.length} perintah.\n`);
}

/* — Prasyarat: sumber tersembunyinya sendiri — */
cek(
  'tabel THEMES memuat 2 tema tersembunyi (sumber kebenaran ada)',
  tersembunyi.length === 2 && tersembunyi.includes('github-dark') && tersembunyi.includes('min-light'),
  tersembunyi.join(', '),
);
cek(
  'peta padanan menandai tepat tema yang sama (daftar tersembunyi tidak terbelah)',
  JSON.stringify(Object.keys(M.PETA_TEMA_TERSEMBUNYI).sort()) === JSON.stringify([...tersembunyi].sort()),
  Object.keys(M.PETA_TEMA_TERSEMBUNYI).join(', '),
);
cek(
  'tema tersembunyi TIDAK ditawarkan semuaTema()',
  tersembunyi.every((id) => !terlihatId.includes(id)),
  `${tersembunyi.length} tersembunyi, ${terlihatId.length} ditawarkan`,
);

/* — (a) tidak ada perintah theme.* untuk tema tersembunyi — */
for (const id of tersembunyi) {
  const cmd = `theme.${id}`;
  cek(
    `(a) tidak ada perintah ${cmd} di palet`,
    !idPalet.includes(cmd),
    `${idPalet.filter((x) => x === cmd).length} kemunculan`,
  );
  cek(
    `(a) ${cmd} juga tidak ada di COMMAND_BY_ID / COMMANDS`,
    !M.COMMAND_BY_ID.has(cmd) && !M.COMMANDS.some((c) => c.id === cmd),
  );
  cek(
    `(a) findCommand(${cmd}) -> undefined`,
    M.findCommand(cmd) === undefined,
    String(M.findCommand(cmd)),
  );
}
cek(
  '(a) tidak ada satu pun perintah theme.* yang menunjuk id tersembunyi',
  idPalet.filter((x) => x.startsWith('theme.') && tersembunyi.includes(x.slice(6))).length === 0,
  idPalet.filter((x) => x.startsWith('theme.')).join(', '),
);

/* Bukti nyata: mencoba menjalankan perintah tersembunyi tidak mengubah apa pun. */
diterapkan.length = 0;
const pernahJalan = await M.runCommand('theme.github-dark');
cek(
  '(a) runCommand(theme.github-dark) gagal dan tidak menulis setelan',
  pernahJalan === false && diterapkan.length === 0,
  `hasil=${pernahJalan}, applySettings dipanggil ${diterapkan.length}x`,
);

/* — (b) setiap tema yang masih ditawarkan PUNYA perintah — */
const kurangPerintah = terlihatId.filter((id) => !idPalet.includes(`theme.${id}`));
cek(
  '(b) setiap tema di semuaTema() punya perintah theme.<id>',
  kurangPerintah.length === 0,
  kurangPerintah.length ? `tidak ada: ${kurangPerintah.join(', ')}` : `${terlihatId.length} tema`,
);
cek(
  '(b) jumlah perintah tema = jumlah tema yang ditawarkan',
  idPalet.filter((x) => x.startsWith('theme.') && x !== 'theme.next' && x !== 'theme.toggleDarkLight').length ===
    terlihatId.length,
  `${idPalet.filter((x) => x.startsWith('theme.')).length} perintah theme.* untuk ${terlihatId.length} tema`,
);
cek(
  '(b) perintah tema masih terdaftar di COMMAND_IDS (keybinding tetap mengenalinya)',
  terlihatId.every((id) => M.COMMAND_IDS.has(`theme.${id}`)),
  `${terlihatId.filter((id) => M.COMMAND_IDS.has(`theme.${id}`)).length}/${terlihatId.length}`,
);
cek(
  '(b) menemukan perintah tema lewat findCommand',
  terlihatId.every((id) => M.findCommand(`theme.${id}`)?.id === `theme.${id}`),
);

/* — (c) tidak ada id perintah ganda — */
const hitung = new Map();
for (const id of idPalet) hitung.set(id, (hitung.get(id) ?? 0) + 1);
const ganda = [...hitung.entries()].filter(([, n]) => n > 1).map(([id]) => id);
cek(
  '(c) tidak ada id perintah ganda di palet',
  ganda.length === 0,
  ganda.length ? ganda.slice(0, 5).join(', ') : `${hitung.size} id unik dari ${idPalet.length} perintah`,
);
const hitungInti = new Map();
for (const c of M.COMMANDS) hitungInti.set(c.id, (hitungInti.get(c.id) ?? 0) + 1);
const gandaInti = [...hitungInti.entries()].filter(([, n]) => n > 1).map(([id]) => id);
cek(
  '(c) tidak ada id perintah ganda di COMMANDS',
  gandaInti.length === 0,
  gandaInti.length ? gandaInti.join(', ') : `${hitungInti.size} id unik dari ${M.COMMANDS.length} perintah`,
);

/* — (d) perintah pindah-tema tetap menemukan tema yang valid — */
const siklusGagal = [];
for (const id of [...terlihatId, tersembunyi[0]]) {
  diterapkan.length = 0;
  H.curr = id;
  await M.runCommand('theme.next');
  const tujuan = diterapkan.at(-1)?.theme?.current;
  if (!terlihatId.includes(tujuan) || tersembunyi.includes(tujuan)) siklusGagal.push(`${id} -> ${tujuan}`);
}
cek(
  '(d) theme.next selalu mendarat di tema yang ditawarkan (termasuk saat mulai dari id tersembunyi)',
  siklusGagal.length === 0,
  siklusGagal.length ? siklusGagal.slice(0, 4).join(' | ') : `${terlihatId.length + 1} titik mulai`,
);
cek(
  '(d) theme.next tidak pernah mendarat di tema tersembunyi',
  !siklusGagal.some((s) => tersembunyi.some((h) => s.endsWith(`-> ${h}`))),
);
for (const [mode, harap] of [
  ['dark', 'zephyr-light'],
  ['light', 'zephyr-dark'],
]) {
  diterapkan.length = 0;
  H.mode = mode;
  await M.runCommand('theme.toggleDarkLight');
  const tujuan = diterapkan.at(-1)?.theme?.current;
  cek(
    `(d) tema.toggleDarkLight (mode ${mode}) -> ${harap} dan tetap tema yang ditawarkan`,
    tujuan === harap && terlihatId.includes(tujuan),
    String(tujuan),
  );
}
H.mode = 'dark';
/* perintah tema yang ditawarkan benar-benar memasang tema itu, bukan yang lain */
diterapkan.length = 0;
H.curr = 'zephyr-dark';
await M.runCommand('theme.nord');
cek(
  '(d) perintah theme.nord memasang theme.current=nord',
  diterapkan.at(-1)?.theme?.current === 'nord' && diterapkan.at(-1)?.general?.theme === 'dark',
  JSON.stringify(diterapkan.at(-1) ?? null),
);

/* — (e) tema tersembunyi tidak hilang dari jalur baca — */
cek(
  '(e) isKnownTheme tetap mengenali id tersembunyi (setelan lama tidak jatuh ke jalur "tidak dikenal")',
  tersembunyi.every((id) => M.isKnownTheme(id) === true),
);
cek(
  '(e) resolveTheme memindahkan id tersembunyi ke pasangannya',
  M.resolveTheme({ theme: 'dark' }, { current: 'github-dark' }) === 'zephyr-dark' &&
    M.resolveTheme({ theme: 'light' }, { current: 'min-light' }) === 'zephyr-light',
  `github-dark -> ${M.resolveTheme({ theme: 'dark' }, { current: 'github-dark' })}, min-light -> ${M.resolveTheme({ theme: 'light' }, { current: 'min-light' })}`,
);
cek(
  '(e) id tersembunyi tidak pernah jadi hasil render',
  tersembunyi.every(
    (id) =>
      !['dark', 'light', 'system'].includes(
        String(M.resolveTheme({ theme: 'dark' }, { current: id })),
      ) && tersembunyi.every((h) => M.resolveTheme({ theme: 'dark' }, { current: id }) !== h),
  ),
);

/* — (f) satu sumber kebenaran: sumber tidak menyalin daftar/syaratnya — */
const tanpaKomentar = sumberRegistry
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
cek(
  '(f) commandRegistry.ts mengambil perintah tema dari semuaTema()',
  /\.\.\.semuaTema\(\)\.map\(/.test(tanpaKomentar),
);
const menyalinPredikat = /tersembunyi/.test(tanpaKomentar) || /\.\.\.THEMES\.map\(\(t\)/.test(tanpaKomentar);
cek(
  '(f) commandRegistry.ts tidak menyalin syarat "tersembunyi"',
  !menyalinPredikat,
  menyalinPredikat
    ? 'MASIH menyalin: ada penyaring THEMES/tanda tersembunyi di kode'
    : 'tidak ada filter/predikat tema tersembunyi yang disalin',
);

/* — Ringkasan: sebelum/sesudah — */
const perTemaMentah = M.THEMES.map((t) => `theme.${t.id}`);
const perTemaNyata = idPalet.filter(
  (x) => x.startsWith('theme.') && x !== 'theme.next' && x !== 'theme.toggleDarkLight',
);
const dibuang = perTemaMentah.filter((id) => !perTemaNyata.includes(id));
console.log(
  `\n  Perintah theme.<id> : THEMES mentah = ${perTemaMentah.length}, sesudah = ${perTemaNyata.length}` +
    ` (dibuang: ${dibuang.join(', ') || '—'})` +
    `; perintah meta (next/toggleDarkLight) tetap 2`,
);
console.log(`\n== ${lulus}/${total} lulus ==`);
if (gagal.length) console.log(`   gagal: ${gagal.join('; ')}`);
process.exit(lulus === total ? 0 : 1);
