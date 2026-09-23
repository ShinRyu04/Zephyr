type Warna = Record<string, unknown>;

export function parseWarna(v: unknown): [number, number, number, number] | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b, 1];
  }
  m = s.match(/^#([0-9a-f]{4})$/);
  if (m) {
    const [r, g, b, a] = m[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b, a / 255];
  }
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = s.match(/^#([0-9a-f]{8})$/);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, (n & 255) / 255];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const bag = m[1].split(/[,\s/]+/).filter((x) => x !== '');
    const angka = bag.map((x) => (x.endsWith('%') ? (parseFloat(x) / 100) * 255 : parseFloat(x)));
    if (angka.length < 3 || angka.some((x) => Number.isNaN(x))) return null;
    return [angka[0], angka[1], angka[2], angka.length > 3 ? angka[3] : 1];
  }
  return null;
}

export function keCss(c: [number, number, number, number]): string {
  const [r, g, b, a] = c;
  const ri = Math.round(r);
  const gi = Math.round(g);
  const bi = Math.round(b);
  if (a >= 1) return `rgb(${ri}, ${gi}, ${bi})`;
  const aa = Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000;
  return `rgba(${ri}, ${gi}, ${bi}, ${aa})`;
}

export function mix(a: [number, number, number, number], b: [number, number, number, number], t: number): [number, number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
}

const HITAM: [number, number, number, number] = [0, 0, 0, 1];
const PUTIH: [number, number, number, number] = [255, 255, 255, 1];

export function lebihTerang(c: [number, number, number, number], t = 0.1): [number, number, number, number] {
  return mix(c, PUTIH, t);
}
export function lebihGelap(c: [number, number, number, number], t = 0.1): [number, number, number, number] {
  return mix(c, HITAM, t);
}

