/**
 * cek-tulis-subagent-live.mjs — batas tulis subagent, diperiksa pada app yang
 * benar-benar jalan, bukan pada berkas yang dibaca mata kita.
 *
 * Yang dibuktikan, dan kenapa masing-masing butuh app hidup:
 *
 *   A. Keadaan gerbangnya NYATA dan berlapis dua. `allowWrite` saja tidak
 *      membuka tulis disk: subagent tidak punya kartu persetujuan, jadi tanpa
 *      mode persetujuan `auto` tulisan disk tetap ditolak (`tulisDiskDilarang`).
 *      Nilainya dihitung ULANG dari store mentah di sini - kalau
 *      `kemampuanTulis()` berbohong, angkanya tidak akan cocok.
 *      Diuji dengan MATRIKS, bukan satu sampel: kombinasi (setelan x mode
 *      persetujuan) dijalankan dan hasilnya dibandingkan. Nilai setelan
 *      dikembalikan seperti semula di akhir (lihat `pulihkan`).
 *
 *   B. Gerbangnya MENJAWAB per nama tool: `write_file` ditolak dengan pesan
 *      yang menyebut gerbang mana yang menutup, sementara `read_file` tetap
 *      boleh. Penolakan yang menyebut sebabnya inilah bedanya dengan "error".
 *
 *   C. Ringkasan yang dibaca agen utama TIDAK bisa mengecoh: `catatanTulis`
 *      menyatakan izinnya mati lebih dulu, lengkap dengan jumlah percobaan
 *      tulis yang ditolak.
 *
 *   D. Di LAYAR: tab Subagents memasang baris izin tulis (data-testid
 *      `sav-tulis`) dengan keadaan yang bisa dibaca mesin, dan halaman Setelan
 *      menyediakan sakelarnya (`sub-allowwrite`) plus baris status hasil
 *      gabungan dua gerbang (`sub-allowwrite-state`) - jadi user bisa
 *      menyalakannya dari UI, dan tahu kenapa masih ditolak kalau belum.
 *
 *   node scripts/cek-tulis-subagent-live.mjs [port]
 *
 * Catatan: uji D/E membuka panel + jendela Setelan dan MEMBALIKKAN setelan
 * `subagent.allowWrite` sebentar untuk membuktikan gerbang kedua, lalu
 * mengembalikannya persis seperti semula (juga saat gagal, lewat finally).
 */
