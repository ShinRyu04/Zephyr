/**
 * uji-hydrafusion.mjs - bukti logika HydraFusion: klasifikasi, eskalasi, batas biaya.
 *
 *   node scripts/uji-hydrafusion.mjs
 *
 * Kenapa berkas ini ada: HydraFusion memakai LEBIH BANYAK request daripada
 * jalur biasa, dan yang mengendalikannya adalah kode yang tidak terlihat
 * pembaca. Kalau klasifikasinya salah, tugas ringan naik ke model mahal; kalau
 * batasnya bocor, satu pertanyaan berubah jadi tiga tagihan; kalau jalur
 * kritik-revisinya salah urutan, yang direvisi adalah naskah yang belum ada.
 *
 * Bedanya dari uji-aturan-tool.mjs: berkas itu mencerminkan logika di dalam
 * berkas uji (karena fungsinya tidak diekspor). Di sini modulnya BENAR-BENAR
 * dimuat - lewat Vite dalam mode SSR - sehingga yang diuji adalah kode yang
 * benar-benar dikirim, bukan salinannya. Salinan akan menyimpang pada
 * penyetelan pertama, dan ujinya tetap hijau sambil berbohong.
 *
 * Murni: tidak menempel ke CDP, tidak butuh app/WebView2 jalan. Hanya butuh
 * node_modules (vite) seperti uji lain di folder ini.
 *
 * Cara membaca hasilnya: setiap baris "Hn" adalah satu perilaku yang dikunci.
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';
import { createServer } from 'vite';

const R = reporter('hydrafusion');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* ── Muat modul yang sebenarnya ───────────────────────────────────────── */

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let H;
try {
  H = await server.ssrLoadModule('/src/lib/hydraFusion.ts');
} catch (e) {
  R.check('H0', false, `modul hydraFusion.ts gagal dimuat: ${e && e.message}`);
  await server.close();
  R.selesai();
  process.exit(1);
}
await server.close();

const {
  bacaPengaturan,
  klasifikasiChat,
  rencanaHydra,
  jalankanHydra,
  deteksiGagal,
  bersihkanPenanda,
  pesanUntuk,
  tingkatKandidat,
  parseTierRef,
  hydraSiapkan,
  hydraCatat,
  hydraAmbil,
  hydraAktif,
  hydraLupakan,
  HYDRA_MAX_REQUESTS_BAWAAN,
  HYDRA_MAX_REQUESTS_LIMIT,
  HYDRA_MAKS_ESKALASI,
  HYDRA_PENANDA_RAGU,
} = H;

/* ── Kandidat contoh: satu per tingkat, ditandai dari metadata sendiri ─── */

const murah = { provider: 'p1', id: 'mini-x', label: 'Mini X', note: 'fast, cheap' };
const sedang = { provider: 'p2', id: 'std-y', label: 'Std Y' };
const kuat = { provider: 'p3', id: 'opus-z', label: 'Opus Z', note: 'reasoning' };
const semua = [murah, sedang, kuat];

const masuk = (teks, extra = {}) => ({
  teks,
  kandidat: semua,
  cadangan: { provider: 'chat', model: 'mr-vip' },
  pengaturan: { enabled: true, maxRequests: 3, tiers: {} },
  ...extra,
});

const ringan = 'ringkas ini';
const sedangTeks = 'tolong jelaskan struktur folder proyek ini dengan cukup detail supaya saya paham semuanya';
const beratTeks = 'tolong refactor arsitektur modul ini, kenapa lambat?';

/* ── 1. Pengaturan dan batasnya ───────────────────────────────────────── */

R.check('H1', HYDRA_MAX_REQUESTS_BAWAAN === 3, `bawaan 3 request per run (${HYDRA_MAX_REQUESTS_BAWAAN})`);
R.check('H2', HYDRA_MAX_REQUESTS_LIMIT >= 2, `plafon keras ada dan lebih longgar dari bawaan (${HYDRA_MAX_REQUESTS_LIMIT})`);

