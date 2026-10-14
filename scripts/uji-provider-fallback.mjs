#!/usr/bin/env node
/*
 * uji-provider-fallback.mjs — uji DETERMINISTIK lapisan ketahanan provider.
 *
 * Yang diuji adalah KODE ASLI repo: `src/lib/providerTahan.ts` (retry berjenjang
 * + backoff + fallback antar-model/provider + batas waktu per giliran + pesan
 * jujur + penyaring rahasia). Berkasnya .ts dan tidak bisa diimpor Node
 * langsung, jadi dibundel SAAT JALAN dengan esbuild lokal (offline) ke folder
 * sementara, lalu diimpor. Tidak ada berkas repo yang ditulis.
 *
 * SYARAT JALAN (sengaja ketat, supaya tidak ada klaim palsu):
 *   - TANPA jaringan. `fetch` tidak pernah dipanggil: modulnya menerima satu
 *     fungsi `panggil` yang disuntik, dan di sini fungsi itu PALSU (mengembalikan
 *     status HTTP pilihan skenario). Tidak ada server mock, tidak ada port.
 *   - TANPA model nyata, TANPA Tauri, TANPA app Zephyr menyala, TANPA CDP.
 *   - `tidur` disuntik palsu (mencatat jeda tanpa menunggu), kecuali pada uji
 *     batas waktu yang memang harus memakai jam nyata — di situ hanya timer
 *     lokal, bukan jaringan.
 *
 * Konteks cacat nyata yang melahirkan modul ini: HTTP 429 membunuh 2 dari 4 anak
 * delegasi (1439 s & 1455 s, 104 & 102 panggilan, mati di detik ~254 dan ~53)
 * tanpa retry, tanpa fallback, tanpa batas waktu giliran, dan tanpa satu pun
 * kalimat jujur ke user. Angka batasnya datang dari pesan provider sendiri dan
 * dipakai APA ADANYA di sini: jendela 60 detik, plafon 60 permintaan BERHASIL
 * dan 70 percobaan TOTAL per menit per kredensial; perilaku yang harus diganti
 * — "menyerah setelah 3 percobaan" (`<model> rate-limited every one of 3
 * attempts`) — diuji langsung di bagian (K).
 *
 * Keluar: 0 = semua hijau, 1 = ada yang merah, 2 = tidak bisa diukur (bundel gagal).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AKAR_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KELUARAN = path.join(os.tmpdir(), 'zephyr-uji-provider');

/* ───────────────────────── kerangka uji ───────────────────────── */

