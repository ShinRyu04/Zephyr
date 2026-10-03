/*
 * Kept: the file name.
 *
 * The section is re-exported from here rather than renamed, because
 * `SettingsPage.tsx:8` imports `./SectionsLsp` by path and the file name is
 * load-bearing in a way the component name is not. Renaming it would be a
 * cosmetic change with a real chance of a broken import and nothing gained.
 *
 * The implementation lives in `LanguageServersSection.tsx`, split out because it
 * is the largest of the settings sections and the only one with its own
 * debounce-free probe cycle. Keeping the old body here would have meant two
 * components claiming the same settings key.
 */
export { default } from './LanguageServersSection';
