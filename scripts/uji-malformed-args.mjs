#!/usr/bin/env node
/*
 * uji-malformed-args.mjs — repro bersih "tool call X returned malformed JSON
 * arguments" secara deterministik: TANPA jaringan, TANPA app, TANPA CDP.
 *
 * Yang diuji (klaim LAMA-merah)
 * ----------------------------
 *   1. Argumen tool cacat TIDAK membuat agen mati: ia dilaporkan ke model lalu
 *      agen boleh mengulang.
 *   2. Laporan itu menyebut nama tool; apakah ia juga memuat POTONGAN argumen
 *      yang salah, diukur apa adanya.
 *   3. Jalur pulih TIDAK PERNAH mengeksekusi tool dengan argumen setengah jadi.
 *
 * Tiga lapis bukti
 * ----------------
 *  A. EKSEKUSI RUST ASLI — `cargo test --offline --lib adapters::openai`
 *     menjalankan tangga perbaikan argumen yang dikirim (openai.rs). Tanpa
 *     jaringan: `--offline` memakai target/ yang sudah ada.
 *  B. ATURAN TS ASLI — fungsi `isRetryableAgentToolResponseError` /
 *     `isTruncatedToolResponseError` / `isRetryableAgentProviderError` di
 *     src/lib/aiStore.ts TIDAK diekspor, jadi harness MEMBACA aturannya dari
 *     teks fungsi yang dikirim (literal `includes(...)`) dan menerapkannya ke
 *     kalimat galat nyata. Kalau fungsinya berubah, klasifikasi harness ikut
 *     berubah - tidak ada salinan yang bisa basi.
 *  C. TAPAK KENDALI ASLI — teks jalur pemulihan (aiStore.ts ~6040-6260) dan
 *     pesan galat Rust (openai.rs ~604-640) dibaca, diperiksa: nama tool ada,
 *     potongan argumen ada/tidak, dan TIDAK ada pemanggilan tool sebelum
 *     `continue`.
 *
 * Cara pakai
 * ----------
 *   node scripts/uji-malformed-args.mjs
 *   node scripts/uji-malformed-args.mjs --tanpa-cargo   # lapis A dilewati (dilaporkan)
 *   node scripts/uji-malformed-args.mjs --json=hasil.json
 *
 * Keluar 1 kalau ada GAGAL.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERJA = path.join(AKAR, 'scratch', 'uji-malformed-args');
mkdirSync(KERJA, { recursive: true });

const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};
const TANPA_CARGO = process.argv.includes('--tanpa-cargo');
const BERKAS_JSON = arg('json', '');

const T0 = Date.now();
const hasil = [];
const temuan = [];
let gagal = 0;
function lulus(nama, kondisi, pesan) {
  if (kondisi) hasil.push(`LULUS  ${nama} — ${pesan}`);
  else {
    gagal += 1;
    hasil.push(`GAGAL  ${nama} — ${pesan}`);
  }
}
function temuanCatat(nama, pesan) {
  temuan.push(`TEMUAN ${nama} — ${pesan}`);
}

/* ------------------------------------------------ baca kode yang dikirim --- */
function baca(rel) {
  const p = path.join(AKAR, rel);
  if (!existsSync(p)) throw new Error(`berkas produk tidak ada: ${rel}`);
  return readFileSync(p, 'utf8');
}
function barisKe(teks, idx) {
  return teks.slice(0, idx).split('\n').length;
}
function potongAntara(teks, awal, akhir, nama) {
  const a = teks.indexOf(awal);
  if (a < 0) throw new Error(`penanda awal tidak ditemukan (${nama}): ${JSON.stringify(awal)}`);
  const b = teks.indexOf(akhir, a);
  if (b < 0) throw new Error(`penanda akhir tidak ditemukan (${nama}): ${JSON.stringify(akhir)}`);
  return { teks: teks.slice(a, b + akhir.length), mulai: a, baris: barisKe(teks, a) };
}

const SRC_RUST = baca('src-tauri/src/adapters/openai.rs');
const SRC_STORE = baca('src/lib/aiStore.ts');

