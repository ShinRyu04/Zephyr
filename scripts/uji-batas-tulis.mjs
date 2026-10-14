/*
 * Uji batas tulis: aturan prompt vs perilaku TERLARANG yang sebenarnya.
 *
 * ## Kenapa harness ini ada
 *
 * Temuan Khalid 2026-10-13 (item `ai-tahu-100-6`): aturan prompt menjanjikan
 * lebih daripada yang diizinkan backend. Blok fakta bilang "path absolut tetap
 * jalan", padahal dengan `allowWrite` NYALA dan path ABSOLUT pun, tool
 * `write_file` gagal `ok:false` - "path outside the workspace: D:/Zephyr/..."
 * - karena `state.workspace === null`. Akibatnya terlihat pada run nyata: AI
 * Zephyr sampai mengoreksi dirinya sendiri di depan user.
 *
 * Dua sisi yang harus cocok, dan keduanya diperiksa di sini:
 *   (A) yang DIKATAKAN: prompt (ID + EN) menyebut batas itu apa adanya, dan
 *       kalimat lama yang salah sudah HILANG;
 *   (B) yang DIKERJAKAN: penolakan sungguhan dari Rust diterjemahkan jadi pesan
 *       yang bisa ditindaklanjuti (`galatToolUntukModel` di agentTools.ts),
 *       dengan KODE galat aslinya tetap utuh, dan tulisan di dalam workspace
 *       tetap berhasil (tidak ada regresi).
 *
 * Bagian statis (S) membaca berkas sebagai teks; bagian live (L) memakai app
 * yang hidup lewat `__ZEPHYR_TOOLS__.jalankan` dan `__ZEPHYR_PROMPT__.system`.
 */
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Cdp, reporter, keluarBersih, tungguBridge } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';
const r = reporter('batas-tulis');

/** Berkas uji di LUAR repo (di dalam repo = bukan kasus yang diuji). */
const LUAR = process.env.UJI_BATAS_TULIS_LUAR ?? 'C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/uji-batas-tulis-tolak.txt';
/** Berkas uji di DALAM repo (kasus yang HARUS tetap berhasil). */
const DALAM = join(akar, '.uji-batas-tulis-dalam.txt');

/* ───────────────────── bagian statis (tanpa app) ───────────────────────── */

const prompt = readFileSync(join(akar, 'src/lib/systemPrompt.ts'), 'utf8');
const agentTeks = readFileSync(join(akar, 'src/lib/agentTools.ts'), 'utf8');

/*
 * Bukti statis sengaja memeriksa FRASA, bukan mem-parsing struktur: kamus prompt
 * tidak diekspor (harness tak punya jalur impor yang sah), dan yang perlu
 * dibuktikan di sini cuma dua hal - kalimat lama yang menyesatkan hilang, dan
 * kalimat penggantinya ada di KEDUA bahasa. Bukti bahwa kalimat itu benar-benar
 * sampai ke model diambil dari prompt LIVE (L5).
 */
const idFrasa = [
  'MEMBACA berkas yang disebut user lewat path absolut',
  'jadi tool tulis dan perintah shell ditolak (WorkspaceOutside)',
  'jangan bilang berkas sudah ditulis kalau ternyata tidak',
];
const enFrasa = [
  'READING files the user names by absolute path all work without one',
  'file writes and shell commands are refused (WorkspaceOutside)',
  'do not claim a file was written when it was not',
];
const idHilang = idFrasa.filter((k) => !prompt.includes(k));
const enHilang = enFrasa.filter((k) => !prompt.includes(k));

r.check(
  'S2',
  idHilang.length === 0 && enHilang.length === 0,
  idHilang.length || enHilang.length
    ? `frasa batas-tulis hilang - ID ${JSON.stringify(idHilang)} · EN ${JSON.stringify(enHilang)}`
    : 'systemPrompt.ts memuat ketiga frasa batas-tulis di ID (MEMBACA jalan / tulis ditolak WorkspaceOutside / jangan mengaku sudah menulis) DAN padanannya di EN',
);

const klaimSalah = [
  'path absolut dari user selain itu tidak masalah',
  'absolute paths the user hands you are fine',
  'mengerjakan berkas yang disebut user lewat path absolut semuanya jalan tanpa workspace',
  'working with files the user names by absolute path all work without one',
];
const ketemuSalah = klaimSalah.filter((k) => prompt.includes(k));

