#!/usr/bin/env node
/*
 * uji-anggaran-pesan.mjs — uji ANGGARAN PESAN (BUG-ANGGARAN-PESAN) secara
 * deterministik: TANPA jaringan, TANPA app, TANPA CDP, TANPA cargo.
 *
 * Yang harus dibuktikan/dibantah (semua angka dari KODE YANG DIKIRIM)
 * -----------------------------------------------------------------
 *   1. Payload akhir SETIAP giliran <= PAYLOAD_MAX_CHARS.  ukuranPayload()
 *      mengukur PESAN saja; pada kabel nyata `tools: toolSpecs` dikirim DI
 *      ATASNYA dan `capUntukPesan` mengasumsikan reserve itu menutupnya.
 *   2. Pesan TERAKHIR yang benar-benar dikirim == pesan terakhir asli,
 *      ATAU ada catatan pemotongan eksplisit yang terlihat model.
 *   3. Penjaga di src/lib/contextBudget.ts (~183/189) benarkah DIEKSEKUSI?
 *      Kontrol positif (dipaksa nyala) + kontrol negatif (kode asli).
 *   4. KETIGA situs pesan pemulihan argumen-cacat di src/lib/aiStore.ts
 *      (termasuk :6046 jalur EN) memuat NAMA tool + POTONGAN argumen salah.
 *   5. Laju percobaan ulang provider tidak melewati 70 percobaan/60 dtk.
 *   6. Determinisme (dua jalan, digest sama).
 *
 * Semua modul TS asli dibundel esbuild (pola scripts/uji-beban-raksasa.mjs),
 * lalu fungsi aslinya benar-benar dipanggil. Konstanta dibaca saat runtime.
 *
 * Cara pakai
 * ----------
 *   node scripts/uji-anggaran-pesan.mjs
 *   node scripts/uji-anggaran-pesan.mjs --giliran=44
 *   node scripts/uji-anggaran-pesan.mjs --json=hasil.json
 *
 * Keluar 1 kalau ada GAGAL (harness ini MEMANG bisa merah: sebagian kasus
 * sengaja mengukur klaim yang mungkin salah).
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERJA = path.join(AKAR, 'scratch', 'uji-anggaran-pesan');
mkdirSync(KERJA, { recursive: true });

/* ------------------------------------------------------------------ CLI --- */
const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};
const GILIRAN = Math.max(12, Number(arg('giliran', '44')) || 44);
const BERKAS_JSON = arg('json', '');

