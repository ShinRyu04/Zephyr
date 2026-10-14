#!/usr/bin/env node
/*
 * uji-memori-sesi.mjs
 *
 * HARNESS MEMORI LINTAS SESI Zeph AI (item backlog `ai-ingat-sesi`).
 *
 * Node biasa, TANPA aplikasi Tauri, exit code = verdict (0 = semua lulus).
 * Yang diuji, sesuai kriteria terima:
 *
 *   (a) tulis entri GLOBAL + entri PER-PROYEK;
 *   (b) BACA ULANG DI PROSES BARU (spawn `node` kedua) - bukti persistensi
 *       lintas sesi/proses, termasuk HAPUS yang dilakukan proses kedua lalu
 *       dibuktikan lagi oleh proses pertama bahwa berkasnya benar berubah;
 *   (c) cap panjang `blokMemori` (<= batasToken * 4 karakter);
 *   (d) dedupe + urutan (entri terbaru menang, duplikat tidak dobel);
 *   (e) `hapus` benar-benar menghapus;
 *   (f) berkas store rusak (JSON/teks sampah) tidak membuat crash;
 *   (g) cetak N/N + exit 0.
 *   (+) KONTROL NEGATIF: kueri yang tidak ada -> kosong; teks tidak layak
 *       diingat -> ditolak; root lain -> entri proyek tidak terlihat;
 *       tanpa root -> lapis global tetap jalan.
 *
 * Semua I/O disuntikkan: `io` berbasis `node:fs` untuk berkas nyata di
 * direktori sementara, jadi modulnya diuji sebagai modul murni tanpa Tauri.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_MODUL = new URL('../src/lib/aiMemori.ts', import.meta.url).href;
const M = await import(URL_MODUL);

let lulus = 0;
const gagal = [];
function cek(nama, ok, detail = '') {
  if (ok) {
    lulus += 1;
    console.log(`  ok    ${nama}`);
  } else {
    gagal.push(nama);
    console.log(`  GAGAL ${nama}${detail ? ` -> ${String(detail).slice(0, 200)}` : ''}`);
  }
}
function bagian(judul) {
  console.log(`\n== ${judul} ==`);
}

/* ── io: berkas nyata di disk (untuk bukti lintas proses) ─────────────── */
function ioDisk() {
  return {
    async ada(j) {
      return existsSync(j);
    },
    async baca(j) {
      return existsSync(j) ? readFileSync(j, 'utf8') : null;
    },
    async tulis(j, t) {
      writeFileSync(j, t, 'utf8');
    },
    async gantiNama(d, k) {
      renameSync(d, k);
    },
  };
}

/* ── io: in-memory (untuk tes murni, tanpa menyentuh disk) ────────────── */
function ioMemori() {
  const isi = new Map();
  return {
    isi,
    async ada(j) {
      return isi.has(j);
    },
    async baca(j) {
      return isi.has(j) ? isi.get(j) : null;
    },
    async tulis(j, t) {
      isi.set(j, String(t));
    },
    async gantiNama(d, k) {
      if (!isi.has(d)) throw new Error(`berkas sementara tidak ada: ${d}`);
      isi.set(k, isi.get(d));
      isi.delete(d);
    },
  };
}

const dir = mkdtempSync(join(tmpdir(), 'zephyr-memori-'));
const JALUR = join(dir, 'ai-memori.json');
const ROOT = 'D:/Kerja/Zephyr';
const ROOT_LAIN = 'D:/Kerja/Repo-Lain';

const TEKS_KEPUTUSAN = 'Kita putuskan memori Zeph AI disimpan di lapis global + per-proyek, bukan satu berkas bebas.';
const TEKS_KERJA = 'Harness scripts/uji-memori-sesi.mjs lulus dan membuktikan persistensi lintas proses.';
const TEKS_PREFERENSI = 'Selalu jawab dalam bahasa Indonesia dan jangan pakai sed untuk menyunting berkas.';

console.log(`modul : ${URL_MODUL}`);
console.log(`berkas store uji : ${JALUR}`);
console.log(`root proyek uji  : ${ROOT} (kunci ${M.kunciProyek(ROOT)})`);

