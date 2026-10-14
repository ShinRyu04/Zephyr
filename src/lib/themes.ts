/**
 * Tokens the Theme Builder may override.
 *
 * Colour tokens only — spacing, fonts and sizes are not what a theme builder is
 * for, and a reader editing `--radius` through a colour picker would be using a
 * control whose shape lies about what it changes.
 *
 * The `--syn-*` entries are the ELEVEN code-colour tokens the editor actually
 * paints with (`src/styles/editor-themes.ts`: keyword, string, number, comment,
 * function, variable, type, operator, tag, attr, invalid). All eleven belong
 * here, not seven: a token the builder cannot write is also a token the clearing
 * pass in `applyTheme` never removes, so an override that did set
 * `--syn-operator` would survive a theme switch and leave that one colour from
 * the previous theme while the other ten changed — a theme that half-changes the
 * code, which is exactly the bug this list exists to prevent.
 *
 * Lives here rather than in `themeBuilder.ts` because THIS is the module that
 * writes them; the builder imports it. The other direction would be a cycle, and
 * the applier is the side that must not be able to drift from the list.
 */
export const TOKEN_OVERRIDE = [
  '--bg',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--border',
  '--border-strong',
  '--text',
  '--text-secondary',
  '--text-muted',
  '--accent',
  '--danger',
  '--warning',
  '--success',
  '--added',
  '--modified',
  '--deleted',
  '--editor-bg',
  '--editor-gutter',
  '--editor-active-line',
  '--editor-selection',
  '--syn-keyword',
  '--syn-string',
  '--syn-number',
  '--syn-comment',
  '--syn-function',
  '--syn-variable',
  '--syn-type',
  '--syn-operator',
  '--syn-tag',
  '--syn-attr',
  '--syn-invalid',
] as const;

export type TokenOverride = (typeof TOKEN_OVERRIDE)[number];

export interface ThemeInfo {
  id: string;
  label: string;
  kind: 'dark' | 'light';

  hint: string;

  /**
   * Tema yang isinya kembar dengan tema lain, jadi tidak lagi ditawarkan.
   *
   * Tema begini TIDAK dihapus dari `THEMES`. `isKnownTheme` dan `infoTema` wajib
   * tetap mengenali id-nya: id itu masih tersimpan di setelan user yang sudah
   * memakainya, dan id yang tidak dikenal jatuh ke `zephyr-dark` lewat jalur
   * "tidak dikenal" — pilihan user terlihat ditolak diam-diam, sedangkan
   * `resolveTheme` memindahkannya ke pasangannya (lihat PETA_TEMA_TERSEMBUNYI).
   *
   * Satu-satunya yang berubah: `semuaTema()` tidak lagi mengembalikannya, dan
   * dari situ pemilih tema, komando siklus tema, dan jembatan dev ikut bersih.
   */
  tersembunyi?: boolean;
}

