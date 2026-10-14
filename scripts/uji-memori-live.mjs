/*
 * Uji LIVE memori lintas sesi Zeph AI (ai-ingat-sesi).
 *
 * Yang dibuktikan, dan kenapa harus di app yang hidup:
 *  1. blok memori benar-benar sampai ke prompt yang DIRAKIT systemPromptFor()
 *     (bukan cuma "tersimpan" menurut modul memori);
 *  2. memori SELAMAT melewati batas sesi: halaman direload (seluruh state modul
 *     di memori hilang), lalu prompt sesi baru memuatnya lagi dari berkas;
 *  3. giliran NYATA (X.send) memanaskan cache lewat segarkanPotretKeadaan(), jadi
 *     klaim "disuntik tiap giliran" diuji di jalur produksi - permintaan yang
 *     keluar ke provider dicegat dan badannya diperiksa;
 *  4. penjaga mutu menolak sampah, dan penghapusan benar-benar mengeluarkan
 *     entri dari prompt.
 *
 * Harness ini TIDAK menguji salinan logika: semua lewat jembatan
 * window.__ZEPHYR_MEMORI__ yang memanggil modul yang sama dengan produksi.
 *
 * Data user tidak dirusak: setiap entri memakai token unik uji-ingat-<cap>
 * dan dihapus lagi di akhir (M10), termasuk sisa token dari run sebelumnya.
 *
 * Catatan penulisan harness (mahal, jangan diulang lagi):
 *  - isi `cdp.runAsync(...)` adalah template literal, jadi JANGAN memakai
 *    backtick di dalam kode halaman - termasuk di dalam komentar - dan jangan
 *    mengandalkan escape backslash: pakai String.fromCharCode(10) untuk baris
 *    baru. Backtick liar menutup template lebih awal dan Node melaporkan galat
 *    sintaks di baris yang sama sekali tidak bersalah.
 *  - `M0.tambah()` TIDAK melempar saat menolak: kembaliannya
 *    { dok, entri, ditolak }. Menolak = entri null + ditolak berisi alasan,
 *    jadi pemeriksaannya membaca nilai itu, bukan try/catch.
 */
import { Cdp, reporter, keluarBersih, tungguBridge, sleep } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';
const TOKEN = `uji-ingat-${Date.now().toString(36)}`;
const TOKEN_PROYEK = `${TOKEN}-proyek`;
const CARI_LUAR = 'uji-ingat-tidak-ada-9f3';
const JUDUL_UJI = `uji-live ${TOKEN}`;
const AWAL_UJI = 'uji-ingat-';

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title || 'Zephyr');
const r = reporter('memori-live');

/** Reload halaman (renderer bisa sudah beku; reload lewat proses browser). */
async function reload() {
  await cdp.send('Page.reload', { ignoreCache: false }, 15000);
  await sleep(1200);
  const hidup = await tungguBridge(cdp, '__ZEPHYR_MEMORI__', 60000);
  await tungguBridge(cdp, '__ZEPHYR_PROMPT__', 30000);
  await tungguBridge(cdp, '__ZEPHYR_AI__', 30000);
  return hidup;
}

/* ─────────────────────── M1: jembatan hidup ─────────────────────────────── */
const m1 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const P0 = window.__ZEPHYR_PROMPT__;
  return {
    ada: !!M0,
    prompt: !!P0,
    batas: M0 ? M0.batasTokenBawaan : 0,
    anggaran: M0 ? M0.anggaranBawaan : 0,
    marker: M0 ? String(M0.marker ?? '') : '',
    judulBlok: M0 ? String(M0.judulBlok ?? '') : '',
  };
