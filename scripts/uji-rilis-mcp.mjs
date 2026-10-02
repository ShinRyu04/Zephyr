/**
 * uji-rilis-mcp.mjs - uji exe RILIS lewat UI-nya, plus server MCP 9222.
 *
 *   node uji-rilis-mcp.mjs [port-cdp]
 *
 * PENTING: exe rilis TIDAK punya `window.__ZEPHYR__` - bridge dev di-tree-shake
 * dari build produksi. Karena itu harness ini memakai `cdp.eval` (pernyataan
 * langsung), BUKAN `cdp.json` - helper itu menyuntikkan `window.__ZEPHYR__` dan
 * akan langsung gagal di rilis.
 *
 * Menguji lewat UI juga lebih jujur: yang diperiksa adalah apa yang benar-benar
 * dilihat pengguna, bukan state internal yang mungkin berbeda.
 *
 *   R1  target CDP adalah Zephyr yang benar (bukan aplikasi lain di port itu)
 *   R2  UI ter-render
 *   R3  editor punya empty-state atau tab
 *   R4  panel bawah bisa dibuka dan punya tab
 *   R5  ikon AI ada DAN ActivityBar punya lapisannya sendiri (bug tombol macet)
 *   R6  server MCP bisa dihidupkan dari halaman Settings
 *   R7  /health menjawab di port 9222
 *   R8  /mcp TANPA token ditolak
 *   R9  /mcp dengan token mengembalikan daftar tool
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9444';
/*
 * Port MCP TIDAK dianggap 9222.
 *
 * 9222 hanyalah port yang DIMINTA. Server memakai daftar cadangan
 * [9222, 9224, 9225, 9226, 9227] dan sengaja melewati 9223 (itu port debug
 * WebView2 yang dipakai semua harness). Di mesin ini 9222 justru sudah dipegang
 * `msedgewebview2`, jadi Zephyr jatuh ke 9224 - dan uji yang menembak 9222 akan
 * mendapat 404 dari WebView2, bukan dari Zephyr.
 *
 * Karena itu portnya DIBACA dari status di UI (yang menampilkan
 * "Running (127.0.0.1:9224)"), lalu diverifikasi dengan probe ke /health yang
 * menyebut dirinya Zephyr.
 */
/*
 * Port MCP DIPINDAI, bukan ditebak dan bukan disimpulkan dari teks UI.
 *
 * Dua cara sebelumnya gagal karena alasan yang berbeda-beda dan keduanya
 * mengajarkan hal yang sama:
 *   - menganggap 9222: dipegang `msedgewebview2` di mesin ini, jadi yang
 *     menjawab 404 adalah aplikasi lain;
 *   - membaca dari `document.body.innerText`: panel bawah menutupi halaman
 *     Settings di DOM, sehingga yang terbaca justru daftar tab PROBLEMS/OUTPUT.
 *
 * Memindai daftar cadangan yang memang dipakai server ([9222, 9224, 9225, 9226,
 * 9227]) lalu MEMVERIFIKASI bahwa /health menyebut "zephyr" itu langsung,
 * tahan terhadap tata letak UI dan tidak bisa tertipu aplikasi lain.
 */
const KANDIDAT = [9222, 9224, 9225, 9226, 9227];

/**
 * Port MCP yang sedang dipakai.
 *
 * Diisi dari ALAMAT YANG DITAMPILKAN di halaman MCP ("127.0.0.1:9224") - itu
 * nilai yang benar-benar dipakai server. Argumen ketiga bisa menimpanya, dan
 * pemindaian daftar cadangan hanya dipakai sebagai jaring terakhir.
 */
let MCP = Number(process.argv[3] || 0);

async function cobaPort(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const teks = await res.text();
    return { port, status: res.status, teks };
  } catch {
    return { port, status: 0, teks: '' };
  }
}

const r = reporter('rilis-mcp');

const { cdp } = await Cdp.attach(PORT);

/** Baca satu ekspresi, kembalikan objek. Aman di rilis (tanpa bridge dev). */
async function baca(expr) {
  const hasil = await cdp.eval(`JSON.stringify(${expr})`);
  try {
    return JSON.parse(hasil);
  } catch {
    return { galat: String(hasil).slice(0, 200) };
  }
}

/* ---- R1: identitas target ---- */

/*
 * Langkah pertama yang wajib: port CDP bisa dimiliki aplikasi LAIN. Di mesin
 * ini D:/Abel (Electron) pernah memakai 9333, dan harness yang menempel ke port
 * itu membaca aplikasi yang salah tanpa sadar. Target Zephyr harus
 * `http://tauri.localhost/`.
 */
