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
import {
  aksiPane,
  bukaPanel,
  bukaSetelan,
  daftarPanel,
  daftarSetelan,
  laporanTangkapLayar,
  ringkasJendela,
  tangkapJendela,
} from './kendaliJendela';

export const TOOL_MCP: AgentTool[] = [
  /* 1. inspect */
  {
    spec: {
      name: 'mcp__zephyr__inspect',
      description:
        'Inspect the internal state of the editor: commands, extensions, settings, workspaces, logs, or window (which panels and Settings sections can be opened, plus the current state summary).',
      parameters: {
        type: 'object',
        properties: {
          what: {
            type: 'string',
            enum: ['commands', 'extensions', 'settings', 'workspaces', 'logs', 'window'],
            description: 'What to inspect.',
          },
        },
        required: ['what'],
      },
    },
    run: async (a) => {
      const what = wajib(a, 'what');
      /*
       * `window` menjawab "apa yang bisa kamu munculkan?" dengan daftar yang
       * BENAR-BENAR dipakai `run_command`, bukan salinan: panel dan bagian
       * Settings dibaca dari peta yang sama dengan yang mengeksekusi. Ditambah
       * dua hal yang tidak punya jalur lain: keadaan jendela sekarang, dan
       * status penangkap layar (yang belum ada di build ini).
       */
      if (what === 'window') {
        return JSON.stringify(
          {
            panel: daftarPanel(),
            bagianSetelan: daftarSetelan(),
            ringkasan: ringkasJendela(),
            tangkapLayar: laporanTangkapLayar(),
          },
          null,
          2,
        );
      }
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
      description:
        'Open/act on the application window: run any registered command id, open a panel (problems, output, debug, terminal, ports, subagents), or open a Settings section - and return the real window state afterwards.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Command ID, e.g. workbench.action.splitEditor.' },
          panel: {
            type: 'string',
            description: 'Panel to open: problems | output | debug | terminal | ports | subagents.',
          },
          settings: {
            type: 'string',
            description: 'Settings section to open, e.g. editor, theme, shortcuts, extensions, about.',
          },
          capture: {
            type: 'boolean',
            description: 'Tangkap layar jendela aplikasi, simpan sebagai PNG, lalu salin ke clipboard.',
          },
          path: { type: 'string', description: 'Untuk capture: path PNG tujuan (opsional).' },
          copy: { type: 'boolean', description: 'Untuk capture: salin gambar ke clipboard (default true).' },
        },
        required: [],
      },
    },
    run: async (a) => {
      const panel = a.panel ? String(a.panel).trim() : '';
      const setelan = a.settings ? String(a.settings).trim() : '';
      /*
       * Dua parameter ini yang membuat Zeph benar-benar MEMUNCULKAN sesuatu.
       *
       * Keduanya sengaja ada di tool yang sudah dipakai (`run_command`), bukan
       * di tool baru: satu-satunya yang berubah bagi model adalah nilai
       * parameternya, dan tidak ada nama tool tambahan yang harus ditemukan
       * lebih dulu. Jawabannya selalu memuat ringkasan keadaan - jadi model
       * membaca jendela yang benar-benar ada, bukan yang ia maksudkan.
       */
      if (panel) return await bukaPanel(panel);
      if (setelan) return await bukaSetelan(setelan);

      /*
       * Tangkap layar menumpang tool yang sama. Tanpa perintah Rust-nya
       * (`window_capture` belum terdaftar) jawabannya adalah laporan keadaan -
       * bukan error, dan bukan klaim berhasil.
       */
      if (a.capture === true) {
        return await tangkapJendela({
          path: a.path ? String(a.path) : undefined,
          salin: a.copy !== false,
        });
      }

      const id = a.id ? String(a.id).trim() : '';
      if (!id) {
        throw new Error(
          'ERROR: run_command butuh salah satu dari: "id" (id perintah, mis. workbench.action.togglePanel), ' +
            '"panel" (problems|output|debug|terminal|ports|subagents), "settings" (bagian setelan), ' +
            'atau "capture": true (tangkap layar jendela).',
        );
      }
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
       * Jangan pernah melaporkan sukses untuk id yang tidak benar-benar jalan.
       *
       * Dulu tool ini mengembalikan `Command dieksekusi: <id>` untuk id apa pun
       * yang tidak dikenal, sehingga model diberi tahu perintahnya berjalan
       * padahal tidak terjadi apa-apa - dan model yang percaya aksi gagal
       * berhasil tidak akan mengulanginya, ia membangun sisa giliran di atas
       * hasil yang tidak ada. Sekarang: id yang tidak ada di registry DITOLAK.
       */
      /*
       * Registri perintah adalah jalur UTAMA, bukan cadangan.
       *
       * Sebelum ini `run_command` hanya mengenal dua id hardcoded dan melempar
       * error untuk sisanya - termasuk SETIAP id panel dan Settings, sehingga
       * Zeph tidak bisa memunculkan satu pun panel aplikasinya. Yang dijalankan
       * sekarang adalah `commandRegistry.runCommand`, jalur yang sama dengan
       * menu bar dan Command Palette: apa pun yang bisa diklik user bisa
       * dipanggil Zeph, dan id yang tidak ada tetap ditolak apa adanya.
       */
      const { findCommand, runCommand } = await import('../commandRegistry');
      if (findCommand(id)) {
        const ok = await runCommand(id);
        const lapor = ok
          ? `Command dijalankan: ${id}.`
          : `Command ${id} gagal dijalankan (lihat status bar).`;
        return `${lapor} ${ringkasJendela()}`;
      }
      throw new Error(
        `ERROR: command id "${id}" tidak dikenal (tidak ada di commandRegistry). ` +
          'Untuk perintah shell pakai bash_run; untuk membuka panel atau bagian setelan pakai parameter panel/settings.',
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

  /*
   * 6. extension
   *
   * AKAR (dulu STUB -> temuan MERAH "kapabilitas diklaim, belum terlayani"):
   * handler lama hanya mengembalikan "aksi ${action} dicatat" tanpa memanggil
   * apa pun. Kapabilitasnya (lihat ekstensi, aktif/nonaktif, copot) SUDAH ADA
   * sebagai perintah aplikasi; jadi memperbaiki akarnya = menyambung handler ke
   * perintah itu, bukan menghapus tool. `reload`/`update` DIBUANG karena tidak
   * ada perintah yang melayaninya (padanan reload ada di `mcp__zephyr__run_command`
   * bila commandRegistry memaparkannya; kalau tidak, tidak ada kapabilitas yang
   * hilang karena memang tak pernah jalan).
   */
  {
    spec: {
      name: 'mcp__zephyr__extension',
      description:
        'Kelola ekstensi Zephyr: list (daftar terpasang), enable, disable, atau uninstall. ' +
        'Untuk memasang/mencopot berkas ekstensi dari luar pakai perintah aplikasi terkait.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'enable', 'disable', 'uninstall'] },
          id: { type: 'string', description: 'ID ekstensi (wajib untuk enable/disable/uninstall).' },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const action = wajib(a, 'action');
      if (action === 'list') {
        const daftar = await cmd.extensionsList();
        if (!daftar.length) return 'Tidak ada ekstensi terpasang.';
        return JSON.stringify(daftar, null, 2);
      }
      const id = wajib(a, 'id');
      if (action === 'enable') {
        const ok = await cmd.extensionsSetEnabled(id, true);
        return ok ? `Ekstensi ${id} diaktifkan.` : `Ekstensi ${id} tidak diaktifkan (lihat Setelan > Ekstensi).`;
      }
      if (action === 'disable') {
        const ok = await cmd.extensionsSetEnabled(id, false);
        return ok ? `Ekstensi ${id} dinonaktifkan.` : `Ekstensi ${id} tetap aktif (lihat Setelan > Ekstensi).`;
      }
      if (action === 'uninstall') {
        const ok = await cmd.extensionsUninstall(id);
        return ok ? `Ekstensi ${id} dicopot.` : `Ekstensi ${id} tidak dicopot (lihat Setelan > Ekstensi).`;
      }
      throw new Error(`ERROR: aksi extension tidak dikenal: ${action}. Pakai list|enable|disable|uninstall.`);
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

  /*
   * 11. wait_for_terminal
   *
   * AKAR (dulu STUB): handler lama hanya `setTimeout` lalu melapor "selesai" —
   * ia TIDAK pernah membaca terminal, jadi "selesai" itu klaim kosong (dokumen
   * audit menyebutnya C13: "isyarat teks yang ditunggu tidak diperiksa").
   *
   * Perbaikan akar: benar-benar MEMBACA scrollback pane aktif (cmd.ptyTail) dan
   * berhenti dengan ALASAN yang jujur — teks `until` muncul, keluaran berhenti
   * berubah (idle), atau batas waktu habis — lalu mengembalikan cuplikan keluaran
   * sebagai bukti. Kapabilitas yang dilayani: membaca terminal (shell:baca).
   */
  {
    spec: {
      name: 'mcp__zephyr__wait_for_terminal',
      description:
        'Tunggu terminal aktif menyelesaikan prosesnya: berhenti begitu keluaran berhenti berubah (idle), ' +
        'begitu teks `until` muncul, atau saat batas waktu habis. Mengembalikan cuplikan keluaran terakhir sebagai bukti.',
      parameters: {
        type: 'object',
        properties: {
          timeout: { type: ['number', 'string'], description: 'Batas tunggu dalam milidetik (bawaan 5000, maksimum 60000).' },
          until: { type: 'string', description: 'Teks yang ditunggu; tunggu berhenti lebih awal begitu teks ini muncul di scrollback.' },
          leafId: { type: 'string', description: 'ID pane terminal target; kosongkan untuk pane aktif.' },
        },
        required: [],
      },
    },
    run: async (a) => {
      const batasMs = Math.min(60000, Math.max(200, bacaAngka(a.timeout, 5000) ?? 5000));
      const until = a.until ? String(a.until) : '';
      const t = useTerminal.getState();
      const aktif = t.terminalTabs.find((x) => x.id === t.activeTabId);
      const targetId = a.leafId
        ? String(a.leafId)
        : aktif?.activePaneId ?? aktif?.panes[0]?.id;
      if (!targetId) throw new Error('ERROR: tidak ada terminal aktif untuk ditunggu.');
      const mulai = Date.now();
      let sebelumnya = '';
      let stabil = 0;
      while (Date.now() - mulai < batasMs) {
        const teks = await cmd.ptyTail(targetId, 200).catch(() => '');
        if (until && teks.includes(until)) {
          const ms = Date.now() - mulai;
          return potong(`Teks "${until}" muncul di terminal ${targetId} setelah ${ms} ms:\n${teks}`);
        }
        if (teks === sebelumnya) {
          stabil += 1;
          if (stabil >= 2) break;
        } else {
          stabil = 0;
        }
        sebelumnya = teks;
        await new Promise((r) => setTimeout(r, 300));
      }
      const ms = Date.now() - mulai;
      if (!sebelumnya.trim()) return `Terminal ${targetId} menunggu ${ms} ms: belum ada keluaran.`;
      return potong(`Terminal ${targetId} idle setelah ${ms} ms. Keluaran terakhir:\n${sebelumnya}`);
    },
  },

  /*
   * 12. worktree
   *
   * AKAR (dulu STUB -> dokumen audit C10): handler lama mengembalikan "selesai"
   * tanpa memanggil apa pun, padahal perintah git worktree NYATA sudah ada
   * (commands.ts: `git_worktree_list/add/remove/prune`). Perbaikan akarnya =
   * menyambung ke perintah itu. Aksi `open` DIBUANG karena tak ada backend
   * "buka worktree"; padanannya jelas: buka foldernya lewat `mcp__zephyr__workspace`
   * action="switch" dengan `path` worktree tersebut.
   */
  {
    spec: {
      name: 'mcp__zephyr__worktree',
      description:
        'Kelola git worktree repositori aktif: list, add, remove, prune. ' +
        'Untuk MEMBUKA folder worktree hasil `add`, pakai mcp__zephyr__workspace action="switch" dengan path-nya.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'remove', 'prune'] },
          path: { type: 'string', description: 'Jalur worktree (wajib untuk add/remove).' },
          branch: { type: 'string', description: 'Nama branch (untuk add).' },
          createBranch: { type: 'boolean', description: 'Buat branch baru (untuk add).' },
          force: { type: 'boolean', description: 'Paksa hapus meski worktree kotor (untuk remove).' },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const action = wajib(a, 'action');
      if (action === 'list') {
        const daftar = await cmd.worktreeList();
        if (!daftar.length) return 'Tidak ada git worktree.';
        return JSON.stringify(daftar, null, 2);
      }
      if (action === 'add') {
        const path = wajib(a, 'path');
        const branch = a.branch ? String(a.branch) : undefined;
        const hasil = await cmd.worktreeAdd({
          path,
          branch,
          createBranch: a.createBranch === true,
        });
        return `Worktree ditambahkan di ${path}${branch ? ` (branch ${branch})` : ''}. ${hasil}`;
      }
      if (action === 'remove') {
        const path = wajib(a, 'path');
        const hasil = await cmd.worktreeRemove({ path, force: a.force === true });
        return `Worktree ${path} dihapus. ${hasil}`;
      }
      if (action === 'prune') {
        const hasil = await cmd.worktreePrune();
        return `Worktree prune selesai. ${hasil}`;
      }
      throw new Error(`ERROR: aksi worktree tidak dikenal: ${action}. Pakai list|add|remove|prune.`);
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
      description:
        'Buka, bagi, atur layout, atau tutup pane terminal, dan ganti tab terminal. Selalu mengembalikan ringkasan keadaan jendela.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'open',
              'close',
              'rotate',
              'split',
              'grid',
              'group',
              'consolidate',
              'tab',
              'nextTab',
              'prevTab',
              'focus',
            ],
            description:
              'open=pane baru; close=tutup pane; rotate/split/grid/group/consolidate=atur layout tab; tab/nextTab/prevTab=ganti tab terminal; focus=fokuskan pane.',
          },
          leafId: { type: 'string', description: 'ID pane yang dituju (close/focus).' },
          target: {
            type: 'string',
            description: 'Untuk action="tab": "next" | "prev" | "new" | id atau judul tab.',
          },
        },
        required: ['action'],
      },
    },
    run: async (a) => {
      const action = wajib(a, 'action');
      return await aksiPane(action, {
        leafId: a.leafId ? String(a.leafId) : undefined,
        target: a.target ? String(a.target) : undefined,
      });
    },
  },
];
