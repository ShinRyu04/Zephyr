// uji-t5-tema.mjs — tema baru + latar belakang kustom.
//
// Permintaan user: "tambahkan banyak tema nya ya, bebas tema gimna pun, dan jga
// bisa edit background jga ntah pasang foto, apakah bisa?"
//
// Dua bagian:
//   A. Tabel tema — dijalankan dengan mengimpor `src/lib/themes.ts` LANGSUNG.
//      Butuh Node >= 23 (type stripping). Tidak butuh app, jadi pemeriksaan
//      penyembunyian tema kembar tetap bisa dijalankan di mana pun.
//   B. UI + jalur Rust — lewat CDP di app yang benar-benar berjalan.
//
// Kenapa bagian A ada: `github-dark` dan `min-light` disembunyikan dari pemilih
// pada 2026-10-14 (kembar token dengan `zephyr-dark`/`zephyr-light`, lihat
// docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md). Yang mengunci keputusan itu bukan
// jumlah kartu di DOM — kartu bisa saja benar sementara `semuaTema()` masih
// menawarkan tema kembar ke komando siklus tema. Jadi tabelnya diperiksa
// langsung di sumbernya.
import { Cdp } from './lib-cdp.mjs';

const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (!ok) process.exitCode = 1;
};

const catat = (teks) => console.log(`        ${teks}`);

// ── A1: muat modul tema (tanpa app) ───────────────────────────────────────
console.log('=== A. Tabel tema (impor langsung, tanpa app) ===\n');

let T;
/*
 * `systemPrefersDark()` membaca `window.matchMedia`. Mode `system` ikut diperiksa
 * di bagian ini, jadi `window` perlu ada — TAPI ini bukan uji DOM: yang diuji
 * hanya "mode apa pun tidak boleh menghasilkan id tema tersembunyi". Perilaku
 * mode `system` yang sebenarnya diuji di app hidup (uji-t6-tema-mode.mjs).
 */
globalThis.window ??= { matchMedia: () => ({ matches: true }) };
try {
  T = await import(new URL('../src/lib/themes.ts', import.meta.url).href);
} catch (e) {
  cek('impor src/lib/themes.ts', false, `${e?.code ?? ''} ${e?.message ?? e}`.slice(0, 120));
  console.log('\n        Node ini tidak bisa membaca .ts langsung (butuh Node >= 23).');
  process.exit(1);
}
cek('impor src/lib/themes.ts', true, `${T.semuaTema().length} tema ditawarkan`);

const TERSEMBUNYI = ['github-dark', 'min-light'];
const terlihat = T.semuaTema();
const terlihatId = terlihat.map((t) => t.id);
const tersembunyiDiTabel = T.THEMES.filter((t) => t.tersembunyi).map((t) => t.id);

cek(
  'tabel THEMES tidak dikurangi (19 baris, 2 di antaranya tersembunyi)',
  T.THEMES.length === 19 && tersembunyiDiTabel.length === 2,
  `${T.THEMES.length} baris, ${tersembunyiDiTabel.length} tersembunyi`,
);
cek(
  'yang ditandai tersembunyi tepat github-dark + min-light',
  tersembunyiDiTabel.length === TERSEMBUNYI.length && TERSEMBUNYI.every((id) => tersembunyiDiTabel.includes(id)),
  tersembunyiDiTabel.join(', '),
);

// (a) 2 tema itu tidak ada di semuaTema()
cek(
  '(a) 2 tema kembar TIDAK ditawarkan semuaTema()',
  TERSEMBUNYI.every((id) => !terlihatId.includes(id)),
  terlihatId.length + ' tema terlihat',
);
cek('(a) jumlah tema terlihat = 19 - 2 = 17', terlihatId.length === 17, `${terlihatId.length} tema`);
cek('(a) tidak ada id kembar/duplikat di semuaTema()', new Set(terlihatId).size === terlihatId.length);

