// uji-alur-verifikasi.mjs — bukti aturan "verifikasi mandiri" benar-benar menutup pintu.
//
// Jalankan:  node scripts/uji-alur-verifikasi.mjs     (murni; app tidak perlu jalan)
// Keluar 0 kalau semua kasus lulus, 1 kalau ada yang gagal.
//
// Kenapa harness ini ada: aturan verifikasi yang tidak diuji adalah aturan yang
// paling mudah membusuk tanpa ada yang tahu. Modul `alurVerifikasi.ts` memutuskan
// boleh-tidaknya agen mengaku selesai; kalau satu cabangnya salah, agen bisa
// mengaku selesai atas pekerjaan merah — dan tidak ada satu pun tanda di UI yang
// memberitahu. Jadi setiap cabang di sini diuji dengan bentuk masukan nyata
// (kode keluar + keluaran sungguhan), bukan dengan contoh yang dibuat agar lulus.
//
// Yang diuji:
//   V1  ubah .ts        -> wajib `npx tsc --noEmit`
//   V2  ubah .rs        -> wajib `cargo test --lib`, cwd src-tauri
//   V3  ubah skrip uji  -> wajib menjalankan skrip ITU (node <berkas>)
//   V4  ubah docs saja  -> tidak wajib apa pun
//   V5  campur .ts/.rs/skrip/docs -> perintah di-dedupe, dokumen tidak masuk
//   V6  jalur absolut Windows -> tetap terbaca jenisnya
//   V7  keluaran merah (kode 1) -> status 'belum selesai'
//   V8  kode 0 tapi keluaran memuat baris diagnostik tsc -> tetap merah
//   V18 run hijau yang hanya MENGUTIP penanda gagal -> tetap hijau (regresi)
//   V19 run kode 0 yang benar-benar berisi baris GAGAL/FAILED -> tetap merah
//   V20 keluaran merah menyebut berkas siapa (dua bentuk tsc, dedupe+urut)
//   V9  proses tak selesai (kode null) -> tidak bisa dinilai, bukan hijau
//   V10 pemeriksa wajib belum dijalankan -> 'belum selesai'
//   V11 hijau -> 'boleh selesai'
//   V12 merah ke-2 (batas 3) -> masih 'belum selesai'
//   V13 merah ke-3 (menyentuh batas) -> 'berhenti + lapor'
//   V14 perintah di luar daftar izin -> 'ditolak'
//   V15 jenis berkas belum dipetakan -> 'ditolak'
//   V16 laporan akhir tanpa keluaran -> ditolak; laporan dari laporanAkhir() -> diterima
//   V17 laporanAkhir memuat perintah + keluaran apa adanya

import { reporter, keluarBersih } from './lib-cdp.mjs';
import {
  BATAS_PERCOBAAN,
  perintahDiizinkan,
  normJalur,
  periksaBerkas,
  rencanaVerifikasi,
  nilaiKeluaran,
  berkasBermasalah,
  putuskan,
  validasiLaporan,
  laporanAkhir,
} from '../src/lib/alurVerifikasi.ts';

const R = reporter('alur verifikasi mandiri');

/* Keluaran nyata dipakai di kasus-kasus di bawah. Ini salinan apa adanya dari
   run sungguhan supaya penilaian diuji atas teks yang memang muncul, bukan
   "output" satu kata buatan sendiri. */
const TSC_HIJAU = [
  '> zephyr@1.1.13 npx',
  '> tsc --noEmit',
  '',
].join('\n');
const TSC_MERAH = [
  'src/lib/contoh.ts(12,7): error TS2322: Type \'string\' is not assignable to type \'number\'.',
  '',
  'Found 1 error in the same file.',
].join('\n');
const CARGO_HIJAU = [
  'running 18 tests',
  'test settings::uji_baca ... ok',
  '',
  'test result: ok. 18 passed; 0 failed; 0 ignored',
].join('\n');
const HARTA_HIJAU = '== 17/17 lulus ==';
const HARTA_MERAH = 'GAGAL  V3  perintah skrip tidak dijalankan\n\n== 12/17 lulus ==';

/* V1 — .ts -> tsc */
{
  const r = rencanaVerifikasi(['src/lib/contoh.ts']);
  R.check('V1', r.perintah.length === 1 && r.perintah[0].perintah === 'npx tsc --noEmit', `ubah .ts -> ${JSON.stringify(r.perintah.map((p) => p.perintah))}`);
}

