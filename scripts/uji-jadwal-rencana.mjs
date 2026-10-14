/*
 * uji-jadwal-rencana — harness bukti untuk item ZEPH-JADWAL-COMMAND.
 *
 *   node scripts/uji-jadwal-rencana.mjs
 *
 * Node-only, tanpa aplikasi hidup. Tiga lapis bukti, dipisah supaya tidak
 * tercampur dan tidak saling menutupi:
 *
 *   A. MODEL RUJUKAN (JS) — cermin aturan `CronJob::status()` /
 *      `lapor_terlewat()` di `src-tauri/src/cron.rs`. Aturan Rust tidak bisa
 *      dijalankan dari Node, jadi perilakunya dicerminkan di sini dan diuji;
 *      Rust sendiri sudah punya uji setara di `cron.rs` (modul `tests`,
 *      dijalankan `cargo test --lib`). Yang dijaga harness ini adalah hal yang
 *      berbeda: aturan di sisi TypeScript/usulan (validasi waktu lampau,
 *      periksa daftar jadwal, batas MAX_JOBS) yang belum punya rumah.
 *
 *   B. INVARIAN SUMBER NYATA — berkas produk dibaca sebagai TEKS dan diperiksa:
 *      bidang sekali-jalan ada, `#[serde(default)]` ada (kalau hilang,
 *      `cron.json` lama gagal di-parse dan daftar jadwal pengguna hilang
 *      senyap), penolakan perintah kosong ada, dll. Ini memeriksa kode asli,
 *      bukan salinan.
 *
 *   C. PENJAGA PERINTAH BERBAHAYA — memakai fungsi NYATA dari
 *      `src/lib/agentGuard.ts` (`periksaPerintahShell`), di-bundle esbuild.
 *      Jadi aturan "perintah berbahaya" di sini adalah aturan produk, bukan
 *      regex yang saya tulis ulang.
 *
 * INFO (tidak dihitung): titik sambung yang belum ada di sisi TS, mis.
 * `cron-missed` dipancarkan Rust tapi tidak ada pendengarnya di `src/lib`.
 */
import { build } from 'esbuild';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8');