/* ------------------------------------------------ bundel kode asli (TS) --- */
const SPANDUK = '// DIHASILKAN OLEH scripts/uji-anggaran-pesan.mjs - jangan disunting\n';
function bundel(namaEntri, isiEntri, namaKeluar) {
  const entri = path.join(KERJA, namaEntri);
  const keluar = path.join(KERJA, namaKeluar);
  writeFileSync(entri, SPANDUK + isiEntri, 'utf8');
  const esbuild = path.join(AKAR, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (!existsSync(esbuild)) throw new Error(`esbuild tidak ada di ${esbuild}`);
  execFileSync(
    process.execPath,
    [
      esbuild,
      '--bundle',
      '--format=esm',
      '--platform=node',
      '--define:globalThis.self=globalThis',
      '--define:import.meta.env={"DEV":false,"PROD":true,"MODE":"production","SSR":false}',
      `--outfile=${keluar}`,
      entri,
      '--log-level=warning',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'], cwd: AKAR },
  );
  return keluar;
}

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const entriInti = `
export { systemPromptFor } from '../../src/lib/systemPrompt';
export { PAYLOAD_MAX_CHARS, ukuranPayload, kiraToken } from '../../src/lib/contextBudget';
export {
  ringkasRiwayat, bentukWireRiwayat, statusPekerjaan, potongHasilRiwayat,
  HISTORY_KEEP_STEPS, HISTORY_TOOL_CHARS, HISTORY_TOOL_TAIL_RATIO,
  MAX_AGENT_STEPS, PADAT_BATAS_BERKAS,
  KALIMAT_PASCA_POTONG_CHARS, CATATAN_MAKS_CHARS, potongCatatan,
} from '../../src/lib/aiStore';
export { agentToolSpecs } from '../../src/lib/agentTools';
export { TOOL_DIKIRIM_SELALU } from '../../src/lib/zephyrTools/catalog';
`;
const BUNDLE = bundel('entri.mjs', entriInti, 'entri.bundle.mjs');
const M = await import(pathToFileURL(BUNDLE).href);

/* --------------------------------------------------------------- laporan --- */
const hasil = [];
const temuan = [];
let gagal = 0;
let DIGEST = '';
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
const angka = (n) => new Intl.NumberFormat('id-ID').format(n);

/* ---------------------------------- baca teks kode yang dikirim (sumber) --- */
function baca(rel) {
  const p = path.join(AKAR, rel);
  if (!existsSync(p)) throw new Error(`berkas produk tidak ada: ${rel}`);
  return readFileSync(p, 'utf8');
}
function barisKe(teks, idx) {
  return teks.slice(0, idx).split('\n').length;
}
const SRC_BUDGET = baca('src/lib/contextBudget.ts');
const SRC_STORE = baca('src/lib/aiStore.ts');

/* ------------------------------------------------- konstanta KODE ASLI --- */
const T0 = Date.now();
const SEMUA_TOOL = M.TOOL_DIKIRIM_SELALU ?? [];
const SPEC_TOOL = M.agentToolSpecs({ alat: SEMUA_TOOL });
const UKURAN_SPEC_WRAP = M.ukuranPayload([SPEC_TOOL]); // = reserveTools - 2048
const UKURAN_SPEC = JSON.stringify(SPEC_TOOL).length; // bentuk kabel: tools: spec
const RESERVE_TOOL = UKURAN_SPEC_WRAP + 2048;
const SISTEM = M.systemPromptFor('id', '', '', '', '', '', `ubah ${GILIRAN} berkas di docs/generated/`);
const SISTEM_CHAR = SISTEM.length;
/* cap menirukan aiStore.ts PERSIS: blok tetap (system prompt + envelope
 * kalimat pasca-potong) dikurangi lebih dulu, baru katalog tool. Menaikkan cap
 * di sini alih-alih mengikuti produk = melunakkan uji. */
const KALIMAT_PASCA_POTONG_CHARS = M.KALIMAT_PASCA_POTONG_CHARS;
const BIAYA_TETAP = M.ukuranPayload([{ role: 'system', content: SISTEM }]) + KALIMAT_PASCA_POTONG_CHARS;
/* Cap memakai SATUAN YANG SAMA dengan ringkasUkuran (system-inclusive),
   persis mengikuti aiStore.ts — bukan turunannya sendiri. */
const CAP_PESAN = Math.max(20_000, M.PAYLOAD_MAX_CHARS - RESERVE_TOOL);
/* systemPrompt.ts:94 menyematkan `new Date().toISOString()` (dan potret state
 * app yang hidup), jadi PANJANG mentah bergeser antar-jalan. Untuk digest yang
 * bisa dibandingkan lintas-proses, normalkan cap waktu ISO ke '<ISO>'. */
const SISTEM_NORM = SISTEM.replace(/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/g, '<ISO>');
const SISTEM_NORM_CHAR = SISTEM_NORM.length;

const KANDIDAT_KUERI = ['padatkanRiwayatMurni', 'aiStore', 'suntikanIndeks', 'ubah berkas', 'malformed JSON arguments'];
void KANDIDAT_KUERI;

/* ============================================================================
 * BAGIAN A — ANGGARAN PAYLOAD
 * ==========================================================================*/
const berkasKe = (i) => `docs/generated/berkas-${String(i + 1).padStart(2, '0')}.md`;

/*
 * Rakit payload satu giliran PERSIS seperti src/lib/aiStore.ts ~5954-6048:
 *   pesanMentah -> bentukWireRiwayat -> ringkasRiwayat(cap) -> bentukWireRiwayat
 *   -> catatan status ditempel ke pesan TERAKHIR (6016-6024) -> kalimat
 *   gerbang rencana / koreksi argumen (6026-6048) ditempel SETELAH pemotongan.
 * Semua panggilan fungsi ASLI dari bundel.
 */
function rakitGiliran(history, { todos, steps, langkahKe }) {
  const aiPesan = M.bentukWireRiwayat(history.slice());
  const dipotong = M.ringkasRiwayat(aiPesan, CAP_PESAN);
  const pesan = M.bentukWireRiwayat(dipotong);
  const catatanStatus = M.potongCatatan(M.statusPekerjaan(todos, steps, langkahKe, M.MAX_AGENT_STEPS));
  const terakhir = pesan[pesan.length - 1];
  if (terakhir && terakhir.role !== 'assistant') {
    pesan[pesan.length - 1] = { ...terakhir, content: `${terakhir.content}\n\n${catatanStatus}` };
  } else {
    pesan.push({ role: 'user', content: catatanStatus });
  }
  const ukuranPesan = M.ukuranPayload(pesan); // apa yang DIUKUR kode
  const totalKabel = ukuranPesan + UKURAN_SPEC; // apa yang DIKIRIM: pesan + tools
  const ukuranBasisPotong = M.ukuranPayload(M.bentukWireRiwayat(dipotong)); // sebelum catatan ditempel
  const deltaAppend = ukuranPesan - ukuranBasisPotong; // catatan pasca-potong yang TAK dianggarkan
  const ekorAsli = aiPesan.filter((m) => m.role !== 'system').at(-1);
  const ekorKirim = dipotong.filter((m) => m.role !== 'system').at(-1);
  const isiAsli = String(ekorAsli?.content ?? '');
  const isiKirim = String(ekorKirim?.content ?? '');
  const adaCatatan =
    /batas gateway/.test(isiKirim) || /characters in the middle are not sent/.test(isiKirim) || /gambar dilepas/.test(isiKirim);
  return {
    ukuranPesan,
    totalKabel,
    deltaAppend,
    ekorRole: ekorAsli?.role ?? '-',
    ekorRoleKirim: ekorKirim?.role ?? '-',
    ekorAsliLen: isiAsli.length,
    ekorKirimLen: isiKirim.length,
    ekorSama: ekorAsli?.role === ekorKirim?.role && isiAsli === isiKirim,
    ekorAdaCatatan: adaCatatan,
  };
}

/* Simulasi beban: system + user + rencana + N giliran (baca/asisten/tulis). */
function simulasi({ jumlah, bacaChar, tulisChar, asistenChar }) {
  const status = new Array(jumlah).fill(false);
  const todo = Array.from({ length: jumlah }, (_, i) => ({ content: `ubah ${berkasKe(i)}`, status: 'pending' }));
  const pesanRencana = { role: 'assistant', content: '', toolCalls: [{ name: 'todo_write', args: { todos: todo } }] };
  const history = [
    { role: 'system', content: SISTEM },
    { role: 'user', content: `Ubah ${jumlah} berkas di docs/generated/. Satu berkas per giliran.` },
    pesanRencana,
  ];
  const perGiliran = [];
  const steps = [];
  for (let g = 0; g < jumlah; g++) {
    const todos = status.map((s, i) => ({ content: `ubah ${berkasKe(i)}`, status: s ? 'done' : 'pending' }));
    /* Giliran nyata: model MEMBACA berkas dulu; payload diukur tepat sebelum
     * panggilan API, jadi pesan TERAKHIR adalah hasil tool baca yang PANJANG —
     * inilah saat penjaga-giliran-terakhir / trim-terakhir seharusnya bekerja. */
    history.push({ role: 'assistant', content: '', toolCalls: [{ name: 'read_file', args: { path: berkasKe(g) } }] });
    history.push({
      role: 'tool',
      name: 'read_file',
      content: `# ${berkasKe(g)}\n` + 'isi lama\n'.repeat(Math.ceil(bacaChar / 9)).slice(0, bacaChar),
    });
    const r = rakitGiliran(history, { todos, steps, langkahKe: g + 1 });
    perGiliran.push({ giliran: g + 1, ...r });
    // tulis berkas, lanjut ke giliran berikutnya
    history.push({ role: 'assistant', content: `Berkas ${berkasKe(g)} sudah ditulis ulang; lanjut.` + 'x'.repeat(Math.max(0, asistenChar - 50)) });
    history.push({ role: 'tool', name: 'write_file', content: `Berkas ditulis: ${berkasKe(g)} (${tulisChar} char)` });
    steps.push({ kind: 'tool', name: 'write_file', args: '{}', result: `Berkas ditulis: ${berkasKe(g)}`, ok: true, at: g });
    status[g] = true;
  }
  return perGiliran;
}

const perGiliran = simulasi({ jumlah: GILIRAN, bacaChar: 6000, tulisChar: 240, asistenChar: 220 });
const puncakPesan = Math.max(...perGiliran.map((g) => g.ukuranPesan));
const puncakKabel = Math.max(...perGiliran.map((g) => g.totalKabel));
const minKabel = Math.min(...perGiliran.map((g) => g.totalKabel));
const pelanggaranKabel = perGiliran.filter((g) => g.totalKabel > M.PAYLOAD_MAX_CHARS);
const gTurunEkor = perGiliran.filter((g) => !g.ekorSama);

/* A1 — angka blok tetap (system + reserve) vs anggaran. */
{
  const blokTetap = SISTEM_CHAR + RESERVE_TOOL;
  lulus(
    'A1-blok-tetap',
    true,
    `systemPromptFor()=${angka(SISTEM_CHAR)} char; spec ${SEMUA_TOOL.length} tool=${angka(UKURAN_SPEC)} char (ukur-pesan ${angka(UKURAN_SPEC_WRAP)}); ` +
      `reserveTools=spec+2048=${angka(RESERVE_TOOL)} char; capUntukPesan=PAYLOAD_MAX_CHARS-reserveTools=${angka(CAP_PESAN)} char; ` +
      `PAYLOAD_MAX_CHARS=${angka(M.PAYLOAD_MAX_CHARS)}; blok tetap (system+reserve)=${angka(blokTetap)} char`,
  );
  if (SISTEM_CHAR > CAP_PESAN) {
    temuanCatat(
      'A1-cap-tak-tercapai',
      `systemPromptFor() (${angka(SISTEM_CHAR)} char) SUDAH melebihi capUntukPesan (${angka(CAP_PESAN)} char) sebelum satu pesan riwayat ikut; ` +
        `ringkasUkuran() tidak pernah menyentuh pesan system, jadi cap ini TIDAK MUNGKIN dicapai dengan memangkas riwayat - yang dikorbankan selalu riwayat.`,
    );
  }
}

/* A2 — bisakah capUntukPesan dicapai? (system prompt memuat pesan system). */
{
  const bisa = SISTEM_CHAR <= CAP_PESAN;
  lulus(
    'A2-cap-tercapai',
    bisa,
    bisa
      ? `capUntukPesan ${angka(CAP_PESAN)} char mampu memuat blok tetap ${angka(SISTEM_CHAR)} char`
      : `capUntukPesan ${angka(CAP_PESAN)} char < blok tetap ${angka(SISTEM_CHAR)} char: TIDAK MUNGKIN dicapai (selisih ${angka(SISTEM_CHAR - CAP_PESAN)} char); ` +
        `setiap giliran memaksa jalur potong-terakhir (contextBudget.ts:288-300) menyala`,
  );
}

/* A3 — payload akhir SETIAP giliran <= PAYLOAD_MAX_CHARS (pesan + tools). */
{
  lulus(
    'A3-payload-giliran',
    pelanggaranKabel.length === 0,
    `${GILIRAN} giliran; payload kabel (ukuranPayload(pesan)+ukuranPayload(tools)) ${angka(minKabel)}-${angka(puncakKabel)} char; ` +
      `puncak ${angka(puncakKabel)} char vs PAYLOAD_MAX_CHARS=${angka(M.PAYLOAD_MAX_CHARS)}; ` +
      `giliran yang MELEWATI batas=${pelanggaranKabel.length}/${GILIRAN}` +
      `${pelanggaranKabel.length ? ` (contoh giliran ${pelanggaranKabel[0].giliran}: pesan ${angka(pelanggaranKabel[0].ukuranPesan)} + tool ${angka(UKURAN_SPEC)} = ${angka(pelanggaranKabel[0].totalKabel)} char, lebih ${angka(pelanggaranKabel[0].totalKabel - M.PAYLOAD_MAX_CHARS)} char)` : ''}`,
  );
  if (pelanggaranKabel.length > 0) {
    temuanCatat(
      'A3-kabel-lewat-batas',
      `payload yang BENAR-BENAR dikirim (pesan + spec tool) melewati PAYLOAD_MAX_CHARS di ${pelanggaranKabel.length}/${GILIRAN} giliran; puncak ${angka(puncakKabel)} char ` +
        `(lebih ${angka(puncakKabel - M.PAYLOAD_MAX_CHARS)} char). Akar: ukuranPayload() hanya mengukur PESAN, sementara ` +
        `capUntukPesan=PAYLOAD_MAX_CHARS-reserveTools (${angka(CAP_PESAN)}) mengasumsikan reserve menutup spec tool - padahal blok tetap ` +
        `${angka(SISTEM_CHAR)} char sudah > cap ${angka(CAP_PESAN)} char, jadi pesan tak pernah turun ke cap dan reserve 2048 char tak cukup menutup selisihnya.`,
    );
  }
}

/* A4 — dari mana kelebihannya: ukur pesan vs cap. */
{
  const lewatCap = perGiliran.filter((g) => g.ukuranPesan > CAP_PESAN);
  const puncakLewatCap = puncakPesan - CAP_PESAN;
  lulus(
    'A4-pesan-lewat-cap',
    lewatCap.length === 0,
    `ukuranPayload(pesan) puncak=${angka(puncakPesan)} char vs capUntukPesan=${angka(CAP_PESAN)} char; lewat cap di ${lewatCap.length}/${GILIRAN} giliran ` +
      `(kelebihan puncak ${angka(puncakLewatCap)} char); reserve margin 2048 char vs kelebihan ${angka(puncakLewatCap)} char -> ` +
      `${puncakLewatCap > 2048 ? 'margin HABIS' : 'margin masih cukup'}`,
  );
}

/* A5 — catatan yang ditempel SETELAH pemotongan tidak ikut dianggarkan. */
{
  const puncakAppend = Math.max(...perGiliran.map((g) => g.deltaAppend));
  lulus(
    'A5-append-pasca-potong',
    puncakAppend <= KALIMAT_PASCA_POTONG_CHARS,
    `catatan status ditempel SETELAH ringkasRiwayat() (aiStore.ts:6009-6025); penambahan puncak=${angka(puncakAppend)} char vs envelope ` +
      `KALIMAT_PASCA_POTONG_CHARS=${angka(KALIMAT_PASCA_POTONG_CHARS)} char (kini DISISIHKAN di capUntukPesan) dan batas keras ` +
      `CATATAN_MAKS_CHARS=${angka(M.CATATAN_MAKS_CHARS)} char (potongCatatan)`,
  );
  if (puncakAppend > KALIMAT_PASCA_POTONG_CHARS)
    temuanCatat(
      'A5-append-luar-anggaran',
      `tiga kalimat (status pekerjaan, gerbang rencana, koreksi argumen) ditempel ke pesan SETELAH ringkasRiwayat() dipanggil; penambahan terukur sampai ` +
        `${angka(puncakAppend)} char, MELEBIHI envelope KALIMAT_PASCA_POTONG_CHARS ${angka(KALIMAT_PASCA_POTONG_CHARS)} char pada beban ${GILIRAN} giliran.`,
    );
}

/* ============================================================================
 * BAGIAN B — PESAN TERAKHIR: ASLI vs TERKIRIM
 * ==========================================================================*/
{
  const contoh = gTurunEkor[0];
  const tanpaCatatan = gTurunEkor.filter((g) => !g.ekorAdaCatatan);
  lulus(
    'B1-ekor-identitas',
    gTurunEkor.length === 0 || gTurunEkor.every((g) => g.ekorAdaCatatan),
    `giliran yang pesan TERAKHIRNYA (sebelum catatan status) berbeda dari aslinya: ${gTurunEkor.length}/${GILIRAN}; ` +
      `di antaranya TANPA catatan pemotongan=${tanpaCatatan.length}` +
      `${contoh ? `; contoh giliran ${contoh.giliran}: ${contoh.ekorRole} asli ${angka(contoh.ekorAsliLen)} char → ${contoh.ekorRoleKirim} terkirim ${angka(contoh.ekorKirimLen)} char` : ''}`,
  );
  if (gTurunEkor.length > 0) {
    temuanCatat(
      'B1-ekor-dipotong',
      `${gTurunEkor.length}/${GILIRAN} giliran mengirim pesan TERAKHIR yang bukan pesan terakhir asli (contoh: ${contoh?.ekorRole} ${angka(contoh?.ekorAsliLen ?? 0)}→${angka(contoh?.ekorKirimLen ?? 0)} char). ` +
        `Catatan pemotongan resmi produk ADA di ${gTurunEkor.length - tanpaCatatan.length}/${gTurunEkor.length} contoh -> model diberi tahu, jadi ini bukan pemotongan DIAM-DIAM; ` +
        `tetapi isi pesan terakhir berubah karena sisa anggaran riwayat sempit: ` +
        `cap ${angka(CAP_PESAN)} - blok tetap ${angka(SISTEM_CHAR)} - envelope = cuma ${angka(CAP_PESAN - SISTEM_CHAR - KALIMAT_PASCA_POTONG_CHARS)} char riwayat.`,
    );
  }
}
{
  const contoh = gTurunEkor[0];
  lulus(
    'B2-ekor-catatan-terlihat',
    gTurunEkor.every((g) => g.ekorAdaCatatan),
    `catatan pemotongan eksplisit yang terlihat model pada pesan terakhir: ${gTurunEkor.length - gTurunEkor.filter((g) => !g.ekorAdaCatatan).length}/${gTurunEkor.length}` +
      `${contoh ? `; contoh teks catatan memuat 'batas gateway'=${/batas gateway/.test(String(contoh.ekorKirimLen)) || contoh.ekorAdaCatatan}` : ''}; ` +
      `jalur potong-terakhir contextBudget.ts:297`,
  );
}

/* B3 — contoh paksa: pesan terakhir panjang DIPOTONG, disertai catatan eksplisit. */
{
  const masuk = [{ role: 'system', content: 'S'.repeat(3000) }];
  for (let i = 0; i < 6; i++) {
    masuk.push({ role: 'assistant', content: 'a'.repeat(4000) });
    masuk.push({ role: 'tool', name: 'read_file', content: `T${i}\n` + 't'.repeat(9000) });
  }
  masuk.push({ role: 'assistant', content: '', toolCalls: [{ name: 'read_file' }] });
  /*
   * Ekornya HARUS benar-benar melewati `CAP_PESAN`.
   *
   * Versi lama memakai 25.000 karakter, dan itu tidak pernah memaksa jalur
   * potong-terakhir menyala: pass 2 sudah memendekkan pesan-pesan TUA ke STUB
   * (1.200 char), jadi totalnya turun di bawah cap sebelum kendali sampai ke
   * pemotong ekor. Hasilnya ekor dikirim UTUH tanpa catatan, dan B3 merah
   * selamanya - bukan karena produknya salah, tapi karena fixture-nya terlalu
   * kecil untuk mencapai jalur yang diuji.
   *
   * Terukur: 25.000 char -> ekor utuh, tanpa catatan. 90.000 char -> ekor
   * 90.014 dipotong jadi 51.520 DENGAN catatan. Angka 90.000 dipakai supaya
   * kasus ini tetap di atas cap walau STUB berubah.
   */
  masuk.push({ role: 'tool', name: 'read_file', content: '# EKOR-BERKAS\n' + 'e'.repeat(90_000) });
  const asli = String(masuk.at(-1).content);
  const keluar = M.ringkasRiwayat(masuk, CAP_PESAN);
  const ekor = String(keluar.filter((m) => m.role !== 'system').at(-1)?.content ?? '');
  const adaCatatan = /batas gateway/.test(ekor);
  lulus(
    'B3-ekor-dipotong-bercatatan',
    ekor !== asli && adaCatatan,
    `pesan terakhir asli ${angka(asli.length)} char → terkirim ${angka(ekor.length)} char (dipotong, BUKAN sama); ` +
      `catatan 'batas gateway' yang terlihat model=${adaCatatan} (contextBudget.ts:288-300)`,
  );
}

/* ============================================================================
 * BAGIAN C — PENJAGA contextBudget.ts (~183/189): MATI?
 * ==========================================================================*/
const GUARD_RE = /if \(i === clone\.length - 1\) continue;/;
const LOOP_RE = /for \(let i = 0; i < clone\.length; i\+\+\) \{/;
const guardM = GUARD_RE.exec(SRC_BUDGET);
const guardIdx = guardM ? guardM.index : -1;
const stubAtSrc = SRC_BUDGET.indexOf('const STUB');
const loopM = LOOP_RE.exec(SRC_BUDGET.slice(stubAtSrc));
const loopIdx2 = loopM ? stubAtSrc + loopM.index : -1;
const barisGuard = guardIdx >= 0 ? barisKe(SRC_BUDGET, guardIdx) : -1;
const barisLoop2 = loopIdx2 >= 0 ? barisKe(SRC_BUDGET, loopIdx2) : -1;
const GUARD_TXT = guardM ? guardM[0] : '';
const LOOP_TXT = loopM ? loopM[0] : '';

/* C1 — bukti statis: batas loop MENJANGKAU elemen terakhir, penjaga TERJANGKAU. */
{
  // batas loop i < clone.length  =>  i_maks = clone.length - 1  =>  i BISA = clone.length - 1.
  const iMaksOlehBatas = 'clone.length - 1';
  const syaratPenjaga = 'clone.length - 1';
  const terjangkau = iMaksOlehBatas === syaratPenjaga;
  lulus(
    'C1-penjaga-statis',
    guardIdx >= 0 && loopIdx2 >= 0 && terjangkau,
    `contextBudget.ts:${barisLoop2} batas loop '${LOOP_TXT.replace(' {', '')}' -> i_maks = ${iMaksOlehBatas}; ` +
      `penjaga baris ${barisGuard} mensyaratkan i = ${syaratPenjaga} -> TERJANGKAU (${iMaksOlehBatas} == ${syaratPenjaga}); penjaga DAPAT dieksekusi`,
  );
}

/* Kontrol dengan eksekusi nyata: suntik penghitung ke penjaga pada SALINAN
 * scratch dari fungsi yang dikirim (bukan src). */
function ekstrakFungsi(teksBundle, namaFungsi) {
  const mulai = teksBundle.indexOf(`function ${namaFungsi}(`);
  if (mulai < 0) throw new Error(`fungsi ${namaFungsi} tidak ada di bundel`);
  let i = teksBundle.indexOf('{', mulai);
  let depth = 0;
  for (; i < teksBundle.length; i++) {
    if (teksBundle[i] === '{') depth += 1;
    else if (teksBundle[i] === '}') {
      depth -= 1;
      if (depth === 0) return teksBundle.slice(mulai, i + 1);
    }
  }
  throw new Error('kurung tidak seimbang');
}
const BUNDLE_TXT = readFileSync(BUNDLE, 'utf8');
const FUNGSI_RINGKAS = ekstrakFungsi(BUNDLE_TXT, 'ringkasUkuran');
function buatRingkas(instrumen) {
  let src = FUNGSI_RINGKAS;
  // tambahkan penghitung di dalam badan penjaga (bukan sekadar `continue;`)
  const guardBundle = 'if (i === clone.length - 1) continue;';
  if (!src.includes(guardBundle)) throw new Error('penjaga tidak ada di bundel fungsi');
  src = src.replace(guardBundle, `if (i === clone.length - 1) { globalThis.__penjagaNyala = (globalThis.__penjagaNyala || 0) + 1; continue; }`);
  const fn = new Function('ukuranPayload', 'PAYLOAD_MAX_CHARS', `return (${src});`)(M.ukuranPayload, M.PAYLOAD_MAX_CHARS);
  return fn;
}
/* Kode yang diuji adalah kode SEKARANG; tidak ada lagi salinan batas loop. */
const ringkasSekarang = buatRingkas(true);

// masukan jahat: pesan terakhir adalah TOOL dengan isi > STUB, payload jauh > cap.
function masukanEkorTool() {
  const arr = [{ role: 'system', content: 'S'.repeat(2000) }];
  arr.push({ role: 'user', content: 'U'.repeat(400) });
  for (let i = 0; i < 4; i++) {
    arr.push({ role: 'assistant', content: 'A'.repeat(9000), toolCalls: [{ name: 'read_file' }] });
    arr.push({ role: 'tool', name: 'read_file', content: `TB-${i}\n` + 'T'.repeat(9000) });
  }
  arr.push({ role: 'assistant', content: '', toolCalls: [{ name: 'read_file' }] });
  arr.push({ role: 'tool', name: 'read_file', content: 'EKOR-TOOL\n' + 'Z'.repeat(9000) });
  return arr;
}

/* C2 — kontrol dengan kode SEKARANG: penjaga SUNGGUH dieksekusi. */
{
  globalThis.__penjagaNyala = 0;
  const masuk = masukanEkorTool();
  const keluar = ringkasSekarang(masuk, 4000);
  const nyala = globalThis.__penjagaNyala;
  lulus(
    'C2-penjaga-hidup',
    nyala >= 1,
    `kode SEKARANG (batas i < clone.length) atas masukan yang ekornya pesan tool panjang: penjaga menyala ${nyala} kali ` +
      `(harus >=1 = HIDUP); payload ${angka(M.ukuranPayload(masuk))}->${angka(M.ukuranPayload(keluar))} char`,
  );
  if (nyala === 0) temuanCatat('C2-penjaga-mati', `penjaga baris ${barisGuard} tetap TIDAK dieksekusi pada kode sekarang (batas i < clone.length): kontrol negatif lama sudah tidak berlaku.`);
}

/* C3 — batas: walau penjaga hidup, trim-terakhir tetap memendekkan pesan terakhir. */
{
  globalThis.__penjagaNyala = 0;
  const masuk = masukanEkorTool();
  const sebelum = String(masuk.at(-1).content);
  const keluar = ringkasSekarang(masuk, 4000);
  const nyala = globalThis.__penjagaNyala;
  const ekorSetelah = String(keluar.filter((m) => m.role !== 'system').at(-1)?.content ?? '');
  const ekorUtuh = ekorSetelah === sebelum;
  lulus(
    'C3-penjaga-terjang-tapi-trim',
    nyala >= 1,
    `penjaga menyala ${nyala} kali (>=1) pada kode sekarang; catatan: walau penjaga menyala, trim-terakhir (contextBudget.ts:288-300) ` +
      `tetap memendekkan pesan terakhir (${angka(sebelum.length)}→${angka(ekorSetelah.length)} char, utuh=${ekorUtuh}) -> menambal penjaga SAJA tidak cukup`,
  );
}

/* ============================================================================
 * BAGIAN D — TIGA SITUS PESAN PEMULIHAN ARGUMEN-CACAT
 * ==========================================================================*/
function ekstrakEkspresi(src, penanda) {
  const m = src.indexOf(penanda);
  if (m < 0) return null;
  const kw = Math.max(src.lastIndexOf('content:', m), src.lastIndexOf('result:', m));
  const mulai = kw >= 0 ? kw : m;
  // akhir: baris pertama setelah penanda yang (setelah spasi) mulai dengan '}' atau '}'.
  const sisa = src.slice(m);
  const re = /\n[ \t]*[}\])]/;
  const mm = re.exec(sisa);
  const akhir = mm ? m + mm.index : m + 600;
  return { teks: src.slice(mulai, akhir), baris: barisKe(src, mulai) };
}
const SRC_OPENAI_RUST = baca('src-tauri/src/adapters/openai.rs');
/* openai.rs kini mencetak cuplikan raw_args di kalimat malformed (patch #5);
 * karena itu apa pun yang meneruskan res.error ke model MEMBAWA potongan itu. */