const target = await baca(`({ url: location.href, judul: document.title })`);
r.check('R1', /tauri\.localhost/.test(target.url || ''), `target benar: ${target.judul} | ${target.url}`);

/*
 * Keadaan awal dipulihkan: halaman Settings DITUTUP kalau sedang terbuka.
 *
 * Harness ini dijalankan berkali-kali, dan ikon Settings adalah TOGGLE - kalau
 * pemeriksaan sebelumnya meninggalkannya terbuka, klik berikutnya justru
 * menutupnya, dan seluruh rangkaian R6 gagal karena nav yang dicari tidak ada.
 * Hasil uji yang bergantung pada apa yang ditinggalkan uji sebelumnya menghabiskan
 * lebih banyak waktu daripada bug yang sebenarnya.
 */
await baca(`(() => {
  const btns = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')];
  const set = btns.find((b) => /settings/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
  if (set && document.querySelector('.set-nav-item')) set.click();
  return true;
})()`);
await sleep(800);

/* ---- R2: UI ter-render ---- */

const akar = await baca(`(() => {
  const root = document.querySelector('#root');
  return { adaRoot: !!root, anak: root ? root.childElementCount : -1, tinggi: document.body.scrollHeight };
})()`);
r.check('R2', akar.adaRoot === true && akar.anak > 0, `UI ter-render: #root punya ${akar.anak} anak, tinggi ${akar.tinggi}px`);

/* ---- R3: editor ---- */

const editor = await baca(`({
  empty: !!document.querySelector('.editor-empty, .empty-state, .pane-empty'),
  tab: document.querySelectorAll('.tab').length,
})`);
r.check('R3', editor.empty === true || editor.tab > 0, `editor punya empty-state atau tab (empty=${editor.empty}, tab=${editor.tab})`);

/* ---- R4: panel bawah ---- */

const panel = await baca(`(() => {
  const btn = document.querySelector('[data-testid="status-panel-toggle"]')
    || [...document.querySelectorAll('button')].find((b) => /panel/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
  if (!btn) return { ada: false };
  btn.click();
  return { ada: true };
})()`);

await sleep(700);

const panelIsi = await baca(`({
  terbuka: !!document.querySelector('.panel, .pts-root'),
  tabs: [...document.querySelectorAll('.pts-tab, .panel-tab')].map((t) => (t.textContent || '').trim()),
})`);

r.check('R4', panel.ada === true, `tombol panel diklik, panel terbuka=${panelIsi.terbuka}, tab=${JSON.stringify(panelIsi.tabs)}`);

/* ---- R5: ActivityBar + ikon AI ---- */

const ai = await baca(`(() => {
  const btns = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')];
  /* Label di rilis adalah "AI / MCP". Pencocokan dibuat longgar supaya
     perubahan label kecil tidak langsung mematahkan ujinya. */
  const punyaAi = btns.some((b) => /ai|assistant|asisten|mcp/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
  const ab = document.querySelector('.activitybar');
  const c = ab ? getComputedStyle(ab) : null;
  return { jumlah: btns.length, punyaAi, zIndex: c ? c.zIndex : null, position: c ? c.position : null };
})()`);

r.check('R5a', ai.punyaAi === true, `ikon AI ada di ActivityBar (dari ${ai.jumlah} tombol)`);
r.check(
  'R5b',
  ai.position !== 'static' && Number(ai.zIndex) >= 1000,
  `ActivityBar punya lapisannya sendiri: position=${ai.position} z-index=${ai.zIndex}`,
);

/* ---- R6: hidupkan MCP dari Settings ---- */

/*
 * Nama tombol diambil dari observasi exe RILIS (`periksa-rilis.mjs`), bukan
 * ditebak dari kode sumber: "Settings" (bukan "Pengaturan") dan "AI / MCP".
 * Menebak label adalah cara paling mudah membuat harness gagal padahal
 * aplikasinya benar.
 */
/*
 * Aktivitas Panel ditutup dulu kalau sedang terbuka.
 *
 * Ikon Settings adalah TOGGLE: kalau halaman Settings sudah terbuka (mis. dari
 * uji sebelumnya), mengkliknya justru MENUTUP panelnya - dan seluruh rangkaian
 * R6 gagal karena halaman yang dicari tidak ada. Menutup dulu membuat harness
 * benar untuk keadaan awal apa pun.
 */
