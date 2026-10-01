import * as cmd from './commands';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useStore } from './store';
import { useTerminal } from './terminalStore';
import { usePanel, type PanelTabId } from './panelStore';
import { writeChunked } from './terminalClipboard';
import { runAction } from './mcpStore';
import { flushTab } from './editorRegistry';
import { pathSama } from './pathKey';
import type { AgentToolSpec } from './types';

import { resetKonteksAgent, useAi } from './aiStore';
export interface AgentTool {
  spec: AgentToolSpec;
  run: (args: Record<string, unknown>) => Promise<string>;
}

/*
 * Subsystem stores the tools below call into.
 *
 * They are imported as namespaces rather than as values because these stores
 * import `agentTools` (for the tool specs) while `agentTools` needs their
 * actions: a static value import would close that cycle. Reading them through
 * the module namespace defers the lookup until the tool actually runs, which is
 * long after both modules have finished loading.
 */
import * as testsApi from './testsStore';
import * as debugApi from './debugStore';
import * as lspApi from './lspStore';
import * as tasksApi from './tasksStore';
import { pathToUri } from './lsp';

export const AGENT_READ_LIMIT = 100 * 1024;

export const FILE_LIST_MAX = 300;

/*
 * How many search hits the agent sees in one call.
 *
 * A grep for a common word can return thousands of rows, and every one of them
 * is billed as prompt tokens on the next round trip. Sixty is enough to see the
 * shape of the result — the handful of files that matter and whether the query
 * is too broad — while keeping the answer readable; the tool tells the model how
 * many were held back so it can narrow the query instead of guessing.
 */
export const SEARCH_MAX = 60;

// Network commands are deliberately bounded so a mistaken URL request cannot
// occupy the agent loop for minutes while the model keeps waiting.
const NETWORK_COMMAND = /\b(invoke-webrequest|invoke-restmethod|curl|wget|fetch\s|git\s+(fetch|pull|clone)|npm\s+(install|view|outdated)|pnpm\s+(install|view|outdated)|yarn\s+(add|info)|pip\s+install)\b/i;
const NETWORK_TIMEOUT_MS = 30000;
function canonicalFilePath(value: string): string {
  const input = value.trim().replace(/\\/g, '/');
  const workspace = useStore.getState().workspace?.trim().replace(/\\/g, '/').replace(/\/+$/, '') ?? '';
  const absolute = /^([a-z]:\/|\/\/)/i.test(input);
  const joined = !absolute && workspace ? `${workspace}/${input}` : input;
  const drive = /^([a-z]:)(?:\/|$)/i.exec(joined)?.[1].toLowerCase() ?? '';
  const unc = joined.startsWith('//');
  const body = joined
    .replace(/^([a-z]:)(?:\/)?/i, '')
    .replace(/^\/\//, '')
    .split('/')
    .filter(Boolean);
  const parts: string[] = [];
  for (const part of body) {
    if (part === '.') continue;
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
    else if (part !== '..') parts.push(part);
  }
  const prefix = drive ? `${drive}/` : unc ? '//' : '';
  return `${prefix}${parts.join('/')}`.replace(/\/+$/, '').toLowerCase();
}

function openTabForPath(filePath: string) {
  const canonical = canonicalFilePath(filePath);
  return useStore.getState().tabs.find(
    (t) => t.path && (pathSama(t.path, filePath) || canonicalFilePath(t.path) === canonical),
  );
}

function assertOpenTabMatchesDisk(filePath: string, diskContent: string) {
  const tab = openTabForPath(filePath);
  if (tab?.unsaved && tab.content !== diskContent) {
    throw new Error(
      `Conflict: open tab ${tab.name} has unsaved changes that differ from disk; save or reload it before writing ${filePath}`,
    );
  }
  return tab;
}

async function resolveWriteTarget(filePath: string, incoming?: string): Promise<string> {
  const tab = openTabForPath(filePath);
  if (!tab?.path) return filePath;
  if (tab.unsaved && incoming !== undefined && tab.content !== incoming) {
    throw new Error(
      `Conflict: open tab ${tab.name} has unsaved changes; save or reload it before writing ${filePath}`,
    );
  }
  return tab.path;
}

const NAVIGATION_URL_COMMAND = /\b(?:invoke-webrequest|invoke-restmethod|irm|iwr|curl(?:\.exe)?|wget|fetch|webclient|downloadstring|downloadfile|requests?\.(?:get|post)|urllib(?:\.request)?|httpx\.(?:get|post))\b/i;

function blocksNavigationUrlCommand(command: string): boolean {
  return useAi.getState().agentNavigationOnly && NAVIGATION_URL_COMMAND.test(command) && /https?:\/\/|\bwww\./i.test(command);
}

/**
 * Resolve an editor request without ever falling back to the active tab when
 * the caller named a path or tab. The editor registry flushes by tab id, so a
 * path request is resolved first and then flushed through that exact id.
 */
function resolveEditorTab(
  tool: string,
  args: Record<string, unknown>,
): { tab: ReturnType<typeof useStore.getState>['tabs'][number]; requested: string } {
  const st = useStore.getState();
  const requestedPath = String(args.path ?? '').trim();
  const requestedTabId = String(args.tabId ?? '').trim();
  const requested = requestedTabId ? `tabId=${requestedTabId}` : requestedPath ? `path=${requestedPath}` : 'active tab';

  let tab = requestedTabId ? st.tabs.find((t) => t.id === requestedTabId) : undefined;
  if (requestedTabId && !tab) throw new Error(`${tool}: no open tab with tabId "${requestedTabId}"`);
  if (requestedPath) {
    const byPath = st.tabs.find((t) => !!t.path && pathSama(t.path, requestedPath));
    if (!byPath) throw new Error(`${tool}: no open tab for path "${requestedPath}"`);
    if (tab && tab.id !== byPath.id) {
      throw new Error(`${tool}: path "${requestedPath}" and tabId "${requestedTabId}" identify different open tabs`);
    }
    tab = byPath;
  }
  if (!tab) tab = st.tabs.find((t) => t.id === st.activeTabId);
  if (!tab) throw new Error(`${tool}: no active editor tab`);
  return { tab, requested };
}

/** Flush the live CodeMirror document before consulting the Zustand snapshot. */
function flushEditorTab(tab: ReturnType<typeof resolveEditorTab>['tab']): void {
  flushTab(tab.id);
}

/*
 * Strip the workspace prefix from a path for display.
 *
 * Absolute Windows paths repeat the same twenty characters on every row of a
 * search result, which buries the part that actually differs. Falling back to
 * the input keeps this total: an already-relative path is returned unchanged.
 */
function relatif(p: string): string {
  const ws = useStore.getState().workspace;
  if (!ws) return p;
  const a = ws.replace(/[\\/]+$/, '').toLowerCase();
  const b = p.toLowerCase();
  if (b.startsWith(a + '\\') || b.startsWith(a + '/')) return p.slice(ws.length + 1);
  return p;
}

function contextTerdekat(isi: string, cari: string): string {
  const probe = cari.trim().split('\n')[0]?.slice(0, 40) ?? '';
  if (!probe) return 'Try file_read first to see the file contents.';
  const baris = isi.split('\n');
  let best = -1;
  let bestSkor = 0;
  for (let i = 0; i < baris.length; i++) {
    let skor = 0;
    for (const w of probe.split(/\s+/)) {
      if (w.length > 2 && baris[i].includes(w)) skor += w.length;
    }
    if (skor > bestSkor) {
      bestSkor = skor;
      best = i;
    }
  }
  if (best < 0 || bestSkor === 0) return 'No similar lines. Call file_read for the file contents.';
  const a = Math.max(0, best - 2);
  const b = Math.min(baris.length, best + 3);
  return `Closest lines:\n${baris
    .slice(a, b)
    .map((l, k) => `${a + k + 1}: ${l}`)
    .join('\n')}`;
}

/**
 * Find a live browser pane, or create one if there is none yet.
 *
 * A browser pane MUST exist before a browser tool is used: the child webview
 * is created inside the pane, so without a pane there is nothing to attach to.
 * The pane is created through the same store the UI button uses, not a
 * separate path, so the layout keeps being handled by the grid.
 */
async function paneBrowserId(minta: string, url?: string): Promise<string> {
  const panel = usePanel.getState();
  panel.focusTab('terminal');
  await new Promise((r) => setTimeout(r, 250));

  let t = useTerminal.getState();
  let pane = minta ? t.findPane(minta) : undefined;
  if (pane && pane.kind !== 'browser') throw new Error(`pane "${minta}" is not a browser pane`);
  if (!pane) pane = t.allPanes().find((p) => p.kind === 'browser' && p.status === 'live');
  if (!pane) {
    const id = await t.addPane('browser', url ? { url } : undefined);
    if (!id) throw new Error('cannot create a browser pane');
    await new Promise((r) => setTimeout(r, 900));
    t = useTerminal.getState();
    pane = t.findPane(id);
  }
  if (!pane || pane.kind !== 'browser' || pane.status !== 'live') {
    throw new Error('browser pane is disabled or no longer live');
  }
  const tab = t.terminalTabs.find((candidate) => candidate.panes.some((p) => p.id === pane!.id));
  if (!tab) throw new Error(`browser pane ${pane.id} is not contained in a terminal tab`);
  t.setActiveTab(tab.id);
  t.setActivePane(tab.id, pane.id);
  t.setVisible(true);
  return pane.id;
}

/**
 * Page summary for the agent: title, URL, visible text.
 *
 * The text is capped at 4000 characters: a large page (news, long docs) would
 * flood the conversation history, and that history is resent on every
 * following agent step.
 *
 * The `\\n` in the regex below is doubled on purpose. This is a string sent to
 * the page as source code, so a single `\n` would become a real newline and
 * break the regex literal into two lines.
 */
async function bacaHalaman(paneId: string): Promise<string> {
  const info = await cmd.browserPaneInfo(paneId);
  const teks = await cmd.browserPaneEval(
    paneId,
    "document.body ? document.body.innerText.replace(/\\n{3,}/g,'\\n\\n').slice(0,4000) : '(page not loaded yet)'",
  );
  return [
    `URL: ${info.url || '(not loaded yet)'}`,
    `Title: ${info.title || '(no title)'}`,
    '',
    String(teks || '(empty page)'),
  ].join('\n');
}

const SECRET_SETTING_KEY = /key|token|password|secret|api/i;
const PUBLIC_SETTING_GROUPS = ['general', 'editor', 'theme', 'background', 'sidebar', 'layout', 'shortcuts', 'models', 'agents', 'subagent', 'extensions', 'accessibility', 'git', 'panel', 'lsp', 'tests', 'devenv', 'history'];
function publicSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const clean = (value: unknown, key = ''): unknown => {
    if (SECRET_SETTING_KEY.test(key)) return undefined;
    if (Array.isArray(value)) return value.map((item) => clean(item)).filter((item) => item !== undefined);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).flatMap(([k, v]) => {
        const result = clean(v, k);
        return result === undefined ? [] : [[k, result]];
      }));
    }
    return value;
  };
  return Object.fromEntries(PUBLIC_SETTING_GROUPS.flatMap((key) => {
    const value = clean(settings[key], key);
    return value === undefined ? [] : [[key, value]];
  }));
}

function assertNonSecretPatch(patch: Record<string, unknown>, prefix = ''): void {
  for (const [key, value] of Object.entries(patch)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (!prefix && !PUBLIC_SETTING_GROUPS.includes(key)) {
      throw new Error(`settings patch: key "${key}" is not an allowed UI/runtime setting`);
    }
    if (SECRET_SETTING_KEY.test(key) || SECRET_SETTING_KEY.test(fullKey)) {
      throw new Error(`settings patch: key "${fullKey}" is not permitted`);
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      assertNonSecretPatch(value as Record<string, unknown>, fullKey);
    }
  }
}

function serverPaneTarget(value: unknown, requireLive = true) {
  const t = useTerminal.getState();
  const panes = t.allPanes();
  const requested = value === undefined ? '' : String(value).trim();
  let pane = requested
    ? (Number.isInteger(Number(requested)) && panes[Number(requested)] ? panes[Number(requested)] : panes.find((p) => p.id === requested))
    : undefined;
  if (!pane) throw new Error(`server: pane "${requested}" not found`);
  if (pane.kind === 'browser') throw new Error(`server: pane "${requested}" is a browser pane`);
  if (requireLive && pane.status !== 'live') throw new Error(`server: pane "${pane.id}" is not live`);
  const tab = t.terminalTabs.find((candidate) => candidate.panes.some((p) => p.id === pane!.id));
  if (!tab) throw new Error(`server: pane ${pane.id} is not in a terminal tab`);
  t.setActiveTab(tab.id);
  t.setActivePane(tab.id, pane.id);
  t.setVisible(true);
  return { pane, tab };
}