r.check(
  'S1',
  ketemuSalah.length === 0,
  ketemuSalah.length
    ? `klaim lama yang menyesatkan MASIH ADA: ${JSON.stringify(ketemuSalah)}`
    : 'tak satu pun kalimat lama yang menjanjikan tulisan lewat path absolut masih ada di systemPrompt.ts',
);

r.check(
  'S3',
  /export function galatToolUntukModel/.test(agentTeks) &&
    /try \{\s*\n\s*return await tool\.run\(args\);/.test(agentTeks) &&
    /err\.code === 'WorkspaceOutside'/.test(agentTeks) &&
    /baru\.code = err\.code/.test(agentTeks),
  'agentTools: satu tempat lintas-jalur (`jalankanAgentTool`) membungkus galat tool, menerjemahkan WorkspaceOutside, dan MEMPERTAHANKAN kode galatnya',
);

/* ───────────────────────── bagian live (app hidup) ─────────────────────── */

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title || 'Zephyr');
const tunda = (ms) => new Promise((s) => setTimeout(s, ms));

/*
 * RELOAD dulu. Tanpa ini harness membaca bundel yang sudah dimuat halaman -
 * pernah kejadian: pemeriksaan "frasa baru ada di prompt live" merah padahal
 * berkasnya sudah dibetulkan, karena yang diuji kode sebelum HMR.
 */
await tungguBridge(cdp, '__ZEPHYR_TOOLS__', 40000);
const TANDA = '__UJI_BATAS_TULIS_TANDA__';
try {
  await cdp.eval(`(() => { window.${TANDA} = 'halaman-lama'; return 1; })()`);
  await cdp.eval(`(() => { setTimeout(() => location.reload(), 30); return 1; })()`);
} catch {
  /* konteks hancur = reload benar-benar terjadi */
}
for (let i = 0; i < 80; i++) {
  await tunda(400);
  let ada = 'string';
  try {
    ada = await cdp.eval(`typeof window.${TANDA}`);
  } catch {
    ada = 'undefined';
  }
  if (ada === 'undefined') break;
}
await tungguBridge(cdp, '__ZEPHYR_TOOLS__', 60000);
await tungguBridge(cdp, '__ZEPHYR_PROMPT__', 60000);

/**
 * Panggil satu tool lewat JALUR AGEN (`jalankanAgen` = `jalankanAgentTool`),
 * bungkus hasil/lemparan menjadi {ok, teks, kode}.
 *
 * Sengaja bukan `jalankan` (yang memanggil `t.run` telanjang): yang mau
 * dibuktikan di sini adalah teks yang DILIHAT MODEL, dan terjemahan galatnya
 * hidup di `jalankanAgentTool`.
 */
const panggil = (nama, args) => `await (async () => {
  try {
    const t = await window.__ZEPHYR_TOOLS__.jalankanAgen(${JSON.stringify(nama)}, ${JSON.stringify(args)});
    return { ok: true, teks: typeof t === 'string' ? t : JSON.stringify(t), kode: null };
  } catch (e) {
    return { ok: false, teks: String(e && e.message ? e.message : e), kode: e && e.code ? String(e.code) : null };
  }
})()`;

const jalurAgen = await cdp.runAsync(`
  const alat = window.__ZEPHYR_TOOLS__;
  return { adaJalankanAgen: typeof alat.jalankanAgen === 'function', adaGalatTool: typeof alat.galatTool === 'function' };
`);
r.check(
  'L0a',
  jalurAgen.adaJalankanAgen && jalurAgen.adaGalatTool,
  `jalur agen tersedia di bridge hidup: jalankanAgen=${jalurAgen.adaJalankanAgen} · galatTool=${jalurAgen.adaGalatTool}`,
);

/* L1: keadaan ruang kerja saat uji (menentukan kalimat mana yang harus muncul). */
const ruang = await cdp.runAsync(`
  const keadaan = window.__ZEPHYR__.getState();
  return { workspace: keadaan.workspace ?? null };
`);
r.check('L0', true, `folder yang terbuka saat uji: ${ruang.workspace ?? '(tidak ada)'}`);

