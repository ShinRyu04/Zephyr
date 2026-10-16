import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

/** Label of the "Open in Agents" window. One at a time. */
export const AGENTS_WINDOW_LABEL = 'agents';

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
