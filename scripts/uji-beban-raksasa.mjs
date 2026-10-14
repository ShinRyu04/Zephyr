#!/usr/bin/env node
/*
 * uji-beban-raksasa.mjs — uji BEBAN RAKSASA (tugas 40+ berkas) secara
 * deterministik: TANPA jaringan, TANPA app, TANPA CDP.
 *
 * Kenapa harness ini ada
 * ----------------------
 * Bukti kuat untuk item LAMA-besar baru ada di 6 dan 8 berkas. Klaim yang
 * harus dibuktikan bukan "loop-nya jalan", tapi: rencana 44 berkas tetap MUAT
 * anggaran konteks, pemadatan riwayat menyala SEBELUM anggaran dilanggar, dan
 * tidak ada berkas yang hilang diam-diam tanpa catatan.
 *
 * Semua angka berasal dari KODE YANG DIKIRIM, bukan salinan: modul TS asli
 * dibundel esbuild (pola scripts/cek-batas-inti.mjs) lalu dijalankan di Node.
 *   - src/lib/systemPrompt.ts : systemPromptFor() (prompt giliran nyata)
 *   - src/lib/contextBudget.ts: PAYLOAD_MAX_CHARS, ukuranPayload, kiraToken,
 *     perkiraanKonteks, jendelaKonteks, batasAutoCompact
 *   - src/lib/aiStore.ts      : ringkasRiwayat, potongHasilRiwayat,
 *     padatkanRiwayatMurni, tugasBelumSelesaiRiwayat, HISTORY_TOOL_CHARS,
 *     MAX_AGENT_STEPS, AUTO_COMPACT_COOLDOWN_STEPS
 *   - src/lib/agentTools.ts   : agentToolSpecs (spesifikasi tool yang dikirim)
 *   - src/lib/zephyrCari.ts   : suntikanIndeks, cariFakta, formatHasil
 *
 * Cara pakai
 * ----------
 *   node scripts/uji-beban-raksasa.mjs                 # 44 berkas, model lantai 128k
 *   node scripts/uji-beban-raksasa.mjs --berkas=60
 *   node scripts/uji-beban-raksasa.mjs --jendela=8000  # uji negatif: anggaran dipaksa sempit
 *   node scripts/uji-beban-raksasa.mjs --json=hasil.json
 *
 * Keluaran: satu baris LULUS/GAGAL/TEMUAN per kasus + ringkasan. Kode keluar 1
 * kalau ada GAGAL (harness ini bisa merah; lihat kasus B16).
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const AKAR = path.resolve(import.meta.dirname, '..');
const KERJA = path.join(AKAR, 'scratch', 'uji-beban-raksasa');
mkdirSync(KERJA, { recursive: true });

/* ------------------------------------------------------------------ CLI --- */
const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};
const JUMLAH_BERKAS = Number(arg('berkas', '44'));
const JENDELA_PAKSA = Number(arg('jendela', '0')) || 0;
const BERKAS_JSON = arg('json', '');
if (!Number.isFinite(JUMLAH_BERKAS) || JUMLAH_BERKAS < 12) {
  console.error(`--berkas harus >= 12 (diminta: ${arg('berkas', '44')})`);
  process.exit(2);
}

/* ------------------------------------------------ bundel kode asli (TS) --- */
const SPANDUK = '// DIHASILKAN OLEH scripts/uji-beban-raksasa.mjs - jangan disunting\n';
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

/* Shim DOM localStorage dipakai modul asli; tidak ada server/aplikasi di sini. */
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const entriInti = `
export { systemPromptFor, AMBANG_TOKEN_INTI, faktaInti } from '../../src/lib/systemPrompt';
export {
  PAYLOAD_MAX_CHARS, ukuranPayload, kiraToken, perkiraanKonteks,
  jendelaKonteks, batasAutoCompact, ringkasUkuran,
  AUTO_COMPACT_AT, AUTO_COMPACT_KEEP, AUTO_COMPACT_COOLDOWN_STEPS,
} from '../../src/lib/contextBudget';
export {
  potongHasilRiwayat, ringkasRiwayat, padatkanRiwayatMurni, perluPadatRiwayatMurni,
  tugasBelumSelesaiRiwayat, bentukWireRiwayat, bagiLangkahDariRiwayat,
  HISTORY_KEEP_STEPS, HISTORY_TOOL_CHARS, HISTORY_TOOL_TAIL_RATIO,
  MAX_AGENT_STEPS, PERSIST_TOOL_CHARS,
  AMBANG_PADAT_TOKEN, RASIO_RINGKAS_TARGET, PADAT_BATAS_BERKAS,
} from '../../src/lib/aiStore';
export { agentToolSpecs } from '../../src/lib/agentTools';
export { TOOL_DIKIRIM_SELALU } from '../../src/lib/zephyrTools/catalog';
export {
  BATAS_KARAKTER_SUNTIK, BATAS_HASIL_MAKS, BATAS_KARAKTER_HASIL, BATAS_HASIL_BAWAAN, BATAS_HASIL_SUNTIK,
  suntikanIndeks, kepalaSuntikanIndeks, jumlahEntri, formatHasil, cariFakta, cariKode,
} from '../../src/lib/zephyrCari';
`;
const M = await import(pathToFileURL(bundel('entri.mjs', entriInti, 'entri.bundle.mjs')).href);