/* L2: tulisan di LUAR ruang kerja -> ditolak, dengan sebab + langkah. */
const tolak = await cdp.runAsync(`return ${panggil('write_file', { path: LUAR, content: 'harusnya tidak pernah tertulis' })};`);
const kalimatSebab = ruang.workspace ? 'folder yang terbuka' : 'tidak ada folder yang terbuka, dan tanpa folder memang tidak ada tempat menulis';
r.check(
  'L2',
  tolak.ok === false &&
    tolak.kode === 'WorkspaceOutside' &&
    tolak.teks.includes('tulisan ditolak') &&
    tolak.teks.includes(kalimatSebab) &&
    tolak.teks.includes('pesan asli: path outside the workspace') &&
    /jangan bilang berkas sudah ditulis/.test(tolak.teks) &&
    tolak.teks.includes(LUAR.replace(/\\/g, '/').split('/').slice(-1)[0]),
  `tolak luar-ruang-kerja → ok=${tolak.ok} kode=${tolak.kode} · "${tolak.teks.slice(0, 170)}..."`,
);

/* L3: penolakan itu benar-benar tidak menulis apa pun. */
r.check('L3', !existsSync(LUAR), `berkas di luar ruang kerja ${existsSync(LUAR) ? 'ADA (buruk)' : 'tidak ada (benar)'}: ${LUAR}`);

/* L4: terjemahan galat MENJAGA kode aslinya, dan berlalu apa adanya untuk galat
 *     lain (supaya tidak ada pesan yang tiba-tiba berubah bentuk). */
const terjemah = await cdp.runAsync(`
  const g1 = window.__ZEPHYR_TOOLS__.galatTool({ code: 'WorkspaceOutside', message: 'path outside the workspace: X:/a.txt' }, 'write_file');
  const g2 = window.__ZEPHYR_TOOLS__.galatTool({ code: 'NotFound', message: 'berkas tidak ada' }, 'read_file');
  const g3 = window.__ZEPHYR_TOOLS__.galatTool({ code: 'InvalidInput', message: 'Menjalankan perintah butuh workspace terbuka' }, 'bash_run');
  return { g1, g2, g3 };
`);
r.check(
  'L4',
  terjemah.g1.code === 'WorkspaceOutside' &&
    terjemah.g1.message.includes('tulisan ditolak') &&
    terjemah.g2.code === 'NotFound' &&
    terjemah.g2.message === 'ERROR: berkas tidak ada' &&
    terjemah.g3.code === 'InvalidInput' &&
    /tanpa folder terbuka/i.test(terjemah.g3.message),
  `kode dipertahankan: ${terjemah.g1.code}/${terjemah.g2.code}/${terjemah.g3.code} · galat lain apa adanya: "${terjemah.g2.message}" · shell: "${terjemah.g3.message.slice(0, 90)}..."`,
);

/*
 * L5: prompt yang BENAR-BENAR dirakit. Aturan prompt memakai bahasa dari
 * `settings.general.uiLang` (bukan parameter bahasa jawaban), jadi bahasa aktif
 * diambil dari state, LALU ditukar sebentar ke bahasa lain supaya KEDUA kamus
 * terbukti - ditukar balik di dalam blok yang sama, supaya tidak ada keadaan
 * yang tertinggal kalau harness mati di tengah.
 */
const p = await cdp.runAsync(`
  const asal = window.__ZEPHYR_SET__.setting('general.uiLang') || 'en';
  const ambil = () => window.__ZEPHYR_PROMPT__.system('follow', '', '');
  const lain = asal === 'id' ? 'en' : 'id';
  const aktif = ambil();
  let lainTeks = '';
  try {
    await window.__ZEPHYR_SET__.set({ general: { ...window.__ZEPHYR_SET__.state().settings.general, uiLang: lain } });
    lainTeks = ambil();
  } finally {
    await window.__ZEPHYR_SET__.set({ general: { ...window.__ZEPHYR_SET__.state().settings.general, uiLang: asal } });
  }
  return { asal, lain, aktif, lainTeks, sesudah: window.__ZEPHYR_SET__.setting('general.uiLang') || 'en' };
`);

/** Frasa batas-tulis per bahasa di prompt yang dirakit. */
const frasa = {
  id: /tidak ada tempat menulis/,
  en: /nowhere to write/,
};
const frasaAbsolut = {
  id: /path absolut tidak bisa menembus/,
  en: /absolute path does not get you past that guard/,
};
const l5a =
  frasa[p.asal].test(p.aktif) &&
  frasaAbsolut[p.asal].test(p.aktif) &&
  !klaimSalah.some((k) => p.aktif.includes(k));
const l5b =
  frasa[p.lain].test(p.lainTeks) &&
  frasaAbsolut[p.lain].test(p.lainTeks) &&
  !klaimSalah.some((k) => p.lainTeks.includes(k));