const hasil = [];
function check(id, ok, pesan, angka) {
  hasil.push({ id, ok: !!ok });
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(30)} ${pesan}`);
  if (angka) console.log(`         ${angka}`);
  return !!ok;
}

/* ─────────────────────── bundel kode ASLI repo ─────────────────────── */

let mod;
try {
  const requireRepo = createRequire(path.join(AKAR_REPO, 'package.json'));
  const { build } = requireRepo('esbuild');
  fs.mkdirSync(KELUARAN, { recursive: true });
  const keluar = path.join(KELUARAN, 'providerTahan.mjs');
  await build({
    absWorkingDir: AKAR_REPO,
    entryPoints: ['src/lib/providerTahan.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: keluar,
    logLevel: 'error',
  });
  mod = await import('file:///' + keluar.replace(/\\/g, '/'));
} catch (e) {
  console.log(`TIDAK BISA DIUKUR: bundel esbuild gagal — ${(e && e.message) || e}`);
  process.exit(2);
}

const {
  BAWAAN_PROVIDER_TAHAN,
  JENDELA_PROVIDER,
  buatJendela,
  jatahJendela,
  isiJendela,
  rapikanJendela,
  galatProvider,
  vonisStatus,
  vonisGalat,
  bacaSetelahHeader,
  jedaKe,
  saringRahasia,
  pesanGagal,
  pesanTunggu,
  panggilTahan,
} = mod;

console.log('uji-provider-fallback — deterministik: tanpa jaringan, tanpa model, tanpa CDP');
console.log(`repo: ${AKAR_REPO}`);
console.log(`modul asli: src/lib/providerTahan.ts (bundel sementara ${KELUARAN})`);

/* ─────────────────────── perkakas skenario ─────────────────────── */

/** Panggilan PALSU: menuruti daftar status; 'ok' = berhasil. Tidak ada jaringan. */
function buatPanggil(urut, { pesan } = {}) {
  const panggilan = [];
  let i = 0;
  const panggil = async (k, p) => {
    const langkah = urut[Math.min(i, urut.length - 1)];
    panggilan.push({ provider: k.provider, model: k.model, percobaan: p, n: i });
    i++;
    if (langkah === undefined || langkah === 'ok') return `jawaban-dari-${k.model}`;
    if (typeof langkah === 'function') throw langkah(k, p);
    throw galatProvider(langkah, pesan ? pesan(langkah) : `HTTP ${langkah} dari ${k.provider}`);
  };
  return { panggil, panggilan };
}

/** Panggilan yang TIDAK pernah menjawab — provider yang hidup tapi diam. */
function buatHang() {
  let n = 0;
  const panggil = () => {
    n++;
    return new Promise(() => {});
  };
  return { panggil, jumlah: () => n };
}

/** Tidur palsu: mencatat jeda tanpa benar-benar menunggu. */
function buatTidurPalsu() {
  const log = [];
  return { tidur: async (ms) => void log.push(ms), log };
}

const KAND = (n) => ({ provider: 'p' + n, model: 'm' + n });

/** Semua keluaran console selama `fn` — untuk membuktikan modulnya bisu. */
async function tanpaConsole(fn) {
  const ditangkap = [];
  const asli = {};
  for (const nama of ['log', 'info', 'warn', 'error', 'debug']) {
    asli[nama] = console[nama];
    console[nama] = (...a) => ditangkap.push(a.map(String).join(' '));
  }
  try {
    return { hasil: await fn(), ditangkap };
  } finally {
    for (const nama of Object.keys(asli)) console[nama] = asli[nama];
  }
}

/* ═══════════════ (A) klasifikasi: apa yang boleh diulang ═══════════════ */
console.log('\n(A) klasifikasi — 429/5xx diulang, 401/403 TIDAK');

{
  const tabel = [
    [429, true, 'batas-laju'],
    [503, true, 'server'],
    [502, true, 'server'],
    [500, true, 'server'],
    [504, true, 'server'],
    [408, true, 'waktu-habis'],
    [0, true, 'jaringan'],
    [401, false, 'kredensial'],
    [403, false, 'kredensial'],
    [400, false, 'permintaan'],
    [404, false, 'permintaan'],
    [422, false, 'permintaan'],
  ];
  const beda = [];
  for (const [status, boleh, sebab] of tabel) {
    const v = vonisStatus(status);
    if (v.bolehUlang !== boleh || v.sebab !== sebab)
      beda.push(`${status} → ${v.sebab}/${v.bolehUlang} (harusnya ${sebab}/${boleh})`);
  }
  check(
    'a1-vonisStatus-12-kode',
    beda.length === 0,
    `vonisStatus: ${tabel.length} kode HTTP diklasifikasi benar (429/5xx/408 boleh diulang; 401/403/4xx lain permanen)`,
    beda.length ? beda.join(' | ') : `contoh: 429=${JSON.stringify(vonisStatus(429))} 401=${JSON.stringify(vonisStatus(401))}`,
  );

  const teks = [
    ['429 Too Many Requests', true, 'batas-laju'],
    ['HTTP 503 Service Unavailable', true, 'server'],
    ['401 Unauthorized: invalid api key', false, 'kredensial'],
    ['403 Forbidden', false, 'kredensial'],
    ['400 invalid request: unknown field', false, 'permintaan'],
    ['404 model not found', false, 'permintaan'],
    ['request cancelled oleh user', false, 'permintaan'],
    ['model returned malformed json arguments', false, 'permintaan'],
    ['stream terputus: connection reset by peer', true, 'jaringan'],
    ['GET https://api.x/v1: ENOTFOUND api.x', true, 'jaringan'],
    ['provider tidak menjawab sampai batas waktu', true, 'waktu-habis'],
    ['sesuatu yang belum pernah dilihat', false, 'tak-dikenal'],
  ];
  const beda2 = [];
  for (const [s, boleh, sebab] of teks) {
    const v = vonisGalat(new Error(s));
    if (v.bolehUlang !== boleh || v.sebab !== sebab)
      beda2.push(`"${s.slice(0, 30)}" → ${v.sebab}/${v.bolehUlang} (harusnya ${sebab}/${boleh})`);
  }
  check(
    'a2-vonisGalat-12-teks',
    beda2.length === 0,
    `vonisGalat atas ${teks.length} teks galat nyata (termasuk "stream terputus" dan "cancel"): ${teks.length - beda2.length}/${teks.length} sesuai`,
    beda2.length ? beda2.join(' | ') : 'urutan permanen-dulu sama dengan isRetryableAgentProviderError di aiStore.ts',
  );

  const v = vonisGalat(galatProvider(429, 'HTTP 429', 3000));
  check(
    'a3-galatProvider-bawa-status',
    v.bolehUlang === true && v.sebab === 'batas-laju' && v.kode === 429 && v.setelahMs === 3000,
    `galatProvider(429,…,3000) dibaca apa adanya (tanpa regex): ${JSON.stringify(v)}`,
  );
}

/* ═══════════════ (B) Retry-After & backoff ═══════════════ */
console.log('\n(B) Retry-After & backoff — bertambah, ada batas atas');

{
  const t0 = Date.UTC(2026, 9, 14, 7, 0, 0);
  const kasus = [
    ['120', t0, 120000],
    ['0', t0, 0],
    ['1.5', t0, 1500],
    ['Wed, 14 Oct 2026 07:00:30 GMT', t0, 30000],
    ['Wed, 14 Oct 2026 06:59:00 GMT', t0, null], // sudah lewat → tidak ada nasihat tunggu
    ['garbage', t0, null],
    ['', t0, null],
    [null, t0, null],
  ];
  const salah = [];
  for (const [nilai, kini, harus] of kasus) {
    const dapat = bacaSetelahHeader(nilai, kini);
    if (dapat !== harus) salah.push(`${JSON.stringify(nilai)} → ${dapat} (harusnya ${harus})`);
  }
  check(
    'b1-retry-after-dibaca',
    salah.length === 0,
    `bacaSetelahHeader: ${kasus.length - salah.length}/${kasus.length} bentuk benar (detik, tanggal HTTP, sampah, sudah lewat)`,
    salah.length ? salah.join(' | ') : `contoh: "120" → ${bacaSetelahHeader('120', t0)} ms`,
  );

  const naik = [1, 2, 3, 4, 5].map((p) => jedaKe(p, { jedaDasarMs: 100, jedaMaksMs: 400, jitter: 0 }));
  const menanjak = naik.every((v, i) => i === 0 || v >= naik[i - 1]);
  check(
    'b2-backoff-naik-terbatas',
    JSON.stringify(naik) === JSON.stringify([100, 200, 400, 400, 400]) && menanjak,
    `jedaKe (dasar 100 ms, langit-langit 400 ms, jitter 0) = [${naik.join(', ')}] — tumbuh ×2 lalu BERHENTI di langit-langit`,
  );

  const atas = jedaKe(9, { jedaDasarMs: 1000, jedaMaksMs: 20000, jitter: 0.9, acak: () => 0 });
  const bawah = jedaKe(9, { jedaDasarMs: 1000, jedaMaksMs: 20000, jitter: 0.9, acak: () => 1 });
  check(
    'b3-jitter-hanya-memotong',
    atas === 20000 && bawah === 2000 && atas > bawah,
    `jitter hanya mengurangi, tidak pernah melewati langit-langit: acak=0 → ${atas} ms, acak=1 → ${bawah} ms (dasar 1000, maks 20000)`,
  );

  check(
    'b4-bawaan-ada-nama',
    BAWAAN_PROVIDER_TAHAN.jedaMaksMs === 20000 &&
      BAWAAN_PROVIDER_TAHAN.maksPercobaanPerKandidat === 3 &&
      BAWAAN_PROVIDER_TAHAN.batasGiliranMs === 120000,
    `bawaan modul dapat disebut namanya: ${JSON.stringify(BAWAAN_PROVIDER_TAHAN)}`,
  );
}

/* ═══════════════ (C) penyaring rahasia ═══════════════ */
console.log('\n(C) rahasia — kunci & header tidak boleh bocor ke log/pesan');

{
  const rahasia = [
    'Authorization: Bearer sk-live-9f8e7d6c5b4a',
    '{"api_key":"sk-ant-api03-AAAABBBBCCCC"}',
    'x-api-key: deadbeefdeadbeef',
    'https://api.x/v1?token=abcdef123456&x=1',
    'AIzaSyD1234567890abcdefXYZ',
    'ghp_ABCDEF1234567890XYZ',
    'password=hunter2secret',
  ];
  const bocor = [];
  for (const t of rahasia) {
    const bersih = saringRahasia(t);
    const sisa = ['sk-live-9f8e7d6c5b4a', 'AAAABBBBCCCC', 'deadbeefdeadbeef', 'abcdef123456', 'AIzaSyD1234567890abcdefXYZ', 'ghp_ABCDEF1234567890XYZ', 'hunter2secret'].filter(
      (s) => bersih.includes(s),
    );
    if (sisa.length) bocor.push(`"${t}" → masih memuat ${sisa.join(',')}`);
  }
  check(
    'c1-saringRahasia-7-bentuk',
    bocor.length === 0,
    `saringRahasia menutup ${rahasia.length}/${rahasia.length} bentuk kunci (Bearer, api_key JSON, x-api-key, query token, AIza, ghp_, password)`,
    bocor.length ? bocor.join(' | ') : `contoh: "${saringRahasia(rahasia[0])}"`,
  );

  const sebabAsli = 'Provider timeout setelah batas token 4096 — batas waktu percobaan';
  check(
    'c2-tidak-over-redaksi',
    saringRahasia(sebabAsli) === sebabAsli,
    'prosa biasa TIDAK dirusak penyaring (sebab asli tetap terbaca user): ' + `"${saringRahasia(sebabAsli)}"`,
  );
}

/* ═══════════════ (D) pesan jujur ke user ═══════════════ */
console.log('\n(D) pesan ke user — sebab + nomor percobaan + satu aksi');

{
  const p429 = pesanGagal({
    sebab: 'batas-laju',
    kode: 429,
    alasanBerhenti: 'kandidat-habis',
    percobaan: 5,
    dicoba: [
      { provider: 'openrouter', model: 'm1', percobaan: 3 },
      { provider: 'openai', model: 'm2', percobaan: 2 },
    ],
    sebabAman: 'HTTP 429 Too Many Requests',
    jalur: 'chat',
  });
  check(
    'd1-pesan-429',
    p429.includes('429') &&
      p429.includes('5×') &&
      p429.includes('m1') &&
      p429.includes('m2') &&
      p429.includes('di jalur chat') &&
      /Settings|Tunggu/.test(p429),
    'pesan 429 memuat: kode (429), jumlah percobaan (5×), kandidat yang dicoba (m1/m2), jalur (chat), dan satu aksi (tunggu/Settings)',
    p429,
  );

  const p401 = pesanGagal({
    sebab: 'kredensial',
    kode: 401,
    alasanBerhenti: 'permanen',
    percobaan: 1,
    dicoba: [{ provider: 'openai', model: 'm1', percobaan: 1 }],
    sebabAman: '401 Unauthorized: invalid api key',
    jalur: 'agent',
  });
  check(
    'd2-pesan-401-jujur',
    p401.includes('401') && p401.includes('1×') && /tidak akan sembuh|Tidak diulang/.test(p401) && p401.includes('Settings'),
    'pesan 401 menyebut jumlah percobaan (1×), menyatakan TIDAK diulang, dan menunjuk aksi (Settings → Providers)',
    p401,
  );

  const pWaktu = pesanGagal({
    sebab: 'waktu-habis',
    kode: 408,
    alasanBerhenti: 'batas-waktu',
    percobaan: 3,
    dicoba: [{ provider: 'p1', model: 'm1', percobaan: 3 }],
    sebabAman: 'batas waktu percobaan (40000 ms) terlampaui',
  });
  check(
    'd3-pesan-batas-waktu',
    pWaktu.includes('3×') && /batas waktu/i.test(pWaktu),
    'pesan batas waktu giliran memuat jumlah percobaan (3×) dan sebabnya',
    pWaktu,
  );

  const pBatal = pesanGagal({
    sebab: 'batas-laju',
    kode: 429,
    alasanBerhenti: 'dibatalkan',
    percobaan: 2,
    dicoba: [{ provider: 'p1', model: 'm1', percobaan: 2 }],
    sebabAman: 'HTTP 429',
  });
  check(
    'd4-pesan-dibatalkan',
    pBatal.startsWith('Dihentikan') && pBatal.includes('2×'),
    'pembatalan user dibedakan dari kegagalan provider (bukan "provider gagal"): ' + pBatal.slice(0, 90) + '…',
  );

  const pTunggu = pesanTunggu({
    sebab: 'batas-laju',
    percobaan: 2,
    maksPercobaan: 3,
    jedaMs: 1600,
    kandidat: KAND(1),
    indeksKandidat: 0,
    totalKandidat: 2,
  });
  check(
    'd5-pesan-tunggu',
    pTunggu.includes('batas-laju') && pTunggu.includes('2/3') && pTunggu.includes('1.6 dtk') && pTunggu.includes('kandidat 1/2') && pTunggu.includes('Stop'),
    'status saat menunggu memuat sebab, nomor percobaan, lama tunggu, kandidat ke-berapa, dan tombol Stop',
    pTunggu,
  );
}

/* ═══════════════ (E) panggilTahan: retry & anggaran ═══════════════ */
console.log('\n(E) panggilTahan — 429 diulang tepat sesuai anggaran');

{
  const { panggil, panggilan } = buatPanggil([429, 429, 429, 'ok']);
  const { tidur, log } = buatTidurPalsu();
  const lapor = [];
  const h = await panggilTahan({
    kandidat: [KAND(1)],
    panggil,
    jalur: 'chat',
    maksPercobaanPerKandidat: 4,
    anggaranPercobaan: 4,
    jedaDasarMs: 10,
    jedaMaksMs: 100,
    jitter: 0,
    tidur,
    lapor: (p) => lapor.push(p),
  });
  check(
    'e1-429-3x-lalu-sukses',
    h.ok === true &&
      h.percobaan === 4 &&
      panggilan.length === 4 &&
      JSON.stringify(log) === JSON.stringify([10, 20, 40]) &&
      h.tungguMs === 70 &&
      h.pesan === null,
    `429 tiga kali lalu sukses: ${panggilan.length} panggilan, percobaan=${h.percobaan}, jeda=[${log.join(', ')}] ms (total ${h.tungguMs} ms)`,
    `alasanBerhenti=${h.alasanBerhenti} ms=${h.ms} jejak=${JSON.stringify(h.jejak)}`,
  );

  const urutTunggu = lapor.filter((l) => l.tahap === 'tunggu').map((l) => l.pesan);
  check(
    'e2-lapor-saat-tunggu',
    lapor.length === 8 &&
      lapor[0].tahap === 'coba' &&
      lapor[lapor.length - 1].tahap === 'sukses' &&
      urutTunggu.length === 3 &&
      urutTunggu[0].includes('batas-laju') &&
      urutTunggu[0].includes('percobaan ke-2/4'),
    `lapor (jalur progres UI) dipanggil ${lapor.length}× dengan urutan coba→tunggu→…→sukses; teks tunggu pertama: "${(urutTunggu[0] || '').slice(0, 80)}…"`,
  );

  const p2 = buatPanggil([429]);
  const t2 = buatTidurPalsu();
  const h2 = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: p2.panggil,
    maksPercobaanPerKandidat: 3,
    anggaranPercobaan: 3,
    jedaDasarMs: 10,
    jedaMaksMs: 100,
    jitter: 0,
    tidur: t2.tidur,
  });
  check(
    'e3-berhenti-tepat-anggaran',
    h2.ok === false &&
      h2.percobaan === 3 &&
      p2.panggilan.length === 3 &&
      t2.log.length === 2 &&
      h2.alasanBerhenti === 'kandidat-habis' &&
      h2.sebab === 'batas-laju',
    `429 terus-menerus: TEPAT ${p2.panggilan.length} panggilan (anggaran 3), ${t2.log.length} kali tunggu — tidak menyerah lebih awal, tidak melebihi anggaran`,
    `alasanBerhenti=${h2.alasanBerhenti} percobaanPerKandidat=${JSON.stringify(h2.percobaanPerKandidat)}`,
  );

  const p3 = buatPanggil([503]);
  const t3 = buatTidurPalsu();
  const h3 = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: p3.panggil,
    maksPercobaanPerKandidat: 5,
    anggaranPercobaan: 5,
    jedaDasarMs: 100,
    jedaMaksMs: 400,
    jitter: 0,
    tidur: t3.tidur,
  });
  check(
    'e4-backoff-di-dalam-loop',
    JSON.stringify(t3.log) === JSON.stringify([100, 200, 400, 400]) && h3.tungguMs === 1100 && h3.sebab === 'server',
    `5xx diulang terbatas dengan jeda bertambah lalu mentok langit-langit: jeda=[${t3.log.join(', ')}] ms, total ${h3.tungguMs} ms, percobaan=${h3.percobaan}`,
  );

  const p4 = buatPanggil([() => { throw galatProvider(429, 'HTTP 429 dengan Retry-After', 5000); }]);
  const t4 = buatTidurPalsu();
  const h4 = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: p4.panggil,
    maksPercobaanPerKandidat: 3,
    anggaranPercobaan: 3,
    jedaDasarMs: 100,
    jedaMaksMs: 2000,
    jitter: 0,
    tidur: t4.tidur,
  });
  check(
    'e5-retry-after-dihormati',
    JSON.stringify(t4.log) === JSON.stringify([2000, 2000]) &&
      h4.jejak.some((b) => b.includes('Retry-After 5000 ms')) &&
      h4.tungguMs === 4000,
    `Retry-After 5000 ms dihormati tetapi DIBATASI langit-langit 2000 ms: jeda=[${t4.log.join(', ')}] ms — "tunggu 3600 dtk" dari gateway tidak bisa memarkir app`,
    `jejak[1]=${JSON.stringify(h4.jejak[1])}`,
  );
}

/* ═══════════════ (F) permanen: 401/403 tidak diulang ═══════════════ */
console.log('\n(F) permanen — 401/403/400/404 TIDAK diulang, juga tidak pindah diam-diam');

{
  const kasus = [
    [401, 'kredensial'],
    [403, 'kredensial'],
    [400, 'permintaan'],
    [404, 'permintaan'],
  ];
  const rincian = [];
  let sesuai = 0;
  for (const [status, sebab] of kasus) {
    const p = buatPanggil([status]);
    const t = buatTidurPalsu();
    const h = await panggilTahan({
      kandidat: [KAND(1), KAND(2)],
      panggil: p.panggil,
      maksPercobaanPerKandidat: 3,
      anggaranPercobaan: 6,
      jedaDasarMs: 10,
      jitter: 0,
      tidur: t.tidur,
    });
    const ok =
      h.ok === false &&
      p.panggilan.length === 1 &&
      t.log.length === 0 &&
      h.alasanBerhenti === 'permanen' &&
      h.sebab === sebab &&
      !h.jejak.some((b) => b.includes('pindah')) &&
      h.percobaanPerKandidat.length === 1;
    if (ok) sesuai++;
    rincian.push(
      `${status}: panggilan=${p.panggilan.length} tunggu=${t.log.length} berhenti=${h.alasanBerhenti}/${h.sebab} pindah=${h.jejak.some((b) => b.includes('pindah'))}`,
    );
  }
  check(
    'f1-kredensial-permanen',
    sesuai === kasus.length,
    `${sesuai}/${kasus.length} kode permanen: TEPAT 1 panggilan, 0 tunggu, dan tidak menyeberang ke kandidat ke-2 (kunci salah tidak disembuhkan oleh provider lain yang juga belum dicoba)`,
    rincian.join('\n         '),
  );

  const p = buatPanggil([401]);
  const h = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: p.panggil,
    jalur: 'chat',
    maksPercobaanPerKandidat: 3,
    tidur: buatTidurPalsu().tidur,
  });
  check(
    'f2-pesan-permanen-keluar',
    typeof h.pesan === 'string' && h.pesan.includes('401') && h.pesan.includes('1×'),
    'kegagalan permanen tetap MENGHASILKAN pesan (bukan gagal diam-diam): ' + String(h.pesan).slice(0, 100) + '…',
  );
}

/* ═══════════════ (G) fallback antar-model/provider ═══════════════ */
console.log('\n(G) fallback — kandidat berikutnya dipakai saat yang pertama habis');

{
  const p = buatPanggil([503, 503, 'ok']);
  const t = buatTidurPalsu();
  const lapor = [];
  const h = await panggilTahan({
    kandidat: [KAND(1), KAND(2)],
    panggil: p.panggil,
    maksPercobaanPerKandidat: 2,
    anggaranPercobaan: 6,
    jedaDasarMs: 10,
    jitter: 0,
    tidur: t.tidur,
    lapor: (x) => lapor.push(x),
  });
  const pindah = h.jejak.find((b) => b.includes('pindah'));
  check(
    'g1-fallback-kepakai',
    h.ok === true &&
      h.kandidat?.model === 'm2' &&
      h.percobaan === 3 &&
      p.panggilan.length === 3 &&
      t.log.length === 1 &&
      !!pindah &&
      lapor.some((l) => l.tahap === 'pindah'),
    `provider pertama habis (2× 503) → pindah ke kandidat ke-2 yang menjawab: nilai dari ${h.kandidat?.model}, ${h.percobaan} percobaan, 1 tunggu (tidak menunggu antar-provider)`,
    `jejak: ${pindah ? `"${pindah}"` : '(tidak ada)'} | progres 'pindah' dilaporkan=${lapor.some((l) => l.tahap === 'pindah')}`,
  );

  const p2 = buatPanggil([503]);
  const h2 = await panggilTahan({
    kandidat: [KAND(1), KAND(2), KAND(3)],
    panggil: p2.panggil,
    maksPercobaanPerKandidat: 2,
    anggaranPercobaan: 4,
    jedaDasarMs: 10,
    jitter: 0,
    tidur: buatTidurPalsu().tidur,
  });
  check(
    'g2-anggaran-lintas-kandidat',
    p2.panggilan.length === 4 &&
      h2.alasanBerhenti === 'anggaran-habis' &&
      h2.percobaanPerKandidat.length === 2 &&
      !h2.jejak.some((b) => b.includes('m3')) &&
      h2.pesan.includes('4×'),
    `anggaran 4 percobaan menghabiskan 2 kandidat (2+2) lalu BERHENTI: ${p2.panggilan.length} panggilan, berhenti=${h2.alasanBerhenti}; kandidat ke-3 TIDAK dicatat sebagai dicoba dan TIDAK diumumkan di jejak`,
    `percobaanPerKandidat=${JSON.stringify(h2.percobaanPerKandidat)} | jejak memuat m3=${h2.jejak.some((b) => b.includes('m3'))}`,
  );

  const p3 = buatPanggil([503, 503, 503, 503, 'ok']);
  const h3 = await panggilTahan({
    kandidat: [KAND(1), KAND(2), KAND(3)],
    panggil: p3.panggil,
    maksPercobaanPerKandidat: 2,
    anggaranPercobaan: 6,
    jedaDasarMs: 10,
    jitter: 0,
    tidur: buatTidurPalsu().tidur,
  });
  check(
    'g3-dua-kali-pindah',
    h3.ok === true &&
      h3.kandidat?.model === 'm3' &&
      h3.percobaan === 5 &&
      h3.jejak.filter((b) => b.includes('pindah')).length === 2,
    `kandidat ke-3 dipakai setelah dua kali pindah: jawaban dari ${h3.kandidat?.model} pada percobaan ke-${h3.percobaan}, 2 baris "pindah" di jejak`,
  );

  const p4 = buatPanggil(['ok']);
  const h4 = await panggilTahan({
    kandidat: [KAND(1), KAND(2)],
    panggil: p4.panggil,
    maksPercobaanPerKandidat: 3,
    tidur: buatTidurPalsu().tidur,
  });
  check(
    'g4-sukses-pertama-tanpa-tunggu',
    h4.ok === true && h4.percobaan === 1 && h4.tungguMs === 0 && h4.jejak.length === 1,
    'jalur cepat tidak dihukum oleh lapisan ini: 1 panggilan, 0 tunggu, 1 baris jejak',
    `jejak=${JSON.stringify(h4.jejak)}`,
  );

  const h5 = await panggilTahan({
    kandidat: [],
    panggil: async () => 'tidak boleh dipanggil',
    jalur: 'chat',
  });
  check(
    'g5-tanpa-kandidat-jujur',
    h5.ok === false && h5.percobaan === 0 && h5.alasanBerhenti === 'tanpa-kandidat' && /Settings/.test(h5.pesan),
    'tanpa kandidat sama sekali: tidak memanggil apa pun (0 percobaan) dan tetap memberi pesan yang bisa ditindaklanjuti',
    String(h5.pesan),
  );
}

/* ═══════════════ (H) batas waktu & pembatalan ═══════════════ */
console.log('\n(H) batas waktu per giliran & pembatalan');

{
  const hang = buatHang();
  const t = buatTidurPalsu();
  const h = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: hang.panggil,
    maksPercobaanPerKandidat: 3,
    anggaranPercobaan: 5,
    batasPercobaanMs: 30,
    /* Batas giliran sengaja jauh (60 dtk) supaya yang diuji di sini HANYA batas
       per percobaan — kalau jam dinding mesin sedang lambat, batas giliran tidak
       boleh ikut memutus dan membuat vonisnya berubah. */
    batasGiliranMs: 60_000,
    jedaDasarMs: 10,
    jitter: 0,
    tidur: t.tidur,
  });
  check(
    'h1-batas-percobaan-menahan',
    h.ok === false &&
      h.percobaan === 3 &&
      hang.jumlah() === 3 &&
      h.sebab === 'waktu-habis' &&
      h.ms >= 60 &&
      h.ms < 5_000,
    `provider yang MENERIMA koneksi lalu diam: tiap percobaan dipotong batas percobaan (30 ms) → ${hang.jumlah()} panggilan, berhenti setelah ${h.ms.toFixed(0)} ms (dulu: UI tertahan menunggu stream yang tak pernah tutup)`,
    `alasanBerhenti=${h.alasanBerhenti} sebab=${h.sebab} pesan=${String(h.pesan).slice(0, 80)}…`,
  );

  /*
   * Batas GILIRAN diuji dengan JAM PALSU supaya angkanya pasti: yang dibuktikan
   * di sini aritmetika anggaran waktu (tunggu ke-3 akan melewati batas, jadi
   * percobaan ke-4 tidak pernah dikirim), bukan balapan waktu nyata.
   *
   * Versi lama memakai jam nyata dengan batas 100 ms dan vonisnya KADANG merah
   * (terukur 105 ms → "2 percobaan" alih-alih 3) karena panggilan yang menggantung
   * menelan waktu dinding nyata. Kasus yang bisa berubah warna antar-jalan tidak
   * layak disebut deterministik, jadi jamnya disuntik seperti di bagian (J).
   */
  const jam2 = buatJam(0);
  let n2 = 0;
  const panggil2 = async () => {
    n2++;
    throw galatProvider(429, 'HTTP 429 rate limit');
  };
  const h2 = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: panggil2,
    maksPercobaanPerKandidat: 6,
    anggaranPercobaan: 6,
    batasPercobaanMs: 1000,
    batasGiliranMs: 100,
    jedaDasarMs: 40,
    jedaMaksMs: 40,
    jitter: 0,
    sekarang: jam2.sekarang,
    tidur: jam2.tidur,
  });
  check(
    'h2-batas-giliran-menahan',
    h2.ok === false &&
      h2.alasanBerhenti === 'batas-waktu' &&
      h2.percobaan === 3 &&
      n2 === 3 &&
      h2.ms === 120,
    `batas giliran 100 ms MENGUNCI total (jam palsu): ${h2.percobaan} percobaan dalam ${h2.ms} ms waktu-palsu — tunggu ke-3 (40 ms) sudah melewati batas, jadi percobaan ke-4 TIDAK dikirim walau anggaran masih tersisa 3`,
    `percobaanPerKandidat=${JSON.stringify(h2.percobaanPerKandidat)} berhenti=${h2.alasanBerhenti} jeda=${JSON.stringify(jam2.log)}`,
  );

  let jumlah = 0;
  const p3 = async () => {
    jumlah++;
    throw galatProvider(429, 'HTTP 429');
  };
  const t3 = buatTidurPalsu();
  const h3 = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: p3,
    maksPercobaanPerKandidat: 5,
    anggaranPercobaan: 5,
    jedaDasarMs: 10,
    jitter: 0,
    tidur: t3.tidur,
    batal: () => jumlah >= 2,
  });
  check(
    'h3-batal-di-tengah',
    h3.alasanBerhenti === 'dibatalkan' && jumlah === 2 && h3.percobaan === 2 && String(h3.pesan).startsWith('Dihentikan'),
    `Stop di tengah menunggu: berhenti SETELAH ${jumlah} panggilan (bukan menunggu seluruh tangga selesai), pesannya berkata "Dihentikan"`,
    `jejak terakhir: ${JSON.stringify(h3.jejak[h3.jejak.length - 1])}`,
  );
}

/* ═══════════════ (I) determinisme, jejak, rahasia di jalur nyata ═══════════════ */
console.log('\n(I) determinisme & kebocoran');

{
  const jalankan = async () => {
    const p = buatPanggil([429]);
    const t = buatTidurPalsu();
    let i = 0;
    const acak = () => [0.9, 0.1, 0.5, 0.7, 0.3][i++ % 5];
    return panggilTahan({
      kandidat: [KAND(1)],
      panggil: p.panggil,
      jalur: 'agent',
      maksPercobaanPerKandidat: 4,
      anggaranPercobaan: 4,
      jedaDasarMs: 1000,
      jedaMaksMs: 8000,
      jitter: 0.3,
      acak,
      tidur: t.tidur,
    });
  };
  const a = await jalankan();
  const b = await jalankan();
  check(
    'i1-determinisme',
    JSON.stringify(a.jejak) === JSON.stringify(b.jejak) &&
      a.tungguMs === b.tungguMs &&
      a.pesan === b.pesan &&
      a.percobaan === b.percobaan,
    `dua jalannya skenario identik (acak & tidur disuntik) menghasilkan jejak, jeda (${a.tungguMs} ms), jumlah percobaan (${a.percobaan}) dan pesan yang SAMA PERSIS`,
    `jejak[0..1]: ${JSON.stringify(a.jejak.slice(0, 2))}`,
  );

  const RAHASIA1 = 'sk-live-DEADBEEF1234567890';
  const RAHASIA2 = 'sk-ant-api03-SECRETSECRET09';
  const pesanKotor = () =>
    `POST https://api.x/v1/chat 429 Too Many Requests — request headers: {"Authorization":"Bearer ${RAHASIA1}","x-api-key":"${RAHASIA2}"}`;
  const p = buatPanggil([429], { pesan: pesanKotor });
  const t = buatTidurPalsu();
  const catat = [];
  const { hasil: h, ditangkap } = await tanpaConsole(() =>
    panggilTahan({
      kandidat: [KAND(1), KAND(2)],
      panggil: p.panggil,
      jalur: 'agent',
      maksPercobaanPerKandidat: 2,
      anggaranPercobaan: 4,
      jedaDasarMs: 10,
      jitter: 0,
      tidur: t.tidur,
      catat: (b) => catat.push(b),
    }),
  );
  const semua = [...h.jejak, ...catat, String(h.pesan), ...t.log.map(String)].join('\n');
  check(
    'i2-tidak-ada-kunci-di-log',
    !semua.includes(RAHASIA1) && !semua.includes(RAHASIA2) && !semua.includes('sk-live-') && semua.includes('429'),
    `galat provider yang MENGECHO header (Bearer + x-api-key) tidak membocorkan kunci ke jejak, catat, maupun pesan user — sedangkan sebabnya (429) tetap terbaca`,
    `panjang jejak=${h.jejak.length}, kunci bocor=${semua.includes(RAHASIA1) || semua.includes(RAHASIA2)}`,
  );

  check(
    'i3-modul-bisu-tanpa-console',
    ditangkap.length === 0,
    `selama seluruh panggilan, modul TIDAK menulis apa pun ke console (${ditangkap.length} baris tertangkap) — log sepenuhnya lewat jejak/catat yang sudah disaring`,
    ditangkap.length ? ditangkap.slice(0, 3).join(' | ') : `contoh baris jejak: ${JSON.stringify(h.jejak[0])}`,
  );

  const p2 = buatPanggil(['stream terputus: connection reset by peer', 'ok']);
  const h2 = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: p2.panggil,
    maksPercobaanPerKandidat: 3,
    jedaDasarMs: 10,
    jitter: 0,
    tidur: buatTidurPalsu().tidur,
  });
  check(
    'i4-stream-terputus-diulang',
    h2.ok === true && h2.percobaan === 2 && h2.kandidat?.model === 'm1',
    'stream yang terputus di tengah (bukan salah kunci) diulang dan berhasil pada percobaan ke-2 — bukan langsung membunuh giliran',
  );
}

