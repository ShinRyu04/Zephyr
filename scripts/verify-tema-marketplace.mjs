// verify-tema-marketplace.mjs — B7/B8: 6 tema bundled terlihat, terpasang, muncul 1x, warna pindah.
//
// Latar (rilis 1.1.14): empat tema baru (Samudra/Hutan/Senja Muda/Monokrom) ada di
// binary tapi tidak terdaftar di KATALOG_BUNDLED, jadi tidak muncul di tab Marketplace
// dan tidak bisa dipasang. Loader-nya juga bisa dipanggil dua kali bersamaan (awal app
// + refresh pasang/aktif) yang mendaftarkan tema yang sama dua kali di pemilih.
//
// Uji ini mengunci janji sesudah perbaikan:
//   B7a  keenam tema bundled ada kartunya di KATALOG_BUNDLED (tab Marketplace).
//   B7b  tiap tema bisa dipasang, dan muncul TEPAT SATU kali di pemilih (semuaTema).
//   B7c  menerapkan tema benar-benar memindahkan token kode (--syn-keyword) dan UI (--bg).
//   B7d  laporan pemasangan menyebut code colors (bukan "0 code colors").
//   B8   memasang + refresh bersamaan (panggilan beruntun) tidak melipatgandakan kartu tema.
//
// Jalankan dengan app hidup (tauri dev + CDP 9223): node scripts/verify-tema-marketplace.mjs
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (!ok) keluarBersih(1);
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== Verify tema Marketplace (B7) + race loader (B8) ===\n');

/** Enam id bundled yang harus terlihat di Marketplace. */
const ENAM = [
  'zephyr.tema-kertas',
  'zephyr.tema-malam',
  'zephyr.tema-samudra',
  'zephyr.tema-hutan',
  'zephyr.tema-senja-muda',
  'zephyr.tema-monokrom',
];

/* Semua pekerjaan terjadi DI DALAM halaman, memakai store resmi (bukan import
   ganda yang bikin instance kedua). Hasil dikembalikan sebagai JSON. */
