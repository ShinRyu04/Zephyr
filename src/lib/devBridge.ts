// devBridge.ts — jembatan verifikasi otomatis (HANYA mode dev).
//
// scripts/verify.mjs menempel ke WebView2 lewat CDP dan memakai objek di
// bawah untuk membuktikan V1..V10 fase 03 benar-benar jalan.
// Semua kode di file ini mati total di build release: pemanggilnya
// dibungkus `if (import.meta.env.DEV)` sehingga Rollup men-tree-shake-nya.

import { undo, redo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useStore } from './store';
import { MAX_LOADED_TABS, maxLoadedTabs } from './store';
import { useExplorer } from './explorerStore';
import { useTerminal } from './terminalStore';
import { useSettingsUi } from './settingsStore';
import { useAi, extractCommand, isDestructive, MAX_MSGS, MSG_LIMIT, ATTACH_LIMIT } from './aiStore';
import { ALL_MODELS } from './modelCatalog';
import { THEMES, systemPrefersDark } from './themes';
import { ACTIONS, effectiveBinding, findConflicts } from './shortcuts';
import { translate } from './i18n';
import { flushTab, getActiveView, revealPosition } from './editorRegistry';
import { fsRead, fsWrite, sessionLoad, scanDir, searchFiles, ptyWrite, ptyKill, ptySpawn, ptyList, ptySetPaused, ptyInterrupt, listAgents, getPublicModels, setModelKey, testModelConnection, resetSettings, getSettings, extensionsLoad, extensionsFolder, getDiagnostics, logFrontend, perfMark, debugPanic, gitStatus, gitStage, gitCommit, gitLog, gitDiff, gitCreateBranch, setWindowSize, takeBrokenConfig, workspaceOpen } from './commands';
import { readBuffer, getSelection, activeIds, findRow, selectLine, termSize, termOptionsTheme, retheme } from './xtermRegistry';
import { copySelection, pasteInto, writeChunked } from './terminalClipboard';
import { clipboardRead, clipboardWrite } from './clipboard';
import { useGit } from './gitStore';
import { useMcp } from './mcpStore';
import { usePalette } from './paletteStore';
import { useExtensions } from './extensionStore';
import { COMMANDS, availableCommands, extensionCommands, findCommand, runCommand } from './commandRegistry';
import { useNotif } from './notificationStore';
import { useKb } from './keybindingStore';
import { chordConflicts, chordFor } from './keybindings';
import { MENUS } from './menu';
import { usePanel } from './panelStore';
import { useProblems } from './problemsStore';
import { useOutput } from './outputStore';
import { usePorts } from './portsStore';
import { evaluateDebugExpr } from '../components/shell/DebugConsoleView';

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
    /** command yang benar-benar tampil sekarang, TERMASUK dari ekstensi */
    available: () =>
      availableCommands().map((c) => ({ id: c.id, title: c.title, group: c.group })),
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
  // Ekstensi + tema (fase 13): store, jalur load/toggle, dan token warna
  // yang benar-benar terkomputasi di <html> (bukti V1/V3).
  w.__ZEPHYR_EXT__ = {
    store: useExtensions,
    list: () => useExtensions.getState().list,
    refresh: () => useExtensions.getState().refresh(),
    toggle: (id: string, on: boolean) => useExtensions.getState().toggle(id, on),
    load: (id: string) => useExtensions.getState().load(id),
    /** panggil `extensions_load` LANGSUNG supaya error (mis. >1MB) terlihat */
    loadRaw: (id: string) => extensionsLoad(id),
    addPath: (p: string) => useExtensions.getState().addPath(p),
    remove: (id: string) => useExtensions.getState().remove(id),
    folder: () => extensionsFolder(),
    error: () => useExtensions.getState().extError,
    info: () => useExtensions.getState().extInfo,
    setError: (m: string | null) => useExtensions.getState().setError(m),
    market: (open: boolean) => useExtensions.getState().setMarketOpen(open),
    /** command yang disumbang ekstensi aktif */
    extCommands: () => extensionCommands().map((c) => ({ id: c.id, title: c.title, group: c.group })),
  };
  w.__ZEPHYR_THEME__ = {
    active: () => document.documentElement.dataset.theme ?? '',
    /** id tema di store (dipakai CodeMirror) */
    inStore: () => useStore.getState().activeTheme,
    ids: () => THEMES.map((t) => t.id),
    set: (id: string) => {
      const info = THEMES.find((t) => t.id === id);
      return useStore.getState().applySettings({
        theme: { current: id },
        general: { theme: info?.kind === 'light' ? 'light' : 'dark' },
      });
    },
    mode: (m: 'dark' | 'light' | 'system') =>
      useStore.getState().applySettings({ general: { theme: m } }),
    /** nilai satu token CSS setelah komputasi */
    token: (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    /** semua token wajib fase 13 + nilainya (kosong = token hilang) */
    tokens: (names: string[]) => {
      const css = getComputedStyle(document.documentElement);
      const out: Record<string, string> = {};
      for (const n of names) out[n] = css.getPropertyValue(n).trim();
      return out;
    },
    /** warna terminal xterm yang sedang dipakai (bukti V3) */
    termTheme: (id: string) => {
      const t = termOptionsTheme(id);
      return t ? { background: t.background, red: t.red, green: t.green, black: t.black } : null;
    },
    retheme: () => retheme(),
    systemDark: () => systemPrefersDark(),
  };
  // Untuk menguji jalur onCloseRequested (V7 fase 02 / V5 fase 03).
  w.__ZEPHYR_WIN__ = {
    close: () => getCurrentWindow().close(),
    destroy: () => getCurrentWindow().destroy(),
  };

  // ── fase 14: hardening backend. Jalur yang dipakai verify14.mjs ──
  w.__ZEPHYR_DIAG__ = {
    /** angka nyata dari Rust: RAM, uptime, log, marks, counters */
    get: () => getDiagnostics(),
    /** tulis satu baris ke file log Rust */
    log: (level: 'error' | 'warn' | 'info', msg: string) => logFrontend(level, msg),
    mark: (name: string, durMs?: number) => perfMark(name, durMs),
    /** HANYA debug build: memicu panic di Rust (uji panic hook + dialog) */
    panic: () => debugPanic(),
    /** fs_write MENTAH — untuk membuktikan penolakan WorkspaceOutside (V2) */
    write: (path: string, content: string) => fsWrite(path, content),
    /** fs_read MENTAH — pesan NotFound yang dilihat user (V1) */
    read: (path: string) => fsRead(path),
    /** pty_spawn MENTAH dengan cwd bebas (uji validasi cwd 14.2) */
    spawn: (id: string, cwd: string) => ptySpawn({ id, kind: 'shell', cwd }),
    kill: (id: string) => ptyKill(id),
    /** batas tab yang isinya boleh tinggal di memori (14.5) */
    maxLoadedTabs: MAX_LOADED_TABS,
    /** ringkasan tab: mana yang masih memegang konten */
    tabs: () =>
      useStore.getState().tabs.map((t) => ({
        id: t.id,
        name: t.name,
        loaded: t.loaded !== false,
        bytes: t.content.length,
        unsaved: t.unsaved,
      })),
    /** total karakter konten yang ditahan seluruh tab */
    heldChars: () => useStore.getState().tabs.reduce((n, t) => n + t.content.length, 0),
    unload: () => useStore.getState().unloadColdTabs(),
    ensure: (id: string) => useStore.getState().ensureTabLoaded(id),
    /** git: jalur mentah untuk uji semaphore (V3) */
    git: {
      status: () => gitStatus(),
      stage: (paths: string[]) => gitStage(paths),
      commit: (msg: string) => gitCommit(msg),
      log: (n?: number) => gitLog(n ?? 5),
      progress: () => useGit.getState().progress,
    },
    /** dialog crash sedang tampil? (V7) */
    crashVisible: () => !!document.querySelector('[data-testid="crash-dialog"]'),
    crashMessage: () =>
      document.querySelector('[data-testid="crash-message"]')?.textContent ?? null,
  };

  // ── fase 15: bugfix vol 1. Jalur yang dipakai verify15.mjs ──
  w.__ZEPHYR_BUG__ = {
    /** fs_read mentah — untuk melihat readOnly/note/bytes/encoding */
    read: (path: string) => fsRead(path),
    /** fs_write dengan opsi wasExisting/allowMissing (uji "file hilang") */
    write: (
      path: string,
      content: string,
      opts?: { wasExisting?: boolean; allowMissing?: boolean },
    ) => fsWrite(path, content, undefined, undefined, opts),
    /** ringkasan tab: read-only? note? encoding? existed? */
    tabs: () =>
      useStore.getState().tabs.map((t) => ({
        id: t.id,
        name: t.name,
        path: t.path,
        encoding: t.encoding,
        readOnly: t.readOnly === true,
        note: t.note ?? '',
        bytes: t.bytes ?? 0,
        /** panjang konten yang BENAR-BENAR ditahan di memori (0 = dilepas).
         *  Beda dari `bytes` yang merupakan ukuran file di disk — memakai
         *  `bytes` untuk menilai "tab dilepas" selalu salah (fase 16). */
        held: t.content.length,
        loaded: t.loaded !== false,
        unsaved: t.unsaved,
        existed: t.existed === true,
      })),
    /** dialog simpan (file hilang / UTF-16) */
    saveIssue: () => useStore.getState().saveIssue,
    resolveSave: (choice: 'ok' | 'cancel') => useStore.getState().resolveSaveIssue(choice),
    save: (id: string) => useStore.getState().saveTab(id),
    /** editor read-only benar-benar menolak edit? */
    cmEditable: () => {
      const v = getActiveView();
      return v ? { editable: v.state.facet(EditorView.editable), lines: v.state.doc.lines } : null;
    },
    /** paste ke terminal lewat jalur chunk 4KB (fase 15.2) */
    writeChunked: (id: string, data: string) => writeChunked(id, data),
    /** pane + exit code (fase 15.2) */
    panes: () =>
      useTerminal.getState().allPanes().map((p) => ({
        id: p.id,
        kind: p.kind,
        status: p.status,
        exitCode: p.exitCode ?? null,
      })),
    /** git: diff mentah (uji label binary) */
    diffRaw: (path: string, staged = false) => gitDiff(path, staged),
    /** commit mentah — bukti Rust menolak pesan kosong walau UI dilewati */
    commitRaw: (msg: string) => gitCommit(msg),
    branchRaw: (name: string) => gitCreateBranch(name),
    /** batas AI (fase 15.5) */
    aiLimits: () => ({ msg: MSG_LIMIT, attach: ATTACH_LIMIT, maxMsgs: MAX_MSGS }),
    /** laporan pemotongan pesan terakhir (fase 15.5) */
    aiTruncated: () => useAi.getState().lastTruncated,
    /** layout sempit aktif? (fase 15.6) */
    narrow: () => document.body.classList.contains('is-narrow'),
    /** teks RAM di status bar — bukti tidak NaN (fase 15.6) */
    ramText: () =>
      document.querySelector('[data-testid="sb-ram"]')?.textContent?.trim() ?? null,
    /** jumlah baris palette yang BENAR-BENAR dirender (virtual scroll) */
    cpRendered: () => document.querySelectorAll('[data-testid="cp-row"]').length,
    /** ubah ukuran jendela lewat command Rust (uji layout sempit 15.6) */
    resize: (w: number, h: number) => setWindowSize(w, h),
    /** laporan config rusak terakhir yang di-backup Rust (fase 16.3) */
    brokenConfig: () => takeBrokenConfig(),
    /** batas tab termuat yang BERLAKU sekarang (ikut mode penghemat RAM) */
    maxTabs: () => maxLoadedTabs(),
    /** workspace_open MENTAH — untuk membuktikan penolakan root drive (16.3) */
    openWs: (p: string) => workspaceOpen(p),
  };

  // ── fase 27: notifikasi terpusat ──
  w.__ZEPHYR_NOTIF__ = {
    store: useNotif,
    notify: (n: Parameters<ReturnType<typeof useNotif.getState>['notify']>[0]) =>
      useNotif.getState().notify(n),
    update: (id: string, patch: Record<string, unknown>) =>
      useNotif.getState().update(id, patch as never),
    progress: (id: string, v: number | 'indeterminate') => useNotif.getState().progress(id, v),
    dismiss: (id: string) => useNotif.getState().dismiss(id),
    clear: () => useNotif.getState().clear(),
    /** riwayat ringkas (tanpa fungsi) */
    items: () =>
      useNotif.getState().items.map((x) => ({
        id: x.id,
        severity: x.severity,
        message: x.message,
        detail: x.detail ?? null,
        source: x.source ?? null,
        progress: x.progress ?? null,
        sticky: !!x.sticky,
        read: x.read,
        actions: x.actions.map((a) => a.command),
      })),
    /** id yang sedang tampil sebagai toast */
    toasts: () => useNotif.getState().toasts,
    unread: () => useNotif.getState().items.filter((x) => !x.read).length,
    dnd: () => useNotif.getState().dnd,
    setDnd: (v: boolean) => useNotif.getState().setDnd(v),
    center: (open: boolean) => useNotif.getState().setCenterOpen(open),
    centerOpen: () => useNotif.getState().centerOpen,
    markAllRead: () => useNotif.getState().markAllRead(),
    /** jalankan command by id (jalur yang dipakai tombol aksi notifikasi) */
    run: (id: string) => runCommand(id),
    /** dialog hapus Explorer (pengganti window.confirm, fase 27) */
    askDelete: (paths: string[]) => useExplorer.getState().askDelete(paths),
    pendingDelete: () => useExplorer.getState().pendingDelete,
    confirmDelete: () => useExplorer.getState().confirmDelete(),
    cancelDelete: () => useExplorer.getState().cancelDelete(),
  };

  // ── fase 18: menu bar + keybinding registry ──
  w.__ZEPHYR_KB__ = {
    store: useKb,
    /** semua binding efektif (default ⊕ user), tanpa fungsi */
    bindings: () =>
      useKb.getState().bindings.map((b) => ({
        chord: b.chord,
        command: b.command,
        when: b.when,
        layer: b.layer,
        label: b.label ?? null,
      })),
    /** chord efektif untuk satu command ('' = tidak ada) */
    chordFor: (command: string) => chordFor(command, useKb.getState().bindings),
    user: () => useKb.getState().user,
    /** simpan override chord baru */
    remap: (command: string, chord: string, when?: string) =>
      useKb.getState().remap(command, chord, when as never),
    removeBinding: (command: string) => useKb.getState().removeBinding(command),
    resetOne: (command: string) => useKb.getState().resetOne(command),
    resetAll: () => useKb.getState().resetAll(),
    /** resolusi sequence -> binding (null = tidak ada) */
    resolve: (seq: string) => useKb.getState().resolve(seq),
    isPrefix: (seq: string) => useKb.getState().isPrefix(seq),
    pending: () => useKb.getState().pending,
    setPending: (c: string) => useKb.getState().setPending(c),
    ctx: () => useKb.getState().ctx,
    setCtx: (key: string, on: boolean) => useKb.getState().setCtx(key as never, on),
    /** command terakhir yang dijalankan resolver — bukti V4/V5/V6 */
    lastRun: () => useKb.getState().lastRun,
    setLastRun: (v: string | null) => useKb.getState().setLastRun(v),
    /** editor Keyboard Shortcuts (18.4) */
    editor: (open: boolean) => useKb.getState().setEditorOpen(open),
    editorOpen: () => useKb.getState().editorOpen,
    /** konflik chord untuk sebuah command */
    conflicts: (command: string, chord: string, when = 'global') =>
      chordConflicts(command, chord, when as never, useKb.getState().bindings),
    /** struktur menu bar; command yang tidak terdaftar ditandai */
    menu: () =>
      MENUS.map((m) => ({
        label: m.label,
        mnemonic: m.mnemonic,
        items: m.items.map((it) => ({
          kind: it.kind ?? 'item',
          label: it.label ?? null,
          command: it.command ?? null,
          hasCommand: it.command ? !!findCommand(it.command) : null,
          children:
            it.children?.map((c) => ({
              label: c.label ?? null,
              command: c.command ?? null,
              hasCommand: c.command ? !!findCommand(c.command) : null,
            })) ?? null,
        })),
      })),
    /** kirim chord sintetis ke window (jalur yang sama dengan tombol nyata) */
    press: (chord: string) => {
      const parts = chord.split('+');
      const key = parts[parts.length - 1];
      const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
      const ev = new KeyboardEvent('keydown', {
        key: key.length === 1 ? key.toLowerCase() : key,
        code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
        ctrlKey: mods.includes('ctrl'),
        shiftKey: mods.includes('shift'),
        altKey: mods.includes('alt'),
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    },
  };

  // ── fase 20: panel bawah ──
  w.__ZEPHYR_PANEL__ = {
    store: usePanel,
    activeTab: () => usePanel.getState().activeTab,
    visibleTabs: () => usePanel.getState().visibleTabs.slice(),
    focusTab: (id: string) => usePanel.getState().focusTab(id as never),
    toggleTabVisible: (id: string) => usePanel.getState().toggleTabVisible(id as never),
    cycleTab: (d: 1 | -1) => usePanel.getState().cycleTab(d),
    menuOpen: (v: boolean) => usePanel.getState().setTabMenuOpen(v),
    hydrate: (vt?: string[], at?: string) => usePanel.getState().hydrate(vt, at),
    /** state panel dari terminalStore (satu sumber visible/height/maximized) */
    visible: () => useTerminal.getState().visible,
    height: () => useTerminal.getState().height,
    maximized: () => useTerminal.getState().maximized,

    problems: {
      set: (file: string, list: unknown[]) =>
        useProblems.getState().setDiagnostics(file, list as never),
      removeFile: (file: string) => useProblems.getState().removeFile(file),
      clearAll: () => useProblems.getState().clearAll(),
      all: () => useProblems.getState().all(),
      counts: () => useProblems.getState().counts(),
      forFile: (file: string) => useProblems.getState().forFile(file),
      setFilter: (q: string) => useProblems.getState().setFilter(q),
      setActiveOnly: (v: boolean) => useProblems.getState().setActiveOnly(v),
    },

    output: {
      append: (ch: string, text: string) => useOutput.getState().append(ch, text),
      clear: (ch: string) => useOutput.getState().clear(ch),
      lines: (ch: string) => useOutput.getState().lines(ch).length,
      tail: (ch: string, n = 5) => useOutput.getState().lines(ch).slice(-n),
      list: () => useOutput.getState().list(),
      setChannel: (id: string) => useOutput.getState().setActiveChannel(id),
      activeChannel: () => useOutput.getState().activeChannel,
      autoScroll: () => useOutput.getState().autoScroll,
      setAutoScroll: (v: boolean) => useOutput.getState().setAutoScroll(v),
      wrap: () => useOutput.getState().wrap,
      setWrap: (v: boolean) => useOutput.getState().setWrap(v),
      addChannel: (id: string, label: string) => useOutput.getState().addChannel(id, label),
    },

    ports: {
      add: (p: Record<string, unknown>) => usePorts.getState().add(p as never),
      remove: (id: string) => usePorts.getState().remove(id),
      update: (id: string, patch: Record<string, unknown>) =>
        usePorts.getState().update(id, patch as never),
      list: () => usePorts.getState().list(),
      urlFor: (id: string) => usePorts.getState().urlFor(id),
      clear: () => usePorts.getState().clear(),
    },

    /** REPL Debug Console (fase 20 = no-op yang menulis ke Output "debug") */
    debugEval: (expr: string) => evaluateDebugExpr(expr),
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