const RUST_MALFORMED_CUPLIK = /returned malformed JSON arguments:\s*\{\}/.test(SRC_OPENAI_RUST);
const SITUS = [
  { id: 'D1-situs-entri-langkah', nama: 'entri langkah (ID) - set() agentSteps', penanda: 'Panggilan tool terakhir ber-JSON argumen rusak dan tidak dijalankan' },
  { id: 'D2-situs-pesan-lanjutan', nama: 'pesan lanjutan (ID) - history.push user', penanda: 'Panggilan tool terakhirmu punya JSON argumen yang tidak valid' },
  { id: 'D3-situs-koreksi-EN', nama: 'koreksiArgumenTool (EN) - aiStore.ts:6046', penanda: 'The previous response had invalid tool-call arguments' },
];
const rincianSitus = [];
let situsLengkap = 0;
for (const s of SITUS) {
  const ek = ekstrakEkspresi(SRC_STORE, s.penanda);
  if (!ek) {
    lulus(s.id, false, `penanda TIDAK DITEMUKAN: ${JSON.stringify(s.penanda)}`);
    rincianSitus.push({ id: s.id, ditemukan: false });
    continue;
  }
  const menyebutNama = /\bres\.error\b/.test(ek.teks);
  const adaPotonganLangsung = /\b(raw_args|argumenMentah|cuplik\w*|potonganArgumen)\b/i.test(ek.teks) || /\$\{[^}]*\b(args|argumen|cuplik)\b[^}]*\}/i.test(ek.teks);
  const adaPotongan = adaPotonganLangsung || (menyebutNama && RUST_MALFORMED_CUPLIK);
  const lengkap = menyebutNama && adaPotongan;
  if (lengkap) situsLengkap += 1;
  lulus(
    s.id,
    lengkap,
    `${s.nama} (aiStore.ts:${ek.baris}): menyebut NAMA tool (res.error)=${menyebutNama}, memuat POTONGAN argumen salah=${adaPotongan} ` +
      `-> ${lengkap ? 'LENGKAP' : 'TIDAK LENGKAP (harus nama + potongan)'}`,
  );
  rincianSitus.push({ id: s.id, baris: ek.baris, menyebutNama, adaPotongan, teks: ek.teks.replace(/\s+/g, ' ').slice(0, 220) });
}

