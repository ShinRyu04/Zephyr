#!/usr/bin/env node
/**
 * inventaris-tool.mjs — inventaris NYATA semua tool Zephyr + kapabilitas yang
 * benar-benar diberikannya, diturunkan dari kode sumber (bukan dari asumsi).
 *
 * ## Kenapa ada
 *
 * Permintaan: "hapus tool yang duplikat, tapi jangan sampai mengurangi jumlah
 * tool". Tanpa angka, dedupe = klaim kosong. Skrip ini = mesin buktinya:
 * ia menurunkan (a) daftar tool dan (b) KAPABILITAS tiap tool dari sumber nyata,
 * sehingga setiap usulan penggabungan bisa dibuktikan tidak menghilangkan
 * kapabilitas (lihat `deteksi-duplikat-tool.mjs` + gerbang superset di sana).
 *
 * ## Dari mana angkanya (dan kejujurannya)
 *
 *  1. name / source / group / effect / butuh-approval / deskripsi  <- IMPOR nyata
 *     `src/lib/zephyrTools/catalog.ts` (TOOL_CATALOG) lewat esbuild + data-URL,
 *     persis pola `scripts/uji-kesiapan-tool.mjs`. `builtins.ts` TIDAK bisa
 *     diimpor di Node (akses DOM saat evaluasi modul), jadi handler dibaca
 *     sebagai TEKS — dan itu disebut "parse" di keluaran, bukan "impor".
 *  2. aktif-default / wajib / dikirim-selalu <- IMPOR nyata `src/lib/toolGate.ts`
 *     (TOOL_AKTIF_AWAL, TOOL_WAJIB) + `catalog.ts` (TOOL_DIKIRIM_SELALU).
 *  3. KAPABILITAS tiap tool <- TABEL ATURAN di bawah, diterapkan pada teks
 *     HANDLER yang sudah dibersihkan komentarnya ("strip komentar"), lalu
 *     DIPERLUAS satu/tiga-hop ke fungsi yang dipanggil (mis. `mcp__zephyr__pane`
 *     memanggil `aksiPane(...)` di kendaliJendela.ts — buktinya ada DI SANA).
 *     Tiap label yang cocok mencatat `file:line` + potongan teks sebagai bukti.
 *
 * Jadi label kapabilitas BUKAN tebakan: ia berasal dari panggilan nyata di
 * handler. Konsekuensinya penting dan sengaja: tool yang handler-nya tidak
 * memanggil apa pun otomatis berkapabilitas KOSONG — itu yang membuat "stub
 * sukses palsu" terdeteksi sebagai fakta, bukan tuduhan.
 *
 * ## Keluaran
 *
 * Cetak tabel inventaris + total tool/kapabilitas + peta kapabilitas -> tool.
 * Pakai `--json` untuk keluaran mesin. Selalu exit 0 (ini laporan, bukan gate);
 * gerbang superset ada di `deteksi-duplikat-tool.mjs`.
 *
 * Jalankan dari akar repo:  node scripts/inventaris-tool.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAU_JSON = process.argv.includes('--json');

export const AKAR_REPO = AKAR;

/* ===================================================================== */
/* Impor nyata: bundle modul murni lalu impor lewat data-URL             */
/* ===================================================================== */

const esbuild = require('esbuild');

