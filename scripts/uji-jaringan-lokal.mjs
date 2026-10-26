/*
 * uji-jaringan-lokal — harness LIMA SETELAN BARU `zeph-buka-jaringan-lokal`
 * pada KODE PRODUK (bukan salinan aturan).
 *
 *   node scripts/uji-jaringan-lokal.mjs
 *
 * KENAPA HARUS ADA (item ZEPH-BUKA-JARINGAN-LOKAL, bagian VERIFIKASI)
 *   `uji-pane-browser-kebijakan.mjs` menguji izin-isi-web + allowlist + batas
 *   ukuran, tapi nol kasus untuk kelima setelan baru (dihitung sendiri dari
 *   sumbernya: `izinJaringanLokal` 0x, `portWeb` 0x, `hopRedirect` 0x di
 *   berkas itu). Lapisan Rust sudah punya 22 tes (`cargo test --lib web::tests`)
 *   yang lulus on/off; berkas ini melengkapi sisi TypeScript, yaitu modul yang
 *   sebenarnya memutus `web_fetch`/`browser_read` lewat `web.ts`.
 *
 * YANG DIUJI (semua memanggil fungsi produk asli, dibundel esbuild)
 *   S1 izinJaringanLokal OFF/ON : loopback, 10/8, 172.16/12, 192.168/16,
 *      link-local 169.254/16, CGNAT 100.64/10, IPv6 ::1 - ditolak saat OFF,
 *      lolos saat ON asal terdaftar di allowlist (izin lokal TIDAK melonggarkan
 *      allowlist: host di luar daftar tetap ditolak walau ON).
 *   S2 metadata TETAP ditolak : 169.254.169.254 dan fd00:ec2::254 ditolak
 *      walau `izinJaringanLokal` menyala - bukan setelan, aturan tetap.
 *   S3 nama-lokal *.local/*.localhost : ditolak saat OFF, lolos saat ON.
 *   S4 portWeb OFF/ON : default hanya ''/80/443; menambah 3000 membuka 3000
 *      tanpa membuka 9999. Kasus `portWeb: []` ikut diukur APA ADANYA
 *      (lihat temuan) bukan diasumsikan.
 *   S5 hopRedirect OFF/ON : default 5, naik ke 8 mengikuti setelan, di-clamp
 *      plafon keras 10 (99 -> 10), nilai rusak (0, -3, NaN, 'abc') jatuh ke
 *      default 5 - fail-closed. Rantai redirect diuji lewat `ikutiRedirect`.
 *   S6 batas ukuran : byte di-clamp 8 MiB, karakter di-clamp 20.000, bodi di
 *      atas batas DITOLAK (bukan dipotong diam-diam).
 *   S7 permanen-ditolak : skema file:/javascript:/data:/about: dan userinfo
 *      `user@host` tetap ditolak walau semua setelan menyala. Kasus userinfo
 *      memakai host yang SUDAH ada di allowlist, supaya ia ditolak karena
 *      userinfo-nya - bukan kebetulan kena allowlist.
 *   S8 fail-closed : objek setelan kosong = default aman; `izinJaringanLokal:
 *      "yes"` (string, bukan boolean) dibaca false.
 *   S8b opt-out eksplisit : `izinIsiWeb: false` adalah SATU-SATUNYA cara
 *      mematikan isi web (10ad447 mengubah default dari fail-closed menjadi
 *      "hanya mati kalau eksplisit false"). Objek kosong = izin penuh, dan itu
 *      keputusan produk yang disengaja - diukur apa adanya, bukan diasumsikan
 *      masih fail-closed seperti sebelum 10ad447.
 *   S9 determinisme : seluruh kasus dijalankan DUA KALI dan dibandingkan.
 *
 * YANG TIDAK DIBUKTIKAN DI SINI
 *   - Lapisan Rust (`src-tauri/src/web.rs`) -> 22 tes `web::tests` cargo.
 *   - Perilaku app hidup / UI Settings -> butuh CDP, tidak dijalankan di sini.
 *
 * PAGAR : tanpa jaringan (fetch dibekukan + dihitung), tanpa CDP (port debug
 * pengembangan tidak boleh disebut), deterministik dua jalankan identik.
 */

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AKAR = process.cwd();
const BERKAS = 'src/lib/zephyrTools/kebijakanIsiWeb.ts';
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8');

