/*
 * Uji LIVE panel Settings > Memori (`src/components/settings/MemoriPanel.tsx`).
 *
 * Yang dibuktikan di app yang hidup:
 *  1. halaman itu memang SAMPAI ke UI (bukan cuma terdaftar di rute): bisa
 *     dibuka lewat `__ZEPHYR_SETTINGS__.buka('memori')` dan section-nya
 *     benar-benar ter-render di DOM;
 *  2. entri yang ditulis modul memori MUNCUL sebagai baris di panel (tanggal +
 *     jenis) dan jumlahnya cocok dengan yang terlihat;
 *  3. tombol hapus BUKAN cuma menyembunyikan baris: entri hilang dari berkas
 *     (dibaca ulang lewat `muatSemua()`), dari blok prompt, DAN tetap hilang
 *     sesudah halaman direload - yang terakhir ini membedakan "hapus di state
 *     React" dari "hapus di berkas";
 *  4. tanpa folder terbuka, lapis proyek ditandai jujur, bukan diklaim kosong;
 *  5. bersih-bersih: seluruh entri bertoken uji dihapus, sisa 0.
 *
 * Semua lewat jembatan produksi (`__ZEPHYR_MEMORI__`, `__ZEPHYR_SETTINGS__`);
 * harness tidak meniru logika apa pun. Data user tidak dirusak: setiap entri
 * memakai token `uji-panel-<cap>` dan dihapus lagi di akhir.
 *
 * Catatan penulisan: isi `cdp.runAsync(...)` adalah template literal - JANGAN
 * memakai backtick di dalam kode halaman (termasuk komentar) dan jangan
 * mengandalkan escape backslash; pakai String.fromCharCode(10) untuk baris baru.
 * `M0.tambah()` TIDAK mengembalikan {ditolak} - ia MELEMPAR saat menolak.
 */
import { Cdp, reporter, keluarBersih, tungguBridge, sleep } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';
const TOKEN = `uji-panel-${Date.now().toString(36)}`;
const AWAL_UJI = 'uji-panel-';
const TEKS = `${TOKEN}: keputusan uji live panel memori - baris ini ditulis modul memori dan harus muncul di halaman Settings, lalu terhapus sampai ke berkasnya.`;

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title || 'Zephyr');
const r = reporter('panel-memori');

/** Buka Settings pada seksi Memori dan tunggu DOM-nya siap. */
async function bukaPanel() {
  await cdp.runAsync(`
    window.__ZEPHYR_SETTINGS__.buka('memori');
    return window.__ZEPHYR_SETTINGS__.section();
  `);
  const batas = Date.now() + 20000;
  let ada = false;
  while (Date.now() < batas && !ada) {
    ada = await cdp.runAsync(`return !!document.querySelector('[data-testid="set-memori"]');`);
    if (!ada) await sleep(400);
  }
  return ada;
}

/* ───────── P1: halaman Memori benar-benar sampai ke UI ──────────────────── */
await tungguBridge(cdp, '__ZEPHYR_SETTINGS__', 60000);
await tungguBridge(cdp, '__ZEPHYR_MEMORI__', 60000);
const seksiAktif = await cdp.runAsync(`
  window.__ZEPHYR_SETTINGS__.buka('memori');
  return window.__ZEPHYR_SETTINGS__.section();
`);
const p1Ada = await bukaPanel();
r.check('P1', seksiAktif === 'memori' && p1Ada, `buka('memori') -> seksi aktif="${seksiAktif}", section ter-render=${p1Ada}`);

/* ───────── P2: judul, keterangan, dan kendali ada ─────────────────────── */
const p2 = await cdp.runAsync(`
  const sec = q('[data-testid="set-memori"]');
  const h2 = sec ? sec.querySelector('h2') : null;
  const note = sec ? sec.querySelector('p.set-note') : null;
  const jumlah = q('[data-testid="memori-jumlah"]');
  const muatUlang = q('[data-testid="memori-muat-ulang"]');
  return {
    judul: h2 ? String(h2.textContent || '').trim() : '',
    desc: note ? String(note.textContent || '').trim().slice(0, 60) : '',
    jumlah: jumlah ? String(jumlah.textContent || '').trim() : null,
    muatUlang: muatUlang ? String(muatUlang.textContent || '').trim() : null,
    subJudul: sec ? Array.prototype.map.call(sec.querySelectorAll('h3'), (x) => String(x.textContent || '').trim()) : [],
  };
`);
r.check(
  'P2',
  p2.judul.length > 0 && p2.desc.length > 0 && p2.jumlah !== null && p2.muatUlang !== null && p2.subJudul.length === 2,
  `judul="${p2.judul}" · keterangan="${p2.desc}..." · hitungan="${p2.jumlah}" · tombol muat ulang="${p2.muatUlang}" · dua lapisan: ${JSON.stringify(p2.subJudul)}`,
);

