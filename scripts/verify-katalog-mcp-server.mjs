/*
 * verify-katalog-mcp-server.mjs - kunci katalog SERVER MCP pada bentuknya.
 *
 *   node scripts/verify-katalog-mcp-server.mjs
 *
 * Berkas ini MEMBACA katalog sungguhan (`src/lib/katalogMcpServer.ts`) lewat
 * esbuild, bukan menyalin daftar nama ke dalam uji. Uji yang menyalin daftar
 * akan tetap hijau walaupun katalognya berubah - ia mengunci kesalahan, bukan
 * mencegahnya. Karena itu setiap pemeriksaan di bawah membaca entri asli.
 *
 * Yang dikunci di sini adalah KONTRAK DATA, bukan angkanya:
 *
 *   1. tiap entri punya field wajib yang tidak kosong;
 *   2. transport cocok dengan field-nya (http punya url, stdio punya command+args);
 *   3. id unik, dan enam server yang diminta produk benar-benar ada;
 *   4. cariMcp / kategoriMcp / mcpById / barisJalan berperilaku seperti yang
 *      dipakai panel;
 *   5. bisaDipasang konsisten dengan TRANSPORT_STDIO_TERSAMBUNG - dan selama
 *      flag itu false, TIDAK ADA entri stdio yang boleh lolos ke jalur simpan;
 *   6. wiring di view/store tidak setengah jalan: tab 'mcp' benar-benar
 *      terdaftar, dan view benar-benar memakai saveServer yang sudah ada.
 *
 * Nama/jumlah server tidak dipatok, karena menambah satu server baru adalah
 * keadaan yang BENAR - dan uji yang menolaknya akan dihapus orang pertama yang
 * menambah server.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');

let lulus = 0;
let gagal = 0;
function periksa(nama, syarat, rincian) {
  if (syarat) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    console.log('  GAGAL  ' + nama + (rincian !== undefined ? '  -> ' + JSON.stringify(rincian) : ''));
  }
}

/* ------------------------------------------------------------------ */
/* Muat katalog dengan esbuild (berkasnya murni data, tanpa impor).     */
/* ------------------------------------------------------------------ */

const { buildSync } = await import('esbuild');
const sementara = join(AKAR, 'node_modules', '.cache', 'verify-katalog-mcp-server.mjs');
await (await import('node:fs/promises')).mkdir(dirname(sementara), { recursive: true });

buildSync({
  entryPoints: [join(AKAR, 'src', 'lib', 'katalogMcpServer.ts')],
  outfile: sementara,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  define: {
    'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'production' }),
  },
});

let K;
try {
  K = await import(pathToFileURL(sementara).href);
} catch (e) {
  console.error('FATAL: katalog MCP tidak bisa dimuat. Pesan:');
  console.error(String(e.stack || e.message).slice(0, 1200));
  process.exit(1);
}

const {
  KATALOG_MCP_SERVER: entri,
  TRANSPORT_STDIO_TERSAMBUNG: stdioNyala,
  barisJalan,
  bisaDipasang,
  cariMcp,
  kategoriMcp,
  mcpById,
} = K;

/* Penegate: katalog kosong akan membuat hampir semua pemeriksaan lulus tanpa
   bukti. Berhenti di sini alih-alih melaporkan hijau yang palsu. */
if (!Array.isArray(entri) || entri.length === 0) {
  console.error('FATAL: KATALOG_MCP_SERVER kosong atau bukan array.');
  console.error('Nol entri membuat pemeriksaan di bawah lulus palsu; berhenti di sini.');
  process.exit(1);
}

console.log(`\n== 0. Katalog terbaca (${entri.length} entri, stdioNyala=${stdioNyala}) ==`);
periksa('katalog berisi 6-10 entri (permintaan produk)', entri.length >= 6 && entri.length <= 10, {
  dapat: entri.length,
});

/* ------------------------------------------------------------------ */
/* 1. Field wajib                                                      */
/* ------------------------------------------------------------------ */