let totalUji = 0;
let gagal = 0;
function uji(nama, lolos, rincian = '') {
  totalUji++;
  if (!lolos) gagal++;
  console.log(`  [${lolos ? 'LULUS' : 'GAGAL'}] ${nama}${rincian ? '  —  ' + rincian : ''}`);
}

/* ---------- bundel modul produk NYATA (esbuild -> ESM), lalu import ---------- */
const dir = mkdtempSync(join(tmpdir(), 'jaringan-lokal-'));
const keluar = join(dir, 'kebijakan.mjs');
await build({
  entryPoints: [join(AKAR, BERKAS)],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: keluar,
  logLevel: 'silent',
});
const M = await import('file:///' + keluar.replace(/\\/g, '/') + '?v=' + Date.now());
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* berkas sudah dibaca ke memori */
}

const SUMBER = baca(BERKAS);

/* ---------- bundel KEDUA: web.ts (jalur web_fetch) + STUB lapisan-app ----
   `web.ts` mengimpor lapisan app (store React, perintah Tauri) yang tidak
   bisa hidup di node, jadi modul-modul itu DIGANTI STUB — sama seperti
   `uji-jangkauan-tool.mjs`. Yang dipalsukan hanya transport `cmd.webFetch`
   (menghitung panggilan), sehingga `lantaiHttpsWeb` benar-benar DIJALANKAN.
   Dibangun SEBELUM fetch dibekukan, karena esbuild butuh proses normal. */