export const THEMES: ThemeInfo[] = [
  { id: 'zephyr-dark', label: 'Zephyr Dark', kind: 'dark', hint: 'theme.hint.zephyrDark' },
  { id: 'zephyr-light', label: 'Zephyr Light', kind: 'light', hint: 'theme.hint.zephyrLight' },
  { id: 'nord', label: 'Nord', kind: 'dark', hint: 'theme.hint.nord' },
  { id: 'tokyo-night', label: 'Tokyo Night', kind: 'dark', hint: 'theme.hint.tokyoNight' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', kind: 'dark', hint: 'theme.hint.gruvboxDark' },
  { id: 'one-dark', label: 'One Dark Pro', kind: 'dark', hint: 'theme.hint.oneDark' },
  { id: 'senja', label: 'Senja', kind: 'dark', hint: 'theme.hint.senja' },
  { id: 'zephyr-acrylic', label: 'Zephyr Dark Acrylic', kind: 'dark', hint: 'theme.hint.zephyrAcrylic' },

  {
    id: 'high-contrast',
    label: 'High Contrast',
    kind: 'dark',
    hint: 'theme.hint.highContrast',
  },

  { id: 'dracula', label: 'Dracula', kind: 'dark', hint: 'theme.hint.dracula' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', kind: 'dark', hint: 'theme.hint.catppuccinMocha' },
  { id: 'rose-pine', label: 'Rosé Pine', kind: 'dark', hint: 'theme.hint.rosePine' },
  { id: 'kanagawa', label: 'Kanagawa', kind: 'dark', hint: 'theme.hint.kanagawa' },
  { id: 'everforest-dark', label: 'Everforest', kind: 'dark', hint: 'theme.hint.everforest' },
  /* Kembar dengan zephyr-dark: 72% var:nilai identik dan SELURUH 11 token
     `--syn-*` sama persis (lihat docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md).
     Ditawarkan lagi nanti sebagai paket ekstensi resmi. */
  { id: 'github-dark', label: 'GitHub Dark', kind: 'dark', hint: 'theme.hint.githubDark', tersembunyi: true },
  { id: 'ayu-mirage', label: 'Ayu Mirage', kind: 'dark', hint: 'theme.hint.ayuMirage' },
  { id: 'solarized-light', label: 'Solarized Light', kind: 'light', hint: 'theme.hint.solarizedLight' },
  { id: 'nord-light', label: 'Nord Light', kind: 'light', hint: 'theme.hint.nordLight' },
  /* Kembar dengan zephyr-light: 61% var:nilai identik + 11 token `--syn-*` sama
     persis. Solarized Light (0%) dan Nord Light (3%) SENGAJA tetap di sini. */
  { id: 'min-light', label: 'Min Light', kind: 'light', hint: 'theme.hint.minLight', tersembunyi: true },
];

/**
 * Pasangan pengganti untuk tema kembar yang disembunyikan.
 *
 * Dipakai `resolveTheme`, jadi user yang tema aktifnya salah satu dari dua id itu
 * tidak melihat apa pun berubah: yang dirender adalah warna pasangannya, bukan
 * jatuh ke `zephyr-dark` seperti id yang tidak dikenal. Warna kode (`--syn-*`)
 * ikut aman justru karena pasangan inilah yang dipakai — pasangan kedua tema ini
 * kembar token, jadi hasil render sebelum dan sesudah penyembunyian sama.
 *
 * Diekspor supaya harness bisa memeriksa peta ini, bukan menyalinnya.
 * Blok CSS `[data-theme='github-dark']`/`[data-theme='min-light']` di
 * `src/styles/theme.css` sengaja TIDAK dihapus: dua-duanya jadi isi paket
 * ekstensi resmi nanti.
 */
export const PETA_TEMA_TERSEMBUNYI: Record<string, string> = {
  'github-dark': 'zephyr-dark',
  'min-light': 'zephyr-light',
};

export const isKnownTheme = (id: string) =>
  THEMES.some((t) => t.id === id) || temaEkstensiTerdaftar(id);

let temaEkstensi: ThemeInfo[] = [];
let terapkanEkstensi: ((id: string) => boolean) | null = null;

export function daftarkanTemaEkstensi(
  list: ThemeInfo[],
  terapkan: (id: string) => boolean,
): void {
  temaEkstensi = list;
  terapkanEkstensi = terapkan;
}

export const temaEkstensiTerdaftar = (id: string) => temaEkstensi.some((t) => t.id === id);

/**
 * Tema yang DITAWARKAN: bawaan + tema ekstensi, minus yang `tersembunyi`.
 *
 * Ini satu-satunya daftar yang boleh dipakai pemilih/komando tema. Menyaring di
 * sini, bukan di tiap pemanggil, karena pemanggilnya lebih dari satu (kartu tema,
 * komando siklus tema, jembatan dev) dan satu yang lupa menyaring akan
 * menawarkan kembali tema yang sudah diputuskan keluar — termasuk lewat tombol
 * "siklus tema" yang tidak terlihat seperti daftar tema sama sekali.
 */
export const semuaTema = (): ThemeInfo[] =>
  [...THEMES, ...temaEkstensi].filter((t) => !t.tersembunyi);

const infoTema = (id: string): ThemeInfo | undefined =>
  THEMES.find((t) => t.id === id) ?? temaEkstensi.find((t) => t.id === id);

export function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export function watchSystemTheme(onChange: (dark: boolean) => void): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => {};
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

const sudahDilaporkan: Set<string> = new Set();

/**
 * Pindahkan id tema tersembunyi ke pasangannya, dan catat SEKALI per id.
 *
 * Sekali, bukan tiap render: `resolveTheme` dipanggil dari setiap penerapan
 * setelan, dan log yang mengulang di tiap panggilan menenggelamkan baris lain di
 * konsol — termasuk baris yang menandakan masalah sungguhan.
 */
function padananTema(id: string): string {
  const padanan = PETA_TEMA_TERSEMBUNYI[id];
  if (!padanan) return id;
  if (!sudahDilaporkan.has(id)) {
    sudahDilaporkan.add(id);
    console.info(`[tema] "${id}" sudah disembunyikan dari pemilih; memakai padanannya "${padanan}".`);
  }
  return padanan;
}

/**
 * Tema mana yang benar-benar dirender.
 *
 * Aturan "mode menang": kalau mode tampilan (pill Umum: Zephyr Dark / Zephyr Light /
 * System) tidak sejenis dengan tema yang dipilih, yang dirender adalah tema Zephyr
 * pasangannya. Ini disengaja — label pill-nya memang berarti "pakai tema Zephyr ini".
 *
 * Yang dulu jadi masalah (item C3) bukan aturannya, tapi UI-nya yang tidak ikut:
 * kartu tema di Setelan menandai `theme.current` mentah, jadi saat mode menimpa
 * pilihan, kartu menunjuk tema yang tidak sedang dipakai — terlihat seperti pilihan
 * user ditolak diam-diam. Sekarang dua jalur UI-nya konsisten:
 *   - pill Zephyr Light/Dark ikut memindahkan `theme.current` ke pasangannya
 *     (SectionsBasic, GeneralSection), dan
 *   - kartu tema aktif dihitung dari resolveTheme() (SectionsBasic, ThemeSection),
 * jadi kalau aturan ini tetap menimpa (mis. state lama dari versi sebelumnya),
 * yang terlihat di UI sama dengan yang dirender.
 * `scripts/uji-t6-tema-mode.mjs` mengunci ketiga hal itu lewat run nyata.
 */

export function resolveTheme(general: { theme: string }, theme: { current: string }): string {
  const diminta = isKnownTheme(theme.current) ? theme.current : 'zephyr-dark';
  /* Pemindahan dilakukan SEBELUM aturan mode, supaya `info.kind` yang dipakai di
     bawah adalah kind pasangannya. */
  const wanted = padananTema(diminta);
  const info = infoTema(wanted) ?? THEMES[0];

  const mode = general.theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : general.theme;
  if (mode === 'light' && info.kind !== 'light') return 'zephyr-light';
  if (mode === 'dark' && info.kind === 'light') return 'zephyr-dark';
  return wanted;
}

export function applyTheme(
  general: { theme: string; zoom?: number },
  theme: { current: string; accent?: string; overrides?: Record<string, string> },

  background?: { image?: string; opacity?: number; size?: 'fill' | 'fit' | 'center'; transparan?: boolean },
): string {
  const id = resolveTheme(general, theme);
  const root = document.documentElement;

  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-hover');
  root.style.removeProperty('--accent-subtle');

  const dariEkstensi = temaEkstensiTerdaftar(id);
  if (dariEkstensi) {
    const kind = infoTema(id)?.kind === 'light' ? 'zephyr-light' : 'zephyr-dark';
    root.dataset.theme = kind;
    root.dataset.extTheme = id;
    terapkanEkstensi?.(id);
  } else {
    root.dataset.theme = id;
    delete root.dataset.extTheme;

    terapkanEkstensi?.('');
  }

  if (theme.accent && /^#[0-9a-f]{6}$/i.test(theme.accent)) {
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-hover', theme.accent);
    root.style.setProperty('--accent-subtle', hexToRgba(theme.accent, 0.16));
  }

  // Theme extensions write their palette variables above. Apply the user layer last so
  // a base/extension theme refresh can never replace the current custom background.
  // Passing an empty image deliberately clears every related variable, so reset remains
  // immediate and deterministic from the supplied settings snapshot.
  const bg = background?.image ?? '';
  if (bg) {
    let aman = '';
    for (const ch of bg) {
      if (ch === '"' || ch === "'" || ch === '(' || ch === ')' || ch === '\\') continue;
      aman += ch;
    }
    root.style.setProperty('--bg-image', 'url("' + aman + '")');
    const op = typeof background?.opacity === 'number' ? Math.max(0, Math.min(100, background.opacity)) : 100;
    root.style.setProperty('--bg-opacity', String(op / 100));
    root.style.setProperty('--bg-size', background?.size === 'fit' ? 'contain' : background?.size === 'center' ? 'auto' : 'cover');
    root.dataset.bg = background?.transparan === false ? 'solid' : 'on';
  } else {
    root.style.removeProperty('--bg-image');
    root.style.removeProperty('--bg-opacity');
    root.style.removeProperty('--bg-size');
    delete root.dataset.bg;
  }

  const zoom = typeof general.zoom === 'number' ? general.zoom : 100;
  root.style.fontSize = `${Math.round((Math.max(50, Math.min(200, zoom)) / 100) * 16)}px`;

  /*
   * Theme Builder overrides LAST, and here rather than at the call sites.
   *
   * Four places call `applyTheme`, and an override applied at only some of them
   * would survive a theme change but vanish after a settings reload — the kind of
   * inconsistency that reads as a random bug. Applying inside keeps every caller
   * correct without any of them knowing this exists.
   *
   * It runs after the extension and accent layers because an override is the
   * reader's own decision and outranks both.
   *
   * A token absent from `overrides` has its inline property REMOVED, not set to
   * empty: `setProperty('--bg', '')` yields an invalid value, which cascades
   * differently from a missing one. Removing is what "not overridden" means.
   *
   * The clearing pass runs on EVERY token in `TOKEN_OVERRIDE` — `--bg`,
   * `--surface`, the whole `--syn-*` set — and those are exactly the names an
   * installed theme pack writes inline. Clearing them and stopping there left a
   * freshly installed theme sitting on the built-in palette for every token the
   * builder knows about, which reads as "the theme installed but did nothing".
   * So: clear, re-apply the theme pack, then lay the overrides on top.
   */
  const ov = theme.overrides ?? {};
  for (const t of TOKEN_OVERRIDE) root.style.removeProperty(t);
  if (dariEkstensi) terapkanEkstensi?.(id);
  for (const t of TOKEN_OVERRIDE) {
    const v = ov[t];
    if (typeof v === 'string' && v.trim()) root.style.setProperty(t, v.trim());
  }
  /* The derived accent shades follow the override when there is one, so a custom
     accent does not leave the hover state on the theme's own colour. */
  const ovAksen = ov['--accent'];
  if (typeof ovAksen === 'string' && ovAksen.trim()) {
    root.style.setProperty('--accent-hover', ovAksen.trim());
    root.style.setProperty('--accent-subtle', hexToRgba(ovAksen.trim(), 0.16));
  }

  return id;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
