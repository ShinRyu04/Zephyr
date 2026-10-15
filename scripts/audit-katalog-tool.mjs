#!/usr/bin/env node
/**
 * audit-katalog-tool.mjs - audit KATALOG TOOL Zephyr dari sumber, tanpa menjalankan app.
 *
 * Item TODO: ZEPH-AUDIT-KATALOG-TOOL (172), dengan potret celah operasi berkas (165)
 * dan baca-kode-sendiri (159).
 *
 * Sifat: READ-ONLY. Skrip ini TIDAK mengubah apa pun. Ia membaca berkas sumber
 * sebagai TEKS lalu menghitung angka dari sana. Sumber angka tetap kode; tidak
 * ada angka tool yang diketik ulang di sini (prosa di kode sudah beberapa kali
 * basi - lihat catatan di catalog.ts baris 4-12, dan contoh di builtins.ts).
 *
 * Yang dicetak (semua ANGKA):
 *   A. jumlah katalog: builtin + mcp + web = inti + total
 *   B. daftar SEMUA tool + nama/ringkasan + sumber (lampiran laporan)
 *   C. berapa tool DITAWARKAN tiap giliran per KELAS TUGAS (target <= 20)
 *   D. sinkron katalog <-> handler + izin (menulis wajib minta izin)
 *   E. DUPLIKASI kemampuan: internal vs MCP-Rust (mcp_server.rs)
 *   F. tool di-ROUTE prompt tapi TIDAK ikut dikirim (jebakan, aturan katalog:519)
 *   G. operasi BERKAS: yang ada + yang BOLONG (usul: parameter vs tool baru)
 *
 * Keluar exit 0 bila bersih, exit 1 bila ada masalah struktural ATAU langit-langit
 * per giliran melewati target (20).
 *
 * Versi sebelumnya (s/d 4 Okt) melaporkan 2 MASALAH PALSU pada `ingat`:
 *   (1) "tanpa handler" - karena ia hanya membaca builtins/web/mcp, bukan
 *       zephyrSelf.ts & zephyrIngat.ts tempat handler `ingat` tinggal;
 *   (2) "bertindak tapi tidak minta izin" - karena ia menambahkan `appWrite` ke
 *       aturan izin, sedangkan aturan katalog sendiri (catalog.ts:407) hanya
 *       mewajibkan izin untuk `fsWrite` dan `exec`. `ingat` sengaja appWrite
 *       tanpa izin (catalog.ts:95-104). Keduanya sudah dibetulkan di sini.
 *
 * Perbaikan lanjutan (celah deteksi "1 nama katalog tanpa handler: zephyr_kode"):
 * daftar berkas handler ternyata masih tangan - `zephyr_kode` tinggal di
 * `src/lib/bacaKode.ts` dan hanya didaftarkan lewat registry `AGENT_TOOLS`.
 * Sekarang daftar berkas handler DITURUNKAN dari registry itu sendiri (impor ->
 * berkas), lalu digabung dengan daftar-cadangan lama supaya cakupan audit tidak
 * pernah lebih lemah dari sebelumnya. Ada uji diri POSITIF/NEGATIF/REGRESI di
 * bagian D2 yang membuktikan detektor bisa memerah DAN tidak memerah palsu.
 *
 * Pakai: node scripts/audit-katalog-tool.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (p) => readFileSync(join(AKAR, p), 'utf8');
const adaBerkas = (p) => {
  try {
    readFileSync(join(AKAR, p));
    return true;
  } catch {
    return false;
  }
};

/** Buang komentar blok supaya entri yang diarsipkan (mis. TOOL_DIRENCANAKAN) tidak ikut terhitung. */
const tanpaBlokKomentar = (ts) => ts.replace(/\/\*[\s\S]*?\*\//g, '');

const masalah = [];
const peringatan = [];

/* ================================================================== */
/* A. Katalog                                                         */
/* ================================================================== */

const AWALAN_MCP = (baca('src/lib/zephyrTools/awalan.ts').match(/AWALAN_MCP\s*=\s*'([^']+)'/) || [, 'mcp__zephyr__'])[1];
const katalogTs = tanpaBlokKomentar(baca('src/lib/zephyrTools/catalog.ts'));

function blokArray(ts, nama) {
  const m = ts.match(new RegExp(`const\\s+${nama}\\b[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\n\\];`));
  return m ? m[1] : '';
}
function entriBlok(isi, source) {
  const re =
    /\['([a-z_][a-z0-9_]*)',\s*'([^']*)',\s*'(read|net|netWrite|appWrite|fsWrite|exec)',\s*(true|false),\s*'([\s\S]*?)'\]/g;
  const keluar = [];
  let m;
  while ((m = re.exec(isi))) {
    keluar.push({
      name: source === 'mcp' ? `${AWALAN_MCP}${m[1]}` : m[1],
      source,
      group: m[2],
      effect: m[3],
      needsApproval: m[4] === 'true',
      description: m[5].replace(/\s+/g, ' ').trim(),
    });
  }
  return keluar;
}