async function serverAlive(paneId: string): Promise<boolean> {
  const list = await cmd.ptyList().catch(() => []);
  return list.some((p) => p.id === paneId && p.alive);
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    spec: {
      name: 'start_server',
      description: 'Start a long-running dev server atomically in a terminal pane, wait only for the requested readiness condition, and report truthful status. Use this for dev servers. Do not use shell_exec or Invoke-WebRequest to start a server; use terminal_exec only for one-shot commands.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Server command, sent exactly once' },
          cwd: { type: 'string', description: 'Working directory for a new pane' },
          pane: { type: ['string', 'number'], description: 'Existing live non-browser pane id or index' },
          readyText: { type: 'string', description: 'Text that must appear in pane output before ready' },
          port: { type: 'number', description: 'Port to probe for readiness' },
          url: { type: 'string', description: 'URL to probe for readiness' },
          timeoutMs: { type: 'number', description: 'Readiness timeout, clamped to 1000..300000 ms' },
          cleanupOnTimeout: { type: 'boolean', description: 'Kill the pane on timeout (default false)' },
        },
        required: ['command'],
      },
    },
    run: async (args) => {
      const command = String(args.command ?? '').trim();
      if (!command) throw new Error('start_server: command is empty');
      const timeoutMs = Math.max(1000, Math.min(300000, Number(args.timeoutMs ?? 30000) || 30000));
      const startedAt = Date.now();
      let pane;
      let tab;
      const requestedPane = args.pane !== undefined;
      if (requestedPane) {
        ({ pane, tab } = serverPaneTarget(args.pane));
      } else {
        const id = await useTerminal.getState().addPane('shell', { cwd: String(args.cwd ?? '').trim() || undefined });
        if (!id) throw new Error('start_server: could not create a shell pane (pane limit or backend refusal)');
        const resolved = serverPaneTarget(id);
        pane = resolved.pane;
        tab = resolved.tab;
      }
      const cwd = pane.cwd || (String(args.cwd ?? '').trim() || useStore.getState().workspace || null);
      // writeChunked is the one existing path that preserves large commands; this is the sole command write.
      await writeChunked(pane.id, `${command.replace(/\r?\n/g, '\r')}\r`);
      const readyText = String(args.readyText ?? '').trim();
      const port = args.port === undefined ? undefined : Number(args.port);
      const url = String(args.url ?? '').trim() || undefined;
      const validPort: number | undefined = typeof port === 'number' && Number.isInteger(port) && port > 0 ? port : undefined;
      const hasReadiness = !!readyText || validPort !== undefined || !!url;
      let ready = false;
      let readiness = hasReadiness ? 'timeout' : 'not_requested';
      let outputTail = await cmd.ptyTail(pane.id, 80).catch(() => '');
      if (hasReadiness) {
        while (Date.now() - startedAt < timeoutMs) {
          if (!(await serverAlive(pane.id))) {
            outputTail = await cmd.ptyTail(pane.id, 80).catch(() => '');
            return JSON.stringify({ started: false, ready: false, paneId: pane.id, tabId: tab.id, cwd, command, readinessKind: 'exited', outputTail, elapsedMs: Date.now() - startedAt, ...(port ? { port } : {}), ...(url ? { url } : {}) });
          }
          outputTail = await cmd.ptyTail(pane.id, 80).catch(() => '');
          if (readyText && outputTail.includes(readyText)) { ready = true; readiness = 'text'; break; }
          if (validPort !== undefined && (await cmd.browserProbe(`http://127.0.0.1:${validPort}`).catch(() => ({ reachable: false } as never))).reachable) { ready = true; readiness = 'port'; break; }
          if (url && (await cmd.browserProbe(url).catch(() => ({ reachable: false } as never))).reachable) { ready = true; readiness = 'url'; break; }
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (!ready) {
          outputTail = await cmd.ptyTail(pane.id, 80).catch(() => outputTail);
          if (args.cleanupOnTimeout === true) await cmd.ptyKill(pane.id).catch((e) => console.warn('[server_start] ptyKill failed for pane', pane.id, e));
        }
      }
      return JSON.stringify({ started: true, ready, ...(ready ? {} : hasReadiness ? { timedOut: true } : {}), paneId: pane.id, tabId: tab.id, cwd, command, readinessKind: readiness, ...(port ? { port } : {}), ...(url ? { url } : {}), outputTail, elapsedMs: Date.now() - startedAt });
    },
  },
  {
    spec: {
      name: 'server_status',
      description: 'Inspect a live server pane and optionally probe its port. This is read-only and does not run a shell command. Use start_server for long-running dev servers.',
      parameters: { type: 'object', properties: { pane: { type: ['string', 'number'], description: 'Live non-browser pane id or index' }, port: { type: 'number', description: 'Optional port to probe' } } },
    },
    run: async (args) => {
      const active = useTerminal.getState().activeTab()?.activePaneId ?? undefined;
      const { pane } = serverPaneTarget(args.pane === undefined ? active : args.pane);
      const live = await serverAlive(pane.id);
      const tail = await cmd.ptyTail(pane.id, 80).catch(() => '');
      const port = args.port === undefined ? undefined : Number(args.port);
      const probe = port && port > 0 ? await cmd.browserProbe(`http://127.0.0.1:${port}`).catch(() => ({ reachable: false })) : undefined;
      return JSON.stringify({ live, alive: live, paneId: pane.id, cwd: pane.cwd, pid: pane.pid ?? null, tail, ...(port ? { port, probe } : {}) });
    },
  },
  {
    spec: {
      name: 'server_stop',
      description: 'Stop exactly the named server pane: interrupt first, then kill only if forced or still alive after a bounded wait. Never close or reuse an arbitrary pane.',
      parameters: { type: 'object', properties: { pane: { type: ['string', 'number'], description: 'Exact server pane id or index' }, force: { type: 'boolean', description: 'Kill immediately after interrupt if true' } }, required: ['pane'] },
    },
    run: async (args) => {
      const { pane } = serverPaneTarget(args.pane);
      await cmd.ptyInterrupt(pane.id).catch((e) => console.warn('[server_stop] ptyInterrupt failed for pane', pane.id, e));
      let alive = await serverAlive(pane.id);
      if (alive && args.force !== true) {
        const until = Date.now() + 1200;
        while (alive && Date.now() < until) { await new Promise((resolve) => setTimeout(resolve, 150)); alive = await serverAlive(pane.id); }
      }
      let killed = false;
      if (alive && (args.force === true || alive)) { await cmd.ptyKill(pane.id).catch((e) => console.warn('[server_stop] ptyKill failed for pane', pane.id, e)); killed = true; }
      const actualAlive = await serverAlive(pane.id);
      if (!actualAlive) useTerminal.getState().markExited(pane.id);
      return JSON.stringify({ paneId: pane.id, interrupted: true, killed, live: actualAlive, alive: actualAlive, status: actualAlive ? 'live' : 'stopped' });
    },
  },
  {
    spec: {
      name: 'task_complete',
      description: 'Signal that the requested work is complete and the relevant verification has passed. Use this only at the end; never use it to hide a failure or skip requested work.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'One-sentence completion summary' },
          verified: { type: 'boolean', description: 'Whether the relevant checks passed' },
        },
      },
    },
    run: async (args) => `Task complete${args.verified === true ? ' and verified' : ''}${args.summary ? `: ${String(args.summary)}` : '.'}`,
  },
  {
    spec: {
      name: 'shell_exec',
      description:
        'Run a command to completion and return the exit code plus output. Use this for non-interactive commands: test, build, typecheck, git, ls. For network commands, always use a short timeout (30 seconds or less); never wait indefinitely. Do not use it for a server or anything that keeps running; use terminal_exec for that. Do not use it to open or read URLs: use browser_open/system_browser_open, browser_read, or web_fetch.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command, may be multi-line. Example: cd src-tauri && cargo test --lib' },
          timeoutMs: { type: 'number', description: 'Timeout in ms (default 120000, max 600000)' },
        },
        required: ['command'],
      },
    },
    run: async (args) => {
      const perintah = String(args.command ?? '').trim();
      if (!perintah) throw new Error('shell_exec: command is empty');
      const fetchCommand = /(?:^|[;&|]\s*)(?:invoke-webrequest|curl(?:\.exe)?|wget|irm|iwr)\b/i.test(perintah);
      if (blocksNavigationUrlCommand(perintah) || (useAi.getState().agentNavigationOnly && fetchCommand && /https?:\/\//i.test(perintah))) {
        throw new Error(
          'shell_exec: URL fetching is not needed for a navigation-only request. Use browser_open or system_browser_open to open the URL; use shell_exec only when the user explicitly asks for a terminal-side fetch.',
        );
      }
      const requestedTimeout = args.timeoutMs === undefined ? undefined : Number(args.timeoutMs);
      const timeoutMs = NETWORK_COMMAND.test(perintah)
        ? Math.min(NETWORK_TIMEOUT_MS, Number.isFinite(requestedTimeout) ? requestedTimeout as number : NETWORK_TIMEOUT_MS)
        : requestedTimeout;
      const r = await cmd.agentExec(perintah, timeoutMs);
      const bagian: string[] = [];
      /*
       * The machine-readable header.
       *
       * The row renders an exit badge and separate stdout/stderr tabs, and it
       * can only do that if those values survive the trip out of this tool. The
       * text below stays human-readable for the model — it is the same result,
       * with one extra line at the top that the UI parses and the model simply
       * reads past. A JSON envelope would be tidier to parse and much worse to
       * read in the transcript when something goes wrong.
       */
      bagian.push(`__meta exit=${r.exitCode} ms=${r.ms}${r.timedOut ? ' timeout=1' : ''}`);
      bagian.push(`exit code: ${r.exitCode}`);
      bagian.push(`time: ${r.ms} ms${r.timedOut ? ' (TIMEOUT, process killed)' : ''}`);
      if (r.stdout.trim()) bagian.push(`stdout:\n${r.stdout}`);
      if (r.stderr.trim()) bagian.push(`stderr:\n${r.stderr}`);
      if (r.truncated) bagian.push('[output truncated; showing the tail (last N characters) of the output]');
      if (!r.stdout.trim() && !r.stderr.trim()) bagian.push('(no output)');
      return bagian.join('\n\n');
    },
  },
  {
    spec: {
      name: 'terminal_exec',
      description:
        'Send a command to an interactive terminal pane (ConPTY) and return immediately without waiting. The output is NOT part of the result; read it yourself with terminal_read. Use it only for what has to keep running or needs interaction (dev server, REPL, watch). For network commands, include a short command-level timeout and never wait indefinitely. Do not use it to open or read URLs. For one-shot test/build/git commands, use shell_exec, which waits until they finish.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command (may be multi-line, e.g. node script.js)' },
          pane: {
            type: ['string', 'number'],
            description: 'Optional pane index or live pane id. The target must be a live non-browser terminal, including SSH.',
          },
        },
        required: ['command'],
      },
    },
    run: async (args) => {
      const perintah = String(args.command ?? '').trim();
      if (!perintah) throw new Error('terminal_exec: command is empty');
      if (blocksNavigationUrlCommand(perintah) || (useAi.getState().agentNavigationOnly && NETWORK_COMMAND.test(perintah) && /https?:\/\//i.test(perintah))) {
        throw new Error(
          'terminal_exec: URL fetching is not needed for a navigation-only request. Use browser_open or system_browser_open to open the URL; use terminal_exec only when the user explicitly asks for a terminal-side fetch.',
        );
      }
      const t = useTerminal.getState();
      const panes = t.allPanes();
      const pilih = args.pane === undefined ? '' : String(args.pane).trim();
      let target = panes.find((p) => p.kind === 'agent' && p.status === 'live') ??
        panes.find((p) => p.kind !== 'browser' && p.status === 'live');
      if (pilih) {
        const idx = Number(pilih);
        target = Number.isInteger(idx) && panes[idx] ? panes[idx] : panes.find((p) => p.id === pilih);
        if (!target) throw new Error(`terminal_exec: pane "${pilih}" not found`);
      }
      if (!target || target.status !== 'live' || target.kind === 'browser') {
        throw new Error('terminal_exec: target must be a live non-browser terminal pane');
      }
      const tab = t.terminalTabs.find((candidate) => candidate.panes.some((p) => p.id === target!.id));
      if (!tab) throw new Error(`terminal_exec: pane ${target.id} is not in a terminal tab`);
      t.setActiveTab(tab.id);
      t.setActivePane(tab.id, target.id);
      t.setVisible(true);
      await writeChunked(target.id, `${perintah.replace(/\r?\n/g, '\r')}\r`);
      return `Command sent to pane ${target.id} ("${target.title}", tab ${tab.id}; not waiting). Call terminal_read with pane="${target.id}" to see the output.`;
    },
  },
  {
    spec: {
      name: 'terminal_read',
      description:
        'Read the last N lines of output from a terminal pane scrollback. The output is taken from the process buffer, so it stays readable even after you have scrolled far away or the pane is not visible. Use it after terminal_exec (interactive commands). For one-shot commands, shell_exec already returned the output. Pass pane to pick a specific pane by index or id when more than one is open; call list_panes first to see them.',
      parameters: {
        type: 'object',
        properties: {
          maxLines: { type: 'number', description: 'Maximum number of lines to read (default 40)' },
          pane: {
            type: 'string',
            description:
              'Pane index (0, 1, 2) or pane id from list_panes. Default: the active agent pane, then any non-browser pane.',
          },
        },
      },
    },
    run: async (args) => {
      const maxLines = Math.max(1, Math.min(2000, Number(args.maxLines ?? 40) || 40));
      const panes = useTerminal.getState().allPanes();
      if (panes.length === 0) return '(no terminal pane is open - open one from the Terminal panel)';
      const pilih = String(args.pane ?? '').trim();
      let target = panes.find((p) => p.kind === 'agent') ?? panes.find((p) => p.kind !== 'browser');
      if (pilih) {
        const idx = Number(pilih);
        const cocok =
          Number.isInteger(idx) && panes[idx] ? panes[idx] : panes.find((p) => p.id === pilih);
        if (!cocok) {
          // Never silently read a different pane than the one asked for: a
          // wrong pane returns plausible output and the model acts on it.
          const daftar = panes.map((p, i) => `${i}=${p.id} (${p.kind})`).join(', ');
          return `Pane "${pilih}" not found. Open panes: ${daftar}`;
        }
        target = cocok;
      }
      if (!target) return '(no terminal pane)';
      try {
        const teks = await cmd.ptyTail(target.id, maxLines);
        if (teks.trim()) return teks;
      } catch {
        /* fall through to DOM reading */
      }
      const el = document.querySelector('.xterm-rows');
      if (!el) return '(terminal pane is not visible - open the Terminal panel first)';
      const baris = Array.from(el.querySelectorAll('div'))
        .map((d) => d.textContent ?? '')
        .filter((t) => t.trim() !== '');
      const potong = baris.slice(-maxLines);
      return potong.join('\n') || '(no output yet)';
    },
  },
  {
    spec: {
      name: 'editor_read',
      description:
        'Read an editor tab buffer (not necessarily the same as on disk), or list every open tab when no path is given. Pass `path` to read a file that is open in ANOTHER tab. Includes the file name and whether the tab has unsaved changes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or workspace-relative path of the open tab to read; omit to read the active tab' },
        },
      },
    },
    run: async (args) => {
      const st = useStore.getState();
      if (st.tabs.length === 0) return '(no editor tab is open)';
      if (!String(args.path ?? '').trim() && !String(args.tabId ?? '').trim() && !st.tabs.some((t) => t.id === st.activeTabId)) {
        const daftar = st.tabs.map((t) => `${t.path ?? t.name}${t.unsaved ? ' (unsaved)' : ''}`).join('\\n');
        return `(no active editor tab; ${st.tabs.length} open)\\n${daftar}`;
      }
      const { tab, requested } = resolveEditorTab('editor_read', args);
      if (tab.loaded === false) {
        return `Live buffer unavailable for ${requested}: tab ${tab.id} is unloaded, so the store content is not safe to read.`;
      }
      flushEditorTab(tab);
      const fresh = useStore.getState().tabs.find((t) => t.id === tab.id);
      if (!fresh) throw new Error(`editor_read: resolved tab ${tab.id} closed while reading`);
      const isi = fresh.content ?? '';
      const potong = isi.length > AGENT_READ_LIMIT;
      return `Resolved ${requested} to tabId=${fresh.id} (${fresh.path ?? fresh.name}); live buffer flushed by tab id; ${fresh.unsaved ? 'unsaved changes present' : 'saved'}${potong ? `; first ${AGENT_READ_LIMIT} characters only` : ''}\n\`\`\`\n${isi.slice(0, AGENT_READ_LIMIT)}\n\`\`\``;
    },
  },
  {
    spec: {
      name: 'editor_write',
      description:
        'Overwrite a specific open editor tab buffer with new content. Pass `path` or `tabId` to target it; omitting both preserves active-tab behavior. This does NOT write to disk — the user still must save.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'New full file contents' },
          path: { type: 'string', description: 'Optional open-tab path to target' },
          tabId: { type: 'string', description: 'Optional open-tab id to target' },
        },
        required: ['content'],
      },
    },
    run: async (args) => {
      let { tab, requested } = resolveEditorTab('editor_write', args);
      if (tab.loaded === false) {
        await useStore.getState().ensureTabLoaded(tab.id);
        ({ tab, requested } = resolveEditorTab('editor_write', args));
      }
      flushEditorTab(tab);
      const content = String(args.content ?? '');
      useStore.getState().updateTabContent(tab.id, content);
      const after = useStore.getState().tabs.find((t) => t.id === tab.id);
      return `Resolved ${requested} to tabId=${tab.id} (${tab.path ?? tab.name}); buffer updated, ${after?.unsaved ? 'unsaved changes present' : 'unchanged'} (not saved to disk yet — tell the user to save).`;
    },
  },
  {
    spec: {
      name: 'editor_save',
      description:
        'Save an open editor tab to disk. Pass `path` or `tabId` to target it; omitting both saves the active tab. The live CodeMirror buffer is flushed first and workspace safety is enforced by the existing save action.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional open-tab path to save' },
          tabId: { type: 'string', description: 'Optional open-tab id to save' },
        },
      },
    },
    run: async (args) => {
      const { tab, requested } = resolveEditorTab('editor_save', args);
      flushEditorTab(tab);
      const ok = await useStore.getState().saveTab(tab.id);
      const after = useStore.getState().tabs.find((t) => t.id === tab.id);
      return ok
        ? `Resolved ${requested} to tabId=${tab.id} (${after?.path ?? after?.name}); saved to workspace disk; ${after?.unsaved ? 'unsaved changes remain' : 'clean'}.`
        : `Resolved ${requested} to tabId=${tab.id} (${after?.path ?? after?.name}); save was not completed; ${after?.unsaved ? 'unsaved changes remain' : 'buffer is clean'}.`;
    },
  },
  {
    spec: {
      name: 'file_write',
      description:
        'Write file contents straight to disk (or create a new file if it does not exist). Updates the editor buffer tab when the file is open in the editor.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (absolute or relative to the workspace)' },
          content: { type: 'string', description: 'Full text content to be written to the file' },
        },
        required: ['path', 'content'],
      },
    },
    run: async (args) => {
      const filePath = String(args.path ?? '').trim();
      const content = String(args.content ?? '');
      if (!filePath) throw new Error('file_write: path is empty');
      const before = await cmd.fsRead(filePath).catch(() => null);
      if (before) assertOpenTabMatchesDisk(filePath, before.content ?? '');
      await cmd.fsWrite(await resolveWriteTarget(filePath, content), content);
      
      const tab = openTabForPath(filePath);
      if (tab) {
        useStore.getState().updateTabContent(tab.id, content);
      }
      return `File ${filePath} written to disk (${content.length} characters).`;
    },
  },
  {
    spec: {
      name: 'file_edit',
      description:
        'Change part of an existing file on disk by finding the old text (old_text) and replacing it with new text (new_text).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_text: { type: 'string', description: 'The exact text you want replaced' },
          new_text: { type: 'string', description: 'The replacement text' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
    run: async (args) => {
      const filePath = String(args.path ?? '').trim();
      const oldText = String(args.old_text ?? '');
      const newText = String(args.new_text ?? '');
      if (!filePath) throw new Error('file_edit: path is empty');
      if (!oldText) throw new Error('file_edit: old_text is empty');
      const r = await cmd.fsRead(filePath);
      const original = r.content ?? '';
      assertOpenTabMatchesDisk(filePath, original);
      if (!original.includes(oldText)) {
        throw new Error(
          `file_edit: old_text not found in ${filePath}. ${contextTerdekat(original, oldText)}`,
        );
      }
      const jumlah = original.split(oldText).length - 1;
      const updated = original.split(oldText).join(newText);
      await cmd.fsWrite(await resolveWriteTarget(filePath, updated), updated);
      const tab = openTabForPath(filePath);
      if (tab) {
        useStore.getState().updateTabContent(tab.id, updated);
      }
      return `File ${filePath} edited and saved to disk (${jumlah} occurrences replaced).`;
    },
  },
  {
    spec: {
      name: 'file_patch',
      description:
        'Apply a unified diff to a single file, the way git diff outputs it. Use this for multi-line changes; it is more reliable than file_edit because you do not have to copy the old text exactly in one block. Format: ---/+++ headers and @@ hunks. Context lines are used to find the location.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path of the file to patch' },
          patch: { type: 'string', description: 'Unified diff. Include the a/ b/ headers and the @@ hunks.' },
        },
        required: ['path', 'patch'],
      },
    },
    run: async (args) => {
      const filePath = String(args.path ?? '').trim();
      const isiPatch = String(args.patch ?? '');
      if (!filePath) throw new Error('file_patch: path is empty');
      if (!isiPatch.trim()) throw new Error('file_patch: patch is empty');
      const before = await cmd.fsRead(filePath);
      const tab = assertOpenTabMatchesDisk(filePath, before.content ?? '');
      const r = await cmd.filePatch(filePath, isiPatch);
      if (!r.applied) {
        throw new Error(`file_patch: patch not applied. ${r.conflict}`);
      }
      const segar = await cmd.fsRead(tab?.path ?? filePath).catch(() => null);
      if (segar && tab) {
        useStore.getState().updateTabContent(tab.id, segar.content ?? '');
      }
      return `Patch applied to ${filePath} (+${r.added} -${r.removed}).`;
    },
  },
  {
    spec: {
      name: 'file_read',
      description:
        'Read the contents of a file from disk (read-only, max 100KB). The path can be absolute or relative to the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path' } },
        required: ['path'],
      },
    },
    run: async (args) => {
      const r = await cmd.fsRead(String(args.path));
      const isi = (r.content ?? '').slice(0, AGENT_READ_LIMIT);
      return isi || '(empty)';
    },
  },
  {
    spec: {
      name: 'file_list',
      description: 'List the contents of a folder (file/directory names).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Folder path' } },
        required: ['path'],
      },
    },
    run: async (args) => {
      const nodes = await cmd.scanDir(String(args.path));
      if (nodes.length === 0) return '(empty)';
      const potong = nodes.slice(0, FILE_LIST_MAX);
      const teks = potong.map((n) => (n.isDir ? `${n.name}/` : n.name)).join('\n');
      if (nodes.length <= FILE_LIST_MAX) return teks;
      return `${teks}\n\n[... and ${nodes.length - FILE_LIST_MAX} other entries are not shown. Name a specific sub-folder if you need its full list.]`;
    },
  },
  {
    spec: {
      name: 'search_text',
      description:
        'Search for text across every file in the workspace (like grep). Returns the file path, line number and the matching line, capped at ' +
        SEARCH_MAX +
        ' hits. Use this to find where a symbol is defined or every place something is referenced — it is far cheaper than reading files one by one. Narrow the search with glob (e.g. "src/**/*.ts").',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The text to find' },
          glob: {
            type: 'string',
            description: 'Optional file filter, e.g. "*.ts" or "src/**/*.tsx". Omit to search every text file.',
          },
          regex: { type: 'boolean', description: 'Treat query as a regular expression (default false)' },
          case_sensitive: { type: 'boolean', description: 'Match case exactly (default false)' },
        },
        required: ['query'],
      },
    },
    run: async (args) => {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('search_text: query is empty');
      const r = await cmd.searchFiles(query, {
        glob: args.glob ? String(args.glob) : undefined,
        regex: Boolean(args.regex),
        caseSensitive: Boolean(args.case_sensitive),
      });
      if (!r.hits.length) return `(no match for "${query}" in ${r.filesScanned} files)`;
      const potong = r.hits.slice(0, SEARCH_MAX);
      /*
       * One line per hit, `path:line: text`.
       *
       * The preview already carries the matched line, so repeating the match
       * length or the column would be noise. The path is made workspace-relative
       * because an absolute D:\... prefix on every row is the same 20 characters
       * over and over, and it pushes the actual text off the right edge.
       */
      const baris = potong.map((h) => `${relatif(h.path)}:${h.line}: ${h.preview.trim()}`);
      const sisa = r.hits.length - potong.length;
      return baris.join('\n') + (sisa > 0 ? `\n\n[... and ${sisa} more matches. Narrow the query or add a glob.]` : '');
    },
  },
  {
    spec: {
      name: 'list_panes',
      description:
        'List the currently open terminal/browser panes (paneId, type, title, agent, pid, running). Useful for finding out which terminal is alive before running a command.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => JSON.stringify(await runAction('list_panes', {})),
  },
  {
    spec: {
      name: 'get_problems',
      description:
        'Read the diagnostics (Problems) currently shown in the bottom panel: errors and warnings per file. Optional severity filter: error | warning | info | hint.',
      parameters: {
        type: 'object',
        properties: { severity: { type: 'string', description: 'optional filter: error|warning|info|hint' } },
      },
    },
    run: async (args) => {
      const p = await runAction('get_problems', args);
      const r = p as { counts?: { errors?: number; warnings?: number }; problems?: unknown[] };
      const probs = Array.isArray(r.problems) ? r.problems : [];
      if (probs.length === 0) {
        return `No problems. (counts: ${JSON.stringify(r.counts ?? {})})`;
      }
      return probs
        .map((x) => {
          const d = x as { file?: string; line?: number; column?: number; severity?: string; message?: string };
          return `[${d.severity ?? '?'}] ${d.file ?? '?'}:${d.line ?? '?'}:${d.column ?? '?'} ${d.message ?? ''}`;
        })
        .join('\n');
    },
  },
  {
    spec: {
      name: 'get_output',
      description:
        'Read the contents of one channel of the bottom Output panel (zephyr, mcp, ssh, extensions, debug). The channel param is required; tail is optional (default 200 last lines).',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'channel id: zephyr|mcp|ssh|extensions|debug' },
          tail: { type: 'number', description: 'take the last N lines (default 200, max 2000)' },
        },
        required: ['channel'],
      },
    },
    run: async (args) => {
      const r = (await runAction('get_output', args)) as {
        channel?: string;
        total?: number;
        lines?: string[];
      };
      const lines = Array.isArray(r.lines) ? r.lines : [];
      return lines.length === 0
        ? `(channel ${r.channel ?? args.channel} is empty)`
        : `[${r.channel ?? ''} — ${r.total ?? lines.length} lines]\n${lines.join('\n')}`;
    },
  },
  {
    spec: {
      name: 'mcp_call',
      description:
        'Call one tool on an external MCP server registered in Settings → MCP → External MCP servers. Put the server id or label in "server" (see the list in Settings), the tool name from that server in "tool", and the arguments matching the tool schema in "args". Returns the raw server response.',
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'id or label of the external MCP server' },
          tool: { type: 'string', description: 'name of the tool to call on that server' },
          args: { type: 'object', description: 'tool arguments matching its schema (optional)' },
        },
        required: ['server', 'tool'],
      },
    },
    run: async (args) => {
      const server = String(args.server ?? '').trim();
      const tool = String(args.tool ?? '').trim();
      if (!server) throw new Error('mcp_call: server is empty');
      if (!tool) throw new Error('mcp_call: tool is empty');
      const isi = (args.args ?? {}) as Record<string, unknown>;
      const hasil = await cmd.mcpClientCall(server, tool, isi);
      const teks = typeof hasil === 'string' ? hasil : JSON.stringify(hasil, null, 2);
      return teks.length > AGENT_READ_LIMIT
        ? `${teks.slice(0, AGENT_READ_LIMIT)}\n\n[... truncated at ${AGENT_READ_LIMIT} characters]`
        : teks;
    },
  },
  {
    spec: {
      name: 'todo_write',
      description:
        'Write/replace the list of tasks being worked on (max 20 items). Call it again every time the status changes — do not wait until the task is done. Status: pending | in_progress | done.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: 'the full task list (it replaces the old one, it does not append)',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'one line of task text, verb first' },
                status: { type: 'string', description: 'pending | in_progress | done' },
              },
              required: ['content', 'status'],            },
          },
        },
        required: ['todos'],
      },
    },
    run: async (args) => {
      const list = Array.isArray(args.todos) ? args.todos : [];

      const n = useAi.getState().setAgentTodos(list);
      return `Task list saved (${n} items).`;
    },
  },
  {
    spec: {
      name: 'todo_read',
      description: 'Read the list of tasks being worked on together with their status.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {

      const todos = useAi.getState().agentTodos;
      if (todos.length === 0) return '(no tasks)';
      return todos.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`).join('\n');
    },
  },
  
  {
    spec: {
      name: 'skill_list',
      description:
        'List available skills (name + description + origin: workspace/global). Call this first when a task sounds like something with a fixed procedure.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const list = await cmd.skillsList();
      if (list.length === 0) return '(no skills yet)';
      return list
        .map((s) => `- ${s.name} [${s.scope}]: ${s.description}`)
        .join('\n');
    },
  },
  {
    spec: {
      name: 'skill_view',
      description:
        'Read the full SKILL.md of one skill. Call it BEFORE starting a task that matches its description, then follow the steps inside. The content is authoritative for that task: do not improvise around it.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'skill name (see skill_list)' },
        },
        required: ['name'],
      },
    },
    run: async (args) => {
      const nama = String(args.name ?? '').trim();
      if (!nama) throw new Error('skill_view: name is empty');
      const isi = await cmd.skillRead(nama);
      return isi.length > AGENT_READ_LIMIT
        ? `${isi.slice(0, AGENT_READ_LIMIT)}\n\n[... truncated at ${AGENT_READ_LIMIT} characters]`
        : isi;
    },
  },
  {
    spec: {
      name: 'skill_write',
      description:
        'Create or update a skill. Use it AFTER finishing a repeatable procedure worth doing again. Write concrete steps (commands, paths, pitfalls), not a narrative summary. Default scope is workspace (this project only); use "global" only for things that apply to every project.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'short name made of letters/digits/-/_' },
          description: { type: 'string', description: 'one line: when this skill applies' },
          content: { type: 'string', description: 'the SKILL.md contents (markdown, steps + pitfalls)' },
          scope: { type: 'string', description: 'workspace (default) | global' },
        },
        required: ['name', 'description', 'content'],
      },
    },
    run: async (args) => {
      const path = await cmd.skillWrite({
        name: String(args.name ?? '').trim(),
        description: String(args.description ?? '').trim(),
        content: String(args.content ?? ''),
        scope: args.scope ? String(args.scope) : undefined,
      });
      

      resetKonteksAgent();
      return `Skill saved: ${path}`;
    },
  },
  {
    spec: {
      name: 'skill_delete',
      description: 'Delete one skill and its contents. Only when that skill is wrong or no longer used.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'skill name' } },
        required: ['name'],
      },
    },
    run: async (args) => {
      const nama = String(args.name ?? '').trim();
      if (!nama) throw new Error('skill_delete: name is empty');
      await cmd.skillDelete(nama);
      return `Skill '${nama}' deleted.`;
    },
  },
  
  {
    spec: {
      name: 'memory_read',
      description:
        'Read the cross-session memory: the "memory" section (your notes about the environment and technical lessons) and "user" (who the user is: preferences, style, habits).',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const m = await cmd.memoryRead();
      const bagian: string[] = [];
      if (m.memory.trim()) {
        bagian.push(`[memory ${m.memory_chars}/${m.memory_limit}]\n${m.memory}`);
      }
      if (m.user.trim()) {
        bagian.push(`[user ${m.user_chars}/${m.user_limit}]\n${m.user}`);
      }
      return bagian.length ? bagian.join('\n\n') : '(memory is empty)';
    },
  },
  {
    spec: {
      name: 'memory_write',
      description:
        'Add/replace/delete one cross-session memory entry. Save facts that apply to ALL conversations (who the user is, project conventions, environment traps) — not task progress. If it is full, condense the old entries first (action replace/remove).',
      parameters: {
        type: 'object',
        properties: {
          section: { type: 'string', description: 'memory | user' },
          action: { type: 'string', description: 'add | replace | remove' },
          content: { type: 'string', description: 'the new entry (for add/replace)' },
          old_text: {
            type: 'string',
            description: 'the piece of the old entry text to replace/remove (for replace/remove)',
          },
        },
        required: ['section', 'action'],
      },
    },
    run: async (args) => {
      const section = String(args.section ?? '') as 'memory' | 'user';
      const action = String(args.action ?? '') as 'add' | 'replace' | 'remove';
      const hasil = await cmd.memoryWrite({
        section,
        action,
        content: args.content ? String(args.content) : undefined,
        oldText: args.old_text ? String(args.old_text) : undefined,
      });

      resetKonteksAgent();
      return `Memory '${section}' updated (${action}). ${hasil.length} characters total.`;
    },
  },
  
  {
    spec: {
      name: 'cron_create',
      description:
        'Create a scheduled task. Set every_minutes (>0) to repeat every N minutes, OR at_hour (0-23) for daily. The command runs in a Zephyr terminal pane when it comes due.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'task name' },
          command: { type: 'string', description: 'shell command' },
          every_minutes: { type: 'number', description: 'interval in minutes (optional)' },
          at_hour: { type: 'number', description: 'hour of day 0-23 (optional)' },
        },
        required: ['name', 'command'],
      },
    },
    run: async (args) => {
      const job = await cmd.cronCreate({
        name: String(args.name ?? '').trim(),
        command: String(args.command ?? '').trim(),
        everyMinutes: args.every_minutes ? Number(args.every_minutes) : undefined,
        atHour: args.at_hour !== undefined ? Number(args.at_hour) : undefined,
      });
      const jadwal = job.every_minutes > 0 ? `every ${job.every_minutes} minutes` : `daily at ${job.at_hour}:00`;
      return `Task '${job.name}' created (${jadwal}), id=${job.id}.`;
    },
  },
  {
    spec: {
      name: 'cron_list',
      description: 'List the scheduled tasks with their status and schedule.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const list = await cmd.cronList();
      if (list.length === 0) return '(no scheduled tasks yet)';
      return list
        .map((j) => {
          const jadwal = j.every_minutes > 0 ? `every ${j.every_minutes}m` : `daily ${j.at_hour}:00`;
          const status = j.enabled ? 'enabled' : 'disabled';
          return `- ${j.id} "${j.name}" [${status}] ${jadwal} → ${j.command}`;
        })
        .join('\n');
    },
  },
  {
    spec: {
      name: 'cron_delete',
      description: 'Delete one scheduled task by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'task id (see cron_list)' } },
        required: ['id'],
      },
    },
    run: async (args) => {
      const id = String(args.id ?? '').trim();
      if (!id) throw new Error('cron_delete: id is empty');
      await cmd.cronDelete(id);
      return `Task '${id}' deleted.`;
    },
  },
  {
    spec: {
      name: 'settings',
      description: 'Read safe settings, patch non-secret UI/runtime settings, or inspect/test model metadata.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'patch', 'model_status', 'test_model'] },
          patch: { type: 'object', description: 'Non-secret settings patch' },
          provider: { type: 'string', description: 'Model provider for test_model' },
          baseUrl: { type: 'string', description: 'Optional model endpoint for test_model' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const action = String(args.action ?? '').trim();
      if (action === 'get') return JSON.stringify(publicSettings((await cmd.getSettings()) as unknown as Record<string, unknown>));
      if (action === 'patch') {
        const patch = args.patch;
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('settings patch: patch must be an object');
        assertNonSecretPatch(patch as Record<string, unknown>);
        await cmd.setSettings(patch as Record<string, unknown>);
        return `Settings patch applied to keys: ${Object.keys(patch).join(', ') || '(none)'}.`;
      }
      if (action === 'model_status') {
        const settings = await cmd.getSettings();
        const models = await cmd.getPublicModels();
        const provider = settings.models.activeProvider;
        const configured = settings.models.providers[provider] ?? {};
        const listed = models.find((model) => model.provider === provider);
        return JSON.stringify({ provider, model: configured.model ?? '', hasKey: listed?.hasKey ?? false });
      }
      if (action === 'test_model') {
        const provider = String(args.provider ?? '').trim();
        if (!provider) throw new Error('settings test_model: provider is required');
        const result = await cmd.testModelConnection(provider, args.baseUrl ? String(args.baseUrl) : undefined);
        return JSON.stringify({ provider, ok: result.ok, message: result.message, status: result.status, ms: result.ms });
      }
      throw new Error(`settings: unknown action "${action}"`);
    },
  },
  {
    spec: {
      name: 'extensions',
      description: 'List, install a local .zext, enable, disable, or uninstall an extension.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'install', 'enable', 'disable', 'uninstall'] },
          id: { type: 'string', description: 'Extension id (enable, disable, uninstall)' },
          path: { type: 'string', description: 'Local .zext file path (install)' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const action = String(args.action ?? '').trim();
      if (action === 'list') return JSON.stringify(await cmd.extensionsList());
      if (action === 'install') {
        const path = String(args.path ?? '').trim();
        if (!path || !/\.zext$/i.test(path)) throw new Error('extensions install: path must be an existing local .zext file');
        const result = await cmd.extensionsInstall(path);
        return `Installed extension ${result.id} ${result.version} from ${path}.`;
      }
      const id = String(args.id ?? '').trim();
      if (!id) throw new Error(`extensions ${action}: id is required`);
      if (action === 'enable' || action === 'disable') {
        const enabled = action === 'enable';
        const ok = await cmd.extensionsSetEnabled(id, enabled);
        return ok ? `Extension ${id} ${enabled ? 'enabled' : 'disabled'}.` : `Extension ${id} was not ${enabled ? 'enabled' : 'disabled'} by the backend.`;
      }
      if (action === 'uninstall') {
        const ok = await cmd.extensionsUninstall(id);
        return ok ? `Extension ${id} uninstalled.` : `Extension ${id} was not uninstalled by the backend.`;
      }
      throw new Error(`extensions: unknown action "${action}"`);
    },
  },
  {
    spec: {
      name: 'browser_close',
      description: 'Close an existing browser pane and report the backend result.',
      parameters: { type: 'object', properties: { paneId: { type: 'string', description: 'Browser pane id' } }, required: ['paneId'] },
    },
    run: async (args) => {
      const paneId = String(args.paneId ?? '').trim();
      if (!paneId) throw new Error('browser_close: paneId is required');
      const ok = await cmd.browserPaneClose(paneId);
      return ok ? `Browser pane ${paneId} closed.` : `Browser pane ${paneId} was not closed by the backend.`;
    },
  },
  {
    spec: {
      name: 'system_browser_open',
      description: 'Open an http(s) URL in the system browser.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full http:// or https:// URL' } }, required: ['url'] },
    },
    run: async (args) => {
      const url = String(args.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('system_browser_open: URL must use http:// or https://');
      await openUrl(url);
      return `System browser opened: ${url}.`;
    },
  },
  {
    spec: {
      name: 'browser_open',
      description:
        'Open a URL in the visible browser pane. Returns the requested URL, paneId, tabId, and whether navigation was verified; call browser_read separately when page text is needed. If the pane is hidden or has no DOM bounds, reports that clearly instead of claiming success.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'full URL, must be http:// or https://' },
          paneId: {
            type: 'string',
            description: 'id of an existing browser pane (optional; see browser_list)',
          },
        },
        required: ['url'],
      },
    },
    run: async (args) => {
      const url = String(args.url ?? '').trim();
      if (!url) throw new Error('browser_open: url is empty');
      const paneId = await paneBrowserId(String(args.paneId ?? ''), url);

      /*
       * Take the position from the pane's own container element.
       *
       * Hardcoding x:0, y:0 put the webview in the top-left corner of the
       * window, floating over the editor and the sidebar, because a child
       * webview is placed in native window coordinates rather than being part
       * of the page flow. The container already knows where it is, so ask it.
       *
       * `.pane-body` is the wrapper that owns the pane's box; the element
       * carrying data-pane-body is the inner component. If the pane was just
       * created it may not be laid out yet, so fall back to a centred
       * rectangle rather than the corner.
       */
      const rect = document
        .querySelector<HTMLElement>(`[data-pane-body="${paneId}"] .bp-stage`)
        ?.getBoundingClientRect();
      const tab = useTerminal.getState().terminalTabs.find((candidate) => candidate.panes.some((p) => p.id === paneId));
      if (!tab) return `URL requested: ${url}; navigation not requested because pane ${paneId} is not in a terminal tab.`;
      if (!rect || rect.width < 4 || rect.height < 4) {
        return `URL requested: ${url}; navigation not requested because browser pane ${paneId} has no visible DOM rectangle (tab ${tab.id}).`;
      }
      const blocked = document.querySelector(`[data-pane-body="${paneId}"]`)?.getAttribute('data-bp-blocked') === '1';
      if (blocked) {
        return `URL requested: ${url}; navigation not requested because browser pane ${paneId} is disabled (tab ${tab.id}).`;
      }

      // Let BrowserPane's normal URL effect perform the first navigation. The
      // direct command is only a fallback when that existing path did not
      // produce a verifiable URL, which avoids racing two opens.
      useTerminal.getState().setPaneUrl(paneId, url);
      await new Promise((r) => setTimeout(r, 600));
      let verified = false;
      try {
        verified = (await cmd.browserPaneInfo(paneId)).url === url;
      } catch {
        /* BrowserPane may still be opening its webview. */
      }
      if (!verified) {
        await cmd.browserPaneOpen({
          paneId,
          url,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }
      try {
        const actualUrl = (await cmd.browserPaneInfo(paneId)).url || '';
        return `URL requested: ${url}; paneId=${paneId}; tabId=${tab.id}; navigation ${actualUrl === url ? 'verified' : `not verified (current URL: ${actualUrl || '(unknown)'})`}.`;
      } catch {
        return `URL requested: ${url}; paneId=${paneId}; tabId=${tab.id}; navigation requested but not verified.`;
      }
    },
  },
  {
    spec: {
      name: 'browser_read',
      description:
        'Read the contents of the page currently open in the browser pane: title, URL, visible text, and the list of links. Call this after browser_open or after the user navigates to another page.',
      parameters: {
        type: 'object',
        properties: {
          paneId: { type: 'string', description: 'browser pane id (optional)' },
          mode: {
            type: 'string',
            description: "'text' (default) = page text; 'link' = list of links; 'html' = raw HTML",
          },
        },
      },
    },
    run: async (args) => {
      const paneId = await paneBrowserId(String(args.paneId ?? ''));
      const mode = String(args.mode ?? 'text');
      if (mode === 'link') {
        const js = `JSON.stringify(Array.from(document.querySelectorAll('a[href]')).slice(0,80).map(a=>a.innerText.trim().slice(0,80)+' -> '+a.href).filter(s=>s.length>6))`;
        return await cmd.browserPaneEval(paneId, js);
      }
      if (mode === 'html') {
        return (await cmd.browserPaneEval(paneId, 'document.documentElement.outerHTML.slice(0,20000)')) || '(empty)';
      }
      return bacaHalaman(paneId);
    },
  },
  {
    spec: {
      name: 'browser_click',
      description:
        'Click an element in the browser pane. Pick the element by CSS selector or by visible text. Returns the page contents after the click, so you know the result without calling browser_read again.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector, e.g. "button.login" or "#submit"' },
          teks: { type: 'string', description: 'button/link text (used when no selector is given)' },
          paneId: { type: 'string', description: 'browser pane id (optional)' },
        },
      },
    },
    run: async (args) => {
      const paneId = await paneBrowserId(String(args.paneId ?? ''));
      const sel = String(args.selector ?? '').trim();
      const teks = String(args.teks ?? '').trim();
      if (!sel && !teks) throw new Error('browser_click: give a selector or some text');
      // Show what is about to be clicked. Without it the page changes with no
      // visible cause, which reads as a glitch to anyone watching the pane.
      if (sel) {
        try {
          await cmd.browserPaneCursor(paneId, sel);
        } catch {
          /* the ring is cosmetic; a failure must not block the click */
        }
      }
      const js = sel
        ? `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO ELEMENT: '+${JSON.stringify(sel)};e.scrollIntoView({block:'center'});e.click();return 'clicked: '+(e.innerText||e.value||e.tagName).slice(0,60);})()`
        : `(function(){var t=${JSON.stringify(teks)};var k=Array.from(document.querySelectorAll('a,button,input[type=submit],[role=button]'));var e=k.find(function(x){return (x.innerText||x.value||'').trim().toLowerCase().indexOf(t.toLowerCase())>=0;});if(!e)return 'NO ELEMENT with text: '+t;e.scrollIntoView({block:'center'});e.click();return 'clicked: '+(e.innerText||e.value||'').slice(0,60);})()`;
      const hasil = await cmd.browserPaneEval(paneId, js);
      if (String(hasil).startsWith('NO ELEMENT')) return String(hasil);
      await new Promise((r) => setTimeout(r, 1200));
      return `action: ${hasil}\n\n${await bacaHalaman(paneId)}`;
    },
  },
  {
    spec: {
      name: 'browser_type',
      description:
        'Fill an input in the browser pane and then press Enter. Returns the page contents afterwards.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the input/textarea' },
          teks: { type: 'string', description: 'the text to type' },
          enter: { type: 'boolean', description: 'press Enter after typing (default true)' },
          paneId: { type: 'string', description: 'browser pane id (optional)' },
        },
        required: ['selector', 'teks'],
      },
    },
    run: async (args) => {
      const paneId = await paneBrowserId(String(args.paneId ?? ''));
      const sel = String(args.selector ?? '');
      const teks = String(args.teks ?? '');
      const enter = args.enter !== false;
      const js = `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO ELEMENT: '+${JSON.stringify(sel)};e.focus();var d=Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value');if(d&&d.set)d.set.call(e,${JSON.stringify(teks)});else e.value=${JSON.stringify(teks)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));${enter ? "e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));var f=e.form;if(f&&f.requestSubmit)f.requestSubmit();" : ''}return 'filled: '+${JSON.stringify(sel)};})()`;
      const hasil = await cmd.browserPaneEval(paneId, js);
      if (String(hasil).startsWith('NO ELEMENT')) return String(hasil);
      await new Promise((r) => setTimeout(r, 1500));
      return `action: ${hasil}\n\n${await bacaHalaman(paneId)}`;
    },
  },
  {
    spec: {
      name: 'browser_nav',
      description: 'Navigate the browser pane: back, forward, reload, or go to another URL.',
      parameters: {
        type: 'object',
        properties: {
          aksi: {
            type: 'string',
            description: "'back' | 'forward' | 'reload' | a full URL",
          },
          paneId: { type: 'string', description: 'browser pane id (optional)' },
        },
        required: ['aksi'],
      },
    },
    run: async (args) => {
      const paneId = await paneBrowserId(String(args.paneId ?? ''));
      const aksi = String(args.aksi ?? '').trim();
      if (!aksi) throw new Error('browser_nav: aksi is empty');
      await cmd.browserPaneNav(paneId, aksi);
      await new Promise((r) => setTimeout(r, 1200));
      return bacaHalaman(paneId);
    },
  },
  {
    spec: {
      name: 'web_search',
      description:
        'Search the internet. Use this for things that change over time or are outside your knowledge: the latest news, prices, release versions, documentation, current events. Returns title + URL + snippet; call web_fetch to read the pages that look interesting.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'search keywords' },
          maxResults: { type: 'number', description: 'number of results, 1-20 (default 8)' },
        },
        required: ['query'],
      },
    },
    run: async (args) => {
      const q = String(args.query ?? '').trim();
      if (!q) throw new Error('web_search: query is empty');
      const n = Number(args.maxResults ?? 8);
      const hasil = await cmd.webSearch(q, Number.isFinite(n) ? n : 8);
      if (hasil.length === 0) return `No results for: ${q}`;
      return hasil
        .map(
          (h, i) =>
            `${i + 1}. ${h.judul}\n   ${h.url}${h.cuplikan ? `\n   ${h.cuplikan}` : ''}`,
        )
        .join('\n\n');
    },
  },
  {
    spec: {
      name: 'web_fetch',
      description:
        'Fetch one web page and return its text (the HTML tags are stripped). Use it after web_search to read a source in full, or directly when you already know the URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'full URL, must be http:// or https://' },
          maxChars: { type: 'number', description: 'character limit, 500-60000 (default 12000)' },
        },
        required: ['url'],
      },
    },
    run: async (args) => {
      const url = String(args.url ?? '').trim();
      if (!url) throw new Error('web_fetch: url is empty');
      const n = Number(args.maxChars ?? 12000);
      return await cmd.webFetch(url, Number.isFinite(n) ? n : 12000);
    },
  },
  {
    spec: {
      name: 'browser_download_url',
      description:
        'Download an http(s) URL directly to a workspace-safe file using the app backend. This is explicitly a direct URL download, not a browser-context download and does not observe browser download events. The destination is bounded to 100 MB and committed atomically.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full http:// or https:// URL' },
          destination: { type: 'string', description: 'Destination file path, inside the workspace or another already allowed path' },
        },
        required: ['url', 'destination'],
      },
    },
    run: async (args) => {
      const url = String(args.url ?? '').trim();
      const destination = String(args.destination ?? '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('browser_download_url: URL must use http:// or https://');
      if (!destination) throw new Error('browser_download_url: destination is required');
      const result = await cmd.browserDownloadUrl(url, destination);
      return `Direct download complete: ${result.path} (${result.bytes} verified bytes). This was not a browser-context download.`;
    },
  },
  {
    spec: {
      name: 'browser_list',
      description: 'List the browser panes that are currently open, with their URL and title.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const t = useTerminal.getState();
      const panes = t.allPanes().filter((p) => p.kind === 'browser');
      if (panes.length === 0) return 'No browser pane is open.';
      const baris: string[] = [];
      for (const p of panes) {
        let info = '';
        try {
          const i = await cmd.browserPaneInfo(p.id);
          info = `${i.title || '(no title)'} | ${i.url}`;
        } catch {
          info = '(webview not ready yet)';
        }
        baris.push(`- ${p.id}: ${info}`);
      }
      return baris.join('\n');
    },
  },
  {
    spec: {
      name: 'subagent_list',
      description:
        'List the subagents you can delegate to: the six built-in roles (Search, Review, Plan, Audit, Work, Explore) and any custom subagents the user defined. Call this before subagent_run when a custom worker might fit the job — custom ones carry their own instructions and their own tool subset, and their names are not guessable.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const { PERAN } = await import('./subagentRoles');
      const { customAktif } = await import('./subagentCustom');
      const bawaan = PERAN.map((p) => `- ${p.label} (built-in) — ${p.hint}`);
      const kustom = customAktif();
      const barisKustom = kustom.length
        ? kustom.map((d) => `- ${d.nama} (custom) — ${d.deskripsi || 'no description'}; tools: ${d.alat.join(', ') || 'none'}`)
        : ['(no custom subagents defined yet)'];
      return (
        'Built-in roles:\n' +
        bawaan.join('\n') +
        '\n\nCustom subagents (pass the name in subagent_run\'s "agent"):\n' +
        barisKustom.join('\n')
      );
    },
  },
  {
    spec: {
      name: 'subagent_run',
      description:
        'Run several tasks as parallel subagents (one task per line). Automatic routing chooses a suitable configured model per task. An explicit [model:provider/model] task tag or a manual worker/batch model wins over auto routing; no API keys are exposed. Use this to break up complex work into parts that run at the same time. The nesting depth is limited (a subagent cannot keep calling subagents forever). If a custom subagent suits the work, name it in "agent" (call subagent_list to see them) and every task in this batch runs under it; otherwise the role is picked from the task wording.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'the task list; each item becomes one subagent',
          },
          /*
           * The custom subagent to run this batch under.
           *
           * A user-defined subagent is the point of defining one: it carries its
           * own instructions and its own tool subset. Without a way to name it
           * here, the agent could only ever reach the six built-in roles and the
           * custom ones existed for the UI alone. The name is matched loosely
           * (case-insensitive, id or display name) because it arrives from a
           * model that has just read a list of labels.
           */
          agent: {
            type: 'string',
            description:
              'Name or id of a custom subagent to run these tasks under (optional). See subagent_list.',
          },
          routing: {
            type: 'string',
            enum: ['auto', 'manual'],
            description: 'Optional routing mode. Defaults to auto for nested calls unless an explicit model tag or worker override is present.',
          },
        },
        required: ['tasks'],
      },
    },
    run: async (args) => {
      const tasks = Array.isArray(args.tasks)
        ? (args.tasks as unknown[]).map((t) => String(t)).filter((t) => t.trim())
        : [];
      if (tasks.length === 0) throw new Error('subagent_run: tasks is empty');
      if (subDepth >= MAX_SUB_DEPTH) {
        return `(rejected: the maximum subagent depth of ${MAX_SUB_DEPTH} is reached)`;
      }

      /*
       * A named subagent applies to the whole batch.
       *
       * The store already understands `[Name] task` lines, so naming the worker
       * here just prefixes every task with it — one syntax, one code path, and a
       * batch that the UI will show under the same worker it was asked for. A
       * name that matches nothing is reported back instead of being silently
       * dropped: the model asked for a specific worker, and running the work
       * under a different one without saying so is the kind of quiet
       * substitution that makes a result untrustworthy.
       */
      const diminta = typeof args.agent === 'string' ? args.agent.trim() : '';
      let tugas = tasks;
      if (diminta) {
        const { cariCustom } = await import('./subagentCustom');
        const cocok = cariCustom(diminta);
        if (!cocok) {
          const { customAktif } = await import('./subagentCustom');
          const ada = customAktif().map((d) => d.nama).join(', ') || '(none defined)';
          return `(no active subagent named "${diminta}". Available: ${ada})`;
        }
        tugas = tasks.map((t) => `[${cocok.nama}] ${t}`);
      }

      subDepth += 1;
      try {
        // Lazy import: avoid a module cycle (subagent uses agentTools).
        const { useSubAgent } = await import('./subagentStore');
        await useSubAgent.getState().jalankan(tugas, { bersarang: true, routing: args.routing === 'manual' ? 'manual' : 'auto' });
        const agents = useSubAgent.getState().agents;
        return (
          `Finished running ${agents.length} subagents.\n` +
          agents
            .map((a) => `## ${a.nama} [${a.status}]\n${a.hasil || a.error || '(no result)'}`)
            .join('\n\n')
        );
      } finally {
        subDepth -= 1;
      }
    },
  },
  {
    spec: {
      name: 'file_delete',
      description:
        'Delete files or folders from disk, recursively for a folder. Pass a list of paths. Use this instead of a shell rm/del: it is recorded, and a path outside the workspace is refused by the system.',
      parameters: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Absolute paths, or relative to the workspace root' },
          recursive: { type: 'boolean', description: 'Delete folders and everything inside them (default false)' },
        },
        required: ['paths'],
      },
    },
    run: async (args) => {
      const paths = Array.isArray(args.paths) ? (args.paths as unknown[]).map(String).filter((p) => p.trim()) : [];
      if (paths.length === 0) throw new Error('file_delete: paths is empty');
      await cmd.fsDelete(paths, args.recursive === true);
      return `Deleted ${paths.length} path(s):\n${paths.join('\n')}`;
    },
  },
  {
    spec: {
      name: 'file_move',
      description:
        'Move or rename a file or folder. Fails when the destination already exists, on purpose: an overwrite is not silently performed.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source path' },
          to: { type: 'string', description: 'Destination path' },
        },
        required: ['from', 'to'],
      },
    },
    run: async (args) => {
      const from = String(args.from ?? '').trim();
      const to = String(args.to ?? '').trim();
      if (!from || !to) throw new Error('file_move: from and to are required');
      await cmd.fsRename(from, to);
      return `Moved: ${from} -> ${to}`;
    },
  },
  {
    spec: {
      name: 'file_copy',
      description:
        'Copy a file or folder, recursively for a folder. Read the source, write the destination. Refuses to overwrite an existing destination.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source path' },
          to: { type: 'string', description: 'Destination path' },
        },
        required: ['from', 'to'],
      },
    },
    run: async (args) => {
      const from = String(args.from ?? '').trim();
      const to = String(args.to ?? '').trim();
      if (!from || !to) throw new Error('file_copy: from and to are required');
      // Copy is read-then-write: fs_copy is not a backend command. A folder is
      // walked and recreated, a file is read and written back.
      const info = await cmd.fsStat(from).catch(() => null);
      if (info && info.isDir) {
        /*
         * Refuse to copy a folder into its own subtree.
         *
         * `scanDir` only lists one level, so the walk below recurses with an
         * explicit stack — and a destination inside the source would make that
         * walk descend into the copies it just wrote, forever. Comparing the
         * normalized paths up front turns an infinite recursion (or a full
         * disk) into a clear error.
         */
        const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        const src = norm(from);
        const dst = norm(to);
        if (dst === src || dst.startsWith(`${src}/`)) {
          throw new Error(
            `file_copy: refusing to copy ${from} into its own subtree (${to}). ` +
              `Pick a destination outside the source folder.`,
          );
        }

        // Recreate the tree one level at a time: scanDir is not recursive, so
        // each folder is listed and its children queued in turn. Every read and
        // write still goes through the cmd.* wrappers, so the Rust side keeps
        // enforcing the workspace boundary on each path.
        await cmd.fsCreateDir(to);
        let n = 0;
        const tumpukan: { dari: string; ke: string }[] = [{ dari: from, ke: to }];
        while (tumpukan.length) {
          const { dari, ke } = tumpukan.pop() as { dari: string; ke: string };
          const isi = await cmd.scanDir(dari);
          for (const e of isi) {
            const srcPath = `${dari}/${e.name}`;
            const dstPath = `${ke}/${e.name}`;
            if (e.isDir) {
              await cmd.fsCreateDir(dstPath);
              tumpukan.push({ dari: srcPath, ke: dstPath });
              continue;
            }
            const r = await cmd.fsRead(srcPath);
            await cmd.fsWrite(await resolveWriteTarget(dstPath, r.content), r.content);
            n++;
          }
        }
        return `Copied folder: ${from} -> ${to} (${n} file(s), including subfolders)`;
      }
      const r = await cmd.fsRead(from);
      await cmd.fsWrite(to, r.content);
      return `Copied: ${from} -> ${to}`;
    },
  },
  {
    spec: {
      name: 'dir_create',
      description: 'Create a folder, including any missing parent folders. Does nothing if it already exists.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Folder path to create' } },
        required: ['path'],
      },
    },
    run: async (args) => {
      const path = String(args.path ?? '').trim();
      if (!path) throw new Error('dir_create: path is empty');
      await cmd.fsCreateDir(path);
      return `Folder ready: ${path}`;
    },
  },
  {
    spec: {
      name: 'find_files',
      description:
        'Find files by NAME inside the workspace (a substring match, case-insensitive), not by their contents. Use it to answer "where is the file called X". For a filename pattern use the glob form ("**/*.test.ts"). For what is inside the files, use search_text.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Name fragment, or a glob such as **/*.test.ts' },
          limit: { type: 'number', description: 'Maximum results (default 50, max 500)' },
        },
        required: ['pattern'],
      },
    },
    run: async (args) => {
      const pola = String(args.pattern ?? '').trim();
      if (!pola) throw new Error('find_files: pattern is empty');
      const limit = Math.max(1, Math.min(500, Number(args.limit ?? 50) || 50));
      const semua = await cmd.listWorkspaceFiles(0);
      if (!semua || semua.length === 0) {
        return (
          '(the workspace file index is empty, so there is nothing to search. ' +
          'The folder may still be loading. Use shell_exec with a recursive find, or file_read on a known path instead.)'
        );
      }
      const glob = pola.includes('*') || pola.includes('?');
      const re = glob
        ? new RegExp(
            '^' +
              pola
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*\*/g, '\u0000')
                .replace(/\*/g, '[^/]*')
                .replace(/\u0000/g, '.*')
                .replace(/\?/g, '.') +
              '$',
            'i',
          )
        : null;
      const bawah = pola.toLowerCase();
      const hasil = semua
        .filter((f) => (re ? re.test(f.rel) : f.rel.toLowerCase().includes(bawah) || f.name.toLowerCase().includes(bawah)))
        .slice(0, limit);
      if (hasil.length === 0) return `(no file matches "${pola}")`;
      return `${hasil.length} of ${semua.length} file(s):\n${hasil.map((f) => f.rel).join('\n')}`;
    },
  },
  {
    spec: {
      name: 'replace_in_files',
      description:
        'Replace text or a regex across one file. Prefer this over repeated file_edit calls when the same change lands in many places in one file, or when the file is large. Returns how many replacements were made. This cannot be undone by the editor, so read the file first.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File to change' },
          query: { type: 'string', description: 'Text to find' },
          replacement: { type: 'string', description: 'Replacement text' },
          regex: { type: 'boolean', description: 'Treat query as a regular expression (default false)' },
          caseSensitive: { type: 'boolean', description: 'Match case (default true)' },
        },
        required: ['path', 'query', 'replacement'],
      },
    },
    run: async (args) => {
      const path = String(args.path ?? '').trim();
      const query = String(args.query ?? '');
      if (!path || !query) throw new Error('replace_in_files: path and query are required');
      const n = await cmd.replaceInFile(path, query, String(args.replacement ?? ''), {
        regex: args.regex === true,
        caseSensitive: args.caseSensitive !== false,
      });
      return n === 0 ? `No match for the query in ${path}. The file is unchanged.` : `Replaced ${n} occurrence(s) in ${path}.`;
    },
  },
  {
    spec: {
      name: 'open_file',
      description:
        'Open a file in an editor tab and make it active. Call this before editor_write or editor_read when you need to work on a specific file: those tools act on the ACTIVE tab, so without opening it first you would read or overwrite whatever the user happens to have in front of them.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File to open' } },
        required: ['path'],
      },
    },
    run: async (args) => {
      const path = String(args.path ?? '').trim();
      if (!path) throw new Error('open_file: path is empty');
      const { useWs } = await import('./workspaceStore');
      const ok = await useWs.getState().bukaFile(path);
      return ok ? `Opened in the editor: ${path}` : `Could not open ${path}. Check that the file exists.`;
    },
  },
  {
    spec: {
      name: 'terminal_kill',
      description:
        'Stop a terminal pane: interrupt it first (Ctrl-C to the foreground process) and then kill the session. Use it to free a port held by a dev server you started earlier. Pass pane (index or id from list_panes); with no pane it targets the agent pane.',
      parameters: {
        type: 'object',
        properties: {
          pane: { type: 'string', description: 'Pane index (0, 1, 2) or pane id. Default: the agent pane.' },
        },
      },
    },
    run: async (args) => {
      const panes = useTerminal.getState().allPanes();
      const pilih = String(args.pane ?? '').trim();
      let target = panes.find((p) => p.kind === 'agent') ?? panes.find((p) => p.kind !== 'browser');
      if (pilih) {
        const idx = Number(pilih);
        target = Number.isInteger(idx) && panes[idx] ? panes[idx] : panes.find((p) => p.id === pilih);
      }
      if (!target) return '(no terminal pane is open)';
      let dibunuh = 0;
      try {
        dibunuh = await cmd.ptyInterrupt(target.id);
      } catch {
        /* already gone */
      }
      useTerminal.getState().killPane(target.id);
      return `Stopped pane ${target.id}${dibunuh ? ` (${dibunuh} child process(es) killed)` : ''}.`;
    },
  },
  {
    spec: {
      name: 'terminal_wait',
      description:
        'Wait for text to appear in a terminal pane, then return the lines around it. Use it after terminal_exec when the command takes time (a build, a server starting up): it waits for the marker instead of guessing with a sleep. Give it the string you expect, for example "ready in" or "Compiled".',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to wait for (matched against the pane scrollback)' },
          pane: { type: 'string', description: 'Pane index or id. Default: the agent pane.' },
          timeoutMs: { type: 'number', description: 'How long to wait (default 30000, max 600000)' },
          maxLines: { type: 'number', description: 'Lines to return around the match (default 40)' },
        },
        required: ['text'],
      },
    },
    run: async (args) => {
      const teks = String(args.text ?? '').trim();
      if (!teks) throw new Error('terminal_wait: text is empty');
      const timeoutMs = Math.max(1000, Math.min(600000, Number(args.timeoutMs ?? 30000) || 30000));
      const maxLines = Math.max(1, Math.min(2000, Number(args.maxLines ?? 40) || 40));
      const panes = useTerminal.getState().allPanes();
      const pilih = String(args.pane ?? '').trim();
      let target = panes.find((p) => p.kind === 'agent') ?? panes.find((p) => p.kind !== 'browser');
      if (pilih) {
        const idx = Number(pilih);
        target = Number.isInteger(idx) && panes[idx] ? panes[idx] : panes.find((p) => p.id === pilih);
      }
      if (!target) return '(no terminal pane is open)';
      const mulai = Date.now();
      while (Date.now() - mulai < timeoutMs) {
        try {
          const tail = await cmd.ptyTail(target.id, 400);
          if (tail && tail.includes(teks)) {
            const baris = tail.split('\n');
            return `"${teks}" appeared after ${Date.now() - mulai} ms in pane ${target.id}.\n\n${baris.slice(-maxLines).join('\n')}`;
          }
        } catch {
          /* pane may be exiting */
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      let ekor = '';
      try {
        ekor = (await cmd.ptyTail(target.id, maxLines)) || '';
      } catch {
        /* gone */
      }
      return `Timed out after ${timeoutMs} ms waiting for "${teks}" in pane ${target.id}. Last lines:\n\n${ekor}`;
    },
  },
  {
    spec: {
      name: 'pane_control',
      description:
        'Manage terminal panes and the layout. action=open opens a new pane (kind shell or browser); close closes a pane by id; focus brings a tab forward; list shows panes with their liveness. Use it when the work needs a second terminal, or to clean up panes you opened yourself.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['open', 'close', 'focus', 'list'], description: 'What to do' },
          pane: { type: 'string', description: 'Pane index or id (close, focus)' },
          kind: { type: 'string', enum: ['shell', 'browser'], description: 'Pane kind for open (default shell)' },
          cwd: { type: 'string', description: 'Working folder for a new shell pane' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const aksi = String(args.action ?? '').trim();
      const panes = useTerminal.getState().allPanes();
      const pilih = String(args.pane ?? '').trim();
      const cari = () => {
        if (!pilih) return null;
        const idx = Number(pilih);
        return Number.isInteger(idx) && panes[idx] ? panes[idx] : panes.find((p) => p.id === pilih) ?? null;
      };
      if (aksi === 'list') {
        const hidup = await cmd.ptyList().catch(() => []);
        if (panes.length === 0) return '(no pane is open)';
        return panes
          .map((p, i) => {
            const info = hidup.find((x) => x.id === p.id);
            return `${i}. ${p.kind} ${p.id} [${info ? (info.alive ? 'alive' : 'dead') : p.status}] ${p.title}${p.cwd ? ' cwd=' + p.cwd : ''}`;
          })
          .join('\n');
      }
      if (aksi === 'open') {
        const kind = args.kind === 'browser' ? 'browser' : 'shell';
        const id = await useTerminal.getState().addPane(kind);
        useTerminal.getState().setVisible(true);
        /*
         * addPane takes no cwd: a shell pane starts in the workspace root.
         * When the caller asked for another folder, move the pane there once
         * it is alive, which is the same thing the user would type.
         */
        const cwd = String(args.cwd ?? '').trim();
        if (id && cwd) {
          try {
            await cmd.ptyWrite(id, `cd ${JSON.stringify(cwd)}\r`);
          } catch {
            /* the pane may already have exited */
          }
        }
        return `Opened ${kind} pane: ${id ?? '(refused: the pane limit is reached)'}${cwd ? ` in ${cwd}` : ''}`;
      }
      const target = cari();
      if (!target) return `(no pane matches "${pilih}". Call pane_control with action=list first.)`;
      if (aksi === 'close') {
        await useTerminal.getState().closePane(target.id);
        return `Closed pane ${target.id}.`;
      }
      if (aksi === 'focus') {
        const tab = useTerminal.getState().activeTab();
        if (tab) useTerminal.getState().setActivePane(tab.id, target.id);
        useTerminal.getState().setVisible(true);
        return `Focused pane ${target.id}.`;
      }
      return `(unknown action "${aksi}")`;
    },
  },
  {
    spec: {
      name: 'git',
      description:
        'Run a git action through the editor\'s own git layer (the same one the Source Control panel uses). Only the listed actions exist; for anything else use shell_exec. stage and unstage take paths; commit takes a message and does not push.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'status', 'stage', 'unstage', 'commit', 'diff', 'log', 'discard',
              'branches', 'checkout', 'create_branch', 'fetch', 'pull', 'stash_list', 'stash_push', 'stash_pop', 'rebase_status', 'rebase_continue', 'rebase_abort', 'blame', 'conflict_read', 'push',
            ],
            description: 'Git action',
          },
          paths: { type: 'array', items: { type: 'string' }, description: 'Paths (stage, unstage, discard)' },
          message: { type: 'string', description: 'Commit message (commit)' },
          branch: { type: 'string', description: 'Branch name (checkout, create_branch)' },
          from: { type: 'string', description: 'Branch or ref to start from (create_branch, defaults to HEAD)' },
          setUpstream: { type: 'boolean', description: 'Pass --set-upstream on push' },
          path: { type: 'string', description: 'Path for diff' },
          staged: { type: 'boolean', description: 'Diff against the index instead of the working tree (diff)' },
          n: { type: 'number', description: 'How many commits for log (default 20), or stash index for stash_pop' },
          onto: { type: 'string', description: 'Target branch/ref for rebase' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const aksi = String(args.action ?? '').trim();
      const paths = Array.isArray(args.paths) ? (args.paths as unknown[]).map(String) : [];
      if (aksi === 'status') {
        const s = await cmd.gitStatus();
        if (!s.isRepo) return '(this folder is not a git repository)';
        const daftar = s.changes.map((c) => `${c.status} ${c.path}`).join('\n') || '(clean)';
        return `branch: ${s.branch ?? '(detached)'}${s.upstream ? ` -> ${s.upstream} (ahead ${s.ahead}, behind ${s.behind})` : ''}\n${daftar}`;
      }
      if (aksi === 'stage') {
        if (paths.length === 0) throw new Error('git stage: paths is empty');
        await cmd.gitStage(paths);
        return `Staged ${paths.length} path(s).`;
      }
      if (aksi === 'unstage') {
        if (paths.length === 0) throw new Error('git unstage: paths is empty');
        await cmd.gitUnstage(paths);
        return `Unstaged ${paths.length} path(s).`;
      }
      if (aksi === 'commit') {
        const message = String(args.message ?? '').trim();
        if (!message) throw new Error('git commit: message is empty');
        const out = await cmd.gitCommit(message);
        return `Committed (not pushed).\n${out}`;
      }
      if (aksi === 'diff') {
        const path = String(args.path ?? '').trim();
        if (!path) throw new Error('git diff: path is required');
        const d = await cmd.gitDiff(path, args.staged === true);
        return d.trim() ? d : `(no diff for ${path})`;
      }
      if (aksi === 'log') {
        const n = Math.max(1, Math.min(100, Number(args.n ?? 20) || 20));
        const log = await cmd.gitLog(n);
        return log.map((c) => `${c.hash7} ${c.subject}  (${c.author})`).join('\n') || '(no commits)';
      }
      if (aksi === 'discard') {
        if (paths.length === 0) throw new Error('git discard: paths is empty');
        await cmd.gitDiscard(paths);
        return `Discarded changes in ${paths.length} path(s). This cannot be undone.`;
      }
      if (aksi === 'branches') {
        const b = await cmd.gitBranches();
        const local = b.locals.map((n) => (n === b.current ? `* ${n}` : `  ${n}`)).join('\n') || '(none)';
        const remote = b.remotes.length ? `\nremote:\n${b.remotes.map((n) => `  ${n}`).join('\n')}` : '';
        return `current: ${b.current ?? '(detached)'}\nlocal:\n${local}${remote}`;
      }
      if (aksi === 'checkout') {
        const branch = String(args.branch ?? '').trim();
        if (!branch) throw new Error('git checkout: branch is required');
        await cmd.gitCheckout(branch);
        return `Switched to ${branch}.`;
      }
      if (aksi === 'create_branch') {
        const branch = String(args.branch ?? '').trim();
        if (!branch) throw new Error('git create_branch: branch is required');
        const from = String(args.from ?? '').trim() || undefined;
        await cmd.gitCreateBranch(branch, from);
        return `Created ${branch} from ${from ?? 'HEAD'}. Still on the previous branch; use checkout to switch.`;
      }
      if (aksi === 'fetch') {
        return `Fetched.\n${await cmd.gitFetch()}`;
      }
      if (aksi === 'pull') return `Pulled from the configured upstream.\n${await cmd.gitPull(false)}`;
      if (aksi === 'stash_list') {
        const stashes = await cmd.gitStashList();
        return stashes.length ? stashes.map((stash) => `${stash.index}: ${stash.message}`).join('\n') : '(no stashes)';
      }
      if (aksi === 'stash_push') {
        const message = args.message ? String(args.message).trim() : undefined;
        const ok = await cmd.gitStashSave(message);
        return ok ? `Stash created${message ? `: ${message}` : ''}.` : 'The backend did not create a stash.';
      }
      if (aksi === 'stash_pop') {
        const index = Number(args.n ?? 0);
        if (!Number.isInteger(index) || index < 0) throw new Error('git stash_pop: n must be a non-negative stash index');
        const ok = await cmd.gitStashPop(index);
        return ok ? `Stash ${index} popped.` : `Stash ${index} was not popped by the backend.`;
      }
      if (aksi === 'rebase_status') return `Rebase in progress: ${await cmd.gitRebaseStatus() ? 'yes' : 'no'}.`;
      if (aksi === 'rebase_continue') return `Rebase continue result:\n${await cmd.gitRebaseContinue()}`;
      if (aksi === 'rebase_abort') return `Rebase abort result:\n${await cmd.gitRebaseAbort()}`;
      if (aksi === 'blame') {
        const path = String(args.path ?? '').trim();
        if (!path) throw new Error('git blame: path is required');
        const lines = await cmd.gitBlame(path);
        return lines.map((line) => `${line.line} ${line.hash.slice(0, 8)} ${line.author}: ${line.summary}`).join('\n') || `(no blame data for ${path})`;
      }
      if (aksi === 'conflict_read') {
        const path = String(args.path ?? '').trim();
        if (!path) throw new Error('git conflict_read: path is required');
        return JSON.stringify({ path, hunks: await cmd.gitConflictRead(path) });
      }
      if (aksi === 'push') {
        return `Pushed (not a dry run).\n${await cmd.gitPush(args.setUpstream === true)}`;
      }
      throw new Error(`git: unknown action "${aksi}"`);
    },
  },
  {
    spec: {
      name: 'ssh',
      description:
        'Saved SSH hosts: list them, or open one as a terminal tab and return its pane id. After connecting, run commands there with terminal_exec by passing that pane, and read them with terminal_read. The password never leaves the system keyring.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'connect'], description: 'list the saved hosts, or connect to one' },
          host: { type: 'string', description: 'Host id or name from the list (connect)' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const aksi = String(args.action ?? '').trim();
      if (aksi === 'list') {
        const hosts = await cmd.sshList();
        if (hosts.length === 0) return '(no saved SSH host. The user adds one from the SSH panel.)';
        return hosts.map((h) => `${h.id}  ${h.name}  ${h.user}@${h.host}:${h.port}  auth=${h.auth}`).join('\n');
      }
      if (aksi === 'connect') {
        const diminta = String(args.host ?? '').trim();
        if (!diminta) throw new Error('ssh connect: host is required');
        const hosts = await cmd.sshList();
        const bawah = diminta.toLowerCase();
        const cocok = hosts.find((h) => h.id === diminta) ?? hosts.find((h) => h.name.toLowerCase() === bawah) ?? hosts.find((h) => h.name.toLowerCase().includes(bawah));
        if (!cocok) {
          return `(no saved SSH host matches "${diminta}". Available: ${hosts.map((h) => h.name).join(', ') || '(none)'})`;
        }
        const paneId = await cmd.sshConnect(cocok.id);
        return `Connected to ${cocok.name} as pane ${paneId}. Use terminal_exec with pane="${paneId}" to run commands there.`;
      }
      throw new Error(`ssh: unknown action "${aksi}"`);
    },
  },
  {
    spec: {
      name: 'read_image',
      description:
        'Read an image file (PNG, JPEG, GIF, WebP, BMP, AVIF) as a picture, so you can look at a screenshot, a mockup, or a rendered diagram. Use it when the answer is in the picture rather than in text. It returns the image to the conversation; a text file should go through file_read instead.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Image file path' } },
        required: ['path'],
      },
    },
    run: async (args) => {
      const path = String(args.path ?? '').trim();
      if (!path) throw new Error('read_image: path is empty');
      const g = await cmd.bacaGambar(path);
      const mb = (g.bytes / 1024 / 1024).toFixed(2);
      /*
       * A tool result is a string, and the UI renders it as text, so the bytes
       * cannot travel back through the normal result channel. They are parked
       * on a module-level queue instead, and the agent loop drains that queue
       * into an images field on the next turn — the same shape a
       * user-attached image takes. Returning base64 inline would put a
       * megabyte of text into the transcript and re-send it on every later
       * step.
       */
      gambarMenunggu.push(g.base64);
      const sisa = MAX_GAMBAR_MENUNGGU - gambarMenunggu.length;
      return (
        `Image read: ${path} (${g.lebar}x${g.tinggi}, ${mb} MB). ` +
        `It is attached to the next turn as a picture.` +
        (sisa <= 0 ? ' The attachment limit is reached; earlier images may be dropped.' : '')
      );
    },
  },
  {
    spec: {
      name: 'workspace',
      description:
        'The open workspace folder. action=info returns the current root and its name; action=open switches to another folder (the user is asked to confirm, and it is a large change, so do it only when asked).',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['info', 'open', 'files'], description: 'What to do' },
          path: { type: 'string', description: 'Folder to open (open)' },
          limit: { type: 'number', description: 'Maximum files for action=files (default 200, max 2000)' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const aksi = String(args.action ?? '').trim();
      const { useWs } = await import('./workspaceStore');
      const w = useWs.getState();
      const root = w.activeRoot ?? null;
      const daftarRoot = (w.roots ?? []).map((r) => (typeof r === 'string' ? r : r?.path)).filter(Boolean);
      if (aksi === 'info') {
        return `active root: ${root ?? '(no folder open)'}\nall roots: ${daftarRoot.join(', ') || '(none)'}\ntrusted: ${w.trusted}`;
      }
      if (aksi === 'files') {
        const limit = Math.max(1, Math.min(2000, Number(args.limit ?? 200) || 200));
        const semua = await cmd.listWorkspaceFiles(limit);
        if (!semua || semua.length === 0) {
          return `(the workspace file index is empty. root: ${root ?? '(none)'}. The folder may still be loading, or it holds no files.)`;
        }
        return `${semua.length} file(s) in the workspace:\n${semua.map((f) => f.rel).join('\n')}`;
      }
      if (aksi === 'open') {
        const path = String(args.path ?? '').trim();
        if (!path) throw new Error('workspace open: path is required');
        await cmd.workspaceOpen(path);
        await useWs.getState().muat();
        return `Workspace opened: ${path}`;
      }
      throw new Error(`workspace: unknown action "${aksi}"`);
    },
  },
  {
    spec: {
      name: 'worktree',
      description:
        'Manage git worktrees: several branches checked out side by side in their own folders. Use it when a second branch has to be worked on (or built) without disturbing the folder that is open. action=list shows the trees; add creates one, optionally with a new branch (createBranch + from); remove deletes one (force marks it removable even with local changes); prune drops the records of trees that were deleted by hand; open returns what is needed to work inside one.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'remove', 'prune', 'open'], description: 'What to do' },
          path: { type: 'string', description: 'Folder of the worktree (add, remove, open)' },
          branch: { type: 'string', description: 'Branch to check out there (add)' },
          createBranch: { type: 'boolean', description: 'Create the branch instead of using an existing one (add)' },
          from: { type: 'string', description: 'Commit or branch the new branch starts from (add, optional)' },
          force: { type: 'boolean', description: 'Remove even with local changes (remove)' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const aksi = String(args.action ?? '').trim();
      if (aksi === 'list') {
        const list = await cmd.worktreeList();
        if (list.length === 0) return '(no worktree is registered)';
        return list
          .map((w) => {
            const cabang = w.branch ? ` [${w.branch}]` : w.bare ? ' [bare]' : ' [detached]';
            return `- ${w.path}${cabang}${w.head ? ` ${w.head.slice(0, 7)}` : ''}${w.locked ? ' (locked)' : ''}`;
          })
          .join('\n');
      }
      if (aksi === 'add') {
        const path = String(args.path ?? '').trim();
        if (!path) throw new Error('worktree add: path is required');
        const branch = String(args.branch ?? '').trim();
        const dari = String(args.from ?? '').trim();
        const out = await cmd.worktreeAdd({
          path,
          branch: branch || undefined,
          createBranch: args.createBranch === true,
          from: dari || undefined,
        });
        return [
          `Worktree added at ${path}${branch ? ` on ${args.createBranch === true ? 'new branch' : 'branch'} ${branch}` : ''}.`,
          out,
          `Open a terminal there with pane_control (action=open, kind=shell, cwd="${path}").`,
        ]
          .filter((b) => b)
          .join('\n');
      }
      if (aksi === 'remove') {
        const path = String(args.path ?? '').trim();
        if (!path) throw new Error('worktree remove: path is required');
        const out = await cmd.worktreeRemove({ path, force: args.force === true });
        return `Worktree removed: ${path}.${args.force === true ? ' (forced)' : ''}\n${out}`;
      }
      if (aksi === 'prune') {
        const out = await cmd.worktreePrune();
        return `Pruned the worktree records.\n${out}`;
      }
      if (aksi === 'open') {
        const path = String(args.path ?? '').trim();
        if (!path) throw new Error('worktree open: path is required');
        const list = await cmd.worktreeList();
        const ada = list.find((w) => w.path.replace(/[\\/]+$/, '').toLowerCase() === path.replace(/[\\/]+$/, '').toLowerCase());
        if (!ada) {
          return `(no registered worktree at "${path}". Call worktree with action=list first.)`;
        }
        /*
         * `addPane` takes a kind and an agent, with no cwd, so a pane cannot be
         * created in a folder. The shell pane starts in the workspace root and
         * is then moved with the same `cd` the user would type, which is the
         * pattern pane_control already uses.
         */
        const { useTerminal: term } = await import('./terminalStore');
        const id = await term.getState().addPane('shell');
        if (!id) {
          return `Worktree ${ada.path} is open in the window, but the pane was refused (the pane limit is reached). The user has to open a terminal there by hand.`;
        }
        try {
          await cmd.ptyWrite(id, `cd ${JSON.stringify(ada.path)}\r`);
          // A successful write only means the keystrokes reached the shell.
          // Ask the shell for its cwd and verify the response before claiming
          // that this pane was opened in the worktree. This also works for SSH
          // panes, whose cwd is controlled by the remote shell.
          await cmd.ptyWrite(id, `pwd\r`);
          const expected = ada.path.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
          let verified = false;
          for (let attempt = 0; attempt < 10 && !verified; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const tail = await cmd.ptyTail(id, 80).catch(() => '');
            verified = tail
              .split(/\r?\n/)
              .map((line) => line.trim().replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase())
              .some((line) => line === expected || line.endsWith(`/${expected}`));
          }
          if (!verified) {
            term.getState().setVisible(true);
            return `Could not open worktree ${ada.path}: the terminal did not confirm its cwd after cd/pwd (pane ${id}).`;
          }
        } catch {
          term.getState().setVisible(true);
          return `Could not open worktree ${ada.path}: the terminal could not change directory or verify its cwd (pane ${id}).`;
        }
        term.getState().setVisible(true);
        return `Opened shell pane ${id} in worktree ${ada.path}.`;
      }
      throw new Error(`worktree: unknown action "${aksi}"`);
    },
  },
  {
    spec: {
      name: 'notes',
      description:
        'The user\'s Notes and Todos panel. Use it to read what was written down (action=list, optionally filtered by kind) and to keep it: add a note or a todo, edit the text of one, delete one, tick a todo on or off, or clear the finished todos. Ids come from list.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'edit', 'delete', 'toggle', 'clearDone'], description: 'What to do' },
          kind: { type: 'string', enum: ['notes', 'todos'], description: 'Which list (list, add)' },
          id: { type: 'string', description: 'Item id (delete, edit, toggle)' },
          text: { type: 'string', description: 'The text to write (add, edit)' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const aksi = String(args.action ?? '').trim();
      const { useNotesTodos, urutkan } = await import('./notesTodosStore');
      const s = useNotesTodos.getState();
      const kind = args.kind === 'notes' || args.kind === 'todos' ? args.kind : undefined;
      const format = (items: ReturnType<typeof urutkan>) =>
        items
          .map((i) => {
            const tanda = i.kind === 'todos' ? (i.selesai ? '[x]' : '[ ]') : '[note]';
            return `${i.id}  ${tanda}${i.pin ? ' [pin]' : ''}  ${i.teks}`;
          })
          .join('\n');
      if (aksi === 'list') {
        const semua = urutkan(s.items).filter((i) => !kind || i.kind === kind);
        if (semua.length === 0) return `(no ${kind ?? 'notes or todos'} yet)`;
        return `${semua.length} item(s):\n${format(semua)}`;
      }
      if (aksi === 'add') {
        const teks = String(args.text ?? '').trim();
        if (!teks) throw new Error('notes add: text is empty');
        const k = kind ?? 'todos';
        useNotesTodos.getState().tambah(k, teks);
        return `Added ${k === 'todos' ? 'todo' : 'note'}: ${teks}`;
      }
      if (aksi === 'clearDone') {
        const sebelum = useNotesTodos.getState().items.filter((i) => i.kind === 'todos' && i.selesai).length;
        useNotesTodos.getState().bersihSelesai();
        return `Cleared ${sebelum} finished todo(s).`;
      }
      const id = String(args.id ?? '').trim();
      if (!id) throw new Error(`notes ${aksi}: id is required`);
      const item = useNotesTodos.getState().items.find((i) => i.id === id);
      if (!item) {
        return `(no item with id "${id}". Call notes with action=list first.)`;
      }
      if (aksi === 'edit') {
        const teks = String(args.text ?? '').trim();
        if (!teks) throw new Error('notes edit: text is empty');
        useNotesTodos.getState().ubah(id, teks);
        return `Updated ${id}: ${teks}`;
      }
      if (aksi === 'delete') {
        useNotesTodos.getState().hapus(id);
        return `Deleted ${id} ("${item.teks}").`;
      }
      if (aksi === 'toggle') {
        if (item.kind !== 'todos') {
          return `"${item.teks}" is a note, so it has no done state.`;
        }
        useNotesTodos.getState().balikSelesai(id);
        return `${item.selesai ? 'Reopened' : 'Marked done'}: ${item.teks}`;
      }
      throw new Error(`notes: unknown action "${aksi}"`);
    },
  },
  {
    spec: {
      name: 'schedule_command',
      description:
        'Queue a shell command to run later on the app\'s own timer; it runs in a Zephyr terminal pane when it comes due, even after the conversation ends. Use it for "run the tests every morning" or "do this in ten minutes". The timer has minute granularity. action=create adds one (delaySeconds for a one-off, everyMinutes to repeat, atHour for a daily run at a clock hour), list shows them, delete removes one by id. Do not use it for something that should happen now: call shell_exec for that.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'delete'], description: 'What to do' },
          command: { type: 'string', description: 'Shell command to run (create)' },
          name: { type: 'string', description: 'Task name (create)' },
          delaySeconds: { type: 'number', description: 'Run this many seconds from now (create; rounded up to whole minutes)' },
          everyMinutes: { type: 'number', description: 'Repeat every N minutes (create)' },
          atHour: { type: 'number', description: 'Run daily at this hour, 0-23 (create)' },
          id: { type: 'string', description: 'Task id (delete; see list)' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const aksi = String(args.action ?? '').trim();
      if (aksi === 'list') {
        const list = await cmd.cronList();
        if (list.length === 0) return '(nothing is scheduled)';
        return list
          .map((j) => {
            const jadwal = j.every_minutes > 0 ? `every ${j.every_minutes}m` : `daily at ${j.at_hour}:00`;
            return `- ${j.id} "${j.name}" [${j.enabled ? 'enabled' : 'disabled'}] ${jadwal} → ${j.command}`;
          })
          .join('\n');
      }
      if (aksi === 'delete') {
        const id = String(args.id ?? '').trim();
        if (!id) throw new Error('schedule_command delete: id is required');
        await cmd.cronDelete(id);
        return `Deleted the scheduled task ${id}.`;
      }
      if (aksi === 'create') {
        const command = String(args.command ?? '').trim();
        if (!command) throw new Error('schedule_command create: command is required');
        const delay = args.delaySeconds === undefined ? 0 : Number(args.delaySeconds);
        const every = args.everyMinutes === undefined ? 0 : Number(args.everyMinutes);
        const atHour = args.atHour === undefined ? null : Number(args.atHour);
        /*
         * The scheduler counts in whole minutes, so a delay is rounded up: a
         * fifteen-second delay becomes one minute, never zero, and the answer
         * says so rather than letting the caller believe it was exact.
         */
        let menit = every > 0 ? Math.max(1, Math.round(every)) : 0;
        let pembulatan = '';
        if (menit === 0 && delay > 0) {
          menit = Math.max(1, Math.ceil(delay / 60));
          pembulatan = ` (delaySeconds ${delay} rounded up to ${menit} minute(s): the scheduler counts in whole minutes)`;
        }
        if (menit === 0 && atHour === null) {
          throw new Error('schedule_command create: give delaySeconds, everyMinutes or atHour');
        }
        const nama = String(args.name ?? '').trim() || `scheduled ${new Date().toLocaleString()}`;
        const job = await cmd.cronCreate({
          name: nama,
          command,
          everyMinutes: menit > 0 ? menit : undefined,
          atHour: atHour !== null ? atHour : undefined,
        });
        const jadwal = job.every_minutes > 0 ? `every ${job.every_minutes} minute(s)` : `daily at ${job.at_hour}:00`;
        return `Scheduled "${job.name}" (${jadwal}) id=${job.id}${pembulatan}\ncommand: ${job.command}`;
      }
      throw new Error(`schedule_command: unknown action "${aksi}"`);
    },
  },
  {
    spec: {
      name: 'focus_pane',
      description:
        'Bring a terminal pane to the front in the window, including a pane that lives in another tab: the tab is switched to and the pane becomes the active one. Give a paneId, or an index among all panes (see pane_control action=list), or a tabId; with none of them the current pane is brought forward.',
      parameters: {
        type: 'object',
        properties: {
          paneId: { type: 'string', description: 'Pane id (preferred)' },
          index: { type: 'number', description: 'Pane index among all panes' },
          tabId: { type: 'string', description: 'Tab to raise instead of a single pane' },
        },
      },
    },
    run: async (args) => {
      const t = useTerminal.getState();
      const tabs = t.terminalTabs;
      const paneId = String(args.paneId ?? '').trim();
      const tabId = String(args.tabId ?? '').trim();
      if (args.index !== undefined && !Number.isInteger(Number(args.index))) {
        throw new Error('focus_pane: index must be a whole number');
      }
      let tab = null as (typeof tabs)[number] | null;
      let pane = undefined as ReturnType<typeof t.findPane>;
      if (paneId) {
        pane = t.findPane(paneId);
        if (!pane) return `(no pane with id "${paneId}". Call pane_control with action=list first.)`;
        tab = tabs.find((x) => x.panes.some((p) => p.id === pane!.id)) ?? null;
      } else if (args.index !== undefined) {
        const semua = t.allPanes();
        pane = semua[Number(args.index)];
        if (!pane) return `(no pane at index ${args.index}; there are ${semua.length} pane(s).)`;
        tab = tabs.find((x) => x.panes.some((p) => p.id === pane!.id)) ?? null;
      } else if (tabId) {
        tab = tabs.find((x) => x.id === tabId) ?? null;
        if (!tab) return `(no tab with id "${tabId}".)`;
        pane = tab.panes.find((p) => p.id === tab!.activePaneId) ?? tab.panes[0];
      } else {
        tab = t.activeTab();
        if (!tab) return '(no terminal tab is open)';
        pane = tab.panes.find((p) => p.id === tab!.activePaneId) ?? tab.panes[0];
      }
      if (!tab) return `(the pane is not in any tab of the window.)`;
      if (!pane) {
        useTerminal.getState().setActiveTab(tab.id);
        useTerminal.getState().setVisible(true);
        return `Focused tab "${tab.title}" (it holds no pane).`;
      }
      useTerminal.getState().setActivePane(tab.id, pane.id);
      useTerminal.getState().setVisible(true);
      return `Focused pane "${pane.title}" (${pane.id}, ${pane.kind}) in tab "${tab.title}".`;
    },
  },
  {
    spec: {
      name: 'run_tests',
      description:
        'Run the project\'s test suite, or just detect which framework it uses. Use this instead of shell_exec for tests, so the result is parsed into counts and failing names rather than raw output.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['detect', 'run'], description: 'detect: which framework and command would run. run: actually execute them.' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const action = String(args.action ?? '');
      if (action === 'detect') {
        const fw = await testsApi.useTests.getState().detect();
        if (!fw) return 'No test framework detected in the workspace.';
        return `Framework: ${fw.label} (${fw.id})\nCommand: ${fw.command}`;
      }
      if (action !== 'run') return 'ERROR: action must be "detect" or "run".';
      const hasil = await testsApi.useTests.getState().jalankanSemua();
      if (!hasil) return 'ERROR: no test framework detected, so nothing was run.';
      const counts = hasil.counts ?? testsApi.hitungHasil(hasil.frameworkId, hasil.raw ?? '');
      const garisGagal = (hasil.raw ?? '')
        .split(/\r?\n/)
        .filter((l) => /\b(FAIL|FAILED|failures?:|panicked|assertion)/i.test(l))
        .slice(0, 15);
      return [
        `Framework: ${hasil.frameworkId}`,
        counts ? `Passed: ${counts.passed}  Failed: ${counts.failed}  Skipped: ${counts.skipped}  Total: ${counts.total}` : 'Counts could not be parsed from the output.',
        `Exit code: ${hasil.exitCode}  (${hasil.ok ? 'ok' : 'not ok'}${hasil.timedOut ? ', timed out' : ''})`,
        garisGagal.length ? `Failing lines:\n${garisGagal.map((l) => `  ${l.trim()}`).join('\n')}` : 'Failing lines: none matched.',
      ].join('\n');
    },
  },
  {
    spec: {
      name: 'debug',
      description:
        'Drive the debugger: start or stop a session, step, continue, pause, toggle a breakpoint, or read the current session state. Use it instead of guessing why code stops; it reports only what the debug adapter actually returned.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'stop', 'pause', 'continue', 'step_over', 'step_into', 'step_out', 'toggle_breakpoint', 'state'],
          },
          file: { type: 'string', description: 'For toggle_breakpoint: file path.' },
          line: { type: 'number', description: 'For toggle_breakpoint: 1-based line.' },
          name: { type: 'string', description: 'For start: launch configuration name.' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const action = String(args.action ?? '');
      const dbg = debugApi.useDebug.getState();
      const ringkas = () => {
        const s = debugApi.useDebug.getState();
        return `State: ${s.state}\nFrames: ${s.frames.length}${s.frames.length ? `\n  ${s.frames.slice(0, 5).map((f) => `${f.name} ${f.path}:${f.line}`).join('\n  ')}` : ''}`;
      };
      switch (action) {
        case 'state':
          return ringkas();
        case 'start': {
          const ok = await dbg.start(args.name ? String(args.name) : undefined);
          return ok ? `Debug session started.\n${ringkas()}` : 'ERROR: the debug session did not start. Check the launch configuration in the Debug panel.';
        }
        case 'stop':
          await dbg.stop();
          return 'Debug session stopped.';
        case 'pause':
        case 'continue':
        case 'step_over':
        case 'step_into':
        case 'step_out': {
          const map: Record<string, 'pause' | 'continue' | 'next' | 'stepIn' | 'stepOut'> = {
            pause: 'pause',
            continue: 'continue',
            step_over: 'next',
            step_into: 'stepIn',
            step_out: 'stepOut',
          };
          await dbg.kontrol(map[action]);
          return `${action} sent.\n${ringkas()}`;
        }
        case 'toggle_breakpoint': {
          const file = String(args.file ?? '');
          const line = Number(args.line ?? 0);
          if (!file || !Number.isFinite(line) || line < 1) return 'ERROR: toggle_breakpoint needs "file" and a positive "line".';
          await dbg.toggleBreakpoint(file, line);
          const ada = debugApi.useDebug.getState().breakpoints.some((b) => pathSama(b.path, file) && b.line === line);
          return `Breakpoint ${ada ? 'set' : 'cleared'} at ${file}:${line}.`;
        }
        default:
          return 'ERROR: unknown debug action.';
      }
    },
  },
  {
    spec: {
      name: 'lsp_query',
      description:
        'Ask the language server about a file: definition, references, hover, document symbols, or diagnostics. Read-only. Returns exactly what the server returned, including "no language server for this file".',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['definition', 'references', 'hover', 'symbols', 'diagnostics'] },
          file: { type: 'string', description: 'Absolute or workspace-relative path.' },
          line: { type: 'number', description: '1-based line.' },
          column: { type: 'number', description: '1-based column.' },
        },
        required: ['action', 'file'],
      },
    },
    run: async (args) => {
      const action = String(args.action ?? '');
      const file = String(args.file ?? '');
      if (!file) return 'ERROR: "file" is required.';
      const lsp = lspApi.useLsp.getState();
      const server = await lsp.ensureFor(file);
      if (!server) return `No language server is configured for ${file}, so nothing can be queried.`;
      const line = Math.max(0, Number(args.line ?? 1) - 1);
      const col = Math.max(0, Number(args.column ?? 1) - 1);
      const pos = { line, character: col };
      /*
       * The URI has to be a real `file:///` URI, not the raw path.
       *
       * `req()`'s own params take a path, but the LSP payload inside them is
       * built by callers, and every other caller in this repo goes through
       * `pathToUri()` (see lspCm.ts lspDefinition). A bare `D:\...` path is
       * rejected by real servers as a malformed URI, which would have made this
       * tool return nothing for a perfectly valid file.
       */
      const uri = pathToUri(file);
      const peta: Record<string, [string, Record<string, unknown>]> = {
        definition: ['textDocument/definition', { textDocument: { uri }, position: pos }],
        references: ['textDocument/references', { textDocument: { uri }, position: pos, context: { includeDeclaration: true } }],
        hover: ['textDocument/hover', { textDocument: { uri }, position: pos }],
        symbols: ['textDocument/documentSymbol', { textDocument: { uri } }],
        diagnostics: ['textDocument/diagnostic', { textDocument: { uri } }],
      };
      const entry = peta[action];
      if (!entry) return 'ERROR: unknown lsp_query action.';
      const hasil = await lsp.req(file, entry[0], entry[1]);
      if (hasil === undefined || hasil === null) return `${action}: the language server returned nothing for ${file}:${line + 1}:${col + 1}.`;
      const teks = typeof hasil === 'string' ? hasil : JSON.stringify(hasil, null, 2);
      return teks.length > 8000 ? `${teks.slice(0, 8000)}\n[truncated: result of ${teks.length} characters]` : teks;
    },
  },
  {
    spec: {
      name: 'run_task',
      description:
        'Run a task defined in the workspace task file (build, lint, dev, and so on), list them, or stop a running one. Use it instead of hand-writing the same command in shell_exec.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'run', 'stop'] },
          name: { type: 'string', description: 'Task label, exactly as listed.' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const action = String(args.action ?? '');
      const tasks = tasksApi.useTasks.getState();
      if (action === 'list') {
        const daftar = tasks.daftar();
        if (!daftar.length) return 'No tasks are defined in this workspace.';
        return daftar
          .map((t) => `${t.label}${t.command ? ` - ${t.command}${t.args?.length ? ` ${t.args.join(' ')}` : ''}` : ''}${t.dependsOn?.length ? ` (after: ${t.dependsOn.join(', ')})` : ''}`)
          .join('\n');
      }
      const nama = String(args.name ?? '').trim();
      if (!nama) return `ERROR: action "${action}" needs "name".`;
      if (action === 'run') {
        const sedang = tasks.runs.find((r) => r.label === nama && r.active);
        if (sedang) return `Task "${nama}" is already running (run ${sedang.id}); it was not started again.`;
        const run = await tasks.jalankan(nama);
        return run ? `Started task "${nama}" (run ${run.id}).` : `ERROR: task "${nama}" could not be started. Check the label in run_task({action:"list"}).`;
      }
      if (action === 'stop') {
        const aktif = tasks.runs.filter((r) => r.label === nama && r.active);
        if (!aktif.length) return `No running task named "${nama}".`;
        let n = 0;
        for (const r of aktif) if (await tasks.hentikan(r.id)) n++;
        return `Stopped ${n} run(s) of "${nama}".`;
      }
      return 'ERROR: unknown run_task action.';
    },
  },
  {
    spec: {
      name: 'snippets',
      description:
        'Read the snippet sets available for a language. Read-only: use it before writing code so a new insertion matches the project\'s own snippet style.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'load', 'langs'] },
          lang: { type: 'string', description: 'For load: the language id.' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      const action = String(args.action ?? '');
      if (action === 'langs') {
        const bahasa = await cmd.snippetsBuiltinLangs();
        return bahasa.length ? bahasa.join(', ') : 'No builtin snippet languages.';
      }
      if (action === 'list') {
        const berkas = await cmd.snippetsUserList();
        return berkas.length ? berkas.join('\n') : 'No user snippet files.';
      }
      if (action === 'load') {
        const lang = String(args.lang ?? '').trim();
        if (!lang) return 'ERROR: load needs "lang".';
        const isi = await cmd.snippetsLoad(lang);
        return isi ? JSON.stringify(isi, null, 2) : `No snippets for "${lang}".`;
      }
      return 'ERROR: unknown snippets action.';
    },
  },
  {
    spec: {
      name: 'keybindings',
      description:
        'Read the effective keybindings. Read-only: use it to answer "what is the shortcut for X" from real data instead of guessing.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get'] },
          command: { type: 'string', description: 'Optional command id to look up alone.' },
        },
        required: ['action'],
      },
    },
    run: async (args) => {
      if (String(args.action ?? '') !== 'get') return 'ERROR: unknown keybindings action.';
      const semua = await cmd.getKeybindings();
      const daftar = Object.entries(semua ?? {}).map(([kunci, command]) => `${kunci}  ->  ${command}`);
      const cari = String(args.command ?? '').trim().toLowerCase();
      if (cari) {
        const cocok = daftar.filter((d) => d.toLowerCase().includes(cari));
        return cocok.length ? cocok.join('\n') : `No binding matches "${args.command}".`;
      }
      if (!daftar.length) return 'No keybindings are set.';
      return daftar.length > 200 ? `${daftar.slice(0, 200).join('\n')}\n[truncated: ${daftar.length} bindings total]` : daftar.join('\n');
    },
  },
  {
    spec: {
      name: 'panel_focus',
      description:
        'Bring one bottom-panel tab to the front (problems, output, debug, terminal, ports, ai, subagents). Use it to show the user the evidence you are talking about.',
      parameters: {
        type: 'object',
        properties: {
          tab: { type: 'string', enum: ['problems', 'output', 'debug', 'terminal', 'ports', 'ai', 'subagents'] },
        },
        required: ['tab'],
      },
    },
    run: async (args) => {
      const tab = String(args.tab ?? '');
      const dikenal = usePanel.getState().visibleTabs.map((t) => String(t));
      if (!dikenal.includes(tab)) return `ERROR: "${tab}" is not an open panel tab. Open ones: ${dikenal.join(', ')}.`;
      usePanel.getState().focusTab(tab as PanelTabId);
      return `Focused the ${tab} panel tab.`;
    },
  },
];

