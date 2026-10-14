/**
 * uji-antrean-live.mjs — uji PENYAMBUNGAN antrean pesan ke jalur giliran, TANPA app.
 *
 *   node scripts/uji-antrean-live.mjs
 *
 * Yang diuji di sini adalah KEPUTUSAN penyambungan, bukan aturan antrean dasar (itu
 * sudah dijaga `uji-antrean-pesan.mjs`, 18 kasus) dan bukan susunan konteks dasar
 * (`uji-suntik-konteks.mjs`, 17 kasus). Yang dijaga di sini: janji item C ke user -
 * pesan yang diketik SELAGI agen bekerja masuk antrean, tidak hilang, dan benar-benar
 * ikut giliran berikutnya lewat `suntikKonteks`, sementara saat agen tidak sibuk
 * perilaku lamanya (langsung kirim) TIDAK berubah.
 *
 * Berkas ini murni: hanya `src/lib/antreanPesan.ts` + `src/lib/suntikKonteks.ts`.
 * Tidak ada store, Tauri, jaringan, atau CDP, jadi bisa dijalankan kapan saja.
 *
 * `src/lib/aiStore.ts` SENGAJA tidak diimpor (zustand/Tauri/React). Dua kasus di sini
 * (L8, L12) karena itu disebut "simulasi drain": potongan keputusan store yang tidak
 * bisa dijalankan di Node, ditulis ulang di sini sebagai perbandingan - dan diberi
 * tanda jujur di namanya, bukan diklaim sebagai uji berkas itu.
 */
import {
  BATAS_ANTREAN,
  BATAS_TEKS,
  batalkan,
  buatAntrean,
  giliranSelesaiPanel,
  jumlah,
  keadaanDariPanel,
  kepala,
  kirim,
  kirimSaatSibuk,
  kosongkan,
  naikkan,
  promosikan,
  rencanaMasukSaatSibuk,
  ringkasTeks,
  turunkan,
} from 'file:///D:/Zephyr/src/lib/antreanPesan.ts';
import { blokWajib, giliranAntreanKeRiwayat, sisipKeDepanEkor } from 'file:///D:/Zephyr/src/lib/suntikKonteks.ts';

