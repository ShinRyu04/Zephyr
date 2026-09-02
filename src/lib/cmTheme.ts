// cmTheme.ts — kompatibilitas: tema CodeMirror Zephyr.
//
// Fase 13 memindahkan definisinya ke `src/styles/editor-themes.ts` supaya
// tema editor dan tema shell dibangun dari token yang SAMA. File ini hanya
// meneruskan, jadi import lama (`components/editor/CodeMirrorEditor.tsx`)
// tidak perlu tahu perpindahan itu.

export { zephyrHighlight, editorTheme, EDITOR_THEME_IDS } from '../styles/editor-themes';
