export interface ThemeInfo {
  id: string;
  label: string;
  kind: 'dark' | 'light';

  hint: string;
}

export const THEMES: ThemeInfo[] = [
  { id: 'zephyr-dark', label: 'Zephyr Dark', kind: 'dark', hint: 'default, high contrast' },
  { id: 'zephyr-light', label: 'Zephyr Light', kind: 'light', hint: 'light, for daytime' },
  { id: 'nord', label: 'Nord', kind: 'dark', hint: 'cool blue, soft' },
  { id: 'tokyo-night', label: 'Tokyo Night', kind: 'dark', hint: 'violet-blue, night' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', kind: 'dark', hint: 'warm, retro' },
  { id: 'one-dark', label: 'One Dark Pro', kind: 'dark', hint: 'Atom/VS Code style' },
  { id: 'senja', label: 'Senja', kind: 'dark', hint: 'warm dark, dusk-orange accents' },
  { id: 'zephyr-acrylic', label: 'Zephyr Dark Acrylic', kind: 'dark', hint: 'modern ADE, transparent and glassy' },

  {
    id: 'high-contrast',
    label: 'High Contrast',
    kind: 'dark',
    hint: 'AAA, for low vision',
  },

  { id: 'dracula', label: 'Dracula', kind: 'dark', hint: 'violet-red, classic' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', kind: 'dark', hint: 'soft pastel, popular' },
  { id: 'rose-pine', label: 'Rosé Pine', kind: 'dark', hint: 'deep rose, calm' },
  { id: 'kanagawa', label: 'Kanagawa', kind: 'dark', hint: 'sumi-e, dark green' },
  { id: 'everforest-dark', label: 'Everforest', kind: 'dark', hint: 'forest green, easy on the eyes' },
  { id: 'github-dark', label: 'GitHub Dark', kind: 'dark', hint: 'GitHub style, neutral' },
  { id: 'ayu-mirage', label: 'Ayu Mirage', kind: 'dark', hint: 'night blue, orange accents' },
  { id: 'solarized-light', label: 'Solarized Light', kind: 'light', hint: 'warm cream, light' },
  { id: 'nord-light', label: 'Nord Light', kind: 'light', hint: 'cool blue, light' },
  { id: 'min-light', label: 'Min Light', kind: 'light', hint: 'clean minimal white' },
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