console.log('\n== 1. Field wajib tiap entri ==');
{
  const kosong = (v) => typeof v !== 'string' || v.trim() === '';
  const masalah = [];
  for (const e of entri) {
    for (const f of ['id', 'nama', 'deskripsi', 'publisher', 'kategori']) {
      if (kosong(e[f])) masalah.push(`${e.id ?? '(tanpa id)'}: ${f} kosong`);
    }
    if (e.transport !== 'http' && e.transport !== 'stdio') {
      masalah.push(`${e.id ?? '(tanpa id)'}: transport '${e.transport}' tidak dikenal`);
    }
  }
  periksa('semua entri punya id/nama/deskripsi/publisher/kategori + transport sah', masalah.length === 0, {
    masalah,
  });

  const idGanda = entri.map((e) => e.id).filter((id, i, a) => a.indexOf(id) !== i);
  periksa('tidak ada id ganda', idGanda.length === 0, { idGanda });

  const deskripsiPanjang = entri.filter((e) => e.deskripsi.length > 160).map((e) => e.id);
  periksa('deskripsi tetap singkat (<=160 char)', deskripsiPanjang.length === 0, { deskripsiPanjang });
}

/* ------------------------------------------------------------------ */
/* 2. Transport cocok dengan field-nya                                 */
/* ------------------------------------------------------------------ */

console.log('\n== 2. Transport cocok dengan field ==');
{
  const http = entri.filter((e) => e.transport === 'http');
  const stdio = entri.filter((e) => e.transport === 'stdio');

  periksa('ada entri http', http.length > 0, { jumlah: http.length });
  periksa('ada entri stdio', stdio.length > 0, { jumlah: stdio.length });

  const httpRusak = http.filter((e) => typeof e.url !== 'string' || !e.url.startsWith('https://'));
  periksa('setiap entri http punya url https', httpRusak.length === 0, {
    rusak: httpRusak.map((e) => e.id),
  });

  const stdioRusak = stdio.filter(
    (e) => typeof e.command !== 'string' || e.command.trim() === '' || !Array.isArray(e.args) || e.args.length === 0,
  );
  periksa('setiap entri stdio punya command + args tidak kosong', stdioRusak.length === 0, {
    rusak: stdioRusak.map((e) => e.id),
  });

  const bocor = entri.filter(
    (e) => (e.transport === 'http' && e.command !== undefined) || (e.transport === 'stdio' && e.url !== undefined),
  );
  periksa('tidak ada entri yang memakai dua transport sekaligus', bocor.length === 0, {
    bocor: bocor.map((e) => e.id),
  });

  const unduhanRusak = entri.filter(
    (e) => e.unduhan !== undefined && (!Number.isInteger(e.unduhan) || e.unduhan <= 0),
  );
  periksa('unduhan (kalau ada) bilangan bulat positif', unduhanRusak.length === 0, {
    rusak: unduhanRusak.map((e) => e.id),
  });
}

/* ------------------------------------------------------------------ */
/* 3. Enam server yang diminta produk benar-benar ada                  */
/* ------------------------------------------------------------------ */

console.log('\n== 3. Server yang diminta produk ada ==');
{
  /* Id, dan kata yang harus muncul di nama supaya entri yang salah nama
     (mis. "Postgres" yang sebenarnya MySQL) tidak lolos. */
  const WAJIB = [
    ['context7', 'Context7'],
    ['github', 'GitHub'],
    ['sequential-thinking', 'Sequential Thinking'],
    ['brave-search', 'Brave Search'],
    ['postgres', 'PostgreSQL'],
    ['browser-tools', 'BrowserTools'],
  ];
  const kurang = [];
  for (const [id, kata] of WAJIB) {
    const e = mcpById(id);
    if (!e) kurang.push(`${id}: tidak ada`);
    else if (!e.nama.toLowerCase().includes(kata.toLowerCase())) kurang.push(`${id}: nama '${e.nama}'`);
  }
  periksa('Context7, GitHub, Sequential Thinking, Brave Search, Postgres, BrowserTools ada', kurang.length === 0, {
    kurang,
  });
}

/* ------------------------------------------------------------------ */
/* 4. Fungsi cari/filter                                               */
/* ------------------------------------------------------------------ */