// (c) tema lain tetap utuh — termasuk yang SENGAJA dipertahankan
const WAJIB_TETAP = [
  'zephyr-dark',
  'zephyr-light',
  'high-contrast',
  'solarized-light',
  'nord-light',
  'nord',
  'tokyo-night',
  'gruvbox-dark',
  'one-dark',
  'senja',
  'zephyr-acrylic',
  'dracula',
  'catppuccin-mocha',
  'rose-pine',
  'kanagawa',
  'everforest-dark',
  'ayu-mirage',
];
cek(
  '(c) 17 tema lain tetap ada di semuaTema()',
  WAJIB_TETAP.every((id) => terlihatId.includes(id)) && WAJIB_TETAP.length === 17,
  `kurang: ${WAJIB_TETAP.filter((id) => !terlihatId.includes(id)).join(', ') || '-'}`,
);
cek(
  '(c) Solarized Light/Nord Light/High Contrast TIDAK ikut disembunyikan',
  ['solarized-light', 'nord-light', 'high-contrast'].every((id) => terlihatId.includes(id)),
);

// isKnownTheme harus tetap mengenali id lama, atau setelan user lama jatuh ke zephyr-dark
cek(
  'isKnownTheme tetap mengenali 2 id tersembunyi (setelan lama tidak jatuh ke zephyr-dark)',
  TERSEMBUNYI.every((id) => T.isKnownTheme(id)),
  TERSEMBUNYI.map((id) => `${id}=${T.isKnownTheme(id)}`).join(' '),
);
cek(
  'isKnownTheme tetap mengenali tema terlihat',
  WAJIB_TETAP.every((id) => T.isKnownTheme(id)),
);

// (b) resolveTheme memindahkan ke pasangannya
cek(
  'PETA_TEMA_TERSEMBUNYI = {github-dark: zephyr-dark, min-light: zephyr-light}',
  Object.keys(T.PETA_TEMA_TERSEMBUNYI).length === 2 &&
    T.PETA_TEMA_TERSEMBUNYI['github-dark'] === 'zephyr-dark' &&
    T.PETA_TEMA_TERSEMBUNYI['min-light'] === 'zephyr-light',
  JSON.stringify(T.PETA_TEMA_TERSEMBUNYI),
);
cek(
  '(b) resolveTheme(github-dark) -> zephyr-dark',
  T.resolveTheme({ theme: 'dark' }, { current: 'github-dark' }) === 'zephyr-dark',
  T.resolveTheme({ theme: 'dark' }, { current: 'github-dark' }),
);
cek(
  '(b) resolveTheme(min-light) -> zephyr-light',
  T.resolveTheme({ theme: 'light' }, { current: 'min-light' }) === 'zephyr-light',
  T.resolveTheme({ theme: 'light' }, { current: 'min-light' }),
);

// resolveTheme tidak boleh pernah mengembalikan tema tersembunyi — apa pun mode
// dan pilihan tersimpannya.
const bocor = [];
for (const mode of ['dark', 'light', 'system']) {
  for (const t of T.THEMES) {
    const hasil = T.resolveTheme({ theme: mode }, { current: t.id });
    if (TERSEMBUNYI.includes(hasil)) bocor.push(`${mode}/${t.id}->${hasil}`);
  }
}
cek('(b) resolveTheme tidak pernah mengembalikan tema tersembunyi', bocor.length === 0, bocor.join(', '));

// Tema yang masih terlihat harus resolve ke dirinya sendiri (mode cocok).
const salah = [];
for (const t of terlihat) {
  const mode = t.kind === 'light' ? 'light' : 'dark';
  const hasil = T.resolveTheme({ theme: mode }, { current: t.id });
  if (hasil !== t.id) salah.push(`${t.id}->${hasil}`);
}
cek('(c) tiap tema terlihat tetap resolve ke dirinya sendiri', salah.length === 0, salah.join(', '));

console.log('');

