/*
 * Uji tool `ingat` (ai-ingat-sesi, bagian tool agen).
 *
 * Yang dibuktikan, dan kenapa harus di app yang hidup:
 *  1. tool benar-benar TERDAFTAR dan bisa DIPANGGIL lewat implementasi aslinya
 *     (`__ZEPHYR_TOOLS__.jalankan`), bukan cuma ada di daftar nama;
 *  2. rantai lengkapnya utuh: tulisan lewat tool → tersimpan di modul memori →
 *     muncul di blok memori → muncul di prompt yang dirakit systemPromptFor().
 *     Kalau salah satu sambungan putus, AI bisa "berhasil menyimpan" tanpa
 *     memorinya pernah sampai ke sesi berikutnya;
 *  3. penolakan dan penurunan lapis dikembalikan sebagai TEKS yang terbaca
 *     (bukan lemparan atau diam-diam), karena model yang membaca keluaran itu
 *     yang harus memutuskan langkah berikutnya;
 *  4. deskripsi tool ada DUA lapis dan diperiksa di tempatnya masing-masing:
 *     label pendek di katalog (yang dilihat user, disamakan dengan peta
 *     deskripsi Indonesia) dan teks panjang di `spec.description` (yang dibaca
 *     model) - label pendek yang menyimpang dari peta itu yang jadi bug.
 *
 * Bagian statis (S) membaca berkas sebagai TEKS - sama seperti
 * `verify-deskripsi-tool.mjs`, karena katalog mengimpor tanpa ekstensi dan jalur
 * itu tidak bisa diselesaikan Node telanjang.
 *
 * Data user tidak dirusak: semua entri uji memakai token `uji-tool-ingat-<cap>`
 * dan dihapus lagi di bagian bersih-bersih, termasuk sisa run sebelumnya.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Cdp, reporter, keluarBersih, tungguBridge } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';
const TOKEN = `uji-tool-ingat-${Date.now().toString(36)}`;
const AWALAN = 'uji-tool-ingat-';
const r = reporter('tool-ingat');

/* ───────────────────── bagian statis (tanpa app) ───────────────────────── */

const katalogTeks = readFileSync(join(akar, 'src/lib/zephyrTools/catalog.ts'), 'utf8');
const deskripsiTeks = readFileSync(join(akar, 'src/lib/zephyrTools/deskripsiTool.ts'), 'utf8');
const agentTeks = readFileSync(join(akar, 'src/lib/agentTools.ts'), 'utf8');
const modulTeks = readFileSync(join(akar, 'src/lib/zephyrTools/zephyrIngat.ts'), 'utf8');

/** Baris katalog `['nama', 'kelompok', 'efek', izin, 'deskripsi']`. */
function barisKatalog(nama) {
  const re = new RegExp(
    `\\[\\s*'${nama}',\\s*'([^']+)',\\s*'([^']+)',\\s*(true|false),\\s*'((?:[^'\\\\]|\\\\.)*)'\\s*\\]`,
  );
  const m = re.exec(katalogTeks);
  return m ? { kelompok: m[1], efek: m[2], izin: m[3] === 'true', deskripsi: m[4] } : null;
}