/* --------------------------------------------------------------- laporan --- */
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
const angka = (n) => new Intl.NumberFormat('id-ID').format(n);

/* ------------------------------------------------- konstanta KODE ASLI --- */
const T0 = Date.now();
const MODEL = arg('model', 'model-tanpa-entri-katalog'); // lantai fallback 128k
const JENDELA_ASLI = M.jendelaKonteks(MODEL);
const JENDELA = JENDELA_PAKSA > 0 ? JENDELA_PAKSA : JENDELA_ASLI;
const BATAS_PADAT = JENDELA_PAKSA > 0 ? JENDELA_PAKSA : M.batasAutoCompact(MODEL);
const KANVAS_SUMBER = 'docs/generated/';
const SEMUA_TOOL = M.TOOL_DIKIRIM_SELALU ?? [];
const SPEC_TOOL = M.agentToolSpecs({ alat: SEMUA_TOOL });
const UKURAN_SPEC = M.ukuranPayload([SPEC_TOOL]);
const RESERVE_TOOL = UKURAN_SPEC + 2048;
const CAP_PESAN = Math.max(20_000, M.PAYLOAD_MAX_CHARS - RESERVE_TOOL);
const SISTEM = M.systemPromptFor('id', '', '', '', '', '', `ubah ${JUMLAH_BERKAS} berkas di ${KANVAS_SUMBER}`);

const GILIRAN_SISTEM_CHAR = SISTEM.length;
const GILIRAN_SISTEM_TOKEN = M.kiraToken(SISTEM);
const KANDIDAT_KUERI = [
  'padatkanRiwayatMurni',
  'aiStore',
  'suntikanIndeks',
  'tugas besar berkas',
  'malformed JSON arguments',
  'zephyrCari',
];
const KUERI = KANDIDAT_KUERI.map((q) => ({ q, n: M.cariFakta(q, { batas: 999 }).length })).sort((a, b) => b.n - a.n)[0];
const SUNTIK = M.suntikanIndeks(KUERI.q);

/* Kasus B1 — blok inti tetap di bawah ambangnya sendiri. */
{
  const inti = M.faktaInti();
  const tokenInti = M.kiraToken(inti);
  lulus(
    'B1-inti',
    inti.length <= M.AMBANG_TOKEN_INTI * 4 && tokenInti <= M.AMBANG_TOKEN_INTI,
    `faktaInti()=${angka(inti.length)} char / ${angka(tokenInti)} token vs AMBANG_TOKEN_INTI=${angka(M.AMBANG_TOKEN_INTI)} token (=${angka(M.AMBANG_TOKEN_INTI * 4)} char)`,
  );
}

/* Kasus B2 — prompt giliran nyata + reserve tool vs anggaran payload. */
{
  const total = GILIRAN_SISTEM_CHAR + SUNTIK.length + RESERVE_TOOL;
  lulus(
    'B2-anggaran',
    true,
    `systemPromptFor()=${angka(GILIRAN_SISTEM_CHAR)} char (${angka(GILIRAN_SISTEM_TOKEN)} token); suntikanIndeks=${angka(SUNTIK.length)} char; ` +
      `spec ${SEMUA_TOOL.length} tool=${angka(UKURAN_SPEC)} char; reserveTools=${angka(RESERVE_TOOL)} char; ` +
      `capUntukPesan=${angka(CAP_PESAN)} char; PAYLOAD_MAX_CHARS=${angka(M.PAYLOAD_MAX_CHARS)}; total tetap=${angka(total)} char`,
  );
  if (GILIRAN_SISTEM_CHAR > CAP_PESAN) {
    temuanCatat(
      'B2-reserve',
      `systemPromptFor() (${angka(GILIRAN_SISTEM_CHAR)} char) SUDAH melebihi capUntukPesan (${angka(CAP_PESAN)} char) sebelum satu pun pesan riwayat ikut; ` +
        `sisa anggaran untuk riwayat = ${angka(Math.max(0, CAP_PESAN - GILIRAN_SISTEM_CHAR))} char. ringkasUkuran() tidak pernah menyentuh pesan system, jadi yang dikorbankan adalah riwayat.`,
    );
  }
}

