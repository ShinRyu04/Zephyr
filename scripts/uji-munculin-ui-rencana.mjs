#!/usr/bin/env node
/**
 * uji-munculin-ui-rencana.mjs — harness bukti "munculin UI" (item ZEPH-MUNCULIN-UI).
 *
 * Yang dibuktikan: daftar aksi yang BOLEH dipanggil model untuk MEMUNCULKAN UI
 * (membuka panel, membuka bagian Settings, mengatur pane terminal) adalah
 * himpunan TERTUTUP yang setiap anggotanya punya pemetaan nyata ke perintah /
 * store yang benar-benar ada — dan himpunan itu TIDAK memuat terminal bebas,
 * hapus berkas, atau aksi browser otomatis.
 *
 * ## Kenapa analisis statis, bukan impor modul
 *
 * `kendaliJendela.ts` mengimpor Zustand + lima store (butuh app hidup), jadi ia
 * TIDAK bisa diimpor di node. Yang diperiksa di sini bukan "apakah pikselnya
 * berubah" (itu BUTUH APP), melainkan "apakah daftarnya lengkap, tertutup, dan
 * tiap anggotanya benar-benar terhubung". Pertanyaan itu dijawab dengan membaca
 * BERKAS SUMBERNYA dan memeriksa pemetaannya — sama seperti
 * `scripts/uji-tool-jendela.mjs`, dan atas alasan yang sama: daftar yang bolong
 * harus ketahuan tanpa perlu ada jendela yang kebetulan terbuka.
 *
 * Setiap peta KONTROL_PANEL / KONTROL_SETELAN / AKSI_PANE dibaca dari teks
 * sumber (bukan disalin tangan), lalu diuji terhadap PANEL_TABS, union
 * PanelTabId/SectionId, dan id perintah di commandRegistry.ts. Nomor baris
 * penjaga (guard) dicetak sebagai bukti bahwa aturan tolak yang diuji memang
 * berasal dari berkas itu.
 *
 * Jalan: node scripts/uji-munculin-ui-rencana.mjs   (keluar 0 kalau semua lulus)
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

/* ------------------------------------------------------------------ */
/* pelaporan                                                           */
/* ------------------------------------------------------------------ */
let lulus = 0;
const gagal = [];
function cek(id, nama, kondisi, detail) {
  if (kondisi) {
    lulus++;
    console.log(`PASS  ${id.padEnd(4)} ${nama.padEnd(52)} ${detail}`);
  } else {
    gagal.push(`${id} ${nama}: ${detail}`);
    console.log(`FAIL  ${id.padEnd(4)} ${nama.padEnd(52)} ${detail}`);
  }
}

/* ------------------------------------------------------------------ */
/* pembantu ekstraksi sumber                                           */
/* ------------------------------------------------------------------ */

/** Isi sebuah `export const NAMA = { ... };` (sampai `};` pertama). */
function objekBlok(teks, nama) {
  const i = teks.indexOf(`export const ${nama}`);
  if (i < 0) return null;
  const buka = teks.indexOf('{', i);
  const tutup = teks.indexOf('};', buka);
  if (buka < 0 || tutup < 0) return null;
  return teks.slice(buka + 1, tutup);
}

/**
 * Entri peta `kunci: 'nilai'` ATAU `kunci: KONSTANTA`.
 * Nilai non-string dikembalikan sebagai `«NAMA»` supaya pemanggil bisa
 * membedakan id perintah (wajib ada di registry) dari pembuka store.
 */
function entriPeta(blok) {
  const out = {};
  if (!blok) return out;
  const re = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:'([^']*)'|([A-Za-z_$][\w$]*))/gm;
  for (const m of blok.matchAll(re)) out[m[1]] = m[2] !== undefined ? m[2] : `«${m[3]}»`;
  return out;
}

