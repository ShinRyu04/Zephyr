/*
 * Periksa kerangka jendela Agents (title bar + sidebar) yang SEDANG HIDUP.
 *
 * `Cdp.attach` sengaja memilih jendela utama di atas target ber-hash (lihat
 * komentar di lib-cdp.mjs), jadi target `#agents` dipilih duluan di sini lewat
 * `Cdp.connect(webSocketDebuggerUrl)` — tanpa itu semua hasilnya terbaca dari
 * jendela editor dan palsu.
 *
 * Kalau jendela Agents belum terbuka, skrip ini membukanya lewat dev bridge
 * `window.__ZEPHYR_NOTIF__.run('agents.openWindow')` di jendela utama lalu
 * menunggu targetnya.
 *
 * Usage: node scripts/uji-agents-kerangka.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';

const port = Number(process.argv[2] || 9223);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

/** Setiap nama (yang tidak kosong) muncul di daftar. */
const containsAll = (daftarNama, wajib) =>
  wajib.every((n) => (daftarNama || []).includes(n));

const daftar = async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const cariAgents = async () => (await daftar()).find((t) => t.type === 'page' && t.url.includes('#agents'));

let page = await cariAgents();

if (!page) {
  const utama = (await daftar()).find((t) => t.type === 'page' && !t.url.includes('#'));
  if (!utama) {
    console.error('tidak ada jendela Zephyr di port', port);
    process.exit(1);
  }
  const cdpUtama = await Cdp.connect(utama.webSocketDebuggerUrl);
  const r = await cdpUtama.eval(
    `(() => {
       const b = window.__ZEPHYR_NOTIF__;
       if (!b || !b.run) return 'no-bridge';
       /* fire-and-forget: invoke-nya async, hasilnya tidak ditunggu di sini
          karena halaman ini akan segera tidak dipakai lagi. */
       void b.run('agents.openWindow');
       return 'ok';
     })()`,
    6000,
  );
  cdpUtama.close();
  console.log('buka jendela agents:', r);
  for (let i = 0; i < 40 && !page; i++) {
    await tidur(500);
    page = await cariAgents();
  }
}

if (!page) {
  console.error('jendela Agents tidak terbuka di port', port);
  process.exit(1);
}

const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
if ((await cdp.eval('1+1', 6000)) !== 2) {
  console.error('target #agents tidak menjawab');
  process.exit(1);
}

/* Tunggu kerangka ter-render: modul AgentsLayout di-lazy, jadi beberapa frame
   lewat dulu sebelum sidebar dan title bar ada di DOM. Jendela yang baru dibuka
   juga belum tentu sudah menjalankan bootstrap store-nya, jadi yang ditunggu
   adalah tulisan "New task" di sidebar — penanda bahwa sidebar sudah hidup. */
await cdp.eval(
  `new Promise((r) => {
     const t0 = performance.now();
     (function cek() {
       const s = document.querySelector('[data-testid="agx-new-task"]');
       if (s || performance.now() - t0 > 20000) r(1);
       else requestAnimationFrame(cek);
     })();
   })`,
  25000,
);

