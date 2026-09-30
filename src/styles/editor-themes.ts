import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import { THEMES } from '../lib/themes';

const v = (name: string) => `var(${name})`;

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
      /*
       * A floor on the number column.
       *
       * CodeMirror sizes the gutter to the widest number it currently renders,
       * so the column grew and shrank as you scrolled and, on a narrow editor,
       * the leading digits were the part that got cut — "160" read as "60".
       * Reserving room for four digits plus padding keeps the column still and
       * the numbers whole; five- and six-digit files still widen past it, which
       * is the correct behaviour.
       */
      minWidth: '2.6em',
      paddingRight: '6px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 4px 0 8px',
      minWidth: '1.6em',
      textAlign: 'right',
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

/*
 * Token colours as concrete values, for canvases that cannot use CSS variables.
 *
 * The highlight style below paints the editor with `var(--syntax-*)`, which is
 * right for DOM and useless for a `<canvas>`: `fillStyle` needs a colour string.
 * Reading the resolved variables off the document element once per theme keeps
 * the minimap on the same palette as the code without duplicating it.
 */
export const warnaToken = {
  get keyword() {
    return baca('--syntax-keyword', '#ff7b72');
  },
  get string() {
    return baca('--syntax-string', '#a5d6ff');
  },
  get number() {
    return baca('--syntax-number', '#79c0ff');
  },
  get comment() {
    return baca('--syntax-comment', '#8b949e');
  },
  get fn() {
    return baca('--syntax-fn', '#d2a8ff');
  },
  get type() {
    return baca('--syntax-type', '#7ee787');
  },
  get operator() {
    return baca('--syntax-operator', '#79c0ff');
  },
  get foreground() {
    return baca('--fg2', '#8b98a5');
  },
};

function baca(nama: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nama).trim();
  return v || fallback;
}

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

export function editorTheme(themeId: string): Extension {
  const hit = cache.get(themeId);
  if (hit) return hit;
  const info = THEMES.find((x) => x.id === themeId);
  const ext = EditorView.theme(themeSpec(), { dark: (info?.kind ?? 'dark') === 'dark' });
  cache.set(themeId, ext);
  return ext;
}

export const EDITOR_THEME_IDS = THEMES.map((x) => x.id);