/* V2 — .rs -> cargo test --lib, cwd src-tauri */
{
  const r = rencanaVerifikasi(['src-tauri/src/settings.rs']);
  const p = r.perintah[0];
  R.check('V2', !!p && p.perintah === 'cargo test --lib' && p.cwd === 'src-tauri', `ubah .rs -> ${JSON.stringify(r.perintah.map((x) => `${x.perintah} (cwd=${x.cwd})`))}`);
}

/* V3 — skrip uji -> jalankan skripnya sendiri */
{
  const r = rencanaVerifikasi(['scripts/uji-foo-bar.mjs']);
  R.check('V3', r.perintah.length === 1 && r.perintah[0].perintah === 'node scripts/uji-foo-bar.mjs' && r.perintah[0].cwd === '', `ubah skrip uji -> ${JSON.stringify(r.perintah.map((x) => x.perintah))}`);
}

/* V4 — docs saja -> tidak wajib */
{
  const r = rencanaVerifikasi(['docs/ALUR-VERIFIKASI-MANDIRI.md']);
  const p = putuskan({ jalur: ['docs/ALUR-VERIFIKASI-MANDIRI.md'], hasil: [] });
  R.check('V4', r.wajib === false && r.perintah.length === 0 && p.wajib === false && p.status === 'boleh selesai', `ubah docs -> perintah=${JSON.stringify(r.perintah.map((x) => x.perintah))} status=${p.status}`);
}

/* V5 — campur: dedupe + dokumen tidak dianggap perintah */
{
  const r = rencanaVerifikasi([
    'src/lib/a.ts',
    'src/components/B.tsx',
    'src-tauri/src/settings.rs',
    'scripts/uji-a.mjs',
    'docs/catatan.md',
  ]);
  const perintah = r.perintah.map((x) => x.perintah);
  const dedupe = perintah.filter((x) => x === 'npx tsc --noEmit').length === 1;
  const duaSebab = r.perintah[0].sebab.length === 2;
  const urut = JSON.stringify(perintah) === JSON.stringify(['npx tsc --noEmit', 'cargo test --lib', 'node scripts/uji-a.mjs']);
  R.check('V5', dedupe && duaSebab && urut && r.dokumen.length === 1, `perintah=${JSON.stringify(perintah)} sebab-tsc=${r.perintah[0]?.sebab.length} dokumen=${r.dokumen.length}`);
}

/* V6 — jalur absolut Windows / MSYS tetap terbaca */
{
  const a = periksaBerkas('D:\\Zephyr\\scripts\\uji-alur-verifikasi.mjs');
  const b = periksaBerkas('/d/zephyr/src/lib/alurVerifikasi.ts');
  R.check('V6', a.jenis === 'skrip' && b.jenis === 'ts' && normJalur('D:/Zephyr/src/x.ts') === 'src/x.ts', `win=${a.jenis}/${a.jalur} msys=${b.jenis}/${b.jalur}`);
}

/* V7 — merah -> 'belum selesai', tidak boleh selesai */
{
  const p = putuskan({ jalur: ['src/lib/a.ts'], hasil: [{ perintah: 'npx tsc --noEmit', kodeKeluar: 2, keluaran: TSC_MERAH }] });
  R.check('V7', p.status === 'belum selesai' && p.bolehSelesai === false && p.percobaan === 1, `merah -> status='${p.status}' bolehSelesai=${p.bolehSelesai} percobaan=${p.percobaan}`);
}

/* V8 — kode 0 tapi keluaran memuat baris diagnostik tsc -> merah juga */
{
  const n = nilaiKeluaran('npx tsc --noEmit', 0, TSC_MERAH);
  const p = putuskan({ jalur: ['src/lib/a.ts'], hasil: [{ perintah: 'npx tsc --noEmit', kodeKeluar: 0, keluaran: TSC_MERAH }] });
  R.check('V8', n === 'merah' && p.status === 'belum selesai', `kode 0 + 'src/lib/contoh.ts(12,7): error TS2322' -> nilai='${n}' status='${p.status}'`);
}

