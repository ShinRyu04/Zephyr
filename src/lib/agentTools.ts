import * as cmd from './commands';
import { useStore } from './store';
import { useTerminal } from './terminalStore';
import { usePanel } from './panelStore';
import { writeChunked } from './terminalClipboard';
import { runAction } from './mcpStore';
import type { AgentToolSpec } from './types';

import { resetKonteksAgent, useAi } from './aiStore';
export interface AgentTool {
  spec: AgentToolSpec;
  run: (args: Record<string, unknown>) => Promise<string>;
}

export const AGENT_READ_LIMIT = 100 * 1024;

export const FILE_LIST_MAX = 300;

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

async function cariPaneTerminal(): Promise<string | null> {
  const t = useTerminal.getState();
  let pane = t
    .allPanes()
    .find((p) => p.status === 'live' && p.kind !== 'browser' && p.kind !== 'agent');
  if (!pane) {
    const id = await t.addPane('shell');
    if (!id) return null;

    await new Promise((r) => setTimeout(r, 700));
    // Read FRESH state: the old snapshot does not contain the pane we just
    // created, so findPane() on it fails and the tool reports
    // "cannot open pane".
    pane = useTerminal.getState().findPane(id);
  }
  return pane ? pane.id : null;
}

/**
 * Find a live browser pane, or create one if there is none yet.
 *
 * A browser pane MUST exist before a browser tool is used: the child webview
 * is created inside the pane, so without a pane there is nothing to attach to.
 * The pane is created through the same store the UI button uses, not a
 * separate path, so the layout keeps being handled by the grid.
 */
