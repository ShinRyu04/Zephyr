/**
 * `tunjuk` — turn "I can't find it" into "it is open now".
 *
 * ## The gap this closes
 *
 * Zephyr could already OPEN any Settings section or panel (`run_command` takes
 * `settings` and `panel`), and the whole catalogue of settings is in the fact
 * index. But the model had to know WHICH section to open, and the reader's
 * complaint is precisely that they do not: "si AI zephyr bisa munculkan menu
 * otomatis kalau sih users gatau tmpatnya".
 *
 * Explaining the location is not the same as opening it. A reader who says "I
 * don't know where it is" and gets a paragraph telling them where to click has
 * been given homework, not help.
 *
 * ## Why one tool and not two
 *
 * `peta` (search the index) and `run_command` (open something) both exist.
 * Chaining them means the model must translate a complaint into a section name
 * by itself - which is the exact step it gets wrong. This tool does the
 * translation and the opening in one call, so a wrong answer is visible
 * immediately (the wrong page opens) instead of arriving as a confident sentence.
 *
 * ## What it will NOT do
 *
 * If nothing matches, it says so and lists what it does know. It never guesses a
 * section: opening the wrong page is worse than admitting the gap, because the
 * reader then has to work out that the page is wrong too.
 */
import type { AgentTool } from '../agentTools';
import { daftarPanel, daftarSetelan, bukaPanel, bukaSetelan } from './kendaliJendela';
import { cariFakta } from '../zephyrCari';

/**
 * Plain-language triggers per Settings section.
 *
 * Deliberately hand-written rather than derived: the fact index knows the section
 * NAMES (`agents`, `theme`, `mcp`), and a reader's complaint never uses those
 * words. "AI-nya boros token" is not the string "agents", and no search over
 * labels bridges that - the bridge is what this table is.
 *
 * ONLY sections that still have a row in the Settings nav belong here. Agent
 * settings (`agents`, `rules`, `subagent`, `permissions`) and `mcp` moved into
 * the Agent Customizations panel and are reachable only from the tables below -
 * opening the Settings window for them lands the reader on a page whose nav has
 * no such row.
 *
 * Matching picks the entry with the LONGEST matching trigger, not the first one,
 * so a narrow word ("agent") can no longer swallow a more specific intent.
 */
const NIAT_SETELAN: { seksi: string; kata: string[]; apa: string }[] = [
  {
    seksi: 'theme',
    kata: ['tema', 'theme', 'warna', 'gelap', 'terang', 'dark mode', 'light mode', 'ukuran huruf'],
    apa: 'tema, warna aksen, dan ukuran huruf',
  },
  {
    seksi: 'editor',
    kata: ['editor', 'indentasi', 'indent', 'word wrap', 'minimap', 'auto save', 'simpan otomatis'],
    apa: 'perilaku editor: indentasi, word wrap, minimap, simpan otomatis',
  },
  {
    seksi: 'shortcuts',
    kata: ['pintasan', 'shortcut', 'keybind', 'hotkey'],
    apa: 'daftar dan pengubahan pintasan papan tombol',
  },
  {
    seksi: 'models',
    kata: ['model', 'provider', 'api key', 'apikey', 'kunci api', 'gemini', 'openai', 'claude', 'deepseek', 'base url'],
    apa: 'model dan provider: kunci API, base URL, model mana yang dipakai',
  },
  {
    seksi: 'lsp',
    kata: ['lsp', 'language server', 'intellisense', 'autocomplete', 'diagnostik', 'squiggle'],
    apa: 'language server: mana yang jalan dan mana yang gagal',
  },
  {
    seksi: 'extensions',
    kata: ['ekstensi', 'extension', 'marketplace', 'plugin'],
    apa: 'ekstensi: terpasang, dimatikan, dan yang gagal dimuat',
  },
  {
    seksi: 'scm',
    kata: ['git', 'commit', 'source control', 'scm', 'branch', 'diff'],
    apa: 'source control: commit, branch, dan perubahan yang belum disimpan',
  },
  {
    /*
     * `security` comes BEFORE the generic permission words were split out above:
     * "atur izin akses web" is about the web allowlist, not about which tools the
     * agent may call. The old table had plain `izin` in BOTH entries, and because
     * `agents` is first it swallowed every permission question - measured:
     * "atur izin akses web" resolved to `agents`.
     */
    seksi: 'security',
    kata: ['izin akses', 'izin web', 'akses web', 'security', 'keamanan', 'allowlist', 'jaringan', 'koneksi keluar'],
    apa: 'izin dan keamanan: isi web, allowlist host, dan akses jaringan',
  },
  {
    seksi: 'accessibility',
    kata: ['aksesibilitas', 'accessibility', 'kontras', 'screen reader', 'pembaca layar'],
    apa: 'aksesibilitas: kontras, fokus, dan pembaca layar',
  },
  {
    seksi: 'general',
    kata: ['umum', 'general', 'bahasa antarmuka', 'ganti bahasa', 'sidebar', 'tata letak', 'layout'],
    apa: 'setelan umum: bahasa, tata letak, dan sidebar',
  },
  {
    seksi: 'about',
    kata: ['versi aplikasi', 'cek versi', 'version', 'pembaruan', 'tentang aplikasi', 'about'],
    apa: 'versi aplikasi dan status pembaruan',
  },
];

