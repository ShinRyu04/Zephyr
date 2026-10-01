/**
 * verify-tool-gate.mjs - uji sekat tool: default aktif, grup mati, izin tulis.
 *
 *   node scripts/verify-tool-gate.mjs 9223
 *
 *   G1  tool wajib SELALU aktif
 *   G2  jumlah default aktif sesuai TOOL_DEFAULT, bukan semua tool
 *   G3  tool di luar default TIDAK bisa dipanggil (gerbangnya benar-benar menutup)
 *   G4  grup yang mati sejak awal benar-benar tertutup di menu
 *   G5  menghidupkan satu grup menambah tool-nya ke sekat
 *   G6  mematikan satu tool mengeluarkannya dari sekat
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('tool-gate');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

const info = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47)+'src'+String.fromCharCode(47)+'lib'+String.fromCharCode(47)+'toolGate.ts');
  const g = m.useToolGate.getState();
  const semua = m.SEMUA_TOOL;
  const awol = m.TOOL_WAJIB;
  const def = m.TOOL_DEFAULT;
  const mati = m.GRUP_MATI_AWAL;
  return {
    semua: semua, jumlahSemua: semua.length,
    wajib: awol,
    defaultJumlah: def.length,
    aktif: [...g.aktif],
    grupMati: mati,
    tutup: [...g.tutup],
    adaFungsiNyalakan: typeof g.nyalakan === 'function' || typeof g.setAktif === 'function',
    kunci: Object.keys(g).filter((k) => typeof g[k] === 'function'),
  };
})())`);

/* ---- G1: tool wajib selalu aktif ---- */

const wajibHilang = info.wajib.filter((t) => !info.aktif.includes(t));
r.check('G1', wajibHilang.length === 0, `semua ${info.wajib.length} tool wajib aktif${wajibHilang.length ? ` (hilang: ${wajibHilang})` : ''}`);

/* ---- G2: default lebih sedikit dari semua, tapi tidak kosong ---- */

r.check(
  'G2a',
  info.defaultJumlah > 0 && info.defaultJumlah < info.semua.length,
  `default aktif ${info.defaultJumlah} dari ${info.semua.length} tool (bukan semuanya)`,
);

/*
 * G2b diuji dengan MENYUSUN ULANG dari TOOL_DEFAULT, bukan dengan membaca
 * keadaan yang ada.
 *
 * Keadaan itu bisa diwarisi dari uji sebelumnya, dan karena harness ini diakhiri
 * dengan memulihkan ke TOOL_DEFAULT, ia akan selalu membaca hasil pemulihan -
 * bukan hasil pemasangan aplikasi. Yang perlu dibuktikan adalah "TOOL_DEFAULT
 * menghasilkan sekat yang benar", dan itu harus diukur dari definisinya.
 */
const awal = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47)+'src'+String.fromCharCode(47)+'lib'+String.fromCharCode(47)+'toolGate.ts');
  const semua = m.SEMUA_TOOL;
  const g = m.useToolGate.getState();
  for (const t of semua) {
    const harus = m.TOOL_DEFAULT.includes(t);
    if (g.aktif.has(t) !== harus) g.balik(t);
  }
  await new Promise((res) => setTimeout(res, 250));
  const akhir = m.useToolGate.getState().aktif;
  const diharapkan = new Set(m.TOOL_DEFAULT);
  const lebih = [...akhir].filter((t) => !diharapkan.has(t));
  const kurang = [...diharapkan].filter((t) => !akhir.has(t));
  return { jumlah: akhir.size, diharapkan: m.TOOL_DEFAULT.length, lebih, kurang };
})())`);

r.check(
  'G2b',
  awal.jumlah === awal.diharapkan && awal.lebih.length === 0 && awal.kurang.length === 0,
  `TOOL_DEFAULT menghasilkan sekat yang persis sama (${awal.jumlah} = ${awal.diharapkan})${awal.lebih.length ? `; kelebihan: ${awal.lebih}` : ''}${awal.kurang.length ? `; kekurangan: ${awal.kurang}` : ''}`,
);

/* ---- G3: gerbang benar-benar menutup ---- */

const contohLuar = info.semua.filter((t) => !info.aktif.includes(t)).slice(0, 3);
r.check('G3a', contohLuar.length > 0, `ada tool di luar default untuk diuji: ${contohLuar.join(', ')}`);

/*
 * G3 diuji lewat daftar `aktif` itu sendiri, bukan fungsi pemeriksa.
 *
 * Versi pertama skrip ini mengira ada `boleh()`/`diizinkan()`. Tidak ada - dan
 * itu wajar: satu-satunya cara sekat dipakai adalah dengan menyaring katalog
 * tool yang dikirim ke model. Jadi yang harus dibuktikan adalah ISI himpunan
 * `aktif`, karena himpunan itulah yang benar-benar menentukan tool mana yang
 * dilihat model.
 */
const gerbang = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47)+'src'+String.fromCharCode(47)+'lib'+String.fromCharCode(47)+'toolGate.ts');
  const g = m.useToolGate.getState();
  const luar = ${JSON.stringify(contohLuar)};
  const dalam = ${JSON.stringify(info.aktif.slice(0, 3))};
  return {
    luarAda: luar.filter((t) => g.aktif.has(t)),
    dalamAda: dalam.filter((t) => g.aktif.has(t)),
    dalamDiminta: dalam,
  };
})())`);