/* ───────── P3/P4: entri muncul sebagai baris + hitungan cocok ──────────── */
const p3 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  let id = null;
  let galat = '';
  try {
    const entri = await M0.tambah({ teks: ${JSON.stringify(TEKS)} }, { paksa: true });
    id = entri && entri.id ? entri.id : null;
  } catch (e) {
    galat = String(e && e.message ? e.message : e).slice(0, 160);
  }
  const klik = (s) => {
    const el = document.querySelector(s);
    if (el) el.click();
    return !!el;
  };
  klik('[data-testid="memori-muat-ulang"]');
  await wait(1200);
  const baris = document.querySelector('[data-testid="memori-baris-' + id + '"]');
  const meta = document.querySelector('[data-testid="memori-meta-' + id + '"]');
  const terlihat = Array.prototype.filter.call(
    document.querySelectorAll('[data-testid^="memori-baris-"]'),
    (b) => String(b.textContent || '').includes(${JSON.stringify(TOKEN)}),
  ).length;
  return {
    id,
    galat,
    barisAda: !!baris,
    barisTeks: baris ? (baris.querySelector('.set-label') ? String(baris.querySelector('.set-label').textContent || '').slice(0, 50) : '') : '',
    meta: meta ? String(meta.textContent || '').trim() : '',
    hapusAda: !!document.querySelector('[data-testid="memori-hapus-' + id + '"]'),
    terlihat,
    terdaftar: (await M0.muatSemua()).entri.some((e) => e.id === id),
  };
`);
r.check(
  'P3',
  !!p3.id && p3.barisAda && p3.barisTeks.includes(TOKEN) && p3.meta.includes('·') && p3.hapusAda,
  `baris untuk id=${p3.id} muncul di DOM=${p3.barisAda} (teks "${p3.barisTeks}...") · meta="${p3.meta}" (tanggal · jenis) · tombol hapus ada=${p3.hapusAda}${p3.galat ? ` · GALAT TULIS: ${p3.galat}` : ''}`,
);
r.check(
  'P4',
  p3.terlihat >= 1 && p3.terdaftar && p3.terlihat === 1,
  `entri uji terlihat ${p3.terlihat} baris di panel dan ${p3.terdaftar ? 'ada' : 'TIDAK ADA'} di dokumen memori - panel membaca lewat muatLengkap(), bukan salinan React`,
);

/* ───────── P5: hapus benar-benar menghapus (berkas + prompt) ───────────── */
const p5 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const id = ${JSON.stringify(p3.id)};
  const tombol = document.querySelector('[data-testid="memori-hapus-' + id + '"]');
  if (tombol) tombol.click();
  await wait(1500);
  const masihDiDom = !!document.querySelector('[data-testid="memori-baris-' + id + '"]');
  const masihDiBerkas = (await M0.muatSemua()).entri.some((e) => e.id === id);
  const sisaToken = (await M0.muatSemua()).entri.filter((e) => String(e.teks).includes(${JSON.stringify(TOKEN)})).length;
  const blok = M0.blok();
  const prompt = window.__ZEPHYR_PROMPT__.system('id', '', '');
  return {
    tombolAda: !!tombol,
    masihDiDom,
    masihDiBerkas,
    sisaToken,
    blokBersih: !blok.includes(${JSON.stringify(TOKEN)}),
    promptBersih: !prompt.includes(${JSON.stringify(TOKEN)}),
  };
`);
r.check(
  'P5',
  p5.tombolAda && !p5.masihDiDom && !p5.masihDiBerkas && p5.sisaToken === 0 && p5.blokBersih && p5.promptBersih,
  `klik hapus -> hilang dari DOM=${!p5.masihDiDom}, dari berkas=${!p5.masihDiBerkas}, sisa bertoken=${p5.sisaToken} · blok prompt bersih=${p5.blokBersih} · prompt giliran bersih=${p5.promptBersih}`,
);