const NIAT_PANEL: { panel: string; kata: string[]; apa: string }[] = [
  { panel: 'terminal', kata: ['terminal', 'shell', 'bash', 'powershell', 'cmd'], apa: 'panel terminal' },
  { panel: 'problems', kata: ['masalah', 'problem', 'error', 'galat', 'diagnostik'], apa: 'panel masalah' },
  { panel: 'output', kata: ['output', 'keluaran', 'log'], apa: 'panel output' },
  { panel: 'debug', kata: ['debug', 'breakpoint', 'debugger'], apa: 'panel debug' },
  { panel: 'ports', kata: ['port', 'port forwarding'], apa: 'panel port' },
  { panel: 'subagents', kata: ['subagent', 'sub-agen'], apa: 'panel subagent' },
];

/**
 * Surfaces that are neither a Settings section nor a bottom-panel tab.
 *
 * These are the destinations a reader most often means when they ask "where is
 * it" and the answer is NOT inside Settings: the model picker is in the chat
 * header, Chat Settings is its own window, the palette is a keystroke away. The
 * Settings table above cannot reach any of them, and the panel table would open
 * the wrong surface entirely - so they get their own table.
 *
 * Checked BEFORE the Settings table: "where do I pick the model" mentions the
 * word `model`, which the Settings table maps to the AI Models pop-up. That is
 * the right page for "where do I put my API key" and the wrong one for "where
 * do I switch the model", so the more specific surface has to win.
 */