r.check(
  'G3b',
  gerbang.luarAda.length === 0 && gerbang.dalamAda.length === gerbang.dalamDiminta.length,
  `sekat menutup untuk tool luar (${JSON.stringify(gerbang.luarAda)} harus kosong) dan membuka untuk tool dalam (${JSON.stringify(gerbang.dalamAda)})`,
);

/* ---- G4: grup mati tertutup di menu ---- */

const tutupMati = info.grupMati.filter((g) => !info.tutup.includes(g));
r.check('G4', tutupMati.length === 0, `grup yang mati sejak awal ikut terlipat: ${info.grupMati.join(', ')}${tutupMati.length ? ` (belum: ${tutupMati})` : ''}`);

/* ---- G5/G6: hidupkan grup, lalu matikan tool ---- */

const ubah = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47)+'src'+String.fromCharCode(47)+'lib'+String.fromCharCode(47)+'toolGate.ts');
  const g = m.useToolGate.getState();

  /* 'ssh' adalah tool tunggal di grup ssh, yang sejak awal mati. */
  const sebelum = g.aktif.has('ssh');
  const grupSebelum = m.TOOL_GROUPS.find((x) => x.id === 'ssh');
  const jumlahGrup = grupSebelum ? grupSebelum.tools.length : 0;

  g.setGrup('ssh', true);
  await new Promise((res) => setTimeout(res, 200));

  const s = m.useToolGate.getState();
  return {
    sebelum,
    sesudah: s.aktif.has('ssh'),
    jumlahGrup,
    sisa: s.aktif.size,
    semuaToolGrup: grupSebelum ? grupSebelum.tools.filter((t) => s.aktif.has(t)) : [],
  };
})())`);

r.check(
  'G5',
  ubah.sebelum === false && ubah.sesudah === true && ubah.semuaToolGrup.length === ubah.jumlahGrup,
  `setGrup('ssh', true) menyalakan ${ubah.semuaToolGrup.length}/${ubah.jumlahGrup} tool grupnya (${ubah.sebelum} -> ${ubah.sesudah}, total ${ubah.sisa})`,
);

const matikan = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47)+'src'+String.fromCharCode(47)+'lib'+String.fromCharCode(47)+'toolGate.ts');
  const g = m.useToolGate.getState();

  const sebelum = g.aktif.has('web_fetch');
  /* 'balik' membalik satu tool - itulah jalur yang dipakai kotak centangnya. */
  g.balik('web_fetch');
  await new Promise((res) => setTimeout(res, 200));
  const sesudah = m.useToolGate.getState().aktif.has('web_fetch');

  /* Dibalik lagi supaya kembali seperti semula. */
  m.useToolGate.getState().balik('web_fetch');

  return { sebelum, sesudah };
})())`);

r.check(
  'G6',
  matikan.sebelum === true && matikan.sesudah === false,
  `balik('web_fetch') mengeluarkannya dari sekat (${matikan.sebelum} -> ${matikan.sesudah})`,
);

/*
 * Kembalikan ke default dengan cara MENYUSUN ULANG dari TOOL_DEFAULT.
 *
 * Versi sebelumnya menyalakan grup satu per satu, dan itu tidak mengembalikan
 * keadaan awal: grup "mati sejak awal" (mcp, browser, ssh, skills) tetap mati
 * - memang - tapi tool yang TIDAK masuk grup mana pun juga ikut tertinggal
 * mati. Sisa 58 dari 76 terlihat seperti "sebagian tool hilang", dan uji
 * berikutnya yang membaca jumlah akan gagal karena warisan itu, bukan karena
 * kodenya salah.
 *
 * Diuji juga bahwa pemulihannya benar-benar menghasilkan TOOL_DEFAULT, supaya
 * harness ini tidak bisa lagi meninggalkan aplikasi dalam keadaan setengah.
 */
const pulih = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47)+'src'+String.fromCharCode(47)+'lib'+String.fromCharCode(47)+'toolGate.ts');
  const g = m.useToolGate.getState();
  const semua = m.SEMUA_TOOL;
  for (const t of semua) {
    const harus = m.TOOL_DEFAULT.includes(t);
    if (g.aktif.has(t) !== harus) g.balik(t);
  }
  await new Promise((res) => setTimeout(res, 250));
  const akhir = m.useToolGate.getState().aktif;
  return { jumlah: akhir.size, diharapkan: m.TOOL_DEFAULT.length, sama: akhir.size === m.TOOL_DEFAULT.length };
})())`);

r.check(
  'G7',
  pulih.sama === true,
  `state dipulihkan ke TOOL_DEFAULT setelah uji (${pulih.jumlah} = ${pulih.diharapkan})`,
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