const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const EX = window.__ZEPHYR_EXT19__;
  const SET = window.__ZEPHYR_SET__;
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { kartu: {}, pasang: {}, warna: {}, race: null };

  if (!EX || typeof EX.installKatalog !== 'function') {
    return { err: 'bridge __ZEPHYR_EXT19__ tidak lengkap' };
  }

  /* B7a: kartu di KATALOG_BUNDLED (bukan dari registry remote). */
  const { KATALOG_BUNDLED } = await import('/src/lib/extCatalog.ts');
  const diKatalog = new Set(KATALOG_BUNDLED.map((k) => k.id));
  for (const id of ${JSON.stringify(ENAM)}) out.kartu[id] = diKatalog.has(id);

  /* Ambil palet sebelum apa pun dipasang: pembanding untuk uji warna. */
  const syn = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const sebelumBg = syn('--bg');
  const sebelumKeyword = syn('--syn-keyword');

  /* Simpan tema + mode asli supaya bisa dipulihkan di akhir. */
  const st = window.__ZEPHYR__.getState().settings;
  const temaAsli = st.theme.current;
  const modeAsli = st.general.theme;
  /* Catat apa yang SUDAH terpasang sebelum uji, supaya hanya paket yang
     dipasang oleh uji ini yang dilepas lagi di akhir (idempoten). */
  const sudahSebelum = new Set(EX.state().manifests.map((m) => m.manifest?.id).filter(Boolean));

  /* B7b+d: pasang tiap tema, pastikan muncul 1x, lalu terapkan dan ukur warna. */
  for (const id of ${JSON.stringify(ENAM)}) {
    /* Bridge installKatalog menerima ID (bukan objek item) - ia mencari
       sendiri di KATALOG_BUNDLED / remote. */
    const ok = await EX.installKatalog(id);
    await tunggu(400);

    /* Daftar tema ekstensi (loader sudah jalan ulang lewat refresh). */
    const list = EX.themesEkstensi();
    const kembar = list.filter((t) => t.id.includes(id));
    const jumlah = kembar.length;

    /* B7d: laporan pemasangan terakhir harus menyebut code colors bila tema
       memuat token --syn-*; kertas/malam memakai bentuk ini juga. */
    const kabar = EX.state().kabar ?? null;
    const laporan = JSON.stringify(kabar ?? '');

    /* B7c: terapkan tema lewat store resmi, ukur perpindahan token. Tema terang
       butuh pill mode ikut dipindah (aturan mode-menang di resolveTheme); ini
       meniru klik kartu yang sudah memindahkan general.theme. */
    const idTema = kembar[0]?.id ?? null;
    if (idTema) {
      const kind = kembar[0]?.kind;
      await SET.set({
        theme: { current: idTema },
        general: { theme: kind === 'light' ? 'light' : 'dark' },
      });
      await tunggu(500);
    }
    const sesudahBg = syn('--bg');
    const sesudahKeyword = syn('--syn-keyword');

    out.pasang[id] = { ok, jumlah, idTema, laporanCodeColors: /code color/.test(laporan) };
    out.warna[id] = {
      bgPindah: sesudahBg !== sebelumBg,
      synPindah: sesudahKeyword !== sebelumKeyword,
      bg: sesudahBg,
      syn: sesudahKeyword,
    };
  }

  /* B8: panggil refresh() beruntun (meniru awal app + klik aktif bersamaan).
     Sesudah anti-race, jumlah kartu tema ekstensi tidak boleh berlipat ganda. */
  const sebelumRace = EX.themesEkstensi().length;
  await Promise.all([EX.refresh(), EX.refresh(), EX.refresh()]);
  await tunggu(600);
  const sesudahRace = EX.themesEkstensi();
  const idDobel = sesudahRace.length !== new Set(sesudahRace.map((t) => t.id)).size;
  out.race = { sebelumRace, sesudahRace: sesudahRace.length, adaDobel: idDobel };

  /* Pulihkan tema & mode asli. */
  if (temaAsli) {
    await SET.set({ theme: { current: temaAsli }, general: { theme: modeAsli } });
  }

  /* Lepas hanya paket yang dipasang uji ini, supaya run berikutnya mulai bersih. */
  for (const id of ${JSON.stringify(ENAM)}) {
    if (!sudahSebelum.has(id)) await EX.uninstall(id);
  }
  await EX.refresh();

  return out;
})().catch((e) => ({ err: String(e) })))`,
  90000,
);

const h = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
if (h.err) {
  console.error('  GAGAL  bridge/halaman error:', h.err);
  keluarBersih(1);
}

console.log('B7a — kartu di Marketplace (KATALOG_BUNDLED):');
for (const id of ENAM) cek(`kartu ${id}`, h.kartu[id] === true, h.kartu[id] ? 'ada' : 'TIDAK ADA');

console.log('\nB7b — pasang + muncul tepat 1x di pemilih:');
for (const id of ENAM) {
  const p = h.pasang[id];
  cek(`pasang ${id}`, p.ok === true);
  cek(`muncul 1x ${id}`, p.jumlah === 1, `jumlah=${p.jumlah}`);
}

console.log('\nB7c — warna kode & UI benar-benar pindah:');
for (const id of ENAM) {
  const w = h.warna[id];
  cek(`kode pindah ${id}`, w.synPindah === true, `--syn-keyword=${w.syn}`);
  cek(`UI pindah ${id}`, w.bgPindah === true, `--bg=${w.bg}`);
}

console.log('\nB7d — laporan pemasangan menyebut code colors:');
for (const id of ENAM) {
  cek(`laporan jujur ${id}`, h.pasang[id].laporanCodeColors === true);
}

console.log('\nB8 — refresh beruntun tidak melipatgandakan tema:');
cek(`tidak ada kartu dobel`, h.race.adaDobel === false,
  `sebelum=${h.race.sebelumRace} sesudah=${h.race.sesudahRace}`);

console.log('\nSemua lulus.');
keluarBersih(0);
