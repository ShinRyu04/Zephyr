/*
 * Katalog MCP server - daftar server populer yang bisa DILIHAT user dan
 * dipasang, seperti kategori "MCP Servers" di panel Extensions Zed.
 *
 * Isinya DATA DEKLARATIF saja: nama, deskripsi, publisher, kategori, dan
 * transport (url untuk http, command+args untuk stdio). Tidak ada satu pun
 * implementasi transport di sini - http sudah hidup di `mcp_client.rs`, dan
 * stdio sedang dikerjakan di `mcp_stdio.rs` oleh jalur lain. Berkas ini hanya
 * menjawab pertanyaan "server apa saja yang ada di ekosistem, dan bagaimana
 * cara menjalankannya".
 *
 * Semua angka unduhan adalah unduhan MINGGUAN npm sungguhan, dibaca dari
 * `https://api.npmjs.org/downloads/point/last-week/<paket>`. Angka itu tidak
 * dikarang: satu entri tanpa angka berarti server itu memang tidak
 * didistribusikan lewat npm (mis. server http yang di-host sendiri).
 *
 * Catatan jujur ikut dibawa di `catatan` kalau sebuah server punya syarat yang
 * tidak terlihat dari namanya: paket yang sudah diarsipkan, kunci API yang
 * wajib, atau ekstensi Chrome yang harus dipasang lebih dulu. Kartu yang
 * menyembunyikan syarat itu akan terbaca "rusak" saat dipasang dan gagal.
 */

export type McpTransport = 'stdio' | 'http';

interface DasarMcp {
  /** Id stabil; dipakai apa adanya saat server disimpan. */
  id: string;
  nama: string;
  deskripsi: string;
  publisher: string;
  /** Kategori rak, dipakai untuk filter di panel. */
  kategori: string;
  /** Unduhan npm mingguan, kalau server didistribusikan lewat npm. */
  unduhan?: number;
  /** Butuh token/API key di kolom token sebelum berguna. */
  butuhToken?: boolean;
  /** Halaman rumah / dokumentasi. */
  rumah?: string;
  /** Syarat atau keadaan yang harus pembaca tahu sebelum memasang. */
  catatan?: string;
}

/** Server yang dijalankan Zephyr sendiri lewat stdin/stdout. */
export interface McpStdio extends DasarMcp {
  transport: 'stdio';
  command: string;
  args: string[];
  /** Variabel lingkungan yang wajib ada supaya server ini berguna. */
  env?: string[];
}

/** Server yang sudah hidup di suatu URL dan dihubungi lewat http. */
export interface McpHttp extends DasarMcp {
  transport: 'http';
  url: string;
}

export type KatalogMcpEntry = McpStdio | McpHttp;

/**
 * Apakah jalur SIMPAN untuk server stdio sudah tersambung di sisi TypeScript?
 *
 * SUDAH. Jalur stdio tersambung ujung ke ujung: `McpServer` (Rust) membawa
 * `command`/`args`/`cwd`, `mcp_client_save` meneruskannya, tipe TS +
 * `mcpClientSave` + `mcpStore.saveServer` juga, dan transportnya sendiri hidup
 * di `src-tauri/src/mcp_stdio.rs` (JSON-RPC baris-per-pesan di atas
 * stdin/stdout). Entri stdio karena itu boleh benar-benar dipasang, bukan
 * cuma ditampilkan.
 *
 * Kalau salah satu mata rantai itu dicabut lagi, ubah nilai ini kembali ke
 * `false` - kartu yang menjanjikan "bisa dipasang" untuk server yang tidak akan
 * jalan lebih buruk daripada kartu yang bilang belum.
 */
export const TRANSPORT_STDIO_TERSAMBUNG = true;