try {
  /* ─────────────── 1. inti murni: kunci proyek ─────────────── */
  bagian('1. kunci proyek (inti murni)');
  const k1 = M.kunciProyek(ROOT);
  const k2 = M.kunciProyek('d:\\kerja\\zephyr\\');
  cek('kunci proyek stabil terhadap huruf besar/kecil + garis miring', k1 === k2, `${k1} vs ${k2}`);
  cek('bentuk kunci <slug>-<6 hex>', /^[a-z0-9]+-[0-9a-f]{6}$/.test(String(k1)), k1);
  cek('root berbeda -> kunci berbeda', k1 !== M.kunciProyek(ROOT_LAIN));
  cek('root null -> kunci null', M.kunciProyek(null) === null);
  cek('root string kosong -> kunci null', M.kunciProyek('   ') === null);

  /* ─────────────── 2. id entri + dedupe bentuk ─────────────── */
  bagian('2. sidik jari entri (dasar dedupe)');
  const idA = M.idEntri('global', null, 'Halo dunia dari memori');
  cek('teks sama -> id sama', idA === M.idEntri('global', null, 'Halo   dunia   dari   memori'));
  cek('lapis berbeda -> id berbeda', idA !== M.idEntri('proyek', k1, 'Halo dunia dari memori'));
  cek('teks berbeda -> id berbeda', idA !== M.idEntri('global', null, 'Halo dunia dari ingatan'));
  cek('bentuk id 6 heksadesimal', /^[0-9a-f]{6}$/.test(idA), idA);

  /* ─────────────── 3. aturan "kapan menulis" ─────────────── */
  bagian('3. aturan tulis (kapan menulis memori) - di kode, bukan di model');
  cek('aturan tulis lengkap 4 jenis', M.ATURAN_TULIS.length === 4 && M.ATURAN_TULIS.map((a) => a.kode).join(',') === 'keputusan,preferensi,kerja,lain');
  cek('teks aturan siap prompt menyebut larangan rahasia', M.ATURAN_TULIS_PROMPT.includes('rahasia') && M.ATURAN_TULIS_PROMPT.includes('keputusan'));
  const nKeputusan = M.layakDiingat(TEKS_KEPUTUSAN);
  cek('kalimat keputusan -> layak/keputusan', nKeputusan.layak && nKeputusan.jenis === 'keputusan', JSON.stringify(nKeputusan));
  const nPreferensi = M.layakDiingat(TEKS_PREFERENSI);
  cek('kalimat preferensi -> layak/preferensi', nPreferensi.layak && nPreferensi.jenis === 'preferensi', JSON.stringify(nPreferensi));
  const nKerja = M.layakDiingat(TEKS_KERJA);
  cek('kalimat hasil kerja -> layak/kerja', nKerja.layak && nKerja.jenis === 'kerja', JSON.stringify(nKerja));
  cek('KONTROL NEGATIF: obrolan pendek -> tidak layak', M.layakDiingat('halo').layak === false);
  cek('KONTROL NEGATIF: pertanyaan -> tidak layak', M.layakDiingat('Apakah memori sudah jalan di sesi ini?').layak === false);
  cek('KONTROL NEGATIF: calon rahasia -> tidak layak', M.layakDiingat('Token API-nya adalah rahasia panjang yang harus diingat selalu').layak === false);

  /* ─────────────── 4. urai: berkas korup tidak crash ─────────────── */
  bagian('4. urai store (tahan berkas rusak)');
  const kosong = M.uraiStore('');
  cek('store kosong -> dokumen kosong tanpa catatan', kosong.dok.entri.length === 0 && kosong.catatan.length === 0);

  let lempar = null;
  let korup = null;
  try {
    korup = M.uraiStore('ini bukan memori sama sekali {{{ bukan json ]]]\n\n#bukan entri\nbaris apa saja');
  } catch (e) {
    lempar = e;
  }
  cek('(f) teks sampah TANPA penanda: tidak melempar', lempar === null, lempar && lempar.message);
  cek('(f) tanpa penanda -> dokumen kosong + catatan', korup && korup.dok.entri.length === 0 && korup.catatan.length > 0);

  const kepalaRusak = `${M.MARKER_MEMORI} {json rusak,,,} -->\n- [2026-10-01] global/keputusan #abc123 — Entri yang masih sah walau metadatanya rusak\nbaris sampah di tengah\n- [2026-10-02] global/kerja #def456 — Entri kedua yang juga masih sah`;
  let korup2 = null;
  let lempar2 = null;
  try {
    korup2 = M.uraiStore(kepalaRusak);
  } catch (e) {
    lempar2 = e;
  }
  cek('(f) metadata JSON rusak: tidak melempar', lempar2 === null, lempar2 && lempar2.message);
  cek('(f) metadata rusak: entri yang masih terbaca dipertahankan', korup2 && korup2.dok.entri.length === 2, korup2 && korup2.dok.entri.length);
  cek('(f) metadata rusak: masalahnya dicatat', korup2 && korup2.catatan.some((c) => c.includes('JSON')), korup2 && korup2.catatan.join(' | '));
  cek('(f) baris sampah dilewati + dicatat', korup2 && korup2.catatan.some((c) => c.includes('tidak dikenali')));

  /* ─────────────── 5. dedupe + entri terbaru menang ─────────────── */
  bagian('5. dedupe & urutan (dalam dokumen)');
  let dok = M.uraiStore('').dok;
  const t1 = M.tambahKeDokumen(dok, { teks: TEKS_KEPUTUSAN, jenis: 'keputusan', lapis: 'global', waktu: '2026-10-01T03:00:00.000Z' }, { root: ROOT });
  const t2 = M.tambahKeDokumen(t1.dok, { teks: 'Kita putuskan memori Zeph AI disimpan di lapis global + per-proyek, bukan satu berkas bebas. ', jenis: 'keputusan', lapis: 'global', waktu: '2026-10-05T03:00:00.000Z' }, { root: ROOT });
  cek('(d) teks sama ditulis dua kali -> tetap satu entri', t2.dok.entri.length === 1, t2.dok.entri.length);
  cek('(d) entri terbaru menang (waktu diperbarui)', t2.dok.entri[0].waktu === '2026-10-05T03:00:00.000Z', t2.dok.entri[0].waktu);
  cek('(d) penanda tanggal ikut waktu terbaru', t2.dok.entri[0].tanggal === M.tanggalDari('2026-10-05T03:00:00.000Z'), t2.dok.entri[0].tanggal);
  cek('(d) id tetap sama walau waktunya berubah', t1.entri.id === t2.entri.id);

  let d3 = M.tambahKeDokumen(t2.dok, { teks: TEKS_KERJA, jenis: 'kerja', lapis: 'proyek', waktu: '2026-10-06T03:00:00.000Z' }, { root: ROOT });
  cek('lapis proyek memakai kunci root', d3.dok.entri.find((e) => e.jenis === 'kerja').proyek === k1);
  const pilih = M.pilihUntukBlok(d3.dok, { root: ROOT });
  cek('urutan blok: keputusan sebelum hasil kerja', pilih[0].jenis === 'keputusan' && pilih[1].jenis === 'kerja', pilih.map((e) => e.jenis).join(','));
  const pilihLain = M.pilihUntukBlok(d3.dok, { root: ROOT_LAIN });
  cek('KONTROL NEGATIF: root lain hanya melihat entri global', pilihLain.length === 1 && pilihLain[0].lapis === 'global', pilihLain.map((e) => e.lapis).join(','));
  const pilihTanpaRoot = M.pilihUntukBlok(d3.dok, { root: null });
  cek('KONTROL NEGATIF: tanpa root tetap jalan dengan lapis global', pilihTanpaRoot.length === 1 && pilihTanpaRoot[0].lapis === 'global');

  /* ─────────────── 6. cap panjang blok prompt ─────────────── */
  bagian('6. blokMemori: cap panjang + pemilihan entri');
  let dokBanyak = M.uraiStore('').dok;
  for (let i = 0; i < 12; i++) {
    dokBanyak = M.tambahKeDokumen(
      dokBanyak,
      {
        teks: `Hasil kerja langkah ${i} pada scripts/uji-memori-sesi.mjs: bagian panjang ${'x'.repeat(40)} selesai dan lulus.`,
        jenis: 'kerja',
        lapis: 'global',
        waktu: `2026-10-${String(10 + i).padStart(2, '0')}T03:00:00.000Z`,
      },
      { root: ROOT },
    ).dok;
  }
  const blok30 = M.blokDariDokumen(dokBanyak, { root: ROOT, batasToken: 60 });
  cek('(c) blok <= batasToken * 4 karakter', blok30.length <= 240, blok30.length);
  cek('(c) blok tidak kosong', blok30.length > 0);
  cek('(c) hanya SEBAGIAN entri yang masuk (ada pemilihan)', blok30.split('\n').length > 1 && blok30.split('\n').length - 1 < dokBanyak.entri.length);
  cek('(c) tiap baris entri dibuka penanda tanggal [YYYY-MM-DD]', blok30.split('\n').slice(1).every((b) => /^- \[\d{4}-\d{2}-\d{2}\] /.test(b)), blok30.split('\n')[1]);
  cek('(c) baris tidak digunting di tengah (isinya utuh dari dokumen)', blok30.split('\n').slice(1).every((b) => dokBanyak.entri.some((e) => b.endsWith(e.teks))));
  cek('(c) batasToken 0 -> string kosong', M.blokDariDokumen(dokBanyak, { root: ROOT, batasToken: 0 }) === '');
  cek('(c) tanpa entri -> string kosong', M.blokDariDokumen(M.uraiStore('').dok, { root: ROOT }) === '');
  const blokKueri = M.blokDariDokumen(dokBanyak, { root: ROOT, batasToken: 200, kueri: 'langkah 2 pada' });
  cek('relevansi: kueri menarik entri yang cocok ke atas', blokKueri.includes('langkah 2 pada') && blokKueri.indexOf('langkah 2 pada') < blokKueri.indexOf('langkah 11') + 1, blokKueri.split('\n')[1]);
  const blokBesok = M.blokDariDokumen(dokBanyak, { root: ROOT, batasToken: 200 });
  const urutanI = blokBesok
    .split('\n')
    .slice(1)
    .map((b) => Number((b.match(/langkah (\d+)/) || [null, '-1'])[1]));
  cek('tanpa kueri: yang terbaru lebih dulu (i menurun)', urutanI.length > 1 && urutanI.every((v, i) => i === 0 || urutanI[i - 1] > v), urutanI.join(','));

  /* ─────────────── 7. cari: termasuk kontrol negatif ─────────────── */
  bagian('7. cari()');
  cek('KONTROL NEGATIF: kueri yang tidak ada -> kosong', M.cariDiDokumen(dokBanyak, 'kata-yang-tidak-ada-sama-sekali', { root: ROOT }).length === 0);
  const cariLangkah = M.cariDiDokumen(dokBanyak, 'langkah 3', { root: ROOT });
  cek('cari kata tunggal menemukan entri', cariLangkah.length === 1 && cariLangkah[0].teks.includes('langkah 3'));
  cek('cari AND: dua kata harus sama-sama ada', M.cariDiDokumen(dokBanyak, 'langkah 3 tidakada', { root: ROOT }).length === 0);
  cek('cari tanpa kueri -> semua yang terlihat, terbaru dulu', M.cariDiDokumen(dokBanyak, '', { root: ROOT })[0].teks.includes('langkah 11'));

  /* ─────────────── 8. hapus + pangkas dalam dokumen ─────────────── */
  bagian('8. hapus & pangkas (dalam dokumen)');
  const targetHapus = dokBanyak.entri[0].id;
  const setelahHapus = M.hapusDiDokumen(dokBanyak, targetHapus);
  cek('(e) hapus benar-benar menghapus', setelahHapus.terhapus && setelahHapus.dok.entri.length === dokBanyak.entri.length - 1);
  cek('(e) entri yang dihapus tidak ada lagi', !setelahHapus.dok.entri.some((e) => e.id === targetHapus));
  cek('(e) hapus id yang tidak ada -> false (tidak melempar)', M.hapusDiDokumen(dokBanyak, 'zzzzzz').terhapus === false);
  const dipangkas = M.pangkas(dokBanyak, 300);
  cek('pangkas: hasilnya muat anggaran', M.rangkaikanStore(dipangkas).length <= 300, M.rangkaikanStore(dipangkas).length);
  cek('pangkas: entri yang dibuang dihitung (dipangkas > 0)', dipangkas.dipangkas > 0 && dipangkas.entri.length < dokBanyak.entri.length);
  cek('pangkas: baris penanda tetap ada', M.rangkaikanStore(dipangkas).startsWith(M.MARKER_MEMORI));

  /* ─────────────── 9. port I/O: tulis atomik + tidak menimpa catatan ─── */
  bagian('9. port I/O (atomik + catatan user aman)');
  const io = ioMemori();
  const jalurMem = 'C:/data/zephyr/ai-memori.json';
  await M.tambah({ teks: TEKS_KEPUTUSAN, jenis: 'keputusan', lapis: 'global' }, { io, jalur: jalurMem, root: ROOT, sekarang: '2026-10-13T05:00:00.000Z' });
  cek('tulis atomik: berkas sementara sudah dibersihkan', [...io.isi.keys()].every((k) => !k.includes('.tmp-')), [...io.isi.keys()].join(','));
  cek('berkas tujuan ada setelah tulis', io.isi.has(jalurMem));
  const isiBerkas = io.isi.get(jalurMem);
  cek('berkas memuat penanda + metadata versi', isiBerkas.startsWith(M.MARKER_MEMORI) && isiBerkas.includes('"versi":1'));
  cek('berkas TIDAK berisi baris kosong (aman untuk pemecah entri Rust)', !isiBerkas.includes('\n\n') && !isiBerkas.includes('\r'));
  const dokLagi = await M.muatSemua({ io, jalur: jalurMem, root: ROOT });
  cek('muatSemua membaca ulang dari berkas', dokLagi.entri.length === 1 && dokLagi.entri[0].teks === TEKS_KEPUTUSAN);
  cek('entri global terbaca walau root berbeda', (await M.muatSemua({ io, jalur: jalurMem, root: ROOT_LAIN })).entri.length === 1);

  const ditolak = await M
    .tambah({ teks: 'halo apa kabar' }, { io, jalur: jalurMem, root: ROOT })
    .then(() => null)
    .catch((e) => e);
  cek('KONTROL NEGATIF: tambah() menolak teks tidak layak diingat', ditolak instanceof Error && /tidak layak diingat/.test(ditolak.message), ditolak && ditolak.message);
  const dipaksa = await M.tambah({ teks: 'halo apa kabar dan ini paksa simpan', lapis: 'global' }, { io, jalur: jalurMem, root: ROOT, paksa: true, sekarang: '2026-10-13T05:10:00.000Z' });
  cek('paksa:true menembus aturan (dengan jejak jenis lain)', dipaksa.jenis === 'lain' && (await M.muatSemua({ io, jalur: jalurMem, root: ROOT })).entri.length === 2);
  await M.tambah({ teks: TEKS_KERJA, jenis: 'kerja', lapis: 'proyek' }, { io, jalur: jalurMem, root: ROOT, sekarang: '2026-10-13T05:20:00.000Z' });
  const semua = await M.muatSemua({ io, jalur: jalurMem, root: ROOT });
  cek('(a) entri global + entri per-proyek tersimpan bersama', semua.entri.filter((e) => e.lapis === 'global').length === 2 && semua.entri.filter((e) => e.lapis === 'proyek').length === 1);
  const cariGlobal = await M.cari('lapis global', { io, jalur: jalurMem, root: ROOT });
  cek('cari() lewat API async menemukan entri', cariGlobal.length === 1 && cariGlobal[0].jenis === 'keputusan');
  cek('KONTROL NEGATIF: cari() kueri tidak ada -> kosong', (await M.cari('zzz-tidak-ada', { io, jalur: jalurMem, root: ROOT })).length === 0);
  const idKerja = semua.entri.find((e) => e.lapis === 'proyek').id;
  cek('(e) hapus() lewat API async berhasil', (await M.hapus(idKerja, { io, jalur: jalurMem, root: ROOT })) === true);
  cek('(e) setelah hapus(), entri benar-benar hilang dari berkas', (await M.muatSemua({ io, jalur: jalurMem, root: ROOT })).entri.length === 2);
  cek('(e) hapus() id yang tidak ada -> false', (await M.hapus('zzzzzz', { io, jalur: jalurMem, root: ROOT })) === false);
  const blokApi = await M.blokMemori(60, { io, jalur: jalurMem, root: ROOT });
  cek('(c) blokMemori() async juga tunduk cap token', blokApi.length <= 240 && blokApi.startsWith(M.JUDUL_BLOK), blokApi.length);

  /* memory.md: catatan user tidak boleh tertimpa */
  let md = 'Catatan user yang tidak boleh hilang begitu saja.';
  const portMd = {
    async baca() {
      return M.entriStore(md);
    },
    async tulis(t) {
      const lama = M.entriStore(md);
      md = lama !== null ? md.replace(lama, t) : `${md}\n\n${t}`;
    },
  };
  await M.tambah({ teks: TEKS_KEPUTUSAN, jenis: 'keputusan', lapis: 'global' }, { port: portMd, root: null, sekarang: '2026-10-13T06:00:00.000Z' });
  cek('memory.md: catatan user TIDAK tertimpa (mode add)', md.includes('Catatan user yang tidak boleh hilang') && md.includes(M.MARKER_MEMORI));
  await M.tambah({ teks: TEKS_KERJA, jenis: 'kerja', lapis: 'proyek' }, { port: portMd, root: ROOT, sekarang: '2026-10-13T06:10:00.000Z' });
  cek('memory.md: penanda hanya SATU entri (mode replace)', md.split(M.MARKER_MEMORI).length === 2 && md.includes('Catatan user yang tidak boleh hilang'));
  cek('memory.md: entri per-proyek ikut tersimpan', md.includes('persistensi lintas proses'));

  /* nilai penuh: mundur anggaran lalu tetap gagal -> error terbaca */
  let selama = null;
  const portPenuh = {
    async baca() {
      return selama;
    },
    async tulis() {
      throw new Error("memory 'memory' is full: 2200 of 2200 characters.");
    },
  };
  const errPenuh = await M.tambah({ teks: TEKS_KEPUTUSAN, jenis: 'keputusan', lapis: 'global' }, { port: portPenuh, root: ROOT })
    .then(() => null)
    .catch((e) => e);
  cek('store penuh: percobaan mundur lalu gagal dengan error asli (bukan crash senyap)', errPenuh instanceof Error && /is full/.test(errPenuh.message), errPenuh && errPenuh.message);
  const posPenuh = { async baca() { return selama; }, async tulis(t) { if (t.length > 1000) throw new Error("hasil penggantian melebihi batas 2200 karakter (2400)."); selama = t; } };
  let dokGemuk = M.uraiStore('').dok;
  for (let i = 0; i < 10; i++) {
    dokGemuk = M.tambahKeDokumen(dokGemuk, { teks: `Hasil kerja panjang nomor ${i} di scripts/uji-memori-sesi.mjs ${'y'.repeat(80)} selesai dan lulus.`, jenis: 'kerja', lapis: 'global', waktu: `2026-09-${String(10 + i).padStart(2, '0')}T03:00:00.000Z` }, { root: ROOT }).dok;
  }
  const tersimpanKecil = await M.simpanDokumen(posPenuh, { ...dokGemuk, entri: [...dokGemuk.entri] }, { anggaran: 1400 });
  cek('store penuh: mundur anggaran sampai muat', selama !== null && selama.length <= 1000, selama && selama.length);
  cek('store penuh: entri hasil pangkas dicatat', tersimpanKecil.dipangkas > 0, tersimpanKecil.dipangkas);

  /* ─────────────── 10. BUKTI LINTAS PROSES ─────────────── */
  bagian('10. persistensi lintas proses (spawn node kedua)');
  const ioA = ioDisk();
  const entriKeputusanA = await M.tambah({ teks: TEKS_KEPUTUSAN, jenis: 'keputusan', lapis: 'global' }, { io: ioA, jalur: JALUR, root: ROOT, sekarang: '2026-10-13T07:00:00.000Z' });
  const entriProyekA = await M.tambah({ teks: TEKS_KERJA, jenis: 'kerja', lapis: 'proyek' }, { io: ioA, jalur: JALUR, root: ROOT, sekarang: '2026-10-13T07:01:00.000Z' });
  await M.tambah({ teks: TEKS_PREFERENSI, lapis: 'global' }, { io: ioA, jalur: JALUR, root: ROOT, sekarang: '2026-10-13T07:02:00.000Z' });
  cek('proses A: berkas store benar-benar ada di disk', existsSync(JALUR));
  const mentahDisk = readFileSync(JALUR, 'utf8');
  cek('proses A: berkas berisi 3 entri', M.uraiStore(mentahDisk).dok.entri.length === 3, M.uraiStore(mentahDisk).dok.entri.length);
  cek('proses A: berkas satu entri Rust (tanpa baris kosong)', !mentahDisk.includes('\n\n'));

  const kodeAnak = [
    "import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';",
    "const M = await import(process.env.MEMORI_MODUL);",
    "const jalur = process.env.MEMORI_JALUR;",
    "const root = process.env.MEMORI_ROOT;",
    "const io = { ada: async (j) => existsSync(j), baca: async (j) => (existsSync(j) ? readFileSync(j, 'utf8') : null), tulis: async (j, t) => writeFileSync(j, t, 'utf8'), gantiNama: async (d, k) => renameSync(d, k) };",
    "const opsi = { io, jalur, root };",
    "const dok = await M.muatSemua(opsi);",
    "const pref = dok.entri.find((e) => e.jenis === 'preferensi');",
    "const kep = dok.entri.find((e) => e.jenis === 'keputusan');",
    "const kej = dok.entri.find((e) => e.jenis === 'kerja');",
    "console.log('PROSES-2 entri=' + dok.entri.length);",
    "for (const e of [...dok.entri].sort((a, b) => a.id.localeCompare(b.id))) {",
    "  console.log('  [' + e.lapis + '/' + e.jenis + '] ' + e.id + ' ' + e.tanggal + ' :: ' + e.teks.slice(0, 70));",
    "}",
    "if (!pref || !kep || !kej) { console.log('PROSES-2 GAGAL: ada entri yang tidak terbaca ulang'); process.exit(3); }",
    "const blok = await M.blokMemori(200, opsi);",
    "if (!blok.includes('2026-10-13')) { console.log('PROSES-2 GAGAL: blok tidak memuat penanda tanggal'); process.exit(4); }",
    "const tidakAda = await M.cari('kueri-yang-tidak-mungkin-ada-xyz', opsi);",
    "if (tidakAda.length !== 0) { console.log('PROSES-2 GAGAL: kontrol negatif kueri'); process.exit(5); }",
    "const hapus = await M.hapus(kep.id, opsi);",
    "if (!hapus) { console.log('PROSES-2 GAGAL: hapus tidak jalan'); process.exit(6); }",
    "const lagi = await M.muatSemua(opsi);",
    "if (lagi.entri.length !== dok.entri.length - 1) { console.log('PROSES-2 GAGAL: jumlah entri setelah hapus salah'); process.exit(7); }",
    "console.log('PROSES-2 hapus ' + kep.id + ' -> sisa ' + lagi.entri.length + ' entri, kerja masih ada=' + lagi.entri.some((e) => e.jenis === 'kerja'));",
    "console.log('PROSES-2 SELESAI');",
  ].join('\n');

  const anak = spawnSync(process.execPath, ['--input-type=module', '-e', kodeAnak], {
    env: { ...process.env, MEMORI_MODUL: URL_MODUL, MEMORI_JALUR: JALUR, MEMORI_ROOT: ROOT },
    encoding: 'utf8',
  });
  console.log('--- keluaran PROSES-2 (node kedua) ---');
  console.log(String(anak.stdout || '').trimEnd());
  if (anak.stderr) console.log(`stderr: ${String(anak.stderr).trim()}`);
  console.log('--- akhir keluaran PROSES-2 ---');
  cek('(b) proses kedua exit 0', anak.status === 0, `status=${anak.status}`);
  cek('(b) proses kedua membaca ulang ketiga entri dari disk', /PROSES-2 entri=3/.test(String(anak.stdout)));
  cek('(b) proses kedua melihat entri global + per-proyek + preferensi', /\[global\/keputusan\]/.test(String(anak.stdout)) && /\[proyek\/kerja\]/.test(String(anak.stdout)) && /\[global\/preferensi\]/.test(String(anak.stdout)));
  cek('(b) proses kedua melihat penanda tanggal di blok', /PROSES-2 SELESAI/.test(String(anak.stdout)));
  const setelahAnak = await M.muatSemua({ io: ioDisk(), jalur: JALUR, root: ROOT });
  cek('(b) hapus oleh proses kedua terlihat di proses pertama (berkas berubah)', setelahAnak.entri.length === 2, setelahAnak.entri.length);
  cek('(e) entri yang dihapus proses kedua benar-benar hilang dari disk', !setelahAnak.entri.some((e) => e.id === entriKeputusanA.id), `${entriKeputusanA.id} masih ada`);
  cek('entri per-proyek + preferensi selamat setelah hapus', setelahAnak.entri.some((e) => e.jenis === 'kerja') && setelahAnak.entri.some((e) => e.jenis === 'preferensi'));
  cek('berkas sementara tulis atomik tidak tertinggal di disk', readdirSync(dir).every((f) => !f.includes('.tmp-')), readdirSync(dir).join(','));

  /* ─────────────── 11. jalur SINKRON untuk perakit prompt ─────────────── */
  bagian('11. blokMemoriTersimpan (jalur sinkron untuk perakit prompt)');
  M.pasangDokumenTersimpan(null);
  cek('cache kosong -> string kosong (pemanggil tidak perlu tahu apa-apa)', M.blokMemoriTersimpan() === '');
  const muatSinkron = await M.muatLengkap({ io: ioDisk(), jalur: JALUR, root: ROOT });
  cek('muatLengkap() mengisi cache', M.dokumenTersimpan() !== null && M.dokumenTersimpan().entri.length === muatSinkron.dok.entri.length);
  const blokSinkron = M.blokMemoriTersimpan(60, { root: ROOT });
  cek('blok sinkron identik dengan blok async (argumen sama)', blokSinkron === (await M.blokMemori(60, { io: ioDisk(), jalur: JALUR, root: ROOT })));
  cek('(c) blok sinkron tunduk cap token', blokSinkron.length <= 240 && blokSinkron.startsWith(M.JUDUL_BLOK), blokSinkron.length);
  cek('blok sinkron memuat penanda tanggal', /^- \[\d{4}-\d{2}-\d{2}\] /m.test(blokSinkron));
  cek('blok sinkron menghormati root (proyek lain tidak lihat entri proyek)', !M.blokMemoriTersimpan(60, { root: ROOT_LAIN }).includes('persistensi lintas proses'));
  cek('blok sinkron batasToken 0 -> kosong', M.blokMemoriTersimpan(0, { root: ROOT }) === '');
  cek('blok sinkron tanpa root -> hanya lapis global', !M.blokMemoriTersimpan(60, { root: null }).includes('persistensi lintas proses'));
  const tambahSinkron = await M.tambah(
    { teks: 'Kita putuskan panel memori menyusul setelah perakit prompt selesai.', jenis: 'keputusan', lapis: 'global' },
    { io: ioDisk(), jalur: JALUR, root: ROOT, sekarang: '2026-10-13T08:00:00.000Z' },
  );
  cek('tambah() memperbarui cache tanpa muat ulang', M.blokMemoriTersimpan(100, { root: ROOT }).includes(tambahSinkron.teks.slice(0, 40)));
  cek('cache sesudah tambah() memuat entri baru', M.dokumenTersimpan().entri.some((e) => e.id === tambahSinkron.id));
  await M.hapus(tambahSinkron.id, { io: ioDisk(), jalur: JALUR, root: ROOT });
  cek('hapus() juga memperbarui cache', !M.dokumenTersimpan().entri.some((e) => e.id === tambahSinkron.id));

  console.log('');
  console.log(`HASIL: ${lulus}/${lulus + gagal.length} LULUS`);
  if (gagal.length) console.log(`gagal: ${gagal.join(' | ')}`);
} catch (e) {
  console.log(`\nHARNESS MELEDAK: ${e && e.stack ? e.stack : e}`);
  gagal.push('harness meledak');
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* direktori sementara, biarkan */
  }
}

const total = lulus + gagal.length;
console.log(`VERDICT: ${lulus}/${total}${gagal.length ? ' — GAGAL' : ' — semua lulus'}`);
process.exit(gagal.length ? 1 : 0);