export function luminance(c: [number, number, number, number]): number {
  const lin = (x: number) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

function ambil(colors: Warna, kunci: string[]): [number, number, number, number] | null {
  for (const k of kunci) {
    if (k in colors) {
      const p = parseWarna(colors[k]);
      if (p) return p;
    }
  }
  return null;
}

const FALLBACK: Record<string, [number, number, number, number]> = {
  bg: parseWarna('#0d1117') as [number, number, number, number],
  text: parseWarna('#e6edf3') as [number, number, number, number],
  accent: parseWarna('#3884ff') as [number, number, number, number],
  danger: parseWarna('#f85149') as [number, number, number, number],
  warning: parseWarna('#d29922') as [number, number, number, number],
  success: parseWarna('#3fb950') as [number, number, number, number],
};

export function petakanTemaVscode(colors: Warna): Record<string, string> {
  const out: Record<string, string> = {};

  const set = (tok: string, c: [number, number, number, number] | null) => {
    if (c) out[tok] = keCss(c);
  };

  const bg = ambil(colors, ['editor.background', 'panel.background', 'sideBar.background']);
  const text = ambil(colors, ['editor.foreground', 'foreground', 'sideBar.foreground']);
  set('bg', bg);
  set('text', text);
  if (bg && text) {
    
    out['text-inverse'] = keCss(luminance(bg) > 0.5 ? HITAM : PUTIH);
  }

  const surface = ambil(colors, ['sideBar.background', 'panel.background']) ?? (bg ? lebihTerang(bg, 0.03) : null);
  set('surface', surface);
  const surface2 = ambil(colors, ['activityBar.background', 'panel.background']) ?? (surface ? lebihTerang(surface, 0.04) : null);
  set('surface2', surface2);
  const surface3 = ambil(colors, ['input.background', 'dropdown.background', 'editorWidget.background']) ?? (surface2 ? lebihTerang(surface2, 0.05) : null);
  set('surface3', surface3);

  const border = ambil(colors, ['panel.border', 'editorWidget.border', 'contrastBorder', 'sideBar.border']) ?? (bg ? mix(bg, text ?? PUTIH, 0.14) : null);
  set('border', border);
  set('border-strong', border ? mix(border, text ?? PUTIH, 0.25) : null);

  let sec: [number, number, number, number] | null = ambil(colors, ['descriptionForeground', 'sideBar.foreground']);
  if (!sec && text && bg) sec = mix(text, bg, 0.35);
  set('text-secondary', sec);
  let muted: [number, number, number, number] | null = null;
  if (text && bg) muted = mix(text, bg, 0.55);
  else if (sec && bg) muted = mix(sec, bg, 0.3);
  set('text-muted', muted);

  const accent = ambil(colors, ['focusBorder', 'button.background', 'statusBarItem.remoteBackground', 'activityBarBadge.background']) ?? FALLBACK.accent;
  set('accent', accent);
  if (accent) {
    set('accent-hover', lebihTerang(accent, 0.12));
    set('accent-subtle', [accent[0], accent[1], accent[2], 0.16]);
  }

  set('danger', ambil(colors, ['editorError.foreground', 'inputValidation.errorForeground', 'editorOverviewRuler.errorForeground']) ?? FALLBACK.danger);
  set('warning', ambil(colors, ['editorWarning.foreground', 'inputValidation.warningForeground']) ?? FALLBACK.warning);
  set('success', ambil(colors, ['gitDecoration.addedResourceForeground', 'editorGutter.addedBackground']) ?? FALLBACK.success);
  set('added', ambil(colors, ['gitDecoration.addedResourceForeground', 'editorGutter.addedBackground']) ?? FALLBACK.success);
  set('deleted', ambil(colors, ['gitDecoration.deletedResourceForeground', 'editorGutter.deletedBackground']) ?? ambil(colors, ['editorError.foreground']) ?? FALLBACK.danger);
  set('modified', ambil(colors, ['gitDecoration.modifiedResourceForeground', 'editorGutter.modifiedBackground']) ?? FALLBACK.warning);

  set('editor-bg', bg);
  set('editor-gutter', ambil(colors, ['editorLineNumber.foreground']) ?? (text && bg ? mix(text, bg, 0.5) : null));
  set('editor-active-line', ambil(colors, ['editor.lineHighlightBackground']) ?? (bg ? [bg[0], bg[1], bg[2], 0.035] : null));
  set('editor-selection', ambil(colors, ['editor.selectionBackground']) ?? (accent ? [accent[0], accent[1], accent[2], 0.3] : null));
  set('editor-cursor', ambil(colors, ['editorCursor.foreground']) ?? text);
  set('editor-match', ambil(colors, ['editor.findMatchHighlightBackground']) ?? (accent ? [accent[0], accent[1], accent[2], 0.35] : null));

  set('titlebar-bg', ambil(colors, ['titleBar.activeBackground', 'editorGroupHeader.noTabsBackground']) ?? surface);
  set('titlebar-fg', ambil(colors, ['titleBar.activeForeground']) ?? text);
  set('statusbar-bg', ambil(colors, ['statusBar.background']) ?? surface2);
  set('statusbar-fg', ambil(colors, ['statusBar.foreground']) ?? text);
  set('activitybar-bg', ambil(colors, ['activityBar.background']) ?? surface2);
  set('activitybar-fg', ambil(colors, ['activityBar.foreground']) ?? text);
  set('input-bg', ambil(colors, ['input.background', 'dropdown.background']) ?? surface3);
  set('input-fg', ambil(colors, ['input.foreground']) ?? text);
  set('button-bg', ambil(colors, ['button.background']) ?? accent);
  set('button-fg', ambil(colors, ['button.foreground']) ?? (accent && luminance(accent) > 0.5 ? HITAM : PUTIH));
  set('hover-bg', ambil(colors, ['list.hoverBackground']) ?? (surface ? lebihTerang(surface, 0.05) : null));
  set('list-active', ambil(colors, ['list.activeSelectionBackground']) ?? (accent ? [accent[0], accent[1], accent[2], 0.2] : null));
  set('scrollbar-bg', ambil(colors, ['scrollbarSlider.background']) ?? (text && bg ? [text[0], text[1], text[2], 0.2] : null));
  set('widget-bg', ambil(colors, ['editorWidget.background', 'menu.background']) ?? surface3);
  set('widget-border', ambil(colors, ['editorWidget.border', 'menu.border']) ?? border);
  set('terminal-bg', ambil(colors, ['terminal.background', 'panel.background']) ?? bg);
  set('terminal-fg', ambil(colors, ['terminal.foreground']) ?? text);
  set('badge-bg', ambil(colors, ['activityBarBadge.background', 'badge.background']) ?? accent);
  set('badge-fg', ambil(colors, ['activityBarBadge.foreground', 'badge.foreground']) ?? (accent && luminance(accent) > 0.5 ? HITAM : PUTIH));
  set('link-fg', ambil(colors, ['textLink.foreground']) ?? accent);
  set('err-fg', ambil(colors, ['editorError.foreground']) ?? FALLBACK.danger);
  set('warn-fg', ambil(colors, ['editorWarning.foreground']) ?? FALLBACK.warning);
  set('minimap-bg', ambil(colors, ['minimap.background']) ?? bg);

  return out;
}