import { Cdp, reporter, tungguBridge, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('Batas tulis subagent: dua gerbang, jawaban gerbang, dan tanda di layar');

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

if (!(await tungguBridge(cdp, '__ZEPHYR_SUBSET__'))) {
  R.check('A0', false, 'bridge __ZEPHYR_SUBSET__ tidak ada di halaman (app belum termuat?)');
  await cdp.close();
  R.selesai();
}

/* ── A. Keadaan gerbang, dihitung ulang dari store mentah ───────────────── */

const bacaKeadaan = async () =>
  await cdp.json(
    `return JSON.stringify((() => {
  const S = window.__ZEPHYR__;
  const A = window.__ZEPHYR_AI__;
  const setelan = (S.getState().settings.subagent ?? {}).allowWrite === true;
  const mode = A.store.getState().approvalMode;
  const k = window.__ZEPHYR_SUBSET__.efektif();
  return {
    setelan, mode,
    harap: { setelan, persetujuanAuto: mode === 'auto', bisaTulis: setelan, bisaTulisDisk: setelan && mode === 'auto' },
    k,
    adaKunci: ['setelan', 'persetujuanAuto', 'bisaTulis', 'bisaTulisDisk'].every((x) => typeof k[x] === 'boolean'),
  };
})())`,
    30000,
  );

const awal = await bacaKeadaan();
console.log(
  `     keadaan awal: setelan=${awal.setelan} mode=${awal.mode} -> bisaTulis=${awal.k.bisaTulis} bisaTulisDisk=${awal.k.bisaTulisDisk}`,
);

R.check('A1', awal.adaKunci === true,
  'kemampuanTulis() melaporkan empat keadaan sebagai boolean (setelan/persetujuanAuto/bisaTulis/bisaTulisDisk)');
R.check('A2', awal.k.setelan === awal.harap.setelan && awal.k.persetujuanAuto === awal.harap.persetujuanAuto,
  `dua gerbangnya sesuai store mentah (setelan=${awal.k.setelan}, persetujuanAuto=${awal.k.persetujuanAuto})`);
R.check('A3', awal.k.bisaTulisDisk === awal.harap.bisaTulisDisk,
  awal.k.bisaTulisDisk
    ? 'bisaTulisDisk = setelan DAN mode Auto (keduanya menyala di sesi ini)'
    : `bisaTulisDisk mati, dan sebabnya bisa disebut: ${awal.setelan ? 'setelan menyala, mode persetujuan belum Auto' : 'setelan allowWrite mati'}`);

/* ── B. Gerbang per nama tool ───────────────────────────────────────────── */

const putusan = await cdp.json(
  `return JSON.stringify((() => {
  const P = window.__ZEPHYR_SUBSET__.putusanTulis;
  return {
    write: P('write_file'),
    edit: P('multi_edit'),
    baca: P('read_file'),
    daftar: P('list_directory'),
    shellJahat: P('bash_run', true),
  };
})())`,
  30000,
);

for (const [nama, p] of Object.entries(putusan)) {
  console.log(`     ${nama.padEnd(11)} boleh=${String(p.boleh).padEnd(5)} alasan=${p.alasan ?? '-'}`);
}
console.log(`     pesan tolak write_file: ${putusan.write.pesan.slice(0, 150)}`);

const tulisTerbuka = awal.k.bisaTulisDisk;
R.check('B1', putusan.write.boleh === tulisTerbuka,
  tulisTerbuka
    ? 'write_file BOLEH karena kedua gerbangnya terbuka di sesi ini'
    : 'write_file ditolak saat gerbangnya menutup');
R.check('B2', putusan.baca.boleh === true && putusan.daftar.boleh === true,
  'read_file dan list_directory tetap boleh - gerbangnya khusus tulis, bukan mematikan subagent');
R.check('B3', putusan.write.boleh || /NOT run|read-only|approval|no file was written/i.test(putusan.write.pesan),
  'penolakan menyebut sebabnya dan menyatakan berkasnya TIDAK ditulis (bukan error senyap)');
R.check('B4', putusan.shellJahat.boleh === false && /NOT run|deleted|approval|read-only/i.test(putusan.shellJahat.pesan),
  'perintah shell yang bisa menghapus ditolak juga (menyalakan izin tulis tidak diam-diam memberi hak hapus)');

// Tool tulis tidak perlu ditolak kalau memang tidak dikirim. Dua daftar
// dibandingkan: yang ditawarkan saat read-only dan yang saat boleh menulis.
const daftarTool = await cdp.json(
  `return JSON.stringify({
    readOnly: window.__ZEPHYR_TOOLS__.untukSubagent(false),
    bolehTulis: window.__ZEPHYR_TOOLS__.untukSubagent(true),
  })`,
  30000,
);
const TULIS = ['write_file', 'edit', 'multi_edit', 'delete_file', 'bash_run', 'replace_in_files'];
const adaTulisDiReadOnly = daftarTool.readOnly.filter((n) => TULIS.includes(n));
const adaTulisDiBoleh = daftarTool.bolehTulis.filter((n) => TULIS.includes(n));
console.log(`     read-only  : ${daftarTool.readOnly.length} tool, tool tulis yang ikut -> ${JSON.stringify(adaTulisDiReadOnly)}`);
console.log(`     bolehTulis : ${daftarTool.bolehTulis.length} tool, tool tulis yang ikut -> ${JSON.stringify(adaTulisDiBoleh)}`);

R.check('B5', adaTulisDiReadOnly.length === 0,
  'agent read-only TIDAK DITAWARI satu tool tulis pun (bukan cuma ditolak saat dipanggil)');
R.check('B6', adaTulisDiBoleh.length > 0,
  'di batas boleh-menulis, tool tulis memang muncul lagi - jadi "read-only" bukan berarti agentnya rusak');

/* ── C. Ringkasan ke agen utama tidak bisa mengecoh ─────────────────────── */

const catatan = await cdp.json(
  `return JSON.stringify((() => {
  const c = window.__ZEPHYR_SUBSET__.catatanTulis;
  return {
    mati: c([{ nama: 'riset', tulisDitolak: 2 }, { nama: 'kode' }]),
    hidup: c([{ nama: 'kode', fileDitulis: ['src/a.ts'] }]),
  };
})())`,
  30000,
);
const barisMati = String(catatan.mati).split('\n')[0];
const barisHidup = String(catatan.hidup).split('\n')[0];
console.log(`     ringkasan (gerbang mati): ${barisMati}`);
console.log(`     ringkasan (gerbang hidup): ${barisHidup}`);

R.check('C1', !tulisTerbuka
  ? /WRITE PERMISSION: OFF/.test(barisMati) && /No file was written/.test(catatan.mati) && /2 write attempt/.test(catatan.mati)
  : /WRITE PERMISSION: ON/.test(barisHidup),
  tulisTerbuka
    ? 'ringkasan menyatakan izin tulis HIDUP saat gerbangnya terbuka'
    : 'ringkasan menyatakan "no file was written" + jumlah penolakan (2), jadi "sudah ditulis" tidak bisa menyimpulkan sendiri');
R.check('C2', /WRITE PERMISSION: ON/.test(catatan.mati) === tulisTerbuka,
  'catatanTulis() hanya menyatakan izin hidup kalau gerbangnya memang hidup (tidak pernah mengaku padahal ditolak)');

/* ── D. Di layar: baris izin tulis di tab Subagents ─────────────────────── */

const bacaChip = async () =>
  await cdp.json(
    `return JSON.stringify((() => {
  const el = document.querySelector('[data-testid="sav-tulis"]');
  if (!el) return { ada: false };
  const t = el.querySelector('[data-testid="sav-tulis-teks"]');
  const a = el.querySelector('[data-testid="sav-tulis-alasan"]');
  const b = el.querySelector('[data-testid="sav-tulis-setelan"]');
  return {
    ada: true,
    bisaTulisDisk: el.getAttribute('data-bisa-tulis-disk'),
    setelan: el.getAttribute('data-setelan'),
    persetujuanAuto: el.getAttribute('data-persetujuan-auto'),
    teks: t ? t.textContent : null,
    alasan: a ? a.textContent : null,
    tombol: b ? b.textContent : null,
    adaTombol: !!b,
  };
})())`,
    20000,
  );

// Panel harus terlihat supaya tab-nya benar-benar dirender, lalu tab difokuskan.
const tampilkanSubagent = async () => {
  await cdp.eval('try { window.__ZEPHYR_TERM__.getState().setVisible(true); } catch (_) {} 1', 20000);
  await cdp.eval('window.__ZEPHYR_PANEL__.focusTab("subagents"); 1', 20000);
};

// Chip muncul setelah tab-nya merender; dipakai berulang di matriks F/G, jadi
// penantiannya satu tempat - bukan tiga salinan loop yang bisa lupa diubah.
/*
 * HMR memuat ulang halaman begitu ada berkas yang disimpan, dan saat itu
 * bridge-nya lepas sebentar. Itu bukan kerusakan - jadi tunggu lagi, jangan
 * gagal dengan "window.__ZEPHYR__ undefined".
 */
const pastikanBridge = async () => {
  await tungguBridge(cdp, '__ZEPHYR_SUBSET__');
};

const chipSampaiAda = async () => {
  await pastikanBridge();
  await tampilkanSubagent();
  let c = { ada: false };
  for (let i = 0; i < 25 && !c.ada; i++) {
    await sleep(200);
    c = await bacaChip();
  }
  return c;
};

const chip = await chipSampaiAda();

console.log(`     chip: ${chip.ada ? `${chip.teks} | ${chip.alasan ?? '(tanpa alasan)'}` : 'TIDAK ADA'}`);
R.check('D1', chip.ada === true,
  'tab Subagents memasang baris izin tulis (data-testid sav-tulis) - keadaannya terlihat di tempat kerjanya');
R.check('D2', chip.ada && chip.bisaTulisDisk === (tulisTerbuka ? 'ya' : 'tidak') &&
    chip.setelan === (awal.setelan ? 'ya' : 'tidak') &&
    chip.persetujuanAuto === (awal.mode === 'auto' ? 'ya' : 'tidak'),
  `chip melaporkan keadaan yang sama dengan gerbangnya (bisaTulisDisk=${chip.bisaTulisDisk}, setelan=${chip.setelan}, persetujuanAuto=${chip.persetujuanAuto})`);
/*
 * Teksnya TIDAK diperiksa dengan pola bahasa Inggris: UI ini 10 bahasa, dan
 * tes yang menuntut kata "Read-only" cuma lulus saat antarmukanya Inggris.
 * Yang diperiksa adalah daya-carinya: nama setelannya disebut saat setelannya
 * yang mati, dan mode persetujuan disebut saat justru gerbang keduanya yang
 * menutup. Dua-duanya tetap verbatim di semua bahasa.
 */
const kenapa = String(chip.alasan ?? '');
R.check('D3', chip.ada && (tulisTerbuka
  ? !chip.alasan && !!chip.teks
  : awal.setelan === false
    ? kenapa.includes('Allow subagents to write files')
    : /(^|[^A-Za-z])(Auto|Otomatis)([^A-Za-z]|$)/.test(kenapa)),
  tulisTerbuka
    ? 'chip menyatakan boleh menulis, tanpa baris alasan penolakan'
    : awal.setelan === false
      ? 'chip menyebut NAMA setelan yang harus dinyalakan (bukan "gagal menulis" tanpa sebab)'
      : 'setelan sudah menyala -> chip menyebut syarat kedua (mode Auto) sebagai sebab penolakannya');
R.check('D4', chip.adaTombol === true && /\S/.test(String(chip.tombol ?? '')),
  'ada tombol jalan ke setelannya (user tidak dilempar ke halaman yang harus dicari sendiri)');

// Tombolnya bukan hiasan: diklik, lalu seksi Setelan yang benar-benar terbuka
// dibaca dari store - bukan dari teks tombolnya.
if (chip.adaTombol) {
  await cdp.eval('window.__ZEPHYR_SETTINGS__.tutup(); 1', 20000);
  await sleep(150);
  await cdp.eval(`document.querySelector('[data-testid="sav-tulis-setelan"]').click(); 1`, 20000);
  await sleep(500);
  const setelahKlik = await cdp.json(
    `return JSON.stringify({ open: window.__ZEPHYR__.getState().settingsOpen === true, section: window.__ZEPHYR_SETTINGS__.section() })`,
    20000,
  );
  console.log(`     setelah klik tombol chip: settingsOpen=${setelahKlik.open} section=${setelahKlik.section}`);
  R.check('D5', setelahKlik.open === true && setelahKlik.section === 'subagent',
    'tombolnya benar-benar membuka seksi Subagent di Setelan (itulah jalan menyalakannya, bukan cuma teks)');
}

/* ── E. Di layar: sakelar + baris status di Setelan ─────────────────────── */

const bacaSetelan = async () => {
  await pastikanBridge();
  return await cdp.json(
    `return JSON.stringify((() => {
  const sw = document.querySelector('[data-testid="sub-allowwrite"]');
  const st = document.querySelector('[data-testid="sub-allowwrite-state"]');
  const body = document.body ? document.body.innerText : '';
  return {
    sakelarAda: !!sw,
    sakelarChecked: sw ? sw.getAttribute('aria-checked') : null,
    statusAda: !!st,
    statusTeks: st ? st.textContent : null,
    statusBisa: st ? st.getAttribute('data-bisa-tulis-disk') : null,
    adaKataAuto: /(^|[^A-Za-z])(Auto|Otomatis)([^A-Za-z]|$)/.test(body),
  };
})())`,
    20000,
  );
};

await cdp.eval('window.__ZEPHYR_SETTINGS__.buka("subagent"); 1', 20000);
let set = { sakelarAda: false, statusAda: false };
for (let i = 0; i < 25 && !(set.sakelarAda && set.statusAda); i++) {
  await sleep(200);
  set = await bacaSetelan();
}

console.log(`     setelan: sakelar=${set.sakelarChecked} status="${set.statusTeks}"`);
R.check('E1', set.sakelarAda === true,
  'sakelar allowWrite ada di halaman Setelan, seksi Subagent - user memang bisa menyalakannya');
R.check('E2', set.statusAda === true && set.statusBisa === (tulisTerbuka ? 'ya' : 'tidak') &&
    set.sakelarChecked === (awal.setelan ? 'true' : 'false'),
  `baris status melaporkan keadaan EFEKTIF (bisaTulisDisk=${set.statusBisa}) sementara sakelarnya berbunyi ${set.sakelarChecked} - dua hal berbeda yang dulu terlihat sama`);
R.check('E3', set.adaKataAuto === true,
  'halaman Setelan menyebut mode persetujuan Auto, jadi "sudah dinyalakan tapi tetap ditolak" ada penjelasannya di layar yang sama');

/* ── F/G. Matriks dua gerbang, hidup-hidup, lalu dipulihkan ─────────────── */

try {
  // Hanya kalau kita memang boleh mengubah setelan; sesi yang izin tulisnya
  // sudah menyala tidak perlu diapa-apakan.
  if (awal.setelan === false) {
    /* F/G-1: setelan ON, mode persetujuan BUKAN Auto - kasus yang dulu buntu. */
    await cdp.eval('window.__ZEPHYR__.getState().applySettings({ subagent: { allowWrite: true } }); 1', 20000);
    await cdp.eval(`window.__ZEPHYR_AI__.store.getState().setApprovalMode('work'); 1`, 20000);
    await sleep(500);

    const g1 = await bacaKeadaan();
    const chipG1 = await chipSampaiAda();
    const putusanG1 = await cdp.json(`return JSON.stringify(window.__ZEPHYR_SUBSET__.putusanTulis('write_file'))`, 20000);
    const catatanG1 = await cdp.json(
      `return JSON.stringify(window.__ZEPHYR_SUBSET__.catatanTulis([{ nama: 'kode', tulisDitolak: 3 }]))`,
      20000,
    );

    console.log(
      `     [setelan ON, mode=${g1.mode}] bisaTulis=${g1.k.bisaTulis} bisaTulisDisk=${g1.k.bisaTulisDisk} | chip="${chipG1.teks}" alasan="${String(chipG1.alasan ?? '-').slice(0, 90)}"`,
    );
    console.log(`     gerbang write_file: boleh=${putusanG1.boleh} alasan=${putusanG1.alasan ?? '-'}`);

    R.check('F1', g1.k.setelan === true && g1.k.bisaTulis === true,
      'setelannya benar-benar terbaca hidup oleh kemampuanTulis() saat dinyalakan');
    R.check('F2', g1.k.bisaTulisDisk === false && putusanG1.boleh === false && putusanG1.alasan === 'perlu-persetujuan',
      'setelan ON + mode persetujuan bukan Auto -> tulis disk DAN write_file tetap ditolak, dengan sebab "perlu-persetujuan"');
    R.check('F3', /WRITE PERMISSION: OFF/.test(catatanG1),
      'ringkasan tetap melaporkan izin tulis mati pada kombinasi ini - "sudah dinyalakan" tidak pernah terbaca "sudah ditulis"');
    R.check('F4', chipG1.setelan === 'ya' && chipG1.bisaTulisDisk === 'tidak' &&
        /(^|[^A-Za-z])(Auto|Otomatis)([^A-Za-z]|$)/.test(String(chipG1.alasan ?? '')),
      'chip di layar ikut berubah (setelan=ya) DAN menyebut mode Auto sebagai sebab penolakan - inilah kalimat yang dulu tidak ada');

    /* G-2: mode dikembalikan ke Auto -> kedua gerbang terbuka. */
    await cdp.eval(`window.__ZEPHYR_AI__.store.getState().setApprovalMode('auto'); 1`, 20000);
    await sleep(500);
    const g2 = await bacaKeadaan();
    const chipG2 = await chipSampaiAda();
    const putusanG2 = await cdp.json(`return JSON.stringify(window.__ZEPHYR_SUBSET__.putusanTulis('write_file'))`, 20000);

    console.log(`     [setelan ON, mode=${g2.mode}] bisaTulisDisk=${g2.k.bisaTulisDisk} | chip="${chipG2.teks}" adaTombol=${chipG2.adaTombol}`);
    R.check('G1', g2.k.bisaTulisDisk === true && putusanG2.boleh === true,
      'setelan ON + mode Auto -> kedua gerbang terbuka dan write_file boleh');
    R.check('G2', chipG2.bisaTulisDisk === 'ya' && /\S/.test(String(chipG2.teks ?? '')),
      'chip di layar ikut menyala tanpa reload - keadaan di UI dan gerbangnya bergerak bersama');
  } else {
    R.check('F1', true, 'setelan allowWrite sudah menyala di sesi ini - matriks ON tidak perlu diubah dari sini');
  }
} finally {
  if (awal.setelan === false) {
    await cdp.eval('window.__ZEPHYR__.getState().applySettings({ subagent: { allowWrite: false } }); 1', 20000);
    await cdp.eval(`window.__ZEPHYR_AI__.store.getState().setApprovalMode(${JSON.stringify(awal.mode)}); 1`, 20000).catch(() => {});
    await cdp.eval('window.__ZEPHYR_SETTINGS__.tutup(); 1', 20000).catch(() => {});
    await sleep(400);
    const akhir = await bacaKeadaan();
    console.log(`     dipulihkan: setelan=${akhir.setelan} mode=${akhir.mode} (semula setelan=${awal.setelan} mode=${awal.mode})`);
    R.check('F5', akhir.setelan === awal.setelan && akhir.mode === awal.mode,
      'setelan allowWrite DAN mode persetujuan dikembalikan persis seperti semula - harness tidak meninggalkan izin tulis menyala');
  }
}

await cdp.close();
R.selesai();
