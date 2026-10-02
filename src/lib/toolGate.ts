import { create } from 'zustand';
import { AGENT_TOOLS } from './agentTools';

const AGENT_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.spec.name);
const LEGACY_TOOL_NAMES = new Set([
  'file_read', 'file_list', 'editor_read',
  'file_write', 'file_edit', 'file_patch', 'editor_write',
  'get_problems', 'get_output', 'list_panes',
  'shell_exec', 'terminal_exec', 'terminal_read',
  'web_search', 'web_fetch', 'subagent_run',
  'todo_write', 'todo_read',
  'cron_create', 'cron_list', 'cron_delete',
  'skill_list', 'skill_view', 'skill_write', 'skill_delete', 'memory_read', 'memory_write',
  'mcp_call', 'browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_nav', 'browser_list',
]);

const EXTRA_GROUPS: Record<ToolGroupId, string[]> = {
  files: ['search_text', 'find_files', 'read_image', 'open_file', 'workspace', 'worktree'],
  edit: ['editor_save', 'file_delete', 'file_move', 'file_copy', 'dir_create', 'replace_in_files'],
  search: ['get_output'],
  /*
   * `ssh` TIDAK lagi di sini.
   *
   * Sebelumnya ia ada di daftar ini, dan itu membuat grup `ssh` kosong: grup
   * `shell` muncul lebih dulu di TOOL_GROUPS, jadi ia mengklaim `ssh` dan
   * penanda `seen` menolak klaim berikutnya. Akibatnya grup "SSH" di menu
   * tampil tanpa isi dan tombolnya tidak menyalakan apa pun - kerusakan yang
   * tidak terlihat sampai ada yang benar-benar mengkliknya.
   *
   * Aturannya: satu tool hanya boleh ada di SATU daftar. Grup di TOOL_GROUPS
   * yang menang, karena di situlah tempat yang dibaca orang saat mencari.
   */
  shell: ['terminal_kill', 'terminal_wait', 'pane_control', 'focus_pane'],
  web: ['browser_download_url', 'system_browser_open', 'browser_close'],
  agents: ['subagent_list'],
  tasks: [],
  schedule: ['schedule_command'],
  notes: ['settings', 'extensions'],
  mcp: [],
  /* Grup di bawah ini tidak menambah tool: isinya sudah didaftarkan lengkap di
     TOOL_GROUPS. Entrinya tetap ada karena `Record<ToolGroupId, string[]>`
     mensyaratkan SETIAP id punya kunci - dan itu memang yang diinginkan:
     menambah id grup baru tanpa menyebutnya di sini akan gagal dikompilasi,
     bukan diam-diam jadi grup kosong. */
  browser: [],
  ssh: [],
  skills: [],
};

