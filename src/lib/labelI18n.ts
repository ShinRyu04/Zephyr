/**
 * Translation of labels that come from data, not from JSX.
 *
 * Most UI labels live in data files (menu lists, action lists,
 * command lists, prompt libraries) and are read when the module loads. Translating
 * at that spot is NOT possible: the values are computed before the store is ready, and
 * translating once at startup means the label does not change when
 * the user switches language.
 *
 * That is why the translation happens AT RENDER TIME: a component calls
 * labelTerjemah() every time it draws, and this function reads the active language
 * from the store. The result changes as soon as the language is switched, with no reload.
 *
 * The original labels are in Indonesian and also serve as the dictionary keys, just
 * like tr()/tx() in i18n.
 */

import { useStore } from './store';
import { translate } from './i18n';

/**
 * Translate a single data label according to the active interface language.
 *
 * Safe to call from components as well as from plain functions: the language is read
 * straight from the store, not from a React hook.
 */
export function labelTerjemah(teks: string | undefined | null): string {
  if (!teks) return '';
  const lang = useStore.getState().settings.general.uiLang;
  return translate(lang, teks);
}

/** Hook version: used by components that need a re-render when the language changes. */
export function useLabel(): (teks: string | undefined | null) => string {
  // Subscribe to uiLang so the component redraws when the language is switched.
  const lang = useStore((s) => s.settings.general.uiLang);
  return (teks) => (teks ? translate(lang, teks) : '');
}