const BUILTIN = entriBlok(blokArray(katalogTs, 'BUILTIN'), 'builtin');
const MCP = entriBlok(blokArray(katalogTs, 'MCP'), 'mcp');
const WEB = entriBlok(blokArray(katalogTs, 'WEB'), 'web');
const KATALOG = [...BUILTIN, ...MCP, ...WEB];
const NAMA_KATALOG = new Set(KATALOG.map((t) => t.name));

const WEB_MATI = (() => {
  const m = katalogTs.match(/const\s+WEB_MATI\b[\s\S]*?=\s*\[([\s\S]*?)\];/);
  return m ? [...m[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((x) => x[1]) : [];
})();
const WEB_AKTIF_AWAL = WEB.filter((t) => !WEB_MATI.includes(t.name)).map((t) => t.name);
const TOOL_INTI = KATALOG.filter((t) => t.source !== 'web').map((t) => t.name);
const AKTIF_AWAL = [...TOOL_INTI, ...WEB_AKTIF_AWAL];

const DIKIRIM_SELALU = (() => {
  const m = katalogTs.match(/TOOL_DIKIRIM_SELALU\b[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_][a-z0-9_]*|mcp__[a-z_]+__[a-z0-9_]+)'/g)]
    .map((x) => x[1])
    .filter((n) => NAMA_KATALOG.has(n));
})();

/* ================================================================== */
/* B. Aturan subset per tugas (port dari subsetAlat.ts)               */
/* ================================================================== */

const subsetTs = baca('src/lib/subsetAlat.ts');
const daftarDari = (ts, nama) => {
  const m = ts.match(new RegExp(`const\\s+${nama}\\b[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
};
const NAMA_WEB = daftarDari(subsetTs, 'NAMA_WEB');
const AWALAN_WEB = daftarDari(subsetTs, 'AWALAN_WEB');
const ALAT_BUTUH_FOLDER = daftarDari(subsetTs, 'ALAT_BUTUH_FOLDER');
const TOOL_RENCANA_PERTAMA = daftarDari(subsetTs, 'TOOL_RENCANA_PERTAMA');

const butuhAlatWeb = (n) => NAMA_WEB.includes(n) || AWALAN_WEB.some((p) => n.startsWith(p));
const butuhFolder = (n) => ALAT_BUTUH_FOLDER.includes(n);
const TOOL_TULIS_BERKAS = KATALOG.filter((t) => t.effect === 'fsWrite').map((t) => t.name);

/** Port `alatUntukTugas` (subsetAlat.ts:181) + irisan `agentToolSpecs` (agentTools.ts:129). */
function alatTerkirim({ web, folder, baca }) {
  let hasil = web ? [...AKTIF_AWAL] : AKTIF_AWAL.filter((n) => !butuhAlatWeb(n));
  if (!folder) hasil = hasil.filter((n) => !butuhFolder(n));
  if (baca || !folder) hasil = hasil.filter((n) => !TOOL_TULIS_BERKAS.includes(n));
  if (hasil.length === 0) {
    const cad = folder ? [...AKTIF_AWAL] : AKTIF_AWAL.filter((n) => !butuhFolder(n));
    hasil = cad.length > 0 ? cad : [...AKTIF_AWAL];
  }
  /* agentToolSpecs (profil baru: aktif = TOOL_AKTIF_AWAL, tak ada pilihan user di luar bawaan). */
  return hasil.filter((n) => DIKIRIM_SELALU.includes(n));
}
const alatRencanaPertama = (folder) =>
  TOOL_RENCANA_PERTAMA.filter((n) => AKTIF_AWAL.includes(n) && (folder || !butuhFolder(n))).filter((n) =>
    DIKIRIM_SELALU.includes(n),
  );

const KELAS = [
  { nama: 'Tugas WEB (buka/baca halaman), ada folder', args: { web: true, folder: true, baca: false } },
  { nama: 'Tugas WEB, tanpa folder', args: { web: true, folder: false, baca: false } },
  { nama: 'Tulis berkas (berat) langkah >=2, tanpa web, ada folder', args: { web: false, folder: true, baca: false } },
  { nama: 'Tulis berkas, tanpa web, tanpa folder', args: { web: false, folder: false, baca: false } },
  { nama: 'Tanya/baca berkas, tanpa web, ada folder', args: { web: false, folder: true, baca: true } },
  { nama: 'Tanya/baca berkas, tanpa web, tanpa folder', args: { web: false, folder: false, baca: true } },
];
const TARGET_MAKS = 20;

/* ================================================================== */
/* C. Handler + sinkron + izin                                        */
/* ================================================================== */

/*
 * SUMBER HANDLER: dari REGISTRY, bukan daftar tangan.
 *
 * Celah yang ditambal (laporan agen induk): daftar lama hanya memuat
 * builtins/web/mcp/zephyrSelf/zephyrIngat, sehingga `zephyr_kode` — spec-nya di
 * `src/lib/bacaKode.ts`, didaftarkan ke registry lewat `TOOL_BACA_KODE` —
 * tampak "tanpa handler". Itu CELAH DETEKSI, bukan cacat produk: handler-nya
 * ada dan benar-benar jalan.
 *
 * Sekarang: baca registry `AGENT_TOOLS` (src/lib/agentTools.ts), ambil setiap
 * koleksi tool yang dirujuk/di-spread di sana, resolusi nama koleksi ke BERKAS
 * asalnya lewat pernyataan `import`, lalu pindai berkas-berkas itu. Menambah
 * tool baru cukup lewat registry — audit ikut sendiri, tidak bisa lagi
 * ketinggalan karena berkas handler-nya belum didaftarkan ke daftar tangan.
 */
const REGISTRY_AGENT_TOOLS = 'src/lib/agentTools.ts';

/** Gabung jalur relatif './x/y' (relatif ke sebuah berkas) -> jalur repo berbasis AKAR. */
function jalurRepo(dariBerkas, relatif) {
  if (!relatif.startsWith('.')) return null; /* paket node_modules, bukan sumber repo */
  const bagian = dariBerkas.split('/');
  bagian.pop();
  for (const b of relatif.split('/')) {
    if (b === '.' || b === '') continue;
    if (b === '..') bagian.pop();
    else bagian.push(b);
  }
  const dasar = bagian.join('/');
  for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts']) {
    if (adaBerkas(dasar + ext)) return dasar + ext;
  }
  return null;
}

/** Koleksi tool yang benar-benar didaftarkan `AGENT_TOOLS` -> berkas asalnya. */
function berkasHandlerDariRegistry() {
  if (!adaBerkas(REGISTRY_AGENT_TOOLS)) return [];
  const ts = baca(REGISTRY_AGENT_TOOLS);
  const impor = new Map();
  for (const m of ts.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    for (const bagian of m[1].split(',')) {
      const b = bagian.trim().replace(/^type\s+/, '');
      if (!b) continue;
      const a = b.split(/\s+as\s+/);
      impor.set(a[a.length - 1].trim(), m[2]);
    }
  }
  const m = tanpaBlokKomentar(ts).match(/const\s+AGENT_TOOLS\b[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
  if (!m) return [];
  const berkas = new Set();
  for (const id of m[1].matchAll(/([A-Z][A-Z0-9_]{2,})/g)) {
    const rel = impor.get(id[1]);
    if (!rel) continue;
    const p = jalurRepo(REGISTRY_AGENT_TOOLS, rel);
    if (p) berkas.add(p);
  }
  return [...berkas];
}

/* Cadangan: berkas yang selama ini dikenal mendaftarkan handler. SELALU digabung
   supaya audit tidak pernah lebih lemah dari sebelumnya ("tanpa mengurangi kasus
   lama"): apa pun yang dulu terjangkau, tetap terjangkau. */
const BERKAS_HANDLER_LEGACY = [
  'src/lib/zephyrTools/builtins.ts',
  'src/lib/zephyrTools/web.ts',
  'src/lib/zephyrTools/mcp.ts',
  'src/lib/zephyrTools/zephyrSelf.ts',
  'src/lib/zephyrTools/zephyrIngat.ts',
];
const BERKAS_HANDLER = [...new Set([...berkasHandlerDariRegistry(), ...BERKAS_HANDLER_LEGACY])].filter(adaBerkas);

/** Pindai nama handler (`name:`/`tool:`) dari sekumpulan berkas. */
function pindaiHandler(berkas) {
  const keluar = new Set();
  for (const p of berkas.filter(adaBerkas)) {
    for (const m of baca(p).matchAll(/(?:^\s*|\b)(?:name|tool):\s*'([a-z_][a-z0-9_]*|mcp__[a-z_]+__[a-z0-9_]+)'/gm)) {
      keluar.add(m[1]);
    }
  }
  return keluar;
}

/** Bandingkan daftar nama katalog dengan himpunan nama handler. */
function periksaSinkron(namaKatalog, handlerSet) {
  return {
    tanpaHandler: [...namaKatalog].filter((n) => !handlerSet.has(n)).sort(),
    tanpaKatalog: [...handlerSet].filter((n) => !namaKatalog.has(n)).sort(),
  };
}

const handler = pindaiHandler(BERKAS_HANDLER);
const sinkron = periksaSinkron(NAMA_KATALOG, handler);
const tanpaHandler = sinkron.tanpaHandler;
const tanpaKatalog = sinkron.tanpaKatalog;

/* ================================================================== */
/* C2. UJI DIRI DETEKSI HANDLER (kontrol POSITIF & NEGATIF)           */
/* ================================================================== */

/*
 * Membuktikan tambalan bekerja DUA arah, memakai fungsi sinkron YANG SAMA:
 *   POSITIF   : nama katalog yang SUNGGUH tanpa handler tetap dilaporkan
 *               (detektor tidak mati / tidak asal lolos).
 *   NEGATIF   : `zephyr_kode` (handler di src/lib/bacaKode.ts, di luar
 *               daftar-lama) TIDAK lagi dilaporkan; dan seluruh nama katalog
 *               nyata punya handler.
 *   REGRESI   : dengan daftar-LAMA saja, `zephyr_kode` HARUS muncul —
 *               membuktikan celah yang ditambal itu NYATA, bukan karangan.
 */
function ujiDiriHandler() {
  const kasus = [];
  const SINTETIS = 'uji_sintetis_tanpa_handler';

  /* POSITIF: nama sintetis tanpa handler harus terdeteksi. */
  {
    const h = periksaSinkron(new Set([...NAMA_KATALOG, SINTETIS]), handler);
    kasus.push({
      nama: `POSITIF: nama katalog sintetis "${SINTETIS}" tanpa handler TERDETEKSI`,
      harap: true,
      dapat: h.tanpaHandler.includes(SINTETIS),
    });
  }
  /* NEGATIF: nama nyata (zephyr_kode) tidak boleh lagi dilaporkan. */
  kasus.push({
    nama: 'NEGATIF: zephyr_kode (handler di src/lib/bacaKode.ts) TIDAK dilaporkan tanpa-handler',
    harap: false,
    dapat: sinkron.tanpaHandler.includes('zephyr_kode'),
  });
  kasus.push({
    nama: 'NEGATIF: seluruh nama katalog nyata punya handler (daftar kosong)',
    harap: false,
    dapat: sinkron.tanpaHandler.length > 0,
  });
  /* REGRESI ("sebelum"): daftar-lama saja harus tetap melaporkan zephyr_kode. */
  {
    const lalu = periksaSinkron(NAMA_KATALOG, pindaiHandler(BERKAS_HANDLER_LEGACY));
    kasus.push({
      nama: 'REGRESI: dengan daftar-lama, zephyr_kode TERLAPOR (bukti celah nyata)',
      harap: true,
      dapat: lalu.tanpaHandler.includes('zephyr_kode'),
    });
  }
  return kasus.map((k) => ({ ...k, benar: k.dapat === k.harap }));
}
const ujiHandler = ujiDiriHandler();

const hitungNama = new Map();
for (const t of KATALOG) hitungNama.set(t.name, (hitungNama.get(t.name) || 0) + 1);
const namaGanda = [...hitungNama].filter(([, c]) => c > 1).map(([n]) => n);

/* Aturan izin MIRROR aturan katalog (catalog.ts:407): fsWrite|exec wajib; web netWrite wajib.
   `appWrite` sengaja TIDAK termasuk - lihat catalog.ts:95-104 (`ingat`). */
const lupaIzin = KATALOG.filter((t) => {
  if ((t.effect === 'fsWrite' || t.effect === 'exec') && !t.needsApproval) return true;
  if (t.source === 'web' && t.effect === 'netWrite' && !t.needsApproval) return true;
  return false;
}).map((t) => t.name);

/* ================================================================== */
/* D. MCP Rust (mcp_server.rs) vs MCP JS (katalog)                    */
/* ================================================================== */

const RUST_MCP = (() => {
  if (!adaBerkas('src-tauri/src/mcp_server.rs')) return [];
  return [...new Set([...baca('src-tauri/src/mcp_server.rs').matchAll(/tool\("([a-z_]+)"/g)].map((m) => m[1]))].sort();
})();

const KANDIDAT_DOBEL = [
  ['jalankan perintah shell', 'bash_run (builtin)', 'run_command (MCP-Rust)'],
  ['jalankan perintah di terminal user', 'mcp__zephyr__sh (MCP-JS)', 'terminal_write / terminal_key (MCP-Rust)'],
  ['baca keluaran terminal', 'bash_logs (builtin) + mcp__zephyr__read{terminal} (MCP-JS)', 'get_output (MCP-Rust)'],
  ['baca masalah/diagnostik', 'lsp_diagnostics (builtin)', 'get_problems (MCP-Rust)'],
  ['buka berkas di editor', 'mcp__zephyr__open_file (MCP-JS)', 'editor_open (MCP-Rust)'],
  ['buka/tutup pane', 'mcp__zephyr__pane (MCP-JS)', 'pane_new / pane_close (MCP-Rust)'],
  ['cuplikan keadaan jendela', 'mcp__zephyr__state (MCP-JS)', 'get_window / list_panes / list_terminals / list_editors (MCP-Rust)'],
  ['baca setelan', 'mcp__zephyr__inspect (MCP-JS)', 'get_settings / get_setting (MCP-Rust)'],
  ['ubah setelan', 'mcp__zephyr__set_setting (MCP-JS)', 'set_setting (MCP-Rust)'],
  ['daftar ekstensi', 'mcp__zephyr__extension (MCP-JS)', 'list_extensions (MCP-Rust)'],
  ['tulis isi berkas', 'write_file / edit (builtin)', 'editor_write / editor_insert (MCP-Rust)'],
];
const namaRust = new Set(RUST_MCP);
const dobelNyata = KANDIDAT_DOBEL.filter(([, a, b]) => [...namaRust].some((r) => a.includes(r) || b.includes(r)));

/* ================================================================== */
/* E. Jebakan: tool di-ROUTE prompt tapi tak ikut dikirim             */
/* ================================================================== */

const promptTs = adaBerkas('src/lib/systemPrompt.ts') ? baca('src/lib/systemPrompt.ts') : '';
const IDENT = /^[a-z]+_[a-z0-9_]+$/; /* hanya nama ber-underscore - hindari kata umum ('edit','think','read') */
const diRoutePrompt = KATALOG.filter(
  (t) => t.source !== 'mcp' && IDENT.test(t.name) && new RegExp(`\\b${t.name}\\b`).test(promptTs),
).map((t) => t.name);
const jebakan = diRoutePrompt.filter((n) => !DIKIRIM_SELALU.includes(n)).sort();
const mcpDiDikirim = MCP.filter((t) => DIKIRIM_SELALU.includes(t.name)).length;

/* Sebutan PROSA: nama tool yang memang sengaja ditulis di prompt sebagai kalimat
   deklaratif (menyuruh model MENCARI lewat tool_search), BUKAN ajakan memakainya.
   Regex kata per-boundary di atas tak bisa membedakan keduanya, jadi daftar ini
   yang memisahkan - dan tiap entri WAJIB membawa bukti kutipannya sendiri.
   Kalau kalimat di systemPrompt.ts berubah, KEBENARAN di bawah ikut gagal dan audit
   menyuruh memperbarui daftar, bukan diam-diam menganggapnya basi. */
const SEBUTAN_PROSA = {
  replace_in_files: {
    bukti: [
      'systemPrompt.ts EN: "language-server tools and replace_in_files are deferred, not gone"',
      'systemPrompt.ts ID: "tool language-server dan replace_in_files ditunda, bukan dihapus"',
    ],
  },
};
const sebutanProsa = diRoutePrompt.filter((n) => SEBUTAN_PROSA[n] && !DIKIRIM_SELALU.includes(n));
const jebakanNyata = jebakan.filter((n) => !SEBUTAN_PROSA[n]);

/* Kontrol: tiap entri prosa BENAR-BENAR ada di prompt, dan tiap kalimat buktinya
   ikut ditemukan. Tanpa ini daftar bisa jadi basi tanpa suara. */
const ujiProsa = Object.entries(SEBUTAN_PROSA).map(([nama, info]) => {
  const bs = String.fromCharCode(92);
  const adaDiPrompt = new RegExp(bs + 'b' + nama + bs + 'b').test(promptTs);
  const kutipan = info.bukti.map((b) => {
    const tanda = b.match(/"(.+)"$/);
    return { teks: b, ketemu: tanda ? promptTs.includes(tanda[1]) : true };
  });
  return { nama, adaDiPrompt, kutipan };
});
for (const u of ujiProsa) {
  if (!u.adaDiPrompt) masalah.push(`daftar sebutan-prosa: ${u.nama} sudah TIDAK ada di systemPrompt.ts - hapus atau perbarui entri`);
  for (const k of u.kutipan) {
    if (!k.ketemu) masalah.push(`daftar sebutan-prosa: kutipan bukti ${u.nama} tak lagi cocok -> ${k.teks}`);
  }
}

/* ================================================================== */
/* F. Operasi BERKAS: ada vs bolong                                  */
/* ================================================================== */

const punya = (n) => NAMA_KATALOG.has(n);
const lspRenameAda = KATALOG.some((t) => t.name === 'lsp_rename');
const VERIF = [
  {
    op: 'baca isi berkas SENDIRI (hasil tulis / buffer belum tersimpan)',
    ada: punya('read_file'),
    rumah: 'read_file (builtin)',
    usul: 'cukup parameter - sudah tertutup',
    alasan: 'read_file sudah membaca disk DAN buffer editor yang belum disimpan',
  },
  { op: 'buat berkas baru', ada: punya('write_file'), rumah: 'write_file (builtin)', usul: 'cukup parameter - sudah tertutup', alasan: '-' },
  { op: 'hapus berkas/folder', ada: punya('delete_file'), rumah: 'delete_file (builtin)', usul: 'cukup parameter - sudah tertutup', alasan: '-' },
  {
    op: 'ganti nama / pindah berkas',
    ada: punya('move_file'),
    rumah: 'move_file (builtin)',
    usul: DIKIRIM_SELALU.includes('move_file')
      ? 'cukup parameter - sudah tertutup (ikut dikirim tiap giliran)'
      : 'cukup parameter - ADA, tapi TIDAK ikut dikirim tiap giliran (lihat bagian F)',
    alasan: 'ganti nama = move dalam folder yang sama',
  },
  {
    op: 'salin berkas/folder',
    ada: punya('copy_file'),
    rumah: 'copy_file (builtin)',
    usul: DIKIRIM_SELALU.includes('copy_file')
      ? 'cukup parameter - sudah tertutup (ikut dikirim)'
      : 'cukup parameter - ADA, tapi TIDAK ikut dikirim (lihat bagian F)',
    alasan: '-',
  },
  {
    op: 'cari-dan-ganti LINTAS BERKAS yang SADAR KODE (rename simbol / refactor)',
    ada: lspRenameAda,
    rumah: 'replace_in_files (builtin) - TAPI ini teks/pola, BUKAN sadar kode',
    usul: 'butuh TOOL BARU (lsp_rename / refactor simbol)',
    alasan:
      'replace_in_files mengganti teks apa adanya: bisa merusak kode (nama sama di komentar/string ikut terganti, simbol terlewat karena beda bentuk). Ganti nama simbol yang sadar-kode hanya bisa dari language server; katalog TIDAK punya lsp_rename (hanya symbols/references/definition/hover/diagnostics/call_hierarchy).',
  },
];

/* ================================================================== */
/* CETAK                                                             */
/* ================================================================== */

const garis = (t) => console.log(`\n== ${t} ==`);
console.log('AUDIT KATALOG TOOL ZEPHR (read-only, dari sumber)');
console.log(`akar repo: ${AKAR}`);

garis('A. JUMLAH KATALOG');
console.log(`builtin           : ${BUILTIN.length}`);
console.log(`mcp (JS)          : ${MCP.length}`);
console.log(`web               : ${WEB.length}`);
console.log(`inti (builtin+mcp): ${BUILTIN.length + MCP.length}`);
console.log(`TOTAL katalog     : ${KATALOG.length}`);
console.log(`aktif default     : ${AKTIF_AWAL.length}  (inti ${TOOL_INTI.length} + web-aktif ${WEB_AKTIF_AWAL.length})`);
console.log(`DIKIRIM_SELALU    : ${DIKIRIM_SELALU.length}  (${((DIKIRIM_SELALU.length / KATALOG.length) * 100).toFixed(0)}% katalog)`);

garis('B. DAFTAR SEMUA TOOL');
for (const [label, s] of [['BUILTIN', 'builtin'], ['MCP', 'mcp'], ['WEB', 'web']]) {
  const arr = KATALOG.filter((t) => t.source === s);
  console.log(`\n-- ${label} (${arr.length}) --`);
  for (const t of arr) {
    const kirim = DIKIRIM_SELALU.includes(t.name) ? 'DIKIRIM' : 'search ';
    console.log(`  [${kirim}] ${t.name.padEnd(26)} ${t.group.padEnd(16)} ${t.effect.padEnd(8)} ${t.description.slice(0, 70)}`);
  }
}

garis('C. BERAPA DITAWARKAN PER GILIRAN (target <= 20)');
for (const k of KELAS) {
  const n = alatTerkirim(k.args).length;
  console.log(`  ${String(n).padStart(2)}  ${(n <= TARGET_MAKS ? 'OK' : 'LEWAT').padEnd(5)}  ${k.nama}`);
}
const nRencanaFolder = alatRencanaPertama(true).length;
const nRencanaNoFolder = alatRencanaPertama(false).length;
console.log(`  ${String(nRencanaFolder).padStart(2)}  GERBANG Langkah-1 tugas berat, ada folder (${TOOL_RENCANA_PERTAMA.join(', ')})`);
console.log(`  ${String(nRencanaNoFolder).padStart(2)}  GERBANG Langkah-1 tugas berat, tanpa folder`);
const maks = Math.max(...KELAS.map((k) => alatTerkirim(k.args).length), nRencanaFolder);
console.log(`\n  MAKS per giliran : ${maks}  (target ${TARGET_MAKS}) -> ${maks <= TARGET_MAKS ? 'LULUS' : 'MELEWATI TARGET'}`);
if (maks > TARGET_MAKS) masalah.push(`langit-langit per giliran ${maks} > target ${TARGET_MAKS}`);

garis('D. SINKRON KATALOG <-> HANDLER + IZIN');
console.log(`berkas handler         : ${BERKAS_HANDLER.map((p) => p.split('/').pop()).join(', ')}`);
console.log(`  sumber               : registry AGENT_TOOLS + daftar-cadangan (${berkasHandlerDariRegistry().length} dari registry)`);
console.log(`handler unik           : ${handler.size}`);
console.log(`katalog tanpa handler  : ${tanpaHandler.length}${tanpaHandler.length ? ' -> ' + tanpaHandler.join(', ') : ''}`);
console.log(`handler tanpa katalog  : ${tanpaKatalog.length}${tanpaKatalog.length ? ' -> ' + tanpaKatalog.join(', ') : ''}`);
console.log(`nama katalog ganda     : ${namaGanda.length}${namaGanda.length ? ' -> ' + namaGanda.join(', ') : ''}`);
console.log(`menulis tapi tanpa izin: ${lupaIzin.length}${lupaIzin.length ? ' -> ' + lupaIzin.join(', ') : ''}`);
if (tanpaHandler.length) masalah.push(`${tanpaHandler.length} nama katalog tanpa handler: ${tanpaHandler.join(', ')}`);
if (tanpaKatalog.length) masalah.push(`${tanpaKatalog.length} handler tanpa entri katalog: ${tanpaKatalog.join(', ')}`);
if (namaGanda.length) masalah.push(`nama katalog ganda: ${namaGanda.join(', ')}`);
if (lupaIzin.length) masalah.push(`menulis tanpa izin: ${lupaIzin.join(', ')}`);

garis('D2. UJI DIRI DETEKSI HANDLER (kontrol positif/negatif/regresi)');
for (const u of ujiHandler) {
  console.log(`  [${u.benar ? 'BENAR' : 'SALAH'}] ${u.nama}`);
  console.log(`          harap ${u.harap ? 'TERDETEKSI' : 'TIDAK terdeteksi'} -> dapat ${u.dapat ? 'TERDETEKSI' : 'TIDAK terdeteksi'}`);
}
if (ujiHandler.some((u) => !u.benar)) masalah.push('uji diri deteksi handler tidak sesuai harapan');

garis('E. DUPLIKASI KEMAMPUAN (internal vs MCP-Rust)');
console.log(`tool MCP-Rust (mcp_server.rs tools_schema): ${RUST_MCP.length} -> ${RUST_MCP.join(', ')}`);
console.log(`tool MCP-JS (katalog, blok MCP)          : ${MCP.length}`);
console.log(`\nkemampuan yang punya RUMAH GANDA:`);
for (const [kem, a, b] of dobelNyata) console.log(`  - ${kem}\n      A: ${a}\n      B: ${b}`);
console.log(`\n  total kemampuan ber-rumah-ganda terdeteksi: ${dobelNyata.length}`);

garis('F. JEBAKAN: di-ROUTE prompt tapi TIDAK ikut dikirim');
console.log('aturan katalog: "apa pun yang di-route prompt WAJIB ikut dikirim" (catalog.ts:519-520).');
console.log(`tool ber-underscore di-route prompt tapi TIDAK di DIKIRIM_SELALU: ${jebakan.length}`);
console.log(`  - sebutan PROSA yang disengaja (bukan pelanggaran): ${sebutanProsa.length}`);
for (const n of sebutanProsa) {
  console.log(`      * ${n.padEnd(22)} (dicari lewat tool_search - kalimat deklaratif)`);
  for (const k of SEBUTAN_PROSA[n].bukti) console.log(`        bukti: ${k}`);
}
console.log(`  - JEBAKAN NYATA (harus 0): ${jebakanNyata.length}`);
for (const n of jebakanNyata) {
  const t = KATALOG.find((x) => x.name === n);
  console.log(`      ! ${n.padEnd(22)} ${t ? t.description.slice(0, 60) : ''}`);
}
console.log(`tool MCP-JS di DIKIRIM_SELALU: ${mcpDiDikirim} dari ${MCP.length}`);
console.log('  -> BUKAN jebakan. Ketidakhadiran MCP di daftar ini memang disengaja');
console.log('     (baca komentar di catalog.ts:509-511): model menemukan tool MCP lewat');
console.log('     tool_search, dan per tugas MCP masuk lewat subsetTugas (keluarga');
console.log('     "kendali-app"). Perhitungan jebakan di atas juga menyaring source !== mcp,');
console.log('     jadi skrip ini TIDAK memeriksa apakah prompt merutekan alias MCP.');
console.log('  -> Sebutan-prosa dijaga kontrol KEBENARAN: kalau kalimat buktinya hilang dari');
console.log('     systemPrompt.ts, audit GAGAL dan menyuruh memperbarui daftar - jadi jebakan');
console.log('     baru tidak bisa sembunyi di balik label "false positive".');
if (jebakanNyata.length) peringatan.push(`${jebakanNyata.length} tool di-route prompt tapi tak dikirim: ${jebakanNyata.join(', ')}`);

garis('G. OPERASI BERKAS: ada vs BOLONG');
for (const v of VERIF) {
  console.log(`\n  ${v.ada ? 'ADA   ' : 'BOLONG'}  ${v.op}`);
  console.log(`         rumah : ${v.rumah}`);
  console.log(`         usul  : ${v.usul}`);
  console.log(`         alasan: ${v.alasan}`);
}
const bolong = VERIF.filter((v) => !v.ada);
console.log(
  `\n  total BOLONG: ${bolong.length} -> ${bolong.map((b) => b.op).join(' | ') || '(tidak ada)'}`,
);
console.log(`  usul butuh TOOL BARU : ${bolong.filter((b) => b.usul.startsWith('butuh TOOL BARU')).length}`);
console.log(`  usul cukup PARAMETER : ${bolong.filter((b) => b.usul.startsWith('cukup parameter')).length}`);

if (adaBerkas('src/lib/zephyrTools/builtins.ts')) {
  const m = baca('src/lib/zephyrTools/builtins.ts').match(/TOOL_DIKIRIM_SELALU \((\d+)\)/);
  if (m && Number(m[1]) !== DIKIRIM_SELALU.length) {
    peringatan.push(`komentar basi di builtins.ts: menulis "TOOL_DIKIRIM_SELALU (${m[1]})" padahal sekarang ${DIKIRIM_SELALU.length}`);
  }
}

garis('RINGKASAN');
console.log(`masalah struktural : ${masalah.length}`);
for (const m of masalah) console.log(`  ! ${m}`);
console.log(`peringatan         : ${peringatan.length}`);
for (const p of peringatan) console.log(`  ~ ${p}`);

const gagal = masalah.length > 0;
console.log(`\n${gagal ? '== GAGAL ==' : '== LULUS =='} (exit ${gagal ? 1 : 0})`);
process.exit(gagal ? 1 : 0);