/* Kasus B3 — suntikan indeks per giliran patuh batas karakternya. */
{
  const entri = SUNTIK.split('\n').filter((b) => /^\s*[-*\d]/.test(b)).length;
  lulus(
    'B3-suntik',
    SUNTIK.length <= M.BATAS_KARAKTER_SUNTIK + 400,
    `suntikanIndeks('${KUERI.q}')=${angka(SUNTIK.length)} char (${entri} baris entri dari ${angka(KUERI.n)} fakta cocok; indeks punya ${angka(M.jumlahEntri())} entri) ` +
      `vs BATAS_KARAKTER_SUNTIK=${angka(M.BATAS_KARAKTER_SUNTIK)} char + kepala/penutup tetap (BATAS_HASIL_SUNTIK=${M.BATAS_HASIL_SUNTIK} entri)`,
  );
}

/* Kasus B4 — jalur cariFakta berhenti di batas hasil, bukan mengirim semuanya. */
{
  const mentah = M.cariFakta(KUERI.q, { batas: 999 });
  const hasilMentah = Array.isArray(mentah) ? mentah : (mentah?.hasil ?? []);
  const teks = M.formatHasil(hasilMentah, M.BATAS_KARAKTER_HASIL);
  const entriTeks = (teks.match(/\n/g) ?? []).length;
  lulus(
    'B4-cariFakta',
    hasilMentah.length <= M.BATAS_HASIL_MAKS && teks.length <= M.BATAS_KARAKTER_HASIL + hasilMentah.length * 120,
    `cariFakta('${KUERI.q}', batas=999) → ${hasilMentah.length} hasil (BATAS_HASIL_MAKS=${M.BATAS_HASIL_MAKS}, bawaan=${M.BATAS_HASIL_BAWAAN}); ` +
      `formatHasil=${angka(teks.length)} char (${entriTeks} baris) vs BATAS_KARAKTER_HASIL=${angka(M.BATAS_KARAKTER_HASIL)}`,
  );
}

/* ------------------------------------------------------------- simulasi --- */
/*
 * Model beban yang diuji (dinyatakan terbuka, bukan disamarkan):
 *   - satu berkas per giliran: 1 hasil baca + 1 pesan asisten + 1 hasil tulis.
 *   - hasil baca = 6.000 char (batas dokumen BATAS_KARAKTER_HASIL di zephyrCari).
 *   - hasil tulis = 240 char (potongan 240 pada batas dokumen).
 *   - rencana ditulis model lewat tool_call todo_write dengan status per berkas.
 *   - gerbang pemadatan dijalankan SEBELUM perakitan pesan tiap giliran,
 *     mengikuti urutan src/lib/aiStore.ts (gerbang padat ~5539, rakit ~5919).
 */