/* ═════ (J) anggaran per menit per kredensial — angka provider apa adanya ═════ */

console.log(
  `\n(J) jendela kredensial — ${JENDELA_PROVIDER.maksPercobaan} percobaan / ${JENDELA_PROVIDER.maksSukses} jawaban per ${JENDELA_PROVIDER.detik} detik`,
);

/** Jam palsu: hanya MAJU kalau `tidur` dipanggil. Tanpa timer nyata, tanpa tunggu nyata. */
function buatJam(mulai = 0) {
  let t = mulai;
  const log = [];
  return {
    sekarang: () => t,
    tidur: async (ms) => {
      log.push(ms);
      t += Math.max(0, Number(ms) || 0);
    },
    log,
  };
}

/** Waktu kirim/jawab dicatat dari jam palsu; provider di sini selalu 429. */
function buatPanggilJam(jam, jawab = () => '429') {
  const kirim = [];
  const sukses = [];
  const panggil = async (k, p) => {
    kirim.push(jam.sekarang());
    if (jawab(k, p) === 'ok') {
      sukses.push(jam.sekarang());
      return 'ok';
    }
    throw galatProvider(429, 'HTTP 429 rate limit');
  };
  return { panggil, kirim, sukses };
}

/** Jumlah terbanyak yang jatuh di dalam satu jendela selebar `jendelaMs` (teori ketat). */
function maksDalamJendela(waktu, jendelaMs) {
  let maks = 0;
  for (let i = 0; i < waktu.length; i++) {
    const n = waktu.filter((t) => t >= waktu[i] && t < waktu[i] + jendelaMs).length;
    if (n > maks) maks = n;
  }
  return maks;
}

