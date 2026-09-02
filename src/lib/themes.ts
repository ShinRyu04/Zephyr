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
];

export const isKnownTheme = (id: string) => THEMES.some((t) => t.id === id);

/** Preferensi OS — dipakai bila general.theme === 'system'. */
export function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
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
  const info = THEMES.find((t) => t.id === wanted)!;

  const mode = general.theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : general.theme;
  if (mode === 'light' && info.kind !== 'light') return 'zephyr-light';
  if (mode === 'dark' && info.kind === 'light') return 'zephyr-dark';
  return wanted;
}

/** Terapkan tema + aksen ke <html>. Mengembalikan id tema yang dipakai. */
export function applyTheme(
  general: { theme: string; zoom?: number },
  theme: { current: string; accent?: string },
): string {
  const id = resolveTheme(general, theme);
  const root = document.documentElement;
  root.dataset.theme = id;

  // Aksen kustom: hapus dulu supaya kembali ke nilai tema saat dikosongkan.
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-hover');
  root.style.removeProperty('--accent-subtle');
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

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