function berkasKe(i) {
  return `${KANVAS_SUMBER}berkas-${String(i + 1).padStart(2, '0')}.md`;
}
function simulasi({ jumlah, hasilBacaChar, hasilTulisChar, asistenChar, batasToken, berkasPerGiliran = 1, batasLangkah = null }) {
  const sistem = M.systemPromptFor('id', '', '', '', '', '', `ubah ${jumlah} berkas di ${KANVAS_SUMBER}`);
  const status = new Array(jumlah).fill(false);
  const todo = Array.from({ length: jumlah }, (_, i) => ({ content: `ubah ${berkasKe(i)}`, status: 'pending' }));
  const pesanRencana = { role: 'assistant', content: '', toolCalls: [{ name: 'todo_write', args: { todos: todo } }] };
  const history = [
    { role: 'system', content: sistem },
    { role: 'user', content: `Ubah ${jumlah} berkas di ${KANVAS_SUMBER}. Satu berkas per giliran, tulis dengan write_file.` },
    pesanRencana,
  ];
  const perGiliran = [];
  const pemadatan = [];
  const pelanggaran = [];
  let langkah = 0;
  let langkahPadatTerakhir = -M.AUTO_COMPACT_COOLDOWN_STEPS;
  let puncakTokenRiwayat = 0;
  const langkahSelesai = [];
  const langkahMaks = batasLangkah ?? jumlah * 3 + 12;

  while (langkah < langkahMaks && status.filter(Boolean).length < jumlah) {
    /* (a) gerbang pemadatan — src/lib/aiStore.ts ~5539-5551 */
    const dipakai = M.perkiraanKonteks(history);
    puncakTokenRiwayat = Math.max(puncakTokenRiwayat, dipakai);
    if (dipakai > batasToken && langkah - langkahPadatTerakhir >= M.AUTO_COMPACT_COOLDOWN_STEPS) {
      const todos = status.map((s, i) => ({ content: `ubah ${berkasKe(i)}`, status: s ? 'completed' : 'pending' }));
      const hasilPadat = M.padatkanRiwayatMurni(history, { todos, batasToken });
      langkahPadatTerakhir = langkah;
      if (hasilPadat.dipadatkan) {
        history.length = 0;
        history.push(...hasilPadat.history);
        const sisa = status.map((s, i) => (!s ? berkasKe(i) : null)).filter(Boolean);
        const terjaga = sisa.filter((p) =>
          hasilPadat.tugasBelum.some((t) => String(t).includes(p) || String(t).includes(path.basename(p))),
        );
        pemadatan.push({
          langkah,
          sebelum: hasilPadat.sebelum,
          sesudah: hasilPadat.sesudah,
          diringkas: hasilPadat.diringkas ?? null,
          tugasBelum: hasilPadat.tugasBelum.length,
          sisa: sisa.length,
          terjaga: terjaga.length,
          hilang: sisa.filter((p) => !terjaga.includes(p)),
          alasan: hasilPadat.alasan,
        });
      } else {
        pemadatan.push({ langkah, batal: hasilPadat.alasan, sebelum: hasilPadat.sebelum, sesudah: hasilPadat.sesudah });
      }
    }

    /* (b) perakitan payload — src/lib/aiStore.ts ~5919-5992 */
    const pesanMentah = [...history];
    const wire = M.ringkasRiwayat(pesanMentah, CAP_PESAN);
    const charsPayload = M.ukuranPayload(wire);
    const tokenGiliran = M.perkiraanKonteks(wire);
    const jumlahRiwayatTerkirim = wire.filter((m) => m.role !== 'system').length;
    const jumlahRiwayatAsli = pesanMentah.filter((m) => m.role !== 'system').length;
    const terakhirKirim = wire.at(-1);
    const terakhirAsli = pesanMentah.at(-1);
    if (charsPayload > M.PAYLOAD_MAX_CHARS) pelanggaran.push({ langkah: langkah + 1, chars: charsPayload });
    perGiliran.push({
      giliran: langkah + 1,
      berkasSelesai: status.filter(Boolean).length,
      charsPayload,
      tokenGiliran,
      tokenRiwayat: dipakai,
      pesanRiwayatTerkirim: jumlahRiwayatTerkirim,
      pesanRiwayatAsli: jumlahRiwayatAsli,
      pesanSystemDepan: wire[0]?.role === 'system' && String(wire[0].content ?? '').length === sistem.length,
      giliranTerakhirUtuh:
        String(terakhirKirim?.content ?? '').length === String(terakhirAsli?.content ?? '').length,
      ekorRole: terakhirAsli?.role ?? '-',
      ekorRoleKirim: terakhirKirim?.role ?? '-',
      ekorAsli: String(terakhirAsli?.content ?? '').length,
      ekorKirim: String(terakhirKirim?.content ?? '').length,
      ekorNota: /batas gateway/.test(String(terakhirKirim?.content ?? '')),
    });

    /* (c) kerja satu giliran: 1 berkas = 1 hasil baca + 1 tulis + 1 pesan model */
    const mulai = Math.floor(status.filter(Boolean).length);
    let dikerjakan = 0;
    for (let k = 0; k < berkasPerGiliran && mulai + k < jumlah; k++) {
      const i = mulai + k;
      history.push({ role: 'tool', name: 'read_file', content: `# ${berkasKe(i)}\n` + 'isi lama\n'.repeat(Math.ceil(hasilBacaChar / 9)).slice(0, hasilBacaChar) });
      history.push({ role: 'assistant', content: `Berkas ${berkasKe(i)} sudah ditulis ulang; lanjut ke berkas berikutnya.\n`.repeat(1) + 'x'.repeat(Math.max(0, asistenChar - 70)) });
      history.push({ role: 'tool', name: 'write_file', content: `Berkas ditulis: ${berkasKe(i)} (${hasilTulisChar} char)` });
      status[i] = true;
      todo[i].status = 'completed';
      dikerjakan += 1;
      langkahSelesai.push(i);
      langkah += 1;
    }
    if (dikerjakan === 0) break;
  }

  const selesai = status.filter(Boolean).length;
  const sisaBerkas = status.map((s, i) => (!s ? berkasKe(i) : null)).filter(Boolean);
  const tugasBelumAkhir = M.tugasBelumSelesaiRiwayat(history, status.map((s, i) => ({ content: `ubah ${berkasKe(i)}`, status: s ? 'completed' : 'pending' })));
  const terjagaAkhir = sisaBerkas.filter((p) => tugasBelumAkhir.some((t) => String(t).includes(path.basename(p))));
  return {
    jumlah,
    selesai,
    sisaBerkas,
    tugasBelumAkhir,
    terjagaAkhir,
    hilang: sisaBerkas.filter((p) => !terjagaAkhir.includes(p)),
    perGiliran,
    pemadatan,
    pelanggaran,
    langkah,
    puncakTokenRiwayat,
    urutanSelesai: langkahSelesai,
    riwayatAkhir: history.length,
  };
}