const NIAT_PERMUKAAN: {
  id: string;
  kata: string[];
  apa: string;
  /**
   * Opens the surface. A string is the sentence the model must forward
   * verbatim when the surface has its own detail worth naming (the tab that was
   * picked); returning nothing means the generic line is enough.
   */
  buka: () => void | string | Promise<void | string>;
}[] = [
  {
    id: 'picker-model',
    kata: [
      'pilih model', 'ganti model', 'ganti ai', 'daftar model', 'model apa',
      'switch model', 'choose model', 'change model', 'model picker', 'model selector',
      'hydrafusion',
    ],
    apa: 'daftar pilihan model, di header panel chat',
    buka: async () => {
      /*
       * The chat has to be ON SCREEN before its header can be pointed at.
       * `aiPanel` decides where it lives (right column, editor tab, or its own
       * window), so the same three calls `commandRegistry`'s `bukaAi` makes are
       * repeated here rather than a bottom-dock tab that no longer exists.
       */
      const { useStore } = await import('../store');
      const { useAi } = await import('../aiStore');
      const s = useStore.getState();
      s.setSettingsOpen(false);
      if ((s.settings?.general?.aiPanel ?? 'right') === 'window') {
        const m = await import('../aiWindow');
        m.bukaAiWindow();
      } else {
        s.setAiKolomVisible(true);
      }
      /* One tick for the panel to mount before the menu asks to be open: the
         picker only renders its menu while it exists. */
      await new Promise((r) => window.setTimeout(r, 120));
      useAi.getState().setModelMenuOpen(true);
      return 'Sudah saya buka daftar pilihan model di header chat.';
    },
  },
  {
    id: 'chat-settings',
    kata: [
      'chat settings', 'setelan chat', 'pengaturan chat', 'atur mode', 'ganti mode',
      'atur persona', 'aturan chat', 'sub-agent settings', 'setelan subagent',
    ],
    apa: 'jendela Chat Settings',
    buka: () => bukaChatSettings(''),
  },
  {
    id: 'command-palette',
    kata: ['command palette', 'palet perintah', 'palet', 'perintah apa saja'],
    apa: 'palet perintah (Ctrl+Shift+P)',
    buka: () => {
      void import('../paletteStore').then((m) => m.usePalette.getState().openPalette('command'));
    },
  },
  {
    id: 'explorer',
    kata: ['explorer', 'pohon berkas', 'file tree', 'bilah berkas', 'sidebar berkas'],
    apa: 'bilah Explorer di kiri',
    buka: async () => {
      const { useStore } = await import('../store');
      const s = useStore.getState();
      s.setSidebarVisible(true);
      s.setActivity('explorer');
    },
  },
  {
    id: 'agent-custom',
    kata: [
      'kustomisasi agen', 'agent custom', 'agent customization', 'customization', 'kustomisasi',
      'peran agen', 'agent role', 'atur agen', 'aturan agen', 'agent rules',
      'agent hooks', 'agent personas', 'skill agen',
      /*
       * These used to sit in the Settings table as the `agents` section. That
       * section has no row in the Settings nav any more - the panel owns it - so
       * the triggers moved here rather than disappearing.
       */
      'boros token', 'hemat token', 'anggaran konteks', 'konteks agen', 'agent context',
      'permission tool', 'izin tool', 'subagent', 'max step', 'batas langkah',
      'system prompt', 'instruksi tetap', 'agent', 'agen',
    ],
    apa:
      'panel Agent Customizations (Agents, Skills, Rules, Hooks, Personas, Browser, Conversations)',
    buka: () => bukaAgentCustom(''),
  },
  {
    /*
     * MCP servers are a tab of the Agent Customizations panel, not a Settings
     * page. The old entry pointed at `seksi: 'mcp'`, which no longer has a nav
     * row - the reader ended up in the Settings window looking at a list that
     * does not contain it.
     */
    id: 'agent-mcp',
    kata: ['mcp', 'tools luar', 'tools eksternal', 'server eksternal', 'port 9222', 'server mcp'],
    apa: 'tab MCP di panel Agent Customizations: port, token, dan server luar yang terpasang',
    buka: () => bukaAgentCustom('mcp'),
  },
  {
    id: 'agent-todo',
    kata: [
      'to-do', 'to do', 'todo', 'todo list', 'daftar tugas', 'kartu tugas', 'task list',
      'todo_write', 'rencana tugas',
    ],
    apa: 'daftar To-Do List agen, di panel Agent Customizations > Conversations',
    buka: () => bukaAgentCustom('todo'),
  },
];

/**
 * A named tab INSIDE the Agent Customizations window.
 *
 * "Where do I write my own rules for the agent" is a Settings question the
 * panel answers, and opening the panel onto its first tab still leaves the
 * reader one click short. The tab travels as the panel's section argument,
 * which `panelWindow.ts` puts in the window's URL hash (`&s=`), so it reaches
 * the separate WebView even though the two windows share no store.
 */
/*
 * Keys are the REAL `NAV` ids from `AgentCustomPage.tsx`, not the labels: the
 * page validates the incoming id against that list and silently keeps its old
 * section when the two disagree, so an invented id (e.g. 'rules' for what is
 * actually 'instructions') opens the panel on the wrong tab with no error.
 */
const TAB_AGEN: { kata: string[]; tab: string; label: string }[] = [
  { kata: ['rule', 'aturan agen', 'agent rules'], tab: 'instructions', label: 'Rules & Memories' },
  { kata: ['hook'], tab: 'hooks', label: 'Hooks' },
  { kata: ['skill'], tab: 'skills', label: 'Skills' },
  { kata: ['plugin'], tab: 'plugins', label: 'Plugins' },
  {
    kata: ['conversation', 'percakapan', 'riwayat chat', 'to-do', 'to do', 'todo', 'daftar tugas', 'kartu tugas', 'task list', 'todo_write'],
    tab: 'conversations',
    label: 'Conversations',
  },
  { kata: ['browser agen', 'agent browser'], tab: 'browser', label: 'Browser' },
  { kata: ['mcp', 'tools luar', 'tools eksternal', 'server eksternal', 'port 9222'], tab: 'mcp', label: 'MCP' },
  { kata: ['izin tool', 'permission tool', 'permission', 'permissions'], tab: 'permissions', label: 'Permissions' },
];