const hasil = await cdp.eval(`(() => {
  const q = (s) => !!document.querySelector(s);
  const teks = (s) => document.querySelector(s)?.textContent?.trim() ?? null;
  const side = document.querySelector('[data-testid="agx-sidebar"]');
  const tb = document.querySelector('[data-testid="agx-titlebar"]');
  const css = (el, p) => (el ? getComputedStyle(el)[p] : null);
  return {
    hash: location.hash,
    root: q('[data-testid="agx-root"]'),
    titlebar: q('[data-testid="agx-titlebar"]'),
    tinggiTitlebar: tb ? Math.round(tb.getBoundingClientRect().height) : null,
    dragRegion: tb ? tb.hasAttribute('data-tauri-drag-region') : false,
    toggleSidebar: q('[data-testid="agx-sidebar-toggle"]'),
    search: q('[data-testid="agx-search"]'),
    /* Urutan tombol di kiri title bar: versi acuan menaruh search SEBELUM
       menu, jadi urutannya diuji dari susunan DOM, bukan hanya keberadaan. */
    urutanKiri: [...document.querySelectorAll('.agx-titlebar-kiri button')].map(
      (b) => b.dataset.testid || b.textContent.trim(),
    ).slice(0, 5),
    menu: ['file', 'edit', 'view', 'help'].map((m) => teks('[data-testid="agx-menu-' + m + '"]')),
    ide: teks('[data-testid="agx-ide"]'),
    /* Kontrol sudut: IDE + garis + tombol panel harus berada DI DALAM
       kotak isi (canvas), bukan title bar, dan tidak membentuk baris sendiri
       (tidak ada elemen agx-subbar). Diuji dari posisi nyata. */
    diDalamCanvas: !!document.querySelector('[data-testid="agx-canvas"] [data-testid="agx-ide"]'),
    subbarAda: !!document.querySelector('[data-testid="agx-subbar"]'),
    ideDiTitlebar: !!document.querySelector('.agx-titlebar [data-testid="agx-ide"]'),
    panelDiTitlebar: !!document.querySelector('.agx-titlebar [data-testid="agx-panel-kanan"]'),
    canvasAtas: (() => {
      const el = document.querySelector('[data-testid="agx-canvas"]');
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    })(),
    ideAtas: (() => {
      const el = document.querySelector('[data-testid="agx-ide"]');
      return el ? Math.round(el.getBoundingClientRect().top) : null;
    })(),
    xIde: (() => {
      const el = document.querySelector('[data-testid="agx-ide"]');
      return el ? Math.round(el.getBoundingClientRect().right) : null;
    })(),
    xPanel: (() => {
      const el = document.querySelector('[data-testid="agx-panel-kanan"]');
      return el ? Math.round(el.getBoundingClientRect().left) : null;
    })(),
    panelKanan: q('[data-testid="agx-panel-kanan"]'),
    garisHalang: document.querySelectorAll('.agx-sudut-halang').length,
    ideBorder: css(document.querySelector('[data-testid="agx-ide"]'), 'borderTopWidth'),
    ideRadius: css(document.querySelector('[data-testid="agx-ide"]'), 'borderTopLeftRadius'),
    winMin: q('[data-testid="agx-win-min"]'),
    winMax: q('[data-testid="agx-win-max"]'),
    winClose: q('[data-testid="agx-win-close"]'),
    sidebar: q('[data-testid="agx-sidebar"]'),
    lebarSidebar: side ? Math.round(side.getBoundingClientRect().width) : null,
    bgSidebar: css(side, 'backgroundColor'),
    newTask: teks('[data-testid="agx-new-task"]'),
    marketplace: teks('[data-testid="agx-marketplace"]'),
    automation: teks('[data-testid="agx-automation"]'),
    artifacts: teks('[data-testid="agx-artifacts"]'),
    navAktif: document.querySelectorAll('.agx-nav.is-aktif').length,
    navIkon: document.querySelectorAll('.agx-nav .agx-ikon').length,
    grup: [...document.querySelectorAll('[data-testid="agx-grup-proyek"], [data-testid="agx-grup-default"]')]
      .map((g) => g.querySelector('.agx-grup-nama')?.textContent?.trim()),
    /* Chevron grup: satu svg, tanpa fill — bukti ikonnya line-style. */
    chevronLine: (() => {
      const s = document.querySelector('.agx-grup-head .agx-ikon');
      if (!s) return null;
      return { stroke: s.getAttribute('stroke'), fill: s.getAttribute('fill'), w: s.getAttribute('stroke-width') };
    })(),
    sesi: document.querySelectorAll('[data-testid="agx-sesi"]').length,
    /* Baris terpilih bisa berupa baris proyek (folder) atau baris riwayat di
       kelompok Default, tergantung sesi aktif punya workspace atau tidak —
       jadi kedua jenis dihitung. */
    sesiAktif: document.querySelectorAll('.agx-sesi.is-aktif').length,
    barisRiwayat: document.querySelectorAll('[data-testid="agx-sesi-riwayat"]').length,
    titik: document.querySelectorAll('.agx-titik').length,
    footerAkun: q('.agx-side-kaki') || q('.agx-avatar'),
    canvas: q('[data-testid="agx-canvas"]'),
    /* Kotak besar tengah: ia sendiri yang menggambar tepi atas + kiri, jadi
       garis itu TIDAK boleh lagi dimiliki title bar maupun sidebar. */
    garisTitlebar: css(tb, 'borderBottomWidth'),
    garisSidebar: css(side, 'borderRightWidth'),
    canvasGaris: (() => {
      const el = document.querySelector('[data-testid="agx-canvas"]');
      if (!el) return null;
      const s = getComputedStyle(el);
      return { atas: s.borderTopWidth, kiri: s.borderLeftWidth, kanan: s.borderRightWidth, bawah: s.borderBottomWidth };
    })(),
    /* Kanan & bawah kotak harus punya jarak ke tepi jendela (tidak mojok). */
    canvasJarak: (() => {
      const el = document.querySelector('[data-testid="agx-canvas"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        kanan: Math.round(window.innerWidth - r.right),
        bawah: Math.round(window.innerHeight - r.bottom),
      };
    })(),
    bgCanvas: css(document.querySelector('[data-testid="agx-canvas"]'), 'backgroundColor'),
    bgTitlebar: css(tb, 'backgroundColor'),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
})()`);

