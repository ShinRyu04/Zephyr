// themes.ts — katalog tema + penerapan ke DOM (fase 08).
//
// Satu-satunya tempat yang menyentuh `document.documentElement.dataset.theme`
// dan `--accent` override. Komponen lain cukup memanggil `applyTheme()`.
//
// Token warnanya sendiri ada di src/styles/theme.css ([data-theme='...']).


export interface ThemeInfo {
  id: string;
  label: string;
  kind: 'dark' | 'light';
  /** warna untuk kartu preview di Settings (dibaca dari CSS saat render) */
  hint: string;
}

export const THEMES: ThemeInfo[] = [
  { id: 'zephyr-dark', label: 'Zephyr Dark', kind: 'dark', hint: 'default, kontras tinggi' },
  { id: 'zephyr-light', label: 'Zephyr Light', kind: 'light', hint: 'terang, untuk siang' },
  { id: 'nord', label: 'Nord', kind: 'dark', hint: 'biru dingin, lembut' },
  { id: 'tokyo-night', label: 'Tokyo Night', kind: 'dark', hint: 'ungu-biru, malam' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', kind: 'dark', hint: 'hangat, retro' },
  { id: 'one-dark', label: 'One Dark Pro', kind: 'dark', hint: 'ala Atom/VS Code' },
  { id: 'senja', label: 'Senja', kind: 'dark', hint: 'gelap hangat, aksen jingga senja' },
  { id: 'zephyr-acrylic', label: 'Zephyr Dark Acrylic', kind: 'dark', hint: 'modern ADE, transparan & glass' },
  // FASE 31: high contrast adalah TEMA BIASA, bukan mode terpisah — seluruh
  // mesin tema (kartu Settings, retheme xterm, Compartment CodeMirror) langsung
  // bekerja. Sebagai "mode", tiap pembaca tema harus diajari kasus kedua.
  {
    id: 'high-contrast',
    label: 'High Contrast',
    kind: 'dark',
    hint: 'AAA, untuk low-vision',
  },
  // Tema tambahan (permintaan user: "tambahkan banyak tema nya ya, bebas tema
  // gimna pun"). Semua token ditulis LENGKAP di themes-extra.css — token yang
  // tidak ditulis akan jatuh ke tema lain dan bikin warna campur.
  { id: 'dracula', label: 'Dracula', kind: 'dark', hint: 'ungu-merah, klasik' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', kind: 'dark', hint: 'pastel lembut, populer' },
  { id: 'rose-pine', label: 'Rosé Pine', kind: 'dark', hint: 'mawar tua, tenang' },
  { id: 'kanagawa', label: 'Kanagawa', kind: 'dark', hint: 'sumi-e, gelap kehijauan' },
  { id: 'everforest-dark', label: 'Everforest', kind: 'dark', hint: 'hijau hutan, mata nyaman' },
  { id: 'github-dark', label: 'GitHub Dark', kind: 'dark', hint: 'ala GitHub, netral' },
  { id: 'ayu-mirage', label: 'Ayu Mirage', kind: 'dark', hint: 'biru malam, aksen jingga' },
  { id: 'solarized-light', label: 'Solarized Light', kind: 'light', hint: 'krem hangat, terang' },
  { id: 'nord-light', label: 'Nord Light', kind: 'light', hint: 'biru dingin, terang' },
  { id: 'min-light', label: 'Min Light', kind: 'light', hint: 'putih bersih minimalis' },
];

export const isKnownTheme = (id: string) =>
  THEMES.some((t) => t.id === id) || temaEkstensiTerdaftar(id);

/**
 * Tema dari ekstensi (fase 19). Disuntik `extLoader` supaya `themes.ts` tidak
 * perlu import extLoader (yang mengimport commands.ts → lingkaran).
 * Bentuk sama seperti THEMES; token warnanya diterapkan oleh callback.
 */
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

/** Semua tema yang bisa dipilih user: bawaan + dari ekstensi aktif. */
export const semuaTema = (): ThemeInfo[] => [...THEMES, ...temaEkstensi];

const infoTema = (id: string): ThemeInfo | undefined =>
  THEMES.find((t) => t.id === id) ?? temaEkstensi.find((t) => t.id === id);

/** Preferensi OS — dipakai bila general.theme === 'system'. */
export function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

/**
 * Pantau perubahan tema Windows (V2 fase 13). Dipanggil sekali dari App.tsx;
 * callback hanya dipicu saat mode efektif = 'system', supaya user yang
 * memilih tema spesifik tidak ikut tertimpa OS.
 */
export function watchSystemTheme(onChange: (dark: boolean) => void): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => {};
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/**
 * Tema efektif dari settings.
 * `general.theme` (dark/light/system) menentukan MODE, `theme.current`
 * menentukan tema spesifik. Kalau keduanya bertentangan (mis. mode light
 * tapi tema nord), MODE yang menang supaya pilihan pill General tidak
 * terasa diabaikan.
 */
export function resolveTheme(general: { theme: string }, theme: { current: string }): string {
  const wanted = isKnownTheme(theme.current) ? theme.current : 'zephyr-dark';
  const info = infoTema(wanted) ?? THEMES[0];

  const mode = general.theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : general.theme;
  if (mode === 'light' && info.kind !== 'light') return 'zephyr-light';
  if (mode === 'dark' && info.kind === 'light') return 'zephyr-dark';
  return wanted;
}

/** Terapkan tema + aksen ke <html>. Mengembalikan id tema yang dipakai. */
export function applyTheme(
  general: { theme: string; zoom?: number },
  theme: { current: string; accent?: string },
  /** Background TERPISAH dari tema (permintaan user: jangan satu combo). */
  background?: { image?: string; opacity?: number; size?: 'fill' | 'fit' | 'center'; transparan?: boolean },
): string {
  const id = resolveTheme(general, theme);
  const root = document.documentElement;

  // Latar belakang kustom — parameter sendiri, BUKAN bagian dari `theme`.
  // Dipisah supaya mengganti tema tidak menyentuh background (dan sebaliknya).
  // `--bg-opacity` dipakai sebagai kekuatan gambar, bukan opacity UI — kalau
  // seluruh UI dibuat transparan, teks jadi sulit dibaca.
  const bg = background?.image ?? '';
  if (bg) {
    // Buang karakter yang bisa memutus url("...") — path Windows aman karena
    // hanya huruf, angka, :, /, \\, dan . yang dipakai.
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

  // Aksen kustom: hapus dulu supaya kembali ke nilai tema saat dikosongkan.
  // WAJIB sebelum token ekstensi diterapkan — dulu urutannya kebalik, jadi
  // `removeProperty('--accent')` menghapus --accent yang baru saja dipasang
  // tema ekstensi (V3: --bg0 berubah tapi --accent tidak).
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-hover');
  root.style.removeProperty('--accent-subtle');

  // Tema ekstensi (fase 19): token warnanya CSS variable inline, dan
  // `data-theme` dipasang ke basis gelap/terang supaya token yang TIDAK
  // disebut ekstensi tetap punya nilai — kalau tidak, tema yang cuma
  // mendefinisikan 5 warna membuat sisa UI kehilangan warna sama sekali.
  const dariEkstensi = temaEkstensiTerdaftar(id);
  if (dariEkstensi) {
    const kind = infoTema(id)?.kind === 'light' ? 'zephyr-light' : 'zephyr-dark';
    root.dataset.theme = kind;
    root.dataset.extTheme = id;
    terapkanEkstensi?.(id);
  } else {
    root.dataset.theme = id;
    delete root.dataset.extTheme;
    // Bersihkan token milik tema ekstensi sebelumnya.
    terapkanEkstensi?.('');
  }

  // Aksen pilihan USER menang di atas tema (termasuk tema ekstensi).
  if (theme.accent && /^#[0-9a-f]{6}$/i.test(theme.accent)) {
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-hover', theme.accent);
    root.style.setProperty('--accent-subtle', hexToRgba(theme.accent, 0.16));
  }

  // Zoom: skala font root (Ctrl+= / Ctrl+- / Ctrl+0 di App.tsx).
  const zoom = typeof general.zoom === 'number' ? general.zoom : 100;
  root.style.fontSize = `${Math.round((Math.max(50, Math.min(200, zoom)) / 100) * 16)}px`;

  return id;
}

/**
 * Samakan title bar bawaan Windows dengan tema aktif.
 *
 * Tanpa ini, band atas tetap abu sistem (`#232323`) sementara baris menu tepat
 * di bawahnya memakai `--titlebar-bg` — dua warna bertumpuk yang terlihat tidak
 * nyatu. Warnanya dibaca dari CSS yang sudah dihitung, jadi tema bawaan, tema
 * ekstensi, tema VS Code, dan aksen user ikut otomatis.
 */

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
