// FileIcon.tsx — ikon jenis file inline SVG (tanpa library ikon berat).
// Warna dari token tema; huruf inisial dipakai untuk membedakan bahasa.

import type { LangId } from '../../lib/types';
import { adaIconTheme, ikonUntukExt } from '../../lib/extLoader';

const COLOR: Partial<Record<LangId, string>> = {
  typescript: 'var(--syn-number)',
  tsx: 'var(--syn-number)',
  javascript: 'var(--warning)',
  jsx: 'var(--warning)',
  json: 'var(--warning)',
  html: 'var(--syn-variable)',
  css: 'var(--accent)',
  markdown: 'var(--text-secondary)',
  python: 'var(--syn-type)',
  rust: 'var(--syn-variable)',
  go: 'var(--syn-number)',
  sql: 'var(--syn-function)',
  yaml: 'var(--danger)',
  toml: 'var(--syn-variable)',
  xml: 'var(--syn-tag)',
  java: 'var(--danger)',
  cpp: 'var(--accent)',
  c: 'var(--accent)',
  shell: 'var(--success)',
  ini: 'var(--text-secondary)',
  plain: 'var(--text-muted)',
};

const GLYPH: Partial<Record<LangId, string>> = {
  typescript: 'TS',
  tsx: 'TS',
  javascript: 'JS',
  jsx: 'JS',
  json: '{}',
  html: '<>',
  css: '#',
  markdown: 'M',
  python: 'PY',
  rust: 'RS',
  go: 'GO',
  sql: 'SQ',
  yaml: 'Y',
  toml: 'T',
  xml: 'X',
  java: 'J',
  cpp: 'C+',
  c: 'C',
  shell: '>_',
  ini: '=',
  plain: '·',
};

export default function FileIcon({
  lang,
  size = 14,
  name,
}: {
  lang: LangId;
  size?: number;
  /** nama file — dipakai icon theme dari ekstensi (fase 19) */
  name?: string;
}) {
  // Icon theme ekstensi MENIMPA glyph/warna bawaan kalau ada entri untuk
  // ekstensi file ini (aturan 19.5: ekstensi menambah/menimpa tampilan, dan
  // icon theme memang gunanya begitu). Tanpa nama file, pakai bawaan.
  const dariExt = (() => {
    if (!name || !adaIconTheme()) return null;
    const dot = name.lastIndexOf('.');
    if (dot < 0) return null;
    return ikonUntukExt(name.slice(dot + 1));
  })();

  const color = dariExt?.color ?? COLOR[lang] ?? 'var(--text-muted)';
  const glyph = dariExt?.glyph ?? GLYPH[lang] ?? '·';
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      role="img"
      aria-label={lang}
      data-ext-icon={dariExt ? '1' : '0'}
      style={{ flexShrink: 0 }}
    >
      <rect x="1.5" y="1" width="13" height="14" rx="2" fill="none" stroke={color} strokeWidth="1.2" opacity="0.7" />
      <text
        x="8"
        y="11.4"
        textAnchor="middle"
        fill={color}
        style={{ font: `bold ${glyph.length > 1 ? 6.4 : 8}px var(--font-mono)` }}
      >
        {glyph}
      </text>
    </svg>
  );
}
