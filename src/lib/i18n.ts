// i18n.ts — dua bahasa UI (id/en) untuk LABEL KUNCI saja.
//
// Sengaja BUKAN i18n penuh (prompt fase 08: "JANGAN lakukan i18n penuh —
// cukup toggle 2 bahasa"). Yang diterjemahkan: navigasi Settings, judul
// section, dan label kontrol utama. Teks penjelasan panjang tetap Indonesia.
//
// Pemakaian:  const t = useT();  <h2>{t('settings.general')}</h2>
// Kunci yang tidak ada di dict akan dikembalikan apa adanya, jadi menambah
// teks baru tidak pernah membuat UI kosong.

import { useStore } from './store';

type Dict = Record<string, string>;

const ID: Dict = {
  'nav.explorer': 'Explorer',
  'nav.search': 'Pencarian',
  'nav.scm': 'Source Control',
  'nav.ai': 'AI / MCP',
  'nav.terminal': 'Terminal',
  'nav.settings': 'Pengaturan',

  'settings.title': 'Pengaturan',
  'settings.general': 'Umum',
  'settings.editor': 'Editor Kode',
  'settings.theme': 'Tema',
  'settings.shortcuts': 'Shortcut',
  'settings.models': 'Model AI',
  'settings.agents': 'Agents',
  'settings.extensions': 'Ekstensi',
  'settings.lsp': 'Language Server',
  'settings.scm': 'Source Control',
  'settings.mcp': 'MCP',
  'settings.security': 'Keamanan',
  'settings.accessibility': 'Aksesibilitas',
  'settings.ssh': 'SSH',
  'settings.about': 'Tentang',
  'settings.resetAll': 'Reset Semua ke Default',

  'general.theme': 'Tema',
  'general.font': 'Font',
  'general.fontSize': 'Ukuran font',
  'general.lineHeight': 'Tinggi baris',
  'general.uiLang': 'Bahasa antarmuka',
  'general.zoom': 'Zoom',
  'general.restoreSession': 'Pulihkan sesi saat dibuka',
  'general.checkUpdates': 'Cek pembaruan otomatis',
  'general.openDataFolder': 'Buka folder data',

  'editor.tabSize': 'Ukuran tab',
  'editor.insertSpaces': 'Pakai spasi, bukan tab',
  'editor.wordWrap': 'Bungkus baris panjang',
  'editor.minimap': 'Minimap',
  'editor.cursorStyle': 'Bentuk kursor',
  'editor.smoothScroll': 'Scroll halus',
  'editor.snippetSuggestions': 'Saran snippet',
  'editor.formatOnSave': 'Format saat simpan',
  'editor.showWhitespace': 'Tampilkan whitespace',
  'editor.breadcrumbs': 'Breadcrumbs',
  'editor.stickyScroll': 'Sticky scroll',
  'editor.stickyScrollMaxLines': 'Baris sticky maksimum',
  'editor.minimapRenderCharacters': 'Minimap gambar karakter',
  'editor.indentGuides': 'Garis indentasi',
  'editor.colorDecorators': 'Swatch warna',
  'editor.unicodeHighlight': 'Sorot unicode ambigu',
  'editor.bracketPairColorization': 'Warna pasangan bracket',

  'models.apiKey': 'API Key',
  'models.baseUrl': 'Base URL',
  'models.model': 'Model',
  'models.test': 'Test connection',
  'models.active': 'Provider aktif',
  'models.saved': 'Key tersimpan',
  'models.noKey': 'Belum ada key',
  'models.answerLang': 'Bahasa jawaban AI',
  'models.answerLangHint': 'Instruksi bahasa dikirim ke model di tiap percakapan',
  'models.answerFollow': 'Ikuti pertanyaan (otomatis)',
  'models.answerCustom': 'Lainnya (tulis nama bahasa)',
  'models.answerCustomPlaceholder': 'mis. Jawa, Español, Français…',

  'agents.maxPanes': 'Maksimal pane per tab',
  'agents.startCommand': 'Start command',
  'agents.attachActiveFile': 'Kirim file aktif ke agent',
  'agents.rescan': 'Scan ulang',
  'agents.none': 'Tidak ada CLI agent terdeteksi',

  'scm.userName': 'Nama',
  'scm.userEmail': 'Email',
  'scm.defaultBranch': 'Branch default',
  'scm.pullBeforePush': 'Pull sebelum push',

  'mcp.enable': 'Aktifkan MCP port 9222',
  'mcp.status': 'Status',
  'mcp.port': 'Port',
  'mcp.token': 'Token',
  'mcp.writeToCli': 'Tulis ke config CLI',

  'common.save': 'Simpan',
  'common.cancel': 'Batal',
  'common.reset': 'Reset',
  'common.default': 'Default',
  'common.custom': 'Kustom',
  'common.enabled': 'Aktif',
  'common.disabled': 'Nonaktif',
  'common.copy': 'Salin',
  'common.show': 'Tampilkan',
  'common.hide': 'Sembunyikan',
  'common.running': 'Berjalan',
  'common.stopped': 'Berhenti',
};