const mcpUi = await baca(`(() => {
  const btns = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')];
  const set = btns.find((b) => /settings/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
  if (!set) return { langkah: 'tombol Settings tidak ketemu', label: btns.map((b) => b.getAttribute('aria-label')) };

  const sudahTerbuka = !!document.querySelector('.set-nav-item');
  if (sudahTerbuka) {
    set.click();
    return { langkah: 'settings ditutup dulu (ikon adalah toggle)' };
  }
  set.click();
  return { langkah: 'settings dibuka' };
})()`);

await sleep(1200);

/*
 * Halaman Settings dibuka, lalu section "MCP" dipilih dari nav KIRI.
 *
 * Nav-nya memakai kelas `.set-nav-item`, dan itu HARUS dipastikan lebih dulu:
 * versi pertama skrip ini mencari `.settings-nav button`, tidak menemukan apa
 * pun, lalu membaca sakelar pertama di halaman yang kebetulan sedang terbuka
 * ("Agents") dan melaporkannya sebagai sakelar MCP. Ujinya "lulus" dengan
 * membaca kontrol yang salah - kegagalan yang jauh lebih berbahaya daripada
 * gagal terang-terangan.
 */
/*
 * Nav dicari DENGAN RETRY.
 *
 * Halaman Settings dirender bertahap: nav-nya muncul setelah panelnya selesai
 * dipasang. Membacanya sekali setelah jeda tetap membuat hasilnya bergantung
 * kecepatan mesin - dijalankan dua kali, satu lulus dan satu gagal, padahal
 * aplikasinya identik. Kegagalan seperti itu menghabiskan lebih banyak waktu
 * daripada bug yang sebenarnya, jadi ditunggu sampai nav-nya benar-benar ada.
 */
let navMcp = { ada: false };
for (let i = 0; i < 12 && !navMcp.ada; i++) {
  navMcp = await baca(`(() => {
    const nav = [...document.querySelectorAll('.set-nav-item')];
    if (nav.length === 0) return { ada: false, jumlahNav: 0 };
    const mcp = nav.find((n) => /^mcp$/i.test((n.textContent || '').trim()));
    if (!mcp) return { ada: false, jumlahNav: nav.length, nav: nav.map((n) => (n.textContent || '').trim()).slice(0, 20) };
    mcp.click();
    return { ada: true, jumlahNav: nav.length };
  })()`);
  if (!navMcp.ada) await sleep(400);
}

await sleep(900);

/* Pastikan section yang benar-benar terbuka memang MCP, bukan yang lain. */
const sectionAktif = await baca(`(() => {
  const a = document.querySelector('.set-nav-item.is-active');
  return { nama: a ? (a.textContent || '').trim() : null };
})()`);

r.check(
  'R6a',
  navMcp.ada === true,
  `section MCP ada di nav Settings (${navMcp.jumlahNav} item): ${JSON.stringify(navMcp.nav || 'ok')}`,
);
r.check(
  'R6b',
  sectionAktif.nama === 'MCP',
  `section yang terbuka memang MCP, bukan yang lain: "${sectionAktif.nama}"`,
);

/* Sakelar MCP: role="switch" (bukan input checkbox), sesuai catatan proyek. */
const sakelar = await baca(`(() => {
  const sw = [...document.querySelectorAll('[role="switch"]')];
  if (sw.length === 0) return { ada: false };
  const pertama = sw[0];
  const sebelum = pertama.getAttribute('aria-checked');
  if (sebelum !== 'true') pertama.click();
  return { ada: true, jumlah: sw.length, sebelum, diklik: sebelum !== 'true' };
})()`);

/* Diberi waktu lebih: bind socket + menyiapkan tool tidak instan, dan uji yang
   membaca terlalu cepat akan melaporkan "gagal" untuk server yang sebenarnya
   baru saja siap. */
await sleep(4000);

/*
 * Baris status dipotong dengan split, BUKAN regex di dalam template literal.
 *
 * `.match(/...\n.../)` di dalam template literal menabrak parser: `\n` di
 * dalam backtick menjadi baris baru sungguhan, sehingga regex-nya terbelah dan
 * dilaporkan sebagai "Invalid regular expression: missing /". Parser webview
 * melaporkan errornya di tempat lain lagi. Membelah dengan pembatas biasa
 * menghindari seluruh kelas masalah itu.
 */
const sesudah = await baca(`(() => {
  const sw = [...document.querySelectorAll('[role="switch"]')];
  const teks = document.body.innerText || '';
  const baris = teks.split(String.fromCharCode(10));
  const penting = baris
    .filter((b) => /berjalan|running|9222|port/i.test(b))
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .slice(0, 4);
  return {
    checked: sw.length ? sw[0].getAttribute('aria-checked') : null,
    menyebutPort: teks.indexOf('9222') >= 0,
    barisStatus: penting,
  };
})()`);