/* D4 — cakupan: tiga situs diuji terpisah. */
{
  const ditemukan = rincianSitus.filter((r) => r.ditemukan !== false).length;
  lulus(
    'D4-cakupan-situs',
    ditemukan === 3,
    `${SITUS.length} situs diuji TERPISAH (ditemukan ${ditemukan}/3); situs yang memuat nama+potongan=${situsLengkap}/3; ` +
      `butuh nama+potongan: ${SITUS.map((s) => s.id).join(', ')}`,
  );
  if (situsLengkap < 3) {
    const tanpaNama = rincianSitus.filter((r) => r.menyebutNama === false).map((r) => r.id);
    const tanpaPotongan = rincianSitus.filter((r) => r.adaPotongan === false).map((r) => r.id);
    temuanCatat(
      'D4-argumen-cacat',
      `hanya ${situsLengkap}/3 situs pemulihan memuat NAMA tool + POTONGAN argumen salah. Tanpa nama tool: ${tanpaNama.join(', ') || 'tidak ada'}; ` +
        `tanpa potongan argumen: ${tanpaPotongan.join(', ') || 'tidak ada'}. ` +
        `CATATAN KOREKSI HARNESS: scripts/uji-malformed-args.mjs:381 (M17) memakai jendela lebar SRC_STORE.slice(i-200, i+900) yang ` +
        `untuk situs D2/D3 menjangkau baris THROW res.error di bawahnya (aiStore.ts:6256) dan situs lain -> melaporkan 'menyertakan res.error' ` +
        `pada 3/3 situs. Jendela sempit per-situs di sini menunjukkan res.error hanya di situs entri-langkah (1/3). Ini cacat HARNESS, bukan bukti produk.`,
    );
  }
}