{
  check(
    'j0-angka-provider-apa-adanya',
    JENDELA_PROVIDER.detik === 60 &&
      JENDELA_PROVIDER.maksPercobaan === 70 &&
      JENDELA_PROVIDER.maksSukses === 60 &&
      BAWAAN_PROVIDER_TAHAN.jendelaMs === 60000 &&
      BAWAAN_PROVIDER_TAHAN.maksPercobaanJendela === 70 &&
      BAWAAN_PROVIDER_TAHAN.maksSuksesJendela === 60,
    `angka dari pesan provider dipakai apa adanya di modul & di uji ini: jendela ${JENDELA_PROVIDER.detik} dtk, ${JENDELA_PROVIDER.maksPercobaan} percobaan, ${JENDELA_PROVIDER.maksSukses} sukses (bukan angka karangan)`,
  );

  /* Jendela penuh → hitung mundur yang benar, lalu jendela itu bergeser → jatah kembali. */
  const j = buatJendela();
  for (let i = 0; i < 70; i++) j.percobaan.push(i * 500); // 70 percobaan dalam 34,5 detik
  const penuh = jatahJendela(j, 34_500, {
    jendelaMs: 60_000,
    maksPercobaanJendela: 70,
    maksSuksesJendela: 60,
  });
  const j2 = buatJendela();
  for (let i = 0; i < 60; i++) j2.sukses.push(i * 500); // 60 JAWABAN dalam 30 detik
  const penuhSukses = jatahJendela(j2, 30_000, {
    jendelaMs: 60_000,
    maksPercobaanJendela: 70,
    maksSuksesJendela: 60,
  });
  const longgar = jatahJendela(j, 64_500, {
    jendelaMs: 60_000,
    maksPercobaanJendela: 70,
    maksSuksesJendela: 60,
  });
  check(
    'j1-jatah-jendela-dihitung',
    penuh?.sebab === 'percobaan' &&
      penuh.tungguMs === 25_500 &&
      penuhSukses?.sebab === 'sukses' &&
      penuhSukses.tungguMs === 30_000 &&
      longgar === null,
    `jatahJendela: 70 percobaan → tunggu ${penuh?.tungguMs} ms (sebab ${penuh?.sebab}); 60 JAWABAN saja sudah menutup jendela → tunggu ${penuhSukses?.tungguMs} ms (sebab ${penuhSukses?.sebab}); setelah jendela bergeser 11 dtk → ${longgar === null ? 'boleh kirim' : 'masih diblok'}`,
    `maxSukses (60/menit) adalah batas yang lebih ketat untuk giliran sehat; 60 jawaban mengunci sebelum 70 percobaan tercapai`,
  );

  /* Satu giliran yang terus di-429: anggaran 210 percobaan, jeda 0 → jendela yang mengunci. */
  const jam = buatJam();
  const p = buatPanggilJam(jam);
  const h = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: p.panggil,
    maksPercobaanPerKandidat: 999,
    anggaranPercobaan: 210,
    jedaDasarMs: 0,
    jedaMaksMs: 0,
    jitter: 0,
    jendelaMs: 60_000,
    maksPercobaanJendela: 70,
    maksSuksesJendela: 60,
    batasGiliranMs: 1_000_000_000,
    batasPercobaanMs: 1_000_000_000,
    tidur: jam.tidur,
    sekarang: jam.sekarang,
  });
  const maksKirim = maksDalamJendela(p.kirim, 60_000);
  const tungguJendela = jam.log.filter((ms) => ms > 0);
  check(
    'j2-satu-giliran-tidak-melampaui-70',
    h.percobaan === 210 &&
      h.alasanBerhenti === 'anggaran-habis' &&
      maksKirim <= 70 &&
      tungguJendela.length === 2 &&
      tungguJendela.every((ms) => ms === 60_000) &&
      h.jendela.tungguJendelaMs === 120_000,
    `satu giliran menembak 210 percobaan tanpa melampaui plafon: paling banyak ${maksKirim} percobaan di jendela 60 dtk mana pun (plafon 70), dan lapisan MENUNGGU jendela ${tungguJendela.length}× × 60.000 ms = ${h.jendela.tungguJendelaMs} ms sebelum kirim berikutnya`,
    `percobaan=${h.percobaan} waktu-palsu-total=${jam.sekarang()} ms jeda-jendela=[${tungguJendela.join(', ')}] berhenti=${h.alasanBerhenti}`,
  );

  /* Sepuluh giliran beruntun, satu kredensial SHARED: 60 jawaban/menit juga mengunci. */
  const jam2 = buatJam();
  const jendelaBersama = buatJendela();
  const suksesSemua = [];
  let giliran = 0;
  let kenaTunggu = 0;
  let tungguTerbesar = 0;
  for (let putaran = 0; putaran < 130; putaran++) {
    const q = buatPanggilJam(jam2, () => 'ok');
    const hx = await panggilTahan({
      kandidat: [KAND(1)],
      panggil: q.panggil,
      maksPercobaanPerKandidat: 1,
      anggaranPercobaan: 1,
      jedaDasarMs: 0,
      jitter: 0,
      jendela: jendelaBersama,
      jendelaMs: 60_000,
      maksPercobaanJendela: 70,
      maksSuksesJendela: 60,
      batasGiliranMs: 1_000_000_000,
      batasPercobaanMs: 1_000_000_000,
      tidur: jam2.tidur,
      sekarang: jam2.sekarang,
    });
    giliran++;
    suksesSemua.push(...q.sukses);
    if (hx.jendela.tungguJendelaMs > 0) {
      kenaTunggu++;
      tungguTerbesar = Math.max(tungguTerbesar, hx.jendela.tungguJendelaMs);
    }
  }
  const maksSukses = maksDalamJendela(suksesSemua, 60_000);
  const isi = isiJendela(jendelaBersama, jam2.sekarang(), 60_000);
  check(
    'j3-60-jawaban-per-menit-dihormati',
    giliran === 130 &&
      suksesSemua.length === 130 &&
      maksSukses <= 60 &&
      kenaTunggu === 2 &&
      tungguTerbesar === 60_000,
    `130 giliran beruntun pada SATU kredensial (jendela milik caller, bukan per giliran): ${suksesSemua.length} jawaban, paling banyak ${maksSukses} di jendela 60 dtk mana pun (plafon 60) — lapisan menahan diri ${kenaTunggu}× selama ${tungguTerbesar} ms`,
    `waktu-palsu-total=${jam2.sekarang()} ms; sisa jendela saat giliran terakhir selesai: ${isi.percobaan} percobaan / ${isi.sukses} jawaban — tanpa jendela bersama, 130 giliran ini bisa jadi 130 percobaan dalam beberapa detik dan memicu ban yang jauh lebih panjang`,
  );
}