async function bukaAgentCustom(niat: string): Promise<string> {
  const pilih = pilihTerbaik(niat, TAB_AGEN);
  const tab = pilih?.tab ?? 'agents';
  const label = pilih?.label ?? 'Agents';
  const m = await import('../bukaPanel');
  m.bukaPanel('agent-custom', tab);
  /*
   * The To-Do List is not a tab of its own: it is the first section of the
   * Conversations tab. Saying "tab Conversations" alone still leaves the reader
   * scanning the page, so name where inside it to look.
   */
  const dalam = tab === 'conversations' ? ' — To-Do List ada di bagian paling atas tab itu' : '';
  return `Sudah saya buka panel Agent Customizations, tab ${label}${dalam}. Tab lain di panel itu: Overview, Agents, Skills, Rules & Memories, Hooks, Plugins, MCP, Browser, Conversations, Permissions, Tools, Migrations.`;
}

/**
 * A named section INSIDE Chat Settings. Ids are the real `SECTIONS` ids from
 * `ChatSettingsPage.tsx`; the page takes the value from the window hash, so a
 * wrong id silently leaves it on Mode.
 */
const SEKSI_CHAT: { kata: string[]; seksi: string; label: string }[] = [
  { kata: ['mode', 'read-only', 'readonly', 'kerja'], seksi: 'mode', label: 'Mode' },
  { kata: ['context', 'konteks'], seksi: 'context', label: 'Context' },
  { kata: ['sub-agent', 'subagent', 'sub agent'], seksi: 'subagent', label: 'Sub-agents' },
  { kata: ['tool', 'alat'], seksi: 'tools', label: 'Tools' },
  { kata: ['rule', 'aturan chat'], seksi: 'rules', label: 'Rules' },
  { kata: ['model'], seksi: 'models', label: 'Models' },
  { kata: ['appearance', 'tampilan'], seksi: 'appearance', label: 'Appearance' },
  { kata: ['session', 'sesi'], seksi: 'session', label: 'Session' },
  { kata: ['advanced', 'lanjutan'], seksi: 'advanced', label: 'Advanced' },
  { kata: ['agent', 'agen'], seksi: 'agent', label: 'Agent' },
];

async function bukaChatSettings(niat: string): Promise<string> {
  const pilih = pilihTerbaik(niat, SEKSI_CHAT);
  const seksi = pilih?.seksi ?? 'mode';
  const label = pilih?.label ?? 'Mode';
  const m = await import('../bukaPanel');
  m.bukaPanel('chat-settings', seksi);
  return `Sudah saya buka jendela Chat Settings, bagian ${label}. Bagian lain: Mode, Agent, Context, Sub-agents, Tools, Rules, Models, Appearance, Session, Advanced.`;
}

/**
 * What the tool tells the model after opening each surface.
 *
 * Every surface here has an INNER layer the tool cannot click (a tile inside a
 * panel, a row inside a pop-up). Without this sentence the model answers "it is
 * open" and the reader then has to hunt inside a window they were told was
 * already the answer - the same homework the tool exists to remove. Silence is
 * the bug; one honest line fixes it.
 */
const CATATAN_PERMUKAAN: Record<string, string> = {
  'agent-custom':
    'Yang terbuka adalah PANEL-nya, dan tab di dalamnya sudah saya pilih sesuai niat. Tab yang ada: Overview, Agents, Skills, Rules & Memories, Hooks, Plugins, MCP, Browser, Conversations, Permissions, Tools, Migrations - kalau yang dimaksud lain, sebut tabnya; isi tab tidak bisa saya isi untuk pembaca.',
  'picker-model':
    'Yang terbuka adalah DAFTAR pilihannya. Memilih model adalah keputusan pembaca (dan berubah saat dia mengetik) - jangan mengklaim sudah mengganti modelnya.',
  'chat-settings':
    'Yang terbuka adalah JENDELA Chat Settings dan bagian di dalamnya sudah saya pilih sesuai niat. Bagian yang ada: Mode, Agent, Context, Sub-agents, Tools, Rules, Models, Appearance, Session, Advanced - isinya milik pembaca, jangan mengklaim sudah mengubah setelannya.',
  'agent-todo':
    'Yang saya buka adalah panel Agent Customizations, tab Conversations, tempat saklar To-Do List. Mengaktifkannya (saklar IDE untuk panel chat di jendela utama, Agent untuk jendela Agents) adalah keputusan pembaca. Kalau yang dia cari kartu tugas yang tampil saat agen bekerja, itu dibuka dari menu … di header chat → "Show task list" (default tersembunyi) - setelan saklar di atas hanya mengizinkan agen memakainya.',
  'agent-mcp':
    'Yang terbuka adalah tab MCP di panel Agent Customizations. Isi server, port dan token milik pembaca - jangan mengklaim sudah mengubahnya.',
  explorer: 'Yang terbuka adalah bilah Explorer di kiri; berkas yang dia cari tetap dia yang membuka.',
};