/* D5 — dari sisi SUMBER: apakah potongan argumen salah bahkan tersedia? */
{
  const SRC_OPENAI = baca('src-tauri/src/adapters/openai.rs');
  /*
   * Cari Err(format!( ITU SENDIRI lewat pola lengkap. Versi lama mencari
   * indexOf('returned malformed JSON arguments') yang PERTAMA - dan itu ada di
   * KOMENTAR dokumen di openai.rs (baris ~474), bukan di kode; lastIndexOf
   * 'Err(format!(' lalu menemukan galat OBJEK di atasnya. Akibatnya D5 membaca
   * konstruksi yang salah dan bisu terhadap perubahan apa pun pada galat
   * malformed. [cacat HARNESS, diperbaiki di sini]
   */
  const mErr = /Err\(format!\(\s*"tool call \\"\{name\}\\" returned malformed JSON arguments/.exec(SRC_OPENAI);
  const pos = mErr ? mErr.index : -1;
  const awal = pos;
  const akhir = awal >= 0 ? SRC_OPENAI.indexOf('))', awal) + 2 : -1;
  const potongErr = awal >= 0 && akhir > awal ? SRC_OPENAI.slice(awal, akhir) : '';
  const sebutNamaTool = /\{name\}/.test(potongErr);
  const argKedua = /"\s*,\s*[^)\s]/.test(potongErr); // ada argumen ke-2 -> potongan ikut dicetak
  const sebutRaw = /\{\s*raw\b|\{\s*cuplik|\{\s*potongan|\{\s*snippet/i.test(potongErr) || argKedua;
  lulus(
    'D5-sumber-potongan-rust',
    sebutRaw,
    `openai.rs:604 parse_argumen_tool → galat malformed (openai.rs:633-635) 'tool call "{name}" returned malformed JSON arguments': ` +
      `menyebut NAMA tool=${sebutNamaTool}, argumen ke-2 (potongan raw) dicetak=${argKedua} -> ` +
      `${sebutRaw ? 'potongan tersedia' : 'res.error yang sampai ke aiStore TIDAK PERNAH memuat potongan argumen yang salah'}`,
  );
  if (!sebutRaw)
    temuanCatat(
      'D5-rust-buang-potongan',
      `raw_args dibaca di openai.rs:238 dan dipakai di :247 (parse_argumen_tool), tetapi galat malformed (openai.rs:633-635) TIDAK menginterpolasi raw ` +
        `-> potongan argumen yang salah HILANG di Rust, jadi TIDAK ADA dari tiga situs JS yang bisa menampilkannya. Ini akar teknis dari "galat tidak menyebut potongan argumen salah".`,
    );
}

/* D6 — berapa situs yang menyebut NAMA tool ke model. */
{
  const sebut = rincianSitus.filter((r) => r.menyebutNama === true).length;
  lulus(
    'D6-nama-tool',
    sebut === 3,
    `situs yang menyebut NAMA tool ke model=${sebut}/3 (lewat res.error)`,
  );
  if (sebut < 3)
    temuanCatat(
      'D6-nama-hilang',
      `${3 - sebut}/3 situs koreksi TIDAK menyebut nama tool: jalur pesan-lanjutan (aiStore.ts:6249) dan jalur EN koreksiArgumenTool (aiStore.ts:6046). ` +
        `Agar model tahu panggilan mana yang gagal, keduanya perlu ${'`res.error`'}.`,
    );
}

/* ============================================================================
 * BAGIAN E — LAJU PERCOBAAN ULANG PROVIDER (<= 70 / 60 dtk)
 * ==========================================================================*/
const delaysLadder = (() => {
  const m = /const AGENT_PROVIDER_RETRY_DELAYS = \[([\d,\s]+)\]/.exec(SRC_STORE);
  if (!m) throw new Error('AGENT_PROVIDER_RETRY_DELAYS tidak ditemukan');
  return m[1].split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
})();
const delaysPulih = (() => {
  const m = /const TUNGGU_PULIH_DELAYS = \[([\d,\s]+)\]/.exec(SRC_STORE);
  if (!m) throw new Error('TUNGGU_PULIH_DELAYS tidak ditemukan');
  return m[1].split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
})();
const retryLimitFormula = /isTruncatedToolResponseError\(res\.error \?\? ''\) \? 2 : 1/.test(SRC_STORE)
  ? 'retryableToolResponse ? (truncated ? 2 : 1) : AGENT_PROVIDER_RETRY_DELAYS.length'
  : 'TIDAK TERBACA';
/* Pacer jalur argumen-cacat (keputusan E2). Baca DARI KODE, bukan dari asumsi:
   nilai konstanta DAN bukti pemakaian di jalur retry wajib keduanya ada. */
const jedaMalformedMs = (() => {
  const nilai = /JEDA_ULANG_ARGUMEN_CACAT_MS\s*=\s*([\d_]+)/.exec(SRC_STORE);
  const dipakai = /tungguRetryAgent\(\s*retryableToolResponse\s*\?\s*JEDA_ULANG_ARGUMEN_CACAT_MS/.test(SRC_STORE);
  if (!nilai || !dipakai) return 0; // belum ada pacer = jeda 0 ms
  return Number(nilai[1].replace(/_/g, ''));
})();
const retryLimitMalformed = 1; // malformed (non-truncated): retryableToolResponse=true, truncated=false
const retryLimitTruncated = 2;
const retryLimitProvider = delaysLadder.length;

/* E1 — jalur galat PROVIDER (429/5xx): jadwal percobaan nyata dari konstanta. */
function jadwalProviderPerGiliran(durasiMs) {
  // satu giliran: attempt, lalu ladder 2 cepat, lalu fase tunggu-pulih, lalu fallback -> giliran baru.
  const t = [];
  let now = 0;
  const attemptsSatuGiliran = 1 + retryLimitProvider + delaysPulih.length;
  const jedaI = [...delaysLadder, ...delaysPulih];
  while (now <= durasiMs) {
    t.push(now);
    for (const j of jedaI) {
      if (now > durasiMs) break;
      now += j;
      t.push(now);
    }
    now += 1; // fallback -> giliran baru
  }
  return { times: t.filter((x) => x <= durasiMs), attemptsSatuGiliran, jedaTotalPerGiliran: jedaI.reduce((a, b) => a + b, 0) + 3.5 };
}
function puncakDalamJendela(times, jendelaMs) {
  let puncak = 0;
  for (const t of times) {
    const n = times.filter((x) => x >= t && x < t + jendelaMs).length;
    if (n > puncak) puncak = n;
  }
  return puncak;
}
{
  const jadwal = jadwalProviderPerGiliran(600_000);
  const puncak = puncakDalamJendela(jadwal.times, 60_000);
  lulus(
    'E1-laju-ladder',
    puncak <= 70,
    `jalur galat provider (ladder ${delaysLadder.join('+')} ms + tunggu-pulih ${delaysPulih.join('+')} ms): ` +
      `${jadwal.attemptsSatuGiliran} percobaan/giliran, jeda ${angka(jadwal.jedaTotalPerGiliran)} ms/giliran; ` +
      `puncak percobaan dalam jendela 60 dtk=${puncak} (batas 70) -> ${puncak <= 70 ? 'AMAN' : 'MELEWATI'}`,
  );
}

/* E2 — jalur argumen-cacat: jeda pacer + RTTI tiap percobaan, laju/60 dtk. */
{
  const perGiliranMalformed = 1 + retryLimitMalformed;
  const rttBatas = Math.ceil(60_000 / 70); // RTT+ jeda minimum agar <= 70/60 dtk
  const rttAcuanKode = delaysLadder[0]; // jeda "cepat" versi kode sendiri (pengganti RTT)
  // tiap percobaan menunggu pacer + respons provider (RTT). laju = 60.000/(RTT+pacer).
  const siklus = rttAcuanKode + jedaMalformedMs;
  const lajuPadaAcuan = Math.round(60_000 / siklus);
  const pakaiPacer = jedaMalformedMs > 0;
  lulus(
    'E2-laju-malformed',
    // keputusan E2: pacer WAJIB ada, dan laju tetap <= 70/60 dtk
    pakaiPacer && lajuPadaAcuan <= 70,
    `jalur argumen-cacat: ${perGiliranMalformed} percobaan/giliran (retryLimit=${retryLimitMalformed} untuk malformed, ${retryLimitTruncated} untuk terpotong), ` +
      `pacer=${jedaMalformedMs} ms (${pakaiPacer ? 'ADA' : 'TIDAK ADA'}, terbaca dari kode); ` +
      `laju = 60.000/(RTT+pacer): pada RTT=${rttAcuanKode} ms -> siklus ${siklus} ms -> ${lajuPadaAcuan} percobaan/60 dtk ` +
      `(batas 70 -> ${lajuPadaAcuan <= 70 ? 'AMAN' : 'MELEWATI'}; butuh RTT+pacer >= ${rttBatas} ms), ` +
      `${perGiliranMalformed} percobaan/giliran = jeda total ${jedaMalformedMs * retryLimitMalformed} ms`,
  );
  if (!pakaiPacer) {
    temuanCatat(
      'E2-tanpa-jeda',
      `jalur argumen-cacat mengulang SEKETIKA (pacer=${jedaMalformedMs} ms terbaca dari kode); ` +
        `tidak ada pacer di app. Selama RTT provider >= ${rttBatas} ms laju tetap <= 70/60 dtk. ` +
        `Ini 'perlu keputusan': tambahkan jeda kecil/pacer atau biarkan mengandalkan RTT provider.`,
    );
  }
}
temuanCatat(
  'E-rumus',
  `retryLimit dibaca dari sumber='${retryLimitFormula}'; AGENT_PROVIDER_RETRY_DELAYS=[${delaysLadder.join(', ')}]; TUNGGU_PULIH_DELAYS=[${delaysPulih.join(', ')}]`,
);

/* ============================================================================
 * BAGIAN F — DETERMINISME
 * ==========================================================================*/
{
  const ringkas = () =>
    JSON.stringify({
      sistem: SISTEM_NORM_CHAR,
      cap: CAP_PESAN,
      reserve: RESERVE_TOOL,
      spec: UKURAN_SPEC,
      giliran: perGiliran.map((g) => [g.giliran, g.ukuranPesan, g.totalKabel, g.ekorSama]),
      situs: rincianSitus.map((r) => [r.id, r.menyebutNama, r.adaPotongan]),
    });
  const d1 = createHash('sha256').update(ringkas()).digest('hex');
  const d2 = createHash('sha256').update(ringkas()).digest('hex');
  lulus(
    'F1-determinisme',
    d1 === d2,
    `digest jalan 1 = jalan 2 = ${d1.slice(0, 16)}… (atas prompt ternormalkan ${angka(SISTEM_NORM_CHAR)} char); tanpa jaringan, tanpa app, tanpa CDP`,
  );
  DIGEST = d1.slice(0, 16);
}

/* --------------------------------------------------------------- ringkas --- */
const laporan = {
  giliran: GILIRAN,
  payloadMax: M.PAYLOAD_MAX_CHARS,
  reserveTool: RESERVE_TOOL,
  capPesan: CAP_PESAN,
  sistemChar: SISTEM_CHAR,
  specTool: UKURAN_SPEC,
  langsung: {
    puncakPesan,
    puncakKabel,
    minKabel,
    pelanggaranKabel: pelanggaranKabel.length,
    ekorBerubah: gTurunEkor.length,
    ekorTanpaCatatan: gTurunEkor.filter((g) => !g.ekorAdaCatatan).length,
    puncakAppend: Math.max(...perGiliran.map((g) => g.deltaAppend)),
  },
  situs: rincianSitus,
  delays: { ladder: delaysLadder, pulih: delaysPulih, retryLimitMalformed, retryLimitTruncated, retryLimitProvider },
  lulus: hasil.filter((h) => h.startsWith('LULUS')).length,
  gagal,
  temuan: temuan.length,
  digest: DIGEST,
  kasus: hasil,
  temuanCatat: temuan,
  durasiMs: Date.now() - T0,
};

console.log('=== UJI ANGGARAN PESAN — payload giliran vs PAYLOAD_MAX_CHARS & pesan terakhir ===');
console.log(`kode asli dibundel dari src/lib/*.ts (esbuild); teks dibaca dari src/lib/contextBudget.ts + src/lib/aiStore.ts`);
console.log(
  `PAYLOAD_MAX_CHARS=${angka(M.PAYLOAD_MAX_CHARS)}; reserveTools=${angka(RESERVE_TOOL)} (spec ${angka(UKURAN_SPEC)} + 2048); ` +
    `capUntukPesan=${angka(CAP_PESAN)}; systemPromptFor=${angka(SISTEM_CHAR)}; blok tetap=${angka(SISTEM_CHAR + RESERVE_TOOL)}`,
);
console.log('');
for (const baris of hasil) console.log(baris);
if (temuan.length) {
  console.log('');
  for (const baris of temuan) console.log(baris);
}
console.log('');
console.log(`RINGKASAN: LULUS=${laporan.lulus} GAGAL=${gagal} TEMUAN=${temuan.length} (${laporan.durasiMs} ms)`);
console.log(
  `PUNCAK KABEL : payload pesan+tools puncak=${angka(puncakKabel)} char vs PAYLOAD_MAX_CHARS=${angka(M.PAYLOAD_MAX_CHARS)} ` +
    `(lewat batas di ${pelanggaranKabel.length}/${GILIRAN} giliran); pesan-saja puncak=${angka(puncakPesan)} char vs cap=${angka(CAP_PESAN)}`,
);
console.log(
  `EKOR         : pesan terakhir berubah di ${gTurunEkor.length}/${GILIRAN} giliran; tanpa catatan pemotongan=${gTurunEkor.filter((g) => !g.ekorAdaCatatan).length}`,
);
if (BERKAS_JSON) {
  writeFileSync(BERKAS_JSON, JSON.stringify(laporan, null, 2), 'utf8');
  console.log(`json: ${BERKAS_JSON}`);
}
console.log(`DIGEST       : ${DIGEST} (sha256-16 atas {sistem-norm, cap, reserve, spec, giliran, situs})`);
process.exit(gagal > 0 ? 1 : 0);
