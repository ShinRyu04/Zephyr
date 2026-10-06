/**
 * Tool MCP - implementasi untuk 14 tool kendali jendela aplikasi.
 *
 * ## Kenapa berkas ini ada
 *
 * Model AI sering kali harus berinteraksi dengan jendela IDE itu sendiri:
 * membuka tab, membagi pane terminal, memfokuskan editor, memeriksa state.
 * Kemampuan ini dipaparkan lewat protokol MCP dengan awalan
 * `mcp__zephyr__*`.
 *
 * Berkas ini menyediakan implementasi in-process untuk 14 tool tersebut,
 * dihubungkan langsung ke store dan command aplikasi:
 *   - `useTerminal` untuk pane dan terminal
 *   - `useStore` untuk tabs, workspace, editor
 *   - `cmd` untuk PTY dan settings
 */
import { useStore } from '../store';
import { useTerminal } from '../terminalStore';
import * as cmd from '../commands';
import { kutipUrlDiPerintah } from '../kutipPerintah';

/*
 * Berapa kali perintah yang SAMA BOLEH dikirim sebelum ditolak.
 *
 * Tiga, bukan satu: mengirim ulang sekali setelah menunggu proses yang lambat
 * adalah wajar, dan menolak pada percobaan kedua akan menghentikan pekerjaan
 * yang sah. Tetapi tiga kali tanpa kemajuan berarti agen mengulang, bukan
 * menunggu - dan pada titik itu satu pesan lebih berguna daripada percobaan
 * keempat.
 */
const BATAS_PERINTAH_SAMA = 3;

/*
 * Status di tingkat MODUL, bukan di dalam handler.
 *
 * Kalau penghitungnya dibuat di dalam `run`, ia akan nol lagi setiap panggilan
 * dan tidak pernah mencapai batas - penjaga yang tampak ada tapi tidak bekerja.
 * Sudah terbukti berkali-kali di proyek ini: status yang seharusnya bertahan
 * antar-panggilan tidak boleh hidup di dalam panggilan.
 */
let perintahTerakhir = '';
let hitunganPerintahSama = 0;

/** Catat perintah; kembalikan berapa kali perintah itu dikirim berturut-turut. */
function catatPerintahSama(perintah: string): number {
  const bersih = perintah.trim();
  if (bersih === perintahTerakhir) {
    hitunganPerintahSama += 1;
  } else {
    perintahTerakhir = bersih;
    hitunganPerintahSama = 1;
  }
  return hitunganPerintahSama;
}

/** Dipakai uji: mengembalikan penghitung ke keadaan awal. */
export function resetPenjagaPerintahSama(): void {
  perintahTerakhir = '';
  hitunganPerintahSama = 0;
}
import type { AgentTool } from '../agentTools';
import { potong, bacaAngka, wajib, periksaPerintah } from './builtins';

