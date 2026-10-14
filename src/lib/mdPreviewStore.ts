import { create } from 'zustand';

/*
 * Which editor tabs are currently showing a Markdown PREVIEW instead of the
 * source.
 *
 * This is deliberately ephemeral — not part of `Tab`, not persisted. Preview is
 * a way of LOOKING at a file for the length of a glance, like scrolling; it is
 * not a property of the document the way `pinned` or the cursor position is.
 * Persisting it would mean a reader who previewed a release note once reopens
 * the project weeks later to a rendered page where they expected their source,
 * with no edit cursor and no obvious way back. Keeping it in memory means a
 * reload always lands on the source, and the toggle is one click away.
 *
 * Keyed by tab id. A tab closed while previewing simply drops out of the set on
 * the next `set`, because nothing reads a stale id — `aktif(id)` returns false
 * for an id that was never turned on.
 */
interface MdPreviewState {
  /** Tab ids currently in preview mode. */
  preview: Record<string, boolean>;
  aktif: (tabId: string) => boolean;
  toggle: (tabId: string) => void;
  /** Turn preview off for a tab (used when a tab is closed or its file changes type). */
  matikan: (tabId: string) => void;
}

export const useMdPreview = create<MdPreviewState>((set, get) => ({
  preview: {},
  aktif: (tabId) => get().preview[tabId] === true,
  toggle: (tabId) =>
    set((s) => ({ preview: { ...s.preview, [tabId]: !s.preview[tabId] } })),
  matikan: (tabId) => {
    if (!get().preview[tabId]) return;
    set((s) => {
      const next = { ...s.preview };
      delete next[tabId];
      return { preview: next };
    });
  },
}));
