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
 * Order matters: the first section with a matching trigger wins, so the more
 * specific entries come first.
 */
const NIAT_SETELAN: { seksi: string; kata: string[]; apa: string }[] = [
  {
    seksi: 'agents',
    kata: [
      'boros token', 'hemat token', 'konteks', 'context', 'permission tool', 'izin tool',
      'agent', 'subagent', 'custom instruction', 'instruksi tetap', 'max step', 'batas langkah',
      'persona', 'system prompt',
    ],
    apa: 'cara agen bekerja: instruksi tetap, izin tool, batas langkah, dan anggaran konteks',
  },
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
    seksi: 'mcp',
    kata: ['mcp', 'tools luar', 'tools eksternal', 'server eksternal', 'port 9222'],
    apa: 'server MCP: port, token, dan server luar yang terpasang',
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

/** Normalise: lowercase, collapse whitespace. Indonesian and English mixed. */
const rapikan = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function cocok(niat: string, kata: string[]): boolean {
  const n = rapikan(niat);
  return kata.some((k) => n.includes(k));
}

export const tunjukTool: AgentTool = {
  spec: {
    name: 'tunjuk',
    description:
      'Buka halaman atau panel yang pembaca MAKSUD, dari keluhan berbahasa bebas. Pakai ini ketika pembaca bertanya "di mana X", "cara X gimana", atau jelas tidak tahu letaknya - bukan ketika mereka sudah menyebut nama setelannya. ' +
      'Ini MENCARI lalu MEMBUKA, bukan menjelaskan: hasilnya halaman yang benar-benar terbuka, dan jawabannya menyebut apa yang baru saja dibuka. ' +
      'niat = kalimat pembaca apa adanya (mis. "biar AI nggak boros token"). ' +
      'buka=false kalau hanya ingin tahu lokasinya tanpa memindahkan layar pembaca. ' +
      'Kalau tidak ada yang cocok, tool ini bilang tidak ketemu dan menyebut yang tersedia - JANGAN mengarang seksi.',
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

    /* 1. A Settings section the complaint is really about. */
    const seksi = NIAT_SETELAN.find((s) => cocok(niat, s.kata));
    /* 2. A panel, when the complaint is about a surface rather than a setting. */
    const panel = NIAT_PANEL.find((p) => cocok(niat, p.kata));

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
          return `Ada di pop-up AI Models - ${seksi.apa}. Buka dari tombol model di panel chat, atau Settings > AI Models. (Tidak saya buka, karena buka=false.)`;
        }
        /*
         * The same three calls `commandRegistry.openSettingsSection` makes; it is
         * module-private, so they are repeated here rather than exported just for
         * this tool. Keeping them identical matters: a reader who reaches the
         * page from the palette and from `tunjuk` must land on the same screen.
         */
        const { useStore } = await import('../store');
        const { useSettingsUi } = await import('../settingsStore');
        const s = useStore.getState();
        s.setActivity('settings');
        s.setSettingsOpen(true);
        useSettingsUi.getState().setSection('models' as never);
        if (!s.sidebarVisible) s.toggleSidebar();
        return `Sudah saya buka AI Models - ${seksi.apa}.\nPemicunya: "${niat}".`;
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
