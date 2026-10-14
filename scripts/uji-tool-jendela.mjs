#!/usr/bin/env node
/**
 * Harness: setiap panel dan setiap bagian Settings harus TERJANGKAU.
 *
 * ## Yang diperiksa
 *
 * Analisis statis berkas sumber, tanpa perlu menjalankan aplikasi. Alasannya:
 * pertanyaannya "apakah daftarnya lengkap", bukan "apakah pikselnya berubah" -
 * dan daftar yang bolong harus ketahuan di CI, bukan hanya saat ada aplikasi
 * hidup dengan panel yang kebetulan sedang terbuka.
 *
 *   1. Cakupan panel   : semua id di PANEL_TABS (panelStore.ts) ada di
 *                        KONTROL_PANEL (kendaliJendela.ts).
 *   2. Cakupan setelan : semua id di SECTION_ORDER DAN semua anggota tipe
 *                        SectionId ada di KONTROL_SETELAN.
 *   3. Keterjangkauan  : setiap id perintah yang dipakai peta benar-benar
 *                        terdaftar di commandRegistry.ts.
 *   4. Jalur ringkasan : bukaPanel() dan bukaSetelan() benar-benar memanggil
 *                        ringkasJendela() - jadi tidak ada aksi yang "diam".
 *   5. Permukaan tool  : tool MCP benar-benar memaparkan parameter/aksi yang
 *                        dipakai peta (panel, settings, action layout/tab).
 *   6. Tangkap layar   : laporan status tangkap layar ADA dan SINKRON dengan
 *                        perintah Rust yang benar-benar terdaftar di lib.rs.
 *   7. Keterjangkauan  : panel/setelan juga harus bisa DITEMUKAN lewat
 *                        tool_search (deskripsi + PADANAN_KATA) selama toolnya
 *                        tidak ikut dikirim setiap request.
 *
 * GAGAL (exit 1) kalau ada satu panel maupun satu bagian Settings yang tidak
 * terjangkau, kalau ada peta yang menunjuk id perintah yang tidak ada, atau
 * kalau jalur pencarian menuju tool itu putus.
 *
 * Jalankan: node scripts/uji-tool-jendela.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');

const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8');

const panelStore = baca('src/lib/panelStore.ts');
const settingsStore = baca('src/lib/settingsStore.ts');
const kendali = baca('src/lib/zephyrTools/kendaliJendela.ts');
const mcp = baca('src/lib/zephyrTools/mcp.ts');
const registry = baca('src/lib/commandRegistry.ts');

const gagal = [];
const skor = {};

/* ------------------------------------------------------------------ */
/* Pembantu ekstraksi                                                  */
/* ------------------------------------------------------------------ */

/** Isi sebuah `export const NAMA = { ... };` (sampai kurung tutup pertama). */
function objekBlok(teks, nama) {
  const i = teks.indexOf(`export const ${nama}`);
  if (i < 0) return null;
  const buka = teks.indexOf('{', i);
  const tutup = teks.indexOf('};', buka);
  if (buka < 0 || tutup < 0) return null;
  return teks.slice(buka + 1, tutup);
}

/**
 * Entri peta: `kunci: 'nilai'` ATAU `kunci: KONSTANTA`.
 *
 * Bentuk kedua nyata di berkas ini: banyak bagian Settings dibuka langsung oleh
 * `bukaSetelan()` (`PEMBUKA_STORE`) alih-alih lewat id perintah, jadi nilainya
 * bukan string literal. Nilai non-string dikembalikan sebagai `«NAMA»` supaya
 * pemanggil bisa membedakannya dari id perintah yang wajib ada di registry -
 * kalau keduanya disamakan, bagian setelan yang memang tidak punya id perintah
 * akan salah dilaporkan sebagai celah.
 */
