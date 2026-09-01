// cmTheme.ts — tema CodeMirror "Zephyr Dark" yang membaca CSS variable
// dari src/styles/theme.css (AGENTS.md: dilarang hex hardcoded).

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

const v = (name: string) => `var(${name})`;

export const zephyrEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: v('--editor-bg'),
      color: v('--text'),
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
      backgroundColor: v('--editor-selection'),
    },
    '.cm-activeLine': { backgroundColor: v('--editor-active-line') },
    '.cm-gutters': {
      backgroundColor: v('--editor-bg'),
      color: v('--editor-gutter'),
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: v('--editor-active-line'),
      color: v('--text-secondary'),
    },
    '.cm-selectionMatch': { backgroundColor: v('--editor-match') },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: v('--accent-subtle'),
      outline: `1px solid ${v('--accent')}`,
    },
    '.cm-nonmatchingBracket': { color: v('--danger') },
    '.cm-tooltip': {
      backgroundColor: v('--surface-2'),
      border: `1px solid ${v('--border')}`,
      color: v('--text'),
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: v('--accent'),
      color: v('--text-inverse'),
    },
    '.cm-panels': { backgroundColor: v('--surface'), color: v('--text') },
  },
  { dark: true },
);

export const zephyrHighlight: Extension = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword], color: v('--syn-keyword') },
    { tag: [t.string, t.special(t.string), t.regexp], color: v('--syn-string') },
    { tag: [t.number, t.bool, t.null], color: v('--syn-number') },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: v('--syn-comment'), fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: v('--syn-function') },
    { tag: [t.variableName, t.propertyName], color: v('--syn-variable') },
    { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: v('--syn-type') },
    { tag: [t.operator, t.operatorKeyword, t.punctuation, t.separator], color: v('--syn-operator') },
    { tag: [t.tagName, t.angleBracket], color: v('--syn-tag') },
    { tag: [t.attributeName], color: v('--syn-attr') },
    { tag: [t.invalid], color: v('--syn-invalid') },
    { tag: [t.heading], color: v('--syn-function'), fontWeight: 'bold' },
    { tag: [t.link, t.url], color: v('--accent'), textDecoration: 'underline' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strong], fontWeight: 'bold' },
    { tag: [t.meta], color: v('--text-secondary') },
  ]),
);