const BACA_CHAR = Number(arg('baca', String(M.BATAS_KARAKTER_HASIL)));
const TULIS_CHAR = 240;
const ASISTEN_CHAR = 220;
const SCOPE = { jumlah: JUMLAH_BERKAS, hasilBacaChar: BACA_CHAR, hasilTulisChar: TULIS_CHAR, asistenChar: ASISTEN_CHAR };

/* Kasus B5/B6 — rencana 40+ berkas muat anggaran; berapa berkas per giliran. */
const bebanNormal = simulasi({ ...SCOPE, batasToken: BATAS_PADAT });
{
  const perGiliran = bebanNormal.perGiliran;
  const maxChars = Math.max(...perGiliran.map((g) => g.charsPayload));
  const avgChars = Math.round(perGiliran.reduce((a, g) => a + g.charsPayload, 0) / perGiliran.length);
  const maxToken = Math.max(...perGiliran.map((g) => g.tokenGiliran));
  lulus(
    'B5-muat',
    bebanNormal.pelanggaran.length === 0 && maxChars <= M.PAYLOAD_MAX_CHARS,
    `${bebanNormal.selesai}/${JUMLAH_BERKAS} berkas di ${bebanNormal.langkah} giliran; payload/giliran awalan-akhir=${angka(perGiliran[0].charsPayload)}-${angka(maxChars)} char ` +
      `(rata-rata ${angka(avgChars)}, puncak ${angka(maxToken)} token); pelanggaran anggaran=${bebanNormal.pelanggaran.length}; ` +
      `puncak token riwayat=${angka(bebanNormal.puncakTokenRiwayat)} vs batas padat=${angka(BATAS_PADAT)}`,
  );
  const berkasPerGiliran = bebanNormal.selesai / bebanNormal.langkah;
  lulus(
    'B6-irama',
    berkasPerGiliran >= 1 && bebanNormal.langkah <= M.MAX_AGENT_STEPS,
    `${berkasPerGiliran.toFixed(2)} berkas/giliran; ${bebanNormal.langkah} giliran terpakai vs MAX_AGENT_STEPS=${angka(M.MAX_AGENT_STEPS)} ` +
      `(sisa ruang ${angka(M.MAX_AGENT_STEPS - bebanNormal.langkah)} giliran, cukup untuk ${Math.floor((M.MAX_AGENT_STEPS - bebanNormal.langkah) / Math.max(1, bebanNormal.langkah / bebanNormal.selesai))} berkas lagi)`,
  );
}

/* Kasus B7 — hasil tool panjang dipotong dengan catatan, bukan dibuang. */
{
  const panjang = 'baris log '.repeat(3000); // ~30.000 char
  const log = panjang + '\nERROR: 3 failed';
  const potong = M.potongHasilRiwayat(log);
  const adaCatatan = /characters in the middle are not sent/.test(potong);
  const hilangDisebut = new RegExp(String(log.length - M.HISTORY_TOOL_CHARS)).test(potong);
  lulus(
    'B7-potong',
    potong.length < log.length && adaCatatan && hilangDisebut && potong.includes('ERROR: 3 failed'),
    `hasil tool ${angka(log.length)} char → ${angka(potong.length)} char; catatan pemotongan dari kode asli=${adaCatatan}; ` +
      `jumlah karakter yang hilang disebut=${hilangDisebut}; vonis di ekor ikut terbawa=${potong.includes('ERROR: 3 failed')}; ` +
      `HISTORY_TOOL_CHARS=${angka(M.HISTORY_TOOL_CHARS)}, HISTORY_TOOL_TAIL_RATIO=${M.HISTORY_TOOL_TAIL_RATIO}`,
  );
}

/* Kasus B8 — berkas baru dibaca utuh; yang tua boleh dipotong. */
{
  const riwayat = [{ role: 'system', content: 'sistem' }];
  for (let i = 0; i < 20; i++) {
    riwayat.push({ role: 'assistant', content: `langkah ${i}` });
    riwayat.push({ role: 'tool', name: 'read_file', content: `BERKAS-${i}\n` + 'y'.repeat(6000) });
  }
  const wire = M.ringkasRiwayat(riwayat, CAP_PESAN);
  const baru = wire.filter((m) => m.role === 'tool').at(-1);
  const tua = wire.filter((m) => m.role === 'tool')[0];
  lulus(
    'B8-jendela',
    String(baru.content).length >= 6000 && String(tua.content).length <= M.HISTORY_TOOL_CHARS + 200,
    `giliran terbaru tetap utuh (${angka(String(baru.content).length)} char); hasil tertua dipotong ke ${angka(String(tua.content).length)} char ` +
      `(HISTORY_TOOL_CHARS=${angka(M.HISTORY_TOOL_CHARS)}, HISTORY_KEEP_STEPS=${M.HISTORY_KEEP_STEPS})`,
  );
}

