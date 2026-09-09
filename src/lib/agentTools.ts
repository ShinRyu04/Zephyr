// agentTools.ts — tool yang bisa dipanggil model di mode agent (fase 35).
//
// Prinsip sama seperti MCP: eksekusi lewat jalur yang SUDAH ada dan aman.
//   * terminal_exec/read → pane ConPTY Zephyr (bukan spawn bebas)
//   * editor_read/write   → buffer tab (TIDAK menulis disk)
//   * file_read/list      → read-only lewat Rust
//
// Mode persetujuan & command berbahaya DITANGANI loop di aiStore, bukan di
// sini — tool ini murni eksekusi setelah keputusan dibuat.

import * as cmd from './commands';
import { useStore } from './store';
import { useTerminal } from './terminalStore';
import { writeChunked } from './terminalClipboard';
import type { AgentToolSpec } from './types';

export interface AgentTool {
  spec: AgentToolSpec;
  run: (args: Record<string, unknown>) => Promise<string>;
}

/** Batas baca file/buffer per tool (biar konteks model tidak meledak). */
export const AGENT_READ_LIMIT = 100 * 1024;

/** Cari pane shell yang hidup; buat baru kalau belum ada (sama seperti
 *  runInTerminal di aiStore — dipakai bersama). */
async function cariPaneTerminal(): Promise<string | null> {
  const t = useTerminal.getState();
  let pane = t
    .allPanes()
    .find((p) => p.status === 'live' && p.kind !== 'browser' && p.kind !== 'agent');
  if (!pane) {
    const id = await t.addPane('shell');
    if (!id) return null;
    // Beri shell waktu menampilkan prompt sebelum perintah dikirim.
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
      return nodes.map((n) => (n.isDir ? `${n.name}/` : n.name)).join('\n') || '(kosong)';
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