console.log('\n== 4. cariMcp / kategoriMcp / mcpById / barisJalan ==');
{
  const semua = cariMcp('');
  periksa('cariMcp("") mengembalikan seluruh katalog', semua.length === entri.length, {
    dapat: semua.length,
    harap: entri.length,
  });

  const postgres = cariMcp('postgres');
  periksa('cariMcp("postgres") menemukan entri postgres', postgres.some((e) => e.id === 'postgres'), {
    dapat: postgres.map((e) => e.id),
  });

  /* Pencarian harus menyentuh baris jalan: orang mencari server yang sudah ia
     kenal lewat perintahnya ("npx", nama paket), bukan hanya lewat namanya. */
  const lewatPaket = cariMcp('@brave/brave-search-mcp-server');
  periksa('cariMcp menemukan entri lewat nama paket di baris jalan', lewatPaket.some((e) => e.id === 'brave-search'), {
    dapat: lewatPaket.map((e) => e.id),
  });

  const lewatNpx = cariMcp('npx');
  periksa('cariMcp("npx") hanya mengembalikan entri stdio', lewatNpx.length > 0 && lewatNpx.every((e) => e.transport === 'stdio'), {
    dapat: lewatNpx.map((e) => `${e.id}:${e.transport}`),
  });

  const kategoriSemua = kategoriMcp();
  periksa('kategoriMcp() = himpunan kategori unik, terurut', 
    JSON.stringify(kategoriSemua) === JSON.stringify([...new Set(entri.map((e) => e.kategori))].sort()),
    { kategoriSemua });

  const katPertama = kategoriSemua[0];
  const satuKat = cariMcp('', katPertama);
  periksa(`cariMcp('', '${katPertama}') hanya kategori itu`, satuKat.length > 0 && satuKat.every((e) => e.kategori === katPertama), {
    dapat: satuKat.map((e) => `${e.id}:${e.kategori}`),
  });

  const qKat = cariMcp('postgres', 'Browser');
  periksa('filter kategori dan teks digabung dengan DAN', qKat.length === 0, {
    dapat: qKat.map((e) => e.id),
  });

  const takAda = cariMcp('zzz-tidak-ada-zzz');
  periksa('cariMcp tanpa hasil mengembalikan array kosong', Array.isArray(takAda) && takAda.length === 0);

  periksa('mcpById(id tak dikenal) = null', mcpById('zzz-tidak-ada') === null);
  periksa('mcpById(id dikenal) mengembalikan entri', mcpById('context7')?.id === 'context7');

  const barisHttp = entri.filter((e) => e.transport === 'http').map(barisJalan);
  const barisStdio = entri.filter((e) => e.transport === 'stdio').map(barisJalan);
  periksa('barisJalan(http) = url', barisHttp.every((b) => b.startsWith('https://')), { barisHttp });
  periksa('barisJalan(stdio) = command + args', barisStdio.every((b) => b.startsWith('npx ')), { barisStdio });
  periksa('tidak ada barisJalan kosong', [...barisHttp, ...barisStdio].every((b) => b.trim().length > 0));
}

/* ------------------------------------------------------------------ */
/* 5. bisaDipasang konsisten dengan flag transport                     */
/* ------------------------------------------------------------------ */