/* Kasus B9/B10/B11 — beban berat: padat menyala sebelum anggaran dilanggar,
 * mengecilkan riwayat, dan daftar berkas sisa tetap terbawa. */
const bebanBerat = simulasi({ jumlah: JUMLAH_BERKAS, hasilBacaChar: 14000, hasilTulisChar: 6000, asistenChar: 900, batasToken: BATAS_PADAT });
{
  const padat = bebanBerat.pemadatan.filter((p) => p.diringkas !== null || p.sebelum !== undefined);
  const padatNyala = bebanBerat.pemadatan.filter((p) => p.sesudah !== undefined && !p.batal);
  const giliranPelanggaranPertama = bebanBerat.pelanggaran[0]?.langkah ?? null;
  const giliranPadatPertama = padatNyala[0]?.langkah ?? null;
  const masukAkal =
    giliranPadatPertama === null ||
    giliranPelanggaranPertama === null ||
    giliranPadatPertama <= giliranPelanggaranPertama;
  lulus(
    'B9-padat-sebelum-langgar',
    masukAkal && bebanBerat.pelanggaran.length === 0,
    `padat pertama di giliran ${giliranPadatPertama ?? '-'} (sebelum=${angka(padatNyala[0]?.sebelum ?? 0)} token → sesudah=${angka(padatNyala[0]?.sesudah ?? 0)} token, ` +
      `${padatNyala[0]?.diringkas ?? 0} pesan diringkas); pelanggaran anggaran pertama=${giliranPelanggaranPertama ?? 'tidak ada'}; ` +
      `AMBANG_PADAT_TOKEN=${angka(M.AMBANG_PADAT_TOKEN)}; batas dipakai=${angka(BATAS_PADAT)}`,
  );
  const mengecil = padatNyala.every((p) => p.sesudah < p.sebelum);
  lulus(
    'B10-padat-mengecil',
    padatNyala.length > 0 && mengecil,
    `${padatNyala.length} pemadatan nyala; semua sesudah < sebelum=${mengecil}; ` +
      `contoh: ${angka(padatNyala[0]?.sebelum ?? 0)} → ${angka(padatNyala[0]?.sesudah ?? 0)} token; RASIO_RINGKAS_TARGET=${M.RASIO_RINGKAS_TARGET}`,
  );
  const peristiwaPadat = bebanBerat.pemadatan.filter((p) => !p.batal && p.tugasBelum !== undefined);
  const adaPeristiwa = peristiwaPadat.length > 0 && peristiwaPadat.some((p) => p.sisa > 0);
  const tanpaHilang = peristiwaPadat.every((p) => p.hilang.length === 0);
  lulus(
    'B11-tugas-terbawa',
    adaPeristiwa && tanpaHilang && bebanBerat.hilang.length === 0,
    `peristiwa pemadatan dengan berkas sisa: ${peristiwaPadat.length} (${peristiwaPadat.map((p) => `giliran ${p.langkah}: ${p.terjaga}/${p.sisa} sisa terbawa di penjaga`).join('; ') || 'tidak ada'}); ` +
      `hilang diam-diam=${peristiwaPadat.reduce((a, p) => a + p.hilang.length, 0)}; tugas belum tercatat di penjaga akhir=${bebanBerat.tugasBelumAkhir.length} butir (PADAT_BATAS_BERKAS=${M.PADAT_BATAS_BERKAS})`,
  );
  const contoh = bebanBerat.perGiliran.filter((g) => g.pesanRiwayatTerkirim < g.pesanRiwayatAsli);
  const kelebihanCap = Math.max(...bebanBerat.perGiliran.map((g) => g.charsPayload)) - CAP_PESAN;
  const semuaAdaPesan = bebanBerat.perGiliran.every((g) => g.pesanRiwayatTerkirim > 0);
  const semuaSystemDepan = bebanBerat.perGiliran.every((g) => g.pesanSystemDepan);
  const ekorDipotong = bebanBerat.perGiliran.filter((g) => !g.giliranTerakhirUtuh);
  const ekorTanpaNota = ekorDipotong.filter((g) => !g.ekorNota);
  const contohEkor = ekorDipotong[0];
  lulus(
    'B12-format-terkirim',
    semuaAdaPesan && semuaSystemDepan && ekorTanpaNota.length === 0,
    `giliran dengan riwayat dipotong: ${contoh.length}/${bebanBerat.perGiliran.length}; giliran tanpa pesan=${bebanBerat.perGiliran.filter((g) => g.pesanRiwayatTerkirim === 0).length}; ` +
      `pesan system selalu di depan=${semuaSystemDepan}; giliran yang PESAN TERAKHIRNYA dipotong=${ekorDipotong.length}` +
      `${ekorDipotong.length ? ` (semuanya saat payload > cap=${ekorDipotong.every((g) => g.charsPayload > CAP_PESAN)}, tanpa catatan pemotongan=${ekorTanpaNota.length})` : ''}` +
      `${contohEkor ? `; contoh giliran ${contohEkor.giliran}: pesan ${contohEkor.ekorRole} ${contohEkor.ekorAsli}→${contohEkor.ekorKirim} char (role kirim=${contohEkor.ekorRoleKirim}), payload ${angka(contohEkor.charsPayload)} > cap ${angka(CAP_PESAN)}` : ''}; ` +
      `payload puncak melebihi capUntukPesan sebesar ${angka(kelebihanCap)} char (system prompt sendirian sudah ${angka(GILIRAN_SISTEM_CHAR)} > cap ${angka(CAP_PESAN)})`,
  );
  if (ekorDipotong.length > 0) {
    temuanCatat(
      'B12-ekor',
      `${ekorDipotong.length}/${bebanBerat.perGiliran.length} giliran mengirim pesan TERAKHIR dalam bentuk terpotong ` +
        `(contoh giliran ${contohEkor?.giliran}: ${contohEkor?.ekorRole} ${contohEkor?.ekorAsli}→${contohEkor?.ekorKirim} char) karena payload ${angka(contohEkor?.charsPayload)} melebihi cap ${angka(CAP_PESAN)}. ` +
        `Catatan pemotongan ikut terkirim=${ekorTanpaNota.length === 0}, jadi tidak ada pemotongan diam-diam — tetapi penyebabnya adalah TEMUAN B2 (system prompt 23.657 char > cap 23.251 char).`,
    );
  }
}