/* Klik "New task" harus benar-benar membuka percakapan kosong yang baru
   dipilih — bukan tombol hiasan. `newChat` membuat entri baru di
   `sessions.items` lalu memilihnya, jadi yang diuji adalah id aktif berganti
   ke sesi yang belum punya pesan.

   Nilai balik `Cdp.eval` yang berbentuk objek kembali sebagai `{}` (hanya
   nilai primitif yang sampai apa adanya), karena itu hasilnya diratakan jadi
   dua angka/string di dalam halaman. */
const ukur = `(() => {
  const ai = window.__ZEPHYR_AI__;
  if (!ai || !ai.store) return "|nostore";
  const st = ai.store.getState();
  const id = st.activeIds["agents"] || "";
  const s = st.sessions.find((x) => x.id === id);
  return id + "|" + (s ? s.messages.length : -1);
})()`;
/* Store bisa belum terpasang pada frame pertama (bootstrap async). Ditunggu
   sebentar di dalam halaman dengan polling, bukan tidur buta. Yang ditunggu
   adalah JEMBATAN store-nya, bukan `__ZEPHYR_AI__` saja: jembatan itu bisa
   sudah ada sementara `.store` belum diisi, dan itu dulu membuat eval ukur
   melempar "Cannot read properties of undefined". */
await cdp.eval(
  `new Promise((r) => {
     const t0 = performance.now();
     (function cek() {
       if (window.__ZEPHYR_AI__ && window.__ZEPHYR_AI__.store) r(1);
       else if (performance.now() - t0 > 15000) r(0);
       else setTimeout(cek, 120);
     })();
   })`,
  20000,
);
const a = String(await cdp.eval(ukur, 6000)).split('|');
/* Klik dikirim sebagai perintah terpisah lalu DOM dibaca ulang setelah React
   sempat mengecat; digabung dalam satu `eval` async, promise-nya diambil
   WebView2 sebelum selesai ("Promise was collected"). */
await cdp.eval(`document.querySelector('[data-testid="agx-new-task"]').click()`, 6000);
await tidur(700);
const b = String(await cdp.eval(ukur, 6000)).split('|');
/* Juga dibuktikan dari DOM: baris terpilih harus ada sesudah klik, dan
   jumlahnya tepat satu — dua baris bertanda aktif berarti sorotannya ambigu. */
const terpilihDiDom = await cdp.eval(`document.querySelectorAll('.agx-sesi.is-aktif').length`, 6000);
/* Baris yang mewakili sesi aktif harus ADA di DOM. Sebelumnya R14 membaca 0
   walau sidebar sehat, karena sesi baru hidup di kelompok Default (baris
   riwayat), dan pada saat itu baris riwayat memang belum punya sorotan. */
const adaBaris = hasil.sesi + hasil.barisRiwayat;

/* Menu File/Edit/View/Help harus benar-benar membuka dropdown berisi item.
   Klik dan pembacaan DOM dipisah: React baru mengecat dropdown pada tick
   berikutnya, jadi membaca di `eval` yang sama selalu dapat null. */