const p0 = bacaPengaturan(undefined);
R.check('H3', p0.enabled === false, 'tanpa setting: HydraFusion MATI (bukan menyala diam-diam)');
R.check('H4', p0.maxRequests === HYDRA_MAX_REQUESTS_BAWAAN, `tanpa setting: batas = bawaan (${p0.maxRequests})`);

R.check('H5', bacaPengaturan({ maxRequests: 0 }).maxRequests === 1, 'batas 0 dinaikkan ke 1 - tidak ada run tanpa request');
R.check('H6', bacaPengaturan({ maxRequests: 99 }).maxRequests === HYDRA_MAX_REQUESTS_LIMIT, `batas 99 dipotong ke plafon (${HYDRA_MAX_REQUESTS_LIMIT})`);
R.check('H7', bacaPengaturan({ maxRequests: Number.NaN }).maxRequests === HYDRA_MAX_REQUESTS_BAWAAN, 'NaN jatuh ke bawaan, bukan merusak hitungan');
R.check('H8', bacaPengaturan({ maxRequests: 2.7 }).maxRequests === 2, 'batas dibulatkan ke bawah, tidak jadi 2.7 request');

R.check('H9', JSON.stringify(parseTierRef('a/b')) === JSON.stringify({ provider: 'a', model: 'b' }), 'rujukan tier "provider/model" terbaca');
R.check('H10', parseTierRef('tanpa-garis-miring') === null, 'rujukan cacat -> null, bukan tebakan');
R.check('H11', parseTierRef('/model') === null && parseTierRef('provider/') === null, 'provider atau model kosong -> null');

/* ── 2. Klasifikasi tugas untuk chat utama ────────────────────────────── */

R.check('H12', tingkatKandidat(murah) === 'cheap' && tingkatKandidat(kuat) === 'strong', 'tingkat dibaca dari metadata model');
R.check('H13', tingkatKandidat(sedang) === 'mid', 'model tanpa penanda = "mid" - tidak dikenal bukan berarti murah');

const kRingan = klasifikasiChat(ringan);
R.check('H14', kRingan.tingkat === 'cheap', `permintaan pendek -> murah (${kRingan.tingkat}/${kRingan.kategori})`);
R.check('H15', kRingan.sinyal.panjangPrompt === ringan.length, 'panjang prompt dilaporkan apa adanya');

const kSedang = klasifikasiChat(sedangTeks);
R.check('H16', kSedang.tingkat === 'mid', `permintaan biasa -> sedang (${kSedang.tingkat}/${kSedang.kategori})`);

const kBerat = klasifikasiChat(beratTeks);
R.check('H17', kBerat.tingkat === 'strong', `kata kunci berat -> kuat (${kBerat.tingkat})`);
R.check('H18', kBerat.sinyal.kataKunci.includes('refactor') && kBerat.sinyal.kataKunci.includes('kenapa'), `kata kunci tercatat (${kBerat.sinyal.kataKunci.join('/')})`);

const kBerkas = klasifikasiChat('ubah src/a.ts, src/b.ts, dan src/c.ts');
R.check('H19', kBerkas.sinyal.berkas >= 3, `jumlah berkas yang tersentuh dihitung (${kBerkas.sinyal.berkas})`);
R.check('H20', kBerkas.tingkat === 'strong', 'tiga berkas = tugas berat, walau kalimatnya pendek');

const kBlok = klasifikasiChat('ini kodenya:\n```ts\nconst a = 1;\n```');
R.check('H21', kBlok.sinyal.blokKode >= 1, `blok kode dihitung (${kBlok.sinyal.blokKode})`);
R.check('H22', kBlok.tingkat === 'strong', 'satu blok kode = tugas berat');

R.check('H23', klasifikasiChat('').sinyal.panjangPrompt === 0, 'teks kosong tidak melempar error');

/* ── 3. Rencana: tiga jalur ───────────────────────────────────────────── */

const rSatu = rencanaHydra(masuk(ringan));
R.check('H24', rSatu.jalur === 'satu', `tugas gampang -> SATU MODEL (${rSatu.jalur})`);
R.check('H25', rSatu.langkah.length === 1, `jalur satu = satu request (${rSatu.langkah.length})`);
R.check('H26', rSatu.langkah[0].tier === 'cheap', `rung pertama murah (${rSatu.langkah[0].tier})`);