// ── B: UI + jalur Rust lewat CDP ──────────────────────────────────────────
//
// Bagian B memang butuh app hidup. Kegagalan attach dilaporkan sebagai baris
// GAGAL yang bisa dibaca — dulu `Cdp.attach` melempar mentah dan laporannya
// berhenti sebagai stack trace `fetch failed`, yang terbaca seperti harness rusak
// padahal app-nya saja yang tidak jalan. Bagian A di atas tetap sah tanpa app.
let cdp;
try {
  ({ cdp } = await Cdp.attach(9223, 'Zephyr'));
} catch (e) {
  cek('attach CDP ke app hidup (port 9223)', false, `${e?.cause?.code ?? e?.code ?? ''} ${e?.message ?? e}`.slice(0, 130));
  console.log('\n        Butuh zephyr.exe dengan WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"');
  console.log('        dan `npm run dev` (vite). Tanpa app, hanya bagian A yang bisa dinilai.');
  console.log(`\n== ${process.exitCode ? 'ADA YANG GAGAL' : 'SEMUA LULUS'} ==`);
  process.exit(process.exitCode || 0);
}
console.log('=== B. Tema baru + latar belakang (app hidup) ===\n');

// ── V1: katalog tema ─────────────────────────────────────────────────────
const v1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setActivity('settings');
  S.getState().setSidebarVisible(true);
  S.getState().setSettingsOpen(true);
  await new Promise((r) => setTimeout(r, 900));
  document.querySelector('[data-testid="set-nav-theme"]')?.click();
  await new Promise((r) => setTimeout(r, 1200));
  const kartu = [...document.querySelectorAll('[data-theme-card]')].map((e) => e.getAttribute('data-theme-card'));
  const ditawarkan = window.__ZEPHYR_EXT19__?.semuaTema?.() ?? null;
  return { jumlah: kartu.length, kartu, ditawarkan };
})())`,
  90000,
);
/* Ambang diturunkan 2 pada 2026-10-14: tabel bawaan tetap 19 baris, tapi 2 tema
   kembar disembunyikan sehingga kartu yang ditawarkan tinggal 17. Ambangnya
   `>= 16` (bukan `=== 17`) karena paket ekstensi boleh menambah kartu. */
cek('katalog tema tetap banyak (>= 16, turun 2 karena tema kembar disembunyikan)', v1.jumlah >= 16, `${v1.jumlah} kartu`);
for (const id of [
  'dracula',
  'catppuccin-mocha',
  'rose-pine',
  'kanagawa',
  'everforest-dark',
  'ayu-mirage',
  'solarized-light',
  'nord-light',
  'high-contrast',
]) {
  cek(`tema "${id}" ada`, v1.kartu.includes(id));
}

// Pemeriksaan baru: 2 tema kembar TIDAK boleh muncul di pemilih, tapi tetap
// dikenali sebagai id (bukan dihapus dari tabel).
for (const id of TERSEMBUNYI) {
  cek(`tema tersembunyi "${id}" tidak muncul sebagai kartu`, !v1.kartu.includes(id));
}
cek(
  'semuaTema() di app juga tidak menawarkan 2 tema tersembunyi',
  Array.isArray(v1.ditawarkan) && TERSEMBUNYI.every((id) => !v1.ditawarkan.includes(id)),
  v1.ditawarkan === null ? 'bridge semuaTema() tidak ada' : `${v1.ditawarkan.length} tema`,
);
cek(
  'jumlah kartu = jumlah tema yang ditawarkan semuaTema()',
  Array.isArray(v1.ditawarkan) && v1.ditawarkan.length === v1.jumlah,
  `${v1.jumlah} kartu vs ${v1.ditawarkan?.length}`,
);

// ── V2: tiap tema terlihat punya token LENGKAP (tidak jatuh ke tema lain) ──
const v2ids = [
  'dracula',
  'catppuccin-mocha',
  'rose-pine',
  'kanagawa',
  'everforest-dark',
  'ayu-mirage',
  'solarized-light',
  'nord-light',
  'high-contrast',
];
const v2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const daftar = ${JSON.stringify(v2ids.map((id) => [id, id.includes('light') ? 'light' : 'dark']))};
  const out = [];
  const TOKEN = ['--bg', '--surface', '--text', '--accent', '--border', '--editor-bg', '--syn-keyword', '--syn-string'];
  for (const [id, mode] of daftar) {
    await S.getState().applySettings({ theme: { current: id }, general: { theme: mode } });
    await new Promise((r) => setTimeout(r, 320));
    const cs = getComputedStyle(document.documentElement);
    const nilai = TOKEN.map((t) => (cs.getPropertyValue(t) || '').trim());
    out.push({ id, lengkap: nilai.every((x) => x.length > 0), contoh: nilai[0] });
  }
  return out;
})())`,
  150000,
);
for (const x of v2) {
  cek(`tema "${x.id}" semua token terisi`, x.lengkap, x.contoh);
}

