// editor-themes.ts — tema CodeMirror 6 per tema Zephyr (fase 13).
//
// Nilai warna TIDAK diduplikasi di sini: setiap properti memakai
// `var(--token)` sehingga CM ikut berubah begitu `[data-theme]` di <html>
// berganti — satu sumber warna, yaitu src/styles/*.css.
//
// Yang benar-benar per tema hanyalah flag `dark` CM6 (memengaruhi default
// internal CM seperti warna panel & scrollbar). Karena itu ada satu
// EditorView.theme per id tema, di-cache supaya reconfigure murah.

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import { THEMES } from '../lib/themes';

const v = (name: string) => `var(${name})`;

/** Spec tampilan editor — sama untuk semua tema (warnanya dari CSS var). */
function themeSpec(): Record<string, Record<string, string>> {
  return {
    '&': {
      backgroundColor: v('--editor-background'),
      color: v('--editor-foreground'),
      height: '100%',
    },
    '.cm-scroller': {
      fontFamily: v('--font-mono'),
      lineHeight: 'var(--editor-line-height, 1.5)',
      overflow: 'auto',
    },
    '.cm-content': { caretColor: v('--editor-cursor') },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('--editor-cursor') },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: v('--selection-bg'),
    },
    '.cm-activeLine': { backgroundColor: v('--line-active-bg') },
    '.cm-gutters': {
      backgroundColor: v('--gutter-bg'),
      color: v('--gutter-fg'),
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: v('--line-active'),
      color: v('--fg1'),
    },
    '.cm-selectionMatch': { backgroundColor: v('--editor-match') },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: v('--accent-subtle'),
      outline: `1px solid ${v('--accent')}`,
    },
    '.cm-nonmatchingBracket': { color: v('--danger') },
    '.cm-tooltip': {
      backgroundColor: v('--bg2'),
      border: `1px solid ${v('--border')}`,
      color: v('--fg0'),
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: v('--accent'),
      color: v('--accent-fg'),
    },
    '.cm-panels': { backgroundColor: v('--bg1'), color: v('--fg0') },
  };
}

/** Highlight syntax memakai token `--syntax-*` (nama kontrak fase 13). */
export const zephyrHighlight: Extension = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword], color: v('--syntax-keyword') },
    { tag: [t.string, t.special(t.string), t.regexp], color: v('--syntax-string') },
    { tag: [t.number, t.bool, t.null], color: v('--syntax-number') },
    {
      tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
      color: v('--syntax-comment'),
      fontStyle: 'italic',
    },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
      color: v('--syntax-fn'),
    },
    { tag: [t.variableName, t.propertyName], color: v('--syn-variable') },
    {
      tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)],
      color: v('--syntax-type'),
    },
    {
      tag: [t.operator, t.operatorKeyword, t.punctuation, t.separator],
      color: v('--syntax-operator'),
    },
    { tag: [t.tagName, t.angleBracket], color: v('--syn-tag') },
    { tag: [t.attributeName], color: v('--syn-attr') },
    { tag: [t.invalid], color: v('--syn-invalid') },
    { tag: [t.heading], color: v('--syntax-fn'), fontWeight: 'bold' },
    { tag: [t.link, t.url], color: v('--accent'), textDecoration: 'underline' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strong], fontWeight: 'bold' },
    { tag: [t.meta], color: v('--fg1') },
  ]),
);

const cache = new Map<string, Extension>();

/** Tema editor untuk satu id tema Zephyr (mis. 'nord'). */
export function editorTheme(themeId: string): Extension {
  const hit = cache.get(themeId);
  if (hit) return hit;
  const info = THEMES.find((x) => x.id === themeId);
  const ext = EditorView.theme(themeSpec(), { dark: (info?.kind ?? 'dark') === 'dark' });
  cache.set(themeId, ext);
  return ext;
}

/** Daftar id tema editor yang tersedia (cermin THEMES). */
export const EDITOR_THEME_IDS = THEMES.map((x) => x.id);
