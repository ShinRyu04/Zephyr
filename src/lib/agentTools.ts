import * as cmd from './commands';
import { useStore } from './store';
import { useTerminal } from './terminalStore';
import { writeChunked } from './terminalClipboard';
import { runAction } from './mcpStore';
import type { AgentToolSpec } from './types';

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
    pane = t.findPane(id);
  }
  return pane ? pane.id : null;
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
      const { useAi } = await import('./aiStore');
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
      const { useAi } = await import('./aiStore');
      const todos = useAi.getState().agentTodos;
      if (todos.length === 0) return '(daftar tugas kosong)';
      return todos.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`).join('\n');
    },
  },
  
  {
    spec: {
      name: 'skill_list',
      description:
        'Daftar skill yang tersedia (nama + deskripsi + asal: workspace/global). Panggil ini dulu kalau tugasnya terdengar seperti sesuatu yang punya prosedur tetap.',
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
        'Baca isi SKILL.md satu skill. Panggil SEBELUM mengerjakan tugas yang cocok dengan deskripsinya, lalu ikuti langkah di dalamnya.',
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
        'Buat atau perbarui satu skill. Pakai SETELAH menyelesaikan prosedur yang berulang dan layak diulang lain kali. Tulis langkah konkret (perintah, path, jebakan) — bukan ringkasan naratif. scope default workspace (khusus proyek ini); pakai "global" hanya untuk hal yang berlaku di semua proyek.',
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
      
      const { resetKonteksAgent } = await import('./aiStore');
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
      const { resetKonteksAgent } = await import('./aiStore');
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
];

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