/* ═══ (K) "menyerah setelah 3 percobaan" diganti + kerja di disk tidak hilang ═══ */

console.log('\n(K) anggaran sebagai ganti "3 percobaan", pesan jujur, kerja di disk utuh');

{
  /* (K1) Cacat nyata: pesan `rate-limited every one of 3 attempts` — 20 percobaan. */
  const jam = buatJam();
  const p = buatPanggilJam(jam);
  const h = await panggilTahan({
    kandidat: [KAND(1)],
    panggil: p.panggil,
    jalur: 'agent',
    maksPercobaanPerKandidat: 20,
    anggaranPercobaan: 70,
    jedaDasarMs: 100,
    jedaMaksMs: 1000,
    jitter: 0,
    tidur: jam.tidur,
    sekarang: jam.sekarang,
  });
  check(
    'k1-bukan-3-percobaan-lalu-menyerah',
    h.percobaan === 20 && h.percobaan > 3 && h.alasanBerhenti === 'kandidat-habis' && String(h.pesan).includes('20×'),
    `diganti: alih-alih "menyerah setelah 3 percobaan" (<model> rate-limited every one of 3 attempts), kandidat yang sama di-429 sampai ${h.percobaan}× dalam satu kandidat sebelum pindah — dan pesannya menyebut "20×"`,
    `jeda-jeda=[${jam.log.join(', ')}] ms (backoff ×2 sampai langit-langit 1000 ms — jeda tumbuh, bukan tiga percobaan cepat lalu menyerah)`,
  );

  /* (K2) SEMUA provider 429 → kerja yang sudah tertulis ke disk TIDAK hilang. */
  const berkas = path.join(KELUARAN, 'kerja-selesai.txt');
  const isiKerja = [
    'bab-1: 12 kutipan sudah diekstrak dari 4 PDF (disimpan oleh giliran sebelumnya)',
    'bab-2: daftar tokoh + 38 catatan kaki',
    'bab-3: ringkasan 900 kata',
  ].join('\n');
  fs.writeFileSync(berkas, isiKerja, 'utf8');
  const sebelum = fs.statSync(berkas);
  const jumlahKandidat = 3;
  const pAll = buatPanggil(['429']);
  const tAll = buatTidurPalsu();
  const halo = await panggilTahan({
    kandidat: [KAND(1), KAND(2), KAND(3)],
    panggil: pAll.panggil,
    jalur: 'agent',
    maksPercobaanPerKandidat: 2,
    anggaranPercobaan: 6,
    jedaDasarMs: 10,
    jitter: 0,
    tidur: tAll.tidur,
    sekarang: buatJam().sekarang,
  });
  const sesudah = fs.statSync(berkas);
  const pesan = String(halo.pesan);
  const semuaDicoba = [1, 2, 3].every((n) => pesan.includes(`m${n}`) && pesan.includes(`(p${n})`));
  check(
    'k2-semua-provider-gagal-kerja-utuh',
    halo.ok === false &&
      halo.alasanBerhenti === 'kandidat-habis' &&
      halo.percobaan === 6 &&
      halo.kandidat === null &&
      halo.percobaanPerKandidat.length === jumlahKandidat &&
      fs.readFileSync(berkas, 'utf8') === isiKerja &&
      sesudah.mtimeMs === sebelum.mtimeMs &&
      sesudah.size === sebelum.size,
    `ketiga kandidat gagal (semua 429, ${halo.percobaan} percobaan) → berkas kerja di disk UTUH: isi identik, ukuran ${sesudah.size} B, mtime tidak bergeser (${sesudah.mtimeMs} = ${sebelum.mtimeMs}) — kegagalan provider tidak boleh membuang pekerjaan yang sudah selesai`,
    `berkas: ${berkas}`,
  );

  check(
    'k3-pesan-memuat-sebab-provider-percobaan',
    pesan.includes('429') &&
      pesan.includes('batas') &&
      semuaDicoba &&
      pesan.includes(`${halo.percobaan}×`) &&
      /Tunggu|Settings/.test(pesan) &&
      halo.dicoba ? halo.dicoba.length === jumlahKandidat : halo.percobaanPerKandidat.length === jumlahKandidat,
    `pesan ke user memuat SEBAB (429 / limit permintaan), PROVIDER mana saja yang dicoba (${halo.percobaanPerKandidat
      .map((d) => d.model + '/' + d.provider)
      .join(', ')}), dan NOMOR percobaan (${halo.percobaan}×) + satu tindakan — bukan gagal diam-diam`,
    `pesan (${pesan.length} karakter): ${pesan.slice(0, 240)}…`,
  );

  /* (K3) Statik: modul tidak menyentuh berkas/FS, dan uji ini tidak menulis ke repo. */
  const berkasBundel = path.join(KELUARAN, 'providerTahan.mjs');
  const sumberBundel = fs.readFileSync(berkasBundel, 'utf8');
  check(
    'k4-modul-tak-menyentuh-disk',
    !/node:fs|require\(|process\.env/.test(sumberBundel) &&
      !KELUARAN.startsWith(AKAR_REPO) &&
      !AKAR_REPO.startsWith(KELUARAN),
    `modul ketahanan tidak mengimpor fs/process.env (0 kecocokan node:fs|require(|process.env di bundel ${sumberBundel.length} B) dan folder sementara (${KELUARAN}) berada DI LUAR repo — uji ini tidak menulis berkas repo`,
    `bukti kerja-utuh di atas karena itu ditulis ke folder sementara, bukan ke repo`,
  );
}


const hijau = hasil.filter((h) => h.ok).length;
const merah = hasil.length - hijau;
console.log(`\nRingkasan uji-provider-fallback: ${hasil.length} pemeriksaan — ${hijau} hijau, ${merah} merah`);
if (merah) console.log('MERAH: ' + hasil.filter((h) => !h.ok).map((h) => h.id).join(', '));
console.log(
  merah === 0
    ? 'kesimpulan: retry berjenjang + backoff berbatas + fallback + batas waktu giliran + pesan jujur + penyaring rahasia SEMUA terbukti pada kode saat ini (tanpa jaringan)'
    : 'kesimpulan: MASIH ADA yang merah — lihat daftar di atas, jangan tandai item selesai',
);
process.exit(merah === 0 ? 0 : 1);