const dir = mkdtempSync(join(tmpdir(), 'jadwal-'));
async function muat(rel, nama) {
  const out = join(dir, nama);
  await build({
    entryPoints: [join(AKAR, rel)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile: out,
    logLevel: 'silent',
  });
  return import('file:///' + out.replace(/\\/g, '/') + '?v=' + Date.now());
}

let lulus = 0;
let total = 0;
const cek = (nama, syarat, bukti) => {
  total++;
  if (syarat) {
    lulus++;
    console.log(`  OK    ${nama}${bukti !== undefined ? '  [' + bukti + ']' : ''}`);
  } else {
    console.log(`  GAGAL ${nama}  [${bukti}]`);
  }
};

/* ---------------- sumber nyata + fungsi nyata ---------------- */

const CRON = baca('src-tauri/src/cron.rs');
const CMD = baca('src/lib/commands.ts');
const BUILTINS = baca('src/lib/zephyrTools/builtins.ts');
const CRONRUNNER = baca('src/lib/cronRunner.ts');
const G = await muat('src/lib/agentGuard.ts', 'agentGuard.mjs');
const { periksaPerintahShell } = G;

/* Konstanta diambil dari sumber nyata, bukan ditulis ulang di sini. */
const maxJobs = Number((CRON.match(/pub const MAX_JOBS:\s*usize\s*=\s*(\d+)/) || [])[1]);

/* ---------------- A. model rujukan (cermin cron.rs) ---------------- */

const Belum = 'Belum';
const Siap = 'Siap';
const Terlewat = 'Terlewat';
const Selesai = 'Selesai';

/** Cermin `CronJob::jatuh_tempo()` untuk cabang interval (every_minutes). */
function jatuhTempoInterval(j) {
  if (!j.enabled) return null;
  if (j.every_minutes > 0) return (j.last_run ?? 0) + j.every_minutes * 60;
  return null;
}

/** Cermin `CronJob::status(sekarang, sesi_mulai)` di cron.rs:120-141. */
function statusJob(j, sekarang, sesiMulai) {
  if (!j.enabled) return Belum;
  const target = j.sekali_at;
  if (target === null || target === undefined) {
    const t = jatuhTempoInterval(j);
    return t !== null && t <= sekarang ? Siap : Belum;
  }
  if (j.selesai) return Selesai;
  if (target > sekarang) return Belum;
  if (target < sesiMulai) return Terlewat;
  return Siap;
}

/** Cermin `lapor_terlewat()` — idempoten: kunci laporan adalah `terlewat`. */
function laporTerlewat(daftar, sekarang, sesiMulai) {
  const dilapor = [];
  for (const j of daftar) {
    if (statusJob(j, sekarang, sesiMulai) === Terlewat && j.terlewat == null) {
      j.terlewat = j.sekali_at; // ditulis ke cron.json oleh pemanggil
      dilapor.push(j);
    }
  }
  return dilapor;
}

/** Cermin `tandai_jalan()`: job sekali-jalan ditandai `selesai` sekali saja. */
function tandaiJalan(daftar, id, sekarang) {
  const j = daftar.find((x) => x.id === id);
  if (!j) return;
  j.last_run = sekarang;
  if (j.sekali_at != null) {
    j.selesai = true;
    j.terlewat = null;
  }
}

/**
 * Validasi pembuatan jadwal. Memperluas `validasi_jadwal()` cron.rs:191-223
 * dengan satu aturan yang memang diminta item ini: **waktu di masa lampau
 * ditolak saat dibuat** (dulu `sekali_at` lampau diterima lalu langsung
 * berubah jadi "terlewat" — jadwal yang lahir sudah mati).
 */
function validasiJadwal(everyMinutes, atHour, sekaliAt, sekarang) {
  const galat = [];
  if (sekaliAt !== null && sekaliAt !== undefined) {
    if (!Number.isInteger(sekaliAt)) galat.push('sekali_at bukan bilangan bulat');
    if (everyMinutes > 0 || (atHour !== null && atHour !== undefined)) {
      galat.push('sekali_at tidak boleh digabung dengan every_minutes/at_hour');
    }
    if (Number.isInteger(sekaliAt) && sekaliAt <= 0) galat.push('sekali_at harus > 0');
    if (Number.isInteger(sekaliAt) && sekaliAt > 0 && sekaliAt < sekarang) {
      galat.push('sekali_at di masa lampau');
    }
    return galat;
  }
  if (everyMinutes > 0) return galat;
  if (atHour !== null && atHour !== undefined) {
    if (!Number.isInteger(atHour) || atHour < 0 || atHour > 23) galat.push('at_hour harus 0-23');
    return galat;
  }
  galat.push('tidak ada jadwal: isi sekali_at ATAU every_minutes ATAU at_hour');
  return galat;
}

/**
 * Periksa daftar jadwal SEBELUM ditampilkan/dijalankan. Aturan yang diminta:
 * perintah berbahaya tidak boleh ada di daftar terjadwal TANPA penanda yang
 * eksplisit (mis. `penanda === 'beda-dari-bash_run'`). Memakai penjaga NYATA
 * dari agentGuard.
 */
function periksaDaftarJadwal(daftar) {
  const pelanggar = [];
  for (const j of daftar) {
    const cmd = String(j.command ?? '');
    if (cmd.trim().length === 0) {
      pelanggar.push({ id: j.id, sebab: 'perintah kosong' });
      continue;
    }
    const hasil = periksaPerintahShell(cmd);
    if (!hasil.ok && j.penanda !== 'bahaya-disetujui') {
      pelanggar.push({ id: j.id, sebab: 'berbahaya tanpa penanda' });
    }
  }
  return pelanggar;
}

const job = (ubah = {}) => ({
  id: 'j1',
  name: 'uji',
  command: 'echo hai',
  every_minutes: 0,
  at_hour: null,
  enabled: true,
  last_run: null,
  sekali_at: null,
  selesai: false,
  terlewat: null,
  ...ubah,
});

const SEKARANG = 1_000_000;
const SESI = 900_000;

/* ---------------- 1-8: penolakan saat dibuat ---------------- */

console.log('\n# Validasi pembuatan jadwal (model rujukan)');

cek(
  'jadwal tanpa perintah ditolak',
  periksaDaftarJadwal([job({ command: '   ' })]).length === 1 &&
    periksaDaftarJadwal([job({ command: '   ' })])[0].sebab === 'perintah kosong',
  'perintah kosong -> pelanggar'
);

cek(
  'jadwal tanpa waktu (tak ada once/every/at) ditolak',
  validasiJadwal(0, null, null, SEKARANG).length === 1,
  validasiJadwal(0, null, null, SEKARANG)[0]
);

cek(
  'sekali_at di masa lampau ditolak saat dibuat',
  validasiJadwal(0, null, SEKARANG - 60, SEKARANG).length > 0,
  validasiJadwal(0, null, SEKARANG - 60, SEKARANG)[0]
);

cek(
  'sekali_at = 0 ditolak',
  validasiJadwal(0, null, 0, SEKARANG).length > 0,
  validasiJadwal(0, null, 0, SEKARANG)[0]
);

cek(
  "sekali_at bukan bilangan bulat ('abc'/NaN) ditolak",
  validasiJadwal(0, null, 'abc', SEKARANG).length > 0 &&
    validasiJadwal(0, null, 1.5, SEKARANG).length > 0,
  'abc & 1.5 ditolak'
);

cek(
  'sekali_at + every_minutes ditolak (saling meniadakan)',
  validasiJadwal(5, null, SEKARANG + 60, SEKARANG).length > 0,
  validasiJadwal(5, null, SEKARANG + 60, SEKARANG)[0]
);

cek(
  'sekali_at + at_hour ditolak (saling meniadakan)',
  validasiJadwal(0, 3, SEKARANG + 60, SEKARANG).length > 0,
  validasiJadwal(0, 3, SEKARANG + 60, SEKARANG)[0]
);

cek(
  'at_hour 24 ditolak, 23 diterima',
  validasiJadwal(0, 24, null, SEKARANG).length > 0 &&
    validasiJadwal(0, 23, null, SEKARANG).length === 0,
  '24 ditolak / 23 lolos'
);

/* ---------------- 9-14: aturan sekali-jalan & terlewat ---------------- */

console.log('\n# Sekali-jalan, terlewat, selesai (cermin cron.rs)');

cek(
  'jadwal terlewat dipulihkan SEKALI saja (tidak dobel)',
  (() => {
    const d = [job({ sekali_at: SESI - 1, terlewat: null })];
    const pertama = laporTerlewat(d, SEKARANG, SESI);
    const kedua = laporTerlewat(d, SEKARANG, SESI);
    return pertama.length === 1 && kedua.length === 0 && d[0].terlewat === SESI - 1;
  })(),
  'lapor pertama 1, kedua 0, jejak tersimpan'
);

cek(
  'jadwal yang sudah selesai tidak diulang (status Selesai walau target == sekarang)',
  (() => {
    const j = job({ sekali_at: SEKARANG, selesai: true });
    return statusJob(j, SEKARANG, SESI) === Selesai;
  })(),
  'Selesai'
);

cek(
  'sekali-jalan tidak pernah jalan dua kali (due kosong 3x setelah ditandai)',
  (() => {
    const d = [job({ sekali_at: SEKARANG, selesai: false })];
    const due1 = d.filter((j) => statusJob(j, SEKARANG, SESI) === Siap);
    tandaiJalan(d, 'j1', SEKARANG);
    let kosong = true;
    for (let i = 0; i < 3; i++) {
      if (d.filter((j) => statusJob(j, SEKARANG, SESI) === Siap).length !== 0) kosong = false;
    }
    return due1.length === 1 && kosong && d[0].selesai === true;
  })(),
  'due#1 = 1, lalu 0/0/0'
);

cek(
  'target == sesi_mulai -> Siap (batas; timer sesi ini yang menunggu)',
  statusJob(job({ sekali_at: SESI }), SEKARANG, SESI) === Siap,
  'Siap'
);

cek(
  'target = sesi_mulai-1 -> Terlewat (batas; aplikasi mati saat waktunya tiba)',
  statusJob(job({ sekali_at: SESI - 1 }), SEKARANG, SESI) === Terlewat,
  'Terlewat'
);

cek(
  'terlewat bukan berarti selesai -> masih bisa dijalankan manual',
  (() => {
    const j = job({ sekali_at: SESI - 1, terlewat: SESI - 1 });
    return statusJob(j, SEKARANG, SESI) === Terlewat && j.selesai === false;
  })(),
  'Terlewat & selesai=false'
);

cek(
  'jadwal nonaktif tidak pernah jatuh tempo (termasuk sekali-jalan yang waktunya tiba)',
  statusJob(job({ sekali_at: SEKARANG, enabled: false }), SEKARANG, SESI) === Belum &&
    statusJob(job({ every_minutes: 1, enabled: false }), SEKARANG, SESI) === Belum,
  'Belum / Belum'
);

cek(
  'jadwal berulang: last_run lama jatuh tempo, last_run baru belum',
  (() => {
    const lama = job({ every_minutes: 10, last_run: SEKARANG - 3600 });
    const baru = job({ every_minutes: 60, last_run: SEKARANG });
    return (
      statusJob(lama, SEKARANG, SESI) === Siap && statusJob(baru, SEKARANG, SESI) === Belum
    );
  })(),
  'Siap / Belum'
);

/* ---------------- 15-16: daftar & batas ---------------- */

console.log('\n# Daftar jadwal & batas jumlah');

cek(
  'daftar memuat perintah berbahaya TANPA penanda -> ditandai pelanggar',
  (() => {
    const p = periksaDaftarJadwal([job({ command: 'rm -rf /' })]);
    return p.length === 1 && p[0].sebab === 'berbahaya tanpa penanda';
  })(),
  'rm -rf / -> pelanggar (memakai periksaPerintahShell NYATA)'
);

cek(
  'daftar dengan penanda eksplisit -> tidak dipelanggar (tidak over-block)',
  (() => {
    const p1 = periksaDaftarJadwal([job({ command: 'rm -rf /', penanda: 'bahaya-disetujui' })]);
    const p2 = periksaDaftarJadwal([job({ command: 'echo hai' })]);
    return p1.length === 0 && p2.length === 0;
  })(),
  'penanda: 0 pelanggar; perintah biasa: 0 pelanggar'
);

cek(
  'batas MAX_JOBS ditegakkan (angka dibaca dari cron.rs)',
  maxJobs === 50 && CRON.includes('daftar.len() >= MAX_JOBS'),
  `MAX_JOBS=${maxJobs}`
);

/* ---------------- B. invarian sumber nyata ---------------- */

console.log('\n# Invarian sumber nyata (src-tauri/src/cron.rs)');

cek(
  'tiga bidang sekali-jalan ada di CronJob',
  ['sekali_at: Option<u64>', 'selesai: bool', 'terlewat: Option<u64>'].every((s) =>
    CRON.includes(s)
  ),
  'sekali_at / selesai / terlewat'
);

cek(
  'ketiga bidang ber-serde(default) (cron.json lama tidak hilang senyap)',
  (CRON.match(/#\[serde\(default\)\]/g) || []).length >= 3,
  `${(CRON.match(/#\[serde\(default\)\]/g) || []).length} penanda #[serde(default)]`
);

cek(
  'perintah kosong ditolak di Rust (bukan hanya di TS)',
  CRON.includes('empty command') && CRON.includes('cmd.is_empty()'),
  'InvalidInput: empty command'
);

cek(
  'pemulihan dijalankan SEBELUM timer berkala hidup',
  CRON.includes('pulihkan_jadwal_terlewat(&app)') &&
    CRON.indexOf('pulihkan_jadwal_terlewat(&app)') < CRON.indexOf('std::thread::spawn'),
  'urutan: pulihkan -> spawn'
);

cek(
  'job terlewat TIDAK dijalankan terlambat (dilaporkan lewat lapor_terlewat)',
  CRON.includes('pub fn lapor_terlewat') &&
    CRON.includes('StatusJadwal::Terlewat') &&
    CRON.includes('jadwal sekali-jalan') ,
  'lapor_terlewat + StatusJadwal::Terlewat'
);

cek(
  'cron.rs tetap punya uji perilaku untuk aturan ini',
  CRON.includes('sekali_jalan_tidak_pernah_jalan_dua_kali') &&
    CRON.includes('jadwal_terlewat_dilaporkan_bukan_dijalankan_terlambat'),
  'dua uji Rust'
);

/* ---------------- INFO: titik sambung yang belum ada ---------------- */

console.log('\n# INFO (tidak dihitung): titik sambung sisi TS');

const cronCreateOpts = (CMD.match(/cronCreate = \(opts: \{[\s\S]*?\}\)/) || [''])[0];
const punyaSekaliDiTs = cronCreateOpts.includes('sekaliAt');
const cronJobTs = (CMD.match(/export interface CronJob \{[\s\S]*?\}/) || [''])[0];
const punyaTerlewatDiTs = cronJobTs.includes('terlewat');
const adaPendengarMissed = CRONRUNNER.includes("'cron-missed'");

console.log(
  `  INFO  commands.ts:cronCreate ${punyaSekaliDiTs ? 'SUDAH' : 'BELUM'} menerima sekaliAt ` +
    '(Rust sudah punya `sekali_at`)'
);
console.log(
  `  INFO  commands.ts:CronJob ${punyaTerlewatDiTs ? 'SUDAH' : 'BELUM'} memuat terlewat/selesai ` +
    '(Rust mengembalikannya di cron_list)'
);
console.log(
  `  INFO  cronRunner.ts ${adaPendengarMissed ? 'SUDAH' : 'BELUM'} mendengarkan 'cron-missed' ` +
    '(Rust memancarkannya di pulihkan_jadwal_terlewat)'
);
console.log(
  '  INFO  builtins.ts:schedule_command memakai pemetaan delaySeconds->everyMinutes ' +
    `(${BUILTINS.includes('delaySeconds') ? 'masih' : 'sudah tidak'})`
);

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
