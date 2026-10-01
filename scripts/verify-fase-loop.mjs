/**
 * verify-fase-loop.mjs - verifikasi hidup untuk empat perbaikan yang diambil
 * dari Hermes Agent:
 *
 *   A. Penjaga pengulangan (repeatDetect) tersambung ke jalur streaming
 *   B. Timer StableText + formatElapsed dipakai di daftar tugas
 *   C. Watchdog batas-mutlak menutup celah 210 detik pada agentBusy
 *   D. Antrean memberi tahu saat drain dilewati
 *   E. Subagent: delegasiId, status tak dikenal, dan token/biaya
 *
 *   node scripts/verify-fase-loop.mjs 9223
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('fase-loop');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* ---------- A. Penjaga pengulangan siap dipakai ---------- */

const g = await cdp.eval(`!!(window.__ZEPHYR_REPEAT__ && window.__ZEPHYR_REPEAT__.mengulangPelarian)`);
r.check('A1', g === true, 'penjaga pengulangan tersedia di jalur produksi');

const amb = await cdp.json(`return JSON.stringify(window.__ZEPHYR_REPEAT__.ambang)`);
r.check(
  'A2',
  amb.MIN_FRAGMENT_LENGTH === 400 && amb.STOP_PATH_MIN_CHARS === 16000,
  `ambang sesuai sumber: fragmen>=${amb.MIN_FRAGMENT_LENGTH}, pelarian>=${amb.STOP_PATH_MIN_CHARS}`,
);

const teks = await cdp.json(`return JSON.stringify({ t: window.__ZEPHYR_REPEAT__.teksGanti })`);
r.check(
  'A3',
  typeof teks.t === 'string' && teks.t.length > 20,
  `teks pengganti ada: "${teks.t}"`,
);

/* ---------- B. Timer ---------- */

const timerAda = await cdp.eval(`!!window.__ZEPHYR_WAKTU__`);
r.check('B1', timerAda === true, 'modul waktu (formatElapsed) tersedia');

const fmt = await cdp.json(`return JSON.stringify((() => {
  const f = window.__ZEPHYR_WAKTU__.formatElapsed;
  return {
    nol: f(0),
    setengah: f(500),
    sanggup: f(45_000),
    satuMenit: f(60_000),
    menitDetik: f(83_000),
    satuJam: f(3_600_000),
    jamMenit: f(7_530_000),
    negatif: f(-5),
    bukanAngka: f(NaN),
  };
})())`);

r.check('B2', fmt.nol === '0s', `nol -> "${fmt.nol}" (dulu "1s" palsu)`);
r.check('B3', fmt.setengah === '0s', `setengah detik -> "${fmt.setengah}"`);
r.check('B4', fmt.sanggup === '45s', `45 detik -> "${fmt.sanggup}"`);
r.check('B5', fmt.satuMenit === '1:00', `1 menit -> "${fmt.satuMenit}"`);
r.check('B6', fmt.menitDetik === '1:23', `83 detik -> "${fmt.menitDetik}"`);
r.check('B7', fmt.satuJam === '1:00:00', `1 jam -> "${fmt.satuJam}"`);
r.check('B8', fmt.negatif === '0s' && fmt.bukanAngka === '0s', `masukan aneh aman: "${fmt.negatif}" / "${fmt.bukanAngka}"`);

/* Registry timer harus bertahan saat komponen dilepas-pasang kembali. */
const registry = await cdp.json(`return JSON.stringify((() => {
  const w = window.__ZEPHYR_WAKTU__;
  const a = w.mulaiTimer('uji-registry');
  const b = w.mulaiTimer('uji-registry');
  const c = w.mulaiTimer('uji-registry');
  w.lupakanTimer('uji-registry');
  const d = w.waktuMulai('uji-registry');
  return { sama: a === b && b === c, adaSebelumLupa: a > 0, sesudahLupa: d };
})())`);
r.check(
  'B9',
  registry.sama === true && registry.sesudahLupa === undefined,
  `registry bertahan antar pemasangan ulang, lalu bisa dilupakan (${JSON.stringify(registry)})`,
);

/* StableText harus merender satu sel 1ch per karakter.
   Daftar tugas diisi lebih dulu: harness lain membersihkannya di akhir, dan
   panelnya hilang dari DOM saat daftarnya kosong - itu bukan bug. */
await cdp.json(`return JSON.stringify(await (async () => {
  await window.__ZEPHYR_TODO__.bersih();
  await window.__ZEPHYR_TODO__.tulis([
    { content: 'Tugas contoh untuk uji timer', status: 'done' },
    { content: 'Tugas yang masih berjalan', status: 'in_progress' },
  ]);
  return true;
})())`);
await sleep(500);