const menuHasil = [];
for (const nama of ['file', 'edit', 'view', 'help']) {
  await cdp.eval(`document.querySelector('[data-testid="agx-menu-${nama}"]').click()`, 6000);
  await tidur(150);
  const isi = await cdp.eval(
    `(() => {
       const d = document.querySelector('[data-testid="agx-dropdown-${nama}"]');
       return d ? d.querySelectorAll('[data-testid="agx-dropdown-item"]').length : -1;
     })()`,
    6000,
  );
  const buka = await cdp.eval(`document.querySelectorAll('.agx-dropdown').length`, 6000);
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`, 6000);
  await tidur(150);
  const masihTerbuka = await cdp.eval(`document.querySelectorAll('.agx-dropdown').length`, 6000);
  menuHasil.push({ nama, isi, buka, masihTerbuka });
}

/* ---- composer ---------------------------------------------------------- */
/* Diuji sebagai tiga keadaan berurutan, sesuai acuan:
   awal (judul + chip ada) -> dropdown Local & folder -> sesudah kirim
   (judul + chip hilang, baris Local/folder TETAP ada di dalam kotak). */

/* Keadaan awal butuh percakapan yang BELUM punya pesan milik jendela ini.
   "New task" dipakai untuk itu — kalau tidak, uji ini mengukur sisa
   percakapan run sebelumnya dan hasilnya berubah-ubah. */
await cdp.eval(`document.querySelector('[data-testid="agx-new-task"]').click()`, 6000);
await tidur(600);

const T = (id) => `document.querySelector('[data-testid="${id}"]')`;
const ada = async (id) => (await cdp.eval(`!!${T(id)}`, 6000)) === true;

/* Judul dibaca SEBELUM dropdown mana pun dibuka: `innerText` seluruh body ikut
   memuat teks menu yang sedang terbuka. Diambil dari `.agx-comp-judul`, bukan
   `[data-testid="agx-comp-judul"]`: kelas itulah yang dipakai komponen, dan
   selektor atribut sempat tidak menemukan apa pun walau `<h1>`-nya ada. */
const judulAwal = async () =>
  (await cdp.eval(`document.querySelector('.agx-comp-judul')?.textContent || ''`, 6000)).trim();

const compAwal = {
  judul: await judulAwal(),
  sub: await ada('agx-comp-kepala'),
  chip: await cdp.eval(`document.querySelectorAll('[data-testid="agx-comp-chip-item"]').length`, 6000),
  /* `Local` + folder adalah KOTAK KEDUA (acuan TRAE): harus berada DI LUAR
     kotak input dan punya garis + radius sendiri. */
  kaki: await cdp.eval(
    `(() => {
       const k=${T('agx-comp-kaki')}, b=${T('agx-comp-kotak')};
       if (!k || !b) return null;
       const s = getComputedStyle(k);
       return {
         diLuar: !b.contains(k),
         garis: parseFloat(s.borderTopWidth) > 0 &&
                parseFloat(s.borderLeftWidth) > 0 &&
                parseFloat(s.borderRightWidth) > 0 &&
                parseFloat(s.borderBottomWidth) > 0,
         radius: parseFloat(s.borderTopLeftRadius),
         celah: Math.round(k.getBoundingClientRect().top - b.getBoundingClientRect().bottom),
       };
     })()`,
    6000,
  ),
  /* Model harus duduk di KANAN, tepat sebelum tombol kirim. */
  kanan: await cdp.eval(
    `(() => {
       const g=${T('agx-comp-kanan')}, m=${T('ai-model-btn')}, k=${T('agx-comp-kirim')};
       if (!g || !m || !k) return null;
       const mg = m.getBoundingClientRect(), kg = k.getBoundingClientRect();
       const gg = g.getBoundingClientRect(), bg = ${T('agx-comp-kotak')}.getBoundingClientRect();
       return {
         sudahDiGrup: g.contains(m) && g.contains(k),
         modelDiKiriKirim: Math.round(mg.right) <= Math.round(kg.left) + 1,
         grupDiKanan: gg.right >= bg.right - 24,
         diBarisSama: Math.abs((mg.top + mg.bottom) / 2 - (kg.top + kg.bottom) / 2) < 6,
       };
     })()`,
    6000,
  ),
  /* Tokoh sudut + tombol jendela: ukurannya mengikuti TRAE (besar). */
  ukuran: await cdp.eval(
    `(() => {
       const r = (el) => (el ? el.getBoundingClientRect() : null);
       const ide = r(${T('agx-ide')}), panel = r(${T('agx-panel-kanan')});
       const mn = r(${T('agx-win-min')}), mx = r(${T('agx-win-max')}), cl = r(${T('agx-win-close')});
       return {
         ide: ide ? { w: Math.round(ide.width), h: Math.round(ide.height) } : null,
         panel: panel ? { w: Math.round(panel.width), h: Math.round(panel.height) } : null,
         win: [mn, mx, cl].map((x) => (x ? [Math.round(x.width), Math.round(x.height)] : null)),
       };
     })()`,
    6000,
  ),
  /* Warna kotak composer = token panel main window, bukan hitam pekat. */
  bgKotak: await cdp.eval(
    `${T('agx-comp-kotak')} ? getComputedStyle(${T('agx-comp-kotak')}).backgroundColor : 'none'`,
    6000,
  ),
  /* Tidak boleh ada mic: acuan punya, Zephyr tidak. */
  adaMic: await cdp.eval(
    `!!document.querySelector('[data-testid*="mic"],[class*="mic"],[aria-label*="icrophone"]')`,
    6000,
  ),
  /* Tombol kirim harus polos: latar transparan, bukan hijau bulat. */
  kirimBg: await cdp.eval(
    `${T('agx-comp-kirim')} ? getComputedStyle(${T('agx-comp-kirim')}).backgroundColor : 'none'`,
    6000,
  ),
  /* Galat runtime React akan menggagalkan seluruh bagian ini. */
  galat: await cdp.eval(
    `(() => {
       const t = document.body.innerText;
       for (const p of ['Maximum update depth', 'Uncaught', 'Minified React error'])
         if (t.includes(p)) return p;
       return '';
     })()`,
    6000,
  ),
};

await cdp.eval(`${T('agx-comp-lokal')}.click()`, 6000);
await tidur(180);
const lokalMenu = await cdp.eval(
  `document.querySelectorAll('[data-testid="agx-comp-lokal-menu"] [role="menuitemradio"]').length`,
  6000,
);
const lokalIsi = await cdp.eval(
  `[...document.querySelectorAll('[data-testid="agx-comp-lokal-menu"] [role="menuitemradio"]')]
     .map((b) => b.textContent.replace('✓','').trim()).join(',')`,
  6000,
);
await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`, 6000);
await tidur(150);
const lokalTutup = await cdp.eval(`!${T('agx-comp-lokal-menu')}`, 6000);