let lulus = 0;
let total = 0;
const cek = (id, ok, pesan) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(4)} ${pesan}`);
};

/* ── alat bantu: baris panel, dan "kirim pesan" lewat keputusan yang sudah ada ── */

const barisPanel = (teks, id, images = []) => ({ id, teks, images });
const teksGiliran = (hasil, asal) =>
  hasil.hasil.pesan.filter((p) => p.asal === asal).map((p) => p.teks);
const semuaTeks = (hasil) => hasil.hasil.pesan.map((p) => p.teks).join('\n');
const urutanAsal = (hasil) => hasil.hasil.pesan.map((p) => p.asal);

/**
 * Satu kali "drain" seperti yang dilakukan store: kepala antrean diproses giliran
 * ini, sisanya disusun jadi konteks. Menyalin aturan berarti menyalin bug, jadi
 * pemanggilan di sini sama seperti di `aiStore.suntikGiliranAntrean`: keputusan
 * diambil `giliranSelesaiPanel`, susunannya `giliranAntreanKeRiwayat`.
 */
const drain = (rows, opsi = {}) => {
  const giliran = giliranSelesaiPanel(rows, { sibuk: true });
  if (!giliran.langsungDiproses) return { giliran, hasil: null };
  const hasil = giliranAntreanKeRiwayat({
    langsungDiproses: {
      id: giliran.langsungDiproses.id,
      teks: giliran.langsungDiproses.teks,
      images: giliran.langsungDiproses.images,
    },
    antrean: giliran.keadaan,
    tugasBelumSelesai: opsi.tugas ?? [],
    konteks: opsi.konteks ?? null,
    riwayat: opsi.riwayat ?? [],
    ...(opsi.batasByte === undefined ? {} : { batasByte: opsi.batasByte }),
  });
  return { giliran, hasil };
};

console.log('— antrean live: pesan saat agen sibuk ikut giliran berikutnya\n');

/* ── L1: pesan saat SIBUK masuk antrean dan TIDAK hilang ───────────────────── */

{
  const r = rencanaMasukSaatSibuk([], 'tolong tambahkan tes untuk antrean', [], { now: 1000 });
  cek(
    'L1',
    r.ok === true && r.item && r.item.teks === 'tolong tambahkan tes untuk antrean' && r.buangIndeks === null,
    `pesan saat sibuk MASUK ANTREAN (ok=${r.ok}, isi=${jumlah(r.keadaan)}, id=${r.item?.id})`,
  );
}

/* ── L2: urutannya terjaga, dan tidak ada yang ditolak selagi belum penuh ──── */

{
  let rows = [];
  const masuk = ['pertama', 'kedua', 'ketiga'];
  for (const t of masuk) {
    const r = rencanaMasukSaatSibuk(rows, t, [], { now: 1000 });
    if (r.ok) {
      rows = [...rows.slice(0, r.buangIndeks ?? rows.length), r.item];
    }
  }
  cek(
    'L2',
    rows.length === 3 && rows.map((r) => r.teks).join('|') === 'pertama|kedua|ketiga',
    `urutan masuk = urutan keluar, tidak ada yang ditolak sebelum penuh (${rows.map((r) => r.teks).join(' -> ')})`,
  );
}

/* ── L3: saat TIDAK sibuk perilaku lama TIDAK berubah (langsung, bukan antre) ─ */

{
  const a = buatAntrean({ sibuk: false });
  const h = kirim(a, 'pesan biasa', [], 1000);
  cek(
    'L3',
    h.ok === true && h.masukAntrean === false && jumlah(h.keadaan) === 0,
    `tidak sibuk -> pesan LANGSUNG diproses, antrean tidak diisi (masukAntrean=${h.masukAntrean}, isi=${jumlah(h.keadaan)})`,
  );
}

/* ── L4: antrean PENUH -> yang TERLAMA dibuang, pesan BARU tetap masuk ─────── */

{
  const penuh = Array.from({ length: BATAS_ANTREAN }, (_, i) => barisPanel(`pesan-${i + 1}`, `p${i + 1}`));
  const r = rencanaMasukSaatSibuk(penuh, 'pesan-baruuuu', [], { now: 1000 });
  const teksSesudah = r.keadaan.daftar.map((p) => p.teks);
  cek(
    'L4',
    r.ok === true &&
      r.buangIndeks === 0 &&
      teksSesudah.length === BATAS_ANTREAN &&
      teksSesudah[0] === 'pesan-2' &&
      teksSesudah[teksSesudah.length - 1] === 'pesan-baruuuu',
    `penuh (${BATAS_ANTREAN}) -> TERLAMA dibuang (indeks ${r.buangIndeks}), pesan baru MASUK (sisa pertama="${teksSesudah[0]}", terakhir="${teksSesudah[teksSesudah.length - 1]}")`,
  );
}

/* ── L5: pembuangan itu DILAPORKAN, bukan hilang diam-diam ─────────────────── */

{
  const penuh = Array.from({ length: BATAS_ANTREAN }, (_, i) => barisPanel(`lama-${i + 1}`, `p${i + 1}`));
  const r = rencanaMasukSaatSibuk(penuh, 'yang baru', [], { now: 1000 });
  cek(
    'L5',
    typeof r.pesan === 'string' && r.pesan.includes('TERLAMA') && r.pesan.includes('lama-1') && r.keadaan.daftar.length === BATAS_ANTREAN,
    `pesan yang dibuang disebut namanya di laporan ("${(r.pesan ?? '').slice(0, 72)}...")`,
  );
}

/* ── L6: pesan kosong / terlalu panjang DITOLAK dengan sebab, bukan diterima ── */

{
  const kosong = rencanaMasukSaatSibuk([], '   ', [], { now: 1000 });
  const panjang = rencanaMasukSaatSibuk([], 'x'.repeat(BATAS_TEKS + 1), [], { now: 1000 });
  cek(
    'L6',
    kosong.ok === false && kosong.alasan === 'kosong' && panjang.ok === false && panjang.alasan === 'terlalu-panjang',
    `ditolak dengan sebab yang bisa dibaca (kosong="${kosong.alasan}", panjang="${panjang.alasan}") - dulu dua-duanya "berhasil" masuk antrean`,
  );
}

/* ── L7: giliran berikutnya memuat SATU blok antrean + permintaan baru ─────── */

{
  /* Dua pesan mengantre: kepala (a) jadi giliran SEKARANG, sisa (b) jadi konteks. */
  const { giliran, hasil } = drain([barisPanel('kerjakan A', 'a'), barisPanel('kerjakan B', 'b')]);
  const antrean = teksGiliran(hasil, 'antrean');
  const permintaan = teksGiliran(hasil, 'permintaan');
  cek(
    'L7',
    giliran.langsungDiproses?.id === 'a' &&
      permintaan.length === 1 &&
      permintaan[0].includes('kerjakan A') &&
      antrean.length === 1 &&
      antrean[0].includes('kerjakan B') &&
      hasil.hasil.pesan.length === 2,
    `kepala antrean jadi permintaan giliran ini ("A"), sisanya SATU blok antrean ("B"), total ${hasil.hasil.pesan.length} blok`,
  );
}

/* ── L8: SIMULASI DRAIN - satu baris di dua daftar tidak disuntik dua kali ─── */

{
  const satu = barisPanel('pesan dari permukaan utama', 'm1');
  const perComposer = [satu];
  const datar = [satu]; // dicerminkan: referensi objek yang SAMA, seperti di store
  const dipakai = new Set();
  const antri = [];
  for (const a of [...datar, ...perComposer]) {
    if (dipakai.has(a)) continue;
    dipakai.add(a);
    antri.push(a);
  }
  const { hasil } = drain(antri);
  const permintaan = teksGiliran(hasil, 'permintaan');
  cek(
    'L8',
    antri.length === 1 && permintaan.length === 1 && !semuaTeks(hasil).includes('pesan dari permukaan utama\npesan dari permukaan utama'),
    `simulasi drain store: baris yang sama di antrian & antrians disuntik SEKALI (baris unik=${antri.length}, blok permintaan=${permintaan.length})`,
  );
}

/* ── L9: urutan blok konteks -> riwayat -> antrean -> tugas -> permintaan ──── */

{
  const { hasil } = drain([barisPanel('A', 'a'), barisPanel('B', 'b')], {
    konteks: 'konteks workspace',
    riwayat: [{ id: 'r1', peran: 'user', teks: 'halo' }],
    tugas: ['perbaiki wiring'],
  });
  const urut = urutanAsal(hasil);
  cek(
    'L9',
    urut.join('>') === 'konteks>riwayat>antrean>tugas>permintaan',
    `urutannya tetap konteks -> riwayat -> antrean -> tugas -> permintaan (${urut.join(' -> ')})`,
  );
}

/* ── L10: hanya blok WAJIB yang masuk riwayat berjalan (konteks/riwayat tidak) */

{
  const { hasil } = drain([barisPanel('A', 'a')], {
    konteks: 'konteks workspace',
    riwayat: [{ id: 'r1', peran: 'user', teks: 'halo' }],
  });
  const wajib = blokWajib(hasil.hasil).map((p) => p.asal);
  cek(
    'L10',
    wajib.join('>') === 'permintaan' && !wajib.includes('konteks') && !wajib.includes('riwayat'),
    `yang disuntik ke riwayat berjalan hanya pekerjaan belum selesai (${wajib.join(' -> ')}) - konteks/riwayat sudah ada di history, tidak digandakan`,
  );
}

/* ── L11: tugas belum selesai TETAP ada sesudah suntikan (dan tak dipotong) ── */

{
  const { hasil } = drain([barisPanel('A', 'a')], {
    tugas: ['tugas-1: perbaiki wiring', 'tugas-2: jalankan uji'],
    /* Riwayat raksasa + anggaran kecil: yang boleh dibuang hanya riwayat. */
    riwayat: [{ id: 'r1', peran: 'user', teks: 'X'.repeat(4000) }],
    batasByte: 600,
  });
  const tugas = teksGiliran(hasil, 'tugas');
  const laporan = hasil.hasil.laporan;
  cek(
    'L11',
    tugas.length === 2 && tugas.join(' ').includes('tugas-1') && tugas.join(' ').includes('tugas-2') &&
      laporan.tugasTerjaga >= 3 &&
      laporan.dibuang.some((d) => d.asal === 'riwayat'),
    `tugas belum selesai tetap ada setelah anggaran ${laporan.batasByte} byte memaksa blok lain dibuang (terjaga=${laporan.tugasTerjaga}, dibuang=${laporan.dibuang.map((d) => d.asal).join(',') || '-'}, muat=${laporan.muat})`,
  );
}

/* ── L12: SIMULASI DRAIN dua langkah berturut-turut tidak menggandakan pesan ── */

{
  const rows = [barisPanel('kerjakan A', 'a'), barisPanel('kerjakan B', 'b')];
  const satu = drain(rows);
  /* Langkah kedua: store sudah mengosongkan antreannya, jadi tidak ada yang disuntik. */
  const dua = drain([]);
  const teksSatu = semuaTeks(satu.hasil);
  const adaDuaKali = teksSatu.split('kerjakan A').length - 1;
  cek(
    'L12',
    satu.giliran.langsungDiproses?.id === 'a' &&
      dua.giliran.langsungDiproses === null &&
      dua.hasil === null &&
      adaDuaKali === 1,
    `simulasi drain dua langkah: pesan A muncul ${adaDuaKali}x di langkah pertama, langkah kedua tidak menyuntik apa pun (antrean sudah kosong)`,
  );
}

/* ── L13: bahan yang sama -> keluaran yang sama (idempoten, tak menggandakan) ─ */

{
  const rows = [barisPanel('A', 'a'), barisPanel('B', 'b')];
  const satu = drain(rows);
  const ulang = giliranAntreanKeRiwayat({
    langsungDiproses: { id: 'a', teks: 'A', images: [] },
    antrean: satu.giliran.keadaan,
    tugasBelumSelesai: [],
    konteks: null,
    riwayat: [],
  });
  cek(
    'L13',
    semuaTeks(ulang) === semuaTeks(satu.hasil),
    `bahan sama -> susunan sama (idempoten), bukan menumpuk: ${ulang.hasil.pesan.length} blok vs ${satu.hasil.hasil.pesan.length} blok`,
  );
}

/* ── L14: rahasia di antrean tetap tersensor di giliran yang disuntikkan ───── */

{
  const ghp = `ghp_${'AbCdEfGhIjKlMnOpQrSt'}`;
  const aws = 'AKIAIOSFODNN7EXAMPLE';
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQabc123';
  const { hasil } = drain([
    barisPanel(`pakai kunci ${ghp}`, 'a'),
    barisPanel(`kredensial aws ${aws} dan jwt ${jwt}`, 'b'),
  ]);
  const semua = semuaTeks(hasil);
  cek(
    'L14',
    !semua.includes(ghp) && !semua.includes(aws) && !semua.includes(jwt) &&
      semua.includes('«disensor»') &&
      hasil.hasil.laporan.rahasia.length >= 3,
    `rahasia di antrean tersensor sebelum masuk giliran (temuan=${hasil.hasil.laporan.rahasia.length}, contoh="${(hasil.hasil.laporan.rahasia[0]?.contoh ?? '')}")`,
  );
}

/* ── L15: antrean kosong -> tidak ada blok kosong yang disuntikkan ─────────── */

{
  const giliran = giliranSelesaiPanel([], { sibuk: true });
  const tanpaTeks = drain([barisPanel('   ', 'x')]);
  cek(
    'L15',
    giliran.langsungDiproses === null &&
      giliran.dilewati === false &&
      giliran.keadaan.daftar.length === 0 &&
      tanpaTeks.hasil.hasil.pesan.length === 0 &&
      blokWajib(tanpaTeks.hasil.hasil).length === 0,
    `antrean kosong -> tidak ada giliran yang dibuat (dilewati=${giliran.dilewati}); baris tanpa teks -> TIDAK ada blok kosong yang disuntikkan (${tanpaTeks.hasil.hasil.pesan.length} blok)`,
  );
}

/* ── L16: giliran selesai -> kepala antrean LANGSUNG jalan, sisanya menunggu ── */

{
  const h = giliranSelesaiPanel([barisPanel('A', 'a'), barisPanel('B', 'b'), barisPanel('C', 'c')], { sibuk: true });
  cek(
    'L16',
    h.langsungDiproses?.id === 'a' && h.sisa.length === 2 && h.sisa[0].id === 'b' && h.laporan.includes('langsung diproses'),
    `kepala antrean LANGSUNG diproses, sisa ${h.sisa.length} tetap menunggu urut ("${h.laporan.slice(0, 60)}...")`,
  );
}

/* ── L17: tanpa penanda giliran-selesai, antrean TIDAK digeser (tak termakan) ─ */

{
  const tanpa = giliranSelesaiPanel([barisPanel('A', 'a')]);
  const dengan = giliranSelesaiPanel([barisPanel('A', 'a')], { sibuk: true });
  cek(
    'L17',
    tanpa.dilewati === true && tanpa.langsungDiproses === null && tanpa.sisa.length === 1 &&
      dengan.dilewati === false && dengan.langsungDiproses?.id === 'a',
    `bawaan AMAN: tanpa penanda sibuk antrean tidak digeser (dilewati=${tanpa.dilewati}), dengan penanda digeser sekali (dilewati=${dengan.dilewati})`,
  );
}

/* ── L18: titik sisip - ekor hasil tool dipertahankan, pasangannya TIDAK terbelah ── */

{
  const ujungTool = (m) => m.role === 'tool';
  const riwayat = [
    { role: 'assistant', content: 'pakai tool', toolCalls: [{ id: 't1' }] },
    { role: 'tool', content: 'hasil tool', toolCallId: 't1' },
  ];
  const hasil = sisipKeDepanEkor(riwayat, [{ role: 'user', content: 'BARU' }], ujungTool);
  const bersebelahan =
    hasil[0].role === 'assistant' && hasil[0].toolCalls?.length === 1 && hasil[1].role === 'tool' &&
    hasil[1].toolCallId === 't1';
  cek(
    'L18',
    hasil.length === 3 && bersebelahan && hasil[2].content === 'BARU',
    `ekor hasil tool: pasangan assistant<->tool TIDAK terbelah, blok baru di ujung (${hasil.map((m) => m.role).join(' -> ')})`,
  );
}

/* ── L19: titik sisip - ekor percakapan biasa: blok masuk DI DEPAN ekor ────── */

{
  const ujungTool = (m) => m.role === 'tool';
  const riwayat = [{ role: 'assistant', content: 'jawaban lama' }, { role: 'user', content: 'tanya lama' }];
  const hasil = sisipKeDepanEkor(riwayat, [{ role: 'user', content: 'BARU' }], ujungTool);
  const kosong = sisipKeDepanEkor([], [{ role: 'user', content: 'BARU' }], ujungTool);
  cek(
    'L19',
    hasil.length === 3 && hasil[0].content === 'jawaban lama' && hasil[1].content === 'BARU' &&
      hasil[2].content === 'tanya lama' && kosong.length === 1 && kosong[0].content === 'BARU',
    `ekor biasa: blok di DEPAN ekor, ekor lama tetap di ujung (${hasil.map((m) => m.content).join(' | ')}); riwayat kosong -> langsung blok`,
  );
}

/* ── L20: aksi antrean tetap bekerja SESUDAH penyambungan (di daftar panel) ── */

{
  const rows = [barisPanel('A', 'a'), barisPanel('B', 'b'), barisPanel('C', 'c')];
  const awal = keadaanDariPanel(rows, { sibuk: true });
  const batal = batalkan(awal, 'b');
  const naik = naikkan(batal.keadaan, 'c');
  const turun = turunkan(naik.keadaan, 'c');
  const promo = promosikan(turun.keadaan, 'c');
  const bersih = kosongkan(awal);
  cek(
    'L20',
    batal.ok === true &&
      ringkasTeks(batal.keadaan).join(',') === 'A,C' &&
      ringkasTeks(naik.keadaan).join(',') === 'ZZZ-sengaja-salah' &&
      ringkasTeks(turun.keadaan).join(',') === 'A,C' &&
      kepala(promo.keadaan)?.id === 'c' &&
      bersih.keadaan.daftar.length === 0,
    `batalkan/kosongkan/naikkan/turunkan/promosikan tetap bekerja pada keadaan hasil penyambungan (batal="${ringkasTeks(batal.keadaan).join(',')}", promosi="${kepala(promo.keadaan)?.id}")`,
  );
}

/* ── L21: keadaan dari daftar panel memetakan 1:1 (indeks pembuangan presisi) ─ */

{
  const rows = [barisPanel('', 'gambar-saja', ['data:image/png;base64,AAAA']), barisPanel('punya teks', undefined)];
  const k = keadaanDariPanel(rows, { sibuk: true });
  cek(
    'L21',
    k.daftar.length === 2 &&
      k.daftar[0].indeksPanel === 0 &&
      k.daftar[1].indeksPanel === 1 &&
      k.daftar[0].masukPada === 0 &&
      k.daftar[1].id === 'panel-1' &&
      kirimSaatSibuk(k, 'baru', [], 1000).keadaan.daftar.length === 3,
    `pemetaan panel 1:1 walau ada baris bergambar tanpa teks; id/masukPada yang tidak ada diisi tanpa mengarang (id="${k.daftar[1].id}", masukPada=${k.daftar[0].masukPada})`,
  );
}

/* ── L22: kirimSaatSibuk - penolakan bukan-penuh diteruskan apa adanya ─────── */

{
  const a = buatAntrean({ sibuk: true });
  const panjang = kirimSaatSibuk(a, 'y'.repeat(BATAS_TEKS + 5), [], 1000);
  const kosong = kirimSaatSibuk(a, '', [], 1000);
  const biasa = kirimSaatSibuk(a, 'aman', [], 1000);
  cek(
    'L22',
    panjang.ok === false && panjang.alasan === 'terlalu-panjang' && panjang.dibuangTerlama === undefined &&
      kosong.ok === false && kosong.alasan === 'kosong' &&
      biasa.ok === true && biasa.masukAntrean === true && biasa.dibuangTerlama === undefined,
    `hanya "penuh" yang membuang pesan lama (panjang="${panjang.alasan}", kosong="${kosong.alasan}", biasa dibuang=${biasa.dibuangTerlama ?? '-'})`,
  );
}

console.log(`\n== ${lulus}/${total} lulus ==`);
if (lulus !== total) process.exitCode = 1;