/** Nested subagent depth, to prevent unbounded recursion. */
let subDepth = 0;
export const MAX_SUB_DEPTH = 2;

/**
 * Images a tool loaded, waiting to ride along on the next turn.
 *
 * A tool result can only carry text, so read_image parks the bytes here and
 * the caller drains them into the next message's images field. Capped at the
 * same limit the composer uses, so a loop of read_image calls cannot grow the
 * payload without bound.
 */
const gambarMenunggu: string[] = [];
const MAX_GAMBAR_MENUNGGU = 10;

/** Take the images a tool loaded since the last call, and clear the queue. */
export function ambilGambarMenunggu(): string[] {
  return gambarMenunggu.splice(0, gambarMenunggu.length).slice(0, MAX_GAMBAR_MENUNGGU);
}

/** Discard staged image bytes when an agent attempt cannot continue. */
export function clearGambarMenunggu(): void {
  gambarMenunggu.splice(0, gambarMenunggu.length);
}

/**
 * Tool names that are not safe for a read-only caller: they change files on
 * disk or in the editor, mutate shared state, or execute commands.
 *
 * This set is the single source of truth for the read-only gate. Both layers
 * draw on it: the spec filter in `agentToolSpecs` (write tools are not offered
 * at all) and the runtime refusal in subagentStore (a call that slips through
 * is refused). subagentStore imports it from here, so the two can never drift.
 */