r.check('L5a', l5a, `prompt bahasa aktif (${p.asal}, ${p.aktif.length} char): batas tulis + "path absolut tidak menembus", tanpa klaim lama`);
r.check('L5b', l5b, `prompt bahasa lain (${p.lain}, ${p.lainTeks.length} char) diperiksa dengan cara yang sama - kedua kamus terbukti, bukan cuma yang aktif`);
r.check('L5c', p.sesudah === p.asal, `bahasa UI dikembalikan: ${p.asal} → ${p.lain} → ${p.sesudah}`);

/* L6: jalur shell memakai kalimat yang sama ketika tak ada folder. */
const shell = await cdp.runAsync(`
  const alat = window.__ZEPHYR_TOOLS__;
  return { adaBash: alat.nama().includes('bash_run') };
`);
r.check(
  'L6',
  shell.adaBash,
  'tool shell (`bash_run`) terdaftar, jadi penolakan shell lewat jalur yang sama dengan `galatToolUntukModel` (kodenya InvalidInput) - pesan tanpa-folder Rust "butuh workspace terbuka" ikut diterjemahkan',
);

/* L7: jalur yang SAH tidak ikut mati. Folder dibuka dulu (kalau belum), lalu
 *     tulis → baca ulang → hapus di dalamnya. Dijalankan PALING AKHIR karena
 *     membuka folder mengubah keadaan app, dan keadaannya DIKEMBALIKAN lagi
 *     sesudah uji (kalau tadi memang tidak ada folder terbuka). */
const AKAR_NATIVE = akar.split('/').join(String.fromCharCode(92));
let dibukaSendiri = false;
if (!ruang.workspace) {
  try {
    await cdp.eval(
      `(() => { setTimeout(() => window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(AKAR_NATIVE)}), 30); return 1; })()`,
    );
    dibukaSendiri = true;
  } catch {
    /* konteks bisa hancur kalau app memuat ulang saat folder dibuka */
  }
  for (let i = 0; i < 60; i++) {
    await tunda(500);
    try {
      await tungguBridge(cdp, '__ZEPHYR_TOOLS__', 8000);
      const ws = await cdp.eval(`window.__ZEPHYR__.getState().workspace ?? null`);
      if (ws) break;
    } catch {
      /* halaman sedang berganti */
    }
  }
}
const wsKini = await cdp.runAsync(`return { workspace: window.__ZEPHYR__.getState().workspace ?? null };`);
if (wsKini.workspace) {
  const isi = `uji batas tulis ${Date.now()}`;
  const DALAM_URL = DALAM.replace(/\\/g, '/');
  const tulis = await cdp.runAsync(`return ${panggil('write_file', { path: DALAM_URL, content: isi })};`);
  const adaDalam = existsSync(DALAM);
  const isiDalam = adaDalam ? readFileSync(DALAM, 'utf8') : '';
  const hapus = await cdp.runAsync(`return ${panggil('delete_file', { path: DALAM_URL })};`);
  if (existsSync(DALAM)) unlinkSync(DALAM);
  r.check(
    'L7',
    tulis.ok && tulis.teks.startsWith('Ditulis:') && isiDalam === isi && hapus.ok && !existsSync(DALAM),
    `dalam folder terbuka (${wsKini.workspace}): tulis ok=${tulis.ok} isi cocok=${isiDalam === isi} hapus ok=${hapus.ok} sisa=${existsSync(DALAM)}`,
  );
} else {
  r.check('L7', false, `${dalamKabar} - workspace masih kosong sesudah openWorkspace, jalur sah belum terbukti`);
}

/* L8: keadaannya dikembalikan seperti semula, supaya harness ini tidak
 *     meninggalkan folder terbuka yang bukan urusannya. */
if (dibukaSendiri) {
  try {
    await cdp.eval(`(() => { window.__ZEPHYR__.getState().closeWorkspace(); return 1; })()`);
  } catch {
    /* abaikan: yang penting dicatat, bukan gagal */
  }
  await tunda(1500);
  const akhir = await cdp.runAsync(`return { workspace: window.__ZEPHYR__.getState().workspace ?? null };`);
  r.check('L8', akhir.workspace === null, `folder dikembalikan ke keadaan awal: ${akhir.workspace ?? '(tidak ada folder)'}`);
}

const ringkas = r.selesai();
await cdp.close();
keluarBersih(ringkas.lulus === ringkas.total ? 0 : 1);