function makeToolGroups(base: ToolGroup[]): ToolGroup[] {
  const seen = new Set<string>();
  const groups = base.map((group) => {
    const candidates = [...group.tools, ...(EXTRA_GROUPS[group.id] ?? [])];
    const tools = candidates.filter((name) => {
      if (!AGENT_TOOL_NAMES.includes(name) || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    return { ...group, tools };
  });
  const ungrouped = AGENT_TOOL_NAMES.filter((name) => !seen.has(name));
  /*
   * A tool that is in the catalogue but in no group used to be pushed into
   * `groups[0]` (files) unconditionally. That is how `git` and `task_complete`
   * ended up listed under "Files" in the tool menu, where nobody looks for
   * them, and any tool added to agentTools.ts later would silently land there
   * too.
   *
   * Each stray tool now gets its own group. The id must be UNIQUE, not a reused
   * 'tasks': the store looks a group up with `find(g => g.id === id)`, so a
   * repeated id makes every group after the first one untoggleable - the menu
   * would flip the wrong rows. `ToolGroupId` is widened to allow these.
   */
  for (const name of ungrouped) {
    groups.push({ id: `tool:${name}` as ToolGroupId, tools: [name] });
  }
  return groups;
}

/*
 * Tool gate for the in-editor agent.
 *
 * The agent exposes a wide catalogue — shell, file writes, browser control,
 * cron, sub-agents — and not every session should hand all of it to the model.
 * This store is the single place that decides which tools may be called, so a
 * user can narrow the surface without editing a config file.
 *
 * State lives in memory and mirrors to `settings.ai.tools` through the caller;
 * the store itself stays synchronous so the menu can toggle rows without a
 * round-trip.
 */

/** Catalogue groups, in the order the menu lists them. */
/*
 * The ten curated groups, plus `tool:<name>` for a catalogue tool that no
 * curated group claims (see makeToolGroups). Those synthetic ids keep their own
 * row in the menu and must stay unique.
 */
export type ToolGroupId =
  | 'files' | 'edit' | 'search' | 'shell' | 'web' | 'agents' | 'tasks' | 'schedule' | 'notes' | 'mcp'
  /*
   * Grup yang sejak awal MATI (lihat GRUP_MATI_AWAL di bawah): permukaan yang
   * bisa menghabiskan uang, menyentuh mesin lain, atau berjalan sendiri tanpa
   * diminta. Semuanya bisa dihidupkan user, tapi tidak menyala sendiri.
   */
  | 'browser' | 'ssh' | 'skills'
  | `tool:${string}`;

/*
 * SECTION: dua tingkat, seperti TEDI.
 *
 * Panel TEDI (src/modules/ai/tools/catalog.ts) menyusun katalognya sebagai
 * ToolSection = "Built-in" | "MCP" | "Extensions", dan di dalam tiap section
 * ada grup. Pemisahan itu punya alasan yang jelas bagi pembaca: tool bawaan
 * aplikasi dan tool yang datang dari server MCP punya ASAL yang berbeda, dan
 * ketika ada yang tidak berfungsi, pertanyaan pertama selalu "ini tool siapa".
 * Satu daftar pipih berisi tiga puluh baris tidak bisa menjawab itu.
 *
 * Di Zephyr namanya "Zephyr", bukan "Built-in": di sini ada juga tool yang
 * datang dari extension, dan label yang menyebut nama aplikasinya langsung
 * menjawab pertanyaan itu tanpa perlu dijelaskan.
 */
export type ToolSection = 'zephyr' | 'mcp' | 'extensions';

/**
 * Section untuk sebuah grup.
 *
 * Diturunkan dari ID grupnya, bukan disimpan di tiap entri `TOOL_GROUPS`.
 * Dua daftar yang harus dijaga sinkron akan berbeda pendapat cepat atau lambat,
 * dan yang paling sering terjadi adalah grup baru ditambahkan ke satu daftar
 * saja - lalu menghilang dari panel tanpa pesan apa pun.
 *
 * Grup `mcp` berisi tool yang datang dari server MCP Zephyr, jadi sectionnya
 * mengikuti. Sisanya bawaan aplikasi.
 */
export function sectionDariGrup(id: string): ToolSection {
  if (id === 'mcp') return 'mcp';
  if (id.startsWith('ext:')) return 'extensions';
  return 'zephyr';
}

/** Nama section yang ditampilkan, urut sesuai kepentingannya bagi pembaca. */
export const SECTION_URUTAN: { id: ToolSection; label: string }[] = [
  { id: 'zephyr', label: 'Zephyr' },
  { id: 'mcp', label: 'MCP' },
  { id: 'extensions', label: 'Extensions' },
];

export interface ToolGroup {
  id: ToolGroupId;
  /** Tool names as they appear in `agentTools.ts` — the join key. */
  tools: string[];
}

/*
 * Groups map tool names to the headings a reader expects.
 *
 * They follow the shape of the work rather than the module layout: `file_read`
 * and `file_list` are one idea to anyone scanning the list, and splitting them
 * across "files" and "search" would make the counts meaningless.
 */
export const TOOL_GROUPS: ToolGroup[] = makeToolGroups([
  { id: 'files', tools: ['file_read', 'file_list', 'editor_read'] },
  { id: 'edit', tools: ['file_write', 'file_edit', 'file_patch', 'editor_write'] },
  /*
   * `git` ditambahkan ke grup ini.
   *
   * Ia satu-satunya tool dari 76 yang belum punya grup - dan itu ketahuan hanya
   * karena ada skrip yang membandingkan daftar tool di `agentTools.ts` dengan
   * daftar grup di sini. Tool tanpa grup tetap bisa dipakai lewat sekat
   * `tool:<nama>`, tapi barisnya muncul sendirian di ujung daftar dan terbaca
   * seperti kelalaian, bukan pilihan.
   *
   * Diletakkan bersama `get_problems` dan `get_output` karena ketiganya sama:
   * MELIHAT keadaan, bukan mengubahnya. Riwayat git, masalah kode, dan keluaran
   * program adalah tiga jawaban untuk pertanyaan yang sama - "apa yang sedang
   * terjadi di proyek ini".
   */
  { id: 'search', tools: ['get_problems', 'get_output', 'list_panes', 'git'] },
  { id: 'shell', tools: ['shell_exec', 'terminal_exec', 'terminal_read', 'start_server', 'server_status', 'server_stop', 'run_tests', 'debug'] },
  { id: 'web', tools: ['web_search', 'web_fetch'] },
  { id: 'agents', tools: ['subagent_run'] },
  { id: 'tasks', tools: ['todo_write', 'todo_read', 'run_task', 'panel_focus', 'lsp_query', 'snippets', 'keybindings'] },
  { id: 'schedule', tools: ['cron_create', 'cron_list', 'cron_delete', 'schedule_command'], },
  { id: 'notes', tools: ['memory_read', 'memory_write'] },
  /*
   * Grup di bawah ini sejak awal MATI (lihat GRUP_MATI_AWAL). Pemisahannya
   * bukan soal risiko - `notes` pun bisa menulis - melainkan soal SEBERAPA
   * SERING dipakai. Sesi menyunting berkas hampir tidak pernah membuka SSH
   * atau menjadwalkan cron, jadi membiarkannya menyala hanya membuat daftar
   * pilihan panjang tanpa guna.
   */
  { id: 'mcp', tools: ['mcp_call'] },
  { id: 'browser', tools: ['browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_nav', 'browser_list'] },
  { id: 'ssh', tools: ['ssh'] },
  { id: 'skills', tools: ['skill_list', 'skill_view', 'skill_write', 'skill_delete'] },
  /*
   * 'cron' dan 'language' SENGAJA TIDAK ADA di sini.
   *
   * Keduanya sempat saya tambahkan, lalu ketahuan kosong: `cron_create` dan
   * kawan-kawan sudah diklaim grup `schedule`, dan `lsp_query` diklaim grup
   * `tasks` - dua-duanya muncul lebih dulu, jadi penanda `seen` menolak klaim
   * berikutnya. Grup kosong tetap tampil di menu dengan kepala dan tombolnya,
   * tapi tidak menyalakan apa pun; itu terbaca seperti kerusakan.
   *
   * Jadi tool-nya tetap bisa dihidupkan dari grup `schedule` dan `tasks`.
   * Menambah grup kedua untuk tool yang sama hanya akan mengulang kesalahan
   * itu.
   */
]);

/** Every tool the gate knows about, derived from the executable catalogue. */
export const SEMUA_TOOL: string[] = [...AGENT_TOOL_NAMES];

/**
 * The subset of write tools that PERSIST to disk.
 *
 * `TOOL_TULIS` in agentTools is the wider "changes something" set: it also
 * covers `run_tests`, `panel_focus`, `git`, `settings`, layout and scheduling
 * tools. Only the names here can put bytes on disk, so only these need the
 * user's consent before the call is dispatched. `editor_write` is deliberately
 * ABSENT: it rewrites the live buffer of an already-open tab and never saves,
 * so the user still has to press save — and the dirty dot already surfaces it.
 * Prompting for it would train people to click through the dialog, which is
 * exactly what makes the real write prompt worthless.
 *
 * This lives next to the tool catalogue because both the main agent loop
 * (aiStore) and the subagent loop (subagentStore) must agree on it; keeping
 * one exported constant is what stops the two lists from drifting.
 */
export const TOOL_DISK_TULIS: Set<string> = new Set([
  'file_write',
  'file_edit',
  'file_patch',
  'editor_save',
  'file_delete',
  'file_move',
  'file_copy',
  'dir_create',
  'replace_in_files',
]);

/** True when the named tool can write to disk without the user saving first. */
export function menulisKeDisk(nama: string): boolean {
  return TOOL_DISK_TULIS.has(nama);
}

/**
 * What each tool does, in one line, for the tool list.
 *
 * The list used to show a bare name, which is enough for someone who already
 * knows the tool and useless for anyone deciding whether to leave it on. TEDI
 * prints the name and then the thing it acts on — "MCP TEDI READ terminal",
 * "MCP TEDI SH Get-CimInstance ..." — so a reader can tell a read from a write
 * without opening documentation. The strings here are deliberately about the
 * OBJECT (what it touches), not the verb: the verb is already in the name.
 */
export const TOOL_DESKRIPSI: Record<string, string> = {
  file_read: 'path',
  file_list: 'folder',
  editor_read: 'active buffer',
  file_write: 'path + contents',
  file_edit: 'old text → new text',
  file_patch: 'unified diff',
  editor_write: 'active buffer',
  get_problems: 'diagnostics',
  get_output: 'panel channel',
  list_panes: 'open panes',
  shell_exec: 'command → exit code + output',
  terminal_exec: 'command → live pane',
  terminal_read: 'pane scrollback',
  web_search: 'query',
  web_fetch: 'url',
  subagent_run: 'task list (parallel)',
  todo_write: 'task list',
  todo_read: '—',
  cron_create: 'schedule + prompt',
  cron_list: '—',
  cron_delete: 'id',
  skill_list: '—',
  skill_view: 'skill name',
  skill_write: 'skill name + body',
  skill_delete: 'skill name',
  memory_read: '—',
  memory_write: 'entry',
  mcp_call: 'server + tool + args',
  browser_open: 'url → page text',
  browser_read: 'open page',
  browser_click: 'css selector',
  browser_type: 'selector + text',
  browser_nav: 'back | forward | reload | url',
  browser_list: '—',
};

for (const name of SEMUA_TOOL) {
  if (!TOOL_DESKRIPSI[name]) TOOL_DESKRIPSI[name] = 'agent tool';
}

/** Groups collapsed in the menu; the rest start open. */
const TERTUTUP_AWAL: ToolGroupId[] = ['mcp'];

interface ToolGateState {
  /** Tools the model may call. Everything absent is refused. */
  aktif: Set<string>;
  /** User-typed filter in the menu header. */
  cari: string;
  /** Whether the floating menu is on screen. */
  buka: boolean;
  /** Collapsed group ids. */
  tutup: Set<ToolGroupId>;
  /** Tools the user has permanently opted in to writing to disk with. */
  tulisIzin: Set<string>;

  setBuka: (v: boolean) => void;
  toggle: () => void;
  setCari: (v: string) => void;
  /** Flip one tool. */
  balik: (nama: string) => void;
  /** Enable every tool in a group, or disable them all. */
  setGrup: (id: ToolGroupId, nyala: boolean) => void;
  semua: (nyala: boolean) => void;
  lipat: (id: ToolGroupId) => void;
  /** Hydrate from persisted settings; unknown names are ignored. */
  dari: (nama: string[]) => void;

  /**
   * Per-tool consent for DISK WRITES, separate from the command allow-list.
   *
   * `settings.allowCommands` holds shell command prefixes and is matched with
   * `startsWith`; reusing it here would let a command name whitelist a file
   * write, which is not what the user agreed to. Empty means "nothing opted
   * in", so every write prompts until the user chooses otherwise.
   */
  tulisDiizinkan: (nama: string) => boolean;
  izinkanTulis: (nama: string, izin: boolean) => void;
}

/*
 * Tool yang WAJIB selalu nyala.
 *
 * Ini bukan preferensi - ini yang membuat agen bisa bekerja sama sekali.
 * Tanpa pembaca berkas ia menebak isi kode; tanpa pencari ia menyisir
 * direktori satu per satu; tanpa shell ia tidak bisa menjalankan apa pun untuk
 * MEMBUKTIKAN pekerjaannya; tanpa `task_complete` ia tidak punya cara mengakhiri
 * giliran dengan rapi; tanpa `get_problems` ia tidak tahu kodenya rusak.
 *
 * Daftarnya sengaja PENDEK. Setiap tool yang ditambahkan di sini mengurangi
 * kendali user tanpa memberi manfaat; yang lain cukup jadi default-nya saja.
 */
export const TOOL_WAJIB: readonly string[] = [
  'editor_read',
  'file_list',
  'search_text',
  'shell_exec',
  'task_complete',
  'get_problems',
];

/**
 * Tool yang nyala secara DEFAULT, di luar yang wajib.
 *
 * Sebelumnya SEMUA tool nyala (`new Set(SEMUA_TOOL)`). Itu berarti model bisa
 * menyentuh browser, SSH, cron, MCP dan SSH sejak menit pertama, padahal
 * sesi menyunting berkas tidak pernah memakainya - dan daftar pilihannya jadi
 * dinding yang tidak terbaca.
 *
 * Yang ada di sini adalah yang dipakai hampir setiap sesi. Sisanya tetap
 * TERSEDIA, dan hidup dengan satu klik lewat grupnya di menu tool - jadi tidak
 * ada kemampuan yang hilang, hanya tidak lagi aktif tanpa diminta.
 */
export const TOOL_DEFAULT: readonly string[] = [
  ...TOOL_WAJIB,
  /* Membaca dan menyunting. */
  'file_read',
  'editor_write',
  'editor_save',
  'file_edit',
  'file_write',
  'file_patch',
  'replace_in_files',
  /* Mencari dan memeriksa. */
  'find_files',
  'get_output',
  'list_panes',
  /* Menjalankan dan mengawasi terminal. */
  'terminal_exec',
  'terminal_read',
  /* Mencari di web. */
  'web_search',
  'web_fetch',
  /* Membagi pekerjaan. */
  'subagent_run',
  /* Mencatat rencana dan ingatan. */
  'todo_write',
  'todo_read',
  'memory_read',
  'memory_write',
  /* Berkomunikasi balik dan memeriksa tampilan sendiri. */
  'ask_user',
  'clipboard_read',
  'clipboard_write',
  'screenshot_ui',
  'plan_mode',
];

/**
 * Grup yang sejak awal MATI.
 *
 * Semuanya adalah permukaan yang bisa menghabiskan uang, menyentuh sistem di
 * luar proyek, atau mengubah sesuatu di luar berkas: browser otomatis, SSH ke
 * mesin lain, cron yang berjalan sendiri, server MCP, dan kontrol jendela.
 * Satu klik menghidupkannya - yang penting adalah user MEMILIH, bukan
 * menemukannya sudah menyala.
 */
export const GRUP_MATI_AWAL: readonly ToolGroupId[] = ['mcp', 'browser', 'ssh', 'skills'];

export const useToolGate = create<ToolGateState>((set, get) => ({
  /*
   * Sekat awalnya adalah TOOL_DEFAULT saja. Grup yang mati tidak perlu
   * dikurangi dari sini - nama-nama di grup itu memang TIDAK ada di
   * TOOL_DEFAULT, jadi sudah mati dengan sendirinya.
   */
  aktif: new Set(TOOL_DEFAULT),
  cari: '',
  buka: false,
  /* Grup yang mati sejak awal sekaligus terlipat: kalau tidak, menu terbuka
     dengan enam kepala grup yang isinya semuanya tidak aktif, dan itu terbaca
     seperti kerusakan alih-alih seperti pilihan yang belum diambil. */
  tutup: new Set([...TERTUTUP_AWAL, ...GRUP_MATI_AWAL]),
  tulisIzin: new Set<string>(),

  tulisDiizinkan: (nama) => get().tulisIzin.has(nama),

  izinkanTulis: (nama, izin) =>
    set((s) => {
      const next = new Set(s.tulisIzin);
      if (izin) next.add(nama);
      else next.delete(nama);
      return { tulisIzin: next };
    }),

  setBuka: (v) => set({ buka: v }),
  toggle: () => set({ buka: !get().buka }),
  setCari: (v) => set({ cari: v }),

  balik: (nama) =>
    set((s) => {
      const next = new Set(s.aktif);
      if (next.has(nama)) next.delete(nama);
      else next.add(nama);
      return { aktif: next };
    }),

  setGrup: (id, nyala) =>
    set((s) => {
      const grup = TOOL_GROUPS.find((g) => g.id === id);
      if (!grup) return {};
      const next = new Set(s.aktif);
      for (const t of grup.tools) {
        if (nyala) next.add(t);
        else next.delete(t);
      }
      return { aktif: next };
    }),

  semua: (nyala) => set({ aktif: new Set(nyala ? SEMUA_TOOL : []) }),

  lipat: (id) =>
    set((s) => {
      const next = new Set(s.tutup);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { tutup: next };
    }),

  /*
   * An empty persisted list means "nothing was ever chosen", not "deny all" —
   * a fresh profile must start with the full catalogue or the agent answers
   * every request with a permission error. Only a non-empty list narrows.
   */
  dari: (nama) => {
    if (!Array.isArray(nama) || nama.length === 0) return;
    const sah = nama.filter((n) => SEMUA_TOOL.includes(n));
    if (sah.length === 0) return;
    const additions = SEMUA_TOOL.filter((n) => !LEGACY_TOOL_NAMES.has(n));
    const isLegacySettings = !sah.some((n) => additions.includes(n));
    // Older settings stored only enabled names and therefore cannot express a
    // deliberate choice about tools introduced later. Preserve those choices,
    // while enabling newly catalogued tools. Once a new tool is present in the
    // persisted list, omissions are explicit and the list is respected exactly.
    const effective = isLegacySettings ? [...new Set([...sah, ...additions])] : sah;
    set({ aktif: new Set(effective) });
  },
}));