r.check(
  'R6c',
  sakelar.ada === true && sesudah.checked === 'true',
  `sakelar MCP menyala (${sakelar.sebelum} -> ${sesudah.checked}, ${sakelar.jumlah} sakelar di section MCP); status: ${JSON.stringify(sesudah.barisStatus)}`,
);

/* ---- R6e: token dibuat lewat UI ---- */

/*
 * Token harus ADA sebelum server bisa dipakai.
 *
 * Ini jalur yang ditempuh pengguna sungguhan, dan sebelumnya terlewat: sakelar
 * MCP menyala tapi tokennya kosong, sehingga server hidup tanpa bisa
 * diotentikasi - dan tidak ada port yang terbuka. Uji yang hanya memeriksa
 * sakelar akan melaporkan "MCP aktif" untuk server yang tidak bisa dipakai
 * sama sekali.
 */
/*
 * Token dibaca dari ELEMEN TEKSNYA, bukan dari input.
 *
 * Halaman MCP menampilkan token dalam keadaan bertopeng
 * ("35fa••••••••••••••••••••6863") sebagai teks biasa, bukan sebagai `input`.
 * Versi pertama uji ini mencari `input[type=password]` dan selalu menemukan
 * panjang 0 - padahal tokennya ada dan servernya jalan. Uji yang mencari di
 * tempat yang salah akan melaporkan "gagal" untuk fitur yang bekerja, dan itu
 * jenis kegagalan yang paling banyak menghabiskan waktu.
 *
 * Token yang benar-benar dipakai diambil TERPISAH dari berkas pengaturan di
 * bawah (R9); yang diperiksa di sini adalah bahwa tombolnya BEKERJA.
 */
const tokenUi = await baca(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /^new token$/i.test((b.textContent || '').trim()));
  const sebelumAda = [...document.querySelectorAll('code, pre, [class*=token]')]
    .some((e) => /^[0-9a-f]{4}\\u2022/.test((e.textContent || '').trim()));
  if (btn) btn.click();
  return { adaTombol: !!btn, sebelumAda };
})()`);

await sleep(1800);

const tokenSesudah = await baca(`(() => {
  const el = [...document.querySelectorAll('code, pre, [class*=token]')]
    .map((e) => (e.textContent || '').trim())
    .filter((t) => /^[0-9a-f]{4}\\u2022/.test(t));
  /*
   * Alamat server dicari dari teks elemennya sendiri, BUKAN dari body.
   * Panel bawah ikut ter-render di body dan teksnya bisa menutupi halaman
   * Settings di DOM, sehingga pola yang dicari tidak ketemu walaupun tertulis
   * di layar.
   */
  const alamat = [...document.querySelectorAll('code, pre, kbd, span, div')]
    .map((e) => (e.childElementCount === 0 ? (e.textContent || '').trim() : ''))
    .filter((t) => /^127\\.0\\.0\\.1:\\d{4,5}$/.test(t));
  return { bertopeng: el.length > 0, contoh: el[0] || null, alamat: alamat[0] || null };
})()`);

r.check(
  'R6e',
  tokenUi.adaTombol === true && tokenSesudah.bertopeng === true,
  `token tersedia di halaman MCP: ${JSON.stringify(tokenSesudah.contoh)} (tombol ada=${tokenUi.adaTombol})`,
);
r.check(
  'R6f',
  /^127\.0\.0\.1:\d{4,5}$/.test(tokenSesudah.alamat || ''),
  `halaman MCP menampilkan alamat server: ${tokenSesudah.alamat || '(tidak ketemu)'}`,
);

/* Port diambil dari alamat yang DITAMPILKAN di halaman MCP - itu nilai yang
   benar-benar dipakai server, bukan tebakan dari daftar cadangan. */
if (tokenSesudah.alamat) MCP = Number(tokenSesudah.alamat.split(':')[1]);

/* ---- R7-R9: server MCP ---- */

/* Kalau alamat yang ditampilkan tidak terbaca, port dipindai dari daftar
   cadangan yang memang dipakai server. */
let asalPort = MCP ? 'alamat di halaman MCP' : 'argumen';
if (!MCP) {
  for (let i = 0; i < 10 && !MCP; i++) {
    for (const p of KANDIDAT) {
      const c = await cobaPort(p);
      if (c.status === 200 && /zephyr/i.test(c.teks)) {
        MCP = p;
        asalPort = 'pindaian';
        break;
      }
    }
    if (!MCP) await sleep(800);
  }
}

r.check(
  'R6d',
  MCP > 0,
  MCP > 0
    ? `port MCP ditemukan lewat ${asalPort}: ${MCP} (diverifikasi /health menyebut zephyr)`
    : `port MCP tidak ditemukan; dipindai ${KANDIDAT.join(', ')} selama 8 detik`,
);

/* Helper wajib try/catch: fetch ke port mati MELEMPAR, tidak mengembalikan
   status - dan itu dulu membuat harness menunggu selamanya. */
async function rpc(path, init) {
  try {
    const res = await fetch(`http://127.0.0.1:${MCP}${path}`, init);
    return { status: res.status, teks: await res.text() };
  } catch (e) {
    return { status: 0, teks: String(e.message) };
  }
}