console.log('\n== 5. bisaDipasang vs TRANSPORT_STDIO_TERSAMBUNG ==');
{
  const http = entri.filter((e) => e.transport === 'http');
  const stdio = entri.filter((e) => e.transport === 'stdio');

  periksa('entri http selalu bisa dipasang', http.every(bisaDipasang), {
    tidak: http.filter((e) => !bisaDipasang(e)).map((e) => e.id),
  });

  if (!stdioNyala) {
    /*
     * Yang paling penting selama transport stdio BELUM tersambung di sisi TS:
     * tidak satu pun entri stdio boleh mengaku bisa dipasang. Kalau ini gagal,
     * panel akan menawarkan tombol yang memanggil saveServer dengan field yang
     * tidak ada di kontrak - server tersimpan, tidak pernah jalan.
     */
    const lolos = stdio.filter(bisaDipasang).map((e) => e.id);
    periksa('SELAMA stdio belum tersambung: tidak ada entri stdio yang bisa dipasang', lolos.length === 0, {
      lolos,
    });
  } else {
    periksa('stdio dinyatakan tersambung: semua entri (http + stdio) bisa dipasang', entri.every(bisaDipasang), {
      tidak: entri.filter((e) => !bisaDipasang(e)).map((e) => e.id),
    });

    /*
     * Dan rantai yang membuat flag itu benar-benar harus ada di disk. Flag
     * `true` tanpa rantai ini adalah janji kosong: tombol menyala, server
     * tersimpan tanpa command, dan tidak ada yang menjalankannya.
     */
    const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8');
    const rantai = [
      ['src/lib/types.ts', /command\?: string;/, 'McpServer (TS) membawa command'],
      ['src/lib/commands.ts', /command\?: string;/, 'mcpClientSave menerima command'],
      /* saveServer memakai bentuk singkat `command,` dan `args: s.args ?? []`. */
      ['src/lib/mcpStore.ts', /^\s*command,$/m, 'saveServer meneruskan command'],
      ['src/lib/mcpStore.ts', /args: s\.args \?\? \[\]/, 'saveServer meneruskan args'],
    ];
    const putus = rantai.filter(([rel, pola]) => !pola.test(baca(rel))).map(([, , nama]) => nama);
    periksa('rantai stdio TS utuh (tipe + command + store)', putus.length === 0, { putus });
  }
}

/* ------------------------------------------------------------------ */
/* 6. Wiring view/store tidak setengah jalan                           */
/* ------------------------------------------------------------------ */

console.log('\n== 6. Wiring tab MCP di view/store ==');
{
  const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8');
  const store = baca('src/lib/extensionsStore19.ts');
  const view = baca('src/components/extensions/ExtensionsView.tsx');
  const bridge = baca('src/lib/devBridge.ts');

  periksa("ExtTab memuat 'mcp'", /export type ExtTab = [^;]*'mcp'/.test(store));
  periksa("store punya cabang untuk tab 'mcp'", /tab === 'mcp'/.test(store));
  periksa("view memakai label tab 'MCP Servers'", /mcp: 'MCP Servers'/.test(view));
  periksa('view mengimpor katalog MCP', /from '\.\.\/\.\.\/lib\/katalogMcpServer'/.test(view));
  periksa('view memakai saveServer yang sudah ada (bukan API baru)', /saveServer\s*\(/.test(view) && /useMcp/.test(view));
  periksa("devBridge setTab menerima 'mcp'", /setTab: \(t: [^)]*'mcp'/.test(bridge));

  /*
   * Penjaga keselamatan yang sebenarnya: jalur pasang di view HARUS memakai
   * `bisaDipasang` sebagai gerbang, bukan menulis `transport === 'http'`
   * langsung. Gerbang itu yang membuat flag transport, tombol, dan handler
   * tidak bisa berbeda diam-diam.
   */
  periksa(
    'view memakai bisaDipasang() sebagai gerbang jalur pasang',
    /if \(!bisaDipasang\(e\)\)\s*return/.test(view),
  );

  /*
   * Dan yang tidak boleh ada: view tidak boleh menyentuh transport Rust.
   *
   * Polanya sengaja menyasar KODE (impor / invoke), bukan setiap penyebutan:
   * versi pertama regex ini cocok dengan komentar penjelas di dalam view sendiri
   * dan melaporkan gagal untuk kode yang benar. Penjaga yang menuduh komentarnya
   * sendiri akan dimatikan orang, dan setelah itu tidak menjaga apa pun.
   */
  periksa(
    'view tidak memanggil API Rust baru (impor/invoke mcp_stdio atau mcp_client langsung)',
    !/from\s+['"][^'"]*mcp_stdio|invoke\(\s*['"](?:mcp_stdio|mcp_client)/.test(view),
  );

  /*
   * Kalau stdio TERSAMBUNG, jalur pasang harus benar-benar mengirim command+args
   * - bukan hanya punya tombol yang menyala. Tombol hidup tanpa payload stdio
   * adalah versi terburuk: user mengira sudah terpasang.
   */
  if (stdioNyala) {
    periksa(
      'view mengirim command + args untuk entri stdio',
      /command: e\.command/.test(view) && /args: e\.args/.test(view),
    );
  }
}

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
process.exit(gagal === 0 ? 0 : 1);