`);
r.check(
  'M1',
  m1.ada && m1.prompt && m1.batas > 0 && m1.anggaran > 0 && m1.marker.length > 0 && m1.judulBlok.length > 0,
  `jembatan memori=${m1.ada} prompt=${m1.prompt} batasToken=${m1.batas} anggaran=${m1.anggaran} penanda berkas="${m1.marker.slice(0, 40)}" judul blok="${m1.judulBlok}"`,
);

/* ─────────────── M2: sesi bersih = cache dingin, prompt tanpa memori ────── */
await reload();
const m2 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const P0 = window.__ZEPHYR_PROMPT__;
  const blok = M0.blok();
  const prompt = P0.system('id', '', '');
  /*
   * Judul blok dicari sebagai BARIS SENDIRI, bukan sebagai potongan teks.
   * Blok memori masuk ke prompt sebagai satu paragraf yang baris pertamanya
   * persis judul blok, sementara judul yang sama juga DISEBUT di dalam kalimat
   * aturan memori - jadi includes() biasa selalu benar dan tidak membuktikan
   * apa-apa.
   */
  const baris = String(prompt).split(String.fromCharCode(10)).map((b) => b.trim());
  return {
    dok: M0.dokumen() === null,
    blokKosong: blok === '',
    promptTanpaBlok: !baris.includes(String(M0.judulBlok)),
    panjangPrompt: prompt.length,
  };
`);
r.check(
  'M2',
  m2.dok && m2.blokKosong && m2.promptTanpaBlok,
  `sesudah reload cache kosong=${m2.dok} blok kosong=${m2.blokKosong} prompt tanpa blok memori=${m2.promptTanpaBlok} (panjang prompt ${m2.panjangPrompt}) - jadi blok memori memang datang dari jalur pemuatan tiap giliran, bukan dari bacaan diam-diam di perakit prompt`,
);

/* ─────────────── M3: sampah ditolak, kalimat sungguhan disimpan ─────────── */
const m3 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  /* tambah() MELEMPAR saat menolak (bukan mengembalikan {ditolak}) - jadi ditangkap. */
  const tolak = await tangkap(() => M0.tambah({ teks: 'ok' }));
  const simpan = await tangkap(() => M0.tambah({
    teks: ${JSON.stringify(`${JUDUL_UJI}: keputusan uji live - Zeph menyimpan keputusan penting ke memori lintas sesi supaya sesi berikutnya tidak mulai dari nol.`)},
  }, { paksa: true }));
  const entri = simpan.ok ? simpan.value : null;
  return {
    ditolak: !tolak.ok && /tidak layak|terlalu pendek/.test(String(tolak.message ?? '')),
    alasan: String(tolak.message ?? '').slice(0, 140),
    id: entri && entri.id ? entri.id : null,
    tersimpan: entri && entri.teks ? String(entri.teks).includes(${JSON.stringify(TOKEN)}) : false,
    galatSimpan: simpan.ok ? '' : String(simpan.message ?? '').slice(0, 140),
  };
`);
r.check(
  'M3',
  m3.ditolak && m3.id && m3.tersimpan,
  `teks sampah ditolak=${m3.ditolak} (pesan "${m3.alasan}") · entri uji tersimpan id=${m3.id}${m3.galatSimpan ? ` · GAGAL SIMPAN: ${m3.galatSimpan}` : ''}`,
);

/* ─────────────────── M4: pencarian menemukan entri itu ──────────────────── */
const m4 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const hasil = await M0.cari(${JSON.stringify(TOKEN)});
  const kosong = await M0.cari(${JSON.stringify(CARI_LUAR)});
  return { jumlah: hasil.length, pertama: hasil[0] ? hasil[0].id : null, kosong: kosong.length };
`);
r.check(
  'M4',
  m4.jumlah >= 1 && m4.kosong === 0,
  `cari('${TOKEN}') -> ${m4.jumlah} entri (id ${m4.pertama}) · cari kata yang tidak ada -> ${m4.kosong} entri`,
);