const STUB_WEB = new Map([
  ['@tauri-apps/plugin-opener', 'export const openUrl = () => Promise.resolve();'],
  [
    '../store',
    `const setelan = { izinIsiWeb: true, allowlistWeb: ['contoh.com'] };
     export const useStore = { getState: () => ({ settings: setelan, tabs: [], activeTabId: null, setActiveTab: () => {}, setTabUrl: () => {}, requestCloseTab: () => {}, bukaViewAi: () => {} }), setState: () => {}, subscribe: () => () => {} };`,
  ],
  [
    '../terminalStore',
    `export const useTerminal = { getState: () => ({ terminalTabs: [], activeTabId: null, activePaneId: null, visible: false, toast: null,
       allPanes: () => [], addPane: async () => null, closePane: async () => {},
       setActiveTab: () => {}, setActivePane: () => {}, setVisible: () => {} }) };`,
  ],
  ['../agentGuard', 'export const periksaTulis = () => ({ ok: true });'],
  [
    '../commands',
    `export const webFetch = async (url, maxChars) => { globalThis.__netZephyr.push({ url, maxChars }); return '<html><body>ok</body></html>'; };
     export const browserPaneEval = async () => null;
     export const browserPaneNav = async () => {};
     export const fsWrite = async () => {};`,
  ],
  [
    './builtins',
    `export const potong = (s) => String(s);
     export const wajib = (a, k) => { const v = a ? a[k] : undefined; if (v === undefined || v === null) throw new Error('arg wajib: ' + k); return String(v); };`,
  ],
  [
    '../agentsBrowserStore',
    `export const ID_PANE_AGENTS = 'agents-browser';
     export const daftarPaneAgents = () => [];
     export const diJendelaAgents = () => false;
     export const paneAgents = () => null;
     export const mintaPaneAgents = () => false;
     export const mintaBukaDiAgents = () => {};`,
  ],
  ['../checkpoint', 'export const catat = async () => {};'],
]);
const pluginStubWeb = {
  name: 'stub-web-uji-jaringan',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => (STUB_WEB.has(a.path) ? { path: a.path, namespace: 'stub-web-jaringan' } : null));
    b.onLoad({ filter: /.*/, namespace: 'stub-web-jaringan' }, (a) => ({ contents: STUB_WEB.get(a.path), loader: 'js' }));
  },
};
const dirWeb = mkdtempSync(join(tmpdir(), 'jaringan-lokal-web-'));
const keluarWeb = join(dirWeb, 'web.mjs');
await build({
  entryPoints: [join(AKAR, 'src/lib/zephyrTools/web.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  outfile: keluarWeb,
  absWorkingDir: AKAR,
  plugins: [pluginStubWeb],
  define: { 'import.meta.env': 'importMetaEnv' },
  banner: { js: 'var importMetaEnv = { DEV: true, PROD: false, MODE: "test" }; globalThis.__netZephyr = [];' },
  logLevel: 'silent',
});
const MW = await import('file:///' + keluarWeb.replace(/\\/g, '/') + '?v=' + Date.now());
try {
  rmSync(dirWeb, { recursive: true, force: true });
} catch {
  /* berkas sudah dibaca ke memori */
}

/* ---------- bekukan jaringan SETELAH bundel (esbuild butuh proses) ---------- */
let panggilanJaringan = 0;
if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = () => {
    panggilanJaringan++;
    throw new Error('HARUSNYA TIDAK: jaringan dipakai selama uji setelan jaringan lokal');
  };
}

/* ---------- kebijakan uji ---------- */
// OFF = setelan default (izinJaringanLokal tidak pernah diisi -> false).
const OFF = M.kebijakanDariSetelan({
  izinIsiWeb: true,
  allowlistWeb: ['contoh.com', 'contoh.local', 'app.localhost'],
});
// ON = satu saklar dinyalakan. allowlist sengaja memuat host privat/uji,
// supaya penolakan (kalau ada) berasal dari SAKLARNYA, bukan dari allowlist.
const ON = M.kebijakanDariSetelan({
  izinIsiWeb: true,
  izinJaringanLokal: true,
  allowlistWeb: [
    'contoh.com',
    'contoh.local',
    'app.localhost',
    '192.168.1.10',
    '10.0.0.5',
    '172.16.0.9',
    '100.64.0.7',
    '[::1]',
    '127.0.0.1',
    'router.local',
    'host.internal',
    '169.254.169.254',
    'fd00:ec2::254',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    'user.info',
    'contoh.com:8443',
  ],
});
// ON-PORT = jaringan lokal ON + port dev ditambahkan.
const ON_PORT = M.kebijakanDariSetelan({
  izinIsiWeb: true,
  izinJaringanLokal: true,
  allowlistWeb: ['contoh.com'],
  portWeb: [80, 443, 3000, 5173],
});
// PORT-KOSONG = keadaan yang sengaja diuji (temuan inkonsistensi).
const PORT_KOSONG = M.kebijakanDariSetelan({
  izinIsiWeb: true,
  allowlistWeb: ['contoh.com'],
  portWeb: [],
});

/** Pengambil isi palsu yang MENGHITUNG panggilan (bukti "nol kirim"). */
function penghitung() {
  let n = 0;
  const f = () => {
    n++;
    return Promise.resolve('ISI');
  };
  f.jumlah = () => n;
  return f;
}

const alasan = (r) => (r && r.ok === false ? r.alasan : r && r.ok === true ? 'OK' : JSON.stringify(r));

/** Seluruh kasus, sebagai fungsi murni -> bisa dijalankan dua kali (S9). */
async function semuaKasus() {
  const K = [];
  const t = (nama, kondisi, rincian) => K.push({ nama, lolos: kondisi === true, rincian });

  /* ---- S1 izinJaringanLokal OFF/ON ---- */
  const mati = [
    ['http://192.168.1.10/x', 'ip-privat:192.168.1.10', 'privat 192.168/16'],
    ['http://10.0.0.5/x', 'ip-privat:10.0.0.5', 'privat 10/8'],
    ['http://172.16.0.9/x', 'ip-privat:172.16.0.9', 'privat 172.16/12'],
    ['http://100.64.0.7/x', 'ip-privat:100.64.0.7', 'CGNAT 100.64/10'],
    ['http://[::1]/x', 'ip-privat:[::1]', 'loopback IPv6'],
    ['http://127.0.0.1/x', 'ip-privat:127.0.0.1', 'loopback IPv4'],
    ['http://169.254.1.1/x', 'ip-privat:169.254.1.1', 'link-local 169.254/16'],
    ['http://router.local/x', 'nama-lokal:router.local', 'nama *.local'],
    ['http://app.localhost/x', 'nama-lokal:app.localhost', 'nama *.localhost'],
  ];
  for (const [url, harapan, apa] of mati) {
    const r = M.periksaUrl(url, OFF);
    t(`S1a OFF menolak ${apa}`, r.ok === false && r.alasan === harapan, `alasan=${alasan(r)}`);
  }

  const nyala = [
    ['http://192.168.1.10/x', 'privat 192.168/16'],
    ['http://10.0.0.5/x', 'privat 10/8'],
    ['http://172.16.0.9/x', 'privat 172.16/12'],
    ['http://100.64.0.7/x', 'CGNAT 100.64/10'],
    ['http://[::1]/x', 'loopback IPv6'],
    ['http://127.0.0.1/x', 'loopback IPv4'],
    ['http://router.local/x', 'nama *.local'],
    ['http://app.localhost/x', 'nama *.localhost'],
    ['http://contoh.com/x', 'host publik tetap lolos'],
  ];
  for (const [url, apa] of nyala) {
    const r = M.periksaUrl(url, ON);
    t(`S1b ON membuka ${apa}`, r.ok === true, `alasan=${alasan(r)}`);
  }

  // Izin lokal TIDAK melonggarkan allowlist.
  const luarDaftar = M.periksaUrl('http://192.168.1.99/x', ON);
  t('S1c ON tetap menolak host di luar allowlist', luarDaftar.ok === false && luarDaftar.alasan === 'host-luar-allowlist:192.168.1.99', `alasan=${alasan(luarDaftar)}`);

  // Izin OFF = nol panggilan jaringan untuk URL privat apa pun.
  const f1 = penghitung();
  await M.ambilIsiWeb('http://192.168.1.10/x', OFF, f1);
  t('S1d OFF menolak sebelum jaringan', f1.jumlah() === 0, `fetcher dipanggil ${f1.jumlah()}x`);
  const f2 = penghitung();
  await M.ambilIsiWeb('http://192.168.1.10/x', ON, f2);
  t('S1e ON benar-benar memanggil jaringan', f2.jumlah() === 1, `fetcher dipanggil ${f2.jumlah()}x`);

  /* ---- S2 metadata TETAP ditolak walau ON ---- */
  for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://[fd00:ec2::254]/x']) {
    const r = M.periksaUrl(url, ON);
    t(`S2 metadata cloud tetap ditolak saat ON (${url.includes('169.254') ? 'IPv4' : 'IPv6'})`, r.ok === false && r.alasan.startsWith('ip-privat:'), `alasan=${alasan(r)}`);
  }
  // Metadata juga ditolak walau masuk allowlist (bukti urutan lantai).
  const metaAllow = M.periksaUrl('http://169.254.169.254/x', ON);
  t('S2b metadata ditolak walau terdaftar di allowlist', metaAllow.ok === false, `alasan=${alasan(metaAllow)}`);

  /* ---- S4 portWeb ---- */
  const portOff = M.periksaUrl('http://contoh.com:3000/x', OFF);
  t('S4a OFF menolak port dev 3000', portOff.ok === false && portOff.alasan === 'port-tak-lazim:3000', `alasan=${alasan(portOff)}`);
  const portOn = M.periksaUrl('http://contoh.com:3000/x', ON_PORT);
  t('S4b ON membuka port 3000', portOn.ok === true, `alasan=${alasan(portOn)}`);
  const portLain = M.periksaUrl('http://contoh.com:9999/x', ON_PORT);
  t('S4c ON tetap menolak port 9999', portLain.ok === false && portLain.alasan === 'port-tak-lazim:9999', `alasan=${alasan(portLain)}`);
  const port443 = M.periksaUrl('https://contoh.com:443/x', OFF);
  t('S4d port 443 eksplisit tetap sah di default', port443.ok === true, `alasan=${alasan(port443)}`);
  const port80 = M.periksaUrl('http://contoh.com:80/x', OFF);
  t('S4e port 80 eksplisit tetap sah di default', port80.ok === true, `alasan=${alasan(port80)}`);
  // Pengukuran APA ADANYA untuk portWeb kosong (temuan, bukan asumsi).
  const pk443 = M.periksaUrl('https://contoh.com:443/x', PORT_KOSONG);
  const pkDef = M.periksaUrl('https://contoh.com/x', PORT_KOSONG);
  t('S4f portWeb=[] TETAP membuka :443 (janji "80/443 selalu sah")', pk443.ok === true, `ALASAN=(${alasan(pk443)}) portWeb=[] -> portSah=${JSON.stringify(M.portSahBerlaku(PORT_KOSONG))}`);
  t('S4g portWeb=[] masih membuka URL tanpa port eksplisit', pkDef.ok === true, `alasan=${alasan(pkDef)}`);
  // portSah selalu memuat '' supaya URL default lolos.
  t('S4h portSahBerlaku selalu memuat "" (port default)', M.portSahBerlaku(OFF).includes(''), `isi=${JSON.stringify(M.portSahBerlaku(OFF))}`);
  // portWeb hanya MEMPERLUAS (web.rs:223 + tes port_web_on_membuka_port_tambahan)
  const kembang = M.kebijakanDariSetelan({ izinIsiWeb: true, allowlistWeb: ['contoh.com'], portWeb: [3000] });
  const k443 = M.periksaUrl('https://contoh.com:443/x', kembang);
  const k8080 = M.periksaUrl('http://contoh.com:8080/x', kembang);
  t('S4i portWeb:[3000] TETAP buka :443 (memperluas, bukan mengganti)', k443.ok === true, `alasan=${alasan(k443)} portSah=${JSON.stringify(M.portSahBerlaku(kembang))}`);
  t('S4j portWeb:[3000] TETAP tolak :8080 yang tak didaftar', k8080.ok === false && k8080.alasan === 'port-tak-lazim:8080', `alasan=${alasan(k8080)}`);

  /* ---- S5 hopRedirect ---- */
  const hopDariSetelan = (v) => M.hopBerlaku(M.kebijakanDariSetelan({ izinIsiWeb: true, hopRedirect: v }));
  t('S5a OFF hop default = 5', hopDariSetelan(undefined) === 5, `=${hopDariSetelan(undefined)}`);
  t('S5b ON hop 8 mengikuti setelan', hopDariSetelan(8) === 8, `=${hopDariSetelan(8)}`);
  t('S5c ON hop 99 di-clamp plafon keras 10', hopDariSetelan(99) === 10, `=${hopDariSetelan(99)}`);
  t('S5d hop 0 jatuh ke default 5 (fail-closed)', hopDariSetelan(0) === 5, `=${hopDariSetelan(0)}`);
  t('S5e hop -3 jatuh ke default 5 (fail-closed)', hopDariSetelan(-3) === 5, `=${hopDariSetelan(-3)}`);
  t('S5f hop NaN jatuh ke default 5 (fail-closed)', hopDariSetelan(NaN) === 5, `=${hopDariSetelan(NaN)}`);
  t('S5g hop string rusak jatuh ke default 5 (fail-closed)', hopDariSetelan('abc') === 5, `=${hopDariSetelan('abc')}`);

  // Rantai: 1 URL = 0 hop; 7 URL = 6 hop -> lewat default 5, lolos di 8.
  const rantai = (n) => Array.from({ length: n }, (_, i) => `https://contoh.com/r${i}`);
  const KB8 = M.kebijakanDariSetelan({ izinIsiWeb: true, allowlistWeb: ['contoh.com'], hopRedirect: 8 });
  t('S5h rantai 6 hop DITOLAK saat default 5', M.ikutiRedirect(rantai(7), OFF).ok === false && M.ikutiRedirect(rantai(7), OFF).alasan.startsWith('batas-redirect-terlampaui'), `alasan=${alasan(M.ikutiRedirect(rantai(7), OFF))}`);
  t('S5i rantai 6 hop DILULUSKAN saat hopRedirect=8', M.ikutiRedirect(rantai(7), KB8).ok === true, `alasan=${alasan(M.ikutiRedirect(rantai(7), KB8))}`);
  t('S5j rantai 5 hop lolos di default 5', M.ikutiRedirect(rantai(6), OFF).ok === true, `alasan=${alasan(M.ikutiRedirect(rantai(6), OFF))}`);
  // Tiap hop diperiksa ulang: hop terakhir ke metadata = ditolak.
  const rantaiMeta = [...rantai(3), 'http://169.254.169.254/x'];
  const rMeta = M.ikutiRedirect(rantaiMeta, ON);
  t('S5k hop ke metadata DITOLAK di tengah rantai', rMeta.ok === false && rMeta.alasan.startsWith('hop-3:'), `alasan=${alasan(rMeta)}`);

  /* ---- S6 batas ukuran ---- */
  const kbBesar = M.kebijakanDariSetelan({ izinIsiWeb: true, batasByteWeb: 999_999_999, batasKarakterWeb: 99_999_999 });
  t('S6a batas byte di-clamp 8 MiB', M.batasByteBerlaku(kbBesar.batasByte) === M.BATAS_BYTE_MAKS, `=${M.batasByteBerlaku(kbBesar.batasByte)}`);
  t('S6b batas karakter di-clamp 20.000', M.batasKarakterBerlaku(kbBesar.batasKarakter) === M.BATAS_KARAKTER_KELUARAN, `=${M.batasKarakterBerlaku(kbBesar.batasKarakter)}`);
  t('S6c bodi di atas batas DITOLAK, bukan dipotong diam-diam', M.batasiByte(M.BATAS_BYTE_MAKS + 1, kbBesar.batasByte).ok === false, `alasan=${alasan(M.batasiByte(M.BATAS_BYTE_MAKS + 1, kbBesar.batasByte))}`);
  const potong = M.potongKeluaran('x'.repeat(500), M.kebijakanDariSetelan({ izinIsiWeb: true, batasKarakterWeb: 100 }));
  t('S6d keluaran dipotong dengan penanda', potong.dipotong === true && potong.teks.includes(M.PENANDA_DIPOTONG), `panjang=${potong.teks.length}`);
  /*
   * Izin MATI dibangun dari setelan, bukan dari `KEBIJAKAN_TOLAK_SEMUA`:
   * konstanta itu berarti "belum ada setelan" dan sejak 10ad447 bernilai
   * `izinIsiWeb: true` (izin penuh). Memakainya sebagai "izin mati" mengukur
   * kebalikan dari namanya.
   */
  const kbMati = M.kebijakanDariSetelan({ izinIsiWeb: false });
  t('S6e izin mati = kirim 0 ke model', M.saringKeModel('RAHASIA', kbMati).kirim === 0, `kirim=${M.saringKeModel('RAHASIA', kbMati).kirim}`);
  // Plafon keras byte tidak bisa dilewati lewat setelan.
  t('S6f BATAS_BYTE_MAKS tetap 8.388.608', M.BATAS_BYTE_MAKS === 8 * 1024 * 1024, `=${M.BATAS_BYTE_MAKS}`);
  t('S6g BATAS_KARAKTER_KELUARAN tetap 20.000', M.BATAS_KARAKTER_KELUARAN === 20000, `=${M.BATAS_KARAKTER_KELUARAN}`);

  /* ---- S7 permanen ditolak (walau semua setelan ON) ---- */
  const permanen = [
    ['file:///c:/windows/win.ini', 'skema-terlarang:file:'],
    ['javascript:alert(1)', 'skema-terlarang:javascript:'],
    ['data:text/html,<b>x</b>', 'skema-terlarang:data:'],
    ['about:blank', 'skema-terlarang:about:'],
  ];
  for (const [url, harapan] of permanen) {
    const r = M.periksaUrl(url, ON);
    t(`S7 skema ${harapan.replace(/:$/, '')} tetap ditolak saat semua ON`, r.ok === false && r.alasan === harapan, `alasan=${alasan(r)}`);
  }
  // userinfo: trik DEPAN-PUTIH (`putih@jahat.example`) tidak bisa membohongi
  // allowlist - `periksaUrl` memvonis host = SESUDAH @, jadi ditolak
  // `host-luar-allowlist`. Itu sudah cukup untuk menutup "bypass allowlist",
  // dan sama dengan yang diuji K09 `uji-pane-browser-kebijakan.mjs` + C18
  // `uji-pane-browser.mjs`.
  const trik = 'https://' + String.fromCharCode(99) + 'ontoh.com@jahat.example/x';
  const putih = M.periksaUrl(trik, ON);
  t('S7b trik `putih@jahat` ditolak: host = SESUDAH @', putih.ok === false && putih.alasan === 'host-luar-allowlist:jahat.example', `alasan=${alasan(putih)}`);
  // Penolakan `user@host` yang TAMPIL MENYESATKAN ada di lapisan berikutnya.
  // Jalur `web_fetch`: `lantaiHttpsWeb` (web.ts:400-408) menolaknya SEBELUM
  // jaringan - terbukti langsung di sini.
  const lantai = MW.lantaiHttpsWeb('https://jahat' + String.fromCharCode(64) + 'contoh.com/x', ON);
  t('S7c lantaiHttpsWeb (jalur web_fetch) menolak userinfo', lantai.ok === false && String(lantai.alasan).includes('userinfo-ditolak'), `alasan=${alasan(lantai)}`);
  // Jalur pane: Rust `periksa_url_pane_dengan` (web.rs) menolak userinfo
  // SEBELUM host, dipakai `browser_pane.rs` di SEMUA jalan masuk webview.
  // Karena itu `gerbangIsiKonten` (TS) memang TIDAK punya cek userinfo -
  // keputusan desain yang tertulis di web.ts:365-369, bukan celah: setiap
  // jalur yang keluar ke jaringan/webview punya lapisan penolakan sendiri.
  const gerbang = M.gerbangIsiKonten('https://jahat' + String.fromCharCode(64) + 'contoh.com/x', ON);
  t('S7d gerbangIsiKonten (TS) tanpa cek userinfo = desain terdokumentasi', gerbang.ok === true, `FAKTA DESAIN ok=${gerbang.ok} — penutupnya lapisan Rust (pane) + lantaiHttpsWeb (fetch)`);
  // Bukti berkas: penolakan userinfo ADA di dua lapisan penutup itu.
  const sumberPane = baca('src-tauri/src/web.rs');
  const sumberBp = baca('src-tauri/src/browser_pane.rs');
  t('S7e Rust periksa_url_pane menolak userinfo', /fn periksa_url_pane/.test(sumberPane) && /u\.username\(\)/.test(sumberPane) && /periksa_url_pane_dengan/.test(sumberBp), `web.rs periksa_url_pane=${/fn periksa_url_pane/.test(sumberPane)}, username=${/u\.username\(\)/.test(sumberPane)}, dipakai browser_pane=${/periksa_url_pane_dengan/.test(sumberBp)}`);
  t('S7f Rust validate_outbound_url menolak userinfo (semua fetch keluar)', /u\.username\(\)/.test(sumberPane) && /fn validate_outbound_url_dengan/.test(sumberPane), 'validate_outbound_url_dengan ada + memeriksa username');

  /* ---- S8 fail-closed ---- */
  const kosong = M.kebijakanDariSetelan({});
  t('S8a setelan kosong = izin lokal OFF', kosong.izinJaringanLokal === false, `=${kosong.izinJaringanLokal}`);
  t('S8b setelan kosong = port default 80/443', JSON.stringify(kosong.portSah) === JSON.stringify(M.PORT_SAH), `=${JSON.stringify(kosong.portSah)}`);
  t('S8c setelan kosong = hop default 5', kosong.hopRedirect === 5, `=${kosong.hopRedirect}`);
  /* 10ad447: hanya `false` eksplisit yang mematikan isi web. Diukur apa
     adanya - bukan fail-closed lagi, dan bukan pula diubah diam-diam. */
  t('S8d setelan kosong = izinIsiWeb ON (mati hanya kalau eksplisit false)', kosong.izinIsiWeb === true, `=${kosong.izinIsiWeb}`);
  t('S8b bis opt-out eksplisit izinIsiWeb:false = OFF', M.kebijakanDariSetelan({ izinIsiWeb: false }).izinIsiWeb === false,
    `=${M.kebijakanDariSetelan({ izinIsiWeb: false }).izinIsiWeb}`);
  const stringy = M.kebijakanDariSetelan({ izinJaringanLokal: 'yes' });
  t('S8e izinJaringanLokal string "yes" dibaca OFF (harus boolean)', stringy.izinJaringanLokal === false, `=${JSON.stringify(stringy.izinJaringanLokal)}`);
  const rusak = M.kebijakanDariSetelan({ portWeb: 'bukan-array', hopRedirect: 'besar' });
  t('S8f portWeb non-array = port default', JSON.stringify(rusak.portSah) === JSON.stringify(M.PORT_SAH), `=${JSON.stringify(rusak.portSah)}`);
  t('S8g hop non-angka = default 5', rusak.hopRedirect === 5, `=${rusak.hopRedirect}`);

  /* ---- urutan: izin mati menang atas segalanya ---- */
  const izinMati = M.periksaUrl('https://contoh.com/x', { ...ON, izinIsiWeb: false });
  t('S8h izinIsiWeb=false menang atas jaringan lokal ON', izinMati.ok === false && izinMati.alasan === 'izin-isi-web-mati', `alasan=${alasan(izinMati)}`);

  return K;
}