async function bundel(rel) {
  const out = await esbuild.build({
    entryPoints: [path.join(AKAR, rel)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const b64 = Buffer.from(out.outputFiles[0].text, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${b64}`);
}

/* ===================================================================== */
/* Berkas handler yang di-parse sebagai TEKS                             */
/* ===================================================================== */

const BERKAS_HANDLER = [
  'src/lib/zephyrTools/builtins.ts',
  'src/lib/zephyrTools/web.ts',
  'src/lib/zephyrTools/mcp.ts',
  'src/lib/zephyrTools/zephyrSelf.ts',
  'src/lib/zephyrTools/zephyrIngat.ts',
  'src/lib/zephyrTools/kendaliJendela.ts',
];

const bacaTeks = new Map(
  BERKAS_HANDLER.map((rel) => [rel, fs.readFileSync(path.join(AKAR, rel), 'utf8')]),
);

/* Berkas NON-handler yang dibaca HANYA untuk melacak badan helper (read-only).
 * `lspSymbols` di builtins.ts = `const lspSymbols = async (p) => (await
 * import('../agentLsp')).lspDocumentSymbolsTool(p)` — tanpa agentLsp.ts di sini,
 * tool `lsp_*` tampak "tak menyentuh backend" padahal memanggil language server. */
const BERKAS_HELPER = [
  'src/lib/agentLsp.ts', // port LSP: useLsp.getState().req(...)   -> lsp_*
  'src/lib/lspCm.ts', // langkah kedua LSP (lspPrepareCallHierarchy/lspCallHierarchy)
  'src/lib/aiMemori.ts', // port memori: cmd.memoryRead/memoryWrite -> ingat, zephyr_self
  'src/lib/zephyrCari.ts', // port pencarian -> zephyr_cari & kawan
];
/* Catatan: sengaja TIDAK memindai store UI (../store, ../aiStore,
 * ../terminalStore, ../panelStore, ../settingsStore). Modul-modul itu bukan
 * batas sistem, dan menambahnya membuat hampir semua tool mendapat label
 * palsu. Yang dipindai hanya modul PORT (penyentuh batas luar). */
const bacaHelper = new Map(
  BERKAS_HELPER.map((rel) => [rel, fs.readFileSync(path.join(AKAR, rel), 'utf8')]),
);

/* ===================================================================== */
/* PETA ALIAS IMPOR                                                      */
/*                                                                       */
/* `import { tambah as tambahMemori } from '../aiMemori'` -> name `tambahMemori` */
/* di zephyrIngat.ts harus bisa menemukan fungsi `tambah` di aiMemori.ts. */
/* Tanpa peta ini, pelacakan bukti berhenti di nama alias dan kapabilitas  */
/* tool `ingat` salah dianggap kosong.                                     */
/* ===================================================================== */

const PETA_ALIAS = new Map();
for (const [, teks] of bacaTeks) {
  for (const m of teks.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    for (const bagian of m[1].split(',')) {
      const b = bagian.trim().replace(/^type\s+/, '');
      if (!b) continue;
      const a = b.split(/\s+as\s+/);
      if (a.length === 2) PETA_ALIAS.set(a[1].trim(), a[0].trim());
    }
  }
}

/* ===================================================================== */
/* TABEL ATURAN KAPABILITAS  (regex -> label)                            */
/*                                                                       */
/* Inilah "aturan" yang mengubah sinyal kode menjadi label kapabilitas.  */
/* Setiap entri:                                                         */
/*   label    : label seragam `domain:aksi`                              */
/*   pola     : satu/lebih regex; COCOK bila SALAH SATU kena             */
/*   wajib    : (opsional) semua regex di sini HARUS juga kena           */
/*   kenapa   : alasan singkat — supaya tabel ini bisa diaudit           */
/*                                                                       */
/* Semua regex diuji pada teks handler yang SUDAH di-strip komentarnya,  */
/* dan (diperluas) pada badan fungsi yang dipanggil handler.             */
/* ===================================================================== */

const ATURAN = [
  /* ---------------- berkas ---------------- */
  {
    label: 'berkas:baca',
    pola: [
      /\bcmd\.fsRead\b/,
      /\bcmd\.aiReadToolOutput\b/,
      /\bcmd\.fsStat\b/,
      /\bbacaBerkas\(/,
      /\bbacaLengkap\(/,
      /\bbacaTeks\(/,
      /\bmuatLengkap\(/,
      /\bbacaGambar\(/,
      /\bt\.content\b/,
    ],
    kenapa: 'memanggil pembaca isi berkas / buffer editor terbuka (t.content)',
  },
  {
    label: 'berkas:cek-ada',
    pola: [/\bcmd\.fsExists\b/],
    kenapa: 'memeriksa keberadaan berkas',
  },
  {
    label: 'berkas:daftar',
    pola: [/\bcmd\.scanDir\b/],
    kenapa: 'menyisir isi folder',
  },
  {
    label: 'cari:nama',
    pola: [/\bcmd\.listWorkspaceFiles\b/, /\bpolaKeRegex\(/],
    kenapa: 'mencari/mencocokkan NAMA berkas via pola',
  },
  {
    label: 'berkas:tulis',
    pola: [/\bcmd\.fsWrite\b/, /\bcmd\.fsCreateFile\b/, /(?<![.\w])tulis\(/, /\bsimpanGambarTemp\(/],
    kenapa: 'menulis berkas ke disk',
  },
  {
    label: 'berkas:buat-dir',
    pola: [/\bcmd\.fsCreateDir\b/],
    kenapa: 'membuat folder',
  },
  {
    label: 'berkas:hapus',
    pola: [/\bcmd\.fsDelete\b/],
    kenapa: 'menghapus berkas',
  },
  {
    label: 'berkas:pindah',
    pola: [/\bcmd\.fsRename\b/],
    kenapa: 'memindah / mengganti nama berkas',
  },
  {
    label: 'berkas:salin',
    pola: [/\bcopyFile\(/, /\bsalinBerkas\(/],
    kenapa: 'menyalin isi berkas',
  },
  {
    label: 'berkas:ganti',
    pola: [/\bcmd\.searchReplace\b/, /\bcmd\.replaceInFile\b/, /\bcmd\.filePatch\b/],
    kenapa: 'penggantian teks eksplisit di berkas',
  },
  {
    label: 'berkas:ganti',
    pola: [/\bbacaLengkap\(/],
    wajib: [/(?<![.\w])tulis\(/],
    kenapa: 'pola baca-lengkap lalu tulis-ulang = ganti di tempat (edit/multi_edit)',
  },
  {
    label: 'cari:isi',
    pola: [/\bcmd\.searchGrep\b/, /\bkumpulkanBerkas\(/, /\bcmd\.searchFiles\b/, /\bcmd\.ragSearch\b/],
    kenapa: 'mencari ISI berkas',
  },
  {
    label: 'kode:diagnostik',
    pola: [/\bcmd\.getDiagnostics\b/],
    kenapa: 'membaca diagnostik/LSP berkas',
  },
  {
    label: 'kode:analisis',
    pola: [/\blspSymbols\(/, /\blspRefs\(/, /\blspDef\(/, /\blspHover\(/, /\blspDiagnostics\(/, /\blspCallHierarchy\(/, /\bcmd\.lspRequest\b/],
    kenapa: 'analisis kode via LSP (simbol/referensi/definisi/hover)',
  },
  {
    label: 'log:baca',
    pola: [/\bcmd\.logTail\b/],
    kenapa: 'membaca potongan log aplikasi',
  },

  /* ---------------- shell ---------------- */
  {
    label: 'shell:jalan',
    pola: [/\bcmd\.agentExec\b/, /\bcmd\.tasksRun\b/, /\bcmd\.cliAgentRun\b/],
    kenapa: 'menjalankan perintah di shell',
  },
  {
    label: 'shell:baca',
    pola: [/\bcmd\.tasksRuns\b/, /\bcmd\.ptyTail\b/, /\bcmd\.tasksWait\b/, /\bsaringBaris\(/],
    kenapa: 'membaca keluaran terminal/proses',
  },
  {
    label: 'shell:kelola',
    pola: [/\bcmd\.tasksKill\b/, /\bcmd\.ptyKill\b/, /\bcmd\.ptyInterrupt\b/, /\bcmd\.ptyResize\b/, /\bcmd\.ptyList\b/, /\bcmd\.listShells\b/],
    kenapa: 'mengelola (kill/interrupt/list) proses & PTY',
  },
  {
    label: 'shell:ketik',
    pola: [/\bcmd\.ptyWrite\b/, /\bcmd\.ptySpawn\b/],
    kenapa: 'mengirim input ke terminal (spawn/tulis PTY)',
  },

  /* ---------------- web ---------------- */
  {
    label: 'web:ambil',
    pola: [/\bcmd\.webFetch\b/, /(?<![.\w])fetch\(/, /\bcmd\.httpRequest\b/, /\bcmd\.browserDownloadUrl\b/],
    kenapa: 'mengambil konten dari jaringan',
  },
  {
    label: 'web:buka',
    pola: [/\bcmd\.systemBrowserOpen\b/, /\bopenUrl\(/],
    kenapa: 'membuka URL di browser luar (sistem) — tidak mengambil isinya',
  },
  {
    label: 'web:cari',
    pola: [/\bcmd\.webSearch\b/],
    kenapa: 'pencarian web',
  },

  /* ---------------- jendela / browser pane ---------------- */
  {
    label: 'jendela:buka',
    pola: [/\bcmd\.browserPaneOpen\b/, /\bcmd\.workspaceOpen\b/, /\.openWorkspace\(/, /\bbukaPanel\(/, /\bbukaSetelan\(/, /\bbukaSetelanLangsung\(/, /\bpakaiUlangPane\(/, /\bcmd\.devenvOpenPath\b/, /\bcmd\.workspaceOpenFile\b/, /\.addPane\(/, /\bopenPath\(/],
    kenapa: 'membuka pane/panel/tab/folder (addPane = pane baru)',
  },
  {
    label: 'jendela:tutup',
    pola: [/\bcmd\.browserPaneClose\b/, /\.closePane\(/],
    kenapa: 'menutup pane (closePane)',
  },
  {
    label: 'jendela:atur',
    pola: [/\bcmd\.browserPaneBounds\b/, /\bcmd\.setWindowSize\b/, /\bgeserTabTerminal\(/, /\baksiPane\(/, /\bcmd\.browserPaneVisible\b/, /\.setLayout\(/, /\.setActiveTab\(/, /\.setVisible\(/, /\bnewTab\(/],
    kenapa: 'mengatur tata letak / ukuran / tab / visibilitas pane',
  },
  {
    label: 'jendela:fokus',
    pola: [/\bcmd\.browserPaneCursor\b/, /\.setActivePane\(/, /\bpastikanTampil\(/],
    kenapa: 'memindah fokus / mengarahkan perhatian pane',
  },
  {
    label: 'jendela:baca',
    pola: [/\bcmd\.browserPaneInfo\b/, /\bcmd\.browserProbe\b/, /\bbacaHalaman\(/, /\bdaftarPanel\(/, /\bringkasJendela\(/, /\btangkapJendela\(/, /\bcmd\.browserPaneEval\b/, /\.terminalTabs\b/, /\.allPanes\(/],
    kenapa: 'membaca keadaan jendela/pane (daftar tab terminal, pane terbuka, DOM halaman)',
  },
  {
    label: 'jendela:klik',
    pola: [/\.click\(\)/, /\bel\.click\b/, /clickPada\(/],
    kenapa: 'mengklik elemen di halaman',
  },
  {
    label: 'jendela:ketik',
    pola: [/\bel\.value\s*=/, /dispatchEvent\(\s*new\s+Event\(\s*['"]input/, /\bel\.focus\(\)/],
    kenapa: 'mengisi/mengetik teks ke elemen halaman',
  },
  {
    label: 'jendela:navigasi',
    pola: [/\bcmd\.browserPaneNav\b/],
    kenapa: 'navigasi halaman (back/forward/reload/url)',
  },
  {
    label: 'tangkap:layar',
    pola: [/\bcmd\.captureWindow\b/, /\blaporanTangkapLayar\(/, /\bcaptureWindow\(/, /\bcmd\.aiCaptureSet\b/],
    kenapa: 'menangkap layar/jendela',
  },
  {
    label: 'papan-klip:baca',
    pola: [/navigator\.clipboard/, /\bclipboard\.read/],
    kenapa: 'membaca papan klip',
  },

  /* ---------------- ekstensi ---------------- */
  {
    label: 'ekstensi:baca',
    pola: [/\bcmd\.extensionsList\b/, /\bcmd\.extensionsManifests\b/, /\bcmd\.extensionsBundledIds\b/, /\bcmd\.extRegistryInstalled\b/, /\bcmd\.extensionsFolder\b/, /\bcmd\.extRegistryList\b/, /\bcmd\.extWhich\b/],
    kenapa: 'membaca daftar/manifes ekstensi',
  },
  {
    label: 'ekstensi:pasang',
    pola: [/\bcmd\.extensionsAdd\b/, /\bcmd\.extensionsInstall\b/, /\bcmd\.extensionsLoad\b/, /\bcmd\.extensionsSetEnabled\b/, /\bcmd\.extensionsUninstall\b/, /\bcmd\.extensionsRemove\b/, /\bcmd\.ccPluginInstall\b/, /\bcmd\.ccCatalogInstall\b/, /\bcmd\.extRegistrySave\b/, /\bcmd\.lspPasang\b/],
    kenapa: 'memasang/mengaktifkan/mencopot ekstensi',
  },

  /* ---------------- subagen / tool ---------------- */
  {
    label: 'subagen:jalan',
    pola: [/\bjalankanSubagent\(/, /\bcmd\.cliAgentRun\b/, /\bcmd\.cliChat\b/, /\bcmd\.aiChat\b/],
    kenapa: 'menjalankan subagen / agen CLI',
  },
  { label: 'tool:cari', pola: [/\bcariToolTerdefer\(/], kenapa: 'mencari tool yang terdefer' },
  {
    label: 'tool:panggil',
    pola: [/\bjalankanAgentTool\(/],
    kenapa: 'memanggil tool lain lewat jembatan agen',
  },

  /* ---------------- app ---------------- */
  {
    label: 'app:setelan-baca',
    pola: [/\bcmd\.getSettings\b/, /\bcmd\.getKeybindings\b/, /\bdaftarSetelan\(/, /\bcmd\.listModels\b/, /\bcmd\.getAppInfo\b/],
    kenapa: 'membaca setelan aplikasi',
  },
  {
    label: 'app:setelan-tulis',
    pola: [/\bcmd\.setSettings\b/, /\bcmd\.setKeybindings\b/, /\bcmd\.setModelKey\b/, /\bcmd\.workspaceSetSettings\b/, /\bcmd\.resetSettings\b/, /\bcmd\.setWindowSize\b/],
    kenapa: 'mengubah setelan aplikasi',
  },
  {
    label: 'memori:baca',
    pola: [/\bcmd\.memoryRead\b/, /\bcariMemori\(/, /\bcatatanMemori\(/, /\bblokMemoriTersimpan\(/],
    kenapa: 'membaca memori tersimpan',
  },
  {
    label: 'memori:tulis',
    pola: [/\bcmd\.memoryWrite\b/, /\btambahMemori\(/, /\bhapusMemori\(/],
    kenapa: 'menulis/menghapus memori',
  },
  {
    label: 'jadwal:buat',
    pola: [/\bcmd\.cronCreate\b/],
    kenapa: 'membuat jadwal',
  },
  { label: 'jadwal:baca', pola: [/\bcmd\.cronList\b/], kenapa: 'membaca daftar jadwal' },
  {
    label: 'jadwal:ubah',
    pola: [/\bcmd\.cronDelete\b/, /\bcmd\.cronToggle\b/],
    kenapa: 'menghapus/mengubah jadwal',
  },
  {
    label: 'todo:tulis',
    pola: [/\btodoTerpangkas\(/, /\buseAi\.getState\(\)[\s\S]{0,80}?todo/],
    kenapa: 'menulis daftar tugas (todo) aplikasi',
  },
  {
    label: 'skill:baca',
    pola: [/\bcmd\.skillRead\b/, /\bcmd\.skillsList\b/],
    kenapa: 'membaca skill',
  },
  {
    label: 'ssh:baca',
    pola: [/\bcmd\.sshList\b/, /\bcmd\.sftpList\b/, /\bcmd\.sftpAvailable\b/],
    kenapa: 'membaca daftar koneksi SSH/SFTP',
  },
  {
    label: 'ssh:connect',
    pola: [/\bcmd\.sshConnect\b/, /\bcmd\.sshAdd\b/, /\bcmd\.sshSavePassword\b/],
    kenapa: 'membuat/menyambung koneksi SSH',
  },
  {
    label: 'git:kelola',
    pola: [/\bcmd\.worktreeList\b/, /\bcmd\.worktreeAdd\b/, /\bcmd\.worktreeRemove\b/, /\bcmd\.worktreePrune\b/, /\bcmd\.gitStatus\b/, /\bcmd\.gitCommit\b/, /\bcmd\.gitPush\b/],
    kenapa: 'operasi git/worktree',
  },
  {
    label: 'server:kelola',
    pola: [/\bcmd\.devenvServiceStart\b/, /\bcmd\.devenvServiceStop\b/, /\bcmd\.mcpStart\b/, /\bcmd\.mcpStop\b/, /\bcmd\.tasksDetectPort\b/],
    kenapa: 'menjalankan/menghentikan server',
  },
  {
    label: 'mcp:status',
    pola: [/\bcmd\.mcpStatus\b/, /\bcmd\.mcpClientTools\b/, /\bcmd\.mcpClientCall\b/, /\bbukaSetelan\('mcp'/],
    kenapa: 'memeriksa/memanggil status MCP',
  },
  {
    label: 'hitung:ekspresi',
    pola: [/\bhitungAman\(/],
    kenapa: 'menghitung ekspresi',
  },
  {
    label: 'tanya:user',
    pola: [/\bagentAjukanTanya\(/, /\bajukanPertanyaan\(/],
    kenapa: 'mengajukan pertanyaan ke user dan menunggu jawaban',
  },
  {
    label: 'saran:perintah',
    pola: [/\bsetCommandSuggestion\(/],
    kenapa: 'menampilkan kartu saran perintah (tanpa menjalankannya)',
  },
  {
    label: 'catatan:baca',
    pola: [/\bcmd\.instructionRead\b/, /\bcmd\.instructionCatalogList\b/, /\bcmd\.instructionsList\b/],
    kenapa: 'membaca catatan/instruksi tersimpan',
  },
];

/* Label berbasis NAMA tool — hanya untuk tool murni/penalaran yang memang
 * TIDAK menyentuh batas sistem (mis. `tool_search` mengembalikan daftar nama).
 * Dipakai supaya tool murni tidak salah dianggap "tanpa kapabilitas". */
const ATURAN_NAMA = {
  tool_search: 'penalaran:cari',
};

/* ===================================================================== */
/* Util teks                                                             */
/* ===================================================================== */

/** Buang komentar blok + baris, TAPI sadar-string: teks di dalam '..', "..", `..`
 *  dipertahankan apa adanya. Penting karena deskripsi tool sering memuat '/*'
 *  atau '**\/*.ts' yang, dengan regex naif, akan dianggap awal komentar dan
 *  MENELAN kode setelahnya (mis. `cmd.listWorkspaceFiles` pada tool `glob`). */
function stripKomentar(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const c2 = s[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      const kutip = c;
      out += c;
      i++;
      while (i < s.length && s[i] !== kutip) {
        if (s[i] === '\\' && i + 1 < s.length) {
          out += s[i] + s[i + 1];
          i += 2;
          continue;
        }
        out += s[i];
        i++;
      }
      if (i < s.length) {
        out += s[i];
        i++;
      }
      continue;
    }
    if (c === '/' && c2 === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Nomor baris (1-based) untuk offset karakter di sebuah berkas. */
function hitungBaris(teks, offset) {
  return teks.slice(0, offset).split('\n').length;
}

/**
 * Dari indeks `iBuka` yang menunjuk '{', kembalikan indeks SETELAH '}' pasangannya.
 * Melewati string ('..', "..", `..`) dan komentar supaya brace di dalamnya tidak
 * mengacaukan hitungan. Kembali -1 bila tidak ketemu.
 */
function akhirBlok(teks, iBuka) {
  let dalam = 0;
  for (let i = iBuka; i < teks.length; i++) {
    const c = teks[i];
    const c2 = teks[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      const kutip = c;
      i++;
      while (i < teks.length && teks[i] !== kutip) {
        if (teks[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '/' && c2 === '/') {
      while (i < teks.length && teks[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < teks.length && !(teks[i] === '*' && teks[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === '{') dalam++;
    else if (c === '}') {
      dalam--;
      if (dalam === 0) return i + 1;
    }
  }
  return -1;
}

/** Singkatkan potongan teks jadi satu baris untuk bukti. */
function padat(s, n = 120) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/**
 * Nama properti parameter tool dari blok spec-nya (`properties: { ... }`).
 * Dipakai detektor duplikat sebagai bukti "nilai tambah": tool dengan
 * kapabilitas sama tapi parameter berbeda bukan duplikat sejati
 * (mis. `edit` {old_string,new_string} vs `multi_edit` {edits}).
 */
function parseParams(blokTeks) {
  const i = blokTeks.indexOf('properties:');
  if (i < 0) return [];
  const iBuka = blokTeks.indexOf('{', i);
  if (iBuka < 0) return [];
  const habis = akhirBlok(blokTeks, iBuka);
  const isi = blokTeks.slice(iBuka + 1, habis > 0 ? habis - 1 : blokTeks.length);
  const keluar = [];
  let dalam = 0;
  for (const m of isi.matchAll(/([{}])|^\s*([A-Za-z_$][\w$]*)\s*:/gm)) {
    if (m[1] === '{') {
      dalam++;
      continue;
    }
    if (m[1] === '}') {
      dalam--;
      continue;
    }
    if (dalam === 0 && m[2]) keluar.push(m[2]);
  }
  return [...new Set(keluar)];
}

/* ===================================================================== */
/* Parse handler -> blok tool + badan fungsi                             */
/* ===================================================================== */

const RE_NAMA = /name:\s*'([A-Za-z_][A-Za-z0-9_]*)'/g;
/** Salinan TERPISAH untuk pencarian internal — jangan pakai RE_NAMA di dalam
 *  loop-nya sendiri, `lastIndex`-nya bersama dan akan melompati tool. */
const RE_NAMA_CARI = new RegExp(RE_NAMA.source, 'g');

/** Map nama tool -> daftar blok {berkas, baris, teks, offset}. */
function parseTool() {
  const peta = new Map();
  for (const [rel, teks] of bacaTeks) {
    let m;
    RE_NAMA.lastIndex = 0;
    while ((m = RE_NAMA.exec(teks))) {
      const nama = m[1];
      const idxNama = m.index;
      // blok = dari `name:` sampai akhir badan `run: ... => { ... }`
      let akhir = -1;
      const iRun = teks.indexOf('run:', idxNama);
      if (iRun > 0) {
        const iArrow = teks.indexOf('=>', iRun);
        if (iArrow > 0) {
          let j = iArrow + 2;
          while (j < teks.length && /\s/.test(teks[j])) j++;
          if (teks[j] === '{') {
            const habis = akhirBlok(teks, j);
            if (habis > 0) akhir = habis;
          }
        }
        if (akhir < 0) {
          /*
           * Badan EKSPRESI tanpa kurawal: `run: async (a) => hitungAman(...)`.
           * Blok berakhir di `name:` tool BERIKUTNYA. Tanpa cabang ini,
           * `indexOf('{', iArrow)` menemukan kurawal milik tool BERIKUTNYA dan
           * blok satu tool menelan blok tool lain (satu menelan yang lain).
           */
          RE_NAMA_CARI.lastIndex = iRun;
          const n = RE_NAMA_CARI.exec(teks);
          akhir = n ? n.index : Math.min(teks.length, idxNama + 2000);
        }
      }
      if (akhir < 0) akhir = Math.min(teks.length, idxNama + 2000);
      const blok = { berkas: rel, baris: hitungBaris(teks, idxNama), teks: teks.slice(idxNama, akhir) };
      if (!peta.has(nama)) peta.set(nama, []);
      peta.get(nama).push(blok);
    }
  }
  return peta;
}

/**
 * Tool yang menunjuk handler lewat REFERENSI, bukan badan sebaris:
 *   `{ spec: INGAT_TOOL, run: jalankanIngat }`   (zephyrIngat.ts:205)
 *   `{ spec: ..., run: jalankanZephyrSelf }`     (zephyrSelf.ts:601)
 * Blok `name:`-nya tidak memuat `run:` maupun panggilan apa pun, jadi tanpa
 * peta ini `ingat` dan `zephyr_self` tampak "tanpa kapabilitas". Peta dibangun
 * dengan mencari `run: <id>` lalu mengambil `name:` TERDEKAT SEBELUMNYA di
 * berkas yang sama (referensi selalu ditulis di bawah spec-nya).
 */
function petaRunRef() {
  const peta = new Map();
  const RE_BARE = /run:\s*([A-Za-z_$][\w$]*)\s*[,}]/g;
  for (const [rel, teks] of bacaTeks) {
    let m;
    RE_BARE.lastIndex = 0;
    while ((m = RE_BARE.exec(teks))) {
      const sebelum = teks.slice(0, m.index);
      let akhir = null;
      let g;
      RE_NAMA_CARI.lastIndex = 0;
      while ((g = RE_NAMA_CARI.exec(sebelum))) akhir = g[1];
      if (akhir) peta.set(akhir, { ref: m[1], sumber: `${rel}:${hitungBaris(teks, m.index)}` });
    }
  }
  return peta;
}

const PETA_RUNREF = petaRunRef();
/**
 * Akhir EKSPRESI arrow tanpa kurawal (`(a) => expr`): berhenti di akhir baris
 * saat semua kurung sudah seimbang, atau di `;` teratas. Jendela tetap dipakai
 * kalau ekspresinya panjang.
 * Kenapa penting: jendela buta (+400 char) pernah menelan fungsi TETANGGA
 * sebagai badan, sehingga sinyal backend milik tool lain nyasar jadi bukti.
 */
function akhirEkspresi(teks, i) {
  let lengkung = 0;
  let siku = 0;
  let kurawal = 0;
  for (let k = i; k < teks.length && k < i + 900; k++) {
    const c = teks[k];
    if (c === '"' || c === "'" || c === '`') {
      const kutip = c;
      k++;
      while (k < teks.length && teks[k] !== kutip) {
        if (teks[k] === '\\') k++;
        k++;
      }
      continue;
    }
    if (c === '/' && teks[k + 1] === '/') {
      const n = teks.indexOf('\n', k);
      if (n < 0) break;
      k = n;
      continue;
    }
    if (c === '(') lengkung++;
    else if (c === ')') lengkung--;
    else if (c === '[') siku++;
    else if (c === ']') siku--;
    else if (c === '{') kurawal++;
    else if (c === '}') {
      kurawal--;
      if (kurawal < 0) return k;
    } else if ((c === '\n' || c === ';') && lengkung === 0 && siku === 0 && kurawal === 0) {
      return c === ';' ? k + 1 : k;
    }
  }
  return Math.min(teks.length, i + 900);
}

function parseFungsi() {
  const peta = new Map();
  const pola = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/g,
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\s*)?\(/g,
  ];
  for (const [rel, teks] of [...bacaTeks, ...bacaHelper]) {
    for (const re of pola) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(teks))) {
        const nama = m[1];
        if (peta.has(nama)) continue;
        // cari '{' pertama setelah tanda kurung parameter seimbang
        let i = teks.indexOf('(', m.index);
        let dalam = 0;
        while (i < teks.length) {
          if (teks[i] === '(') dalam++;
          else if (teks[i] === ')') {
            dalam--;
            if (dalam === 0) break;
          }
          i++;
        }
        /* Badan fungsi: `foo(a) {` (method) atau `(a) => { ... }` (arrow).
         * Bila arrow TANPA kurawal (`=> expr`), ambil jendela terbatas — tanpa
         * ini `indexOf('{')` melompat ke kurawal JAUH di bawahnya dan menelan
         * ratusan baris kode sebagai "badan fungsi" palsu (lihat `lspSymbols`). */
        const panah = teks.indexOf('=>', i);
        let iBuka = -1;
        let k = i + 1;
        while (k < teks.length && /\s/.test(teks[k])) k++;
        if (teks[k] === '{') iBuka = k;
        else if (teks[k] === ':') {
          /* Anotasi tipe kembali: `(a): Promise<void> {` — kurawal badan datang
           * SETELAH tipe. Kurawal di DALAM tipe (mis. `Promise<{ ok: boolean }>`)
           * harus DILEWATI, kalau tidak, "badan fungsi" jadi literal tipe itu
           * sendiri (bug yang membuat lsp_* tampak tanpa batas sistem).
           * Sebuah kelompok `{...}` dianggap tipe bila setelah `}`-nya masih
           * lanjut tipe: `>` `,` `|` `&` `)` `[` `{` `=`, atau `=>`. */
          let j = k;
          /* Tipe bisa multi-baris dan panjang (mis. `Promise< | {...} | {...} >`).
           * Batas harus LONGGAR: kalau kekecilan, pemindaian gagal menemukan
           * kurawal badan lalu jatuh ke jendela `=>` yang jauh di bawah dan
           * menelan fungsi TETANGGA sebagai "badan" (itulah sebabnya evidence
           * `lsp_diagnostics` sempat nyasar ke `lspCallHierarchyTool`). */
          const batasPindai = Math.min(teks.length, k + 4000);
          while (j < batasPindai) {
            if (teks[j] === ';') break;
            if (teks[j] === '=') break; // panah `=>`
            if (teks[j] === '{') {
              const h = akhirBlok(teks, j);
              if (h < 0) break;
              if (/^\s*(?:[>,|&)\[{=]|=>)/.test(teks.slice(h, h + 4))) {
                j = h;
                continue;
              }
              iBuka = j;
              break;
            }
            j++;
          }
        }
        if (iBuka < 0 && panah >= 0) {
          let j = panah + 2;
          while (j < teks.length && /\s/.test(teks[j])) j++;
          if (teks[j] === '{') iBuka = j;
        }
        let badan;
        if (iBuka >= 0) {
          const habis = akhirBlok(teks, iBuka);
          if (habis < 0) continue;
          badan = teks.slice(iBuka, habis);
        } else if (panah >= 0) {
          /* Arrow ekspresi: ambil sampai akhir ekspresinya, JANGAN jendela buta. */
          let j = panah + 2;
          while (j < teks.length && /\s/.test(teks[j])) j++;
          badan = teks.slice(panah, akhirEkspresi(teks, j));
        } else {
          continue;
        }
        const panggil = namaPanggilan(stripKomentar(badan));
        peta.set(nama, { berkas: rel, baris: hitungBaris(teks, m.index), teks: badan, panggil });
      }
    }
  }
  return peta;
}