/* ───────── M5: blok memori memuatnya + penyaring lapis proyek ───────────── */
const m5 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const P0 = window.__ZEPHYR_PROMPT__;
  const blok = M0.blok();
  const prompt = P0.system('id', '', '');
  const rootAktif = window.__ZEPHYR__.getState().workspace || null;
  let proyek = null;
  if (rootAktif) {
    const simpan = await tangkap(() => M0.tambah({
      teks: ${JSON.stringify(`${TOKEN_PROYEK}: keputusan uji live - entri lapis proyek hanya boleh muncul saat folder tempat ia ditulis sedang terbuka.`)},
      lapis: 'proyek',
    }, { paksa: true }));
    const entri = simpan.ok ? simpan.value : null;
    proyek = {
      id: entri ? entri.id : null,
      lapis: entri ? entri.lapis : null,
      ditolak: entri ? '' : String(simpan.message ?? '').slice(0, 140),
    };
  }
  return {
    blokToken: blok.includes(${JSON.stringify(TOKEN)}),
    /*
     * Penanda blok = JUDUL_BLOK, bukan MARKER_MEMORI.
     *
     * Pemeriksaan lama menuntut blok memuat penanda BERKAS store, padahal
     * penanda itu kepala berkas memory.md dan tidak pernah ikut ke prompt.
     * Yang membuktikan blok yang disuntik memang blok memori adalah JUDUL_BLOK
     * di baris pertama + baris entri bertanggal di bawahnya.
     */
    blokJudul: blok.trimStart().startsWith(String(M0.judulBlok)),
    blokTgl: (() => {
      const b1 = String(blok).split(String.fromCharCode(10))[1] || '';
      const tgl = b1.slice(3, 13);
      return b1.startsWith('- [') && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(tgl);
    })(),
    promptToken: prompt.includes(${JSON.stringify(TOKEN)}),
    rootAktif,
    proyek,
    tampaLuar: rootAktif ? M0.blok(undefined, { root: 'C:/folder-yang-bukan-proyek-ini' }).includes(${JSON.stringify(TOKEN_PROYEK)}) : null,
    tampalDalam: rootAktif ? M0.blok(undefined, { root: rootAktif }).includes(${JSON.stringify(TOKEN_PROYEK)}) : null,
  };
`);
r.check(
  'M5',
  m5.blokToken && m5.blokJudul && m5.blokTgl,
  `blok memori memuat entri=${m5.blokToken} + judul blok di baris pertama=${m5.blokJudul} + baris entri bertanggal di bawahnya=${m5.blokTgl}`,
);
r.check(
  'M6',
  m5.promptToken,
  `prompt hasil systemPromptFor() memuat entri uji=${m5.promptToken} (root aktif ${m5.rootAktif ?? 'null'})`,
);
r.check(
  'M7',
  m5.rootAktif ? !!(m5.proyek && m5.proyek.lapis === 'proyek' && m5.tampalDalam && !m5.tampaLuar) : true,
  m5.rootAktif
    ? `lapis proyek: id=${m5.proyek && m5.proyek.id} lapis=${m5.proyek && m5.proyek.lapis} · muncul saat root sama=${m5.tampalDalam} · disembunyikan saat root lain=${m5.tampaLuar}${m5.proyek && m5.proyek.ditolak ? ` · DITOLAK: ${m5.proyek.ditolak}` : ''}`
    : 'tanpa folder terbuka: entri lapis proyek tidak bisa ditulis (memang begitu aturannya) - penyaring root belum bisa dibuktikan di sesi ini',
);

/* ── M8: LINTAS SESI - reload (state modul hilang) lalu prompt memuat lagi ─ */
await reload();
const m8 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const P0 = window.__ZEPHYR_PROMPT__;
  const dingin = M0.blok() === '';
  const promptDingin = P0.system('id', '', '').includes(${JSON.stringify(TOKEN)});
  await M0.muat();
  const hangat = M0.blok();
  const promptHangat = P0.system('id', '', '');
  const dok = M0.dokumen();
  return {
    dingin,
    promptDingin,
    hangatToken: hangat.includes(${JSON.stringify(TOKEN)}),
    promptToken: promptHangat.includes(${JSON.stringify(TOKEN)}),
    jumlah: dok && dok.entri ? dok.entri.length : 0,
  };
`);
r.check(
  'M8',
  m8.dingin && !m8.promptDingin && m8.hangatToken && m8.promptToken,
  `sesudah reload: cache dingin=${m8.dingin} prompt tanpa memori=${!m8.promptDingin} -> dimuat dari berkas: blok memuat entri=${m8.hangatToken}, prompt memuat entri=${m8.promptToken} (${m8.jumlah} entri di dokumen) - INI bukti lintas sesi`,
);

