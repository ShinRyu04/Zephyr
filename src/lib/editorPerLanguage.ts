import type { EditorSettings, Settings } from './types';
import { bahasaDariPath } from './rulesEngine';

/**
 * Gabungkan setelan editor global dengan override untuk bahasa berkas ini.
 *
 * Berlaku hanya pada field yang MEMANG berbeda per bahasa di dunia nyata
 * (indentasi, bungkus baris, minimap). Field lain sengaja tidak di-override:
 * mengizinkannya per bahasa akan membuat "kenapa font saya berubah di .py"
 * menjadi pertanyaan yang tidak bisa dijawab dari satu layar.
 *
 * Bahasa ditentukan dari PATH, dan kunci peta boleh berupa nama bahasa
 * (`typescript`) maupun ekstensi (`ts`): orang menulis keduanya, dan menolak
 * salah satunya hanya membuat setelan yang terlihat benar tidak berefek.
 */
export function editorUntukBerkas(
  path: string | null | undefined,
  editor: EditorSettings,
  perLanguage: Settings['perLanguage'],
): EditorSettings {
  if (!path || !perLanguage) return editor;

  const bahasa = bahasaDariPath(path);
  const ekstensi = (() => {
    const nama = path.replace(/\\/g, '/').split('/').pop() ?? '';
    const titik = nama.lastIndexOf('.');
    return titik >= 0 ? nama.slice(titik + 1).toLowerCase() : '';
  })();

  const o = perLanguage[bahasa] ?? (ekstensi ? perLanguage[ekstensi] : undefined);
  if (!o) return editor;

  return {
    ...editor,
    ...(typeof o.tabSize === 'number' && o.tabSize >= 1 && o.tabSize <= 16
      ? { tabSize: Math.round(o.tabSize) }
      : {}),
    ...(typeof o.insertSpaces === 'boolean' ? { insertSpaces: o.insertSpaces } : {}),
    ...(typeof o.wordWrap === 'boolean' ? { wordWrap: o.wordWrap } : {}),
    ...(typeof o.minimap === 'boolean' ? { minimap: o.minimap } : {}),
  };
}

/** Bahasa yang masuk akal ditawarkan di UI, dengan label yang bisa dibaca. */
export const BAHASA_OVERRIDE: { id: string; label: string }[] = [
  { id: 'typescript', label: 'TypeScript / TSX' },
  { id: 'javascript', label: 'JavaScript / JSX' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS / SCSS' },
  { id: 'shell', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
];