// ── V2b: tema tersembunyi yang masih tersimpan di setelan dirender sebagai
//         pasangannya (bukan jatuh ke zephyr-dark lewat jalur "tidak dikenal") ──
const v2b = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const baca = () => {
    const cs = getComputedStyle(document.documentElement);
    return {
      tema: document.documentElement.dataset.theme ?? null,
      bg: cs.getPropertyValue('--bg').trim(),
      syn: ['--syn-keyword', '--syn-string', '--syn-comment'].map((t) => cs.getPropertyValue(t).trim()).join('|'),
    };
  };
  const out = {};
  for (const [id, mode, pasangan] of [['github-dark', 'dark', 'zephyr-dark'], ['min-light', 'light', 'zephyr-light']]) {
    // Warna pasangan diukur dulu sebagai pembanding, bukan diasumsikan.
    await S.getState().applySettings({ theme: { current: pasangan }, general: { theme: mode } });
    await new Promise((r) => setTimeout(r, 400));
    const acuan = baca();
    // Lalu id lama yang masih tersimpan di setelan user.
    await S.getState().applySettings({ theme: { current: id }, general: { theme: mode } });
    await new Promise((r) => setTimeout(r, 500));
    const sesudah = baca();
    out[id] = {
      pasangan,
      tersimpan: window.__ZEPHYR_THEME__?.inStore?.() ?? null,
      dataTheme: sesudah.tema,
      samaBg: sesudah.bg === acuan.bg,
      samaSyn: sesudah.syn === acuan.syn,
      bg: acuan.bg + ' -> ' + sesudah.bg,
    };
  }
  return out;
})())`,
  120000,
);
for (const [id, r] of Object.entries(v2b)) {
  cek(`tema tersembunyi "${id}" dirender sebagai "${r.pasangan}"`, r.dataTheme === r.pasangan, `data-theme=${r.dataTheme}`);
  cek(`tema tersembunyi "${id}" memakai warna pasangannya (--bg & --syn-*)`, r.samaBg && r.samaSyn, r.bg);
  catat(`setelan tersimpan ` + `"${id}" tetap "${r.tersimpan}" (pemindahan ada di resolveTheme, bukan tulis ulang setelan)`);
}

// ── V3: ganti tema benar-benar mengubah warna ─────────────────────────────
const v3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const baca = () => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  await S.getState().applySettings({ theme: { current: 'dracula' }, general: { theme: 'dark' } });
  await new Promise((r) => setTimeout(r, 400));
  const a = baca();
  await S.getState().applySettings({ theme: { current: 'nord' }, general: { theme: 'dark' } });
  await new Promise((r) => setTimeout(r, 400));
  const b = baca();
  await S.getState().applySettings({ theme: { current: 'zephyr-dark' }, general: { theme: 'dark' } });
  await new Promise((r) => setTimeout(r, 400));
  const c = baca();
  return { dracula: a, nord: b, kembali: c, dataTheme: document.documentElement.dataset.theme };
})())`,
  120000,
);
cek('ganti tema mengubah warna latar', v3.dracula !== v3.nord, `dracula=${v3.dracula} nord=${v3.nord}`);
cek('kembali ke zephyr-dark', v3.dataTheme === 'zephyr-dark', v3.dataTheme);