/* ── M9: giliran NYATA memanaskan cache (permintaan provider dicegat) ────── */
const m9 = await cdp.runAsync(
  `
  const M0 = window.__ZEPHYR_MEMORI__;
  const X0 = window.__ZEPHYR_AI__;
  const P0 = window.__ZEPHYR_PROMPT__;
  /* cache dikosongkan dulu supaya "terisi" nanti benar-benar hasil giliran nyata */
  M0.pasang(null);
  const sebelum = M0.dokumen() === null;
  const asli = window.fetch;
  const tangkapan = [];
  window.fetch = function (url, init) {
    try {
      tangkapan.push({ url: String(url), body: init && init.body ? String(init.body) : '' });
    } catch (e) { /* alat ukur tidak boleh mengubah perilaku app */ }
    return asli.apply(window, arguments);
  };
  let kirimError = '';
  try {
    await X0.send(${JSON.stringify(`catat: ${TOKEN} sedang diuji lewat giliran nyata`)});
  } catch (e) {
    kirimError = String(e && e.message ? e.message : e).slice(0, 200);
  }
  const batas = Date.now() + 25000;
  while (Date.now() < batas && tangkapan.length === 0) await wait(500);
  window.fetch = asli;
  const prompt = P0.system('id', '', '');
  return {
    sebelum,
    sesudah: M0.dokumen() !== null,
    jaring: tangkapan.length,
    jaringToken: tangkapan.some((t) => t.body.includes(${JSON.stringify(TOKEN)})),
    promptToken: prompt.includes(${JSON.stringify(TOKEN)}),
    url: tangkapan.length ? String(tangkapan[0].url).slice(0, 120) : '',
    kirimError,
  };
`,
  90000,
);
r.check(
  'M9',
  m9.sesudah && m9.promptToken,
  `giliran nyata: cache kosong sebelum=${m9.sebelum} -> terisi sesudah X.send=${m9.sesudah}; permintaan provider dicegat=${m9.jaring} (badan memuat entri uji=${m9.jaringToken}); prompt giliran memuat entri=${m9.promptToken}${m9.kirimError ? ` · catatan jalur kirim: ${m9.kirimError}` : ''}${m9.url ? ` · url: ${m9.url}` : ''}`,
);

/* ─────────────────── M10: bersih-bersih (hapus) + prompt bersih ─────────── */
const m10 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const P0 = window.__ZEPHYR_PROMPT__;
  const semua = await M0.muatSemua();
  const milikUji = (semua.entri || []).filter((e) => String(e.teks).includes(${JSON.stringify(AWAL_UJI)}));
  const hasil = [];
  for (const e of milikUji) hasil.push({ id: e.id, ok: await M0.hapus(e.id) });
  const blok = M0.blok();
  const prompt = P0.system('id', '', '');
  const sisa = ((await M0.muatSemua()).entri || []).filter((e) => String(e.teks).includes(${JSON.stringify(AWAL_UJI)}));
  return {
    dihapus: hasil.length,
    semuaOk: hasil.every((h) => !!h.ok),
    id: hasil.map((h) => h.id),
    sisa: sisa.length,
    bocorKePrompt: prompt.includes(${JSON.stringify(TOKEN)}),
    blokBersih: !blok.includes(${JSON.stringify(TOKEN)}),
  };
`);
r.check(
  'M10',
  m10.semuaOk && m10.sisa === 0 && m10.blokBersih && !m10.bocorKePrompt,
  `dihapus ${m10.dihapus} entri uji=${m10.semuaOk} (${m10.id.join(', ') || 'tidak ada'}) · sisa entri uji=${m10.sisa} · blok bersih=${m10.blokBersih} · prompt bersih=${!m10.bocorKePrompt}`,
);

const ringkas = r.selesai();
await cdp.close();
keluarBersih(ringkas.lulus === ringkas.total ? 0 : 1);