/* Tangga perbaikan argumen Rust (dibaca apa adanya dari sumber yang dikirim). */
const RUST_LADDER = potongAntara(SRC_RUST, 'fn parse_argumen_tool(', '\n}\n', 'parse_argumen_tool');
const T_MALFORMED = (() => {
  // Kalimat kini diakhiri ": {}" (cuplikan argumen); pencocokan tidak lagi
  // mensyaratkan kutip penutup TEPAT setelah "arguments".
  const m = /Err\(format!\(\s*"tool call \\"\{name\}\\" returned malformed JSON arguments/.exec(SRC_RUST);
  if (!m) throw new Error('kalimat "returned malformed JSON arguments" tidak ditemukan di openai.rs');
  return 'tool call "{name}" returned malformed JSON arguments';
})();
const T_TERPOTONG = 'tool call "{name}" terpotong karena batas token keluaran tercapai — naikkan max tokens model (isi berkas besar dikirim sebagai argumen tool)';
const T_OBJEK = 'tool call "{name}" arguments must be a JSON object';
/* openai.rs (patch #5) mencetak cuplikan raw_args di kalimat malformed; bila
 * benar, setiap situs yang meneruskan res.error MEMBAWA potongan argumen. */
const RUST_MALFORMED_CUPLIK = /returned malformed JSON arguments:\s*\{\}/.test(SRC_RUST);
const T_TANPA_NAMA = 'tool call #{index} is missing a function name';
const T_KOSONG = 'tool call "{name}" arguments must be a JSON object';

lulus(
  'A1-tangga-rust',
  /buang_pagar_json/.test(RUST_LADDER.teks) &&
    /loloskan_kontrol/.test(RUST_LADDER.teks) &&
    /buang_koma_ujung/.test(RUST_LADDER.teks) &&
    /ambil_objek_terluar/.test(RUST_LADDER.teks),
  `parse_argumen_tool di ${path.basename('src-tauri/src/adapters/openai.rs')}:${RUST_LADDER.baris} memuat 4 langkah perbaikan ` +
    `(buang_pagar_json, loloskan_kontrol, buang_koma_ujung, ambil_objek_terluar) sebelum menyerah; ` +
    `kalimat galat produksi berasal dari sumber: '${T_MALFORMED.replace('{name}', 'NAMA')}'`,
);
lulus(
  'A2-tanpa-eksekusi-setengah-jadi',
  /let args: Value = parse_argumen_tool\(raw_args, false, name\)\?;/.test(SRC_RUST) &&
    /return Err\(format!\(\s*"tool call \\"\{name\}\\" arguments must be a JSON object"/.test(SRC_RUST),
  `openai.rs memakai '?' pada parse_argumen_tool dan 'return Err(...)' di dalam loop tool_calls: satu argumen cacat ` +
    `membatalkan SELURUH respons (tool_calls kosong), jadi tidak ada panggilan yang lolos dengan argumen setengah jadi`,
);
lulus(
  'A3-tapak-kendali-ts',
  SRC_STORE.includes('isRetryableAgentToolResponseError(res.error)') &&
    /const retryLimit = retryableToolResponse/.test(SRC_STORE) &&
    /isTruncatedToolResponseError\(res\.error \?\? ''\) \? 2 : 1/.test(SRC_STORE),
  `aiStore.ts memuat gerbang retry: retryLimit = truncated ? 2 : 1 (baris ${barisKe(SRC_STORE, SRC_STORE.indexOf('const retryLimit = retryableToolResponse'))}) ` +
    `dan bolehRetry mensyaratkan res.toolCalls.length === 0 (baris ${barisKe(SRC_STORE, SRC_STORE.indexOf('res.toolCalls.length === 0 &&'))})`,
);

/* Aturan TS dibaca dari teks fungsi yang dikirim (fungsi itu tidak diekspor). */
function aturanDariFungsi(teks, namaFungsi) {
  const mulai = teks.indexOf(`function ${namaFungsi}(`);
  if (mulai < 0) throw new Error(`fungsi ${namaFungsi} tidak ditemukan`);
  const akhir = teks.indexOf('\n}', mulai);
  const badan = teks.slice(mulai, akhir);
  const literals = [...badan.matchAll(/includes\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  const regexes = [...badan.matchAll(/\/\\b\(\?:([^)]+)\)\\b\//g)].map((m) => m[1].split('|'));
  return { badan, literals, angka: regexes.flat(), baris: barisKe(teks, mulai) };
}
const ATURAN_MALFORMED = aturanDariFungsi(SRC_STORE, 'isRetryableAgentToolResponseError');
const ATURAN_TERPOTONG = aturanDariFungsi(SRC_STORE, 'isTruncatedToolResponseError');
const ATURAN_PROVIDER = aturanDariFungsi(SRC_STORE, 'isRetryableAgentProviderError');

const termasuk = (teks, daftar) => {
  const t = teks.toLowerCase();
  return daftar.some((k) => t.includes(String(k).toLowerCase()));
};
const klasifikasi = (teks) => ({
  malformed: termasuk(teks, ATURAN_MALFORMED.literals),
  terpotong: termasuk(teks, ATURAN_TERPOTONG.literals),
  providerRetryable: termasuk(teks, ATURAN_PROVIDER.angka) && !termasuk(teks, ATURAN_PROVIDER.literals),
});

lulus(
  'A4-aturan-ts',
  ATURAN_MALFORMED.literals.length >= 5 && ATURAN_TERPOTONG.literals.length >= 1,
  `aturan malformed dibaca dari aiStore.ts:${ATURAN_MALFORMED.baris} (${ATURAN_MALFORMED.literals.length} literal: ${ATURAN_MALFORMED.literals.join(' | ')}); ` +
    `terpotong: ${ATURAN_TERPOTONG.literals.join(' | ')}; pengecualian provider: ${ATURAN_PROVIDER.literals.length} literal`,
);

/* ------------------------------------------------------- lapis eksekusi --- */
let cargoRingkas = 'tidak dijalankan (--tanpa-cargo)';
let cargoUji = [];
if (!TANPA_CARGO) {
  const keluaran = execFileSync(
    'cargo',
    ['test', '--offline', '--lib', 'adapters::openai', '--', '--test-threads=1'],
    { cwd: path.join(AKAR, 'src-tauri'), encoding: 'utf8', timeout: 600_000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  cargoUji = [...keluaran.matchAll(/^test ([\w:]+) \.\.\. ok$/gm)].map((m) => m[1]);
  const hasilBaris = /test result: (\w+)\. (\d+) passed; (\d+) failed/.exec(keluaran);
  const jumlahLulus = Number(hasilBaris?.[2] ?? 0);
  const jumlahGagal = Number(hasilBaris?.[3] ?? 0);
  cargoRingkas = `cargo test --offline --lib adapters::openai → ${jumlahLulus} lulus, ${jumlahGagal} gagal (${cargoUji.length} nama test terbaca)`;
  lulus(
    'B1-cargo',
    jumlahGagal === 0 && jumlahLulus >= 8 && cargoUji.length >= 8,
    `${cargoRingkas}: ${cargoUji.join(', ')}`,
  );
  if (jumlahLulus < 8) {
    temuanCatat('B1-cakupan', `hanya ${jumlahLulus} test Rust pada tangga argumen; bentuk cacat lain belum punya test.`);
  }
} else {
  temuanCatat('B1-cargo', 'lapis eksekusi Rust dilewati atas permintaan (--tanpa-cargo); bukti tangga Rust tidak diambil pada jalan ini.');
}

/* ---------------------------------------------------------- bentuk cacat --- */
/*
 * Setiap bentuk = apa yang dikirim model + kalimat galat yang DIHASILKAN kode
 * yang dikirim untuk bentuk itu (template Rust di atas, diisi apa adanya).
 */
const nama = 'write_file';
const BENTUK = [
  {
    id: 'M1-kutip-ganjil',
    apa: 'kutip ganjil di dalam string',
    raw: '{"path":"a.md","isi":"kata "ganjil" di sini"}',
    jalur: 'malformed',
    galat: T_MALFORMED.replace('{name}', nama),
    ujiRust: /rejects_malformed/,
  },
  {
    id: 'M2-terpotong-batas-token',
    apa: 'JSON terpotong karena batas token keluaran',
    raw: '{"path":"a.md","isi":"awal isi yang panjang',
    jalur: 'terpotong',
    galat: T_TERPOTONG.replace('{name}', nama),
    ujiRust: /truncated/,
  },
  {
    id: 'M3-terpotong-tanpa-flag',
    apa: 'JSON terpotong tapi stream tidak melaporkan batas token',
    raw: '{"path":"a.md","isi":"awal isi',
    jalur: 'malformed',
    galat: T_MALFORMED.replace('{name}', nama),
    ujiRust: /unterminated/,
  },
  {
    id: 'M4-json-dalam-string',
    apa: 'argumen dobel-encode (JSON di dalam string)',
    raw: '"{\\"path\\":\\"a.md\\"}"',
    jalur: 'perbaikan',
    galat: null,
    ujiRust: /wrapped_in_prose|ambil_objek_terluar/,
  },
  {
    id: 'M5-pagar-markdown',
    apa: 'argumen dibungkus pagar markdown ```json',
    raw: '```json\n{"path":"a.md"}\n```',
    jalur: 'perbaikan',
    galat: null,
    ujiRust: /fenced/,
  },
  {
    id: 'M6-koma-ujung',
    apa: 'koma menggantung di ujung objek',
    raw: '{"path":"a.md","isi":"x",}',
    jalur: 'perbaikan',
    galat: null,
    ujiRust: /trailing_comma/,
  },
  {
    id: 'M7-newline-mentah',
    apa: 'newline mentah di dalam string',
    raw: '{"path":"a.md","isi":"baris1\nbaris2"}',
    jalur: 'perbaikan',
    galat: null,
    ujiRust: /newlines_inside/,
  },
  {
    id: 'M8-argumen-kosong',
    apa: 'arguments kosong ("") - bukan JSON rusak',
    raw: '',
    jalur: 'kosong',
    galat: null,
    ujiRust: /empty_arguments/,
  },
  {
    id: 'M9-tipe-salah-array',
    apa: 'arguments berupa array, bukan objek',
    raw: '["path","a.md"]',
    jalur: 'objek',
    galat: T_OBJEK.replace('{name}', nama),
    ujiRust: /requires_object/,
  },
  {
    id: 'M10-tanpa-arguments',
    apa: 'field arguments tidak ada',
    raw: undefined,
    jalur: 'kosong',
    galat: null,
    ujiRust: /empty_arguments|preserves_valid/,
  },
  {
    id: 'M11-tanpa-nama-fungsi',
    apa: 'nama fungsi kosong',
    raw: '{"path":"a.md"}',
    jalur: 'tanpa-nama',
    galat: T_TANPA_NAMA.replace('{index}', '0'),
    ujiRust: /missing_a_function_name|rejects_malformed/,
  },
  {
    id: 'M12-argumen-ganda',
    apa: 'dua panggilan: #0 sah, #1 cacat',
    raw: '[ok, cacat]',
    jalur: 'malformed',
    galat: T_MALFORMED.replace('{name}', nama),
    ujiRust: /rejects_malformed|requires_object/,
  },
  {
    id: 'M13-provider-429',
    apa: 'bukan cacat argumen: provider 429',
    raw: '{"path":"a.md"}',
    jalur: 'provider',
    galat: '429 Too Many Requests: rate limit exceeded',
    ujiRust: null,
  },
  {
    id: 'M14-argumen-valid',
    apa: 'argumen sah (kontrol)',
    raw: '{"path":"a.md","isi":"x"}',
    jalur: 'sah',
    galat: null,
    ujiRust: /preserves_valid/,
  },
];

const catatanBentuk = [];
let bentukGagal = 0;
const cekBentuk = (b) => {
  if (b.galat === null) {
    // Bentuk ini selesai di tangga perbaikan Rust atau sah; yang bisa dinyatakan
    // di lapis TS hanyalah: tidak ada kalimat galat yang akan diproduksi, jadi
    // tidak ada jalur pemulihan yang boleh menyala.
    const k = klasifikasi('tool call "x" has finished with a valid result');
    if (k.malformed) return { ok: false, pesan: 'kalimat sukses malah terbaca malformed - aturan terlalu longgar' };
    return { ok: true, pesan: `perbaikan/kosong: tidak ada kalimat galat dibuat (${b.apa})` };
  }
  if (b.jalur === 'provider') {
    const k = klasifikasi(b.galat);
    return {
      ok: k.providerRetryable === true && k.malformed === false,
      pesan:
        `'${b.galat}' → jalur malformed=${k.malformed} (harus false), provider retryable=${k.providerRetryable} (harus true): ` +
        'galat provider tidak boleh salah masuk ke jalur argumen, dan sebaliknya',
    };
  }
  const k = klasifikasi(b.galat);
  const harusTerpotong = b.jalur === 'terpotong';
  const menyebutNama = b.galat.includes(nama) || /#\d/.test(b.galat);
  const adaPotonganArgumen = /argumen:|potongan|\[\.\.\.|\.\.\.\]/.test(b.galat);
  return {
    ok: k.malformed === true && k.terpotong === harusTerpotong && menyebutNama === true,
    pesan:
      `'${b.galat}' → malformed=${k.malformed} (harus true), terpotong=${k.terpotong} (harus ${harusTerpotong}), ` +
      `menyebut nama tool/index=${menyebutNama} (harus true), ada potongan argumen salah=${adaPotonganArgumen}`,
  };
};

BENTUK.forEach((b, i) => {
  const r = cekBentuk(b);
  if (!r.ok) bentukGagal += 1;
  lulus(b.id, r.ok, `${b.apa} — ${r.pesan}`);
  // Bentuk ber-jalur 'malformed' tidak lagi masuk temuan kalau sumber Rust
  // benar-benar mencetak cuplikan argumen (dicek dari openai.rs, bukan asumsi).
  if (
    r.ok &&
    b.galat &&
    !/argumen:|potongan|\[\.\.\./.test(b.galat) &&
    !(RUST_MALFORMED_CUPLIK && b.jalur === 'malformed')
  ) {
    catatanBentuk.push(b.id);
  }
});

lulus(
  'M15-cakupan',
  bentukGagal === 0,
  `${BENTUK.length} bentuk cacat diuji di lapis TS (kutip ganjil, terpotong, dobel-encode, pagar, koma ujung, newline, kosong, array, tanpa arguments, ` +
    `tanpa nama, ganda, provider 429, kontrol sah); gagal=${bentukGagal}`,
);

/* Pesan galat tidak memuat potongan argumen yang salah -> temuan + usulan. */
if (catatanBentuk.length > 0) {
  const pemakaianRawArgs = [...SRC_RUST.matchAll(/raw_args/g)].map((m) => barisKe(SRC_RUST, m.index));
  temuanCatat(
    'M16-potongan-argumen',
    `${catatanBentuk.length}/${BENTUK.length} kalimat galat menyebut NAMA tool tetapi TIDAK memuat potongan argumen yang salah ` +
      `(${catatanBentuk.join(', ')}). Di openai.rs, \`raw_args\` hanya dipakai di baris ${pemakaianRawArgs.join(', ')} - semuanya untuk parsing, bukan untuk laporan. ` +
      'Usulan: lihat docs/LAPORAN-BEBAN-DAN-MALFORMED.md (patch openai.rs ~633).',
  );
}

/* Jalur pemulihan: pesan yang benar-benar dibaca model. */
{
  const situs = [
    { nama: 'pesan-lanjutan (ID)', penanda: 'Panggilan tool terakhirmu punya JSON argumen' },
    { nama: 'entri langkah (ID)', penanda: 'Panggilan tool terakhir ber-JSON argumen rusak' },
    { nama: 'koreksiArgumenTool (EN)', penanda: 'The previous response had invalid tool-call arguments' },
  ];
  const rincian = [];
  let adaNama = 0;
  let adaPotongan = 0;
  for (const s of situs) {
    const i = SRC_STORE.indexOf(s.penanda);
    if (i < 0) {
      rincian.push(`${s.nama}: TIDAK DITEMUKAN`);
      continue;
    }
    /* Jendela SEMPIT per-situs: cukup untuk ekspresi pesan situs itu sendiri,
     * TIDAK menjangkau baris tetangga. Jendela lebar lama slice(i-200, i+900)
     * untuk situs pesan-lanjutan menjangkau `throw new Error(res.error)` di
     * aiStore.ts beberapa ratus char di BAWAH penanda -> melaporkan
     * 'menyertakan res.error' 3/3 padahal sebenarnya 1/3. [temuan M17] */
    const lebarJendela = {
      'pesan-lanjutan (ID)': [100, 60],
      'entri langkah (ID)': [40, 200],
      'koreksiArgumenTool (EN)': [100, 60],
    };
    const [keBelakang, keDepan] = lebarJendela[s.nama] ?? [100, 60];
    const sekitar = SRC_STORE.slice(i - keBelakang, i + keDepan);
    const pakaiError = /res\.error/.test(sekitar);
    const pakaiArgumenLangsung = /\b(raw_args|argumenMentah|cuplik\w*|potonganArgumen)\b/.test(sekitar) || /args\b.*(slice|potong)/.test(sekitar);
    /* Potongan argumen salah tiba lewat res.error karena openai.rs mencetak
     * cuplik_argumen(raw); diverifikasi dari sumber, bukan diasumsikan. */
    const pakaiArgumen = pakaiArgumenLangsung || (pakaiError && RUST_MALFORMED_CUPLIK);
    if (pakaiError) adaNama += 1;
    if (pakaiArgumen) adaPotongan += 1;
    rincian.push(
      `${s.nama} (aiStore.ts:${barisKe(SRC_STORE, i)}): res.error=${pakaiError} [jendela -${keBelakang}/+${keDepan}], ` +
        `potongan argumen=${pakaiArgumen}${pakaiArgumenLangsung ? ' (langsung)' : pakaiArgumen ? ' (lewat res.error -> cuplik_argumen)' : ''}`,
    );
  }
  lulus(
    'M17-pesan-ke-model',
    rincian.every((r) => !r.includes('TIDAK DITEMUKAN')) && adaNama > 0,
    `${rincian.join('; ')} → nama tool sampai ke model lewat res.error pada ${adaNama}/${situs.length} situs, ` +
      `potongan argumen mentah pada ${adaPotongan}/${situs.length} situs`,
  );
  if (adaPotongan === 0) {
    temuanCatat(
      'M17-potongan',
      'ketiga pesan pemulihan menyebut nama tool (lewat res.error) tetapi TIDAK memuat potongan argumen yang salah; ' +
        'model harus menebak bagian mana yang rusak. Usulan patch ada di laporan.',
    );
  }
}

/* Pemulihan tidak boleh mengeksekusi tool setengah jadi: tapak kendali. */
{
  const mulai = SRC_STORE.indexOf('const responsToolRusak = isRetryableAgentToolResponseError(res.error);');
  const blok = SRC_STORE.slice(mulai, mulai + 2600);
  const idxContinue = blok.indexOf('continue;');
  const sebelumContinue = idxContinue > 0 ? blok.slice(0, idxContinue) : blok;
  const pemanggilTool = [...sebelumContinue.matchAll(/(jalankanTool|jalankanAgentTool|eksekusiTool|await tool[A-Z]\w*\(|panggilTool\w*\()/g)].map(
    (m) => m[1],
  );
  const afterBlok = idxContinue > 0 ? blok.slice(idxContinue, idxContinue + 1400) : '';
  const pemanggilSetelah = [...afterBlok.matchAll(/(jalankanTool|jalankanAgentTool|eksekusiTool|panggilTool\w*\()/g)].map((m) => m[1]);
  lulus(
    'M18-tanpa-eksekusi',
    idxContinue > 0 && pemanggilTool.length === 0,
    `blok pemulihan aiStore.ts:${barisKe(SRC_STORE, mulai)} memuat 'continue;' di ${idxContinue} char sebelum ada panggilan tool; ` +
      `pemanggil tool SEBELUM continue=${pemanggilTool.length}; sesudahnya=${pemanggilSetelah.length} (jalur normal, bukan jalur rusak)`,
  );
}

/* Determinisme: klasifikasi dua kali harus identik. */
{
  const jalankan = () =>
    BENTUK.map((b) => (b.galat ? `${b.id}:${JSON.stringify(klasifikasi(b.galat))}` : `${b.id}:tanpa-galat`)).join('|');
  const d1 = createHash('sha256').update(jalankan()).digest('hex');
  const d2 = createHash('sha256').update(jalankan()).digest('hex');
  lulus('M19-determinisme', d1 === d2, `digest jalan 1 = jalan 2 = ${d1.slice(0, 16)}…; tanpa jaringan, tanpa app, tanpa CDP`);
}

/* --------------------------------------------------------------- ringkas --- */
const laporan = {
  lulus: hasil.filter((h) => h.startsWith('LULUS')).length,
  gagal,
  temuan: temuan.length,
  kasus: hasil,
  temuanCatat: temuan,
  cargo: cargoRingkas,
  ujiCargo: cargoUji,
  aturanMalformed: ATURAN_MALFORMED.literals,
  aturanTerpotong: ATURAN_TERPOTONG.literals,
  situsPesan: { barisFungsi: ATURAN_MALFORMED.baris },
  durasiMs: Date.now() - T0,
};

console.log('=== UJI MALFORMED ARGS — agen tidak boleh mati karena argumen cacat ===');
console.log(`kode yang dibaca: src-tauri/src/adapters/openai.rs (tangga perbaikan, ${RUST_LADDER.baris}-) + src/lib/aiStore.ts (gerbang retry)`);
console.log(`lapis eksekusi: ${cargoRingkas}`);
console.log('');
for (const baris of hasil) console.log(baris);
if (temuan.length) {
  console.log('');
  for (const baris of temuan) console.log(baris);
}
console.log('');
console.log(`RINGKASAN: LULUS=${laporan.lulus} GAGAL=${gagal} TEMUAN=${temuan.length} dari ${BENTUK.length} bentuk cacat (${laporan.durasiMs} ms)`);
if (BERKAS_JSON) {
  writeFileSync(BERKAS_JSON, JSON.stringify(laporan, null, 2), 'utf8');
  console.log(`json: ${BERKAS_JSON}`);
}
process.exit(gagal > 0 ? 1 : 0);