await cdp.eval(`${T('agx-comp-folder')}.click()`, 6000);
await tidur(180);
const folderMenu = await cdp.eval(
  `(() => { const m=${T('agx-comp-folder-menu')};
     if (!m) return '';
     return m.querySelector('.agx-comp-menu-judul')?.textContent + '|' +
            m.querySelectorAll('[data-testid="agx-comp-folder-item"]').length + '|' +
            (m.innerText.includes('Select a folder') ? 1 : 0); })()`,
  6000,
);
await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`, 6000);
await tidur(150);

/* Izin: tombol harus punya dropdown berisi 3 tingkat + Custom, dan memilih
   salah satunya mengubah label tombol (bukti tersambung ke store). */
const izinAwal = await cdp.eval(
  `(() => { const b=${T('agx-comp-izin')};
     return b ? { teks: b.textContent.trim(), mode: b.dataset.approval } : null; })()`,
  6000,
);
await cdp.eval(`${T('agx-comp-izin')}.click()`, 6000);
await tidur(180);
const izinMenu = await cdp.eval(
  `(() => {
     const m = ${T('agx-comp-izin-menu')};
     if (!m) return null;
     const opsi = [...m.querySelectorAll('[role="menuitemradio"]')];
     return {
       isi: opsi.map((b) => b.dataset.testid.replace('agx-comp-izin-', '')).join(','),
       custom: !!${T('agx-comp-izin-custom')},
       tandai: opsi.filter((b) => b.getAttribute('aria-checked') === 'true').length,
     };
   })()`,
  6000,
);
await cdp.eval(`${T('agx-comp-izin-ask')}.click()`, 6000);
await tidur(200);
const izinSesudah = await cdp.eval(
  `(() => { const b=${T('agx-comp-izin')};
     return b ? { teks: b.textContent.trim(), mode: b.dataset.approval,
                  tutup: !${T('agx-comp-izin-menu')} } : null; })()`,
  6000,
);
/* Kembalikan ke mode awal supaya uji berikutnya tidak bergantung pada urutan. */
if (izinAwal && izinAwal.mode && izinAwal.mode !== 'ask') {
  await cdp.eval(`${T('agx-comp-izin')}.click()`, 6000);
  await tidur(150);
  await cdp.eval(`${T('agx-comp-izin-' + izinAwal.mode)}.click()`, 6000);
  await tidur(150);
}

/* Dropdown model: tingginya harus cukup untuk daftar yang bisa di-scroll —
   dulu `maxHeight` dihitung dari toolbar sempit sehingga menunya nyaris nol. */
await cdp.eval(`${T('ai-model-btn')}.click()`, 6000);
await tidur(220);
const modelMenu = await cdp.eval(
  `(() => {
     const m = ${T('ai-model-menu')};
     if (!m) return null;
     const d = m.querySelector('.ai-mp-daftar') || m;
     const cs = getComputedStyle(m);
     return {
       tinggi: Math.round(m.getBoundingClientRect().height),
       maxHeight: cs.maxHeight,
       bisaScroll: cs.overflowY === 'auto' || cs.overflowY === 'scroll'
                  || getComputedStyle(d).overflowY === 'auto',
       isi: m.querySelectorAll('[role="option"]').length,
     };
   })()`,
  6000,
);
await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`, 6000);
await tidur(150);
await cdp.eval(`document.body.click()`, 6000);
await tidur(150);
const modelTutup = await cdp.eval(`!${T('ai-model-menu')}`, 6000);