const rEsk = rencanaHydra(masuk(sedangTeks));
R.check('H27', rEsk.jalur === 'eskalasi', `tugas biasa -> ESKALASI (${rEsk.jalur})`);
R.check('H28', rEsk.langkah.length === 3 && rEsk.langkah[0].tier !== rEsk.langkah[2].tier, 'eskalasi menaiki tangga, bukan mengulang model yang sama');

const rKritik = rencanaHydra(masuk(beratTeks));
R.check('H29', rKritik.jalur === 'kritik-revisi', `tugas berat -> KRITIK-REVISI (${rKritik.jalur})`);
R.check(
  'H30',
  rKritik.langkah.map((l) => l.peran).join(',') === 'draft,kritik,revisi',
  `urutannya draft -> kritik -> revisi (${rKritik.langkah.map((l) => l.peran).join(',')})`,
);
R.check('H31', rKritik.langkah[2].model === rKritik.langkah[0].model, 'revisi dikerjakan model yang sama dengan draf - itu intinya jalur ini');
R.check('H32', rKritik.langkah[1].model !== rKritik.langkah[0].model, 'kritik datang dari model lain, bukan menilai diri sendiri');

const rKuncup = rencanaHydra(masuk(beratTeks, { pengaturan: { enabled: true, maxRequests: 2, tiers: {} } }));
R.check('H33', rKuncup.jalur === 'eskalasi', `batas 2 memaksa tugas berat jadi eskalasi (${rKuncup.jalur})`);
R.check('H34', rKuncup.langkah.length <= 2 && /cost cap/i.test(rKuncup.alasan), 'alasannya jujur menyebut batas biaya sebagai sebabnya');
R.check('H35', rKuncup.batasRequest === 2, 'batasRequest ikut rencana, bukan dikarang saat jalan');

const rEksplisit = rencanaHydra(masuk(sedangTeks, { pengaturan: { enabled: true, maxRequests: 3, tiers: { cheap: 'p9/pilihanku' } } }));
R.check('H36', rEksplisit.langkah[0].provider === 'p9' && rEksplisit.langkah[0].model === 'pilihanku', 'pemetaan tier dari setting dipakai apa adanya');
R.check('H37', /setting/i.test(rEksplisit.langkah[0].kenapa), `alasannya menyebut sumbernya (${rEksplisit.langkah[0].kenapa})`);

const rKosong = rencanaHydra(masuk(sedangTeks, { kandidat: [] }));
R.check('H38', rKosong.langkah[0].provider === 'chat' && rKosong.langkah[0].model === 'mr-vip', 'tanpa kandidat: model chat sendiri yang dipakai');
R.check('H39', /no model is mapped/i.test(rKosong.langkah[0].kenapa), `dan alasannya menyebut rung itu kosong (${rKosong.langkah[0].kenapa})`);

/* ── 4. Deteksi gagal: tiga sinyal, tidak lebih ───────────────────────── */

R.check('H40', deteksiGagal('', null).gagal === true, 'jawaban kosong = gagal');
R.check('H41', deteksiGagal('   \n ', null).gagal === true, 'jawaban berisi spasi saja = gagal');
R.check('H42', deteksiGagal('ada isinya', 'HTTP 400').gagal === true, 'error provider = gagal');
R.check('H43', deteksiGagal(`jawaban\n${HYDRA_PENANDA_RAGU}\n`, null).gagal === true, 'model menyatakan ragu = gagal');
R.check('H44', /low confidence/i.test(deteksiGagal(`x\n${HYDRA_PENANDA_RAGU}`, null).sebab || ''), 'sebabnya disebut, bukan cuma "gagal"');

/*
 * Inti kejujurannya: jawaban yang SALAH tapi yakin TIDAK terdeteksi di sini.
 * Uji ini mengunci pengakuan itu supaya tidak ada yang "memperbaiki"-nya dengan
 * menebak dari isi jawaban.
 */
const yakinSalah = deteksiGagal('Ibu kota Australia adalah Sydney, pasti benar.', null);
R.check('H45', yakinSalah.gagal === false, 'jawaban salah tapi yakin TIDAK terdeteksi - masalah terbuka, bukan pura-pura selesai');

