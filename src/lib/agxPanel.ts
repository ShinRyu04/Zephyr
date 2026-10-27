/* agxPanel.ts — open a tab in the Agents window's RIGHT panel from anywhere.
 *
 * The Agents window's chat needs to send the reader to that panel: clicking a
 * changed file should open the File tab on it, and clicking Diff should open
 * the Diff View tab. The panel's open/closed state and its tabs live inside
 * `AgentsApp` (local state) and `useAgxTabs` (store), and the chat component has
 * neither.
 *
 * Hence one event with one shape. `AgentsApp` listens, opens the panel and
 * opens/focuses the tab; the caller only says WHAT it wants shown. Doing it the
 * other way round - reaching into the component's state from the chat - would
 * mean lifting `panelKanan` into a store for one call, and the panel would then
 * have two owners.
 */
import type { Tampilan } from '../components/agents/AgentsViewDropdown';

export const AGX_BUKA_PANEL = 'zephyr-agx-buka-panel';

export type PermintaanPanelAgx = {
  /*
   * `browser` ikut di sini karena permintaannya datang dari LAPISAN TOOL (web.ts),
   * bukan dari komponen React: view Browser bisa belum ada tab-nya sama sekali,
   * dan hanya `AgentsApp` yang boleh membuka panelnya (ia pemilik `panelKanan`).
   * Tanpa `browser`, "buka link ini" dari jendela Agents tidak punya jalan untuk
   * menampilkan pane-nya.
   */
  tampilan: Extract<Tampilan, 'diff-view' | 'file' | 'browser' | 'plan' | 'subagent'>;
  /** File to select, for the `file` tab only. */
  path?: string;
};

/** Opens (or focuses) a tab in the Agents window's right panel. */
export function bukaPanelAgx(tampilan: PermintaanPanelAgx['tampilan'], path?: string) {
  window.dispatchEvent(
    new CustomEvent<PermintaanPanelAgx>(AGX_BUKA_PANEL, { detail: { tampilan, path } }),
  );
}