/* Menulis ke textarea lewat setter prototipe: menugaskan `.value` langsung
   tidak memicu `onChange` React, jadi tombol kirim akan tetap disabled. */
await cdp.eval(
  `(() => {
     const el = ${T('agx-comp-input')};
     const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
     set.call(el, 'uraikan repo ini');
     el.dispatchEvent(new Event('input', { bubbles: true }));
   })()`,
  6000,
);
await tidur(180);
const kirimAktif = await cdp.eval(`!${T('agx-comp-kirim')}.disabled`, 6000);

await cdp.eval(`${T('agx-comp-kirim')}.click()`, 6000);
await tidur(350);
const compChat = {
  judul: await cdp.eval(`document.querySelector('.agx-comp-judul')?.textContent || ''`, 6000),
  kepala: await ada('agx-comp-kepala'),
  chip: await cdp.eval(`document.querySelectorAll('[data-testid="agx-comp-chip-item"]').length`, 6000),
  kaki: await ada('agx-comp-kaki'),
  /* "hilang saat ngechat" (2.png): kotak harus turun ke bawah, bukan tetap
     di tengah. Diukur dari jarak bawah kotak terhadap dasar composer —
     baris `Local` + folder ikut di bawah kotak, jadi yang diukur kotak
     inputnya sendiri, bukan kotak terluar. */
  ratakanBawah: await cdp.eval(
    `(() => {
       const c = ${T('agx-comp')}, k = ${T('agx-comp-kotak')};
       const cc = c.getBoundingClientRect(), kk = k.getBoundingClientRect();
       return Math.round(cc.bottom - kk.bottom) < 80;
     })()`,
    6000,
  ),
};

cdp.close();

