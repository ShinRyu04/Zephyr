// devBridge.ts — jembatan verifikasi otomatis (HANYA mode dev).
//
// scripts/verify.mjs menempel ke WebView2 lewat CDP dan memakai objek di
// bawah untuk membuktikan V1..V10 fase 03 benar-benar jalan.
// Semua kode di file ini mati total di build release: pemanggilnya
// dibungkus `if (import.meta.env.DEV)` sehingga Rollup men-tree-shake-nya.

import { undo, redo } from '@codemirror/commands';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useStore } from './store';
import { useExplorer } from './explorerStore';
import { useTerminal } from './terminalStore';
import { useSettingsUi } from './settingsStore';
import { THEMES } from './themes';
import { ACTIONS, effectiveBinding, findConflicts } from './shortcuts';
import { translate } from './i18n';
import { flushTab, getActiveView, revealPosition } from './editorRegistry';
import { fsRead, sessionLoad, scanDir, searchFiles, ptyWrite, ptyList, ptySetPaused, ptyInterrupt, listAgents, getPublicModels, setModelKey, testModelConnection, resetSettings, getSettings } from './commands';
import { readBuffer, getSelection, activeIds, findRow, selectLine, termSize } from './xtermRegistry';
import { copySelection, pasteInto } from './terminalClipboard';
import { clipboardRead, clipboardWrite } from './clipboard';

type CmdName = 'undo' | 'redo';

export function installDevBridge(): void {
  const w = window as unknown as Record<string, unknown>;

  w.__ZEPHYR__ = useStore;
  w.__ZEPHYR_EX__ = useExplorer;
  w.__ZEPHYR_TERM__ = useTerminal;
  w.__ZEPHYR_CM__ = () => getActiveView();
  w.__ZEPHYR_FLUSH__ = (tabId: string) => flushTab(tabId);
  w.__ZEPHYR_FS__ = { read: fsRead, sessionLoad, scanDir, searchFiles };
  w.__ZEPHYR_REVEAL__ = (line: number, col?: number) => revealPosition(line, col);
  w.__ZEPHYR_SET_PAUSED__ = (paused: boolean) => ptySetPaused(paused);
  // Terminal (fase 05): kirim input, baca layar, ukur grid, copy/paste.
  w.__ZEPHYR_PTY__ = {
    write: ptyWrite,
    interrupt: ptyInterrupt,
    list: ptyList,
    read: (id: string, lines?: number) => readBuffer(id, lines ?? 200),
    selection: (id: string) => getSelection(id),
    ids: () => activeIds(),
    size: (id: string) => termSize(id),
    /** pilih baris berdasarkan isinya (row absolut dicari sendiri) */
    selectText: (id: string, text: string) => {
      const row = findRow(id, text);
      return row >= 0 && selectLine(id, row);
    },
    select: (id: string, line: number) => selectLine(id, line),
    // Jalur yang sama dipakai UI (klik kanan / Ctrl+Shift+C / Shift+Insert).
    copy: (id: string) => copySelection(id),
    paste: (id: string) => pasteInto(id),
    clipRead: () => clipboardRead(),
    clipWrite: (t: string) => clipboardWrite(t),
    /** fase 06: daftar agent CLI yang terdeteksi (untuk verifikasi). */
    agents: () => listAgents(),
  };
  w.__ZEPHYR_CMD__ = (name: CmdName) => {
    const view = getActiveView();
    if (!view) return false;
    return name === 'undo' ? undo(view) : redo(view);
  };
  // Settings (fase 08): store UI halaman + jalur key/model lewat Rust.
  w.__ZEPHYR_SET__ = {
    ui: useSettingsUi,
    /** tema yang benar-benar terpasang di <html> */
    activeTheme: () => document.documentElement.dataset.theme ?? '',
    themes: () => THEMES.map((t) => t.id),
    /** binding efektif per action (default + override user) */
    bindings: () => {
      const custom = useStore.getState().settings.shortcuts;
      return ACTIONS.map((a) => ({
        id: a.id,
        binding: effectiveBinding(a.id, custom),
        isCustom: !!custom[a.id],
      }));
    },
    conflicts: (actionId: string, binding: string) =>
      findConflicts(actionId, binding, useStore.getState().settings.shortcuts),
    publicModels: () => getPublicModels(),
    setKey: (provider: string, key: string) => setModelKey(provider, key),
    testKey: (provider: string, baseUrl?: string) => testModelConnection(provider, baseUrl),
    resetAll: () => resetSettings(),
    /** baca settings.json langsung dari disk (bukan dari store) */
    settingsFromDisk: () => getSettings(),
    /** terjemahan label untuk membuktikan toggle bahasa */
    t: (key: string) => translate(useStore.getState().settings.general.uiLang, key),
  };
  // Untuk menguji jalur onCloseRequested (V7 fase 02 / V5 fase 03).
  w.__ZEPHYR_WIN__ = {
    close: () => getCurrentWindow().close(),
    destroy: () => getCurrentWindow().destroy(),
  };

  // Kumpulkan error konsol & promise rejection untuk V10.
  const errors: string[] = [];
  w.__ZEPHYR_ERRORS__ = errors;

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
    origError(...args);
  };
  window.addEventListener('error', (e) => errors.push(`onerror: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) =>
    errors.push(`unhandled: ${String((e as PromiseRejectionEvent).reason)}`),
  );
}