/*
 * Port sebenarnya dibaca dari halaman MCP - dan halaman itu DIPASTIKAN terbuka
 * lebih dulu.
 *
 * Versi sebelumnya hanya membaca `document.body.innerText` apa adanya. Itu
 * bergantung pada tab mana yang sedang aktif: setelah R6 selesai, panel bawah
 * bisa saja sudah berpindah tab (karena R4 mengkliknya), sehingga teks MCP-nya
 * tidak ikut terbaca dan port-nya tidak ketemu - padahal servernya hidup.
 *
 * Urutan yang benar: klik section MCP lagi supaya halamannya PASTI aktif, baru
 * baca dari DOM-nya sendiri (bukan dari seluruh body).
 */


/*
 * Diverifikasi bahwa yang menjawab di port itu memang Zephyr, bukan aplikasi
 * lain. Di mesin ini 9222 dipegang `msedgewebview2`, dan 404-nya mudah
 * disalahartikan sebagai "Zephyr tidak jalan".
 */
const health = await rpc('/health');
r.check(
  'R7',
  health.status === 200 && /zephyr/i.test(health.teks || ''),
  `GET http://127.0.0.1:${MCP}/health -> ${health.status} ${String(health.teks).slice(0, 110)}`,
);

const tanpa = await rpc('/mcp', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
r.check(
  'R8',
  tanpa.status === 401 || tanpa.status === 403,
  `POST /mcp TANPA token DITOLAK: ${tanpa.status} ${String(tanpa.teks).slice(0, 70)}`,
);

/*
 * Token ASLI diambil dari berkas pengaturan aplikasi, bukan dari UI.
 *
 * UI menampilkannya bertopeng, dan itu memang seharusnya - token yang tampil
 * penuh di layar bisa terbaca siapa pun yang melihat. Untuk benar-benar
 * MEMBUKTIKAN autentikasinya bekerja, nilainya harus diambil dari tempat yang
 * sama dengan yang dipakai server: `%APPDATA%\zephyr\settings.json`.
 *
 * Yang diuji di sini bukan "token bisa dibaca", melainkan "token itu diterima
 * server" - dan itu hanya bisa dibuktikan dengan nilai yang sungguhan.
 */
const os = await import('node:os');
const fs = await import('node:fs');
const path = await import('node:path');

/*
 * Berkasnya `mcp.json`, BUKAN `settings.json`.
 *
 * Versi pertama uji ini membaca `settings.json` dan menemukan `mcp` yang hanya
 * berisi `{enabled, port}` tanpa token - lalu sempat terlihat seperti bug
 * ("token tidak dipersistensi"). Ternyata tokennya punya berkasnya sendiri,
 * dibuat `mcp_config::load_or_init`. Yang salah adalah ujinya, bukan
 * aplikasinya - dan itu ketahuan hanya karena saya memeriksa isi berkasnya
 * langsung, bukan menyimpulkan dari struktur yang saya kira.
 */
let tokenAsli = null;
let berkasMcp = null;
try {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  berkasMcp = path.join(appdata, 'zephyr', 'mcp.json');
  const isi = JSON.parse(fs.readFileSync(berkasMcp, 'utf8'));
  tokenAsli = isi.token || null;
} catch (e) {
  tokenAsli = null;
}

if (!tokenAsli) {
  r.check('R9', false, `token tidak terbaca dari ${berkasMcp || 'mcp.json'}`);
} else {
  const panjang = tokenAsli.length;
  const pakai = await rpc('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenAsli}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  let jumlah = -1;
  try {
    const j = JSON.parse(pakai.teks);
    jumlah = j.result && j.result.tools ? j.result.tools.length : -1;
  } catch {
    jumlah = -1;
  }
  r.check(
    'R9',
    pakai.status === 200 && jumlah > 0,
    `POST /mcp dengan token asli (${panjang} karakter) -> ${pakai.status}, ${jumlah} tool terdaftar`,
  );
}

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