function entriPeta(blok) {
  const out = {};
  if (!blok) return out;
  const re = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:'([^']*)'|([A-Za-z_$][\w$]*))/gm;
  for (const m of blok.matchAll(re)) out[m[1]] = m[2] !== undefined ? m[2] : `«${m[3]}»`;
  return out;
}

/** Semua id perintah `id: '<x>'` di commandRegistry.ts. */
function idPerintah(teks) {
  const set = new Set();
  for (const m of teks.matchAll(/^\s*id:\s*'([^']+)'/gm)) set.add(m[1]);
  return set;
}

/** Anggota union `export type SectionId = 'a' | 'b' | ...;` */
function anggotaUnion(teks, nama) {
  const m = teks.match(new RegExp(`export type ${nama}\\s*=\\s*([\\s\\S]*?);`));
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** Daftar id dari array `export const NAMA: X[] = ['a', 'b'];` */
function arrayId(teks, nama) {
  const m = teks.match(new RegExp(`export const ${nama}\\s*:[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/**
 * Badan sebuah fungsi `function NAMA(...) { ... }` (kurung seimbang).
 *
 * `{` pertama setelah nama BUKAN selalu awal badan: tipe parameter punya
 * kurung sendiri (`o: { leafId?: string; target?: string } = {}`). Kalau itu
 * yang diambil, pemindaian berhenti di `}` tipe dan badan aslinya tidak pernah
 * diperiksa - celah yang lolos. Jadi kurung tutup pasangannya dicari dulu.
 */
function badanFungsi(teks, nama) {
  const i = teks.indexOf(`function ${nama}(`);
  if (i < 0) return '';
  const bukaParen = teks.indexOf('(', i);
  let dalamParen = 0;
  let tutupParen = -1;
  for (let k = bukaParen; k < teks.length; k++) {
    if (teks[k] === '(') dalamParen++;
    else if (teks[k] === ')') {
      dalamParen--;
      if (dalamParen === 0) {
        tutupParen = k;
        break;
      }
    }
  }
  if (tutupParen < 0) return '';
  /* Dari `)` ke awal badan: opsional anotasi tipe tanpa kurung, lalu `{`. */
  const sisa = teks.slice(tutupParen + 1);
  const m = sisa.match(/^\s*(?::[^{}]*?)?\{/);
  const j = m ? tutupParen + 1 + m[0].lastIndexOf('{') : teks.indexOf('{', tutupParen + 1);
  if (j < 0) return '';
  let dalam = 0;
  for (let k = j; k < teks.length; k++) {
    if (teks[k] === '{') dalam++;
    else if (teks[k] === '}') {
      dalam--;
      if (dalam === 0) return teks.slice(j, k + 1);
    }
  }
  return teks.slice(j);
}

/* ------------------------------------------------------------------ */
/* 1-2. Sumber kebenaran: panel & setelan                              */
/* ------------------------------------------------------------------ */

/*
 * PANEL_TABS adalah array OBJEK ({ id, label, command }), bukan array string,
 * jadi id-nya diambil dari properti `id`. Union `PanelTabId` ikut dibaca: kalau
 * ada anggota union yang tidak muncul di PANEL_TABS, deep link ke sana tetap
 * harus terjangkau - kalau tidak, ia gagal tanpa suara.
 */
const panelDariTabs = (() => {
  const m = panelStore.match(/export const PANEL_TABS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!m) return [];
  return [...m[1].matchAll(/id:\s*'([^']+)'/g)].map((x) => x[1]);
})();
const panelDariTipe = anggotaUnion(panelStore, 'PanelTabId');
const semuaPanel = [...new Set([...panelDariTabs, ...panelDariTipe])];

const sectionOrder = arrayId(settingsStore, 'SECTION_ORDER');
const sectionTipe = anggotaUnion(settingsStore, 'SectionId');
const semuaSection = [...new Set([...sectionOrder, ...sectionTipe])];

const petaPanel = entriPeta(objekBlok(kendali, 'KONTROL_PANEL'));
const petaSetelan = entriPeta(objekBlok(kendali, 'KONTROL_SETELAN'));

skor.panel = semuaPanel.length;
skor.sectionOrder = sectionOrder.length;
skor.sectionTipe = sectionTipe.length;

if (semuaPanel.length === 0) gagal.push('tidak ada panel terbaca dari panelStore.ts (PANEL_TABS / PanelTabId)');
if (sectionOrder.length === 0) gagal.push('SECTION_ORDER tidak terbaca dari settingsStore.ts');
if (sectionTipe.length === 0) gagal.push('union SectionId tidak terbaca dari settingsStore.ts');
if (Object.keys(petaPanel).length === 0) gagal.push('KONTROL_PANEL tidak terbaca dari kendaliJendela.ts');
if (Object.keys(petaSetelan).length === 0) gagal.push('KONTROL_SETELAN tidak terbaca dari kendaliJendela.ts');

const panelTakTerjangkau = semuaPanel.filter((id) => !(id in petaPanel));
const sectionTakTerjangkau = semuaSection.filter((id) => !(id in petaSetelan));

skor.panelTerjangkau = semuaPanel.length - panelTakTerjangkau.length;
skor.sectionTerjangkau = semuaSection.length - sectionTakTerjangkau.length;

if (panelTakTerjangkau.length > 0) {
  gagal.push(`panel tidak terjangkau (${panelTakTerjangkau.length}): ${panelTakTerjangkau.join(', ')}`);
}
if (sectionTakTerjangkau.length > 0) {
  gagal.push(`bagian setelan tidak terjangkau (${sectionTakTerjangkau.length}): ${sectionTakTerjangkau.join(', ')}`);
}

/* ------------------------------------------------------------------ */
/* 3. Keterjangkauan: setiap id perintah peta ada di registry           */
/* ------------------------------------------------------------------ */

const adaPerintah = idPerintah(registry);
skor.idPerintah = adaPerintah.size;

const dipakai = [
  ...Object.entries(petaPanel).map(([k, v]) => [`panel:${k}`, v]),
  ...Object.entries(petaSetelan).map(([k, v]) => [`setelan:${k}`, v]),
].filter(([, v]) => !v.startsWith('«')); /* «PEMBUKA_STORE» dibuka langsung, bukan id perintah */

const perintahHilang = dipakai
  .filter(([, id]) => !adaPerintah.has(id))
  .map(([asal, id]) => `${asal} -> ${id}`);
if (perintahHilang.length > 0) {
  gagal.push(
    `peta menunjuk id perintah yang tidak ada di commandRegistry (${perintahHilang.length}): ${perintahHilang.join('; ')}`,
  );
}
skor.perintahDiperiksa = dipakai.length;

if (!/export function findCommand\(/.test(registry)) gagal.push('findCommand tidak diekspor commandRegistry.ts');
if (!/export async function runCommand\(/.test(registry)) gagal.push('runCommand tidak diekspor commandRegistry.ts');

/* ------------------------------------------------------------------ */
/* 4. Jalur ringkasan keadaan                                          */
/* ------------------------------------------------------------------ */

const tanpaLaporan = [];
let fungsiBerlapor = 0;
for (const nama of ['bukaPanel', 'bukaSetelan', 'aksiPane']) {
  const badan = badanFungsi(kendali, nama);
  if (!badan) {
    tanpaLaporan.push(`${nama} tidak ada di kendaliJendela.ts`);
    continue;
  }
  if (!badan.includes('ringkasJendela(')) {
    tanpaLaporan.push(`${nama}() tidak memanggil ringkasJendela() - aksinya tanpa laporan keadaan`);
    continue;
  }
  /*
   * Bentuk `const nilai = ringkasJendela()` lalu dipakai `${nilai}` juga sah.
   * Yang diperiksa bukan "ada panggilan di suatu tempat" - itu terlalu longgar:
   * satu cabang return yang lupa berarti satu aksi yang dijawab tanpa bukti
   * keadaan, dan itulah yang harus ketahuan. Jadi SETIAP cabang `return `...``
   * wajib memuat ringkasan (langsung atau lewat variabel di atas).
   */
  const varian = [...badan.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*ringkasJendela\(\)/g)].map((m) => m[1]);
  /*
   * Dipotong sampai `` `; `` (akhir pernyataan), bukan sampai backtick pertama:
   * template bersarang di dalam `${...}` (mis. `${paneId ? ` pane ${paneId}` : ''}`)
   * membuat pencocokan malas berhenti terlalu awal dan melaporkan cabang yang
   * sebenarnya sudah punya ringkasan.
   */
  const kembali = [...badan.matchAll(/return\s+`([\s\S]*?)`\s*;/g)];
  const kurang = kembali.filter((m) => {
    const isi = m[1];
    return !(isi.includes('ringkasJendela(') || varian.some((v) => isi.includes('${' + v + '}')));
  }).length;
  if (kurang > 0) {
    tanpaLaporan.push(
      `${nama}() punya ${kurang} cabang return tanpa ringkasan keadaan (dari ${kembali.length} cabang)`,
    );
    continue;
  }
  fungsiBerlapor++;
}
if (!badanFungsi(kendali, 'ringkasJendela')) tanpaLaporan.push('ringkasJendela() tidak ada');
if (tanpaLaporan.length > 0) gagal.push(...tanpaLaporan);
skor.jalurRingkasan = fungsiBerlapor;

/* ------------------------------------------------------------------ */
/* 5. Permukaan tool MCP                                               */
/* ------------------------------------------------------------------ */

const potong = (teks, penanda, n) => {
  const i = teks.indexOf(penanda);
  return i < 0 ? '' : teks.slice(i, i + n);
};
/*
 * Blok `run_command` dipotong sampai tool MCP BERIKUTNYA, bukan sampai jumlah
 * karakter tetap: badan tool ini tumbuh (param panel/settings/capture + dispatch
 * registry) dan potongan berukuran tetap pernah memotong tepat di tengah -
 * membuat cek "mendispatch ke commandRegistry" gagal padahal kodenya ada.
 * Batas berbasis penanda tidak bisa basi seperti itu.
 */
const blokTool = (teks, nama) => {
  const awal = teks.indexOf(`name: 'mcp__zephyr__${nama}'`);
  if (awal < 0) return '';
  const berikutnya = teks.indexOf("name: 'mcp__zephyr__", awal + 10);
  return teks.slice(awal, berikutnya < 0 ? undefined : berikutnya);
};
const blokRunCommand = blokTool(mcp, 'run_command');
const blokPane = blokTool(mcp, 'pane');
const blokInspect = potong(mcp, "name: 'mcp__zephyr__inspect'", 2000);

const permukaan = [];
if (!blokRunCommand) permukaan.push('tool run_command tidak ditemukan di mcp.ts');
else {
  if (!/panel:\s*\{/.test(blokRunCommand)) permukaan.push('run_command tidak punya parameter "panel"');
  if (!/settings:\s*\{/.test(blokRunCommand)) permukaan.push('run_command tidak punya parameter "settings"');
  if (!blokRunCommand.includes('bukaPanel(')) permukaan.push('run_command tidak memanggil bukaPanel()');
  if (!blokRunCommand.includes('bukaSetelan(')) permukaan.push('run_command tidak memanggil bukaSetelan()');
  if (!blokRunCommand.includes("await import('../commandRegistry')")) {
    permukaan.push('run_command tidak mendispatch ke commandRegistry');
  }
  if (!/capture:\s*\{/.test(blokRunCommand)) permukaan.push('run_command tidak punya parameter "capture"');
  if (!blokRunCommand.includes('tangkapJendela(')) permukaan.push('run_command tidak memanggil tangkapJendela()');
}

if (!blokPane) permukaan.push('tool pane tidak ditemukan di mcp.ts');
else {
  for (const aksi of ['rotate', 'split', 'grid', 'tab', 'nextTab', 'prevTab', 'focus']) {
    if (!blokPane.includes(`'${aksi}'`)) permukaan.push(`pane tidak memaparkan aksi "${aksi}"`);
  }
  if (!blokPane.includes('aksiPane(')) {
    permukaan.push('pane tidak memakai aksiPane() (logika berbeda dari yang diuji)');
  }
}

if (!blokInspect.includes("'window'")) permukaan.push("inspect tidak memaparkan kategori 'window'");
if (!blokInspect.includes('daftarPanel()')) permukaan.push('inspect/what=window tidak memakai daftarPanel()');
if (!blokInspect.includes('daftarSetelan()')) permukaan.push('inspect/what=window tidak memakai daftarSetelan()');

const JUMLAH_PERMUKAAN = 15;
if (permukaan.length > 0) gagal.push(...permukaan);
skor.cekPermukaan = JUMLAH_PERMUKAAN - permukaan.length;

/* ------------------------------------------------------------------ */
/* 6. Tangkap layar                                                    */
/* ------------------------------------------------------------------ */

const tangkap = [];
if (!/export const TANGKAP_LAYAR_TERSEDIA/.test(kendali)) {
  tangkap.push('bendera TANGKAP_LAYAR_TERSEDIA tidak ada di kendaliJendela.ts');
}
if (!/export function laporanTangkapLayar\(/.test(kendali)) {
  tangkap.push('laporanTangkapLayar() tidak ada - status tangkap layar tidak bisa dilaporkan');
}
if (!/export const DOK_TANGKAP_LAYAR/.test(kendali)) {
  tangkap.push('DOK_TANGKAP_LAYAR tidak ada - rancangan Tauri tidak ditunjuk dari kode');
}
/*
 * Pembungkus TS dan perintah Rust-nya harus memakai nama yang SAMA. Kalau
 * salah satu diganti diam-diam, invoke akan ditolak sebagai "command not found"
 * dan gejalanya persis seperti "tangkap layar gagal" - bukan seperti salah nama.
 */
const commandsTs = baca('src/lib/commands.ts');
const namaDiCommands = (/export const NAMA_PERINTAH_TANGKAP = '([^']+)'/.exec(commandsTs) ?? [])[1] ?? '';
if (!namaDiCommands) tangkap.push('NAMA_PERINTAH_TANGKAP tidak ada di commands.ts - sisi TS perintah tangkap layar hilang');
else if (!commandsTs.includes('invoke<HasilTangkapLayar>(NAMA_PERINTAH_TANGKAP')) {
  tangkap.push('captureWindow() tidak memakai NAMA_PERINTAH_TANGKAP untuk invoke');
}
const badanTangkap = badanFungsi(kendali, 'tangkapJendela') ?? '';
if (!/export (?:async )?function tangkapJendela\(/.test(kendali)) {
  tangkap.push('tangkapJendela() tidak ada - aksi tangkap layar tidak punya jalur laporan');
}
if (!badanTangkap.includes('!TANGKAP_LAYAR_TERSEDIA')) {
  tangkap.push('tangkapJendela() tidak menjaga bendera TANGKAP_LAYAR_TERSEDIA sebelum invoke');
}
if (!badanTangkap.includes('ringkasJendela()')) {
  tangkap.push('tangkapJendela() tidak mengembalikan ringkasan keadaan');
}
if (!badanTangkap.includes('laporanTangkapLayar()')) {
  tangkap.push('tangkapJendela() tidak melaporkan keadaan saat belum didukung');
}
const tauriRs = (() => {
  try {
    return readFileSync(join(AKAR, 'src-tauri/src/lib.rs'), 'utf8');
  } catch {
    return '';
  }
})();
/*
 * Periksa laporan terhadap Rust, bukan hanya terhadap komentar kode: kalau
 * suatu hari `window_capture` benar-benar didaftarkan sementara bendera masih
 * `false`, laporan Zeph akan berbohong ("belum didukung") dan harness ini yang
 * harus menangkapnya lebih dulu.
 */
const rustPunyaTangkap = /window_capture|screen_capture/.test(tauriRs);
const benderaMenyala = /export const TANGKAP_LAYAR_TERSEDIA = true/.test(kendali);
if (rustPunyaTangkap !== benderaMenyala) {
  tangkap.push(
    `tidak sinkron: perintah Rust penangkap layar ${rustPunyaTangkap ? 'ADA' : 'tidak ada'} ` +
      `tetapi TANGKAP_LAYAR_TERSEDIA = ${benderaMenyala}`,
  );
}
/*
 * Begitu perintah Rust-nya benar-benar didaftarkan, namanya harus sama dengan
 * yang di-invoke sisi TS. Dua nama berbeda = tombol dan tool yang gagal
 * diam-diam, dan itu tidak akan terlihat sampai ada yang menekannya.
 */
if (rustPunyaTangkap && namaDiCommands && !tauriRs.includes(namaDiCommands)) {
  tangkap.push(`perintah Rust terdaftar dengan nama lain daripada "${namaDiCommands}" (commands.ts)`);
}
if (tangkap.length > 0) gagal.push(...tangkap);
const JUMLAH_TANGKAP = 10;
skor.cekTangkap = JUMLAH_TANGKAP - tangkap.length;

/* ------------------------------------------------------------------ */
/* 7. Keterjangkauan lewat pencarian (tool_search)                      */
/* ------------------------------------------------------------------ */

/*
 * Sebuah tool yang benar-benar ada tapi tidak bisa DITEMUKAN sama saja dengan
 * tidak ada. `tool_search` mencocokkan kata query ke nama + deskripsi tool
 * (lihat `cariToolTerdefer` di zephyrTools/builtins.ts) dan menolong kata
 * Indonesia lewat peta `PADANAN_KATA`. Jalur ini diuji statis di sini: kalau
 * suatu hari `run_command`/`pane` dilepas dari daftar yang dikirim setiap
 * request tanpa kata kuncinya dipetakan, Zeph kehilangan kemampuan memunculkan
 * panel - tanpa satu pun error, dan tanpa ada yang tahu.
 */
const cari = [];
const catalogTs = baca('src/lib/zephyrTools/catalog.ts');
const builtinsTs = baca('src/lib/zephyrTools/builtins.ts');
const dikirimSelalu = (() => {
  const i = catalogTs.indexOf('TOOL_DIKIRIM_SELALU');
  const j = i < 0 ? -1 : catalogTs.indexOf('] as const', i);
  if (i < 0 || j < 0) return [];
  return [...catalogTs.slice(i, j).matchAll(/'([^']+)'/g)].map((m) => m[1]);
})();
const petaPadanan = (() => {
  const i = builtinsTs.indexOf('const PADANAN_KATA');
  const j = i < 0 ? -1 : builtinsTs.indexOf(']);', i);
  if (i < 0 || j < 0) return new Map();
  const blok = builtinsTs.slice(i, j);
  return new Map(
    [...blok.matchAll(/\['([a-z]+)',\s*\[([^\]]*)\]/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    ]),
  );
})();

/* (kata Indonesia yang dipakai user, kata Inggris di deskripsi tool) */
const PASANGAN_KATA = [
  ['setelan', 'settings'],
  ['pengaturan', 'settings'],
  ['jendela', 'window'],
];
const deskripsiRunCommand = (/description\s*:\s*\n?\s*'([^']+)'/.exec(blokRunCommand) ?? [])[1] ?? '';
const deskripsiPane = (/description\s*:\s*\n?\s*'([^']+)'/.exec(blokPane) ?? [])[1] ?? '';

for (const [kataId, kataEn] of PASANGAN_KATA) {
  const padanan = petaPadanan.get(kataId);
  if (!padanan) {
    cari.push(
      `PADANAN_KATA tidak memetakan "${kataId}" -> "${kataEn}" - query berbahasa Indonesia tidak akan menemukan toolnya`,
    );
    continue;
  }
  if (!padanan.some((p) => deskripsiRunCommand.toLowerCase().includes(p))) {
    cari.push(
      `PADANAN_KATA["${kataId}"] -> [${padanan.join(', ')}] tidak ada di deskripsi run_command ` +
        `("${deskripsiRunCommand.slice(0, 60)}...") - pencarian "buka ${kataId}" gagal`,
    );
  }
}
if (!deskripsiRunCommand.toLowerCase().includes('panel')) {
  cari.push('deskripsi run_command tidak menyebut "panel" - tidak ketemu oleh tool_search');
}
if (!deskripsiRunCommand.toLowerCase().includes('window')) {
  cari.push('deskripsi run_command tidak menyebut "window" - laporan keadaan jendela tak terbaca dari pencarian');
}
if (!deskripsiPane.toLowerCase().includes('tab')) {
  cari.push('deskripsi pane tidak menyebut "tab" - "ganti tab" tidak akan menemukan tool pane');
}
if (cari.length > 0) gagal.push(...cari);
const JUMLAH_CARI = 6;
skor.cekCari = JUMLAH_CARI - cari.length;
skor.toolWajibCari = ['mcp__zephyr__run_command', 'mcp__zephyr__pane'].filter(
  (n) => !dikirimSelalu.includes(n),
).length;
if (skor.toolWajibCari > 0 && permukaan.length === 0 && !builtinsTs.includes('const PADANAN_KATA')) {
  gagal.push('peta padanan kata hilang - jalan satu-satunya ke kendali jendela putus');
}

/* ------------------------------------------------------------------ */
/* Laporan                                                             */
/* ------------------------------------------------------------------ */

console.log('== Uji kendali jendela: panel / setelan / pane / tangkap layar ==');
console.log(`panel resmi (PANEL_TABS + PanelTabId) : ${skor.panel}`);
console.log(`panel terjangkau                     : ${skor.panelTerjangkau}/${skor.panel}`);
console.log(`bagian resmi (SECTION_ORDER + tipe)  : ${semuaSection.length} (order ${skor.sectionOrder}, tipe ${skor.sectionTipe})`);
console.log(`bagian terjangkau                    : ${skor.sectionTerjangkau}/${semuaSection.length}`);
console.log(`id perintah di commandRegistry       : ${skor.idPerintah}`);
console.log(`id perintah dipetakan & dicek        : ${skor.perintahDiperiksa}`);
console.log(`aksi dengan jalur ringkasan          : ${skor.jalurRingkasan}/3 (bukaPanel, bukaSetelan, aksiPane)`);
console.log(`cek permukaan tool MCP               : ${skor.cekPermukaan}/${JUMLAH_PERMUKAAN}`);
console.log(`cek laporan tangkap layar            : ${skor.cekTangkap}/${JUMLAH_TANGKAP}`);
console.log(`cek keterjangkauan pencarian         : ${skor.cekCari}/${JUMLAH_CARI}`);
console.log(`tool jendela yang harus dicari       : ${skor.toolWajibCari} (0 = ikut dikirim setiap request)`);
console.log('');

if (gagal.length === 0) {
  console.log(
    `LULUS: ${semuaPanel.length + semuaSection.length} panel+bagian setelan terjangkau ` +
      `(${semuaPanel.length} panel + ${semuaSection.length} setelan), 0 celah.`,
  );
  process.exit(0);
}

console.log(`GAGAL: ${gagal.length} masalah.`);
for (const g of gagal) console.log(`  - ${g}`);
process.exit(1);