async function paneBrowserId(minta: string): Promise<string> {
  /*
   * Make sure the pane will actually be on screen before measuring it.
   *
   * A pane that lives in the store but sits in a hidden panel lays out at
   * 0x0, and a child webview is positioned in native window coordinates, so
   * measuring a hidden pane put it in the corner of the window over the
   * editor. The panel is opened and switched to the terminal tab first, and
   * the same steps the UI uses are reused rather than a parallel path.
   */
  const panel = usePanel.getState();
  panel.focusTab('terminal');
  await new Promise((r) => setTimeout(r, 250));

  const t = useTerminal.getState();
  if (minta && t.findPane(minta)) return minta;
  const ada = t.allPanes().find((p) => p.kind === 'browser');
  if (ada) return ada.id;
  const id = await t.addPane('browser');
  if (!id) throw new Error('cannot create a browser pane');
  // Wait for React to lay the new pane out before anything measures it.
  await new Promise((r) => setTimeout(r, 900));
  return id;
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

export const AGENT_TOOLS: AgentTool[] = [
  {
    spec: {
      name: 'shell_exec',
      description:
        'Run a command to completion and return the exit code plus output. Use this for non-interactive commands: test, build, typecheck, git, ls. The output is read from the process, not from the terminal screen, so it is never cut off by scrolling. Do not use it for a server or anything that keeps running; use terminal_exec for that.',
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
      const timeoutMs = args.timeoutMs === undefined ? undefined : Number(args.timeoutMs);
      const r = await cmd.agentExec(perintah, timeoutMs);
      const bagian: string[] = [];
      bagian.push(`exit code: ${r.exitCode}`);
      bagian.push(`time: ${r.ms} ms${r.timedOut ? ' (TIMEOUT, process killed)' : ''}`);
      if (r.stdout.trim()) bagian.push(`stdout:\n${r.stdout}`);
      if (r.stderr.trim()) bagian.push(`stderr:\n${r.stderr}`);
      if (r.truncated) bagian.push('[output truncated, the first part is not shown]');
      if (!r.stdout.trim() && !r.stderr.trim()) bagian.push('(no output)');
      return bagian.join('\n\n');
    },
  },
  {
    spec: {
      name: 'terminal_exec',
      description:
        'Send a command to an interactive terminal pane (ConPTY) and return immediately without waiting. The output is NOT part of the result; read it yourself with terminal_read. Use it only for what has to keep running or needs interaction (dev server, REPL, watch). For one-shot test/build/git commands, use shell_exec, which waits until they finish.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command (may be multi-line, e.g. node script.js)' },
        },
        required: ['command'],
      },
    },
    run: async (args) => {
      const perintah = String(args.command ?? '').trim();
      if (!perintah) throw new Error('terminal_exec: command is empty');
      const paneId = await cariPaneTerminal();
      if (!paneId) throw new Error('cannot open a terminal pane');
      useTerminal.getState().setVisible(true);
      await writeChunked(paneId, `${perintah.replace(/\r?\n/g, '\r')}\r`);
      return `Command sent to the terminal (not waiting). Call terminal_read to see the output.`;
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
        'Read the contents of the ACTIVE editor tab buffer (not necessarily the same as on disk). Includes the file name.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.id === st.activeTabId);
      if (!tab) return '(no active editor tab)';
      const isi = tab.content ?? '';
      const potong = isi.length > AGENT_READ_LIMIT;
      return `File: ${tab.path ?? tab.name}${potong ? ` (first ${AGENT_READ_LIMIT} characters only)` : ''}\n\`\`\`\n${isi.slice(0, AGENT_READ_LIMIT)}\n\`\`\``;
    },
  },
  {
    spec: {
      name: 'editor_write',
      description:
        'Overwrite the active editor tab buffer with new content. This does NOT write to disk — the user still must save. Use it to fix code.',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', description: 'New full file contents' } },
        required: ['content'],
      },
    },
    run: async (args) => {
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.id === st.activeTabId);
      if (!tab) throw new Error('editor_write: no active editor tab');
      st.updateTabContent(tab.id, String(args.content ?? ''));
      return `Buffer ${tab.path ?? tab.name} updated (not saved to disk yet — tell the user to save).`;
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
      await cmd.fsWrite(filePath, content);
      
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.path === filePath);
      if (tab) {
        st.updateTabContent(tab.id, content);
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
      if (!original.includes(oldText)) {
        throw new Error(
          `file_edit: old_text not found in ${filePath}. ${contextTerdekat(original, oldText)}`,
        );
      }
      const jumlah = original.split(oldText).length - 1;
      const updated = original.split(oldText).join(newText);
      await cmd.fsWrite(filePath, updated);
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.path === filePath);
      if (tab) {
        st.updateTabContent(tab.id, updated);
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
      const r = await cmd.filePatch(filePath, isiPatch);
      const st = useStore.getState();
      const segar = await cmd.fsRead(filePath).catch(() => null);
      if (segar) {
        const tab = st.tabs.find((t) => t.path === filePath);
        if (tab) st.updateTabContent(tab.id, segar.content ?? '');
      }
      if (!r.applied) {
        throw new Error(`file_patch: patch not applied. ${r.conflict}`);
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
              required: ['content', 'status'],
            },
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
      name: 'browser_open',
      description:
        'Open a URL in the browser pane and return its page contents (title + text). Use this to VIEW web pages, not just to load them. If there is no browser pane yet, one is created automatically. Pages that refuse to be displayed inside a window (X-Frame-Options) will fail — report that as it is, do not make up the contents.',
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
      const paneId = await paneBrowserId(String(args.paneId ?? ''));

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
        .querySelector(`.pane-body:has([data-pane-body="${paneId}"])`)
        ?.getBoundingClientRect();

      await cmd.browserPaneOpen({
        paneId,
        url,
        x: rect?.left ?? 120,
        y: rect?.top ?? 120,
        width: rect?.width ?? 800,
        height: rect?.height ?? 600,
      });

      /*
       * Record the URL in the pane store as well.
       *
       * The BrowserPane component only runs its position-sync loop when the
       * pane has a URL, and it reads that URL from the store. Opening the
       * webview straight through the command leaves the store empty, so the
       * component never syncs and the webview stays wherever the command put
       * it. Writing the URL here starts the normal path.
       */
      useTerminal.getState().setPaneUrl(paneId, url);
      await new Promise((r) => setTimeout(r, 600));

      return bacaHalaman(paneId);
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
      name: 'subagent_run',
      description:
        'Run several tasks as parallel subagents (one task per line). Use this to break up complex work into parts that run at the same time. The nesting depth is limited (a subagent cannot keep calling subagents forever).',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'the task list; each item becomes one subagent',
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
      subDepth += 1;
      try {
        // Lazy import: avoid a module cycle (subagent uses agentTools).
        const { useSubAgent } = await import('./subagentStore');
        await useSubAgent.getState().jalankan(tasks, { bersarang: true });
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
];

/** Nested subagent depth, to prevent unbounded recursion. */
let subDepth = 0;
export const MAX_SUB_DEPTH = 2;

/** Tool names that change files on disk or in the editor. */
const TOOL_TULIS = new Set(['editor_write', 'file_write', 'file_edit', 'file_patch']);

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
    if (daftar) {
      return daftar.includes(s.name) || s.name === 'subagent_run';
    }
    if (!boleh && TOOL_TULIS.has(s.name)) return false;
    if (!bisaNested && s.name === 'subagent_run') return false;
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