const penandaDiTengah = deteksiGagal(`baris ini menyebut ${HYDRA_PENANDA_RAGU} di tengah kalimat`, null);
R.check('H46', penandaDiTengah.gagal === false, 'penanda harus berdiri sendiri sebagai satu baris - bukan cocok di mana saja');

R.check('H47', bersihkanPenanda(`isi\n${HYDRA_PENANDA_RAGU}`) === 'isi', 'penanda dibuang dari yang dibaca pembaca');
R.check('H48', bersihkanPenanda('isi biasa') === 'isi biasa', 'tanpa penanda, teks tidak diubah');

const srcDeteksi = (() => {
  try {
    return fs.readFileSync('src/lib/hydraFusion.ts', 'utf8');
  } catch {
    return '';
  }
})();
const jumlahSinyal = (srcDeteksi.match(/return \{ gagal: true/g) || []).length;
R.check('H49', jumlahSinyal === 3, `hanya TIGA sinyal gagal di sumber (${jumlahSinyal})`);

/* ── 5. Jalankan rencana dengan transport bohongan ────────────────────── */

const ai = (pesan, id) => ({ pesan, id });

function pesanBerperan(pesan) {
  const terakhir = pesan[pesan.length - 1];
  return String(terakhir?.content ?? '');
}

async function jalan(rencana, jawaban) {
  const log = [];
  let n = 0;
  const hasil = await jalankanHydra(rencana, [{ role: 'user', content: 'tugas' }], {
    kirim: async (langkah, pesan, id) => {
      log.push({ jenis: 'kirim', request: n + 1, peran: langkah.peran, id, pesan, prompt: pesanBerperan(pesan) });
      const balas = jawaban[n] ?? { teks: '', err: null };
      n += 1;
      return balas;
    },
    lapor: (l) => log.push({ jenis: 'lapor', ...l }),
  });
  return { hasil, log };
}

/** Semua isi pesan, supaya rantai antar tahap bisa diperiksa utuh. */
const isiSemua = (pesan) => pesan.map((m) => String(m.content ?? '')).join('\n---\n');

/* 5a. Eskalasi: rung pertama gagal, rung kedua berhasil. */
const e1 = await jalan(rEsk, [{ teks: '', err: null }, { teks: 'jawaban kuat', err: null }]);
R.check('H50', e1.hasil.berhenti === 'selesai', `eskalasi berhenti di "selesai" (${e1.hasil.berhenti})`);
R.check('H51', e1.hasil.request === 2, `gagal sekali = dua request (${e1.hasil.request})`);
R.check('H52', e1.hasil.eskalasi.length === 1 && /empty answer/.test(e1.hasil.eskalasi[0]), `sebab eskalasinya dicatat (${e1.hasil.eskalasi[0]})`);
R.check('H53', e1.hasil.dipakai.length === 2 && e1.hasil.dipakai[1].tier === 'mid', 'rung kedua yang dipakai, bukan yang pertama lagi');
R.check('H54', e1.hasil.teks === 'jawaban kuat', 'teks yang dipakai adalah teks yang berhasil');

/* 5b. Laporan tahap datang SEBELUM request-nya, dan penyebutnya jujur. */
const urut = e1.log.filter((x) => x.jenis === 'lapor' || x.jenis === 'kirim').map((x) => x.jenis);
R.check('H55', urut.join(',') === 'lapor,kirim,lapor,kirim', `lapor selalu mendahului kirim (${urut.join(',')})`);
const laporan = e1.log.filter((x) => x.jenis === 'lapor');
R.check('H56', laporan[0].request === 1 && laporan[1].request === 2, 'nomor request naik satu-satu');
R.check('H57', laporan[0].total <= rEsk.batasRequest && laporan[0].total >= 1, `penyebut tahap tidak melewati batas (${laporan[0].total}/${rEsk.batasRequest})`);
R.check('H58', laporan[0].jalur === 'eskalasi' && !!laporan[0].model, 'laporan menyebut jalur dan model yang sedang jalan');

/* 5c. Batas biaya: semua gagal, plafon 2 -> tidak ada request ketiga. */
const rBatas = rencanaHydra(masuk(sedangTeks, { pengaturan: { enabled: true, maxRequests: 2, tiers: {} } }));
const e2 = await jalan(rBatas, [{ teks: '', err: 'boom 1' }, { teks: '', err: 'boom 2' }, { teks: 'tidak boleh kepakai', err: null }]);
R.check('H59', e2.hasil.request === 2, `plafon 2 dihormati walau tangga lebih panjang (${e2.hasil.request})`);
/*
 * "gagal", bukan "batas": rencananya memang hanya berisi dua rung setelah
 * dipotong plafon, jadi yang terjadi adalah seluruh rencana habis dengan
 * kegagalan. Menyebutnya "batas" akan menyalahkan biaya atas kegagalan yang
 * sebenarnya sudah terjadi di setiap tahap yang dijalankan.
 */
R.check('H60', e2.hasil.berhenti === 'gagal', `rencana yang habis dengan gagal disebut "gagal" (${e2.hasil.berhenti})`);
R.check('H61', e2.hasil.teks === '' && e2.hasil.err === 'boom 2', 'yang dilaporkan adalah kegagalan terakhir, bukan kegagalan pertama');
R.check('H62', e2.log.filter((x) => x.jenis === 'kirim').length === 2, 'tidak ada request ketiga yang bocor');
R.check(
  'H62b',
  e2.log.filter((x) => x.jenis === 'lapor').every((l) => l.total === 2),
  'penyebut tahap menjanjikan 2, bukan 3 - janji yang tidak akan ditepati tidak ditampilkan',
);

/* 5c-2. Plafon dijaga di dalam loop, bukan hanya saat rencana dibuat. Rencana
   di bawah disusun tangan supaya cabang itu benar-benar dilewati: kalau tidak,
   satu perubahan di rencanaHydra bisa membuat penjaga plafon jadi kode mati. */
const rTangan = { ...rKritik, batasRequest: 2 };
const e3b = await jalan(rTangan, [{ teks: '', err: 'x' }, { teks: '', err: 'y' }, { teks: 'tidak boleh kepakai', err: null }]);
R.check('H62c', e3b.hasil.request === 2 && e3b.hasil.berhenti === 'batas', `plafon menghentikan eskalasi yang masih punya tangga (${e3b.hasil.request}/${e3b.hasil.berhenti})`);
R.check('H62d', e3b.hasil.catatanTahap.some((x) => /Cost cap reached/.test(x)), 'dan sebabnya dicatat supaya pembaca tahu kenapa berhenti di situ');

/* 5d. Gagal total: tangga habis, bukan batas. */
const e3 = await jalan(rEsk, [{ teks: '', err: 'a' }, { teks: '', err: 'b' }, { teks: '', err: 'c' }]);
R.check('H63', e3.hasil.berhenti === 'gagal', `tangga habis tanpa hasil -> "gagal" (${e3.hasil.berhenti})`);
R.check('H64', e3.hasil.eskalasi.length >= 1, 'setiap eskalasi punya alasan tercatat');

/* 5e. Dibatalkan pembaca: tidak ada request tambahan. */
const e4 = (() => {
  let panggil = 0;
  return jalankanHydra(rEsk, [{ role: 'user', content: 'tugas' }], {
    kirim: async () => {
      panggil += 1;
      return { teks: '', err: 'gagal' };
    },
    batalkan: () => panggil >= 1,
  }).then((hasil) => ({ hasil, panggil }));
})();
const e4h = await e4;
R.check('H65', e4h.hasil.berhenti === 'batal', `berhenti karena pembaca -> "batal" (${e4h.hasil.berhenti})`);
R.check('H66', e4h.panggil === 1, `pembatalan menghentikan request berikutnya (${e4h.panggil} request)`);

/* 5f. Kritik-revisi: tiga tahap, dan tiap tahap menerima hasil tahap sebelumnya. */
const e5 = await jalan(rKritik, [
  { teks: 'DRAFT-1', err: null },
  { teks: 'KRITIK-1', err: null },
  { teks: 'FINAL-1', err: null },
]);
R.check('H67', e5.hasil.request === 3 && e5.hasil.berhenti === 'selesai', `tiga request lalu selesai (${e5.hasil.request}/${e5.hasil.berhenti})`);
R.check('H68', e5.hasil.dipakai.map((l) => l.peran).join(',') === 'draft,kritik,revisi', 'ketiga peran benar-benar dijalankan');
const kirim5 = e5.log.filter((x) => x.jenis === 'kirim');
R.check('H69', e5.hasil.teks === 'FINAL-1', `yang dipakai adalah hasil tahap revisi (${JSON.stringify(e5.hasil.teks)})`);
R.check('H69b', !isiSemua(kirim5[0].pesan).includes('DRAFT-1'), 'tahap draf tidak menerima draf - tidak ada yang bisa dikritiknya');
R.check('H69c', isiSemua(kirim5[1].pesan).includes('DRAFT-1'), 'tahap kritik menerima draf sebagai bahan');
R.check('H69d', isiSemua(kirim5[2].pesan).includes('KRITIK-1') && isiSemua(kirim5[2].pesan).includes('DRAFT-1'), 'tahap revisi menerima draf DAN kritiknya');
R.check('H70', e5.hasil.catatanTahap.length >= 3, `jejak tahap dilaporkan (${e5.hasil.catatanTahap.length} baris)`);
/* Instruksi tiap tahap diambil dari pesan aslinya, jadi yang diperiksa di sini
   adalah teks peran terakhir pesan itu - bukan string yang dikarang di uji. */
R.check('H71', kirim5[0].prompt !== kirim5[1].prompt && kirim5[1].prompt !== kirim5[2].prompt, 'tiap tahap memakai instruksi berbeda');

/* 5g. Kritik gagal: tidak menghapus jawaban, revisi jalan tanpa kritik. */
const e6 = await jalan(rKritik, [
  { teks: 'DRAFT-2', err: null },
  { teks: '', err: 'kritikus sedang cuti' },
  { teks: 'FINAL-2', err: null },
]);
R.check('H72', e6.hasil.berhenti === 'selesai' && e6.hasil.teks === 'FINAL-2', 'kritik yang gagal tidak membatalkan jawaban');
R.check('H73', e6.hasil.eskalasi.some((x) => /critique skipped/.test(x)), `dilewatinya kritik dicatat jujur (${e6.hasil.eskalasi.join(' | ')})`);
R.check('H74', e6.hasil.request === 3, 'revisi tetap dijalankan setelah kritik gagal');

/* 5h. Draf gagal di jalur kritik-revisi: kritiknya tidak ada gunanya. */
const e7 = await jalan(rKritik, [
  { teks: '', err: 'draf gagal' },
  { teks: 'JAWABAN-KUAT', err: null },
]);
R.check('H75', e7.hasil.berhenti === 'selesai' && e7.hasil.teks === 'JAWABAN-KUAT', 'draf gagal -> satu jawaban langsung dari rung terkuat');
R.check('H76', e7.hasil.dipakai.map((l) => l.peran).join(',') === 'draft,revisi', `tahap kritik dilewati sepenuhnya (${e7.hasil.dipakai.map((l) => l.peran).join(',')})`);
R.check('H77', e7.hasil.request === 2, 'dan itu menghemat satu request, bukan menambahnya');
R.check('H78', e7.hasil.catatanTahap.some((x) => /critique is moot/i.test(x)), 'alasannya dijelaskan di jejak tahap');

/* 5i. Penanda ragu: dianggap gagal, dan penandanya tidak sampai ke pembaca. */
const e9 = await jalan(rSatu, [{ teks: `jawaban seadanya\n${HYDRA_PENANDA_RAGU}`, err: null }]);
R.check('H79', e9.hasil.berhenti === 'gagal' && /low confidence/.test(e9.hasil.eskalasi.join(' ')), 'keraguan yang dinyatakan model dicatat sebagai gagal');
R.check('H80', e9.hasil.teks === 'jawaban seadanya' && !e9.hasil.teks.includes(HYDRA_PENANDA_RAGU), 'teksnya tetap diberikan ke pembaca, sudah bersih dari penanda');

const e8 = await jalan(rEsk, [
  { teks: `saya ragu\n${HYDRA_PENANDA_RAGU}`, err: null },
  { teks: 'jawaban akhir', err: null },
]);
R.check('H79b', e8.hasil.eskalasi.length === 1 && /low confidence/.test(e8.hasil.eskalasi[0]), 'keraguan memicu eskalasi ke rung berikutnya');
R.check('H80b', e8.hasil.request === 2 && e8.hasil.teks === 'jawaban akhir', 'rung berikutnya menjawab, dan jawaban itulah yang dipakai');
R.check('H81', !e8.hasil.teks.includes(HYDRA_PENANDA_RAGU), 'pembaca tidak pernah melihat protokol internal');

/* 5j. Instruksi keraguan ikut dikirim: tanpa itu sinyal ketiga takkan menyala. */
const pesanDraf = pesanUntuk(rEsk.langkah[0], { awal: [{ role: 'user', content: 'x' }] });
R.check('H82', pesanDraf.some((m) => m.content === HYDRA_PENANDA_RAGU || /RAGU|ragu|confidence/i.test(String(m.content))), 'prompt draf mengajarkan cara menyatakan ragu');
R.check('H83', pesanDraf.length === 2, `pesan draf = pesan pembaca + satu instruksi (${pesanDraf.length})`);

/* ── 6. Streaming berlapis: buffer pass yang tidak boleh tampil ───────── */

hydraSiapkan('buf-1', false);
R.check('H84', hydraAktif().includes('buf-1'), 'buffer terdaftar saat pass dimulai');
hydraCatat({ id: 'buf-1', text: 'draf' });
hydraCatat({ id: 'buf-1', text: ' setengah' });
hydraCatat({ id: 'buf-1', done: true });
const ambil1 = hydraAmbil('buf-1');
R.check('H85', ambil1.teks === 'draf setengah', `teks pass buffered terkumpul utuh (${JSON.stringify(ambil1.teks)})`);
R.check('H86', !hydraAktif().includes('buf-1'), 'buffer dilepas setelah diambil - tidak menumpuk di memori');

hydraSiapkan('live-1', true);
R.check('H87', hydraCatat({ id: 'live-1', text: 'tampil' }) === false, 'pass LIVE diteruskan ke gelembung chat');
hydraSiapkan('buf-2', false);
R.check('H88', hydraCatat({ id: 'buf-2', text: 'disembunyikan' }) === true, 'pass buffered ditelan, tidak muncul di chat');
R.check('H89', hydraCatat({ id: 'asing', text: 'x' }) === false, 'chunk milik pass lain tidak ikut ditelan');
R.check('H90', hydraAmbil('live-1').teks === 'tampil', 'pass live tetap tercatat di buffer sendiri');

hydraCatat({ id: 'buf-2', err: 'kritikus mati' });
R.check('H91', hydraAmbil('buf-2').err === 'kritikus mati', 'error pass buffered terbaca lewat buffer, bukan hilang');
hydraSiapkan('buf-3', false);
hydraLupakan('buf-3');
R.check('H92', !hydraAktif().includes('buf-3') && hydraAmbil('buf-3').teks === '', 'melupakan buffer selalu aman (id tak dikenal -> kosong)');

/* ── 7. Jalur pemakaian: setting mati berarti jalur lama ──────────────── */

R.check('H93', bacaPengaturan({ enabled: false, maxRequests: 3 }).enabled === false, 'setting mati -> jalur biasa (dipanggil sebelum rencana dibuat)');
R.check('H94', HYDRA_MAKS_ESKALASI >= 1, `batas jumlah eskalasi ada (${HYDRA_MAKS_ESKALASI})`);

/* ── 8. Teks UI: kuncinya harus ada di SEPULUH blok bahasa ─────────────── */

/*
 * Kunci yang lupa ditambahkan tidak menyebabkan crash - `tr()` mengembalikan
 * kuncinya sendiri, jadi yang muncul di layar adalah 'HydraFusion cost cap'
 * yang kaku, di satu bahasa, di antara sembilan yang diterjemahkan. Itu tidak
 * terlihat dari uji lain mana pun, dan hanya ketahuan kalau ada orang yang
 * memakai bahasa itu. Jadi kuncinya diekstrak dari komponennya (bukan
 * didaftar tangan): daftar tangan akan tertinggal begitu ada baris UI baru,
 * dan ujinya tetap hijau.
 */
const kunciUI = new Set();
const serap = (teks) => {
  for (const m of teks.matchAll(/\b(?:tr|tx|tf)\(\s*'([^']+)'/g)) kunciUI.add(m[1]);
  for (const m of teks.matchAll(/\blabel:\s*'([^']+)'/g)) kunciUI.add(m[1]);
};
const halSetelan = fs.readFileSync('src/components/ai/ChatSettingsPage.tsx', 'utf8');
const iAwal = halSetelan.indexOf("id: 'hydra',");
const iAkhir = halSetelan.indexOf("id: 'hydraterakhir'");
/* Batasnya baris HydraFusion berikutnya, bukan jumlah karakter: jendela
   karakter yang lebar ikut menyapu baris tetangga ('Terminal panes'), dan uji
   ini lalu menuduh kunci yang bukan urusan tugas ini. */
const iSesudah = halSetelan.indexOf("id: '", iAkhir + 10);
serap(halSetelan.slice(iAwal, iSesudah > iAkhir ? iSesudah : iAkhir + 1200));
const panelAi = fs.readFileSync('src/components/ai/AiPanel.tsx', 'utf8');
const iPanel = panelAi.indexOf('{hydraTahap && (');
{
  /* Jendela dibatasi ke baris HydraFusion saja. Jendela lebar akan menyapu
     kunci tetangga (mis. 'Stop loop' yang tinggal di i18n-extra.ts), dan uji
     ini lalu menuduh hal yang bukan urusan tugas ini. */
  const ujung = panelAi.indexOf('{loopBuka && (', iPanel);
  serap(panelAi.slice(iPanel, ujung > iPanel ? ujung : iPanel + 700));
}

const i18n = fs.readFileSync('src/lib/i18n.ts', 'utf8');
const potong = i18n.split(/\nconst (ID|EN|JA|KO|ZH|ES|FR|DE|PT|AR): Dict = \{\n/);
const blok = {};
for (let i = 1; i < potong.length; i += 2) blok[potong[i]] = potong[i + 1];

R.check('H95', Object.keys(blok).length === 10, `sepuluh blok bahasa terbaca (${Object.keys(blok).join(' ')})`);
R.check('H96', kunciUI.has('Stage {n} of {m}') && kunciUI.has('HydraFusion cost cap'),
  `kunci UI HydraFusion benar-benar terkumpul dari komponen (${kunciUI.size} kunci)`);
const kurang = [];
for (const bhs of Object.keys(blok)) {
  for (const k of kunciUI) if (!blok[bhs].includes(`'${k}':`)) kurang.push(`${bhs}:${k}`);
}
R.check('H97', kurang.length === 0, kurang.length ? `kurang ${kurang.length}: ${kurang.slice(0, 6).join(' | ')}` : `${kunciUI.size} kunci ada di 10 blok`);

/* Warna: batasan PROMPT 5 melarang hex di komponen. Diperiksa pada baris
   HydraFusion saja, supaya tidak menuduh kode lama yang bukan urusan tugas ini. */
const barisHydra = [
  ...panelAi.slice(iPanel, iPanel + 900).split('\n'),
  ...halSetelan.slice(iAwal, iAkhir + 1800).split('\n'),
];
const hex = barisHydra.filter((l) => /#[0-9a-fA-F]{3,8}\b/.test(l) && /(color|background|border)/.test(l));
R.check('H98', hex.length === 0, hex.length ? `hex hardcoded: ${hex[0].trim().slice(0, 60)}` : 'warna HydraFusion tidak menulis hex di komponen');

console.log('\n  catatan: uji ini memuat src/lib/hydraFusion.ts apa adanya lewat Vite (mode SSR), tanpa app dan tanpa CDP');
R.selesai();
process.exit(gagal ? 1 : 0);