const KATA_KUNCI = new Set([
  'if', 'for', 'while', 'return', 'new', 'function', 'async', 'await', 'const', 'let', 'var',
  'throw', 'catch', 'typeof', 'instanceof', 'else', 'switch', 'case', 'do', 'try', 'super',
  'this', 'string', 'number', 'boolean', 'any', 'unknown', 'void', 'true', 'false', 'null',
  'undefined', 'delete', 'in', 'of', 'yield', 'class', 'interface', 'type', 'enum',
]);

/** Semua nama yang DIPANGGIL (bukan member-call) di sebuah teks kode. */
function namaPanggilan(teks) {
  const keluar = new Set();
  const re = /(?<![\w.$])([a-z][A-Za-z0-9_]{2,})\s*\(/g;
  let m;
  while ((m = re.exec(teks))) {
    if (!KATA_KUNCI.has(m[1])) keluar.add(m[1]);
  }
  /* Panggilan pada hasil impor dinamis: `(await import('../agentLsp'))
   * .lspDocumentSymbolsTool(p)` — titiknya membuat regex di atas menganggapnya
   * member-call biasa lalu membuangnya, padahal itu fungsi modul NYATA (biang
   * `lsp_*` tampak tanpa batas sistem). */
  const reDyn = /\)\s*\.\s*([a-z][A-Za-z0-9_]{2,})\s*\(/g;
  while ((m = reDyn.exec(teks))) {
    if (!KATA_KUNCI.has(m[1])) keluar.add(m[1]);
  }
  return [...keluar];
}

/* ===================================================================== */
/* Terapkan aturan + perluas ke helper                                   */
/* ===================================================================== */

export const PETA_FUNGSI = parseFungsi();

function jalankanAturan(teks) {
  const kena = [];
  for (const a of ATURAN) {
    if (!a.pola.some((re) => re.test(teks))) continue;
    if (a.wajib && !a.wajib.every((re) => re.test(teks))) continue;
    kena.push(a);
  }
  return kena;
}

/** Kumpulkan unit teks untuk sebuah tool: blok sendiri + badan helper (<=3 hop). */
function unitBukti(blok, runRef) {
  const unit = [{ sumber: `${blok.berkas}:${blok.baris}`, teks: blok.teks, berkas: blok.berkas, baris: blok.baris }];
  const dilihat = new Set();
  let antre = namaPanggilan(stripKomentar(blok.teks));
  /* Handler yang dirujuk langsung (`run: jalankanIngat`) tidak muncul sebagai
   * panggilan di blok, jadi disemai eksplisit di sini. */
  let refTeks = '';
  if (runRef) {
    if (!antre.includes(runRef)) antre = [runRef, ...antre];
    refTeks = `run: ${runRef}`;
  }
  let hop = 0;
  while (antre.length && hop < 3) {
    const berikut = [];
    for (const nama of antre) {
      if (dilihat.has(nama)) continue;
      dilihat.add(nama);
      /* Resolusi alias impor: `tambahMemori` -> `tambah` (aiMemori.ts). */
      const f = PETA_FUNGSI.get(nama) ?? PETA_FUNGSI.get(PETA_ALIAS.get(nama));
      if (!f) continue;
      unit.push({ sumber: `${f.berkas}:${f.baris}`, teks: f.teks, berkas: f.berkas, baris: f.baris });
      berikut.push(...f.panggil);
    }
    antre = berikut;
    hop++;
  }
  if (refTeks) unit.push({ sumber: `${blok.berkas}:${blok.baris}`, teks: refTeks, berkas: blok.berkas, baris: blok.baris });
  return unit;
}

/* --- sinyal "batas sistem": panggilan yang menyentuh backend/disk/DOM/store --- */
const BATAS = [
  /\bcmd\.[A-Za-z_]/,
  /\binvoke\s*\(/,
  /(?<![.\w])fetch\s*\(/,
  /* jembatan eksekusi tool nyata (agentTools.jalankanAgentTool) */
  /\bjalankanAgentTool\s*\(/,
  /useStore\.getState\(\)/,
  /useTerminal\.getState\(\)/,
  /useAi\.getState\(\)/,
  /* SEMUA store zustand (useLsp, useEditor, useSkill, ...) — `useLsp.getState()
   * .req(...)` di agentLsp.ts adalah batas sistem yang nyata. */
  /\buse[A-Z][A-Za-z]*\.getState\(\)/,
  /useSubAgent/,
  /\bdocument\./,
  /navigator\.clipboard/,
  /\bopenUrl\(/,
];

/* ===================================================================== */
/* Bangun inventaris                                                     */
/* ===================================================================== */

export async function buildInventory() {
  const cat = await bundel('src/lib/zephyrTools/catalog.ts');
  const gate = await bundel('src/lib/toolGate.ts');

  const katalog = cat.TOOL_CATALOG;
  const aktif = new Set(gate.TOOL_AKTIF_AWAL);
  const wajib = new Set(gate.TOOL_WAJIB);
  const selalu = new Set(cat.TOOL_DIKIRIM_SELALU);

  const blokTool = parseTool();
  const tools = [];

  for (const e of katalog) {
    const blokList = blokTool.get(e.name) ?? [];
    const cap = new Map(); // label -> [bukti...]
    const semuaTeks = [];

    for (const blok of blokList) {
      const rr = PETA_RUNREF.get(e.name);
      for (const u of unitBukti(blok, rr ? rr.ref : null)) {
        semuaTeks.push({ ...u, kode: stripKomentar(u.teks) });
      }
    }
    // aturan berbasis nama
    if (ATURAN_NAMA[e.name]) cap.set(ATURAN_NAMA[e.name], [{ sumber: 'aturan-nama', potongan: e.name }]);

    for (const u of semuaTeks) {
      for (const a of jalankanAturan(u.kode)) {
        // baris bukti: cari regex yang kena di teks asli unit
        let line = u.baris;
        let potongan = '';
        for (const re of a.pola) {
          const m = re.exec(u.teks);
          if (m) {
            line = u.baris + u.teks.slice(0, m.index).split('\n').length - 1;
            potongan = padat(u.teks.slice(m.index, m.index + 90));
            break;
          }
        }
        if (!cap.has(a.label)) cap.set(a.label, []);
        cap.get(a.label).push({ sumber: `${u.berkas}:${line}`, potongan });
      }
    }

    const kodeGabung = semuaTeks.map((u) => u.kode).join('\n');
    const adaBatas = BATAS.some((re) => re.test(kodeGabung));

    /* "Klaim sukses": handler mengembalikan kalimat yang mengaku pekerjaannya
     * selesai/berhasil/dicatat. Kalimat seperti itu pada tool TANPA batas sistem
     * dan TANPA kapabilitas = stub "sukses palsu" (lihat deteksi-duplikat). */
    const KLAIM = /\b(?:selesai|sukses|berhasil|dipasang|terpasang|dimuat|dibuat|dibuka|tersimpan|dihapus|aktif|terkirim|siap|dicatat|dijalankan|diproses|diterapkan|disimpan)\b/i;
    const klaimSukses = [];
    for (const u of semuaTeks) {
      const barisUnit = u.kode.split('\n');
      for (let n = 0; n < barisUnit.length; n++) {
        const m = KLAIM.exec(barisUnit[n]);
        if (!m) continue;
        klaimSukses.push({ sumber: `${u.berkas}:${u.baris + n}`, potongan: padat(barisUnit[n].trim(), 90) });
        if (klaimSukses.length >= 4) break;
      }
      if (klaimSukses.length >= 4) break;
    }

    /* Deteksi "implementasi sebagian": enum AKSI di spec vs cabang nyata di kode.
     * Hanya enum milik properti bernama action/aksi/op/ops/command — enum nilai
     * seperti `status: ['pending','completed']` BUKAN daftar aksi. */
    const enumAksi = [];
    for (const blok of blokList) {
      for (const m of blok.teks.matchAll(/(action|aksi|op|ops|command)\s*:\s*\{[^{}]*?enum:\s*\[([^\]]*)\]/g)) {
        for (const x of m[2].matchAll(/'([^']+)'/g)) enumAksi.push(x[1]);
      }
    }
    const enumUnik = [...new Set(enumAksi)];
    /* Kalau variabel aksi DITERUSKAN ke backend (`action: op` di dalam
     * `cmd.memoryWrite({...})`), maka SEMUA nilai enum terlayani — backend yang
     * memutuskan. Menandainya "implementasi sebagian" di situ akan salah. */
    const aksiDiteruskan = /\b(?:action|aksi|op|ops)\s*:\s*[A-Za-z_$][\w$]*/.test(kodeGabung);
    const terimplementasi = aksiDiteruskan
      ? [...enumUnik]
      : enumUnik.filter((v) => {
          const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(
            `(?:===|!==|includes\\(|Set\\(\\[)[^\\n]*'${esc}'|'${esc}'[^\\n]*(?:===|!==)|case\\s*'${esc}'`,
          ).test(kodeGabung);
        });

    tools.push({
      name: e.name,
      bare: e.bare,
      source: e.source,
      group: e.group,
      effect: e.effect,
      needsApproval: e.needsApproval,
      aktifDefault: aktif.has(e.name),
      wajib: wajib.has(e.name),
      dikirimSelalu: selalu.has(e.name),
      description: e.description,
      handlers: blokList.map((b) => `${b.berkas}:${b.baris}`),
      capabilities: [...cap.keys()].sort(),
      bukti: Object.fromEntries([...cap.entries()].map(([k, v]) => [k, v])),
      adaBatasSistem: adaBatas,
      enumAksi: enumUnik,
      enumTerimplementasi: terimplementasi,
      klaimSukses: klaimSukses.map((k) => k.sumber),
      klaimBukti: klaimSukses,
      params: blokList.length ? parseParams(blokList[0].teks) : [],
      /* Sinyal operasi backend yang NYATA (dari kode): nama `cmd.*`, metode LSP,
       * nama invoke. Dua tool dengan kapabilitas sama tapi sinyal berbeda
       * BUKAN duplikat (mis. lsp_hover vs lsp_definition: keduanya
       * `kode:analisis`, tapi metodenya berbeda). */
      sinyal: [
        ...new Set(
          [
            ...[...kodeGabung.matchAll(/\bcmd\.([A-Za-z_]\w*)/g)].map((m) => `cmd.${m[1]}`),
            ...[...kodeGabung.matchAll(/'((?:textDocument|workspace|window)\/[A-Za-z]+)'/g)].map((m) => `lsp.${m[1]}`),
            ...[...kodeGabung.matchAll(/\binvoke\(\s*'([^']+)'/g)].map((m) => `invoke.${m[1]}`),
            /* Akses store nyata: `useProblems.getState().byFile` -> `store.useProblems.byFile`.
             * Perlu karena sebagian tool MEMBACA keadaan lewat store, bukan lewat
             * permintaan ke server (mis. lsp_diagnostics membaca diagnostics yang
             * di-PUSH server ke problemsStore; tidak ada request metodenya). */
            ...[...kodeGabung.matchAll(/\buse([A-Z][A-Za-z0-9_]*)\.getState\(\)(?:\.([A-Za-z_]\w*))?/g)].map(
              (m) => `store.use${m[1]}${m[2] ? `.${m[2]}` : ''}`,
            ),
            ...(/jalankanAgentTool\s*\(/.test(kodeGabung) ? ['jalankanAgentTool'] : []),
          ].sort(),
        ),
      ],
    });
  }

  const petaKapabilitas = {};
  for (const t of tools) {
    for (const c of t.capabilities) {
      (petaKapabilitas[c] ??= []).push(t.name);
    }
  }

  return {
    tools,
    total: tools.length,
    perSumber: { builtin: tools.filter((t) => t.source === 'builtin').length, mcp: tools.filter((t) => t.source === 'mcp').length, web: tools.filter((t) => t.source === 'web').length },
    jumlahKapabilitasUnik: Object.keys(petaKapabilitas).length,
    petaKapabilitas,
    duplikatHandler: tools.filter((t) => t.handlers.length > 1).map((t) => ({ name: t.name, handlers: t.handlers })),
  };
}

/* ===================================================================== */
/* Cetak (hanya bila dijalankan langsung)                                */
/* ===================================================================== */

function cetak(inv) {
  const L = (s = '') => console.log(s);
  L('# INVENTARIS TOOL ZEPHYR');
  L('sumber: src/lib/zephyrTools/catalog.ts (IMPOR esbuild+data-URL) + handler *.ts (parse teks)');
  L(`total tool: ${inv.total}  (builtin ${inv.perSumber.builtin} / mcp ${inv.perSumber.mcp} / web ${inv.perSumber.web})`);
  L(`kapabilitas unik: ${inv.jumlahKapabilitasUnik}`);
  L('');
  L('## TABEL TOOL');
  L('nama'.padEnd(30) + 'sumber'.padEnd(9) + 'efek'.padEnd(10) + 'aktif selalu wajib'.padEnd(20) + 'kapabilitas');
  for (const t of inv.tools) {
    const flag = `${t.aktifDefault ? 'Y' : '-'}     ${t.dikirimSelalu ? 'Y' : '-'}     ${t.wajib ? 'Y' : '-'}`;
    L(t.name.padEnd(30) + t.source.padEnd(9) + t.effect.padEnd(10) + flag.padEnd(20) + (t.capabilities.join(', ') || '(kosong)'));
  }
  L('');
  L('## PETA KAPABILITAS -> TOOL');
  const entri = Object.entries(inv.petaKapabilitas).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [k, v] of entri) {
    L(`- ${k} (${v.length}): ${v.join(', ')}`);
  }
  L('');
  if (inv.duplikatHandler.length) {
    L('## PERINGATAN: nama dengan >1 blok handler');
    for (const d of inv.duplikatHandler) L(`- ${d.name}: ${d.handlers.join(' , ')}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const inv = await buildInventory();
  if (MAU_JSON) console.log(JSON.stringify(inv, null, 2));
  else cetak(inv);
}