/* V18 — regresi: run HIJAU yang hanya MENGUTIP penanda gagal tidak boleh merah.
   Kasus ini bukan karangan: run 17/17 dari harness ini sendiri pernah dinilai
   merah karena detail kasus V8 memuat teks "error TS2322" dan (setelah
   diperbaiki sekali) masih merah karena baris kutipan memuat bentuk
   `berkas(baris,kolom): error TS…` di tengah prosa. */
{
  const kutipan = [
    "LULUS  V8   kode 0 + 'src/lib/contoh.ts(12,7): error TS2322' -> nilai='merah'",
    'LULUS  V8b  src/lib/x.ts:12:7 - error TS2322: bukan baris sendiri',
    '',
    '== 18/19 lulus ==',
  ].join('\n');
  const n = nilaiKeluaran('node scripts/uji-a.mjs', 0, kutipan);
  const p = putuskan({ jalur: ['scripts/uji-a.mjs'], hasil: [{ perintah: 'node scripts/uji-a.mjs', kodeKeluar: 0, keluaran: kutipan }] });
  const g = nilaiKeluaran('node scripts/uji-a.mjs', 0, '== 19/19 lulus ==');
  R.check('V18', n === 'hijau' && g === 'hijau' && p.status === 'boleh selesai', `kutipan 'error TS2322' di run hijau -> nilai='${n}' status='${p.status}'`);
}

/* V19 — tapi baris GAGAL/DIMULAI di run ber-kode-0 tetap dianggap merah */
{
  const n = nilaiKeluaran('node scripts/uji-a.mjs', 0, HARTA_MERAH);
  const c = nilaiKeluaran('cargo test --lib', 0, 'test settings::x ... FAILED\n\ntest result: FAILED. 1 failed');
  R.check('V19', n === 'merah' && c === 'merah', `'GAGAL' kolom-0 kode 0 -> '${n}' · cargo FAILED kode 0 -> '${c}'`);
}

/* V20 — merah menyebut berkas siapa (dua bentuk keluaran tsc, dedupe + urut) */
{
  const duaBerkas = [
    'src/lib/zephyrDokumen.ts(359,17): error TS2323: Cannot redeclare exported variable.',
    'src/lib/zephyrDokumen.ts(369,17): error TS2393: Duplicate function implementation.',
    'src/lib/alurVerifikasi.ts:12:7 - error TS2322: Type kanan tidak cocok.', // bentuk pretty (TTY)
  ].join('\n');
  const b = berkasBermasalah(duaBerkas);
  const p = putuskan({ jalur: ['src/lib/a.ts'], hasil: [{ perintah: 'npx tsc --noEmit', kodeKeluar: 2, keluaran: duaBerkas }] });
  R.check('V20', JSON.stringify(b) === JSON.stringify(['src/lib/alurVerifikasi.ts', 'src/lib/zephyrDokumen.ts']) && JSON.stringify(p.berkasMerah) === JSON.stringify(b) && p.status === 'belum selesai', `berkasMerah=${JSON.stringify(b)} status='${p.status}'`);
}

/* V9 — proses tak selesai (timeout) bukan hijau */
{
  const n = nilaiKeluaran('cargo test --lib', null, 'memulai...');
  const p = putuskan({ jalur: ['src-tauri/src/settings.rs'], hasil: [{ perintah: 'cargo test --lib', kodeKeluar: null, keluaran: 'memulai...' }] });
  R.check('V9', n === 'tidak-jelas' && p.status === 'belum selesai' && p.bolehSelesai === false, `kode null -> nilai='${n}' status='${p.status}'`);
}

/* V10 — belum dijalankan -> 'belum selesai' */
{
  const p = putuskan({ jalur: ['src/lib/a.ts'], hasil: [] });
  const n = p.nilai[0]?.nilai;
  R.check('V10', p.status === 'belum selesai' && n === 'belum-dijalankan', `tanpa hasil -> status='${p.status}' nilai='${n}'`);
}

/* V11 — hijau -> 'boleh selesai' */
{
  const p = putuskan({
    jalur: ['src/lib/a.ts', 'src-tauri/src/settings.rs', 'scripts/uji-a.mjs'],
    hasil: [
      { perintah: 'npx tsc --noEmit', kodeKeluar: 0, keluaran: TSC_HIJAU },
      { perintah: 'cargo test --lib', kodeKeluar: 0, keluaran: CARGO_HIJAU },
      { perintah: 'node scripts/uji-a.mjs', kodeKeluar: 0, keluaran: HARTA_HIJAU },
    ],
  });
  R.check('V11', p.status === 'boleh selesai' && p.bolehSelesai === true && p.percobaan === 1, `hijau -> status='${p.status}' nilai=${JSON.stringify(p.nilai.map((x) => x.nilai))}`);
}