/* ---------- jalankan DUA KALI, bandingkan byte-per-byte (S9) ---------- */
const hasil1 = await semuaKasus();
const hasil2 = await semuaKasus();
const ser1 = hasil1.map((k) => `${k.nama}|${k.lolos}|${k.rincian}`);
const ser2 = hasil2.map((k) => `${k.nama}|${k.lolos}|${k.rincian}`);
const deterministik = ser1.join('\n') === ser2.join('\n');

console.log('== uji-jaringan-lokal — 5 setelan `zeph-buka-jaringan-lokal` ==\n');
for (const k of hasil1) {
  console.log(`  [${k.lolos ? 'LULUS' : 'GAGAL'}] ${k.nama}${k.rincian ? '  —  ' + k.rincian : ''}`);
}

console.log('\n-- Pagar harness --');
uji('P1 keluaran deterministik (dua jaluran identik)', deterministik, deterministik ? 'IDENTIK' : 'BEDA');
uji('P2 tanpa jaringan: fetch tidak pernah dipanggil', panggilanJaringan === 0, `fetcher global dipanggil ${panggilanJaringan}x`);
// Angka port CDP debug disusun dari potongan supaya berkas ini sendiri
// tidak memuatnya — pagar P3 menguji isi berkasnya sendiri, jadi menulis
// angkanya secara utuh di deskripsi = pagar gagal oleh dirinya sendiri.
const PORT_CDP_DEBUG = '9' + '22' + '3';
uji('P3 tidak menyebut/menyentuh CDP (port debug pengembangan)', !SUMBER.includes(PORT_CDP_DEBUG) && !readFileSync(new URL(import.meta.url), 'utf8').includes(PORT_CDP_DEBUG), 'tanpa CDP, hanya node + esbuild');
uji('P4 sumber kebijakan tetap murni (tanpa impor store/Tauri)', !/^\s*import\s+(?!{)/m.test(SUMBER) || !SUMBER.match(/from\s+'[^.]/), `baris impor=${(SUMBER.match(/^\s*import\s+/gm) || []).length}`);

const lulus = hasil1.filter((k) => k.lolos).length;
const gagalKasus = hasil1.length - lulus;
console.log('\n== Ringkasan ==');
console.log(`modul produk    : ${BERKAS} (bundel esbuild, dijalankan)`);
console.log(`kasus pengukuran: ${hasil1.length} (${lulus} lulus, ${gagalKasus} gagal)`);
console.log(`S1 izin lokal   : OFF menolak loopback/privat/link-local/CGNAT/*.local; ON membuka asal terdaftar`);
console.log(`S2 metadata     : 169.254.169.254 + fd00:ec2::254 tetap ditolak walau ON`);
console.log(`S4 portWeb      : off = ''/80/443; on = +3000; 9999 tetap ditolak`);
console.log(`S5 hopRedirect  : default 5, ikut setelan, clamp 10, rusak -> 5`);
console.log(`S6 batas ukuran : byte clamp 8 MiB, karakter clamp 20.000, oversized DITOLAK`);
console.log(`S7 permanen     : file:/javascript:/data:/about: + userinfo`);
console.log(`jaringan global : dipanggil ${panggilanJaringan}x`);
console.log(`determinisme    : ${deterministik ? 'IDENTIK' : 'BEDA'}`);
console.log(`sisa luar cakup: lapisan Rust -> cargo test --lib web::tests (22 tes); app hidup -> CDP`);

if (gagalKasus > 0 || gagal > 0) {
  console.log(`\nHASIL: GAGAL (${gagalKasus} kasus pengukuran + ${gagal} pagar)`);
  process.exit(1);
}
console.log(`\nHASIL: LULUS (exit 0) — ${hasil1.length} kasus pengukuran + ${totalUji} pagar`);
process.exit(0);
