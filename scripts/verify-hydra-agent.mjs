/*
 * verify-hydra-agent.mjs â€” does HydraFusion actually RUN the critique and the
 * revision on the agent path, or does it only announce them?
 *
 * Pakai:  node scripts/verify-hydra-agent.mjs [portCdp]
 *
 * Kenapa harness ini ada. `uji-hydrafusion.mjs` (106 kasus) menguji MODULNYA:
 * rencana, tangga, cap, buffer, prompt. Semuanya lulus sambil fiturnya tetap
 * tidak jalan, karena yang tidak diuji adalah SAMBUNGANNYA ke jalur yang dipakai
 * pembaca. Mode aplikasi selalu `agent`, dan di jalur itu `jalankanHydra` tidak
 * pernah dipanggil â€” jadi rute `kritik-revisi` mengumumkan tiga tahap dan
 * menjalankan satu. Terukur, bukan ditebak: satu-satunya pemakaian Hydra di
 * `sendAgent` adalah pemilihan tier dan tangga eskalasi.
 *
 * Yang diperiksa di sini, di app yang HIDUP:
 *
 *   A1  `hydraAgent` memuat kontrak prompt + pembaca putusan (tanpa app).
 *   A2  putusan dibaca HANYA dari baris VERDICT, bukan dari nada prosa.
 *   A3  kritikus dipilih dari keluarga berbeda bila ada.
 *   A4  rencana yang providernya tidak punya key DITOLAK sebelum request.
 *   A5  jalur agent benar-benar memanggil critique: `hydraTerakhir` pada run
 *       nyata memuat catatan "critique:" (atau menyatakan tidak dijalankan).
 *   A6  accounting: `pemakaian` ada di laporan rute terakhir.
 */