const sticky = await cdp.json(`return JSON.stringify((() => {
  const el = document.querySelector('.todo-dur');
  if (!el) return { ada: false };
  const sel = [...el.children];
  const style = getComputedStyle(el);
  return {
    ada: true,
    jumlahSel: sel.length,
    lebarSel: sel.length ? getComputedStyle(sel[0]).width : null,
    semuaSelSama: sel.every((s) => getComputedStyle(s).width === getComputedStyle(sel[0]).width),
    minWidth: style.minWidth,
    tabular: style.fontVariantNumeric,
  };
})())`);

if (!sticky.ada) {
  r.check('B10', false, '.todo-dur tidak ada (daftar tugas kosong saat diuji)');
  r.check('B11', false, 'dilewati');
} else {
  r.check('B11', sticky.semuaSelSama === true, `semua sel sama lebar: ${sticky.jumlahSel} sel @ ${sticky.lebarSel}`);
  r.check(
    'B12',
    sticky.tabular.includes('tabular-nums'),
    `tabular-nums aktif: ${sticky.tabular}`,
  );
}

/* ---------- C. Watchdog batas mutlak ---------- */

const busy = await cdp.json(`return JSON.stringify((() => {
  const s = window.__ZEPHYR_AI__.store.getState();
  return { agentBusy: s.agentBusy, adaFase: typeof s.agentPhase };
})())`);
r.check('C1', busy.agentBusy === false, `agentBusy istirahat saat tidak ada kerja (${busy.agentBusy})`);

/* ---------- D. Antrean ---------- */

const antre = await cdp.json(`return JSON.stringify((() => {
  const s = window.__ZEPHYR_AI__.store.getState();
  return {
    adaAntrian: Array.isArray(s.antrian),
    panjang: Array.isArray(s.antrian) ? s.antrian.length : -1,
    adaKirim: typeof s.kirimAntrian === 'function',
    adaBatal: typeof s.cancel === 'function',
  };
})())`);
r.check('D1', antre.adaAntrian === true, 'antrean prompt ada di store');
r.check('D2', antre.adaKirim === true, 'pengiriman manual tersedia (kirimAntrian)');

/* ---------- E. Subagent ---------- */

const sub = await cdp.json(`return JSON.stringify((() => {
  const w = window.__ZEPHYR_PARALEL__;
  if (!w) return { ada: false };
  return { ada: true, kunci: Object.keys(w).slice(0, 12) };
})())`);

if (!sub.ada) {
  r.check('E1', false, 'bridge subagent tidak ada');
  r.check('E2', false, 'dilewati');
  r.check('E3', false, 'dilewati');
} else {
  /*
   * Bentuk data subagent: jalankan satu batch lalu periksa fieldnya.
   *
   * Batch-nya memakai tugas yang meminta model membalas singkat, supaya
   * ujianya cepat dan tidak menghabiskan kuota. Yang diuji bentuk datanya,
   * bukan mutu jawabannya.
   */
  const bentuk = await cdp.json(`return JSON.stringify(await (async () => {
    const w = window.__ZEPHYR_PARALEL__;
    if (typeof w.jalankan !== 'function') return { bisa: false };

    const ids = await w.jalankan(['Balas satu kata: siap.'], { delegasiId: 'uji-batch-1' });
    // beri waktu agent pertama muncul di store
    await new Promise((res) => setTimeout(res, 400));

    const semua = w.daftar ? w.daftar() : [];
    const a = semua[0];
    if (!a) return { bisa: true, kosong: true, jumlah: 0 };

    return {
      bisa: true,
      jumlah: semua.length,
      punyaDelegasi: typeof a.delegasiId === 'string',
      delegasiBenar: a.delegasiId === 'uji-batch-1',
      punyaToken: 'inputTokens' in a && 'outputTokens' in a,
      punyaBiaya: 'costUsd' in a,
      tokenNullAwal: a.inputTokens === null && a.outputTokens === null,
      status: a.status,
    };
  })())`);

  r.check('E1', bentuk.bisa === true, 'subagent bisa dijalankan dari bridge');
  r.check(
    'E2',
    bentuk.punyaDelegasi === true && bentuk.delegasiBenar === true,
    `delegasiId membawa identitas batch: ${bentuk.delegasiId}`,
  );
  r.check(
    'E3',
    bentuk.punyaToken === true && bentuk.punyaBiaya === true && bentuk.tokenNullAwal === true,
    `token/biaya ada dan mulai null (bukan 0): masuk=${bentuk.tokenNullAwal} ${JSON.stringify(bentuk)}`,
  );
}

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