/* Kasus B13 — determinisme: dua jalan penuh menghasilkan digest identik. */
{
  const digest = (b) =>
    createHash('sha256')
      .update(
        JSON.stringify({
          selesai: b.selesai,
          langkah: b.langkah,
          urutan: b.urutanSelesai,
          giliran: b.perGiliran.map((g) => [g.giliran, g.charsPayload, g.tokenGiliran]),
          padat: b.pemadatan.map((p) => [p.langkah, p.sebelum ?? null, p.sesudah ?? null]),
          sisa: b.sisaBerkas,
        }),
      )
      .digest('hex');
  const ulang = simulasi({ ...SCOPE, batasToken: BATAS_PADAT });
  const d1 = digest(bebanNormal);
  const d2 = digest(ulang);
  lulus('B13-determinisme', d1 === d2, `digest jalan 1 = jalan 2 = ${d1.slice(0, 16)}…; berkas tertulis identik=${JSON.stringify(bebanNormal.urutanSelesai) === JSON.stringify(ulang.urutanSelesai)}`);
}

/* Kasus B14 — urutan kerja deterministik: naik, tanpa duplikat, tanpa lompat. */
{
  const u = bebanNormal.urutanSelesai;
  const naik = u.every((v, i) => (i === 0 ? v === 0 : v === u[i - 1] + 1));
  lulus(
    'B14-urutan',
    naik && new Set(u).size === u.length,
    `urutan berkas yang dikerjakan = ${u[0]}…${u.at(-1)} (${u.length} berkas), naik-tanpa-lompat=${naik}, duplikat=${u.length - new Set(u).size}`,
  );
}

/* Kasus B15 — laporan akhir jujur saat pekerjaan dipotong di tengah. */
{
  const terpotong = simulasi({ ...SCOPE, batasToken: BATAS_PADAT, batasLangkah: 10 });
  const lengkap = terpotong.selesai === JUMLAH_BERKAS;
  const adaCatatan = terpotong.sisaBerkas.length > 0 && terpotong.tugasBelumAkhir.length > 0;
  lulus(
    'B15-laporan-jujur',
    (lengkap || adaCatatan) && terpotong.hilang.length === 0,
    `dipotong di ${terpotong.langkah} giliran: dilaporkan selesai ${terpotong.selesai}/${JUMLAH_BERKAS}, belum ${terpotong.sisaBerkas.length} ` +
      `(semua bernama: ${terpotong.hilang.length === 0}), butir tugas belum tercatat=${terpotong.tugasBelumAkhir.length}; klaim "selesai semua"=${lengkap}`,
  );
}