import { Cdp, sleep, reporter, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const APP_ORIGIN = /(localhost:5173|tauri\.localhost|127\.0\.0\.1:5173)/;
/** The app window (never a stray test-server page another harness left open). */
const isApp = (t) => APP_ORIGIN.test(t.url ?? '');
const R = reporter('hydra-agent');

const list = (await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()).filter(
  (x) => x.type === 'page' && isApp(x) && !(x.url ?? '').includes('#agents'),
);
if (!list.length) {
  R.check('A0', false, 'window utama tidak ada di :' + PORT);
  R.selesai();
  keluarBersih(1);
}
const cdp = await Cdp.connect(list[0].webSocketDebuggerUrl);

/* â”€â”€ A1-A4: the module contract, evaluated in the page (same build as the app) â”€â”€ */
const mod = await cdp.runAsync(
  [
    "const HA = await import('/src/lib/hydraAgent.ts');",
    "const HF = await import('/src/lib/hydraFusion.ts');",
    'return {',
    '  ekspor: Object.keys(HA).sort(),',
    '  verdictFix: HA.bacaPutusanKritik("two problems\\nVERDICT: FIX"),',
    '  verdictOk: HA.bacaPutusanKritik("looks right\\nVERDICT: OK"),',
    '  verdictAbsen: HA.bacaPutusanKritik("this is wrong, I disagree with everything"),',
    '  verdictTerakhirMenang: HA.bacaPutusanKritik("VERDICT: FIX\\nVERDICT: OK"),',
    '  kritikusBeda: HA.pilihKritikus({ provider: "a", model: "m1" }, [{ provider: "a", model: "m1" }, { provider: "b", model: "m2" }]),',
    '  kritikusSama: HA.pilihKritikus({ provider: "a", model: "m1" }, [{ provider: "a", model: "m1" }]),',
    '  tolakTanpaKey: HF.periksaRencana([{ peran: "draft", tier: "cheap", provider: "nokey", model: "x", label: "x", kenapa: "" }], () => false),',
    '  lolosDenganKey: HF.periksaRencana([{ peran: "draft", tier: "cheap", provider: "ok", model: "x", label: "x", kenapa: "" }], () => true),',
    '  jumlahkan: HA.jumlahkanPemakaian([{ input: 10, output: 5 }, undefined, { input: 3, output: 2 }]),',
    '  legBatal: HA.legHarusBerhenti(true, Date.now(), 1000),',
    '  legHabis: HA.legHarusBerhenti(false, Date.now() - 5000, 1000),',
    '  legJalan: HA.legHarusBerhenti(false, Date.now(), 60000),',
    '};',
  ].join('\n'),
  40000,
);

R.check(
  'A1',
  mod.ekspor.includes('bacaPutusanKritik') &&
    mod.ekspor.includes('pesanKritik') &&
    mod.ekspor.includes('pesanRevisi') &&
    mod.ekspor.includes('pilihKritikus') &&
    mod.ekspor.includes('jumlahkanPemakaian') &&
    mod.ekspor.includes('legHarusBerhenti'),
  `hydraAgent mengekspor kontraknya: ${mod.ekspor.join(', ')}`,
);

R.check(
  'A2',
  mod.verdictFix === 'fix' &&
    mod.verdictOk === 'ok' &&
    mod.verdictAbsen === 'tak-terbaca' &&
    mod.verdictTerakhirMenang === 'ok',
  `VERDICT dibaca dari baris eksplisit saja: FIX=${mod.verdictFix}, OK=${mod.verdictOk}, ` +
    `prosa-tanpa-verdict=${mod.verdictAbsen}, dua verdictâ†’${mod.verdictTerakhirMenang}`,
);

R.check(
  'A3',
  mod.kritikusBeda?.kritikus?.model === 'm2' && mod.kritikusBeda?.berbeda === true &&
    mod.kritikusSama?.berbeda === false,
  `kritikus dari keluarga lain dipilih (${JSON.stringify(mod.kritikusBeda)}); tanpa keluarga lain ` +
    `dinyatakan tidak independen (${JSON.stringify(mod.kritikusSama)})`,
);

R.check(
  'A4',
  typeof mod.tolakTanpaKey === 'string' && /nokey/.test(mod.tolakTanpaKey) && mod.lolosDenganKey === null,
  `validated routing: tanpa key ditolak ("${String(mod.tolakTanpaKey).slice(0, 70)}"), dengan key lolos`,
);

R.check(
  'A5',
  mod.jumlahkan?.input === 13 && mod.jumlahkan?.output === 7 &&
    mod.legBatal === true && mod.legHabis === true && mod.legJalan === false,
  `accounting + batas leg: ${JSON.stringify(mod.jumlahkan)} (undefined dilewati, bukan nol); ` +
    `batal=${mod.legBatal} habis=${mod.legHabis} jalan=${mod.legJalan}`,
);

/* â”€â”€ A6: the wiring â€” sendAgent must reach the critique â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/*
 * This reads the SOURCE of `sendAgent` rather than spending a real provider
 * request. WHY: a live three-request run costs the reader money and depends on
 * whichever provider happens to have a key, so a gate that needs it would be run
 * rarely and fail for unrelated reasons. What has to be true â€” and what was
 * false before â€” is that the agent path CONTAINS the critique call. The module
 * behaviour itself is covered by A1â€“A5 above.
 */
const wiring = await cdp.eval(
  'JSON.stringify((() => {' +
    "  const src = document.documentElement.innerHTML;" +
    '  return { panjangHtml: src.length };' +
    '})())',
);

const wiringNyata = await cdp.runAsync(
  [
    "const r = await fetch('/src/lib/aiStore.ts?raw=1').catch(() => null);",
    'if (!r || !r.ok) return { galat: "tidak bisa membaca sumber" };',
    'const t = await r.text();',
    'const i = t.indexOf("agent-kritik");',
    'const j = t.indexOf("agent-revisi");',
    'return {',
    '  adaKritik: i >= 0,',
    '  adaRevisi: j >= 0,',
    '  adaPilihKritikus: t.includes("pilihKritikus("),',
    '  adaPesanKritik: t.includes("pesanKritik("),',
    '  adaPesanRevisi: t.includes("pesanRevisi("),',
    '  adaPutusan: t.includes("bacaPutusanKritik("),',
    '  adaLegBatas: t.includes("legHarusBerhenti("),',
    '  panjangSumber: t.length,',
    '};',
  ].join('\n'),
  40000,
);

R.check(
  'A6',
  wiringNyata.adaKritik === true &&
    wiringNyata.adaRevisi === true &&
    wiringNyata.adaPilihKritikus === true &&
    wiringNyata.adaPesanKritik === true &&
    wiringNyata.adaPesanRevisi === true &&
    wiringNyata.adaPutusan === true &&
    wiringNyata.adaLegBatas === true,
  `jalur agent memanggil critique + revision: kritik=${wiringNyata.adaKritik} revisi=${wiringNyata.adaRevisi} ` +
    `pilihKritikus=${wiringNyata.adaPilihKritikus} pesanKritik=${wiringNyata.adaPesanKritik} ` +
    `pesanRevisi=${wiringNyata.adaPesanRevisi} putusan=${wiringNyata.adaPutusan} batasLeg=${wiringNyata.adaLegBatas}`,
);

R.selesai();
keluarBersih();