export const TOOL_TULIS = new Set([
  'run_tests',
  'debug',
  'run_task',
  'panel_focus',
  'editor_write',
  'editor_save',
  'file_write',
  'file_edit',
  'file_patch',
  'file_delete',
  'file_move',
  'file_copy',
  'dir_create',
  'replace_in_files',
  'git',
  'settings',
  'extensions',
  'browser_close',
  'system_browser_open',
  'worktree',
  'notes',
  'schedule_command',
  // Execute arbitrary commands:
  'shell_exec',
  'terminal_exec',
  'terminal_kill',
  // Mutate the window/terminal layout:
  'pane_control',
  // Mutate shared agent state:
  'todo_write',
  // Write or delete durable state outside the workspace:
  'skill_write',
  'skill_delete',
  'memory_write',
  'cron_create',
  'cron_delete',
  /*
   * Reach outside the workspace. These were missed on the first pass because
   * "write" reads as "touches the disk", but a read-only caller must not be
   * able to run code anywhere either - and an external MCP server is the
   * widest hole of all, since the tool name and arguments are chosen by the
   * remote side. `browser_read` and `web_search` stay out on purpose: they
   * only fetch, so a read-only caller keeps them.
   */
  'mcp_call',
  'ssh',
  'browser_open',
  'browser_click',
  'browser_type',
  'browser_nav',
  'browser_download_url',
  /*
   * These do not touch the disk and do not execute anything, but they still
   * MUTATE state a read-only caller has no business changing: focus_pane steals
   * focus and switches tabs, open_file adds editor tabs (which can pull in
   * formatters and watchers), and workspace can switch or create a workspace
   * and so redirect where every later write lands. A read-only reviewer that
   * says "I only looked" must actually have only looked.
   */
  'focus_pane',
  'open_file',
  'workspace',
]);