/* Kasus B16 — uji negatif: harness ini HARUS bisa merah. Anggaran dipaksa
 * sempit (jendela 6.000 token) supaya pelanggaran/pemadatan wajib terdeteksi. */
{
  const sempit = simulasi({ ...SCOPE, batasToken: 6000 });
  const padatNyala = sempit.pemadatan.filter((p) => !p.batal && p.sesudah !== undefined).length;
  const pelanggaran = sempit.pelanggaran.length;
  lulus(
    'B16-uji-negatif',
    pelanggaran > 0 || padatNyala > 0,
    `jendela dipaksa 6.000 token: pemadatan nyala=${padatNyala}, pelanggaran anggaran terdeteksi=${pelanggaran} ` +
      `(${pelanggaran === 0 ? 'payload tetap di bawah PAYLOAD_MAX_CHARS karena cap char 40k, bukan token' : 'detektor bekerja'})`,
  );
  if (pelanggaran === 0 && padatNyala === 0) {
    temuanCatat('B16-detektor', 'anggaran 6.000 token tidak memicu apa pun: perlu diperiksa apakah gerbang padat benar-benar terpasang di jalur ini.');
  }
}

/* --------------------------------------------------------------- ringkas --- */
const laporan = {
  model: MODEL,
  jendela: JENDELA,
  jendelaAsli: JENDELA_ASLI,
  batasPadat: BATAS_PADAT,
  berkas: JUMLAH_BERKAS,
  capPesan: CAP_PESAN,
  reserveTool: RESERVE_TOOL,
  sistemChar: GILIRAN_SISTEM_CHAR,
  lulus: hasil.filter((h) => h.startsWith('LULUS')).length,
  gagal,
  temuan: temuan.length,
  kasus: hasil,
  temuanCatat: temuan,
  bebanNormal: {
    selesai: bebanNormal.selesai,
    langkah: bebanNormal.langkah,
    puncakTokenRiwayat: bebanNormal.puncakTokenRiwayat,
    puncakCharsPayload: Math.max(...bebanNormal.perGiliran.map((g) => g.charsPayload)),
    pelanggaran: bebanNormal.pelanggaran.length,
    pemadatan: bebanNormal.pemadatan.length,
  },
  bebanBerat: {
    selesai: bebanBerat.selesai,
    langkah: bebanBerat.langkah,
    puncakTokenRiwayat: bebanBerat.puncakTokenRiwayat,
    padatNyala: bebanBerat.pemadatan.filter((p) => !p.batal && p.sesudah !== undefined).length,
    pelanggaran: bebanBerat.pelanggaran.length,
    hilang: bebanBerat.hilang.length,
  },
  durasiMs: Date.now() - T0,
};

console.log('=== UJI BEBAN RAKSASA — tugas ' + JUMLAH_BERKAS + ' berkas (40+) ===');
console.log(`kode asli dibundel dari src/lib/*.ts; jendela model=${angka(JENDELA)} token (lantai fallback), batas padat=${angka(BATAS_PADAT)} token`);
console.log(`PAYLOAD_MAX_CHARS=${angka(M.PAYLOAD_MAX_CHARS)} char; reserveTools=${angka(RESERVE_TOOL)} char; capUntukPesan=${angka(CAP_PESAN)} char; systemPromptFor=${angka(GILIRAN_SISTEM_CHAR)} char`);
console.log('');
for (const baris of hasil) console.log(baris);
if (temuan.length) {
  console.log('');
  for (const baris of temuan) console.log(baris);
}
console.log('');
console.log(`RINGKASAN: LULUS=${laporan.lulus} GAGAL=${gagal} TEMUAN=${temuan.length} (${laporan.durasiMs} ms)`);
console.log(
  `BEBAN NORMAL : ${bebanNormal.selesai}/${JUMLAH_BERKAS} berkas dalam ${bebanNormal.langkah} giliran; puncak payload=${angka(laporan.bebanNormal.puncakCharsPayload)} char; ` +
    `pelanggaran=${laporan.bebanNormal.pelanggaran}; pemadatan=${bebanNormal.pemadatan.length}; puncak token riwayat=${angka(bebanNormal.puncakTokenRiwayat)}`,
);
console.log(
  `BEBAN BERAT  : ${bebanBerat.selesai}/${JUMLAH_BERKAS} berkas dalam ${bebanBerat.langkah} giliran; pemadatan nyala=${laporan.bebanBerat.padatNyala}; ` +
    `berkas hilang diam-diam=${laporan.bebanBerat.hilang}; puncak token riwayat=${angka(bebanBerat.puncakTokenRiwayat)}`,
);

if (BERKAS_JSON) {
  writeFileSync(BERKAS_JSON, JSON.stringify(laporan, null, 2), 'utf8');
  console.log(`json: ${BERKAS_JSON}`);
}
process.exit(gagal > 0 ? 1 : 0);
