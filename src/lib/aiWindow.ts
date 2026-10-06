import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

/** Label of the pop-out AI window. One at a time. */
export const AI_WINDOW_LABEL = 'ai';

/**
 * Open (or focus) the floating AI chat window.
 *
 * If the window already exists it is just focused; otherwise a new one is
 * created pointing at the same bundle with the `#ai` hash, which `main.tsx`
 * routes to `<AiWindow/>` instead of the full editor. The main window drops
 * its own AI render while in 'window' mode, so only one `ai-chunk` listener is
 * ever live and tokens never double.
 */
export async function bukaAiWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(AI_WINDOW_LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const w = new WebviewWindow(AI_WINDOW_LABEL, {
    url: 'index.html#ai',
    title: 'Zephyr — Chat',
    width: 720,
    height: 860,
    minWidth: 420,
    minHeight: 480,
    resizable: true,
    decorations: true,
    center: true,
  });
  await new Promise<void>((resolve) => {
    void w.once('tauri://created', () => resolve());
    void w.once('tauri://error', () => resolve());
  });
}

/** Close the pop-out AI window if it exists. */
export async function tutupAiWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(AI_WINDOW_LABEL);
  if (existing) await existing.close();
}