// ── V4: UI latar belakang ada ─────────────────────────────────────────────
const v4 = await cdp.json(
  `return JSON.stringify({
  pick: !!document.querySelector('[data-testid="theme-bg-pick"]'),
  clear: !!document.querySelector('[data-testid="theme-bg-clear"]'),
  adaRowLatar: [...document.querySelectorAll('.set-label')].some((e) => /latar belakang/i.test(e.textContent || '')),
})`,
  60000,
);
cek('tombol "Pilih gambar" ada', v4.pick);
cek('tombol reset latar ada', v4.clear);
cek('baris "Latar belakang" ada', v4.adaRowLatar);

// ── V5: pasang latar (pakai gambar sintetis kecil) ────────────────────────
const v5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  // PNG 1x1 transparan sebagai data URL — cukup untuk membuktikan jalur
  // CSS variable + atribut data-bg bekerja tanpa perlu file di disk.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await S.getState().applySettings({ background: { image: png, opacity: 40, size: 'fill', transparan: true } });
  await new Promise((r) => setTimeout(r, 700));
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const sebelum = {
    dataBg: root.dataset.bg ?? null,
    bgImage: cs.getPropertyValue('--bg-image').trim().slice(0, 30),
    opacity: cs.getPropertyValue('--bg-opacity').trim(),
    size: cs.getPropertyValue('--bg-size').trim(),
  };
  // Panel jadi tembus pandang
  const panel = document.querySelector('.sidebar') || document.querySelector('.main-area');
  const bgPanel = panel ? getComputedStyle(panel).backgroundColor : '';
  // Bersihkan
  await S.getState().applySettings({ background: { image: '' } });
  await new Promise((r) => setTimeout(r, 700));
  const sesudah = {
    dataBg: root.dataset.bg ?? null,
    bgImage: cs.getPropertyValue('--bg-image').trim(),
  };
  return { sebelum, sesudah, bgPanel };
})())`,
  120000,
);
cek('latar terpasang (data-bg=on)', v5.sebelum.dataBg === 'on', String(v5.sebelum.dataBg));
cek('--bg-image terisi', v5.sebelum.bgImage.includes('url'), v5.sebelum.bgImage);
cek('--bg-opacity = 0.4', v5.sebelum.opacity === '0.4', v5.sebelum.opacity);
cek('--bg-size = cover', v5.sebelum.size === 'cover', v5.sebelum.size);
cek('latar bisa dihapus', v5.sesudah.dataBg === null && !v5.sesudah.bgImage.includes('url'), String(v5.sesudah.dataBg));

// ── V6: command Rust bg_image_read menolak file non-gambar ────────────────
const v6 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  const out = {};
  try {
    await Ti.invoke('bg_image_read', { path: 'D:/Zephyr/package.json' });
    out.nonGambar = 'DITERIMA (salah)';
  } catch (e) {
    out.nonGambar = (e?.message ?? JSON.stringify(e)).slice(0, 80);
  }
  try {
    await Ti.invoke('bg_image_read', { path: 'D:/tidak-ada-file-ini.png' });
    out.hilang = 'DITERIMA (salah)';
  } catch (e) {
    out.hilang = (e?.message ?? JSON.stringify(e)).slice(0, 80);
  }
  return out;
})())`,
  90000,
);
cek('bg_image_read menolak file non-gambar', /format|dikenali/i.test(v6.nonGambar), v6.nonGambar.slice(0, 50));
cek('bg_image_read menolak file tidak ada', /bukan file|tidak/i.test(v6.hilang), v6.hilang.slice(0, 50));

await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`,
  60000,
);

await cdp.close();
console.log(`\n== ${process.exitCode ? 'ADA YANG GAGAL' : 'SEMUA LULUS'} ==`);
