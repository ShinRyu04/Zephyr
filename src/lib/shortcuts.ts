// shortcuts.ts — katalog action + keybinding (fase 08).
//
// Sumber kebenaran satu tempat: handler global di App.tsx MEMBACA katalog ini
// (bukan daftar if/else hardcoded), sehingga shortcut yang diubah user di
// Settings langsung berlaku tanpa restart.
//
// Format binding: token dipisah '+', modifier lebih dulu.
//   "Ctrl+S", "Ctrl+Shift+F", "Ctrl+`", "Ctrl+=", "Alt+Z"
// Normalisasi memastikan "ctrl+shift+f" == "Ctrl+Shift+F".

export interface ActionDef {
  id: string;
  /** label ditampilkan di tabel Shortcuts */
  label: string;
  /** kelompok untuk pengurutan tabel */
  group: 'File' | 'Edit' | 'View' | 'Terminal' | 'AI' | 'Git';
  default: string;
}

/** Katalog action. Fase 09 (AI) & 10 (Git) sudah didaftarkan sejak sekarang
 *  dengan default masing-masing, sesuai instruksi fase 08. */
export const ACTIONS: ActionDef[] = [
  { id: 'file.new', label: 'File baru', group: 'File', default: 'Ctrl+N' },
  { id: 'file.open', label: 'Buka file', group: 'File', default: 'Ctrl+O' },
  { id: 'file.openFolder', label: 'Buka folder', group: 'File', default: 'Ctrl+Shift+O' },
  { id: 'file.save', label: 'Simpan', group: 'File', default: 'Ctrl+S' },
  { id: 'file.saveAs', label: 'Simpan sebagai', group: 'File', default: 'Ctrl+Shift+S' },
  { id: 'file.closeTab', label: 'Tutup tab', group: 'File', default: 'Ctrl+W' },

  { id: 'edit.find', label: 'Cari di file', group: 'Edit', default: 'Ctrl+F' },
  { id: 'edit.findInFiles', label: 'Cari di workspace', group: 'Edit', default: 'Ctrl+Shift+F' },

  { id: 'view.sidebar', label: 'Toggle sidebar', group: 'View', default: 'Ctrl+B' },
  { id: 'view.panel', label: 'Toggle panel bawah', group: 'View', default: 'Ctrl+J' },
  { id: 'view.explorer', label: 'Buka Explorer', group: 'View', default: 'Ctrl+Shift+E' },
  { id: 'view.palette', label: 'Command Palette', group: 'View', default: 'Ctrl+Shift+P' },
  { id: 'view.quickOpen', label: 'Quick Open file', group: 'View', default: 'Ctrl+P' },
  { id: 'view.nextTab', label: 'Tab editor berikutnya', group: 'View', default: 'Ctrl+Tab' },
  { id: 'view.prevTab', label: 'Tab editor sebelumnya', group: 'View', default: 'Ctrl+Shift+Tab' },
  { id: 'view.settings', label: 'Buka Settings', group: 'View', default: 'Ctrl+,' },
  { id: 'view.zoomIn', label: 'Zoom in', group: 'View', default: 'Ctrl+=' },
  { id: 'view.zoomOut', label: 'Zoom out', group: 'View', default: 'Ctrl+-' },
  { id: 'view.zoomReset', label: 'Zoom reset', group: 'View', default: 'Ctrl+0' },

  { id: 'terminal.toggle', label: 'Toggle panel terminal', group: 'Terminal', default: 'Ctrl+`' },
  { id: 'terminal.new', label: 'Pane terminal baru', group: 'Terminal', default: 'Ctrl+Shift+T' },
  { id: 'terminal.newPane', label: 'Pane terminal baru (alt)', group: 'Terminal', default: 'Ctrl+Shift+`' },

  // Dipakai mulai fase 09 / 10 — didaftarkan sekarang supaya tabelnya lengkap
  // dan user bisa me-remap lebih awal.
  { id: 'ai.panel', label: 'Toggle panel AI', group: 'AI', default: 'Ctrl+Shift+A' },
  { id: 'ai.send', label: 'Kirim prompt AI', group: 'AI', default: 'Ctrl+Enter' },
  { id: 'git.panel', label: 'Buka Source Control', group: 'Git', default: 'Ctrl+Shift+G' },
];

export const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

/** Urutan modifier baku supaya perbandingan string konsisten. */
function normalizeToken(tok: string): string {
  const t = tok.trim();
  const low = t.toLowerCase();
  if (low === 'control') return 'Ctrl';
  if (low === 'ctrl') return 'Ctrl';
  if (low === 'shift') return 'Shift';
  if (low === 'alt') return 'Alt';
  if (low === 'meta' || low === 'win' || low === 'cmd') return 'Meta';
  if (low === 'escape') return 'Escape';
  if (low === 'enter' || low === 'return') return 'Enter';
  if (low === 'space' || low === ' ') return 'Space';
  if (low === 'arrowup') return 'Up';
  if (low === 'arrowdown') return 'Down';
  if (low === 'arrowleft') return 'Left';
  if (low === 'arrowright') return 'Right';
  // huruf tunggal -> kapital; simbol dibiarkan
  return t.length === 1 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1);
}

export function normalizeBinding(binding: string): string {
  const parts = binding.split('+').map(normalizeToken).filter(Boolean);
  const mods = ['Ctrl', 'Shift', 'Alt', 'Meta'].filter((m) => parts.includes(m));
  const keys = parts.filter((p) => !['Ctrl', 'Shift', 'Alt', 'Meta'].includes(p));
  return [...mods, ...keys].join('+');
}

/** Ubah KeyboardEvent jadi binding string. null = hanya modifier ditekan. */
export function eventToBinding(e: KeyboardEvent): string | null {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta', 'Dead'].includes(k)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  parts.push(normalizeToken(k));
  return normalizeBinding(parts.join('+'));
}

/** Binding efektif: custom user menang atas default. */
export function effectiveBinding(actionId: string, custom: Record<string, string>): string {
  const c = custom[actionId];
  if (c && c.trim()) return normalizeBinding(c);
  return normalizeBinding(ACTION_BY_ID.get(actionId)?.default ?? '');
}

/** Peta binding -> actionId untuk seluruh action (dipakai handler global). */
export function bindingMap(custom: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of ACTIONS) {
    const b = effectiveBinding(a.id, custom);
    if (b) m.set(b, a.id);
  }
  return m;
}

/**
 * Action lain yang memakai binding sama. Dipakai untuk memvalidasi konflik
 * SEBELUM disimpan — mengembalikan daftar actionId yang bertabrakan.
 */
export function findConflicts(
  actionId: string,
  binding: string,
  custom: Record<string, string>,
): string[] {
  const target = normalizeBinding(binding);
  if (!target) return [];
  return ACTIONS.filter((a) => a.id !== actionId && effectiveBinding(a.id, custom) === target).map(
    (a) => a.id,
  );
}

/** Tampilan ramah untuk tabel (mis. "Ctrl+`" tetap apa adanya). */
export function displayBinding(binding: string): string {
  return binding || '—';
}