/* V12/V13 — batas percobaan 3: merah ke-2 belum berhenti, merah ke-3 berhenti */
{
  const merah = (n) => Array.from({ length: n }, () => ({ perintah: 'npx tsc --noEmit', kodeKeluar: 2, keluaran: TSC_MERAH }));
  const p2 = putuskan({ jalur: ['src/lib/a.ts'], hasil: merah(2) });
  const p3 = putuskan({ jalur: ['src/lib/a.ts'], hasil: merah(BATAS_PERCOBAAN) });
  R.check('V12', BATAS_PERCOBAAN === 3 && p2.status === 'belum selesai' && p2.percobaan === 2, `merah x2 (batas ${BATAS_PERCOBAAN}) -> status='${p2.status}'`);
  R.check('V13', p3.status === 'berhenti + lapor' && p3.bolehSelesai === false && p3.percobaan === 3, `merah x${BATAS_PERCOBAAN} -> status='${p3.status}' percobaan=${p3.percobaan}`);
}

/* V14 — perintah di luar daftar izin -> ditolak */
{
  const p = putuskan({ jalur: ['src/lib/a.ts'], hasil: [{ perintah: 'npm run build', kodeKeluar: 0, keluaran: 'ok' }] });
  const sah = perintahDiizinkan('npx tsc --noEmit') && perintahDiizinkan('node scripts/uji-x.mjs') && !perintahDiizinkan('scripts/x.mjs; rm -rf /');
  R.check('V14', p.status === 'ditolak' && p.bolehSelesai === false && sah, `perintah liar -> status='${p.status}' izin-ok=${sah}`);
}

/* V15 — jenis berkas belum dipetakan -> ditolak, bukan "hijau karena tidak ada perintah" */
{
  const p = putuskan({ jalur: ['src/lib/sesuatu.xyz'], hasil: [] });
  R.check('V15', p.status === 'ditolak' && p.takDikenal.length === 1 && p.bolehSelesai === false, `berkas .xyz -> status='${p.status}' takDikenal=${JSON.stringify(p.takDikenal)}`);
}

/* V16 — laporan akhir diperiksa: tanpa keluaran ditolak, laporanAkhir() diterima */
{
  const hasil = [
    { perintah: 'npx tsc --noEmit', kodeKeluar: 0, keluaran: TSC_HIJAU },
    { perintah: 'node scripts/uji-a.mjs', kodeKeluar: 0, keluaran: HARTA_HIJAU },
  ];
  const jalur = ['src/lib/a.ts', 'scripts/uji-a.mjs'];
  const bohong = putuskan({ jalur, hasil }, { laporan: 'Semua sudah saya perbaiki dan diuji, aman.' });
  const lengkap = laporanAkhir(putuskan({ jalur, hasil }), hasil);
  const v = validasiLaporan(lengkap, hasil);
  const jujur = putuskan({ jalur, hasil }, { laporan: lengkap });
  R.check('V16', bohong.status === 'belum selesai' && bohong.laporanSiap === false && v.ok === true && jujur.status === 'boleh selesai' && jujur.laporanSiap === true, `laporan tanpa bukti -> '${bohong.status}' (kurang=${bohong.alasan.slice(0, 60)}…) · laporanAkhir -> valid=${v.ok} status='${jujur.status}'`);
}

/* V17 — laporanAkhir memuat perintah + potongan keluaran apa adanya + kode keluar */
{
  const hasil = [
    { perintah: 'cargo test --lib', kodeKeluar: 0, keluaran: CARGO_HIJAU },
    { perintah: 'node scripts/uji-a.mjs', kodeKeluar: 1, keluaran: HARTA_MERAH },
  ];
  const put = putuskan({ jalur: ['src-tauri/src/settings.rs', 'scripts/uji-a.mjs'], hasil });
  const lap = laporanAkhir(put, hasil);
  const adaPerintah = lap.includes('cargo test --lib') && lap.includes('node scripts/uji-a.mjs');
  const adaKeluaran = lap.includes('test result: ok. 18 passed; 0 failed; 0 ignored');
  const adaPotongan = lap.includes('running 18 tests') && lap.includes('GAGAL  V3  perintah skrip tidak dijalankan');
  const adaKode = /kode 0/.test(lap) && /kode 1/.test(lap);
  const statusBenar = put.status === 'belum selesai';
  R.check('V17', adaPerintah && adaKeluaran && adaPotongan && adaKode && statusBenar, `laporan memuat perintah=${adaPerintah} keluaran=${adaKeluaran} potongan=${adaPotongan} kode-keluar=${adaKode} status='${put.status}'`);
}

const hasil = R.selesai();
console.log(`batas percobaan = ${BATAS_PERCOBAAN} · kasus = ${hasil.total} · hijau = ${hasil.lulus} · merah = ${hasil.total - hasil.lulus}`);
keluarBersih(hasil.lulus === hasil.total ? 0 : 1);