/** Nilai satu kunci di peta deskripsi bahasa tertentu. */
function deskripsiDi(bahasa, kunci) {
  const awal = deskripsiTeks.indexOf(`export const DESKRIPSI_TOOL_${bahasa}: Record<string, string> = {`);
  if (awal < 0) return null;
  const re = new RegExp(`(?:^|\\n)\\s*${kunci}:\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'm');
  const m = re.exec(deskripsiTeks.slice(awal));
  return m ? m[1] : null;
}

const katalog = barisKatalog('ingat');
const id32 = deskripsiDi('ID', 'ingat');
const en32 = deskripsiDi('EN', 'ingat');

r.check(
  'S1',
  !!katalog && katalog.efek === 'appWrite' && katalog.kelompok === 'Memori' && katalog.izin === false,
  katalog
    ? `katalog: kelompok="${katalog.kelompok}" efek=${katalog.efek} perluIzin=${katalog.izin} - efek appWrite masuk kelas tulis di toolGate, jadi mode baca-saja menyaringnya keluar`
    : 'BARIS KATALOG UNTUK `ingat` TIDAK ADA - tool tidak akan pernah dikirim ke model',
);

r.check(
  'S2',
  !!id32 && !!en32 && id32 === (katalog ? katalog.deskripsi : null) && en32 !== id32,
  `deskripsi ID = teks katalog: ${id32 === (katalog ? katalog.deskripsi : null)} · EN terisi: ${!!en32} · EN berbeda dari ID: ${en32 !== id32}`,
);

r.check(
  'S3',
  agentTeks.includes("import { TOOL_INGAT } from './zephyrTools/zephyrIngat'") &&
    /AGENT_TOOLS[\s\S]{0,600}TOOL_INGAT/.test(agentTeks) &&
    modulTeks.includes('export const TOOL_INGAT'),
  'modul mengekspor TOOL_INGAT, agentTools mengimpornya, dan array AGENT_TOOLS memakainya (tanpa salah satu, tool hanya ada di katalog sebagai janji)',
);

/* ───────────────────────── bagian live (app hidup) ─────────────────────── */

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title || 'Zephyr');
await tungguBridge(cdp, '__ZEPHYR_TOOLS__', 40000);
await tungguBridge(cdp, '__ZEPHYR_MEMORI__', 40000);

/** Jalankan satu tool dan bungkus hasil/error jadi {ok, teks}. */
const panggil = (args) => `await (async () => {
  const ALAT = window.__ZEPHYR_TOOLS__;
  try {
    const t = await ALAT.jalankan('ingat', ${JSON.stringify(args)});
    return { ok: true, teks: typeof t === 'string' ? t : JSON.stringify(t) };
  } catch (e) {
    return { ok: false, teks: String(e && e.message ? e.message : e) };
  }
})()`;

const t1 = await cdp.runAsync(`
  const ALAT = window.__ZEPHYR_TOOLS__;
  const nama = ALAT.nama();
  const spec = ALAT.spec('ingat');
  const props = spec && spec.parameters && spec.parameters.properties ? spec.parameters.properties : {};
  return {
    ada: nama.includes('ingat'),
    jumlah: nama.length,
    enumAksi: props.aksi && props.aksi.enum ? props.aksi.enum : [],
    properti: Object.keys(props),
    wajib: spec && spec.parameters ? spec.parameters.required : [],
    deskripsi: spec ? String(spec.description) : '',
  };
`);
r.check(
  'T1',
  t1.ada && t1.enumAksi.length === 4 && t1.deskripsi.length > 40 && t1.wajib.indexOf('aksi') >= 0,
  `terdaftar=${t1.ada} (total ${t1.jumlah} tool) · aksi=${JSON.stringify(t1.enumAksi)} · properti=${JSON.stringify(t1.properti)} · wajib=${JSON.stringify(t1.wajib)} · deskripsi "${t1.deskripsi.slice(0, 60)}..."`,
);
r.check(
  'T2',
  t1.deskripsi.length > 200 &&
    ['lihat', 'cari', 'tambah', 'hapus'].every((a) => t1.deskripsi.includes(a)) &&
    katalog &&
    t1.deskripsi !== katalog.deskripsi,
  `deskripsi untuk MODEL menyebut keempat aksi (panjang ${t1.deskripsi.length} char) dan memang BUKAN label katalog - dua hal berbeda menurut rancangan: katalog = label pendek untuk UI (${katalog ? katalog.deskripsi.length : 0} char), spec.description = teks yang dibaca model`,
);

const t3 = await cdp.runAsync(`return ${panggil({ aksi: 'lihat' })};`);
r.check(
  'T3',
  t3.ok && t3.teks.startsWith('MEMORI ZEPH AI') && t3.teks.includes('entri tersimpan'),
  `aksi=lihat → "${t3.teks.split('\\n')[0].slice(0, 110)}"`,
);

const t4 = await cdp.runAsync(`return ${panggil({ aksi: 'ngawur' })};`);
r.check(
  'T4',
  t4.ok && t4.teks.includes('aksi tidak dikenal') && t4.teks.includes('Tidak ada yang diubah'),
  `aksi ngawur ditolak dengan daftar aksi: "${t4.teks.slice(0, 120)}"`,
);

const t5 = await cdp.runAsync(`return ${panggil({ aksi: 'tambah' })};`);
r.check(
  'T5',
  t5.ok && t5.teks.includes('butuh "teks"'),
  `tambah tanpa teks → "${t5.teks.slice(0, 80)}"`,
);

const t6 = await cdp.runAsync(`return ${panggil({ aksi: 'tambah', teks: 'ok' })};`);
r.check(
  'T6',
  t6.ok && t6.teks.startsWith('DITOLAK') && t6.teks.includes('paksa=true'),
  `teks sampah "ok" ditolak penjaga mutu, lengkap dengan jalan keluarnya: "${t6.teks.split('\\n')[0].slice(0, 120)}"`,
);

/* Simpan entri sungguhan lewat tool, lalu buktikan rantainya sampai prompt. */
const t7 = await cdp.runAsync(`
  const hasil = ${panggil({
    aksi: 'tambah',
    teks: `${TOKEN}: keputusan uji - tool ingat menyimpan keputusan ke memori lintas sesi Zeph AI supaya sesi berikutnya tidak mulai dari nol.`,
    jenis: 'keputusan',
    paksa: true,
  })};
  const M0 = window.__ZEPHYR_MEMORI__;
  const semua = await M0.muatSemua();
  const milik = (semua.entri || []).filter((e) => String(e.teks).includes(${JSON.stringify(TOKEN)}));
  const blok = M0.blok();
  const prompt = window.__ZEPHYR_PROMPT__.system('id', 'uji-tool-ingat: konteks giliran normal', '');
  const promptKosong = window.__ZEPHYR_PROMPT__.system('id', '', '');
  return {
    hasil,
    id: milik[0] ? milik[0].id : null,
    lapis: milik[0] ? milik[0].lapis : null,
    jenis: milik[0] ? milik[0].jenis : null,
    tanggal: milik[0] ? milik[0].tanggal : null,
    jumlah: milik.length,
    diBlok: blok.includes(${JSON.stringify(TOKEN)}),
    diPrompt: prompt.includes(${JSON.stringify(TOKEN)}),
    diPromptKosong: promptKosong.includes(${JSON.stringify(TOKEN)}),
  };
`);
r.check(
  'T7',
  t7.hasil.ok && /tersimpan:\s*#/.test(t7.hasil.teks) && t7.jumlah === 1 && t7.jenis === 'keputusan',
  `tambah(paksa) → "${t7.hasil.teks.split('\\n')[0].slice(0, 90)}" · entri ditemukan=${t7.jumlah} id=${t7.id} lapis=${t7.lapis} jenis=${t7.jenis} tanggal=${t7.tanggal}`,
);
r.check(
  'T8',
  t7.diBlok && t7.diPrompt,
  `rantai utuh: masuk blok memori=${t7.diBlok} → masuk prompt giliran normal=${t7.diPrompt} · prompt TANPA konteks=${t7.diPromptKosong} (kalau yang terakhir ini false, memori hanya muncul saat ada blok lain yang terisi - persis pola bug blok tanpa-workspace yang pernah kejadian)`,
);

const t9 = await cdp.runAsync(`
  const cari = ${panggil({ aksi: 'cari', kueri: TOKEN })};
  const kosong = ${panggil({ aksi: 'cari', kueri: 'zzz-tidak-ada-sama-sekali-9f3' })};
  const tanpaKueri = ${panggil({ aksi: 'cari' })};
  let idJawab = null;
  if (cari.ok) {
    const m = /#([A-Za-z0-9_-]+)/.exec(cari.teks);
    idJawab = m ? m[1] : null;
  }
  return { cari, kosong, tanpaKueri, idJawab, adaToken: cari.teks.includes(${JSON.stringify(TOKEN)}) };
`);
r.check(
  'T9',
  t9.cari.ok && t9.adaToken && t9.kosong.teks.includes('tidak ada entri memori') && t9.tanpaKueri.teks.includes('butuh "kueri"'),
  `cari menemukan entri uji=${t9.adaToken} (id ${t9.idJawab}) · kueri tanpa hasil → "${t9.kosong.teks.slice(0, 60)}" · cari tanpa kueri → "${t9.tanpaKueri.teks.slice(0, 40)}"`,
);

/* Lapis proyek: dengan folder terbuka tersimpan sebagai proyek; tanpa folder
 * diturunkan ke global DENGAN alasan yang terbaca - dua-duanya jujur. */
const t10 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const root = window.__ZEPHYR__.getState().workspace || null;
  const hasil = ${panggil({ aksi: 'tambah', teks: `${TOKEN}-proyek: keputusan uji lapis proyek.`, lapis: 'proyek', paksa: true })};
  const semua = await M0.muatSemua();
  const milik = (semua.entri || []).filter((e) => String(e.teks).includes(${JSON.stringify(`${TOKEN}-proyek`)}));
  return {
    root,
    hasil,
    lapis: milik[0] ? milik[0].lapis : null,
    proyek: milik[0] ? milik[0].proyek : null,
    jumlah: milik.length,
  };
`);
const t10Jujur = t10.root
  ? t10.lapis === 'proyek'
  : t10.hasil.teks.includes('disimpan sebagai global');
r.check(
  'T10',
  t10.hasil.ok && t10.jumlah === 1 && t10Jujur,
  t10.root
    ? `folder terbuka=${t10.root} → entri uji tersimpan lapis=${t10.lapis} (proyek ${t10.proyek})`
    : `tidak ada folder terbuka → keluaran menyebut penurunan ke global: ${t10Jujur} · "${t10.hasil.teks.split('\\n')[0].slice(0, 90)}"`,
);

const t11 = await cdp.runAsync(`
  const M0 = window.__ZEPHYR_MEMORI__;
  const semua = await M0.muatSemua();
  const milik = (semua.entri || []).filter((e) => String(e.teks).includes(${JSON.stringify(AWALAN)}));
  const hapus = [];
  for (const e of milik) hapus.push({ id: e.id, teks: await M0.hapus(e.id) });
  const blok = M0.blok();
  const prompt = window.__ZEPHYR_PROMPT__.system('id', 'uji-tool-ingat: konteks giliran normal', '');
  const sisa = ((await M0.muatSemua()).entri || []).filter((e) => String(e.teks).includes(${JSON.stringify(AWALAN)}));
  const tanpaId = ${panggil({ aksi: 'hapus' })};
  const idSalah = ${panggil({ aksi: 'hapus', id: 'zzz-tidak-ada-9f3' })};
  return {
    dihapus: hapus.length,
    semuaOk: hapus.every((h) => h.teks),
    ids: hapus.map((h) => h.id),
    sisa: sisa.length,
    blokBersih: !blok.includes(${JSON.stringify(TOKEN)}),
    promptBersih: !prompt.includes(${JSON.stringify(TOKEN)}),
    tanpaId: tanpaId.teks,
    idSalah: idSalah.teks,
  };
`);
r.check(
  'T11',
  t11.dihapus >= 2 &&
    t11.semuaOk &&
    t11.sisa === 0 &&
    t11.blokBersih &&
    t11.promptBersih &&
    t11.tanpaId.includes('butuh "id"') &&
    t11.idSalah.includes('tidak ada entri'),
  `bersih-bersih: ${t11.dihapus} entri uji dihapus (${t11.ids.join(', ')}) · sisa=${t11.sisa} · blok bersih=${t11.blokBersih} · prompt bersih=${t11.promptBersih} · hapus tanpa id → "${t11.tanpaId.slice(0, 40)}" · id salah → "${t11.idSalah.slice(0, 50)}"`,
);

const ringkas = r.selesai();
await cdp.close();
keluarBersih(ringkas.lulus === ringkas.total ? 0 : 1);