/**
 * Tool specs for a caller. A read-only caller is not offered the write tools at
 * all, rather than being offered them and refused after the model has already
 * spent a turn on the call. The runtime still refuses a write attempt, so this
 * is the first of two layers, not the only one.
 */
export function agentToolSpecs(opsi?: {
  bolehTulis?: boolean;
  kedalaman?: number;
  /**
   * Hard allowlist, for a custom worker from Settings → Subagents.
   *
   * The built-in roles are gated on a single `bolehTulis` flag, which is enough
   * because they all draw from the same read-only pool. A custom worker picks
   * its own tools, so the flag is not enough: without this, a definition that
   * ticked only "read diagnostics" would still be handed the browser and the
   * cron tools. An allowlist also makes deletion meaningful — unticking a tool
   * actually takes it away.
   *
   * `subagent_run` is always added back: a worker with no way to delegate is
   * just a slower way to do the work inline.
   */
  alat?: string[];
}): AgentToolSpec[] {
  const boleh = opsi?.bolehTulis !== false;
  const bisaNested = (opsi?.kedalaman ?? 0) < MAX_SUB_DEPTH;
  const daftar = opsi?.alat;
  return AGENT_TOOLS.map((t) => t.spec).filter((s) => {
    /*
     * The allowlist and the read-only gate INTERSECT, they do not replace each
     * other. A custom worker definition is user-authored data, and an allowlist
     * that named `shell_exec` used to hand that tool to a caller whose write
     * flag was off. The deny-list always wins.
     */
    if (!boleh && TOOL_TULIS.has(s.name)) return false;
    if (!bisaNested && s.name === 'subagent_run') return false;
    if (daftar) {
      return daftar.includes(s.name);
    }
    return true;
  });
}

export async function jalankanAgentTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = AGENT_TOOLS.find((t) => t.spec.name === name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool.run(args);
}