const cek = [
  ['R1 kerangka ter-render', hasil.root && hasil.titlebar && hasil.sidebar],
  ['R2 title bar tinggi 42-46', hasil.tinggiTitlebar >= 42 && hasil.tinggiTitlebar <= 46],
  ['R3 title bar = area geser', hasil.dragRegion],
  ['R4 toggle sidebar ada', hasil.toggleSidebar],
  ['R5 menu File/Edit/View/Help', JSON.stringify(hasil.menu) === JSON.stringify(['File', 'Edit', 'View', 'Help'])],
  ['R5b tombol search ada', hasil.search === true],
  [
    'R5c urutan: toggle, search, File, Edit, View',
    JSON.stringify(hasil.urutanKiri) ===
      JSON.stringify(['agx-sidebar-toggle', 'agx-search', 'agx-menu-file', 'agx-menu-edit', 'agx-menu-view']),
  ],
  ['R6 chip IDE ada', (hasil.ide || '').startsWith('IDE')],
  ['R7 kontrol jendela lengkap', hasil.winMin && hasil.winMax && hasil.winClose],
  [
    'R7a IDE + panel DI DALAM kotak isi, tanpa baris baru',
    hasil.subbarAda === false &&
      hasil.diDalamCanvas === true &&
      hasil.ideDiTitlebar === false &&
      hasil.panelDiTitlebar === false &&
      hasil.ideAtas >= hasil.canvasAtas,
  ],
  /* Radius 7px dipakai TRAE untuk tombol sudutnya; yang diuji di sini adalah
     IDE bukan kapsul (border 0, tidak membulat penuh seperti pill). */
  ['R7b IDE tanpa border/kapsul', parseFloat(hasil.ideBorder) === 0 && parseFloat(hasil.ideRadius) <= 8],
  ['R7c tepat satu garis penghalang', Number(hasil.garisHalang) === 1],
  ['R7d tombol panel ada di kanan IDE', hasil.panelKanan === true && hasil.xPanel > hasil.xIde],
  ['R8 sidebar lebar ~248', hasil.lebarSidebar >= 200 && hasil.lebarSidebar <= 300],
  [
    'R9 navigasi atas lengkap (4 baris)',
    hasil.newTask === 'New task' &&
      hasil.marketplace === 'Marketplace' &&
      hasil.automation === 'Automation' &&
      hasil.artifacts === 'My Artifacts',
  ],
  ['R10 New task = baris aktif', hasil.navAktif === 1],
  [
    'R11 ikon line-style (stroke=currentColor, fill=none, 1.2)',
    !!hasil.chevronLine &&
      hasil.chevronLine.stroke === 'currentColor' &&
      hasil.chevronLine.fill === 'none' &&
      hasil.chevronLine.w === '1.2',
  ],
  ['R12 tiap baris nav punya ikon', hasil.navIkon === 4],
  ['R13 grup Projects + Default', containsAll(hasil.grup, ['Projects', 'Default'])],
  ['R14 ada sesi terpilih', hasil.sesiAktif === 1 && adaBaris >= 1],
  ['R15 footer akun SUDAH dihapus', hasil.footerAkun === false],
  ['R16 New task membuka percakapan kosong baru', !!b[0] && b[0] !== a[0] && b[1] === '0'],
  ['R16b baris tetap terpilih sesudah New task', terpilihDiDom === 1],
  ['R17 canvas tengah ada', hasil.canvas],
  ['R18 tanpa scroll horizontal', hasil.overflowX === false],
  [
    'R21 garis hanya milik kotak (title bar & sidebar bersih)',
    parseFloat(hasil.garisTitlebar) === 0 && parseFloat(hasil.garisSidebar) === 0,
  ],
  [
    'R22 canvas polos (tanpa bingkai, radius, atau latar sendiri)',
    !!hasil.canvasGaris &&
      parseFloat(hasil.canvasGaris.atas) === 0 &&
      parseFloat(hasil.canvasGaris.kiri) === 0 &&
      parseFloat(hasil.canvasGaris.kanan) === 0 &&
      parseFloat(hasil.canvasGaris.bawah) === 0,
  ],
  [
    'R23 kanan 6-14px, bawah lebih lega 12-22px',
    !!hasil.canvasJarak && hasil.canvasJarak.kanan >= 6 && hasil.canvasJarak.kanan <= 14 &&
      hasil.canvasJarak.bawah >= 12 && hasil.canvasJarak.bawah <= 22,
  ],
  ['R24 canvas tanpa latar sendiri (ikut panel induk)', !hasil.bgCanvas || hasil.bgCanvas === 'rgba(0, 0, 0, 0)'],
  [
    'R19 tiap menu membuka dropdown berisi item',
    menuHasil.length === 4 &&
      menuHasil.every((m) => typeof m.isi === 'number' && m.isi >= 3 && Number(m.buka) === 1),
  ],
  ['R20 Escape menutup dropdown', menuHasil.every((m) => Number(m.masihTerbuka) === 0)],

  /* ---- composer (AgentsComposer) ---- */
  [
    'R25 composer ter-render tanpa galat React',
    compAwal.galat === '' && compAwal.judul === 'Build With Zephyr' && compAwal.sub === true,
  ],
  ['R26 empat chip kondisi awal', compAwal.chip === 4],
  [
    'R27 Local + folder = kotak KEDUA (di luar kotak input, bergaris sendiri)',
    !!compAwal.kaki &&
      compAwal.kaki.diLuar === true &&
      compAwal.kaki.garis === true &&
      compAwal.kaki.radius >= 6 &&
      compAwal.kaki.celah >= 0 &&
      compAwal.kaki.celah <= 28,
  ],
  [
    'R27b model di kanan, tepat sebelum tombol kirim',
    !!compAwal.kanan &&
      compAwal.kanan.sudahDiGrup === true &&
      compAwal.kanan.modelDiKiriKirim === true &&
      compAwal.kanan.grupDiKanan === true &&
      compAwal.kanan.diBarisSama === true,
  ],
  [
    'R27c tombol IDE + toggle panel besar (TRAE, >=30px)',
    !!compAwal.ukuran &&
      !!compAwal.ukuran.ide &&
      compAwal.ukuran.ide.h >= 30 &&
      !!compAwal.ukuran.panel &&
      compAwal.ukuran.panel.w >= 30 &&
      compAwal.ukuran.panel.h >= 30,
  ],
  [
    'R27d tombol min/max/close 36x32',
    !!compAwal.ukuran &&
      compAwal.ukuran.win.length === 3 &&
      compAwal.ukuran.win.every((w) => w && w[0] === 36 && w[1] === 32),
  ],
  /* `--surface` (#161b22) = token composer panel kanan jendela utama; yang
     dilarang hanya hitam pekat (#000 / #0d1117). */
  [
    'R27e kotak composer bukan hitam (token --surface)',
    compAwal.bgKotak === 'rgb(22, 27, 34)' || compAwal.bgKotak === 'rgb(28, 33, 40)',
  ],
  [
    'R27f tombol izin: dropdown 3 tingkat + Custom',
    !!izinMenu &&
      izinMenu.isi === 'ask,work,auto' &&
      izinMenu.custom === true &&
      Number(izinMenu.tandai) === 1,
  ],
  [
    'R27g memilih izin mengubah mode + menu tertutup',
    !!izinSesudah &&
      izinSesudah.mode === 'ask' &&
      izinSesudah.teks.startsWith('Manual Approval') &&
      izinSesudah.tutup === true,
  ],
  [
    'R27h dropdown model tinggi & bisa di-scroll',
    !!modelMenu &&
      modelMenu.tinggi >= 200 &&
      modelMenu.bisaScroll === true &&
      modelMenu.isi >= 1,
  ],
  ['R27i dropdown model tertutup lagi', modelTutup === true],
  ['R28 tanpa tombol mic', compAwal.adaMic === false],
  [
    'R29 tombol kirim polos (latar transparan)',
    compAwal.kirimBg === 'rgba(0, 0, 0, 0)' || compAwal.kirimBg === 'transparent',
  ],
  ['R30 dropdown Local berisi 5 pilihan', lokalMenu === 5],
  [
    'R31 isi dropdown Local sesuai acuan',
    lokalIsi === 'Local,Cloud,Worktree,Connect SSH,Connect WSL',
  ],
  ['R32 Escape menutup dropdown Local', lokalTutup === true],
  [
    'R33 dropdown folder: judul + item + Select a folder',
    folderMenu.startsWith('Search folders|') && folderMenu.endsWith('|1'),
  ],
  ['R34 tombol kirim aktif sesudah menulis', kirimAktif === true],
  [
    'R35 sesudah kirim: judul, kepala, chip hilang',
    compChat.judul === '' && compChat.kepala === false && compChat.chip === 0,
  ],
  ['R36 sesudah kirim: baris Local/folder tetap ada', compChat.kaki === true],
  ['R37 sesudah kirim: kotak turun ke bawah', compChat.ratakanBawah === true],
];

let lulus = 0;
for (const [nama, ok] of cek) {
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}`);
  if (ok) lulus++;
}
if (lulus !== cek.length) {
  console.log('\n-- keadaan --');
  console.log(JSON.stringify(hasil, null, 2));
}
console.log(`\n== ${lulus}/${cek.length} lulus ==`);
process.exit(lulus === cek.length ? 0 : 1);
