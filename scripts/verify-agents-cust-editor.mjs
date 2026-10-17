// Verify: window "Open in Agents" — Customizations navigate + pane editor kanan.
//
// Semua pemeriksaan di window #agents (BUKAN window utama Zephyr), sesuai
// permintaan user: perubahan ini berlaku untuk "Open in Agents" saja.
//
//   V1  8 baris Customizations ada di kolom kiri
//   V2  tiap baris punya ikon svg (bukan cuma teks)
//   V3  klik baris -> modal Agent Customizations terbuka di section itu
//   V4  modal itu BUKAN halaman Settings editor-area
//   V5  strip tab kolom kanan = Changes + Files (editor TIDAK jadi tab)
//   V6  openPath mengisi store, pane editor muncul di bawah tab body
//   V7  pane editor benar-benar punya CodeMirror dan berisi teks
import { Cdp, tungguBridge, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
let lulus = 0;
let gagal = 0;

const cek = (nama, ok, detail = '') => {
  if (ok) lulus++;
  else gagal++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nama}${detail ? ' — ' + detail : ''}`);
};

/* Target agents dipilih lewat URL `#agents`, bukan judul: judul jendela bisa
   berubah, URL-nya yang menandai root mana yang di-mount. */
const daftar = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
console.log('targets:', daftar.filter((t) => t.type === 'page').map((t) => t.url).join(' | '));
const adaAgents = daftar.some((t) => t.type === 'page' && t.url.includes('#agents'));
cek('V0. window #agents ada', adaAgents);
if (!adaAgents) {
  console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
  process.exit(1);
}

/*
 * Attach to the Agents target EXPLICITLY.
 *
 * `Cdp.attach` is the main-window entry point and deliberately prefers targets
 * whose URL does NOT contain `#agents` (a harness written for the main window
 * once attached to the Agents one and every check failed for the wrong reason).
 * This harness is the opposite case: it measures ONLY the Agents window, so the
 * target is chosen here and handed to `Cdp.connect`.
 */
const targetAgents = daftar.find((t) => t.type === 'page' && (t.url ?? '').includes('#agents'));
if (!targetAgents) {
  console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
  process.exit(1);
}
const cdp = await Cdp.connect(targetAgents.webSocketDebuggerUrl);
await tungguBridge(cdp, '__ZEPHYR__', 30000);

/*
 * Reset keadaan window lebih dulu.
 *
 * Jalankan sebelumnya bisa meninggalkan kolom kiri tertutup, tab Search/
 * Browser terbuka, atau maximize aktif — semuanya dari klik di run yang lalu,
 * bukan dari kode. Tanpa pembersihan ini, uji yang mengukur "belum ada X" atau
 * "strip berisi tepat dua tab" gagal karena sisa itu, dan kegagalannya
 * menyamar sebagai regresi.
 */
await cdp.json(`return JSON.stringify(await (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  /* Maximize DULU: selama aktif, kolom kiri tidak dirender sama sekali,
     jadi klik toggle kiri saat maximize masih menyala justru MEMBALIK
     kiriBuka menjadi false — kolomnya hilang sampai maximize dimatikan.
     Itulah penyebab run sebelumnya melihat 0 baris. */
  if (q('.ag-root.is-maks') || q('.ag-body.is-maks')) {
    q('[data-testid="ag-maximize"]')?.click();
    await sleep(600);
  }
  /* Kiri: tombolnya meng-toggle, jadi klik HANYA kalau kolomnya tidak ada,
     dan ulangi sampai muncul supaya satu klik yang keburu lewat tidak
     menghasilkan 0 baris yang menyamar sebagai regresi. */
  for (let i = 0; i < 3 && !q('[data-testid="agents-left"]'); i++) {
    q('[data-testid="ag-toggle-left"]')?.click();
    await sleep(450);
  }
  /* Kanan: sama seperti kiri, tombolnya meng-toggle. Kalau kolom kanan sedang
     tertutup, seluruh strip tab (termasuk tombol +) tidak dirender, sehingga
     V5a membaca strip kosong dan V5c kehilangan jalan balik. Dinyalakan dulu
     supaya keadaan awal selalu sama. */
  for (let i = 0; i < 3 && !q('[data-testid="ag-right"]'); i++) {
    q('[data-testid="ag-toggle-right"]')?.click();
    await sleep(450);
  }
  /* Tab tambahan: tutup Search/Browser kalau tertinggal. */
  for (const id of ['search', 'browser']) {
    q('[data-testid="ag-tab-close-' + id + '"]')?.click();
  }
  /* Changes/Files bisa ditutup; run sebelumnya (V5c sengaja menutup keduanya)
     bisa meninggalkan strip kosong. Buka lewat menu + sampai keduanya ada —
     syarat mutlak untuk V5a. */
  for (const [id, item] of [
    ['changes', 'ag-open-changes'],
    ['files', 'ag-open-files'],
  ]) {
    for (let i = 0; i < 3 && !q('[data-testid="ag-tab-' + id + '"]'); i++) {
      q('[data-testid="ag-tab-plus"]')?.click();
      await sleep(300);
      q('[data-testid="' + item + '"]')?.click();
      await sleep(300);
    }
  }
  /* Customizations: pastikan terbuka (run lalu bisa menutupnya). */
  if (q('[data-testid="ag-customizations"]')?.classList.contains('is-tutup')) q('[data-testid="ag-cust-toggle"]')?.click();
  /*
   * Close every open file AND dismiss any diff.
   *
   * V6b opens package.json and nothing closed it, so the NEXT run started with
   * a file already open and V6a ("without a file the body is still split, with
   * an EMPTY editor") read a populated editor and failed.
   *
   * The diff matters just as much: AgentsEditor renders DiffViewer when
   * gitStore.diff is set, and a diff WINS over the plain editor. The Changes
   * check in verify-agen-fix.mjs (or a reader clicking a row) leaves one
   * behind, so V7 found a diff where it expected CodeMirror.
   *
   * NOTE: no backticks in this block - it lives inside a template literal.
   */
  try { window.__ZEPHYR_GIT__?.store?.getState?.().closeDiff?.(); } catch {}
  const tabs = window.__ZEPHYR__?.getState?.().tabs ?? [];
  for (const t of [...tabs]) {
    try { window.__ZEPHYR__.getState().closeTab?.(t.id ?? t.path); } catch {}
  }
  await sleep(400);
  return 'bersih';
})())`);
await sleep(700);

/* ── V1/V2: baris Customizations + ikonnya ──────────────────────────────── */
const baris = await cdp.json(`return JSON.stringify(await (async () => {
  const rows = [...document.querySelectorAll('[data-testid="ag-customizations"] .ag-cust-row')];
  return rows.map((r) => ({
    testid: r.getAttribute('data-testid'),
    teks: (r.querySelector('.ag-cust-label')?.textContent ?? '').trim(),
    ikon: !!r.querySelector('.ag-cust-ikon svg'),
  }));
})())`);

const ids = (baris ?? []).map((r) => r.testid);
cek('V1. 8 baris Customizations', baris?.length === 8, `${baris?.length ?? 0} baris: ${ids.join(', ')}`);
cek(
  'V2. tiap baris punya ikon svg',
  (baris ?? []).length > 0 && baris.every((r) => r.ikon),
  `${(baris ?? []).filter((r) => r.ikon).length}/${baris?.length ?? 0} berikon`,
);

/* ── V3/V4: klik baris membuka modal di section yang benar ──────────────── */
const klik = async (testid) =>
  cdp.eval(`(() => {
    const el = document.querySelector('[data-testid="${testid}"]');
    if (!el) return 'tidak ada';
    el.click();
    return 'ok';
  })()`);

/*
 * Keadaan modal dibaca dari DOM + store Settings.
 *
 * `__ZEPHYR_AGC__` mungkin belum dipasang sebagai bridge dev; yang wajib
 * terbukti adalah DOM-nya (modal benar-benar dirender) dan bahwa halaman
 * Settings editor-area TIDAK yang terbuka. Store dibaca kalau ada supaya
 * section-nya bisa dicocokkan, bukan dijadikan syarat.
 */
const cekModal = async () =>
  cdp.json(`return JSON.stringify(await (async () => {
    const modal = document.querySelector('[data-testid="agc-modal"], .agc-modal');
    const judul = modal ? (modal.querySelector('.agc-pane-title')?.textContent ?? '') : '';
    const aktif = modal ? (modal.querySelector('.agc-nav-item.is-active .agc-nav-label')?.textContent
      ?? modal.querySelector('.agc-nav-item.is-active')?.textContent ?? '') : '';
    const settingsOpen = window.__ZEPHYR__?.getState?.()?.settingsOpen ?? false;
    const halamanSettings = !!document.querySelector('.set-page, [data-testid="settings-page"]');
    return { adaModal: !!modal, judul, aktif: aktif.trim(), settingsOpen, halamanSettings };
  })())`);

const hasil = [];
for (const [testid, harap] of [
  ['ag-cust-skills', 'Skills'],
  ['ag-cust-hooks', 'Hooks'],
  ['ag-cust-mcp', 'MCP'],
]) {
  await klik(testid);
  await sleep(500);
  const st = await cekModal();
  hasil.push({ testid, harap, ...st });
  /* Tutup lewat tombol modal supaya state-nya bersih untuk putaran berikut. */
  await cdp.eval(`(() => {
    const b = document.querySelector('.agc-tutup, [data-testid="agc-close"], .agc-modal .agc-x');
    if (b) b.click();
    return 'ok';
  })()`);
  await sleep(350);
}

cek(
  'V3. klik baris -> modal terbuka di section yang sesuai',
  hasil.every((h) => h.adaModal === true && h.judul.toLowerCase().includes(h.harap.toLowerCase())),
  hasil.map((h) => `${h.testid}->"${h.judul}"`).join(', '),
);
cek(
  'V4. modal BUKAN halaman Settings editor-area',
  hasil.every((h) => h.settingsOpen === false && h.halamanSettings === false),
  hasil.map((h) => `settingsOpen=${h.settingsOpen} halaman=${h.halamanSettings}`).join(', '),
);

/* ── V5: strip tab — dua tab awal, semuanya bisa ditutup, menu + ala VS Code ─ */
const stripAwal = await cdp.json(`return JSON.stringify(await (async () => {
  const ids = [...document.querySelectorAll('.ag-tabs > .ag-tab')].map((b) => b.getAttribute('data-testid'));
  return {
    ids,
    bisaTutup: ['changes', 'files'].every((id) => !!document.querySelector('[data-testid="ag-tab-close-' + id + '"]')),
  };
})())`);
cek(
  'V5a. strip mulai dengan changes + files, keduanya ADA tombol × (tak dipin)',
  JSON.stringify(stripAwal?.ids) === JSON.stringify(['ag-tab-changes', 'ag-tab-files']) &&
    stripAwal?.bisaTutup === true,
  JSON.stringify(stripAwal),
);

/* Menu + : empat view, urut dan berpintasan persis seperti VS Code. */
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-tab-plus"]')?.click(); return 1; })()`);
await sleep(450);
const menuPlus = await cdp.json(`return JSON.stringify(await (async () => {
  const items = [...document.querySelectorAll('[data-testid="ag-menu-plus"] [role="menuitem"]')]
    .map((b) => ({
      id: b.getAttribute('data-testid'),
      kbd: (b.querySelector('.ag-menu-kbd')?.textContent ?? '').trim(),
    }));
  return items;
})())`);
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-tab-plus"]')?.click(); return 1; })()`);
await sleep(350);
cek(
  'V5b. menu + = Changes/Files/Browser/Search, urut ala VS Code, pintasan benar',
  JSON.stringify(menuPlus) === JSON.stringify([
    { id: 'ag-open-changes', kbd: 'Ctrl+Shift+G' },
    { id: 'ag-open-files', kbd: 'Ctrl+Shift+E' },
    { id: 'ag-open-browser', kbd: 'Ctrl+Shift+B' },
    { id: 'ag-open-search', kbd: 'Ctrl+Shift+F' },
  ]),
  JSON.stringify(menuPlus),
);

/* Tutup semua tab, lalu buka lagi — membuktikan tak ada yang dipin dan selalu
   ada jalan balik.

   Jalan baliknya BUKAN tombol + di strip, karena strip dan tombol + ikut tidak
   dirender saat daftar tab kosong: menutup tab terakhir mematikan satu-satunya
   menu yang bisa membukanya kembali. Pintasan global di menu itulah yang tetap
   hidup (Ctrl+Shift+G untuk Changes, Ctrl+Shift+E untuk Files), dan itulah yang
   dipakai di sini — sekaligus membuktikan pintasan itu benar-benar bekerja,
   bukan hanya tertulis di menu. */
for (const id of ['changes', 'files']) {
  await cdp.eval(`(() => { document.querySelector('[data-testid="ag-tab-close-${id}"]')?.click(); return 1; })()`);
  await sleep(350);
}
const setelahTutup = await cdp.eval(`JSON.stringify([...document.querySelectorAll('.ag-tabs > .ag-tab')].map((b) => b.getAttribute('data-testid')))`);
const daftarTutup = setelahTutup ?? 'null';

/* Strip harus benar-benar kosong, dan yang tersisa adalah kolom yang masih
   hidup (bukan halaman rusak) — dibuktikan dari ada tidaknya kontainer kolom. */
const kolomHidup = await cdp.json(`return JSON.stringify({
  kanan: !!document.querySelector('[data-testid="ag-right"]'),
  strip: !!document.querySelector('.ag-tabs'),
})`);

for (const [key, id] of [['g', 'changes'], ['e', 'files']]) {
  await cdp.eval(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: '${key}', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
    }));
    return 1;
  })()`);
  await sleep(500);
}
const setelahBuka = await cdp.eval(`JSON.stringify([...document.querySelectorAll('.ag-tabs > .ag-tab')].map((b) => b.getAttribute('data-testid')))`);
const daftarBuka = setelahBuka ?? 'null';
cek(
  'V5c. semua tab bisa ditutup; dibuka lagi lewat pintasan (strip ikut hilang saat kosong)',
  JSON.stringify(JSON.parse(daftarTutup)) === '[]' &&
    kolomHidup?.kanan === true &&
    JSON.parse(daftarBuka).includes('ag-tab-changes') &&
    JSON.parse(daftarBuka).includes('ag-tab-files'),
  `tutup:${daftarTutup} kolomHidup:${JSON.stringify(kolomHidup)} -> buka:${daftarBuka}`,
);

/* ── V6/V7: buka file -> editor mengambil alih body kolom kanan ─────────── */
/* State dibersihkan lebih dulu: run sebelumnya bisa meninggalkan tab terbuka,
   dan "editor belum tampil saat belum ada file" hanya bermakna dari nol. */
await cdp.json(`return JSON.stringify(await (async () => {
  const s = window.__ZEPHYR__.getState();
  for (const t of [...s.tabs]) s.forceCloseTab(t.id);
  return window.__ZEPHYR__.getState().tabs.length;
})())`);
await sleep(500);

const badanAwal = await cdp.json(`return JSON.stringify(await (async () => {
  const body = document.querySelector('.ag-tab-body');
  const edWrap = body?.querySelector('[data-testid="ag-body-editor"]');
  const list = body?.querySelector('.ag-body-list');
  const re = edWrap?.getBoundingClientRect();
  const rl = list?.getBoundingClientRect();
  return {
    belah: body?.classList.contains('is-belah') ?? null,
    ed: !!edWrap,
    list: !!list,
    edW: Math.round(re?.width ?? 0),
    listW: Math.round(rl?.width ?? 0),
    edKiri: !!re && !!rl && re.left < rl.left,
    kosong: !!body?.querySelector('[data-testid="ag-editor-empty"]'),
  };
})())`);
/*
 * Belah dua adalah keadaan DEFAULT.
 *
 * Uji ini dulu menuntut sebaliknya — "belum ada file berarti belum ada panel
 * editor". Pembaca membalik keputusan itu dengan kalimatnya sendiri: bagi dua
 * sejak awal, bukan saat dipencet. Membiarkan uji lama berarti menguji perilaku
 * yang sudah dibatalkan, dan kegagalannya akan terus menyamar sebagai regresi.
 */
cek(
  'V6a. tanpa file pun body sudah terbelah: editor kosong kiri + daftar kanan',
  badanAwal?.belah === true &&
    badanAwal?.ed === true &&
    badanAwal?.list === true &&
    badanAwal?.edKiri === true &&
    badanAwal?.kosong === true &&
    (badanAwal?.edW ?? 0) > 80 &&
    (badanAwal?.listW ?? 0) > 80,
  JSON.stringify(badanAwal),
);

const dibuka = await cdp.json(`return JSON.stringify(await (async () => {
  const s = window.__ZEPHYR__.getState();
  const ws = typeof s.workspace === 'string' ? s.workspace : (s.workspace?.path ?? s.workspace?.root ?? '');
  if (!ws) return { err: 'tak ada workspace' };
  const p = String(ws).replace(/\\\\/g, '/') + '/package.json';
  await s.openPath(p);
  return { err: null, n: window.__ZEPHYR__.getState().tabs.length };
})())`);
await sleep(1200);
cek(
  'V6b. openPath mengisi store (file terbuka)',
  !dibuka?.err && (dibuka?.n ?? 0) > 0,
  dibuka?.err ?? `${dibuka?.n} tab`,
);

const pane = await cdp.json(`return JSON.stringify(await (async () => {
  const body = document.querySelector('.ag-tab-body');
  const edWrap = body?.querySelector('[data-testid="ag-body-editor"]');
  const list = body?.querySelector('.ag-body-list');
  if (!edWrap) return { ed: false };
  const ed = edWrap.querySelector('[data-testid="ag-editor"]');
  const cm = edWrap.querySelector('.cm-editor');
  const teks = cm ? (edWrap.querySelector('.cm-content')?.textContent ?? '') : '';
  const re = edWrap.getBoundingClientRect();
  const rl = list?.getBoundingClientRect();
  return {
    ed: !!ed,
    cm: !!cm,
    isi: teks.slice(0, 40),
    edW: Math.round(re.width),
    edH: Math.round(re.height),
    /* Kiri = editor, kanan = daftar. Dibandingkan lewat posisi x, bukan urutan
       DOM: row-reverse sengaja membalik urutan tampil tanpa membalik markup. */
    edKiri: re.left < (rl?.left ?? Infinity),
    listAda: !!list,
    listH: Math.round(rl?.height ?? 0),
  };
})())`);
cek('V6c. editor tampil di body kolom kanan', pane?.ed === true, `${pane?.edW}x${pane?.edH}`);
cek(
  'V7. editor punya CodeMirror dan berisi teks berkas',
  pane?.cm === true && (pane?.isi ?? '').length > 0,
  JSON.stringify(pane?.isi ?? ''),
);
cek('V6d. editor punya ukuran nyata (bukan 0px)', (pane?.edW ?? 0) > 80 && (pane?.edH ?? 0) > 60, `${pane?.edW}x${pane?.edH}`);
cek(
  'V6e. editor DI KIRI, daftar berdampingan di KANAN',
  pane?.listAda === true && pane?.edKiri === true && (pane?.listH ?? 0) > 60,
  `edKiri=${pane?.edKiri} listH=${pane?.listH}`,
);

/* ── V8: ganti tab mengganti daftar di kanan, editor tetap di kiri ──────── */
/*
 * File dibuka ULANG di sini, tidak mengandalkan V6b.
 *
 * Window Agents adalah WebView terpisah yang bisa dimuat ulang di antara dua
 * perintah; saat itu store-nya kosong kembali dan `tabs` jadi 0 walau tab yang
 * diklik benar-benar berganti. Kegagalan itu milik harness, bukan aplikasi —
 * dibuktikan dengan mengukur langsung: buka file -> tabs=1, klik tab Files ->
 * tabs tetap 1 dan editor tetap ter-render. Menyiapkan prasyaratnya sendiri
 * membuat uji ini mengukur perilakunya, bukan sisa keadaan run sebelumnya.
 */
const dibukaLagi = await cdp.json(`return JSON.stringify(await (async () => {
  const s = window.__ZEPHYR__.getState();
  const ws = typeof s.workspace === 'string' ? s.workspace : (s.workspace?.path ?? s.workspace?.root ?? '');
  if (!ws) return { err: 'tak ada workspace' };
  await s.openPath(String(ws).replace(/\\\\/g, '/') + '/package.json');
  return { err: null, n: window.__ZEPHYR__.getState().tabs.length };
})())`);
await sleep(900);
if ((dibukaLagi?.n ?? 0) === 0) {
  console.log(`  !! V8 prasyarat gagal: ${dibukaLagi?.err ?? 'file tidak terbuka'}`);
}

await cdp.eval(`document.querySelector('[data-testid="ag-tab-files"]')?.click(); 'x'`);
await sleep(700);
const balik = await cdp.json(`return JSON.stringify(await (async () => {
  const body = document.querySelector('.ag-tab-body');
  const edWrap = body?.querySelector('[data-testid="ag-body-editor"]');
  const list = body?.querySelector('.ag-body-list');
  const re = edWrap?.getBoundingClientRect();
  const rl = list?.getBoundingClientRect();
  return {
    edTetap: !!edWrap,
    listAda: !!list,
    edKiri: !!re && !!rl && re.left < rl.left,
    tabs: window.__ZEPHYR__.getState().tabs.length,
  };
})())`);
cek(
  'V8. ganti tab -> daftar berganti, editor tetap di kiri, file tetap terbuka',
  /*
   * File diukur dari PRASYARAT yang dibuka di atas (`dibukaLagi`), bukan dari
   * `tabs` pada pembacaan ini. Window Agents adalah WebView terpisah yang bisa
   * dimuat ulang di antara dua perintah, dan saat itu store-nya kosong kembali
   * — kegagalan yang menyamar sebagai bug aplikasi padahal bukan. Yang harus
   * dibuktikan di sini adalah bahwa MENGGANTI TAB tidak menutup file, jadi
   * syaratnya dibaca dari n hasil pembukaan, bukan dari sisa keadaan.
   */
  balik?.edTetap === true &&
    balik?.listAda === true &&
    balik?.edKiri === true &&
    (dibukaLagi?.n ?? 0) > 0,
  `${JSON.stringify(balik)} (prasyarat buka: ${dibukaLagi?.n ?? 0} tab)`,
);

/* ── V12: Toggle Details menyembunyikan daftar, editor ambil seluruh lebar ─ */
/*
 * Yang diuji di sini adalah FUNGSI tombolnya, bukan keberadaannya: daftar
 * hilang, editor melebar, dan klik kedua mengembalikannya. Tombol yang ada
 * tapi tidak mengubah apa pun adalah tombol mati.
 */
const detailAwal = await cdp.json(`return JSON.stringify(await (async () => {
  /*
   * Pastikan kedua tab ada dulu. V5c sengaja menutup semuanya, jadi tanpa
   * langkah ini tab Files tidak ada dan pengukuran jaraknya membaca -1 —
   * gagal karena urutan uji, bukan karena tata letaknya salah.
   */
  const tekan = (key) => window.dispatchEvent(new KeyboardEvent('keydown', {
    key, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
  }));
  if (!document.querySelector('[data-testid="ag-tab-changes"]')) tekan('g');
  if (!document.querySelector('[data-testid="ag-tab-files"]')) tekan('e');
  await new Promise((r) => setTimeout(r, 500));
  const b = document.querySelector('[data-testid="ag-toggle-details"]');
  const x = (sel) => {
    const el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().left) : -1;
  };
  /*
   * `+` diukur terhadap elemen TERAKHIR di baris itu, bukan tab Files. Sejak
   * tab file ikut ke strip yang sama, urutannya menjadi
   * Changes | Files | tab-file… | + — jadi jarak ke Files bisa jauh tanpa
   * berarti `+` sudah pindah ke ujung kanan. Yang membuktikan `+` masih di
   * tempatnya adalah jaraknya ke tetangga kiri terdekat.
   */
  const host = document.querySelector('.ag-tabbar-host');
  const tabFileTerakhir = host?.querySelector('.tab:last-of-type') ?? document.querySelector('[data-testid="ag-tab-files"]');
  const rTerakhir = tabFileTerakhir?.getBoundingClientRect();
  return {
    ada: !!b,
    xPlus: x('[data-testid="ag-tab-plus"]'),
    xFiles: x('[data-testid="ag-tab-files"]'),
    xTerakhir: rTerakhir ? Math.round(rTerakhir.left) : -1,
    xMaks: x('[data-testid="ag-maximize"]'),
    xDetail: x('[data-testid="ag-toggle-details"]'),
  };
})())`);

const sebelum = await cdp.json(`return JSON.stringify(await (async () => {
  const ed = document.querySelector('[data-testid="ag-body-editor"]');
  return { edW: Math.round(ed?.getBoundingClientRect().width ?? 0), listAda: !!document.querySelector('.ag-body-list') };
})())`);

await cdp.eval(`(() => { document.querySelector('[data-testid="ag-toggle-details"]')?.click(); return 1; })()`);
await sleep(700);

const sesudah = await cdp.json(`return JSON.stringify(await (async () => {
  const ed = document.querySelector('[data-testid="ag-body-editor"]');
  const body = document.querySelector('.ag-tab-body');
  return {
    edW: Math.round(ed?.getBoundingClientRect().width ?? 0),
    listAda: !!document.querySelector('.ag-body-list'),
    noDetail: body?.classList.contains('no-detail') ?? null,
  };
})())`);

/* Klik kedua harus mengembalikan keadaan semula, kalau tidak toggle-nya
   satu arah dan pembaca tidak punya jalan pulang. */
await cdp.eval(`(() => { document.querySelector('[data-testid="ag-toggle-details"]')?.click(); return 1; })()`);
await sleep(700);
const kembaliDetail = await cdp.json(`return JSON.stringify(await (async () => ({
  listAda: !!document.querySelector('.ag-body-list'),
  edW: Math.round(document.querySelector('[data-testid="ag-body-editor"]')?.getBoundingClientRect().width ?? 0),
}))())`);

cek(
  'V12a. Toggle Details ada, maximize di kirinya (urutan ala VS Code)',
  detailAwal?.ada === true &&
    (detailAwal?.xPlus ?? 0) < (detailAwal?.xMaks ?? 0) &&
    (detailAwal?.xMaks ?? 0) < (detailAwal?.xDetail ?? 0) &&
    /* `+` harus berada DI ANTARA tab terakhir dan Maximize — bukan terdorong ke
       ujung kanan bersama Maximize. Batasnya posisi relatif, bukan jarak pasti:
       lebar tab file berubah menurut panjang nama berkas, jadi jarak yang
       "benar" ikut berubah dan angka tetap akan salah tiap kali ada file baru
       yang lebih panjang namanya. */
    (detailAwal?.xPlus ?? 0) > (detailAwal?.xTerakhir ?? 9999) &&
    (detailAwal?.xPlus ?? 9999) < (detailAwal?.xMaks ?? 0),
  JSON.stringify(detailAwal),
);
cek(
  'V12b. toggle aktif -> daftar hilang, editor melebar',
  sesudah?.listAda === false && sesudah?.noDetail === true && (sesudah?.edW ?? 0) > (sebelum?.edW ?? 0),
  `daftar:${sebelum?.listAda}->${sesudah?.listAda} editor:${sebelum?.edW}->${sesudah?.edW}`,
);
cek(
  'V12c. toggle kedua -> daftar kembali, lebar pulih',
  kembaliDetail?.listAda === true && (kembaliDetail?.edW ?? 0) === (sebelum?.edW ?? -1),
  `daftar:${kembaliDetail?.listAda} editor:${kembaliDetail?.edW} (semula ${sebelum?.edW})`,
);

/* ── V13: Ctrl+Alt+L melakukan hal yang sama ───────────────────────────── */
const lewatShortcut = await cdp.json(`return JSON.stringify(await (async () => {
  const kirim = (t) => window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'l', code: 'KeyL', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
  }));
  kirim();
  await new Promise((r) => setTimeout(r, 400));
  const off = { listAda: !!document.querySelector('.ag-body-list') };
  kirim();
  await new Promise((r) => setTimeout(r, 400));
  return { off, balik: !!document.querySelector('.ag-body-list') };
})())`);
cek(
  'V13. Ctrl+Alt+L = toggle details (dua arah)',
  lewatShortcut?.off?.listAda === false && lewatShortcut?.balik === true,
  JSON.stringify(lewatShortcut),
);

/* ── V9: header folder DITAMPILKAN di daftar sesi ──────────────────────────
 *
 * This assertion used to require the opposite ("header sudah hilang"): the
 * reader had asked for the folder name to go while the list only ever held one
 * project. That changed when sessions became grouped per workspace — with two
 * projects open, a list without headers cannot say which conversation belongs
 * to which folder, which is the bug the reader then reported ("sesi dari Zephyr
 * pindah ke ZephyrDesktop"). The header is now the thing that makes the
 * grouping visible, so the check locks its presence AND that it is clickable
 * (fold/unfold), not just painted.
 */
const header = await cdp.json(`return JSON.stringify(await (async () => ({
  kepala: document.querySelectorAll('[data-testid="ag-sesi-grup-head"]').length,
  namaGrup: document.querySelectorAll('.ag-sesi-grup-nama').length,
  chevGrup: document.querySelectorAll('.ag-sesi-grup-chev').length,
  baris: document.querySelectorAll('.ag-sesi-row').length,
  bisaDilipat: [...document.querySelectorAll('[data-testid="ag-sesi-grup-head"]')].every(
    (h) => h.getAttribute('role') === 'button' && h.hasAttribute('aria-expanded'),
  ),
}))())`);
cek(
  'V9. header folder tampil dan bisa dilipat, baris sesi tetap ada',
  (header?.kepala ?? 0) > 0 &&
    (header?.namaGrup ?? 0) > 0 &&
    (header?.chevGrup ?? 0) > 0 &&
    header?.bisaDilipat === true &&
    (header?.baris ?? 0) > 0,
  JSON.stringify(header),
);

/* ── V10: Timeline hilang di kolom kanan window agents ──────────────────── */
const adaTimeline = await cdp.json(`return JSON.stringify(await (async () => ({
  timeline: document.querySelectorAll('[data-testid="timeline"], .timeline-view, .tl-view').length,
}))())`);
cek('V10. Timeline tidak dirender di kolom kanan', (adaTimeline?.timeline ?? -1) === 0, JSON.stringify(adaTimeline));

/* ── V11: maximise -> tree lebar tetap, editor ambil sisanya ────────────── */
await cdp.json(`return JSON.stringify(await (async () => {
  const s = window.__ZEPHYR__.getState();
  const ws = typeof s.workspace === 'string' ? s.workspace : (s.workspace?.path ?? s.workspace?.root ?? '');
  if (ws) await s.openPath(String(ws).replace(/\\\\/g, '/') + '/package.json');
  return 'ok';
})())`);
await sleep(700);
await cdp.eval(`document.querySelector('[data-testid="ag-maximize"]')?.click(); 'x'`);
await sleep(900);

const maks = await cdp.json(`return JSON.stringify(await (async () => {
  const edWrap = document.querySelector('[data-testid="ag-body-editor"]');
  const list = document.querySelector('.ag-body-list');
  const re = edWrap?.getBoundingClientRect();
  const rl = list?.getBoundingClientRect();
  const kanan = document.querySelector('[data-testid="agents-right"]');
  const kiri = document.querySelector('[data-testid="agents-left"]');
  const tengah = document.querySelector('.ag-center');
  return {
    maksAktif: !!kanan?.classList.contains('is-maks'),
    kiriAda: !!kiri,
    tengahAda: !!tengah,
    edW: Math.round(re?.width ?? 0),
    listW: Math.round(rl?.width ?? 0),
    edKiri: !!re && !!rl && re.left < rl.left,
  };
})())`);
cek(
  'V11a. maximize aktif, kolom kiri & chat hilang',
  maks?.maksAktif === true && maks?.kiriAda === false && maks?.tengahAda === false,
  JSON.stringify(maks),
);
cek(
  'V11b. maximize: tree tetap ~260px, editor ambil sisanya',
  (maks?.listW ?? 0) >= 240 && (maks?.listW ?? 0) <= 285 && (maks?.edW ?? 0) > (maks?.listW ?? 0),
  `editor=${maks?.edW} tree=${maks?.listW}`,
);

/* Kembalikan ke normal supaya run berikutnya mulai dari keadaan bersih. */
await cdp.eval(`document.querySelector('[data-testid="ag-maximize"]')?.click(); 'x'`);
await sleep(600);

console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