const EN: Dict = {
  'nav.explorer': 'Explorer',
  'nav.search': 'Search',
  'nav.scm': 'Source Control',
  'nav.ai': 'AI / MCP',
  'nav.terminal': 'Terminal',
  'nav.settings': 'Settings',

  'settings.title': 'Settings',
  'settings.general': 'General',
  'settings.editor': 'Code Editor',
  'settings.theme': 'Theme',
  'settings.shortcuts': 'Shortcuts',
  'settings.models': 'AI Models',
  'settings.agents': 'Agents',
  'settings.extensions': 'Extensions',
  'settings.lsp': 'Language Servers',
  'settings.scm': 'Source Control',
  'settings.mcp': 'MCP',
  'settings.security': 'Security',
  'settings.accessibility': 'Accessibility',
  'settings.ssh': 'SSH',
  'settings.about': 'About',
  'settings.resetAll': 'Reset All to Default',

  'general.theme': 'Theme',
  'general.font': 'Font',
  'general.fontSize': 'Font size',
  'general.lineHeight': 'Line height',
  'general.uiLang': 'UI language',
  'general.zoom': 'Zoom',
  'general.restoreSession': 'Restore session on start',
  'general.checkUpdates': 'Check for updates automatically',
  'general.openDataFolder': 'Open data folder',

  'editor.tabSize': 'Tab size',
  'editor.insertSpaces': 'Insert spaces instead of tabs',
  'editor.wordWrap': 'Word wrap',
  'editor.minimap': 'Minimap',
  'editor.cursorStyle': 'Cursor style',
  'editor.smoothScroll': 'Smooth scrolling',
  'editor.snippetSuggestions': 'Snippet suggestions',
  'editor.formatOnSave': 'Format on save',
  'editor.showWhitespace': 'Show whitespace',
  'editor.breadcrumbs': 'Breadcrumbs',
  'editor.stickyScroll': 'Sticky scroll',
  'editor.stickyScrollMaxLines': 'Sticky scroll max lines',
  'editor.minimapRenderCharacters': 'Minimap render characters',
  'editor.indentGuides': 'Indent guides',
  'editor.colorDecorators': 'Color decorators',
  'editor.unicodeHighlight': 'Highlight ambiguous unicode',
  'editor.bracketPairColorization': 'Bracket pair colorization',

  'models.apiKey': 'API Key',
  'models.baseUrl': 'Base URL',
  'models.model': 'Model',
  'models.test': 'Test connection',
  'models.active': 'Active provider',
  'models.saved': 'Key saved',
  'models.noKey': 'No key yet',
  'models.answerLang': 'AI answer language',
  'models.answerLangHint': 'Language instruction is sent to the model on every conversation',
  'models.answerFollow': 'Follow the question (auto)',
  'models.answerCustom': 'Other (type a language name)',
  'models.answerCustomPlaceholder': 'e.g. Javanese, Español, Français…',

  'agents.maxPanes': 'Max panes per tab',
  'agents.startCommand': 'Start command',
  'agents.attachActiveFile': 'Send active file to agent',
  'agents.rescan': 'Rescan',
  'agents.none': 'No agent CLI detected',

  'scm.userName': 'Name',
  'scm.userEmail': 'Email',
  'scm.defaultBranch': 'Default branch',
  'scm.pullBeforePush': 'Pull before push',

  'mcp.enable': 'Enable MCP on port 9222',
  'mcp.status': 'Status',
  'mcp.port': 'Port',
  'mcp.token': 'Token',
  'mcp.writeToCli': 'Write to CLI config',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.reset': 'Reset',
  'common.default': 'Default',
  'common.custom': 'Custom',
  'common.enabled': 'Enabled',
  'common.disabled': 'Disabled',
  'common.copy': 'Copy',
  'common.show': 'Show',
  'common.hide': 'Hide',
  'common.running': 'Running',
  'common.stopped': 'Stopped',
};

const DICTS: Record<string, Dict> = { id: ID, en: EN };

/** Terjemah tanpa hook (untuk kode di luar komponen). */
export function translate(lang: string, key: string): string {
  return DICTS[lang]?.[key] ?? DICTS.id[key] ?? key;
}

/** Hook: ikut berubah saat settings.general.uiLang diganti. */
export function useT(): (key: string) => string {
  const lang = useStore((s) => s.settings.general.uiLang);
  return (key: string) => translate(lang, key);
}