export const KATALOG_MCP_SERVER: KatalogMcpEntry[] = [
  {
    id: 'context7',
    nama: 'Context7 MCP Server',
    deskripsi:
      'Dokumentasi pustaka versi terbaru langsung di dalam prompt: resolusi id pustaka, lalu kutipan API-nya.',
    transport: 'http',
    url: 'https://mcp.context7.com/mcp',
    publisher: 'Upstash',
    kategori: 'Documentation',
    unduhan: 1212373,
    butuhToken: true,
    rumah: 'https://github.com/upstash/context7',
    catatan:
      'Tanpa API key tetap bisa dipakai dengan batas laju lebih rendah; token pribadi menaikkannya.',
  },
  {
    id: 'github',
    nama: 'GitHub MCP Server',
    deskripsi:
      'Repo, issue, pull request, dan pencarian kode GitHub - server resmi GitHub yang di-host.',
    transport: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    publisher: 'GitHub',
    kategori: 'Developer Tools',
    butuhToken: true,
    rumah: 'https://github.com/github/github-mcp-server',
    catatan:
      'Butuh autentikasi. Di klien lain lewat OAuth; di sini token personal (PAT) ditempel di kolom token.',
  },
  {
    id: 'deepwiki',
    nama: 'DeepWiki MCP Server',
    deskripsi:
      'Tanya jawab tentang sebuah repo GitHub: struktur wiki, isi dokumentasi, dan tanya bebas.',
    transport: 'http',
    url: 'https://mcp.deepwiki.com/mcp',
    publisher: 'Cognition',
    kategori: 'Documentation',
    rumah: 'https://mcp.deepwiki.com/',
    catatan: 'Hanya repo publik, dan tidak butuh akun maupun token.',
  },
  {
    id: 'sequential-thinking',
    nama: 'Sequential Thinking MCP Server',
    deskripsi:
      'Memecah masalah jadi langkah berpikir yang bisa direvisi dan dicabang, bukan satu lompatan.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    publisher: 'Model Context Protocol',
    kategori: 'Reasoning',
    unduhan: 206575,
    rumah: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
  },
  {
    id: 'brave-search',
    nama: 'Brave Search MCP Server',
    deskripsi:
      'Pencarian web, berita, gambar, dan video lewat Brave Search API, termasuk konteks siap-LLM.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@brave/brave-search-mcp-server'],
    env: ['BRAVE_API_KEY'],
    publisher: 'Brave',
    kategori: 'Search',
    unduhan: 21507,
    butuhToken: true,
    rumah: 'https://github.com/brave/brave-search-mcp-server',
    catatan: 'Wajib BRAVE_API_KEY; tanpa itu server menyala tetapi tidak menjawab pencarian.',
  },
  {
    id: 'postgres',
    nama: 'PostgreSQL MCP Server',
    deskripsi:
      'Akses baca-saja ke PostgreSQL: periksa skema, daftar tabel, dan jalankan kueri analisis.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/nama_db'],
    publisher: 'Model Context Protocol',
    kategori: 'Database',
    unduhan: 127894,
    rumah: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres',
    catatan:
      'Argumen terakhir adalah string koneksi - ganti sebelum dipakai. Paket ini sudah diarsipkan di npm, tetapi masih berfungsi dan masih banyak dipakai.',
  },
  {
    id: 'filesystem',
    nama: 'Filesystem MCP Server',
    deskripsi:
      'Operasi berkas dengan batas akses yang bisa diatur: baca, tulis, cari, dan telusuri folder.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '<direktori-yang-diizinkan>'],
    publisher: 'Model Context Protocol',
    kategori: 'Filesystem',
    unduhan: 584188,
    rumah: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    catatan:
      'Argumen terakhir adalah direktori yang diizinkan; tanpa itu server menolak menyala.',
  },
  {
    id: 'memory',
    nama: 'Memory MCP Server',
    deskripsi:
      'Memori lintas sesi berbentuk graf pengetahuan: simpan entitas, relasi, dan catatan yang bertahan.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    publisher: 'Model Context Protocol',
    kategori: 'Memory',
    unduhan: 207413,
    rumah: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  },
  {
    id: 'puppeteer',
    nama: 'Puppeteer MCP Server',
    deskripsi:
      'Otomasi browser lewat Chrome DevTools Protocol: navigasi, screenshot, dan evaluasi JavaScript.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    publisher: 'Model Context Protocol',
    kategori: 'Browser',
    unduhan: 24297,
    rumah: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/puppeteer',
    catatan: 'Paket ini sudah diarsipkan di npm; masih berfungsi, tetapi tidak lagi diperbarui.',
  },
  {
    id: 'browser-tools',
    nama: 'BrowserTools MCP Server',
    deskripsi:
      'Console, lalu lintas jaringan, screenshot, dan audit Lighthouse dari sesi Chrome asli yang sedang login.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@agentdeskai/browser-tools-mcp@latest'],
    publisher: 'AgentDesk',
    kategori: 'Browser',
    unduhan: 3108,
    rumah: 'https://github.com/AgentDeskAI/browser-tools-mcp',
    catatan:
      'Butuh Node 22.19+ dan ekstensi Chrome BrowserToolsMCP yang harus dipasang manual lebih dulu.',
  },
];

/** Kategori rak yang benar-benar ada di katalog, terurut. */
export const kategoriMcp = (): string[] =>
  Array.from(new Set(KATALOG_MCP_SERVER.map((e) => e.kategori))).sort();

export const mcpById = (id: string): KatalogMcpEntry | null =>
  KATALOG_MCP_SERVER.find((e) => e.id === id) ?? null;

/**
 * Satu baris yang menunjukkan bagaimana server ini dijalankan - URL untuk http,
 * baris perintah untuk stdio. Dipakai kartu supaya pembaca bisa menilai sendiri
 * apa yang akan dijalankan, bukan hanya mempercayai label "Install".
 */
export const barisJalan = (e: KatalogMcpEntry): string =>
  e.transport === 'http' ? e.url : [e.command, ...e.args].join(' ');

/**
 * Saring katalog dengan teks bebas dan/atau kategori.
 *
 * Pencocokan mencakup id, nama, publisher, deskripsi, kategori, DAN baris
 * jalannya: mencari "npx" atau "postgresql" harus menemukan server yang
 * perintahnya memuat kata itu, karena begitulah orang mencari server yang
 * sudah ia kenal.
 */
export const cariMcp = (q: string, kategori?: string): KatalogMcpEntry[] => {
  const s = q.trim().toLowerCase();
  return KATALOG_MCP_SERVER.filter((e) => {
    if (kategori && e.kategori !== kategori) return false;
    if (!s) return true;
    return (
      e.id.toLowerCase().includes(s) ||
      e.nama.toLowerCase().includes(s) ||
      e.publisher.toLowerCase().includes(s) ||
      e.deskripsi.toLowerCase().includes(s) ||
      e.kategori.toLowerCase().includes(s) ||
      barisJalan(e).toLowerCase().includes(s)
    );
  });
};

/**
 * Apakah entri ini bisa dipasang dari panel SEKARANG.
 *
 * Entri http bisa: `useMcp.saveServer` sudah menyimpan url. Entri stdio tidak,
 * sampai `TRANSPORT_STDIO_TERSAMBUNG` menjadi true - lihat catatan panjang di
 * atas konstanta itu. Fungsi ini ada supaya keputusan "bisa/tidak" hanya hidup
 * di satu tempat, bukan tersebar sebagai `transport === 'http'` di dalam JSX.
 */
export const bisaDipasang = (e: KatalogMcpEntry): boolean =>
  e.transport === 'http' || TRANSPORT_STDIO_TERSAMBUNG;
