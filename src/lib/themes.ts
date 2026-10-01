export interface ThemeInfo {
  id: string;
  label: string;
  kind: 'dark' | 'light';

  hint: string;
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
  { id: 'github-dark', label: 'GitHub Dark', kind: 'dark', hint: 'theme.hint.githubDark' },
  { id: 'ayu-mirage', label: 'Ayu Mirage', kind: 'dark', hint: 'theme.hint.ayuMirage' },
  { id: 'solarized-light', label: 'Solarized Light', kind: 'light', hint: 'theme.hint.solarizedLight' },
  { id: 'nord-light', label: 'Nord Light', kind: 'light', hint: 'theme.hint.nordLight' },
  { id: 'min-light', label: 'Min Light', kind: 'light', hint: 'theme.hint.minLight' },
];

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

export const semuaTema = (): ThemeInfo[] => [...THEMES, ...temaEkstensi];

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

export function resolveTheme(general: { theme: string }, theme: { current: string }): string {
  const wanted = isKnownTheme(theme.current) ? theme.current : 'zephyr-dark';
  const info = infoTema(wanted) ?? THEMES[0];

  const mode = general.theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : general.theme;
  if (mode === 'light' && info.kind !== 'light') return 'zephyr-light';
  if (mode === 'dark' && info.kind === 'light') return 'zephyr-dark';
  return wanted;
}

export function applyTheme(
  general: { theme: string; zoom?: number },
  theme: { current: string; accent?: string },

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

  return id;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
