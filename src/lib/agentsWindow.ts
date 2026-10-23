import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit } from '@tauri-apps/api/event';
import { EV } from './events';

/** Label of the "Open in Agents" window. One at a time. */
export const AGENTS_WINDOW_LABEL = 'agents';

/**
 * Halaman yang bisa dibuka di canvas jendela Agents.
 *
 * Satu tipe untuk sidebar dan canvas: keduanya harus setuju soal halaman apa
 * yang ada, dan dua daftar union yang terpisah pernah menghasilkan tombol yang
 * mengubah state ke nilai yang tidak dikenali canvas (canvas tetap di chat,
 * tombolnya terlihat aktif).
 */
export type TampilanAgents = 'chat' | 'marketplace' | 'automation' | 'artifacts';
const EDITOR_WINDOW_LABEL = 'main';

/**
 * Ask the main editor window to open a file in a tab.
 *
 * Used by the file tree's "Open in New Tab" (right-click menu). The Agents
 * window has no editor tabs of its own, so "open" here can only mean "open it
 * where the editor lives". The event is broadcast; the main window listens
 * (App.tsx) and runs the same `openPath` a drag-and-drop would.
 */
export async function mintaBukaDiEditor(path: string): Promise<void> {
  await emit(EV.openFileInEditor, { path });
  /* Best-effort focus: the file is opened either way, so a missing editor
     window must not turn this into an error the reader has to handle. */
  await fokusEditorWindow().catch(() => {});
}

/**
 * Bring the main editor window back, creating it if it was closed.
 *
 * `fokusEditorWindow` used to only call `setFocus()` on the existing window.
 * Closing the main window does NOT quit the app (the Agents window keeps the
 * process alive), so `getByLabel('main')` returned null and the promise threw
 * - swallowed by `.catch(() => {})` in the caller. The IDE button then looked
 * dead: nothing appeared, no error, nothing to retry. It must be able to
 * rebuild the window, not merely raise it.
 *
 * The label and URL mirror `tauri.conf.json` exactly (no decorations, custom
 * title bar drawn by the app). Creating the window from this side is enough:
 * the Rust side has no state keyed to `main` that must be re-registered, and
 * the new window boots the normal renderer.
 */
export async function bukaJendelaUtama(): Promise<void> {
  const ada = await WebviewWindow.getByLabel(EDITOR_WINDOW_LABEL);
  if (ada) {
    await ada.unminimize().catch(() => {});
    await ada.show().catch(() => {});
    await ada.setFocus();
    return;
  }
  const w = new WebviewWindow(EDITOR_WINDOW_LABEL, {
    url: 'index.html',
    title: 'Zephyr',
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 520,
    resizable: true,
    decorations: false,
    center: true,
    focus: true,
    dragDropEnabled: true,
  });
  await new Promise<void>((resolve) => {
    void w.once('tauri://created', () => resolve());
    void w.once('tauri://error', () => resolve());
  });
}

/** Focus the main editor window, creating it first when it is gone. */
export async function fokusEditorWindow(): Promise<void> {
  await bukaJendelaUtama();
}

/**
 * Open (or focus) the Agents window.
 *
 * This is NOT the same thing as `bukaAiWindow()` in `aiWindow.ts`. That one is
 * the floating CHAT window — a single column, 720x860, meant to give the
 * conversation the whole surface while you keep coding in the main window.
 *
 * This one is the VS Code-style AGENTS workspace: three columns (sessions on
 * the left, the Zephyr chat in the middle, Changes/Files on the right) with its
 * own title bar. It is a workspace of its own, which is why it is wider and has
 * a much larger minimum — at 3 columns a narrow window is unusable.
 *
 * The two live side by side on purpose: opening one does not close the other.
 */
export async function bukaAgentsWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(AGENTS_WINDOW_LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const w = new WebviewWindow(AGENTS_WINDOW_LABEL, {
    url: 'index.html#agents',
    title: 'Zephyr — Agents',
    width: 1280,
    height: 860,
    /* Three columns need room; below this the editor tree and the transcript
       start fighting for the same pixels. */
    minWidth: 900,
    minHeight: 520,
    resizable: true,
    /*
     * No native title bar — the window draws its own.
     *
     * With decorations on, the OS bar sits above ours and the window has TWO
     * title bars stacked, each with its own min/max/close. The custom one is
     * kept because it carries the column toggles and the maximise control, and
     * it is themed with the rest of the app; the native one is removed so the
     * bar is a single row. Window controls therefore come from
     * `WindowControls`, which is already rendered inside the custom bar.
     */
    decorations: false,
    center: true,
  });
  await new Promise<void>((resolve) => {
    void w.once('tauri://created', () => resolve());
    void w.once('tauri://error', () => resolve());
  });
}

/** Close the Agents window if it exists. */
export async function tutupAgentsWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(AGENTS_WINDOW_LABEL);
  if (existing) await existing.close();
}