/** Normalise: lowercase, collapse whitespace. Indonesian and English mixed. */
const rapikan = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Pick the entry whose matched trigger is the LONGEST.
 *
 * The tables used to rely on `find()` - first match wins - which made their
 * order load-bearing and produced exactly the bug this function removes: the
 * `agents` entry owned the word "agent", sat first, and swallowed every
 * complaint that merely mentioned it. Longest match is order-independent: a
 * narrow trigger ("agent") can only win when nothing more specific matched.
 */
function pilihTerbaik<T extends { kata: string[] }>(niat: string, daftar: T[]): T | undefined {
  const n = rapikan(niat);
  let best: T | undefined;
  let bestLen = 0;
  for (const d of daftar) {
    for (const k of d.kata) {
      if (k.length > bestLen && n.includes(k)) {
        best = d;
        bestLen = k.length;
      }
    }
  }
  return best;
}

export const tunjukTool: AgentTool = {
  spec: {
    name: 'tunjuk',
    description:
      'Buka halaman, panel, MENU, atau jendela yang pembaca MAKSUD, dari keluhan berbahasa bebas. Pakai ini ketika pembaca bertanya "di mana X", "cara X gimana", atau jelas tidak tahu letaknya - bukan ketika mereka sudah menyebut nama setelannya. ' +
      'Ini MENCARI lalu MEMBUKA, bukan menjelaskan: hasilnya yang benar-benar terbuka, dan jawabannya menyebut apa yang baru saja dibuka. ' +
      'Cakupannya: semua bagian Settings, panel bawah (terminal/problems/output/debug/ports/subagents), DAFTAR PILIHAN MODEL di header chat, jendela Chat Settings, panel Agent Customizations beserta tabnya, pop-up AI Models, palet perintah, dan bilah Explorer. ' +
      'niat = kalimat pembaca apa adanya (mis. "biar AI nggak boros token", "gimana ganti modelnya", "setelan chat di mana"). ' +
      'Untuk Agent Customizations, sebut juga tab yang dimaksud dalam niat ("aturan agen" → Rules & Memories, "hooks agen", "skill agen") supaya tab itu langsung terpilih; untuk Chat Settings sebut bagiannya ("aturan chat", "sub-agent", "konteks"). ' +
      'buka=false kalau hanya ingin tahu lokasinya tanpa memindahkan layar pembaca. ' +
      'Kalau tidak ada yang cocok, tool ini bilang tidak ketemu dan menyebut yang tersedia - JANGAN mengarang nama halaman.',
    parameters: {
      type: 'object',
      properties: {
        niat: {
          type: 'string',
          description: 'Keluhan atau pertanyaan pembaca, apa adanya, dalam bahasa mereka.',
        },
        buka: {
          type: 'boolean',
          description: 'default true. false = hanya sebutkan lokasinya, jangan buka apa pun.',
        },
      },
      required: ['niat'],
    },
  },
  run: async (a) => {
    const niat = String(a.niat ?? '').trim();
    if (!niat) {
      throw new Error('ERROR: tunjuk butuh "niat" - kalimat pembaca apa adanya.');
    }
    const buka = a.buka !== false;

    /* 1. A surface that is neither Settings nor a panel: the model picker, Chat
          Settings, the palette, the Explorer. Checked first because the words
          overlap - "where do I pick the model" also matches the Settings table's
          `models` entry, and the pop-up is the wrong screen for it. */
    const permukaan = pilihTerbaik(niat, NIAT_PERMUKAAN);
    /* 2. A Settings section the complaint is really about. */
    const seksi = pilihTerbaik(niat, NIAT_SETELAN);
    /* 3. A panel, when the complaint is about a surface rather than a setting. */
    const panel = pilihTerbaik(niat, NIAT_PANEL);

    if (permukaan) {
      if (!buka) {
        return `Ada di ${permukaan.apa}. (Tidak saya buka, karena buka=false.)`;
      }
      try {
        const hasil = await permukaan.buka();
        return (
          (typeof hasil === 'string' ? hasil : `Sudah saya buka ${permukaan.apa}.`) +
          `\nPemicunya: "${niat}".\n${CATATAN_PERMUKAAN[permukaan.id] ?? ''}`
        );
      } catch (e) {
        return (
          `Gagal membuka ${permukaan.apa}: ${(e as Error)?.message ?? e}. ` +
          `Sebutkan lokasinya ke pembaca alih-alih mencoba lagi.`
        );
      }
    }

    /*
     * A panel wins only when no Settings section matched. "Terminal" appears in
     * both worlds, but a reader asking about the terminal almost always means
     * the panel, while a reader asking about themes means the setting - and the
     * section list is more specific about intent, so it is checked first.
     */
    if (seksi) {
      /*
       * `models` is NOT a Settings section - it is a stand-alone popup
       * (`AiModelsModal`), and "where do I put my API key" is one of the most
       * common questions whose answer is not in Settings at all. It gets its own
       * branch rather than a fake section id.
       */
      if (seksi.seksi === 'models') {
        if (!buka) {
          return `Ada di pop-up AI Models - ${seksi.apa}. Buka dari tombol model di panel chat, atau perintah palet "AI: Configure Models & API Keys". (Tidak saya buka, karena buka=false.)`;
        }
        /*
         * The pop-up, NOT the Settings page. `models` has no row in the Settings
         * nav any more (see the core block in `zephyrFakta.ts`): the key, base URL
         * and model list all live in `AiModelsModal`, and sending the reader to a
         * Settings page for them is the exact mistake the core block forbids.
         */
        await import('../aiModelsStore').then((m) => m.useAiModels.getState().buka());
        return (
          `Sudah saya buka pop-up AI Models - ${seksi.apa}.\n` +
          `Pemicunya: "${niat}".\n` +
          'Isi kunci API, base URL dan daftar model adalah milik pembaca - JANGAN mengetik atau menebak kuncinya untuk dia.'
        );
      }
      const sah = daftarSetelan();
      if (!sah.includes(seksi.seksi as never)) {
        /* The table and the real section list disagree: say so instead of
           opening something that does not exist. */
        return `Tidak bisa membuka bagian "${seksi.seksi}": bagian itu tidak ada di build ini. Yang tersedia: ${sah.join(', ')}.`;
      }
      if (!buka) {
        return `Ada di Settings > ${seksi.seksi} - ${seksi.apa}. (Tidak saya buka, karena buka=false.)`;
      }
      const hasil = await bukaSetelan(seksi.seksi);
      return (
        `Sudah saya buka Settings > ${seksi.seksi} - ${seksi.apa}.\n` +
        `Pemicunya: "${niat}".\n` +
        `${hasil}`
      );
    }

    if (panel) {
      const sah = daftarPanel();
      if (!sah.includes(panel.panel as never)) {
        return `Tidak bisa membuka panel "${panel.panel}": panel itu tidak ada di build ini. Yang tersedia: ${sah.join(', ')}.`;
      }
      if (!buka) {
        return `Ada di ${panel.apa} (bawah, Ctrl+\`). (Tidak saya buka, karena buka=false.)`;
      }
      const hasil = await bukaPanel(panel.panel);
      return `Sudah saya buka ${panel.apa}.\nPemicunya: "${niat}".\n${hasil}`;
    }

    /*
     * 3. Nothing matched. Search the fact index so the answer can still be
     *    useful, and say plainly that no page was opened.
     *
     *    This is the branch that must never invent a section: opening the wrong
     *    page costs the reader more than an honest "not found", because they
     *    then have to notice the page is wrong as well.
     */
    let petunjuk = '';
    try {
      const temuan = cariFakta(niat, { batas: 5 });
      if (temuan.length > 0) {
        petunjuk =
          '\nYang mirip di indeks fakta Zephyr:\n' +
          temuan
            .map((t) => `- ${t.kategori}: ${t.kunci} - ${String(t.teks ?? '').slice(0, 120)}`)
            .join('\n');
      }
    } catch {
      /* A missing index must not turn "not found" into a crash. */
    }
    return (
      `Tidak ada halaman yang cocok dengan "${niat}", jadi tidak ada yang saya buka.\n` +
      `Bagian Settings yang ada: ${daftarSetelan().join(', ')}.\n` +
      `Panel yang ada: ${daftarPanel().join(', ')}.` +
      petunjuk +
      '\nSebutkan terus terang bahwa halamannya tidak ketemu; jangan mengarang nama setelan.'
    );
  },
};
