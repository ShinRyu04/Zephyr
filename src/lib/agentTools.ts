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

async function cariPaneTerminal(): Promise<string | null> {
  const t = useTerminal.getState();
  let pane = t
    .allPanes()
    .find((p) => p.status === 'live' && p.kind !== 'browser' && p.kind !== 'agent');
  if (!pane) {
    const id = await t.addPane('shell');
    if (!id) return null;

    await new Promise((r) => setTimeout(r, 700));
    // Ambil state SEGAR: snapshot lama tidak memuat pane yang baru dibuat, jadi
    // findPane() di atasnya gagal dan tool melaporkan "tidak bisa membuka pane".
    pane = useTerminal.getState().findPane(id);
  }
  return pane ? pane.id : null;
}

/**
 * Cari pane browser yang hidup, atau buat satu kalau belum ada.
 *
 * Pane browser WAJIB ada sebelum tool browser dipakai: webview anak dibuat di
 * dalam pane, jadi tanpa pane tidak ada tempat menempel. Pane dibuat lewat
 * store the UI button uses, not a separate path, so the layout stays
 * tetap diurus grid.
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
  if (!id) throw new Error('tidak bisa membuat pane browser');
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
    "document.body ? document.body.innerText.replace(/\\n{3,}/g,'\\n\\n').slice(0,4000) : '(halaman belum dimuat)'",
  );
  return [
    `URL: ${info.url || '(belum dimuat)'}`,
    `Judul: ${info.title || '(tanpa judul)'}`,
    '',
    String(teks || '(halaman kosong)'),
  ].join('\n');
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    spec: {
      name: 'terminal_exec',
      description:
        'Jalankan perintah shell di pane terminal Zephyr (ConPTY). Perintah dikirim apa adanya ke shell aktif. Output dibaca belakangan dengan terminal_read — jangan menganggap selesai tanpa menunggu lalu membaca.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Perintah shell (bisa multi-baris, contoh: node script.js)' },
        },
        required: ['command'],
      },
    },
    run: async (args) => {
      const perintah = String(args.command ?? '').trim();
      if (!perintah) throw new Error('terminal_exec: command kosong');
      const paneId = await cariPaneTerminal();
      if (!paneId) throw new Error('tidak bisa membuka pane terminal');
      useTerminal.getState().setVisible(true);
      await writeChunked(paneId, `${perintah.replace(/\r?\n/g, '\r')}\r`);
      return `Perintah dikirim ke terminal. Tunggu sebentar, lalu panggil terminal_read untuk melihat output.`;
    },
  },
  {
    spec: {
      name: 'terminal_read',
      description:
        'Baca baris yang sedang tampil di pane terminal (viewport terakhir yang ter-render). Panggil setelah terminal_exec dan beri waktu proses berjalan.',
      parameters: {
        type: 'object',
        properties: {
          maxLines: { type: 'number', description: 'Maksimum baris yang dibaca (default 40)' },
        },
      },
    },
    run: async (args) => {
      const maxLines = Math.max(1, Math.min(200, Number(args.maxLines ?? 40) || 40));
      const el = document.querySelector('.xterm-rows');
      if (!el) return '(pane terminal tidak terlihat — buka panel Terminal dulu)';
      const baris = Array.from(el.querySelectorAll('div'))
        .map((d) => d.textContent ?? '')
        .filter((t) => t.trim() !== '');
      const potong = baris.slice(-maxLines);
      return potong.join('\n') || '(belum ada output)';
    },
  },
  {
    spec: {
      name: 'editor_read',
      description:
        'Baca isi buffer tab editor yang AKTIF (belum tentu sama dengan isi di disk). Termasuk nama file.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.id === st.activeTabId);
      if (!tab) return '(tidak ada tab editor aktif)';
      const isi = tab.content ?? '';
      const potong = isi.length > AGENT_READ_LIMIT;
      return `File: ${tab.path ?? tab.name}${potong ? ` (dipotong ${AGENT_READ_LIMIT} pertama)` : ''}\n\`\`\`\n${isi.slice(0, AGENT_READ_LIMIT)}\n\`\`\``;
    },
  },
  {
    spec: {
      name: 'editor_write',
      description:
        'TIMPA isi buffer tab editor yang aktif dengan konten baru. TIDAK menulis ke disk — user tetap harus menyimpan. Gunakan untuk memperbaiki kode.',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string', description: 'Isi baru seluruh file' } },
        required: ['content'],
      },
    },
    run: async (args) => {
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.id === st.activeTabId);
      if (!tab) throw new Error('editor_write: tidak ada tab editor aktif');
      st.updateTabContent(tab.id, String(args.content ?? ''));
      return `Buffer ${tab.path ?? tab.name} diperbarui (belum disimpan ke disk — beri tahu user untuk menyimpan).`;
    },
  },
  {
    spec: {
      name: 'file_write',
      description:
        'Tulis langsung isi file ke disk (atau buat file baru jika belum ada). Memperbarui buffer tab bila file sedang dibuka di editor.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path file (absolut atau relatif workspace)' },
          content: { type: 'string', description: 'Isi lengkap teks yang akan ditulis ke file' },
        },
        required: ['path', 'content'],
      },
    },
    run: async (args) => {
      const filePath = String(args.path ?? '').trim();
      const content = String(args.content ?? '');
      if (!filePath) throw new Error('file_write: path kosong');
      await cmd.fsWrite(filePath, content);
      
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.path === filePath);
      if (tab) {
        st.updateTabContent(tab.id, content);
      }
      return `File ${filePath} berhasil ditulis ke disk (${content.length} karakter).`;
    },
  },
  {
    spec: {
      name: 'file_edit',
      description:
        'Ubah sebagian isi file yang ada di disk dengan mencari teks lama (old_text) dan menggantinya dengan teks baru (new_text).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path file' },
          old_text: { type: 'string', description: 'Teks persis yang ingin diganti' },
          new_text: { type: 'string', description: 'Teks pengganti' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
    run: async (args) => {
      const filePath = String(args.path ?? '').trim();
      const oldText = String(args.old_text ?? '');
      const newText = String(args.new_text ?? '');
      if (!filePath) throw new Error('file_edit: path kosong');
      const r = await cmd.fsRead(filePath);
      const original = r.content ?? '';
      if (!original.includes(oldText)) {
        throw new Error(`file_edit: old_text tidak ditemukan di dalam ${filePath}`);
      }
      const updated = original.replace(oldText, newText);
      await cmd.fsWrite(filePath, updated);
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.path === filePath);
      if (tab) {
        st.updateTabContent(tab.id, updated);
      }
      return `File ${filePath} berhasil diedit dan disimpan ke disk.`;
    },
  },
  {
    spec: {
      name: 'file_read',
      description:
        'Baca isi file dari disk (read-only, maks 100KB). Path bisa absolut atau relatif terhadap workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path file' } },
        required: ['path'],
      },
    },
    run: async (args) => {
      const r = await cmd.fsRead(String(args.path));
      const isi = (r.content ?? '').slice(0, AGENT_READ_LIMIT);
      return isi || '(kosong)';
    },
  },
  {
    spec: {
      name: 'file_list',
      description: 'Daftar isi folder (nama file/direktori).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path folder' } },
        required: ['path'],
      },
    },
    run: async (args) => {
      const nodes = await cmd.scanDir(String(args.path));
      if (nodes.length === 0) return '(kosong)';
      const potong = nodes.slice(0, FILE_LIST_MAX);
      const teks = potong.map((n) => (n.isDir ? `${n.name}/` : n.name)).join('\n');
      if (nodes.length <= FILE_LIST_MAX) return teks;
      return `${teks}\n\n[... dan ${nodes.length - FILE_LIST_MAX} entri lain tidak ditampilkan. Sebut sub-folder spesifik kalau butuh daftar lengkapnya.]`;
    },
  },
  {
    spec: {
      name: 'list_panes',
      description:
        'Daftar pane terminal/browser yang sedang terbuka (paneId, type, title, agent, pid, running). Berguna untuk mengetahui terminal mana yang hidup sebelum menjalankan perintah.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => JSON.stringify(await runAction('list_panes', {})),
  },
  {
    spec: {
      name: 'get_problems',
      description:
        'Baca diagnostik (Problems) yang sedang tampil di panel bawah: error & warning per file. Filter severity opsional: error | warning | info | hint.',
      parameters: {
        type: 'object',
        properties: { severity: { type: 'string', description: 'filter opsional: error|warning|info|hint' } },
      },
    },
    run: async (args) => {
      const p = await runAction('get_problems', args);
      const r = p as { counts?: { errors?: number; warnings?: number }; problems?: unknown[] };
      const probs = Array.isArray(r.problems) ? r.problems : [];
      if (probs.length === 0) {
        return `Tidak ada masalah. (counts: ${JSON.stringify(r.counts ?? {})})`;
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
        'Baca isi satu channel Output panel bawah (zephyr, mcp, ssh, extensions, debug). Param channel wajib; tail opsional (default 200 baris terakhir).',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'id channel: zephyr|mcp|ssh|extensions|debug' },
          tail: { type: 'number', description: 'ambil N baris terakhir (default 200, maks 2000)' },
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
        ? `(channel ${r.channel ?? args.channel} kosong)`
        : `[${r.channel ?? ''} — ${r.total ?? lines.length} baris]\n${lines.join('\n')}`;
    },
  },
  {
    spec: {
      name: 'todo_write',
      description:
        'Tulis/ganti daftar tugas yang sedang dikerjakan (maks 20 item). Panggil ulang tiap kali status berubah — jangan menunggu tugas selesai. Status: pending | in_progress | done.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: 'daftar tugas lengkap (mengganti yang lama, bukan menambah)',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: 'satu baris tugas, kata kerja dulu' },
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
      return `Daftar tugas disimpan (${n} item).`;
    },
  },
  {
    spec: {
      name: 'todo_read',
      description: 'Baca daftar tugas yang sedang dikerjakan beserta statusnya.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {

      const todos = useAi.getState().agentTodos;
      if (todos.length === 0) return '(daftar tugas kosong)';
      return todos.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`).join('\n');
    },
  },
  
  {
    spec: {
      name: 'skill_list',
      description:
        'List available skills (name + description + origin: workspace/global/hermes). Call this first when a task sounds like something with a fixed procedure. Skills marked hermes are shared with the Hermes Agent install on this machine and are read-only.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const list = await cmd.skillsList();
      if (list.length === 0) return '(belum ada skill)';
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
          name: { type: 'string', description: 'nama skill (lihat skill_list)' },
        },
        required: ['name'],
      },
    },
    run: async (args) => {
      const nama = String(args.name ?? '').trim();
      if (!nama) throw new Error('skill_view: name kosong');
      const isi = await cmd.skillRead(nama);
      return isi.length > AGENT_READ_LIMIT
        ? `${isi.slice(0, AGENT_READ_LIMIT)}\n\n[... dipotong di ${AGENT_READ_LIMIT} karakter]`
        : isi;
    },
  },
  {
    spec: {
      name: 'skill_write',
      description:
        'Create or update a skill. Use it AFTER finishing a repeatable procedure worth doing again. Write concrete steps (commands, paths, pitfalls), not a narrative summary. Default scope is workspace (this project only); use "global" only for things that apply to every project. Skills that came from the Hermes folder cannot be overwritten here.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'nama pendek huruf/angka/-/_' },
          description: { type: 'string', description: 'satu baris: kapan skill ini dipakai' },
          content: { type: 'string', description: 'isi SKILL.md (markdown, langkah + jebakan)' },
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
      return `Skill disimpan: ${path}`;
    },
  },
  {
    spec: {
      name: 'skill_delete',
      description: 'Hapus satu skill beserta isinya. Hanya kalau skill itu sudah salah atau tidak dipakai lagi.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'nama skill' } },
        required: ['name'],
      },
    },
    run: async (args) => {
      const nama = String(args.name ?? '').trim();
      if (!nama) throw new Error('skill_delete: name kosong');
      await cmd.skillDelete(nama);
      return `Skill '${nama}' dihapus.`;
    },
  },
  
  {
    spec: {
      name: 'memory_read',
      description:
        'Baca memori lintas sesi: bagian "memory" (catatanmu soal lingkungan & pelajaran teknis) dan "user" (siapa user-nya: preferensi, gaya, kebiasaan).',
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
      return bagian.length ? bagian.join('\n\n') : '(memori kosong)';
    },
  },
  {
    spec: {
      name: 'memory_write',
      description:
        'Tambah/ganti/hapus satu entri memori lintas sesi. Simpan fakta yang berlaku di SEMUA percakapan (siapa user, konvensi proyek, jebakan lingkungan) — bukan progres tugas. Kalau penuh, ringkas dulu entri lama (action replace/remove).',
      parameters: {
        type: 'object',
        properties: {
          section: { type: 'string', description: 'memory | user' },
          action: { type: 'string', description: 'add | replace | remove' },
          content: { type: 'string', description: 'entri baru (untuk add/replace)' },
          old_text: {
            type: 'string',
            description: 'potongan teks entri lama yang mau diganti/dihapus (untuk replace/remove)',
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
      return `Memori '${section}' diperbarui (${action}). ${hasil.length} karakter total.`;
    },
  },
  
  {
    spec: {
      name: 'cron_create',
      description:
        'Buat tugas terjadwal. Isi every_minutes (>0) untuk berulang tiap N menit, ATAU at_hour (0-23) untuk harian. Perintah dijalankan di pane terminal Zephyr saat jatuh tempo.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'nama tugas' },
          command: { type: 'string', description: 'perintah shell' },
          every_minutes: { type: 'number', description: 'interval menit (opsional)' },
          at_hour: { type: 'number', description: 'jam harian 0-23 (opsional)' },
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
      const jadwal = job.every_minutes > 0 ? `tiap ${job.every_minutes} menit` : `tiap hari jam ${job.at_hour}`;
      return `Tugas '${job.name}' dibuat (${jadwal}), id=${job.id}.`;
    },
  },
  {
    spec: {
      name: 'cron_list',
      description: 'Daftar tugas terjadwal beserta status dan jadwalnya.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const list = await cmd.cronList();
      if (list.length === 0) return '(belum ada tugas terjadwal)';
      return list
        .map((j) => {
          const jadwal = j.every_minutes > 0 ? `tiap ${j.every_minutes}m` : `harian ${j.at_hour}:00`;
          const status = j.enabled ? 'aktif' : 'nonaktif';
          return `- ${j.id} "${j.name}" [${status}] ${jadwal} → ${j.command}`;
        })
        .join('\n');
    },
  },
  {
    spec: {
      name: 'cron_delete',
      description: 'Hapus satu tugas terjadwal berdasarkan id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'id tugas (lihat cron_list)' } },
        required: ['id'],
      },
    },
    run: async (args) => {
      const id = String(args.id ?? '').trim();
      if (!id) throw new Error('cron_delete: id kosong');
      await cmd.cronDelete(id);
      return `Tugas '${id}' dihapus.`;
    },
  },
  {
    spec: {
      name: 'browser_open',
      description:
        'Buka URL di pane browser dan kembalikan isi halamannya (judul + teks). Pakai ini untuk MELIHAT halaman web, bukan sekadar memuatnya. Kalau pane browser belum ada, satu dibuat otomatis. Halaman yang menolak ditampilkan di dalam jendela (X-Frame-Options) akan gagal — laporkan apa adanya, jangan mengarang isinya.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL lengkap, harus http:// atau https://' },
          paneId: {
            type: 'string',
            description: 'id pane browser yang sudah ada (opsional; lihat browser_list)',
          },
        },
        required: ['url'],
      },
    },
    run: async (args) => {
      const url = String(args.url ?? '').trim();
      if (!url) throw new Error('browser_open: url kosong');
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
        'Baca isi halaman yang sedang terbuka di pane browser: judul, URL, teks yang terlihat, dan daftar link. Panggil ini setelah browser_open atau setelah user berpindah halaman.',
      parameters: {
        type: 'object',
        properties: {
          paneId: { type: 'string', description: 'id pane browser (opsional)' },
          mode: {
            type: 'string',
            description: "'teks' (default) = teks halaman; 'link' = daftar link; 'html' = HTML mentah",
          },
        },
      },
    },
    run: async (args) => {
      const paneId = await paneBrowserId(String(args.paneId ?? ''));
      const mode = String(args.mode ?? 'teks');
      if (mode === 'link') {
        const js = `JSON.stringify(Array.from(document.querySelectorAll('a[href]')).slice(0,80).map(a=>a.innerText.trim().slice(0,80)+' -> '+a.href).filter(s=>s.length>6))`;
        return await cmd.browserPaneEval(paneId, js);
      }
      if (mode === 'html') {
        return (await cmd.browserPaneEval(paneId, 'document.documentElement.outerHTML.slice(0,20000)')) || '(kosong)';
      }
      return bacaHalaman(paneId);
    },
  },
  {
    spec: {
      name: 'browser_click',
      description:
        'Klik elemen di pane browser. Pilih elemen lewat selector CSS atau teks yang terlihat. Kembalikan isi halaman sesudah klik, jadi kamu langsung tahu hasilnya tanpa perlu memanggil browser_read lagi.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'selector CSS, mis. "button.login" atau "#submit"' },
          teks: { type: 'string', description: 'teks tombol/link (dipakai kalau selector tidak diberikan)' },
          paneId: { type: 'string', description: 'id pane browser (opsional)' },
        },
      },
    },
    run: async (args) => {
      const paneId = await paneBrowserId(String(args.paneId ?? ''));
      const sel = String(args.selector ?? '').trim();
      const teks = String(args.teks ?? '').trim();
      if (!sel && !teks) throw new Error('browser_click: berikan selector atau teks');
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
        ? `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'TIDAK ADA elemen: '+${JSON.stringify(sel)};e.scrollIntoView({block:'center'});e.click();return 'klik: '+(e.innerText||e.value||e.tagName).slice(0,60);})()`
        : `(function(){var t=${JSON.stringify(teks)};var k=Array.from(document.querySelectorAll('a,button,input[type=submit],[role=button]'));var e=k.find(function(x){return (x.innerText||x.value||'').trim().toLowerCase().indexOf(t.toLowerCase())>=0;});if(!e)return 'TIDAK ADA elemen dengan teks: '+t;e.scrollIntoView({block:'center'});e.click();return 'klik: '+(e.innerText||e.value||'').slice(0,60);})()`;
      const hasil = await cmd.browserPaneEval(paneId, js);
      if (String(hasil).startsWith('TIDAK ADA')) return String(hasil);
      await new Promise((r) => setTimeout(r, 1200));
      return `aksi: ${hasil}\n\n${await bacaHalaman(paneId)}`;
    },
  },
  {
    spec: {
      name: 'browser_type',
      description:
        'Isi sebuah input di pane browser lalu kirim Enter. Kembalikan isi halaman sesudahnya.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'selector CSS input/textarea' },
          teks: { type: 'string', description: 'teks yang diketik' },
          enter: { type: 'boolean', description: 'kirim Enter sesudah mengetik (default true)' },
          paneId: { type: 'string', description: 'id pane browser (opsional)' },
        },
        required: ['selector', 'teks'],
      },
    },
    run: async (args) => {
      const paneId = await paneBrowserId(String(args.paneId ?? ''));
      const sel = String(args.selector ?? '');
      const teks = String(args.teks ?? '');
      const enter = args.enter !== false;
      const js = `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'TIDAK ADA: '+${JSON.stringify(sel)};e.focus();var d=Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value');if(d&&d.set)d.set.call(e,${JSON.stringify(teks)});else e.value=${JSON.stringify(teks)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));${enter ? "e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));var f=e.form;if(f&&f.requestSubmit)f.requestSubmit();" : ''}return 'diisi: '+${JSON.stringify(sel)};})()`;
      const hasil = await cmd.browserPaneEval(paneId, js);
      if (String(hasil).startsWith('TIDAK ADA')) return String(hasil);
      await new Promise((r) => setTimeout(r, 1500));
      return `aksi: ${hasil}\n\n${await bacaHalaman(paneId)}`;
    },
  },
  {
    spec: {
      name: 'browser_nav',
      description: 'Navigasi pane browser: kembali, maju, muat ulang, atau pindah ke URL lain.',
      parameters: {
        type: 'object',
        properties: {
          aksi: {
            type: 'string',
            description: "'back' | 'forward' | 'reload' | URL lengkap",
          },
          paneId: { type: 'string', description: 'id pane browser (opsional)' },
        },
        required: ['aksi'],
      },
    },
    run: async (args) => {
      const paneId = await paneBrowserId(String(args.paneId ?? ''));
      const aksi = String(args.aksi ?? '').trim();
      if (!aksi) throw new Error('browser_nav: aksi kosong');
      await cmd.browserPaneNav(paneId, aksi);
      await new Promise((r) => setTimeout(r, 1200));
      return bacaHalaman(paneId);
    },
  },
  {
    spec: {
      name: 'web_search',
      description:
        'Cari di internet. Pakai ini untuk hal yang berubah sepanjang waktu atau di luar pengetahuanmu: berita terbaru, harga, versi rilis, dokumentasi, kejadian terkini. Kembalikan judul + URL + cuplikan; panggil web_fetch untuk membaca halaman yang menarik.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'kata kunci pencarian' },
          maxResults: { type: 'number', description: 'jumlah hasil, 1-20 (default 8)' },
        },
        required: ['query'],
      },
    },
    run: async (args) => {
      const q = String(args.query ?? '').trim();
      if (!q) throw new Error('web_search: query kosong');
      const n = Number(args.maxResults ?? 8);
      const hasil = await cmd.webSearch(q, Number.isFinite(n) ? n : 8);
      if (hasil.length === 0) return `Tidak ada hasil untuk: ${q}`;
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
        'Ambil satu halaman web dan kembalikan teksnya (tag HTML dibuang). Pakai setelah web_search untuk membaca sumber lengkapnya, atau langsung kalau URL-nya sudah diketahui.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL lengkap, harus http:// atau https://' },
          maxChars: { type: 'number', description: 'batas karakter, 500-60000 (default 12000)' },
        },
        required: ['url'],
      },
    },
    run: async (args) => {
      const url = String(args.url ?? '').trim();
      if (!url) throw new Error('web_fetch: url kosong');
      const n = Number(args.maxChars ?? 12000);
      return await cmd.webFetch(url, Number.isFinite(n) ? n : 12000);
    },
  },
  {
    spec: {
      name: 'browser_list',
      description: 'Daftar pane browser yang sedang terbuka beserta URL dan judulnya.',
      parameters: { type: 'object', properties: {} },
    },
    run: async () => {
      const t = useTerminal.getState();
      const panes = t.allPanes().filter((p) => p.kind === 'browser');
      if (panes.length === 0) return 'Belum ada pane browser yang terbuka.';
      const baris: string[] = [];
      for (const p of panes) {
        let info = '';
        try {
          const i = await cmd.browserPaneInfo(p.id);
          info = `${i.title || '(tanpa judul)'} | ${i.url}`;
        } catch {
          info = '(webview belum siap)';
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
        'Jalankan beberapa tugas sebagai subagent paralel (satu tugas per baris). Pakai untuk memecah pekerjaan besar jadi bagian yang berjalan bersamaan. Kedalaman bersarang dibatasi (subagent tidak bisa memanggil subagent tanpa henti).',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'daftar tugas; tiap item jadi satu subagent',
          },
        },
        required: ['tasks'],
      },
    },
    run: async (args) => {
      const tasks = Array.isArray(args.tasks)
        ? (args.tasks as unknown[]).map((t) => String(t)).filter((t) => t.trim())
        : [];
      if (tasks.length === 0) throw new Error('subagent_run: tasks kosong');
      if (subDepth >= MAX_SUB_DEPTH) {
        return `(ditolak: kedalaman subagent maksimum ${MAX_SUB_DEPTH} tercapai)`;
      }
      subDepth += 1;
      try {
        // Impor malas: hindari siklus modul (subagent memakai agentTools).
        const { useSubAgent } = await import('./subagentStore');
        await useSubAgent.getState().jalankan(tasks, { bersarang: true });
        const agents = useSubAgent.getState().agents;
        return (
          `Selesai menjalankan ${agents.length} subagent.\n` +
          agents
            .map((a) => `## ${a.nama} [${a.status}]\n${a.hasil || a.error || '(tidak ada hasil)'}`)
            .join('\n\n')
        );
      } finally {
        subDepth -= 1;
      }
    },
  },
];

/** Kedalaman subagent bersarang, untuk mencegah rekursi tanpa batas. */
let subDepth = 0;
export const MAX_SUB_DEPTH = 2;

export function agentToolSpecs(): AgentToolSpec[] {
  return AGENT_TOOLS.map((t) => t.spec);
}

export async function jalankanAgentTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = AGENT_TOOLS.find((t) => t.spec.name === name);
  if (!tool) throw new Error(`tool tak dikenal: ${name}`);
  return tool.run(args);
}