/** Anggota union `export type NAMA = 'a' | 'b' | ...;` */
function anggotaUnion(teks, nama) {
  const m = teks.match(new RegExp(`export type ${nama}\\s*=\\s*([\\s\\S]*?);`));
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** Daftar string dari array `export const NAMA: X[] = ['a', 'b'];` */
function arrayString(teks, nama) {
  const m = teks.match(new RegExp(`export const ${nama}\\s*:[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*;`));
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** Semua id perintah `id: '<x>'` di commandRegistry.ts. */
function idPerintah(teks) {
  const set = new Set();
  for (const m of teks.matchAll(/^\s*id:\s*'([^']+)'/gm)) set.add(m[1]);
  return set;
}

/** Badan sebuah fungsi `function NAMA(...) { ... }` (kurung seimbang). */
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
  let j = teks.indexOf('{', tutupParen + 1);
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

/** Nomor baris (1-based) kemunculan pertama sebuah teks; -1 kalau tidak ada. */
function barisKe(teks, needle) {
  const i = teks.indexOf(needle);
  if (i < 0) return -1;
  return teks.slice(0, i).split('\n').length;
}

/** Blok spec tool MCP `name: 'mcp__zephyr__<nama>'` sampai tool berikutnya. */
function blokTool(teks, nama) {
  const awal = teks.indexOf(`name: 'mcp__zephyr__${nama}'`);
  if (awal < 0) return '';
  const berikutnya = teks.indexOf("name: 'mcp__zephyr__", awal + 10);
  return teks.slice(awal, berikutnya < 0 ? undefined : berikutnya);
}

/* ------------------------------------------------------------------ */
/* sumber kebenaran dari berkas                                        */
/* ------------------------------------------------------------------ */

/* Panel: PANEL_TABS (array objek) + union PanelTabId. */
const panelDariTabs = (() => {
  const m = panelStore.match(/export const PANEL_TABS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!m) return [];
  return [...m[1].matchAll(/id:\s*'([^']+)'/g)].map((x) => x[1]);
})();
const panelDariTipe = anggotaUnion(panelStore, 'PanelTabId');
const perintahDariTabs = (() => {
  const m = panelStore.match(/export const PANEL_TABS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!m) return {};
  const out = {};
  for (const row of m[1].matchAll(/id:\s*'([^']+)'[\s\S]*?command:\s*'([^']+)'/g)) out[row[1]] = row[2];
  return out;
})();

/* Setelan: union SectionId + SECTION_ORDER. */
const sectionTipe = anggotaUnion(settingsStore, 'SectionId');
const sectionOrder = arrayString(settingsStore, 'SECTION_ORDER');

/* Peta resmi dari kendaliJendela.ts. */
const petaPanel = entriPeta(objekBlok(kendali, 'KONTROL_PANEL'));
const petaSetelan = entriPeta(objekBlok(kendali, 'KONTROL_SETELAN'));
const aksiPaneSumber = arrayString(kendali, 'AKSI_PANE');

const adaPerintah = idPerintah(registry);

const samaSet = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  const hanyaA = a.filter((x) => !B.has(x));
  const hanyaB = b.filter((x) => !A.has(x));
  return { sama: hanyaA.length === 0 && hanyaB.length === 0 && A.size === B.size, hanyaA, hanyaB };
};

console.log('UJI MUNCULIN UI (daftar aksi tertutup, analisis statis)');
console.log(
  `      panel=${Object.keys(petaPanel).length} setelan=${Object.keys(petaSetelan).length} aksiPane=${aksiPaneSumber.length} idPerintah=${adaPerintah.size}`,
);
console.log(
  `      sumber: kendaliJendela.ts KONTROL_PANEL@${barisKe(kendali, 'export const KONTROL_PANEL')} ` +
    `KONTROL_SETELAN@${barisKe(kendali, 'export const KONTROL_SETELAN')} AKSI_PANE@${barisKe(kendali, 'export const AKSI_PANE')}`,
);
console.log('');

/* ------------------------------------------------------------------ */
/* 1. Keutuhan & cakupan himpunan (daftar harus lengkap & tidak bolong) */
/* ------------------------------------------------------------------ */

const keysPanel = Object.keys(petaPanel);
const keysSetelan = Object.keys(petaSetelan);

{
  const s = samaSet(keysPanel, panelDariTabs);
  cek(
    'U1',
    'KONTROL_PANEL == PANEL_TABS (panelStore)',
    s.sama && keysPanel.length === panelDariTabs.length,
    s.sama
      ? `${keysPanel.length} panel, sama persis`
      : `hanya di peta: ${s.hanyaA.join(',') || '-'}; hanya di PANEL_TABS: ${s.hanyaB.join(',') || '-'}`,
  );
}

{
  const beda = panelDariTabs.filter((id) => perintahDariTabs[id] && petaPanel[id] !== perintahDariTabs[id]);
  cek(
    'U2',
    'nilai KONTROL_PANEL == command PANEL_TABS',
    beda.length === 0 && panelDariTabs.length > 0,
    beda.length === 0
      ? `${panelDariTabs.length} perintah panel identik`
      : beda.map((id) => `${id}: peta=${petaPanel[id]} tabs=${perintahDariTabs[id]}`).join('; '),
  );
}

{
  const s = samaSet(keysPanel, panelDariTipe);
  cek(
    'U3',
    'KONTROL_PANEL == union PanelTabId',
    s.sama,
    s.sama ? `${keysPanel.length} anggota union terjangkau` : `selisih: ${[...s.hanyaA, ...s.hanyaB].join(',')}`,
  );
}

{
  const s = samaSet(keysSetelan, sectionTipe);
  cek(
    'U4',
    'KONTROL_SETELAN == union SectionId',
    s.sama,
    s.sama
      ? `${keysSetelan.length} bagian setelan terjangkau`
      : `hanya di peta: ${s.hanyaA.join(',') || '-'}; hanya di tipe: ${s.hanyaB.join(',') || '-'}`,
  );
}

/* ------------------------------------------------------------------ */
/* 2. Tiap aksi punya pemetaan nyata (diverifikasi ke berkas sumber)    */
/* ------------------------------------------------------------------ */

{
  const hilang = keysPanel.filter((k) => !adaPerintah.has(petaPanel[k]));
  cek(
    'U5',
    'tiap panel -> id perintah di commandRegistry',
    hilang.length === 0 && keysPanel.length > 0,
    hilang.length === 0
      ? keysPanel.map((k) => `${k}=${petaPanel[k]}`).join(' ')
      : hilang.map((k) => `${k}->${petaPanel[k]}`).join('; '),
  );
}

{
  const nilai = keysSetelan.map((k) => petaSetelan[k]).filter((v) => !v.startsWith('«'));
  const hilang = keysSetelan.filter((k) => !petaSetelan[k].startsWith('«') && !adaPerintah.has(petaSetelan[k]));
  cek(
    'U6',
    'tiap setelan ber-perintah -> id di commandRegistry',
    hilang.length === 0 && nilai.length > 0,
    hilang.length === 0
      ? `${nilai.length} id perintah setelan ada (${nilai.join(', ')}); sisanya lewat store`
      : hilang.map((k) => `${k}->${petaSetelan[k]}`).join('; '),
  );
}

{
  const storeDipakai = keysSetelan.filter((k) => petaSetelan[k] === '«PEMBUKA_STORE»');
  const okStore = /export const PEMBUKA_STORE = 'store'/.test(kendali) && storeDipakai.length > 0;
  cek(
    'U7',
    "PEMBUKA_STORE='store' dipakai utk bagian tanpa perintah palet",
    okStore,
    okStore
      ? `${storeDipakai.length} bagian lewat store (${storeDipakai.join(', ')})`
      : `PEMBUKA_STORE tidak bernilai 'store' atau tidak dipakai`,
  );
}

{
  const blokPane = blokTool(mcp, 'pane');
  const enumAksi = [...blokPane.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
  const enumKhas = enumAksi.filter((x) =>
    ['open', 'close', 'rotate', 'split', 'grid', 'group', 'consolidate', 'tab', 'nextTab', 'prevTab', 'focus'].includes(x),
  );
  const s = samaSet(aksiPaneSumber, enumKhas);
  cek(
    'U8',
    'AKSI_PANE == enum aksi tool pane (mcp.ts)',
    s.sama && aksiPaneSumber.length === 11,
    s.sama ? `${aksiPaneSumber.length} aksi pane identik` : `selisih: ${[...s.hanyaA, ...s.hanyaB].join(',')}`,
  );
}

/* ------------------------------------------------------------------ */
/* 3. Aturan tolak (mirror penjaga, dengan nomor baris sebagai bukti)   */
/* ------------------------------------------------------------------ */

/* Mirror `panelDikenal` (kendaliJendela.ts) - hasOwnProperty terhadap peta. */
function panelDikenal(id) {
  return Object.prototype.hasOwnProperty.call(petaPanel, id);
}
function setelanDikenal(id) {
  return Object.prototype.hasOwnProperty.call(petaSetelan, id);
}

{
  const bukaPanelBody = badanFungsi(kendali, 'bukaPanel');
  const panelDikenalBody = badanFungsi(kendali, 'panelDikenal');
  const penjaga =
    panelDikenalBody.includes('hasOwnProperty.call(KONTROL_PANEL') &&
    bukaPanelBody.includes('if (!panelDikenal(nama))') &&
    bukaPanelBody.includes('tidak dikenal');
  const tak = 'tidak-ada-panel-ini';
  const ditolak = !panelDikenal(tak);
  const pesan = `ERROR: panel "${tak}" tidak dikenal. Panel yang ada: ${keysPanel.join(', ')}.`;
  cek(
    'U9',
    'id panel tak dikenal DITOLAK (dengan daftar panel)',
    penjaga && ditolak,
    `penjaga sumber bukaPanel@${barisKe(kendali, 'if (!panelDikenal(nama))')}, panelDikenal@${barisKe(kendali, 'export function panelDikenal')}; "${tak}" ditolak=${ditolak}; pesan: ${pesan.slice(0, 58)}...`,
  );
}

{
  const bukaSetelanBody = badanFungsi(kendali, 'bukaSetelan');
  const setelanDikenalBody = badanFungsi(kendali, 'setelanDikenal');
  const penjaga =
    setelanDikenalBody.includes('hasOwnProperty.call(KONTROL_SETELAN') &&
    bukaSetelanBody.includes('if (!setelanDikenal(bagian))') &&
    bukaSetelanBody.includes('tidak dikenal');
  const tak = 'tidak-ada-bagian';
  const ditolak = !setelanDikenal(tak);
  cek(
    'U10',
    'bagian setelan tak dikenal DITOLAK',
    penjaga && ditolak,
    `penjaga sumber bukaSetelan@${barisKe(kendali, 'if (!setelanDikenal(bagian))')}, setelanDikenal@${barisKe(kendali, 'export function setelanDikenal')}; "${tak}" ditolak=${ditolak}`,
  );
}

/* Mirror penjaga argumen aksiPane (kendaliJendela.ts) - dua aksi wajib arg. */
function validasiAksiPane(action, o = {}) {
  const aksi = (action ?? '').trim();
  if (!aksiPaneSumber.includes(aksi)) return { ok: false, kode: 'aksi_tak_dikenal' };
  if (aksi === 'tab' && !((o.target ?? '').trim())) return { ok: false, kode: 'arg_wajib' };
  if (aksi === 'focus' && !((o.leafId ?? '').trim())) return { ok: false, kode: 'arg_wajib' };
  return { ok: true, kode: 'ok' };
}

{
  const body = badanFungsi(kendali, 'aksiPane');
  const penjaga =
    body.includes('aksi "tab" butuh parameter target') &&
    body.includes('aksi "focus" butuh parameter leafId');
  const tabTanpaTarget = validasiAksiPane('tab', {});
  const focusTanpaLeaf = validasiAksiPane('focus', {});
  const tabDenganTarget = validasiAksiPane('tab', { target: 'next' });
  cek(
    'U11',
    'aksi pane tanpa argumen wajib DITOLAK (tab/focus)',
    penjaga && tabTanpaTarget.kode === 'arg_wajib' && focusTanpaLeaf.kode === 'arg_wajib' && tabDenganTarget.ok,
    `penjaga sumber "tab"@${barisKe(kendali, 'aksi "tab" butuh parameter target')}, "focus"@${barisKe(kendali, 'aksi "focus" butuh parameter leafId')}; tab{} -> ${tabTanpaTarget.kode}, focus{} -> ${focusTanpaLeaf.kode}, tab{target:next} -> ${tabDenganTarget.kode}`,
  );
}

{
  const body = badanFungsi(kendali, 'aksiPane');
  const penjaga = body.includes('aksi pane "${action}" tidak dikenal');
  const tak = validasiAksiPane('ledakkan', {});
  cek(
    'U12',
    'aksi pane tak dikenal DITOLAK',
    penjaga && tak.kode === 'aksi_tak_dikenal',
    `penjaga sumber@${barisKe(kendali, 'aksi pane "${action}" tidak dikenal')}; "ledakkan" -> ${tak.kode}`,
  );
}

/* ------------------------------------------------------------------ */
/* 4. Daftar yang dipaparkan: himpunan tertutup & bebas aksi berbahaya  */
/* ------------------------------------------------------------------ */

const daftarDipaparkan = [
  ...keysPanel.map((id) => ({ jenis: 'panel', id })),
  ...keysSetelan.map((id) => ({ jenis: 'setelan', id })),
  ...aksiPaneSumber.map((id) => ({ jenis: 'pane', id })),
];

/* Tool / perintah berbahaya yang ADA di repo, tetapi TIDAK boleh jadi bagian
   dari permukaan "munculin UI". Namanya diambil dari sumber NYATA:
   `mcp__zephyr__sh` (mcp.ts), `delete_file` (builtins.ts), `browser_open` /
   `open_preview` (builtins.ts), `browser_nav` (builtins.ts). */
const TERLARANG_PERSIS = [
  'sh',
  'shell',
  'exec',
  'spawn',
  'rm',
  'del',
  'delete',
  'delete_file',
  'unlink',
  'browser',
  'browser_open',
  'browser_nav',
  'open_preview',
  'eval',
  'http',
  'https',
  'cmd',
  'powershell',
  'bash',
  'sudo',
];
const BENTUK_PERINTAH = /[\/\\\s;&|$`<>]/;

{
  const samaPersis = daftarDipaparkan.filter((x) => TERLARANG_PERSIS.includes(x.id));
  const berbentukPerintah = daftarDipaparkan.filter((x) => BENTUK_PERINTAH.test(x.id));
  cek(
    'U13',
    'daftar dipaparkan BEBAS terminal bebas/hapus/browser',
    samaPersis.length === 0 && berbentukPerintah.length === 0,
    samaPersis.length === 0 && berbentukPerintah.length === 0
      ? `${daftarDipaparkan.length} token diperiksa; 0 berbahaya, 0 berbentuk perintah`
      : `berbahaya: ${samaPersis.map((x) => x.id).join(',')}; berbentuk perintah: ${berbentukPerintah.map((x) => x.id).join(',')}`,
  );
}

{
  const jumlah = daftarDipaparkan.length;
  const harap = keysPanel.length + keysSetelan.length + aksiPaneSumber.length;
  /* Tiap aksi punya pemetaan nyata: panel/setelan -> id perintah atau store;
     pane -> cabang di aksiPane. Diverifikasi ke sumber, bukan ditebak. */
  const panelAdaPerintah = keysPanel.every((k) => adaPerintah.has(petaPanel[k]));
  const setelanAdaPemetaan = keysSetelan.every(
    (k) => adaPerintah.has(petaSetelan[k]) || petaSetelan[k] === '«PEMBUKA_STORE»',
  );
  const bodyPane = badanFungsi(kendali, 'aksiPane');
  const paneAdaCabang = aksiPaneSumber.every((a) => bodyPane.includes(`'${a}'`));
  cek(
    'U14',
    'daftar tertutup (6+20+11) & tiap aksi ada pemetaan nyata',
    jumlah === harap &&
      keysPanel.length === 6 &&
      keysSetelan.length === 20 &&
      keysSetelan.length === sectionTipe.length &&
      panelAdaPerintah &&
      setelanAdaPemetaan &&
      paneAdaCabang,
    `${jumlah} aksi = ${keysPanel.length} panel + ${keysSetelan.length} setelan + ${aksiPaneSumber.length} pane; pemetaan nyata: panel=${panelAdaPerintah} setelan=${setelanAdaPemetaan} pane=${paneAdaCabang}`,
  );
}

/* ------------------------------------------------------------------ */
/* 5. Tiap aksi memaparkan keadaan NYATA sesudahnya (anti sukses palsu)  */
/* ------------------------------------------------------------------ */
{
  const perlu = [];
  for (const nama of ['bukaPanel', 'bukaSetelan', 'aksiPane']) {
    const body = badanFungsi(kendali, nama);
    if (!body.includes('ringkasJendela(')) perlu.push(nama);
  }
  cek(
    'U15',
    'bukaPanel/bukaSetelan/aksiPane melaporkan ringkasJendela()',
    perlu.length === 0,
    perlu.length === 0
      ? 'ketiganya memanggil ringkasJendela() - keadaan nyata, bukan klaim'
      : `tanpa laporan: ${perlu.join(', ')}`,
  );
}

/* ------------------------------------------------------------------ */
/* ringkasan                                                           */
/* ------------------------------------------------------------------ */
console.log('');
console.log(`ringkasan: ${lulus} lulus, ${gagal.length} gagal (${lulus + gagal.length} pemeriksaan)`);
if (gagal.length) {
  for (const g of gagal) console.log(`  - ${g}`);
  process.exit(1);
}
console.log('semua aksi munculin-UI tertutup, terpetakan, dan bebas aksi berbahaya');
process.exit(0);
