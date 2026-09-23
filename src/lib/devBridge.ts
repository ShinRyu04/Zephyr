import { undo, redo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useStore } from './store';
import { MAX_LOADED_TABS, maxLoadedTabs } from './store';
import { useExplorer } from './explorerStore';
import { useTerminal } from './terminalStore';
import { useSettingsUi, SECTION_ORDER } from './settingsStore';
import { PERAN, tebakPeran, peranDariPrefix, infoPeran } from './subagentRoles';
import { PANEL_TABS } from './panelStore';
import { useAi, extractCommand, isDestructive, MAX_MSGS, MSG_LIMIT, ATTACH_LIMIT } from './aiStore';
import { useCliAgent } from './cliAgentStore';
import { useSubAgent, MAX_PARALLEL, MAX_SUB_STEPS } from './subagentStore';
import { useLayoutCustom, BARIS_LAYOUT } from './layoutStore';
import { ALL_MODELS } from './modelCatalog';
import { THEMES, systemPrefersDark, semuaTema } from './themes';
import { useExt19, getBahasaWorkspace } from './extensionsStore19';
import { useTasks } from './tasksStore';
import { useHistory } from './historyStore';
import { useSearch } from './searchStore';
import { useDebug } from './debugStore';
import { useCli } from './cliStore';
import { useWs } from './workspaceStore';

import {
  nilaiVariabel,
  sisipkanSnippet,
  terjemahBody,
  useSnip,
  type KonteksVar,
} from './snippetStore';
import {
  nextSnippetField as nextSnippetFieldCm,
  prevSnippetField as prevSnippetFieldCm,
  clearSnippet as clearSnippetCm,
} from '@codemirror/autocomplete';

