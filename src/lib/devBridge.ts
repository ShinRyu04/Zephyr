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
import { useAi, extractCommand, isDestructive, MAX_MSGS } from './aiStore';
import { ALL_MODELS } from './modelCatalog';
import { THEMES } from './themes';
import { ACTIONS, effectiveBinding, findConflicts } from './shortcuts';
import { translate } from './i18n';
import { flushTab, getActiveView, revealPosition } from './editorRegistry';
import { fsRead, sessionLoad, scanDir, searchFiles, ptyWrite, ptyList, ptySetPaused, ptyInterrupt, listAgents, getPublicModels, setModelKey, testModelConnection, resetSettings, getSettings } from './commands';
import { readBuffer, getSelection, activeIds, findRow, selectLine, termSize } from './xtermRegistry';
import { copySelection, pasteInto } from './terminalClipboard';
import { clipboardRead, clipboardWrite } from './clipboard';
import { useGit } from './gitStore';
import { useMcp } from './mcpStore';
import { usePalette } from './paletteStore';
import { COMMANDS } from './commandRegistry';

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
  // AI panel (fase 09): store chat + jalur streaming/terminal.
  w.__ZEPHYR_AI__ = {
    store: useAi,
    /** daftar model di katalog (untuk membuktikan dropdown lengkap) */
    catalog: () => ALL_MODELS.map((m) => ({ id: m.id, provider: m.provider, logo: m.logo, baseUrl: m.baseUrl })),
    /** deteksi perintah berbahaya (dipakai uji konfirmasi) */
    destructive: (cmdText: string) => isDestructive(cmdText),
    /** blok perintah terakhir dari sebuah jawaban markdown */
    command: (md: string) => extractCommand(md),
    /** kirim pesan langsung tanpa mengetik di textarea */
    send: (text: string) => useAi.getState().send(text),
    cancel: () => useAi.getState().cancel(),
    /** isi chat sesi aktif (role + teks + status) */
    messages: () =>
      (useAi.getState().activeSession()?.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        streaming: !!m.streaming,
        error: m.error ?? null,
        model: m.model ?? null,
        attached: m.attached ?? null,
      })),
    /** simpanan localStorage mentah (bukti V9 restore) */
    persisted: () => localStorage.getItem('zephyr.ai.sessions.v1'),
    maxMsgs: MAX_MSGS,
  };
  // Source Control (fase 10): store git + jalur command untuk harness.
  w.__ZEPHYR_GIT__ = {
    store: useGit,
    status: () => useGit.getState().status,
    refresh: () => useGit.getState().refreshAll(),
    /** daftar perubahan ringkas (path/status/staged) */
    changes: () =>
      (useGit.getState().status?.changes ?? []).map((c) => ({
        path: c.path,
        status: c.status,
        staged: c.staged,
        isNew: c.isNew,
        isDeleted: c.isDeleted,
        origPath: c.origPath,
      })),
    stage: (paths: string[]) => useGit.getState().stage(paths),
    unstage: (paths: string[]) => useGit.getState().unstage(paths),
    setMessage: (m: string) => useGit.getState().setMessage(m),
    commit: () => useGit.getState().commit(),
    push: (setUpstream?: boolean) => useGit.getState().push(setUpstream ?? false),
    pull: (rebase?: boolean) => useGit.getState().pull(rebase ?? false),
    sync: () => useGit.getState().sync(),
    branches: () => useGit.getState().branches,
    checkout: (b: string) => useGit.getState().checkout(b),
    createBranch: (n: string) => useGit.getState().createBranch(n),
    deleteBranch: (n: string) => useGit.getState().deleteBranch(n),
    log: () => useGit.getState().log,
    openDiff: (path: string, staged = false) => {
      const c = (useGit.getState().status?.changes ?? []).find(
        (x) => x.path === path && x.staged === staged,
      );
      return c ? useGit.getState().openDiff(c) : Promise.resolve();
    },
    diff: () => useGit.getState().diff,
    closeDiff: () => useGit.getState().closeDiff(),
    /** dialog konfirmasi: buka & jawab (uji discard tanpa klik) */
    confirm: () => useGit.getState().confirm,
    setConfirm: (c: unknown) => useGit.getState().setConfirm(c as never),
    resolveConfirm: () => useGit.getState().resolveConfirm(),
    error: () => useGit.getState().scmError,
    info: () => useGit.getState().scmInfo,
    busy: () => useGit.getState().busy,
    // GitHub
    gh: () => useGit.getState().gh,
    ghMessage: () => useGit.getState().ghMessage,
    loadGh: () => useGit.getState().loadGh(),
    savePat: (t: string) => useGit.getState().savePat(t),
    logoutGh: () => useGit.getState().logoutGh(),
    testGh: () => useGit.getState().testGh(),
    setClientId: (id: string) => useGit.getState().setClientId(id),
  };
  // MCP (fase 11): store panel + jalur command untuk harness verify11.
  w.__ZEPHYR_MCP__ = {
    store: useMcp,
    status: () => useMcp.getState().status,
    log: () => useMcp.getState().log,
    toast: () => useMcp.getState().toast,
    setToast: (m: string | null) => useMcp.getState().setToast(m),
    clearLog: () => useMcp.getState().clearLog(),
    refresh: () => useMcp.getState().refresh(),
    /** nyalakan/matikan server lewat jalur UI yang sama */
    toggle: (on: boolean) => useMcp.getState().toggleServer(on),
    clis: () => useMcp.getState().clis,
    refreshClis: () => useMcp.getState().refreshClis(),
    setChecked: (ids: string[]) => useMcp.getState().setChecked(ids),
    write: () => useMcp.getState().writeToCli(),
    remove: () => useMcp.getState().removeFromCli(),
    rotate: () => useMcp.getState().rotateToken(),
    lastWrite: () => useMcp.getState().lastWrite,
    lastAction: () => useMcp.getState().lastAction,
    served: () => useMcp.getState().served,
    lastShot: () => useMcp.getState().lastShot,
    error: () => useMcp.getState().mcpError,
    info: () => useMcp.getState().mcpInfo,
    setError: (m: string | null) => useMcp.getState().setError(m),
    setInfo: (m: string | null) => useMcp.getState().setInfo(m),
  };
  // Command Palette / Quick Open (fase 12).
  w.__ZEPHYR_CP__ = {
    store: usePalette,
    open: (mode: 'command' | 'file') => usePalette.getState().openPalette(mode),
    close: () => usePalette.getState().close(),
    setQuery: (q: string) => usePalette.getState().setQuery(q),
    move: (d: number) => usePalette.getState().move(d),
    accept: (i?: number) => usePalette.getState().accept(i),
    /** hasil terfilter saat ini (label + detail + binding) */
    items: () =>
      usePalette.getState().items().map((x) => ({
        id: x.id,
        label: x.label,
        detail: x.detail,
        binding: x.binding ?? null,
        score: Math.round(x.score),
      })),
    index: () => usePalette.getState().index,
    isOpen: () => usePalette.getState().open,
    mode: () => usePalette.getState().mode,
    lastRun: () => usePalette.getState().lastRun,
    files: () => usePalette.getState().files.length,
    /** seluruh katalog command (untuk membuktikan registry lengkap) */
    commands: () => COMMANDS.map((c) => ({ id: c.id, title: c.title, group: c.group })),
    /** tabel shortcut efektif + deteksi konflik (V4) */
    shortcutTable: () => {
      const custom = useStore.getState().settings.shortcuts;
      const rows = ACTIONS.map((a) => ({
        id: a.id,
        label: a.label,
        group: a.group,
        binding: effectiveBinding(a.id, custom),
      }));
      const seen = new Map<string, string[]>();
      for (const r of rows) {
        seen.set(r.binding, [...(seen.get(r.binding) ?? []), r.id]);
      }
      const conflicts = [...seen.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([binding, ids]) => ({ binding, ids }));
      return { rows, conflicts };
    },
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