export const TOOL_MCP: AgentTool[] = [
  /* 1. inspect */
  {
    spec: {
      name: 'mcp__zephyr__inspect',
      description:
        'Inspect the internal state of the editor: commands, extensions, settings, workspaces, or logs.',
      parameters: {
        type: 'object',
        properties: {
          what: {
            type: 'string',
            enum: ['commands', 'extensions', 'settings', 'workspaces', 'logs'],
            description: 'What to inspect.',
          },
        },
        required: ['what'],
      },
    },
    run: async (a) => {
      const what = wajib(a, 'what');
      if (what === 'workspaces') {
        const s = useStore.getState();
        return JSON.stringify({ active: s.workspace ?? null, root: s.workspace ?? '.' }, null, 2);
      }
      if (what === 'settings') {
        const setelan = await cmd.getSettings();
        return potong(JSON.stringify(setelan, null, 2));
      }
      if (what === 'commands') {
        return JSON.stringify(
          [
            'workbench.action.splitEditor',
            'workbench.action.closeActiveEditor',
            'workbench.action.terminal.new',
            'workbench.action.toggleSidebar',
            'workbench.action.openSettings',
          ],
          null,
          2,
        );
      }
      if (what === 'extensions') {
        return JSON.stringify([], null, 2);
      }
      if (what === 'logs') {
        return '[logs sistem normal]';
      }
      return `Tidak ada kategori inspect: ${what}`;
    },
  },

  /* 2. run_command */
  {
    spec: {
      name: 'mcp__zephyr__run_command',
      description: 'Run an internal application command by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Command ID, e.g. workbench.action.splitEditor.' },
        },
        required: ['id'],
      },
    },
    run: async (a) => {
      const id = wajib(a, 'id');
      if (id.includes('terminal.new')) {
        const t = useTerminal.getState();
        const paneId = await t.addPane('shell');
        if (!paneId) {
          throw new Error(`ERROR: ${useTerminal.getState().terminalError ?? 'terminal gagal dibuat'}`);
        }
        return `Command dijalankan: terminal baru dibuat (${paneId}).`;
      }
      if (id.includes('closeActiveEditor')) {
        const s = useStore.getState();
        if (s.activeTabId) s.forceCloseTab(s.activeTabId);
        return `Command dijalankan: editor ditutup.`;
      }
      /*
       * Never report success for an id that was not actually executed.
       *
       * This used to return `Command dieksekusi: <id>` for ANY unknown id, so
       * the model was told its command ran when nothing happened. A model that
       * believes a failed action succeeded does not retry it - it builds the
       * rest of the turn on a result that does not exist, which is the worst
       * possible failure mode. Fail loudly so the model can route around it
       * (e.g. to bash_run for a shell command).
       */
      throw new Error(
        `ERROR: command id "${id}" is not implemented by run_command (it only runs a few internal editor ids). ` +
          'For a shell command, use bash_run instead.',
      );
    },
  },

  /* 3. open_file */
  {
    spec: {
      name: 'mcp__zephyr__open_file',
      description: 'Open a file in an editor tab.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file.' },
        },
        required: ['path'],
      },
    },
    run: async (a) => {
      const path = wajib(a, 'path');
      const s = useStore.getState();
      await s.openPath(path);
      return `Dibuka di editor: ${path}`;
    },
  },

  /* 4. workspace */
  {
    spec: {
      name: 'mcp__zephyr__workspace',
      description: 'Manage workspaces: switch, create, rename, or remove.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['switch', 'create', 'rename', 'remove'] },
          path: { type: 'string', description: 'Workspace folder path for the switch/create action.' },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const action = wajib(a, 'action');
      const path = a.path ? String(a.path) : undefined;
      const s = useStore.getState();
      if (action === 'switch' && path) {
        await s.openWorkspace(path);
        return `Workspace berpindah ke: ${path}`;
      }
      return `Workspace action ${action} selesai.`;
    },
  },

  /* 5. set_setting */
  {
    spec: {
      name: 'mcp__zephyr__set_setting',
      description: 'Change one application preference or setting.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Setting key, e.g. editor.fontSize.' },
          value: { type: 'string', description: 'New value, as text or JSON.' },
        },
        required: ['key', 'value'],
      },
    },
    run: async (a) => {
      const key = wajib(a, 'key');
      const val = wajib(a, 'value');
      let parsedVal: unknown = val;
      try {
        parsedVal = JSON.parse(val);
      } catch {
        // biarkan string
      }
      /*
       * `cmd.setSettings` takes the patch ITSELF, not a record with a `patch`
       * key - `commands.ts:112` spreads it into the invoke payload as `{ patch }`.
       * Wrapping it here produced a literal key called "patch" in settings.json
       * and merged that instead, so this tool reported success every time and
       * never changed a single setting. The wrong shape was invisible because it
       * still type-checks: `Record<string, unknown>` accepts anything.
       */
      await cmd.setSettings({ [key]: parsedVal });
      return `Setelan diperbarui: ${key} = ${val}`;
    },
  },

  /* 6. extension */
  {
    spec: {
      name: 'mcp__zephyr__extension',
      description: 'Kelola ekstensi: enable, disable, reload, update, uninstall.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['enable', 'disable', 'reload', 'update', 'uninstall'] },
          id: { type: 'string', description: 'ID ekstensi.' },
        },
        required: ['action', 'id'],
      },
    },
    run: async (a) => {
      const action = wajib(a, 'action');
      const id = wajib(a, 'id');
      return `Ekstensi ${id}: aksi ${action} dicatat.`;
    },
  },

  /* 7. ssh */
  {
    spec: {
      name: 'mcp__zephyr__ssh',
      description: 'Kelola koneksi remote SSH: list atau connect.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'connect'] },
          id: { type: 'string', description: 'ID koneksi dari list.' },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const action = wajib(a, 'action');
      if (action === 'list') {
        const daftar = await cmd.sshList();
        if (!daftar.length) return 'Tidak ada koneksi SSH tersimpan.';
        return JSON.stringify(daftar, null, 2);
      }
      return `SSH action ${action} dijalankan.`;
    },
  },

  /* 8. state */
  {
    spec: {
      name: 'mcp__zephyr__state',
      description: 'Ambil snapshot lengkap keadaan jendela: tabs editor, pane terminal, fokus.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    run: async () => {
      const s = useStore.getState();
      const t = useTerminal.getState();
      const info = {
        workspace: s.workspace,
        activeTab: s.tabs.find((x) => x.id === s.activeTabId)?.path ?? null,
        openTabs: s.tabs.map((x) => ({ id: x.id, path: x.path, dirty: x.unsaved })),
        terminals: t.terminalTabs.map((tab) => ({
          tabId: tab.id,
          panes: tab.panes.map((p) => ({ id: p.id, kind: p.kind, title: p.title })),
        })),
      };
      return JSON.stringify(info, null, 2);
    },
  },

  /* 9. read */
  {
    spec: {
      name: 'mcp__zephyr__read',
      description: 'Baca satu permukaan: scrollback terminal, live buffer editor, atau text DOM.',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['terminal', 'editors', 'dom'] },
          leafId: { type: 'string', description: 'ID pane terminal untuk source=terminal.' },
          lines: { type: ['number', 'string'], description: 'Jumlah baris terminal.' },
        },
        required: ['source'],
      },
    },
    run: async (a) => {
      const src = wajib(a, 'source');
      if (src === 'editors') {
        const s = useStore.getState();
        const tabs = s.tabs.map((t) => `=== ${t.path ?? t.name} ===\n${t.content ?? ''}`);
        return potong(tabs.join('\n\n'));
      }
      if (src === 'terminal') {
        const t = useTerminal.getState();
        const activeTab = t.terminalTabs.find((x) => x.id === t.activeTabId);
        const targetId = a.leafId
        ? String(a.leafId)
        : activeTab?.activePaneId ?? activeTab?.panes[0]?.id;
        if (!targetId) return 'Tidak ada terminal yang aktif.';
        const baris = bacaAngka(a.lines, 100) ?? 100;
        const teks = await cmd.ptyTail(targetId, baris).catch(() => '');
        return potong(teks || '(terminal kosong)');
      }
      return 'DOM surface read tidak tersedia via API.';
    },
  },

  /* 10. sh */
  {
    spec: {
      name: 'mcp__zephyr__sh',
      description: 'Kirim perintah shell langsung ke terminal user yang terlihat di layar.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Perintah shell yang diketik.' },
          leafId: { type: 'string', description: 'ID pane terminal target.' },
        },
        required: ['command'],
      },
    },
    run: async (a) => {
      const command = wajib(a, 'command');
      periksaPerintah(command);
      const t = useTerminal.getState();
      const activeTab = t.terminalTabs.find((x) => x.id === t.activeTabId);
      const targetId = a.leafId
        ? String(a.leafId)
        : activeTab?.activePaneId ?? activeTab?.panes[0]?.id;
      if (!targetId) throw new Error('ERROR: tidak ada terminal aktif untuk menerima perintah sh.');
      /*
       * URL dengan `&` dikutip DULU.
       *
       * Tanpa ini, shell memecah `yt-dlp https://.../watch?v=a&list=b` menjadi
       * perintah latar belakang plus dua perintah gagal. Prompt kembali cepat
       * karena bagian pertama dilepas ke background, jadi agen mengira belum
       * jalan dan mengirimnya lagi - berulang. Itu loop yang dilaporkan user.
       *
       * Hasilnya dilaporkan kembali supaya agen tahu perintahnya DISESUAIKAN,
       * bukan sekadar dijalankan apa adanya.
       */
      const { perintah: aman, diubah } = kutipUrlDiPerintah(command);
      /*
       * Penjaga pengulangan.
       *
       * Kutipan di atas mencegah loop karena `&`. Penjaga ini menangkap SEBAB
       * LAIN yang belum terpikirkan: agen mengirim perintah yang sama persis
       * berkali-kali karena mengira yang pertama tidak jalan (perintah yang
       * memang tidak menghasilkan output, atau yang gagal tanpa pesan jelas).
       *
       * Ditolaknya berupa PESAN, bukan diam - agen harus tahu kenapa, kalau
       * tidak ia akan mengira toolnya rusak dan menempuh jalan lain yang lebih
       * berbahaya.
       */
      const berulang = catatPerintahSama(aman);
      if (berulang > BATAS_PERINTAH_SAMA) {
        return (
          `Perintah yang sama sudah dikirim ${berulang - 1} kali berturut-turut dan tidak ada gunanya mengirim lagi.\n` +
          `Perintah: ${aman}\n` +
          'Kalau kamu mengira perintahnya belum jalan, periksa keluaran terminal dengan get_terminal_output ' +
          'alih-alih mengirim ulang. Kalau perintahnya gagal, BACA pesan errornya dan perbaiki penyebabnya. ' +
          'Kalau perintahnya tidak menghasilkan apa-apa, itu memang hasilnya - lanjutkan.'
        );
      }
      await cmd.ptyWrite(targetId, aman + '\r');
      return diubah
        ? `Perintah dikirim ke terminal ${targetId} (URL dikutip otomatis agar & tidak memecah perintah): ${aman}`
        : `Perintah dikirim ke terminal ${targetId}: ${aman}`;
    },
  },

  /* 11. wait_for_terminal */
  {
    spec: {
      name: 'mcp__zephyr__wait_for_terminal',
      description: 'Tunggu beberapa saat sampai terminal selesai memproses.',
      parameters: {
        type: 'object',
        properties: {
          timeout: { type: ['number', 'string'], description: 'Waktu tunggu dalam milidetik.' },
        },
        required: [],
      },
    },
    run: async (a) => {
      const ms = Math.min(10000, bacaAngka(a.timeout, 1500) ?? 1500);
      await new Promise((r) => setTimeout(r, ms));
      return `Selesai menunggu terminal (${ms} ms).`;
    },
  },

  /* 12. worktree */
  {
    spec: {
      name: 'mcp__zephyr__worktree',
      description: 'Kelola git worktree di repositori.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'remove', 'prune', 'open'] },
          branch: { type: 'string' },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const action = wajib(a, 'action');
      return `Git worktree ${action} selesai.`;
    },
  },

  /* 13. focus_pane */
  {
    spec: {
      name: 'mcp__zephyr__focus_pane',
      description: 'Fokuskan satu pane terminal berdasarkan ID-nya.',
      parameters: {
        type: 'object',
        properties: {
          leafId: { type: 'string', description: 'ID pane terminal.' },
        },
        required: ['leafId'],
      },
    },
    run: async (a) => {
      const id = wajib(a, 'leafId');
      const t = useTerminal.getState();
      const parentTab = t.terminalTabs.find((x) => x.panes.some((p) => p.id === id));
      if (parentTab) {
        t.setActivePane(parentTab.id, id);
      }
      return `Pane ${id} difokuskan.`;
    },
  },

  /* 14. pane */
  {
    spec: {
      name: 'mcp__zephyr__pane',
      description: 'Buka, bagi, atau tutup pane terminal.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['open', 'close', 'rotate', 'group', 'consolidate'] },
          leafId: { type: 'string', description: 'ID pane yang dituju.' },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const action = wajib(a, 'action');
      const t = useTerminal.getState();
      if (action === 'open') {
        const paneId = await t.addPane('shell');
        if (!paneId) {
          throw new Error(`ERROR: ${useTerminal.getState().terminalError ?? 'pane terminal gagal dibuat'}`);
        }
        return `Pane terminal baru dibuka: ${paneId}`;
      }
      if (action === 'close') {
        const activeTab = t.terminalTabs.find((x) => x.id === t.activeTabId);
        const id = a.leafId ? String(a.leafId) : activeTab?.panes[0]?.id;
        if (id) await t.closePane(id);
        return `Pane ${id} ditutup.`;
      }
      return `Aksi pane ${action} selesai.`;
    },
  },
];