/* ───────── P6: hapus bertahan sesudah reload (bukti ditulis ke berkas) ─── */
await cdp.send('Page.reload', { ignoreCache: false }, 15000);
await sleep(1500);
await tungguBridge(cdp, '__ZEPHYR_MEMORI__', 60000);
const p6 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const ada = (await M0.muatSemua()).entri.some((e) => String(e.teks).includes(${JSON.stringify(TOKEN)}));
  const panel = await (async () => {
    window.__ZEPHYR_SETTINGS__.buka('memori');
    return true;
  })();
  return { ada, panel };
`);
const domP6 = await (async () => {
  const batas = Date.now() + 20000;
  let hasil = { ada: false };
  while (Date.now() < batas && !hasil.ada) {
    hasil = await cdp.runAsync(`
      return {
        ada: !!document.querySelector('[data-testid="set-memori"]'),
        barisToken: Array.prototype.filter.call(
          document.querySelectorAll('[data-testid^="memori-baris-"]'),
          (b) => String(b.textContent || '').includes(${JSON.stringify(TOKEN)}),
        ).length,
      };
    `);
    if (!hasil.ada) await sleep(400);
  }
  return hasil;
})();
r.check(
  'P6',
  !p6.ada && domP6.ada && domP6.barisToken === 0,
  `sesudah reload: entri uji masih ada di berkas=${p6.ada} · panel kembali ter-render=${domP6.ada} · baris bertoken di panel=${domP6.barisToken} - jadi penghapusan benar-benar tersimpan di berkas, bukan cuma di state React`,
);

/* ───────── P7: tanpa workspace, lapis proyek dinyatakan jujur ─────────── */
const p7 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const root = window.__ZEPHYR__.getState().workspace || null;
  const tanpaProyek = q('[data-testid="memori-tanpa-proyek"]');
  const barisProyek = Array.prototype.filter.call(
    document.querySelectorAll('[data-testid^="memori-meta-"]'),
    (m) => String(m.textContent || '').indexOf(String(M0.judulBlok).slice(0, 0)) === -1,
  ).length;
  return {
    root,
    tanpaProyek: !!tanpaProyek,
    teksTanpaProyek: tanpaProyek ? String(tanpaProyek.textContent || '').trim().slice(0, 70) : '',
    barisProyek,
  };
`);
r.check(
  'P7',
  p7.root ? !p7.tanpaProyek : p7.tanpaProyek,
  p7.root
    ? `folder terbuka (${p7.root}): catatan "tanpa proyek" tidak muncul=${!p7.tanpaProyek} (lapis proyek ditampilkan seperti mestinya)`
    : `tanpa folder terbuka: panel menampilkan catatan "${p7.teksTanpaProyek}" alih-alih mengklaim lapis proyek kosong - batasnya dinyatakan, bukan disembunyikan`,
);

/* ───────── P8: bersih-bersih sisa token uji ───────────────────────────── */
const p8 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const semua = await M0.muatSemua();
  const milikUji = (semua.entri || []).filter((e) => String(e.teks).includes(${JSON.stringify(AWAL_UJI)}));
  const hasil = [];
  for (const e of milikUji) hasil.push(await M0.hapus(e.id));
  const sisa = ((await M0.muatSemua()).entri || []).filter((e) => String(e.teks).includes(${JSON.stringify(AWAL_UJI)}));
  window.__ZEPHYR_SETTINGS__.tutup();
  return { dihapus: hasil.length, ok: hasil.every((h) => !!h), sisa: sisa.length, dibuka: window.__ZEPHYR__.getState().settingsOpen };
`);
r.check(
  'P8',
  p8.ok && p8.sisa === 0 && !p8.dibuka,
  `bersih-bersih: dihapus ${p8.dihapus} sisa entri uji (semua ok=${p8.ok}) · sisa=${p8.sisa} · Settings ditutup=${!p8.dibuka}`,
);

const ringkas = r.selesai();
await cdp.close();
keluarBersih(ringkas.lulus === ringkas.total ? 0 : 1);