import { osMintaReducedMotion, useA11y } from './a11yStore';
import {
  cliParse,
  cliTeks,
  cliWaitAktif,
  cliWaitBuat,
  cliWaitSelesai,
  dapStart as dapStartCmd,
  extensionsLoad as extensionsLoadCmd,
  lspStart as lspStartCmd,
  tasksRun as tasksRunCmd,
  tasksKill as tasksKillCmd,
  workspaceBolehEksekusi as workspaceBolehEksekusiCmd,
} from './commands';
import type { CliArgs } from './types';
import {
  tasksMatchLine as tasksMatchLineCmd,
  tasksDetectPort as tasksDetectPortCmd,
  tasksMatchers as tasksMatchersCmd,
  historySnapshot as cmdHistorySnapshot,
  historyList as cmdHistoryList,
  historyRead as cmdHistoryRead,
  historyPrune as cmdHistoryPrune,
  historyStats as cmdHistoryStats,
} from './commands';
import { KATALOG_BUNDLED } from './extCatalog';
import {
  ringkasanLoader,
  muatSemuaEkstensi,
  themesEkstensi,
  keymapEkstensi,
  bahasaEkstensi,
  jumlahSnippet,
  adaSnippet,
  adaIconTheme,
  ikonUntukExt,
} from './extLoader';
import { extensiUntukFile, labelBahasa } from './lang';
import { ACTIONS, ACTION_BY_ID, effectiveBinding, findConflicts } from './shortcuts';
import { translate } from './i18n';
import {
  systemPromptFor,
  aturanProyek,
  resetAturanProyek,
  identityReminder,
  blokIdentitasModel,
} from './systemPrompt';
import { allPrompts, saveUserPrompts, matchPrompts, type PromptItem } from './promptLibrary';
import { batasParalel, batasLangkah, bolehTulis } from './subagentStore';
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
import { useLsp } from './lspStore';
import { minimapDebug } from '../components/editor/Minimap';
import {
  LSP_SERVERS,
  effectiveSpec,
  pathToUri as pathToUriLsp,
  serverForPath as serverForPathLsp,
} from './lsp';

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

  w.__ZEPHYR_PTY__ = {
    write: ptyWrite,
    interrupt: ptyInterrupt,
    list: ptyList,
    read: (id: string, lines?: number) => readBuffer(id, lines ?? 200),
    selection: (id: string) => getSelection(id),
    ids: () => activeIds(),
    size: (id: string) => termSize(id),

    selectText: (id: string, text: string) => {
      const row = findRow(id, text);
      return row >= 0 && selectLine(id, row);
    },
    select: (id: string, line: number) => selectLine(id, line),

    copy: (id: string) => copySelection(id),
    paste: (id: string) => pasteInto(id),
    clipRead: () => clipboardRead(),
    clipWrite: (t: string) => clipboardWrite(t),

    agents: () => listAgents(),
  };
  w.__ZEPHYR_CMD__ = (name: CmdName) => {
    const view = getActiveView();
    if (!view) return false;
    return name === 'undo' ? undo(view) : redo(view);
  };

  w.__ZEPHYR_SET__ = {
    ui: useSettingsUi,

    activeTheme: () => document.documentElement.dataset.theme ?? '',
    themes: () => THEMES.map((t) => t.id),

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

    settingsFromDisk: () => getSettings(),

    t: (key: string) => translate(useStore.getState().settings.general.uiLang, key),
  };

  w.__ZEPHYR_AI__ = {
    store: useAi,

    catalog: () => ALL_MODELS.map((m) => ({ id: m.id, provider: m.provider, logo: m.logo, baseUrl: m.baseUrl })),

    destructive: (cmdText: string) => isDestructive(cmdText),

    command: (md: string) => extractCommand(md),

    send: (text: string) => useAi.getState().send(text),
    cancel: () => useAi.getState().cancel(),

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

    persisted: () => localStorage.getItem('zephyr.ai.sessions.v1'),

    effort: () => useAi.getState().reasoningEffort,

    setEffort: (e: 'minimal' | 'low' | 'medium' | 'high' | 'ultra' | null) =>
      useAi.getState().setReasoningEffort(e),

    reasoning: () =>
      (useAi.getState().activeSession()?.messages ?? [])
        .filter((m) => m.reasoning)
        .map((m) => ({ id: m.id, teks: m.reasoning ?? '' })),

    injectAssistant: (text: string, reasoning: string) => {
      const st = useAi.getState();
      const sid = st.activeId ?? st.newChat();
      const id = `uji-${Date.now().toString(36)}`;
      useAi.setState((s0) => ({
        sessions: s0.sessions.map((sess) =>
          sess.id === sid
            ? {
                ...sess,
                messages: [
                  ...sess.messages,
                  { id, role: 'assistant' as const, content: text, reasoning, at: Date.now() },
                ],
              }
            : sess,
        ),
      }));
      return id;
    },
    maxMsgs: MAX_MSGS,
  };

  w.__ZEPHYR_GIT__ = {
    store: useGit,
    status: () => useGit.getState().status,
    refresh: () => useGit.getState().refreshAll(),

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

    confirm: () => useGit.getState().confirm,
    setConfirm: (c: unknown) => useGit.getState().setConfirm(c as never),
    resolveConfirm: () => useGit.getState().resolveConfirm(),
    error: () => useGit.getState().scmError,
    info: () => useGit.getState().scmInfo,
    busy: () => useGit.getState().busy,

    gh: () => useGit.getState().gh,
    ghMessage: () => useGit.getState().ghMessage,
    loadGh: () => useGit.getState().loadGh(),
    savePat: (t: string) => useGit.getState().savePat(t),
    logoutGh: () => useGit.getState().logoutGh(),
    testGh: () => useGit.getState().testGh(),
    setClientId: (id: string) => useGit.getState().setClientId(id),
  };

  w.__ZEPHYR_MCP__ = {
    store: useMcp,
    status: () => useMcp.getState().status,
    log: () => useMcp.getState().log,
    toast: () => useMcp.getState().toast,
    setToast: (m: string | null) => useMcp.getState().setToast(m),
    clearLog: () => useMcp.getState().clearLog(),
    refresh: () => useMcp.getState().refresh(),

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

  w.__ZEPHYR_CP__ = {
    store: usePalette,
    open: (mode: 'command' | 'file') => usePalette.getState().openPalette(mode),
    close: () => usePalette.getState().close(),
    setQuery: (q: string) => usePalette.getState().setQuery(q),
    move: (d: number) => usePalette.getState().move(d),
    accept: (i?: number) => usePalette.getState().accept(i),

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

    commands: () => COMMANDS.map((c) => ({ id: c.id, title: c.title, group: c.group })),

    available: () =>
      availableCommands().map((c) => ({ id: c.id, title: c.title, group: c.group })),

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

        if (!r.binding) continue;
        seen.set(r.binding, [...(seen.get(r.binding) ?? []), r.id]);
      }
      const conflicts = [...seen.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([binding, ids]) => ({ binding, ids }));
      return { rows, conflicts };
    },
  };

  w.__ZEPHYR_EXT__ = {
    store: useExtensions,
    list: () => useExtensions.getState().list,
    refresh: () => useExtensions.getState().refresh(),
    toggle: (id: string, on: boolean) => useExtensions.getState().toggle(id, on),
    load: (id: string) => useExtensions.getState().load(id),

    loadRaw: (id: string) => extensionsLoad(id),
    addPath: (p: string) => useExtensions.getState().addPath(p),
    remove: (id: string) => useExtensions.getState().remove(id),
    folder: () => extensionsFolder(),
    error: () => useExtensions.getState().extError,
    info: () => useExtensions.getState().extInfo,
    setError: (m: string | null) => useExtensions.getState().setError(m),
    market: (open: boolean) => useExtensions.getState().setMarketOpen(open),

    extCommands: () => extensionCommands().map((c) => ({ id: c.id, title: c.title, group: c.group })),
  };
  w.__ZEPHYR_THEME__ = {
    active: () => document.documentElement.dataset.theme ?? '',

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

    token: (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),

    tokens: (names: string[]) => {
      const css = getComputedStyle(document.documentElement);
      const out: Record<string, string> = {};
      for (const n of names) out[n] = css.getPropertyValue(n).trim();
      return out;
    },

    termTheme: (id: string) => {
      const t = termOptionsTheme(id);
      return t ? { background: t.background, red: t.red, green: t.green, black: t.black } : null;
    },
    retheme: () => retheme(),
    systemDark: () => systemPrefersDark(),
  };

  w.__ZEPHYR_WIN__ = {
    close: () => getCurrentWindow().close(),
    destroy: () => getCurrentWindow().destroy(),
  };

  w.__ZEPHYR_DIAG__ = {

    get: () => getDiagnostics(),

    log: (level: 'error' | 'warn' | 'info', msg: string) => logFrontend(level, msg),
    mark: (name: string, durMs?: number) => perfMark(name, durMs),

    panic: () => debugPanic(),

    write: (path: string, content: string) => fsWrite(path, content),

    read: (path: string) => fsRead(path),

    spawn: (id: string, cwd: string) => ptySpawn({ id, kind: 'shell', cwd }),
    kill: (id: string) => ptyKill(id),

    maxLoadedTabs: MAX_LOADED_TABS,

    tabs: () =>
      useStore.getState().tabs.map((t) => ({
        id: t.id,
        name: t.name,
        loaded: t.loaded !== false,
        bytes: t.content.length,
        unsaved: t.unsaved,
      })),

    heldChars: () => useStore.getState().tabs.reduce((n, t) => n + t.content.length, 0),
    unload: () => useStore.getState().unloadColdTabs(),
    ensure: (id: string) => useStore.getState().ensureTabLoaded(id),

    git: {
      status: () => gitStatus(),
      stage: (paths: string[]) => gitStage(paths),
      commit: (msg: string) => gitCommit(msg),
      log: (n?: number) => gitLog(n ?? 5),
      progress: () => useGit.getState().progress,
    },

    crashVisible: () => !!document.querySelector('[data-testid="crash-dialog"]'),
    crashMessage: () =>
      document.querySelector('[data-testid="crash-message"]')?.textContent ?? null,
  };

  w.__ZEPHYR_BUG__ = {

    read: (path: string) => fsRead(path),

    write: (
      path: string,
      content: string,
      opts?: { wasExisting?: boolean; allowMissing?: boolean },
    ) => fsWrite(path, content, undefined, undefined, opts),

    tabs: () =>
      useStore.getState().tabs.map((t) => ({
        id: t.id,
        name: t.name,
        path: t.path,
        encoding: t.encoding,
        readOnly: t.readOnly === true,
        note: t.note ?? '',
        bytes: t.bytes ?? 0,

        held: t.content.length,
        loaded: t.loaded !== false,
        unsaved: t.unsaved,
        existed: t.existed === true,
      })),

    saveIssue: () => useStore.getState().saveIssue,
    resolveSave: (choice: 'ok' | 'cancel') => useStore.getState().resolveSaveIssue(choice),
    save: (id: string) => useStore.getState().saveTab(id),

    cmEditable: () => {
      const v = getActiveView();
      return v ? { editable: v.state.facet(EditorView.editable), lines: v.state.doc.lines } : null;
    },

    writeChunked: (id: string, data: string) => writeChunked(id, data),

    panes: () =>
      useTerminal.getState().allPanes().map((p) => ({
        id: p.id,
        kind: p.kind,
        status: p.status,
        exitCode: p.exitCode ?? null,
      })),

    diffRaw: (path: string, staged = false) => gitDiff(path, staged),

    commitRaw: (msg: string) => gitCommit(msg),
    branchRaw: (name: string) => gitCreateBranch(name),

    aiLimits: () => ({ msg: MSG_LIMIT, attach: ATTACH_LIMIT, maxMsgs: MAX_MSGS }),

    aiTruncated: () => useAi.getState().lastTruncated,

    narrow: () => document.body.classList.contains('is-narrow'),

    ramText: () =>
      document.querySelector('[data-testid="sb-ram"]')?.textContent?.trim() ?? null,

    cpRendered: () => document.querySelectorAll('[data-testid="cp-row"]').length,

    resize: (w: number, h: number) => setWindowSize(w, h),

    brokenConfig: () => takeBrokenConfig(),

    maxTabs: () => maxLoadedTabs(),

    openWs: (p: string) => workspaceOpen(p),
  };

  w.__ZEPHYR_NOTIF__ = {
    store: useNotif,
    notify: (n: Parameters<ReturnType<typeof useNotif.getState>['notify']>[0]) =>
      useNotif.getState().notify(n),
    update: (id: string, patch: Record<string, unknown>) =>
      useNotif.getState().update(id, patch as never),
    progress: (id: string, v: number | 'indeterminate') => useNotif.getState().progress(id, v),
    dismiss: (id: string) => useNotif.getState().dismiss(id),
    clear: () => useNotif.getState().clear(),

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

    toasts: () => useNotif.getState().toasts,
    unread: () => useNotif.getState().items.filter((x) => !x.read).length,
    dnd: () => useNotif.getState().dnd,
    setDnd: (v: boolean) => useNotif.getState().setDnd(v),
    center: (open: boolean) => useNotif.getState().setCenterOpen(open),
    centerOpen: () => useNotif.getState().centerOpen,
    markAllRead: () => useNotif.getState().markAllRead(),

    run: (id: string) => runCommand(id),

    askDelete: (paths: string[]) => useExplorer.getState().askDelete(paths),
    pendingDelete: () => useExplorer.getState().pendingDelete,
    confirmDelete: () => useExplorer.getState().confirmDelete(),
    cancelDelete: () => useExplorer.getState().cancelDelete(),
  };

  w.__ZEPHYR_KB__ = {
    store: useKb,

    bindings: () =>
      useKb.getState().bindings.map((b) => ({
        chord: b.chord,
        command: b.command,
        when: b.when,
        layer: b.layer,
        label: b.label ?? null,
      })),

    chordFor: (command: string) => chordFor(command, useKb.getState().bindings),
    user: () => useKb.getState().user,

    remap: (command: string, chord: string, when?: string) =>
      useKb.getState().remap(command, chord, when as never),
    removeBinding: (command: string) => useKb.getState().removeBinding(command),
    resetOne: (command: string) => useKb.getState().resetOne(command),
    resetAll: () => useKb.getState().resetAll(),

    resolve: (seq: string) => useKb.getState().resolve(seq),
    isPrefix: (seq: string) => useKb.getState().isPrefix(seq),
    pending: () => useKb.getState().pending,
    setPending: (c: string) => useKb.getState().setPending(c),
    ctx: () => useKb.getState().ctx,
    setCtx: (key: string, on: boolean) => useKb.getState().setCtx(key as never, on),

    lastRun: () => useKb.getState().lastRun,
    setLastRun: (v: string | null) => useKb.getState().setLastRun(v),

    editor: (open: boolean) => useKb.getState().setEditorOpen(open),
    editorOpen: () => useKb.getState().editorOpen,

    conflicts: (command: string, chord: string, when = 'global') =>
      chordConflicts(command, chord, when as never, useKb.getState().bindings),

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

  w.__ZEPHYR_LAYOUT__ = {
    store: useLayoutCustom,
    state: () => useLayoutCustom.getState(),
    toggle: (k: string) => useLayoutCustom.getState().toggle(k as never),
    set: (b: unknown) => useLayoutCustom.getState().set(b as never),
    reset: () => useLayoutCustom.getState().reset(),
    menuBuka: () => useLayoutCustom.getState().menuBuka,
    setMenuBuka: (v: boolean) => useLayoutCustom.getState().setMenuBuka(v),
    simpan: () => useLayoutCustom.getState().simpan(),
    muat: () => useLayoutCustom.getState().muat(),
    baris: () => BARIS_LAYOUT.map((b) => ({ kunci: b.kunci, label: b.label })),
  };

  w.__ZEPHYR_SUB__ = {
    store: useSubAgent,
    MAX_PARALLEL,
    MAX_SUB_STEPS,
    agents: () => useSubAgent.getState().agents,
    jalankan: (tugas: string[]) => useSubAgent.getState().jalankan(tugas),
    batalSemua: () => useSubAgent.getState().batalSemua(),
    bersihkan: () => useSubAgent.getState().bersihkan(),
    ringkasan: () => useSubAgent.getState().ringkasan,
    sibuk: () => useSubAgent.getState().sibuk,
  };

  w.__ZEPHYR_SETUI__ = {
    store: useSettingsUi,
    section: () => useSettingsUi.getState().section,
    setSection: (id: string) => useSettingsUi.getState().setSection(id as never),
    sections: () => SECTION_ORDER.slice(),
  };

  w.__ZEPHYR_SHORTCUTS__ = {
    ACTIONS: ACTIONS,
    byId: (id: string) => ACTION_BY_ID.get(id as never),
    bindings: () => useStore.getState().settings.shortcuts,
  };

  w.__ZEPHYR_PERAN__ = {
    daftar: () => PERAN.map((p) => ({ id: p.id, label: p.label, butuhTulis: p.butuhTulis })),
    tebak: (tugas: string) => tebakPeran(tugas),
    prefix: (tugas: string) => peranDariPrefix(tugas),
    info: (id: string) => infoPeran(id),
  };

  w.__ZEPHYR_SETTINGS__ = {
    buka: (section: string) => {
      useStore.getState().setSettingsOpen(true);
      useSettingsUi.getState().setSection(section as never);
    },
    tutup: () => useStore.getState().setSettingsOpen(false),
    section: () => useSettingsUi.getState().section,
  };

  w.__ZEPHYR_SUBSET__ = {
    baca: () => useStore.getState().settings.subagent,

    set: (patch: Record<string, unknown>) =>
      useStore.getState().applySettings({ subagent: patch }),

    batasParalel: () => batasParalel(),
    batasLangkah: () => batasLangkah(),

    efektif: () => ({
      maxParallel: batasParalel(),
      maxSteps: batasLangkah(),
      allowWrite: bolehTulis(),
    }),
  };

  w.__ZEPHYR_PROMPT_LIB__ = {
    semua: () => allPrompts(),
    simpan: (items: PromptItem[]) => saveUserPrompts(items),
    cocok: (draft: string) => matchPrompts(draft),
  };

  w.__ZEPHYR_TODO__ = {

    tulis: async (todos: { content: string; status: string }[]) => {
      const { jalankanAgentTool } = await import('./agentTools');
      return jalankanAgentTool('todo_write', { todos });
    },
    baca: () => useAi.getState().agentTodos,
    bersih: () => useAi.getState().setAgentTodos([]),
  };

  w.__ZEPHYR_PROMPT__ = {

    system: (lang: string, konteks: string, aturan: string, model?: string, provider?: string) =>
      systemPromptFor(
        lang,
        konteks,
        aturan,
        model ?? useAi.getState().model,
        provider ?? useAi.getState().provider,
      ),
    aturanProyek: () => aturanProyek(),
    resetAturan: () => resetAturanProyek(),
    reminder: () => identityReminder(useAi.getState().model),
    blokModel: (provider?: string, model?: string) =>
      blokIdentitasModel(provider ?? useAi.getState().provider, model ?? useAi.getState().model),
    modelAktif: () => ({ provider: useAi.getState().provider, model: useAi.getState().model }),
  };

  w.__ZEPHYR_CLIAGENT__ = {
    store: useCliAgent,
    detect: (paksa = true) => useCliAgent.getState().detect(paksa),
    agents: () => useCliAgent.getState().agents,
    aktif: () => useCliAgent.getState().aktif,
    setAktif: (id: string | null) => useCliAgent.getState().setAktif(id),
    runs: () => useCliAgent.getState().runs,
    jalankan: (prompt: string, cwd?: string) => useCliAgent.getState().jalankan(prompt, cwd),
    sibuk: () => useCliAgent.getState().sibuk,
  };

  w.__ZEPHYR_PANEL__ = {
    store: usePanel,
    PANEL_TABS: PANEL_TABS,
    activeTab: () => usePanel.getState().activeTab,
    visibleTabs: () => usePanel.getState().visibleTabs.slice(),
    focusTab: (id: string) => usePanel.getState().focusTab(id as never),
    toggleTabVisible: (id: string) => usePanel.getState().toggleTabVisible(id as never),
    cycleTab: (d: 1 | -1) => usePanel.getState().cycleTab(d),
    menuOpen: (v: boolean) => usePanel.getState().setTabMenuOpen(v),
    hydrate: (vt?: string[], at?: string) => usePanel.getState().hydrate(vt, at),

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

    debugEval: (expr: string) => evaluateDebugExpr(expr),
  };

  w.__ZEPHYR_LSP__ = {
    store: useLsp,

    aktif: () => Object.keys(useLsp.getState().aktif),

    status: () => useLsp.getState().status(),

    docs: () =>
      Object.entries(useLsp.getState().docs).map(([path, d]) => ({
        path,
        serverId: d.serverId,
        version: d.version,
      })),
    ensureFor: (path: string) => useLsp.getState().ensureFor(path),
    openDoc: (path: string, text: string, lang: string) =>
      useLsp.getState().openDoc(path, text, lang),
    changeDoc: (path: string, text: string) => useLsp.getState().changeDoc(path, text),
    closeDoc: (path: string) => useLsp.getState().closeDoc(path),
    req: (path: string, method: string, params: Record<string, unknown>) =>
      useLsp.getState().req(path, method, params),
    stop: (id: string) => useLsp.getState().stop(id),
    stopAll: () => useLsp.getState().stopAll(),
    reap: () => useLsp.getState().reap(),
    setIdle: (id: string, secs: number) => useLsp.getState().setIdle(id, secs),
    probeAll: () => useLsp.getState().probeAll(),
    probe: () => useLsp.getState().probe,
    error: () => useLsp.getState().lspError,

    katalog: () =>
      LSP_SERVERS.map((d) => ({
        id: d.id,
        langs: d.langs,
        ext: d.extensions,
        spec: effectiveSpec(d, useLsp.getState().settings()),
      })),
    serverForPath: (p: string) => serverForPathLsp(p)?.id ?? null,

    definition: async (path: string) => {
      const { lspDefinition } = await import('./lspCm');
      const view = getActiveView();
      if (!view) return null;
      return lspDefinition(path, view, view.state.selection.main.head);
    },
    references: async (path: string) => {
      const { lspReferences } = await import('./lspCm');
      const view = getActiveView();
      if (!view) return [];
      return lspReferences(path, view, view.state.selection.main.head);
    },
    hover: async (path: string) => {
      const view = getActiveView();
      if (!view) return null;
      const { offsetToLsp } = await import('./lspCm');
      const { hoverText } = await import('./lsp');
      const res = (await useLsp
        .getState()
        .req(path, 'textDocument/hover', {
          textDocument: { uri: pathToUriLsp(path) },
          position: offsetToLsp(view, view.state.selection.main.head),
        })) as { contents?: unknown } | null;
      return res ? hoverText(res.contents) : null;
    },
    completion: async (path: string) => {
      const view = getActiveView();
      if (!view) return [];
      const { offsetToLsp } = await import('./lspCm');
      const res = await useLsp.getState().req(path, 'textDocument/completion', {
        textDocument: { uri: pathToUriLsp(path) },
        position: offsetToLsp(view, view.state.selection.main.head),
        context: { triggerKind: 1 },
      });
      const items = Array.isArray(res) ? res : ((res as { items?: unknown[] })?.items ?? []);
      return (items as Record<string, unknown>[]).slice(0, 40).map((i) => String(i.label ?? ''));
    },
    symbols: async (path: string) => {
      const { lspDocumentSymbols } = await import('./lspCm');
      const res = await lspDocumentSymbols(path);
      return res.map((r) => String((r as Record<string, unknown>).name ?? ''));
    },
    format: async (path: string) => {
      const { lspFormat } = await import('./lspCm');
      const view = getActiveView();
      if (!view) return 0;
      const ed = useStore.getState().settings.editor;
      return lspFormat(path, view, ed.tabSize, ed.insertSpaces);
    },
    rename: async (path: string, baru: string) => {
      const { lspRename } = await import('./lspCm');
      const view = getActiveView();
      if (!view) return null;
      return lspRename(path, view, view.state.selection.main.head, baru);
    },

    goto: (line: number, col: number) => {
      const view = getActiveView();
      if (!view) return false;
      const l = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
      const pos = Math.min(l.from + Math.max(col - 1, 0), l.to);
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      return true;
    },

    squiggles: () => ({
      total: document.querySelectorAll('.cm-zdiag').length,
      error: document.querySelectorAll('.cm-zdiag-error').length,
      warning: document.querySelectorAll('.cm-zdiag-warning').length,
    }),
  };

  w.__ZEPHYR_EXTRAS__ = {

    ada: () => ({
      breadcrumbs: !!document.querySelector('[data-testid="breadcrumbs"]'),
      minimap: !!document.querySelector('[data-testid="minimap"]'),
      sticky: !!document.querySelector('[data-testid="sticky-scroll"]'),
      findBar: !!document.querySelector('[data-testid="find-bar"]'),
    }),

    hitung: () => ({
      indentGuide: document.querySelectorAll('.cm-zig').length,
      bracket: document.querySelectorAll('.cm-zbr').length,
      swatch: document.querySelectorAll('[data-testid="color-swatch"]').length,
      unicode: document.querySelectorAll('[data-testid="unicode-warn"]').length,
      stickyRow: document.querySelectorAll('[data-testid="sticky-row"]').length,
      bcPath: document.querySelectorAll('[data-testid="bc-path-seg"]').length,
      bcSym: document.querySelectorAll('[data-testid="bc-sym-seg"]').length,
      minimapCanvas: document.querySelectorAll('[data-testid="minimap-canvas"]').length,
      cmLine: document.querySelectorAll('.cm-line').length,
    }),

    warnaBracket: () =>
      [0, 1, 2, 3, 4, 5].map((i) => {
        const el = document.querySelector(`.cm-zbr-${i}`);
        return el ? getComputedStyle(el).color : null;
      }),

    swatchPertama: () => {
      const el = document.querySelector('[data-testid="color-swatch"]');
      if (!el) return null;
      const inp = el.querySelector('[data-testid="color-input"]') as HTMLInputElement | null;
      return {
        warna: el.getAttribute('data-color'),
        bg: getComputedStyle(el).backgroundColor,
        adaInput: !!inp,
        nilaiInput: inp?.value ?? null,
      };
    },

    ubahWarna: (hex: string) => {
      const el = document.querySelector('[data-testid="color-swatch"]');
      const inp = el?.querySelector('[data-testid="color-input"]') as HTMLInputElement | null;
      if (!inp) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(inp, hex);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },

    stickyTeks: () =>
      [...document.querySelectorAll('[data-testid="sticky-row"]')].map((el) => ({
        line: el.getAttribute('data-line'),
        teks: (el.textContent ?? '').trim().slice(0, 60),
      })),

    breadcrumbs: () => ({
      path: [...document.querySelectorAll('[data-testid="bc-path-seg"]')].map((e) =>
        (e.textContent ?? '').replace(/›/g, '').trim(),
      ),
      simbol: [...document.querySelectorAll('[data-testid="bc-sym-seg"]')].map(
        (e) => e.getAttribute('data-sym-name') ?? '',
      ),
      perkiraan: !!document.querySelector('[data-testid="bc-approx"]'),
    }),

    bukaDropdown: (n = 0) => {
      const el = document.querySelectorAll('[data-testid="bc-sym-seg"]')[n] as
        | HTMLButtonElement
        | undefined;
      if (!el) return false;
      el.click();
      return true;
    },
    dropdownItems: () =>
      [...document.querySelectorAll('[data-testid="bc-dropdown-item"]')].map((e) =>
        (e.textContent ?? '').trim(),
      ),

    minimapViewport: () => {
      const el = document.querySelector('[data-testid="minimap-viewport"]') as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { transform: s.transform, height: s.height };
    },

    minimapDebug: () => ({ ...minimapDebug }),

    simbol: async () => {
      const { pohonSimbol } = await import('./symbolTree');
      const view = getActiveView();
      const path = useStore.getState().tabs.find((t) => t.id === useStore.getState().activeTabId)
        ?.path;
      if (!view) return null;
      const r = await pohonSimbol(path ?? undefined, view.state);
      const ringkas = (n: unknown[]): unknown[] =>
        n.map((x) => {
          const o = x as { nama: string; kind: number; dari: number; sampai: number; anak: unknown[] };
          return { nama: o.nama, kind: o.kind, dari: o.dari, sampai: o.sampai, anak: ringkas(o.anak) };
        });
      return { punyaLsp: r.punyaLsp, pohon: ringkas(r.pohon) };
    },
  };

  w.__ZEPHYR_EXT19__ = {
    store: () => useExt19,
    state: () => useExt19.getState(),
    refresh: () => useExt19.getState().refresh(),

    terpasang: () =>
      useExt19
        .getState()
        .terpasang()
        .map((m) => ({
          id: m.manifest!.id,
          nama: m.manifest!.name,
          versi: m.manifest!.version,
          enabled: m.enabled,
          tercatat: m.tercatat,
          path: m.path,
          manifestFile: m.manifest!.manifestFile,
          engineOk: m.manifest!.engineOk,
          kontribusi: {
            themes: m.manifest!.contributes.themes.map((t) => t.label),
            keymaps: m.manifest!.contributes.keymaps.length,
            snippets: m.manifest!.contributes.snippets.map((s) => s.language),
            languages: m.manifest!.contributes.languages.map((l) => l.id),
            iconThemes: m.manifest!.contributes.iconThemes.length,
            commands: m.manifest!.contributes.commands.map((c) => c.id),
          },
        })),
    rusak: () =>
      useExt19
        .getState()
        .rusak()
        .map((m) => ({ path: m.path, error: m.error })),
    hasil: () => useExt19.getState().hasil().map((x) => x.id),
    install: (p: string) => useExt19.getState().install(p),
    installKatalog: (id: string) => {
      const it = KATALOG_BUNDLED.find((x) => x.id === id);
      if (!it) return Promise.resolve(false);
      return useExt19.getState().installKatalog(it);
    },
    uninstall: (id: string) => useExt19.getState().uninstall(id),
    setEnabled: (id: string, on: boolean) => useExt19.getState().setEnabled(id, on),
    setQ: (q: string) => useExt19.getState().setQ(q),
    setTab: (t: 'installed' | 'recommended' | 'marketplace') => useExt19.getState().setTab(t),
    setDetail: (id: string | null) => useExt19.getState().setDetail(id),
    setRemoteUrl: (url: string) => useExt19.setState({ remoteUrl: url }),
    muatRemote: () => useExt19.getState().muatRemote(),

    ringkasan: () => ringkasanLoader(),
    muatSemua: () => muatSemuaEkstensi(),
    themesEkstensi: () =>
      themesEkstensi().map((t) => ({ id: t.id, label: t.label, kind: t.kind })),
    keymapEkstensi: () => keymapEkstensi(),
    bahasaEkstensi: () => bahasaEkstensi(),
    jumlahSnippet: () => jumlahSnippet(),
    adaSnippet: (l: string) => adaSnippet(l),
    adaIconTheme: () => adaIconTheme(),
    ikonUntukExt: (e: string) => ikonUntukExt(e),

    commandsDiPalette: () =>
      availableCommands()
        .filter((c) => c.id.startsWith('ext.'))
        .map((c) => c.id),
    bahasaWorkspace: () => getBahasaWorkspace(),

    semuaTema: () => semuaTema().map((t) => t.id),

    tokenAktif: (nama: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(nama).trim(),
    extTheme: () => document.documentElement.dataset.extTheme ?? null,

    bahasaUntukFile: async (nama: string) => {
      const r = await extensiUntukFile(nama);
      return { langId: r.langId, dariEkstensi: r.dariEkstensi, jmlExt: r.ext.length };
    },
    labelBahasa: (nama: string) => labelBahasa(nama),

    chord: (command: string) => chordFor(command, useKb.getState().bindings),
    sumberChord: (command: string) =>
      useKb.getState().bindings.find((b) => b.command === command)?.source ?? null,
  };

  w.__ZEPHYR_TASK__ = {
    store: () => useTasks,
    state: () => useTasks.getState(),
    muat: (root?: string) => useTasks.getState().muat(root),

    daftar: () =>
      useTasks
        .getState()
        .daftar()
        .map((t) => ({
          label: t.label,
          kind: t.kind,
          command: t.command,
          group: t.group,
          isDefault: t.isDefault,
          matchers: t.problemMatchers,
          dependsOn: t.dependsOn,
          dependsOrder: t.dependsOrder,
          isBackground: t.isBackground,
          reveal: t.reveal,
          cwd: t.cwd,
        })),

    errors: () => useTasks.getState().file?.errors ?? [],
    path: () => useTasks.getState().file?.path ?? '',
    buildDefault: () => useTasks.getState().buildDefault()?.label ?? null,
    jalankan: (label: string) => useTasks.getState().jalankan(label),
    jalankanBuild: () => useTasks.getState().jalankanBuild(),
    hentikan: (runId: string) => useTasks.getState().hentikan(runId),
    hentikanSemua: () => useTasks.getState().hentikanSemua(),
    runs: () =>
      useTasks.getState().runs.map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status,
        exitCode: r.exitCode,
        pid: r.pid,
        lines: r.lines,
      })),
    runsAktif: () => useTasks.getState().runsAktif().length,
    recent: () => useTasks.getState().recent,

    siap: (runId: string) => useTasks.getState().ready[runId] === true,

    output: (label: string) => useOutput.getState().lines(`task:${label}`),
    channels: () => useOutput.getState().list().map((c) => c.id),

    problems: (label?: string) =>
      useProblems
        .getState()
        .all()
        .filter((d) => (label ? d.source === `task:${label}` : d.source.startsWith('task:')))
        .map((d) => ({
          file: d.file,
          line: d.line,
          column: d.column,
          severity: d.severity,
          message: d.message,
          code: d.code ?? '',
          source: d.source,
        })),

    ports: () =>
      usePorts
        .getState()
        .list()
        .map((p) => ({
          hostPort: p.hostPort,
          protocol: p.protocol,
          source: p.source,
          process: p.process,
          status: p.status,
        })),
    hapusPorts: () => usePorts.getState().clear(),

    matchLine: (matcher: string, line: string, root?: string) =>
      tasksMatchLineCmd(matcher, line, root),
    detectPort: (line: string) => tasksDetectPortCmd(line),
    matchers: () => tasksMatchersCmd(),

    commandsDiPalette: () =>
      availableCommands()
        .filter((c) => c.id.startsWith('task.') || c.id.startsWith('tasks.'))
        .map((c) => c.id),
  };

  w.__ZEPHYR_HIST__ = {
    store: () => useHistory,
    state: () => useHistory.getState(),
    muat: (f: string) => useHistory.getState().muat(f),

    snapshot: (f: string, reason?: 'save' | 'manual' | 'before-rename' | 'before-restore') =>
      useHistory.getState().snapshotSave(f, reason ?? 'manual'),

    snapshotRaw: (f: string, reason: string, maks?: number, hari?: number) =>
      cmdHistorySnapshot(
        f,
        reason as 'save' | 'manual' | 'before-rename' | 'before-restore',
        maks,
        hari,
      ),
    list: (f: string) => cmdHistoryList(f),
    read: (f: string, id: string) => cmdHistoryRead(f, id),
    prune: (f: string, maks: number, hari: number) => cmdHistoryPrune(f, maks, hari),
    clear: (f: string) => useHistory.getState().bersihkan(f),
    stats: () => cmdHistoryStats(),

    timeline: () =>
      useHistory.getState().timeline.map((t) => ({
        kind: t.kind,
        id: t.id,
        label: t.label,
        reason: t.reason ?? null,
        size: t.size ?? null,
        ts: t.timestampMs,
      })),
    snapshots: () => useHistory.getState().info?.snapshots.length ?? 0,
    skip: () => useHistory.getState().info?.skip ?? '',
    dir: () => useHistory.getState().info?.dir ?? '',
    file: () => useHistory.getState().file,
    pilih: (id: string | null) => useHistory.getState().pilih(id),
    isiSnapshot: () => useHistory.getState().isiSnapshot,
    restore: (id: string) => useHistory.getState().restore(id),

    diff: () => {
      const d = useGit.getState().diff;
      return d ? { path: d.path, teks: d.text } : null;
    },
    tutupDiff: () => useGit.getState().closeDiff(),

    commandsDiPalette: () =>
      availableCommands()
        .filter((c) => c.id.startsWith('timeline.'))
        .map((c) => c.id),
  };

  w.__ZEPHYR_SRC__ = {
    store: () => useSearch,
    state: () => useSearch.getState(),

    rg: () => useSearch.getState().rg,
    cekRg: () => useSearch.getState().cekRg(),
    setQuery: (q: string) => useSearch.getState().setQuery(q),
    setReplaceWith: (r: string) => useSearch.getState().setReplaceWith(r),
    setInclude: (g: string) => useSearch.getState().setInclude(g),
    setExclude: (g: string) => useSearch.getState().setExclude(g),
    setMaxResults: (n: number) => useSearch.getState().setMaxResults(n),

    setRoot: (p: string) => useSearch.getState().setRoot(p),

    setFlag: (f: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      respectGitignore?: boolean;
      includeHidden?: boolean;
    }) => useSearch.setState(f),
    jalankan: () => useSearch.getState().jalankan(),
    batalkan: () => useSearch.getState().batalkan(),
    bersihkan: () => useSearch.getState().bersihkan(),

    summary: () => useSearch.getState().summary,
    total: () => useSearch.getState().total,
    error: () => useSearch.getState().error,
    running: () => useSearch.getState().running,

    grup: () =>
      useSearch.getState().grup.map((g) => ({
        path: g.path,
        n: g.hits.length,
        terbuka: g.terbuka,
        baris: g.hits.slice(0, 3).map((h) => h.line),
      })),

    hit: (i: number) => useSearch.getState().semuaHit()[i] ?? null,
    jumlahHit: () => useSearch.getState().semuaHit().length,
    bukaHit: (i: number) => {
      const h = useSearch.getState().semuaHit()[i];
      return h ? useSearch.getState().bukaHit(h) : Promise.resolve();
    },
    lompat: (d: number) => useSearch.getState().lompat(d),
    indeksAktif: () => useSearch.getState().indeksAktif,
    riwayat: () => useSearch.getState().riwayat,
    replaceSatuFile: (p: string) => useSearch.getState().replaceSatuFile(p),
    replaceSemua: () => useSearch.getState().replaceSemua(),
    undoReplace: () => useSearch.getState().undoReplace(),
    replaceTerakhir: () =>
      (useSearch.getState().replaceTerakhir ?? []).map((h) => ({
        path: h.path,
        jumlah: h.jumlah,
        adaSnapshot: h.snapshot !== '',
        error: h.error,
      })),
    setReplaceTerbuka: (v: boolean) => useSearch.getState().setReplaceTerbuka(v),

    domHit: () => document.querySelectorAll('[data-testid="sr-hit"]').length,
    domFile: () => document.querySelectorAll('[data-testid="sr-file"]').length,
    tinggiSpacer: () => {
      const el = document.querySelector<HTMLElement>('[data-testid="sr-spacer"]');
      return el ? Math.round(el.getBoundingClientRect().height) : 0;
    },

    gulir: (y: number) => {
      const el = document.querySelector<HTMLElement>('[data-testid="sr-results"]')
        ?? document.querySelector<HTMLElement>('.search-results');
      if (!el) return -1;
      el.scrollTop = y;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
      return el.scrollTop;
    },

    sorotan: (i: number) => {
      const baris = document.querySelectorAll('[data-testid="sr-hit"]')[i];
      if (!baris) return [];
      return [...baris.querySelectorAll('mark')].map((m) => m.textContent ?? '');
    },
  };

  w.__ZEPHYR_DBG__ = {
    store: () => useDebug,
    state: () => useDebug.getState(),

    status: () => useDebug.getState().state,
    alasanStop: () => useDebug.getState().alasanStop,
    error: () => useDebug.getState().error,
    caps: () => useDebug.getState().caps,

    muatLaunch: () => useDebug.getState().muatLaunch(),
    muatAdapters: () => useDebug.getState().muatAdapters(),
    launch: () => useDebug.getState().launch,
    adapters: () => useDebug.getState().adapters,
    pilihConfig: (n: string) => useDebug.getState().pilihConfig(n),
    configTerpilih: () => useDebug.getState().configTerpilih,

    toggleBreakpoint: (p: string, l: number) => useDebug.getState().toggleBreakpoint(p, l),
    breakpoints: () =>
      useDebug.getState().breakpoints.map((b) => ({
        path: b.path,
        line: b.line,
        verified: b.verified,
        enabled: b.enabled,
      })),
    hapusSemuaBreakpoint: () => useDebug.getState().hapusSemuaBreakpoint(),

    start: (n?: string) => useDebug.getState().start(n),
    stop: () => useDebug.getState().stop(),
    restart: () => useDebug.getState().restart(),
    kontrol: (a: 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause') =>
      useDebug.getState().kontrol(a),

    threads: () => useDebug.getState().threads,
    frames: () =>
      useDebug.getState().frames.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        line: f.line,
        column: f.column,
      })),
    frameTerpilih: () => useDebug.getState().frameTerpilih,
    pilihFrame: (id: number) => useDebug.getState().pilihFrame(id),
    scopes: () => useDebug.getState().scopes,

    vars: (ref: number) => useDebug.getState().variables[ref] ?? [],
    expandVariable: (ref: number) => useDebug.getState().expandVariable(ref),
    setVariable: (ref: number, n: string, v: string) =>
      useDebug.getState().setVariable(ref, n, v),

    cariVar: (nama: string) => {
      const st = useDebug.getState();
      for (const ref of Object.keys(st.variables)) {
        const v = st.variables[Number(ref)].find((x) => x.name === nama);
        if (v) return { name: v.name, value: v.value, type: v.type, ref: v.variablesReference };
      }
      return null;
    },

    watch: () => useDebug.getState().watch,
    tambahWatch: (e: string) => useDebug.getState().tambahWatch(e),
    hapusWatch: (e: string) => useDebug.getState().hapusWatch(e),

    repl: () => useDebug.getState().repl,
    evalRepl: (e: string) => useDebug.getState().evalRepl(e),
    bersihkanRepl: () => useDebug.getState().bersihkanRepl(),

    barisAktif: () => useDebug.getState().barisAktif,
    loadedSources: () => useDebug.getState().loadedSources,

    domBp: () => document.querySelectorAll('.cm-bp-marker').length,
    domBpVerified: () => document.querySelectorAll('.cm-bp-marker.is-verified').length,

    domBarisAktif: () => document.querySelectorAll('.cm-baris-aktif').length,

    ctxDebugActive: () => useKb.getState().ctx.includes('debugActive'),
  };

  w.__ZEPHYR_CLI__ = {
    store: () => useCli,
    state: () => useCli.getState(),

    terakhir: () => useCli.getState().terakhir,
    jumlahJalan: () => useCli.getState().jumlahJalan,
    menunggu: () => useCli.getState().menunggu,
    bersihkan: () => useCli.getState().bersihkan(),

    parse: (argv: string[], cwd: string) => cliParse(argv, cwd),

    jalankan: (args: CliArgs) => useCli.getState().jalankan(args),

    teks: (mode: 'help' | 'version' | 'banner', warna: boolean, kolom?: number) =>
      cliTeks(mode, warna, kolom),

    waitBuat: (token: string) => cliWaitBuat(token),
    waitAktif: (token: string) => cliWaitAktif(token),
    waitSelesai: (token: string) => cliWaitSelesai(token),
    lepasWait: (path: string) => useCli.getState().lepasWait(path),

    diff: () => {
      const d = useGit.getState().diff;
      return d ? { path: d.path, source: d.source, panjang: d.text.length, teks: d.text } : null;
    },
    tutupDiff: () => useGit.getState().closeDiff(),
  };

  w.__ZEPHYR_WS__ = {
    store: () => useWs,
    state: () => useWs.getState(),
    muat: () => useWs.getState().muat(),

    roots: () => useWs.getState().roots,
    activeRoot: () => useWs.getState().activeRoot,
    file: () => useWs.getState().file,
    trusted: () => useWs.getState().trusted,
    alasan: () => useWs.getState().alasan,
    perluTanya: () => useWs.getState().perluTanya,

    tambahRoot: (p: string) => useWs.getState().tambahRoot(p),
    hapusRoot: (p: string) => useWs.getState().hapusRoot(p),
    jadikanAktif: (p: string) => useWs.getState().jadikanAktif(p),
    bukaFile: (p: string) => useWs.getState().bukaFile(p),
    simpanFile: (p: string) => useWs.getState().simpanFile(p),

    setTrust: (p: string, t: boolean) => useWs.getState().setTrust(p, t),
    lupakanTrust: (p: string) => useWs.getState().lupakanTrust(p),
    daftarTrust: () => useWs.getState().daftarTrust,
    muatDaftarTrust: () => useWs.getState().muatDaftarTrust(),
    tanya: (p: string | null) => useWs.getState().tanya(p),
    tanyaUntuk: () => useWs.getState().tanyaUntuk,

    settingsEfektif: (root?: string) => useWs.getState().settingsEfektif(root),
    asalNilai: (key: string, root?: string) => useWs.getState().asalNilai(key, root),
    setSettingsWorkspace: (patch: Record<string, unknown>) =>
      useWs.getState().setSettingsWorkspace(patch),
    bolehEksekusi: () => workspaceBolehEksekusiCmd(),

    domRoots: () => document.querySelectorAll('[data-testid="root-head"]').length,
    domRootPaths: () =>
      [...document.querySelectorAll('.root-section')].map((el) =>
        el.getAttribute('data-root') || '',
      ),

    domTrees: () =>
      [...document.querySelectorAll('.tree[data-root]')].map((el) => ({
        root: el.getAttribute('data-root') || '',
        baris: el.querySelectorAll('.tree-row').length,
      })),
    domBanner: () => {
      const el = document.querySelector('[data-testid="restricted-banner"]');
      return el ? (el.querySelector('.rb-text')?.textContent ?? '') : null;
    },
    domDialog: () => {
      const el = document.querySelector('[data-testid="trust-dialog"]');
      if (!el) return null;
      return {
        path: el.querySelector('[data-testid="trust-path"]')?.textContent ?? '',
        adaYes: !!el.querySelector('[data-testid="trust-yes"]'),
        adaNo: !!el.querySelector('[data-testid="trust-no"]'),
        adaTutup: !!el.querySelector('[data-testid="trust-close"]'),
      };
    },
    klikBanner: () => {
      const b = document.querySelector('[data-testid="rb-manage"]') as HTMLButtonElement | null;
      b?.click();
      return !!b;
    },
    klikTrustYes: () => {
      const b = document.querySelector('[data-testid="trust-yes"]') as HTMLButtonElement | null;
      b?.click();
      return !!b;
    },
    klikTrustNo: () => {
      const b = document.querySelector('[data-testid="trust-no"]') as HTMLButtonElement | null;
      b?.click();
      return !!b;
    },

    mentahTask: (id: string) =>
      tasksRunCmd({
        id,
        label: 'uji-trust',
        kind: 'shell',
        command: 'cmd',
        args: ['/c', 'echo halo'],
      }),
    mentahDebug: () =>
      dapStartCmd(
        {
          name: 'uji-trust',

          type: 'node',
          request: 'launch',
          program: 'a.js',
        } as unknown as Parameters<typeof dapStartCmd>[0],
        [],
      ),
    mentahLsp: (root: string) =>
      lspStartCmd({ id: 'typescript', cmd: ['node', '--version'], lang: 'typescript' }, root, null),
    mentahExt: (id: string) => extensionsLoadCmd(id),

    matikanTask: (id: string) => tasksKillCmd(id),
  };

  w.__ZEPHYR_SNIP__ = {
    store: () => useSnip,
    state: () => useSnip.getState(),
    muat: (lang: string, paksa = true) => useSnip.getState().muat(lang, paksa),

    untuk: (lang: string) => useSnip.getState().untuk(lang),
    bersihkanCache: () => useSnip.getState().bersihkanCache(),
    bukaFileUser: (lang: string) => useSnip.getState().bukaFileUser(lang),
    daftarUser: () => useSnip.getState().bahasaUser,

    terjemah: (body: string, konteks?: Partial<KonteksVar>) =>
      terjemahBody(body, {
        seleksi: '',
        path: 'D:/uji/a.ts',
        baris: '',
        nomorBaris: 1,
        clipboard: '',
        indent: '',
        ...(konteks ?? {}),
      }),

    variabel: (konteks?: Partial<KonteksVar>) =>
      nilaiVariabel({
        seleksi: '',
        path: 'D:/uji/a.ts',
        baris: '',
        nomorBaris: 1,
        clipboard: '',
        indent: '',
        ...(konteks ?? {}),
      }),

    sisip: async (lang: string, prefix: string) => {
      const v = getActiveView();
      if (!v) return 'tidak ada editor aktif';
      const S = useSnip.getState();
      if (S.untuk(lang).length === 0) await S.muat(lang);
      const s = S.untuk(lang).find((x) => x.prefix === prefix);
      if (!s) return `snippet '${prefix}' tidak ada untuk ${lang}`;
      const tab = useStore.getState().tabs.find((t) => t.id === useStore.getState().activeTabId);
      await sisipkanSnippet(v, s, tab?.path ?? '');
      return 'ok';
    },

    tabStop: (maju = true) => {
      const v = getActiveView();
      if (!v) return false;
      return maju ? nextSnippetFieldCm(v) : prevSnippetFieldCm(v);
    },
    keluarSnippet: () => {
      const v = getActiveView();
      return v ? clearSnippetCm(v) : false;
    },

    modeAktif: () => {
      const v = getActiveView();
      if (!v) return false;

      return v.dom.querySelectorAll('.cm-snippetField').length > 0;
    },
    jumlahField: () => {
      const v = getActiveView();
      return v ? v.dom.querySelectorAll('.cm-snippetField').length : 0;
    },
  };

  w.__ZEPHYR_A11Y__ = {
    store: () => useA11y,
    state: () => useA11y.getState(),

    umumkan: (teks: string, kesopanan?: 'polite' | 'assertive') =>
      useA11y.getState().umumkan(teks, kesopanan),
    riwayat: () => useA11y.getState().riwayat,
    bersihkan: () => useA11y.getState().bersihkan(),

    isiLive: () => ({
      polite: document.querySelector('[data-testid="a11y-live-polite"]')?.textContent ?? null,
      assertive:
        document.querySelector('[data-testid="a11y-live-assertive"]')?.textContent ?? null,
      politeAria: document
        .querySelector('[data-testid="a11y-live-polite"]')
        ?.getAttribute('aria-live'),
      assertiveAria: document
        .querySelector('[data-testid="a11y-live-assertive"]')
        ?.getAttribute('aria-live'),
    }),

    atribut: () => ({
      reducedMotion: document.documentElement.dataset.reducedMotion ?? null,
      screenReader: document.documentElement.dataset.screenReader ?? null,
      theme: document.documentElement.dataset.theme ?? null,
    }),
    osReducedMotion: () => osMintaReducedMotion(),

    setelan: () => useStore.getState().settings.accessibility ?? null,

    kontras: (varFg: string, varBg: string) => {
      const cs = getComputedStyle(document.documentElement);
      const parse = (v: string): [number, number, number] | null => {
        const s = cs.getPropertyValue(v).trim();
        const mh = /^#([0-9a-f]{6})$/i.exec(s);
        if (mh) {
          const n = parseInt(mh[1], 16);
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        const mr = /^rgba?\(([^)]+)\)$/i.exec(s);
        if (mr) {
          const p = mr[1].split(/[\s,/]+/).filter(Boolean).map(Number);
          if (p.length >= 3) return [p[0], p[1], p[2]];
        }
        return null;
      };
      const fg = parse(varFg);
      const bg = parse(varBg);
      if (!fg || !bg) return null;
      const lum = ([r, g, b]: [number, number, number]) => {
        const f = (x: number) => {
          const c = x / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const a = lum(fg);
      const b2 = lum(bg);
      return +((Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05)).toFixed(2);
    },

    dialogAktif: () =>
      [...document.querySelectorAll('[role="dialog"]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null || el.clientHeight > 0)
        .map((el) => ({
          label: el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby'),
          modal: el.getAttribute('aria-modal'),
          fokusabel: el.querySelectorAll(
            'button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
          ).length,
        })),

    fokus: () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid'),
        label: el.getAttribute('aria-label'),
        cls: el.className || null,
        teks: (el.textContent ?? '').trim().slice(0, 40),
        diDalamDialog: !!el.closest('[role="dialog"]'),
      };
    },

    fokuskan: (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    },

    tekanTab: (shift = false) => {
      const ev = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      });
      return document.dispatchEvent(ev);
    },
    tekanEscape: () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      ),

    axe: async (opsi?: Record<string, unknown>) => {
      const g = window as unknown as { axe?: { run: (ctx: unknown, o?: unknown) => Promise<unknown> } };
      if (!g.axe) return { err: 'axe belum disuntik' };
      return (await g.axe.run(document, opsi ?? {})) as unknown;
    },
  };

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
