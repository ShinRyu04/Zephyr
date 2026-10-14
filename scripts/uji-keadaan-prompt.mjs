#!/usr/bin/env node
/*
 * uji-keadaan-prompt.mjs — bukti bahwa prompt yang BENAR-BENAR DIKIRIM ke
 * provider memuat KEADAAN RUNTIME app Zephyr sendiri (ai-tahu-100-2 +
 * ext-sadar tahap 2).
 *
 * Yang diukur, bukan yang diasumsikan:
 *   1. Halaman direload lewat CDP (kriteria 3a), lalu jembatan AI menunggu
 *      hidup lagi — supaya yang diuji bukan sisa keadaan halaman lama.
 *   2. Nilai acuan (versi app, port MCP, id ekstensi, setelan, panel, riwayat)
 *      diambil HARNESS SENDIRI dari store yang hidup di dalam app, lewat
 *      `runAsync` — bukan dari berkas, bukan dari potret yang sedang diuji.
 *   3. Satu giliran NYATA dikirim ke mock provider (kriteria 3b); prompt sistem
 *      yang diterima mock dibandingkan dengan nilai acuan tadi (kriteria 1).
 *   4. Panjang blok keadaan <= 3600 karakter dan bloknya menyebut dirinya
 *      potret sesaat bertanggal (kriteria 2).
 *   5. KONTROL NEGATIF (kriteria 3d): penanda hantu disuntikkan ke nilai store
 *      yang dibaca pengumpul potret. Kalau pembacanya benar, hantu itu HARUS
 *      muncul di prompt giliran berikutnya — dan HILANG lagi setelah store
 *      dipulihkan. Pembaca yang selalu melaporkan "tidak ada masalah" akan
 *      lolos semua pemeriksaan lain dan gagal tepat di sini.
 *   6. N/N + exit code (kriteria 3e).
 *
 * Pakai:  node scripts/uji-keadaan-prompt.mjs [portCDP=9223] [portMock=8098]
 * Keluar: 0 = semua lulus, 1 = ada yang gagal.
 *
 * CATATAN: harness ini butuh app Zephyr HIDUP (CDP) dan mengirim giliran nyata
 * ke mock provider. Jangan jalankan bersamaan dengan harness CDP lain — dua
 * harness yang menyentuh halaman yang sama saling merusak (kegagalan tabId /
 * "MCP is disabled" yang pernah terjadi). Satu harness, satu app, satu waktu.
 */
import { spawn } from 'node:child_process';
import { Cdp, reporter, keluarBersih, tungguBridge } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] || '9223';
const MOCK_PORT = process.argv[3] || '8098';
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const TEKS = 'Halo, bagaimana keadaanmu sekarang?';
const HANTU_ID = 'zephyr-hantu-uji-keadaan';
const HANTU_ALASAN = 'uji hantu: manifest sengaja dirusak';
const BATAS_BLOK = 3600;

const tunda = (ms) => new Promise((r) => setTimeout(r, ms));
const rep = reporter('UJI-KEADAAN-PROMPT');

/* ------------------------------------------------------------------ mock AI */

async function mockHidup() {
  try {
    const r = await fetch(`${MOCK}/__version`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

let anak = null;
if (!(await mockHidup())) {
  console.log(`(mock-ai belum hidup, diluncurkan sendiri di ${MOCK})`);
  anak = spawn(process.execPath, ['scripts/mock-ai.mjs', String(MOCK_PORT)], {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let i = 0; i < 40 && !(await mockHidup()); i++) await tunda(500);
}
if (!(await mockHidup())) {
  console.log(`GAGAL: mock AI tidak bisa diluncurkan di ${MOCK}`);
  keluarBersih(1);
}
const versiMock = (await (await fetch(`${MOCK}/__version`)).json()).version;
console.log(`mock-ai versi ${versiMock} hidup di ${MOCK}`);

const logBersih = async () => {
  await fetch(`${MOCK}/__reset`);
};
const logAmbil = async () => (await fetch(`${MOCK}/__log`)).json();

/* ---------------------------------------------------------------------- CDP */

let cdpSambung = null;
/* App bisa sedang di-restart (mis. harness lain menulis src/ lalu Vite memuat
   ulang halaman). Coba sambung berkali-kali dulu, baru menyerah dengan pesan
   jelas - bukan stack trace. */
for (let i = 0; i < 18 && !cdpSambung; i++) {
  try {
    cdpSambung = await Cdp.attach(CDP_PORT, ['Zephyr', 'localhost']);
  } catch (e) {
    const pesan = String((e && e.message) || e);
    console.log(`(CDP ${CDP_PORT} belum bisa disambung: ${pesan} - percobaan ${i + 1}/18)`);
    await tunda(5000);
  }
}
if (!cdpSambung) {
  console.log(`GAGAL: tidak bisa menyambung ke CDP ${CDP_PORT} selama ~90 detik - app Zephyr hidup?`);
  keluarBersih(2);
  process.exit(2);
}
const { cdp } = cdpSambung;
if (!(await tungguBridge(cdp, '__ZEPHYR_AI__', 40000))) {
  console.log('GAGAL: jembatan __ZEPHYR_AI__ tidak muncul (app hidup? halaman siap?)');
  await cdp.close();
  keluarBersih(1);
}

/** Nilai mentah dari blok async DI HALAMAN (string/boolean sederhana). */
const nilai = (src, ms = 120000) => cdp.runAsync(src, ms);
/** Blok DI HALAMAN yang berakhir `return JSON.stringify(...)`; di-parse di sini. */
const baca = async (src, ms = 120000) => JSON.parse(await cdp.runAsync(src, ms));

/** Prompt sistem dari body request yang diterima mock (OpenAI & Anthropic). */
function promptSistem(body) {
  if (!body) return '';
  if (Array.isArray(body.messages)) {
    const sys = body.messages.find((m) => m.role === 'system' || m.role === 'developer');
    if (sys) return typeof sys.content === 'string' ? sys.content : JSON.stringify(sys.content);
  }
  if (typeof body.system === 'string') return body.system;
  if (body.system) return JSON.stringify(body.system);
  return '';
}

/** Baris potret yang memuat sebuah kunci — pemeriksaan selalu DIBATASI ke baris
 *  ini, karena mencocokkan seluruh prompt menyesatkan: blok fakta statis memuat
 *  pola yang sama (mis. `answerStyle=short` ada di daftar bawaannya). */
function barisDengan(teks, kunci) {
  return teks.split('\n').find((l) => l.includes(kunci)) ?? '';
}

const potong = (teks, n = 1600) => (teks.length > n ? `${teks.slice(0, n)}\n… (${teks.length - n} karakter lagi)` : teks);

/* ============================ (a) RELOAD halaman =========================== */

const TANDA = '__UJI_KEADAAN_TANDA__';
await cdp.eval(`(() => { window.${TANDA} = 'halaman-lama'; return 1; })()`);
try {
  await cdp.eval(`(() => { setTimeout(() => location.reload(), 30); return 1; })()`);
} catch {
  /* konteks hancur = reload benar-benar terjadi; itu bukan kegagalan */
}
let tandaHilang = false;
for (let i = 0; i < 80; i++) {
  await tunda(400);
  let ada = 'string';
  try {
    ada = await cdp.eval(`typeof window.${TANDA}`);
  } catch {
    ada = 'undefined';
  }
  if (ada === 'undefined') {
    tandaHilang = true;
    break;
  }
}
const bridgeLagi = tandaHilang && (await tungguBridge(cdp, '__ZEPHYR_AI__', 45000));
rep.check('K1', bridgeLagi, 'halaman direload lewat CDP (jangkar halaman lama hilang) dan jembatan AI hidup lagi');

/* ===================== (c) nilai acuan DARI STORE app ====================== */

const FAKTA = `
  const cmd = await import('/src/lib/commands.ts');
  const mcpMod = await import('/src/lib/mcpStore.ts');
  const histMod = await import('/src/lib/historyStore.ts');
  const termMod = await import('/src/lib/terminalStore.ts');
  const st = window.__ZEPHYR__.getState();
  let info = st.appInfo;
  for (let i = 0; i < 20 && !info; i++) { await wait(400); info = window.__ZEPHYR__.getState().appInfo; }
  if (!info) info = await cmd.getAppInfo().catch(() => null);
  const mm = mcpMod.useMcp.getState();
  const man = await cmd.extensionsManifests().catch(() => []);
  const ada = (Array.isArray(man) ? man : []).filter((e) => e && e.manifest);
  const gagal = ada.find((e) => e.error) || null;
  const mati = ada.find((e) => e.enabled === false) || null;
  const pilih = gagal || mati || ada[0] || null;
  const m = pilih && pilih.manifest ? pilih.manifest : null;
  let panelTab = null;
  try { panelTab = window.__ZEPHYR_PANEL__.activeTab(); } catch { panelTab = null; }
  return JSON.stringify({
    versi: info ? info.version : '(belum diketahui)',
    mcpHidup: !!mm.status,
    mcpPort: mm.status ? mm.status.port : (st.settings && st.settings.mcp ? st.settings.mcp.port : null),
    extJumlah: Array.isArray(man) ? man.length : -1,
    extId: m ? m.id : null,
    extVersi: m ? m.version : null,
    extSebab: gagal ? 'gagal' : (mati ? 'dimatikan' : 'terpasang'),
    extAlasan: pilih && pilih.error ? String(pilih.error) : null,
    gayaJawab: st.settings && st.settings.models ? st.settings.models.answerStyle : null,
    bahasaJawab: st.settings && st.settings.models ? st.settings.models.answerLang : null,
    panelTab: panelTab,
    timeline: histMod.useHistory.getState().timeline.length,
    ssh: termMod.useTerminal.getState().allPanes().filter((p) => p.kind === 'ssh').length,
    sibuk: !!window.__ZEPHYR_AI__.store.getState().agentBusy,
  });
`;

const F = await baca(FAKTA);
console.log('acuan dari store app:', JSON.stringify(F));
rep.check(
  'K2',
  typeof F.versi === 'string' && F.versi.length > 0 && F.extJumlah >= 0,
  `acuan terbaca dari store hidup: versi ${F.versi}, port MCP ${F.mcpPort} (hidup=${F.mcpHidup}), ${F.extJumlah} manifest, ekstensi acuan ${F.extId} (${F.extSebab})`,
);
if (F.sibuk) {
  console.log('GAGAL: masih ada run agen berjalan — tunggu idle dulu, lalu ulangi.');
  await cdp.close();
  keluarBersih(1);
}

/* Setelan diarahkan ke mock (pola yang sudah terbukti di harness lain) supaya
   giliran benar-benar keluar dari app; cdp.close() memulihkannya di akhir. */
const SIAP = `
  const stz = window.__ZEPHYR__.getState();
  await window.__ZEPHYR_SET__.set({ models: { ...stz.settings.models, activeProvider: 'custom',
    providers: { ...(stz.settings.models?.providers ?? {}), custom: { baseUrl: '${MOCK}/v1', model: 'mock-model' } } } });
  await window.__ZEPHYR_SET__.setKey('custom', 'MOCK-KEY-KEADAAN');
  const A = window.__ZEPHYR_AI__.store;
  if (typeof A.getState().sinkronProvider === 'function') A.getState().sinkronProvider();
  A.setState({ provider: 'custom', model: 'mock-model' });
  await A.getState().loadKeys();
  if (typeof A.getState().newChat === 'function') A.getState().newChat();
  A.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });
  return JSON.stringify({ provider: A.getState().provider, model: A.getState().model,
    baseUrl: window.__ZEPHYR__.getState().settings.models?.providers?.custom?.baseUrl ?? null,
    busy: !!A.getState().agentBusy });
`;
const siap = await baca(SIAP);
console.log('siap:', JSON.stringify(siap));

/* ============================ satu giliran nyata =========================== */

async function giliran(nama) {
  await nilai(`
    const g = window.__ZEPHYR_AI__.store.getState();
    if (typeof g.newChat === 'function') g.newChat();
    return 'ok';
  `);
  await logBersih();
  const dikirim = await nilai(`
    try {
      window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TEKS)});
      return 'dikirim';
    } catch (e) { return 'GAGAL KIRIM: ' + String((e && e.message) || e); }
  `);
  if (dikirim !== 'dikirim') {
    console.log(`giliran ${nama}: ${dikirim}`);
    return { entri: null, prompt: '' };
  }
  let entri = null;
  for (let i = 0; i < 60; i++) {
    await tunda(500);
    const lg = await logAmbil();
    if (Array.isArray(lg) && lg.length) {
      entri = lg[lg.length - 1];
      break;
    }
  }
  for (let i = 0; i < 80; i++) {
    const sibuk = await nilai(`return !!window.__ZEPHYR_AI__.store.getState().agentBusy;`);
    if (!sibuk) break;
    await tunda(500);
  }
  return { entri, prompt: entri ? promptSistem(entri.body) : '' };
}

const g1 = await giliran('1 (keadaan nyata)');
const p1 = g1.prompt;
rep.check('K3', p1.length > 0, `prompt sistem diterima mock (${p1.length} karakter) — giliran benar-benar keluar dari app`);

/* Potret yang BERLAKU, DISUSUN ULANG di sisi harness dari store yang sama.
   Catatan (biang kegagalan run ke-3): `blokKeadaanRingkas()` membaca CACHE
   MODUL. `import()` dari harness bisa mendapat instance modul yang berbeda dari
   instance yang dipakai app, dan cache instance itu kosong - harness lalu
   menyimpulkan "potret 0 karakter" padahal blok yang dikirim ke provider penuh.
   Karena itu potret di sini disusun ulang lewat adapter yang sama
   (`kumpulkanDariApp` + `ringkasKeadaan(p, 900)`); store-nya tetap store hidup
   yang sama (zustand singleton per URL modul), jadi isinya keadaan app nyata. */
const POTRET = `
  const mod = await import('/src/lib/aiZephyrState.ts');
  const cmdMod = await import('/src/lib/commands.ts');
  const mcpMod2 = await import('/src/lib/mcpStore.ts');
  const p = await mod.kumpulkanDariApp();
  const teks = mod.ringkasKeadaan(p, 900);
  const sApp = window.__ZEPHYR__.getState();
  const mcpBasiAda = Object.prototype.hasOwnProperty.call(sApp, 'mcp');
  const m = sApp.mcp || {};
  const stLive = mcpMod2.useMcp.getState().status || null;
  const stRust = await cmdMod.mcpStatus().catch(() => null);
  return JSON.stringify({ teks, panjang: teks.length, cacheModul: mod.blokKeadaanRingkas(900).length,
    versi: p.versi ? p.versi.versi : null, jumlahEkstensi: p.ekstensi.length, gagalBaca: p.gagalBaca,
    /* Sumber ACUAN: jalur yang SAMA dengan adapter (mcp_status Rust + useMcp.status). */
    mcpHidup: { sumber: 'cmd.mcpStatus() + useMcp.status (jalur yang sama dengan adapter)',
      statusPort: stLive ? (stLive.port ?? null) : null, statusRunning: stLive ? !!stLive.running : null,
      rustPort: stRust ? (stRust.port ?? null) : null, rustRunning: stRust ? !!stRust.running : null,
      rustEnabled: stRust ? (stRust.enabled ?? null) : null,
      requestedPort: stRust ? (stRust.requestedPort ?? null) : null },
    /* Field warisan store.mcp SUDAH DIHAPUS 2026-10-13 (dulu tidak pernah
       ditulis siapa pun: tetap {enabled:false, running:false, port:9222}
       padahal MCP hidup di 9225 -> sumber "fakta" palsu). Sekarang dicatat
       hanya untuk memastikan ia benar-benar TIDAK ADA lagi. */
    mcpBasi: { ada: mcpBasiAda, nilai: mcpBasiAda ? { port: m.port ?? null, hidup: m.running ?? null, enabled: m.enabled ?? null } : null,
      portAdapter: p.mcp ? (p.mcp.port ?? null) : null, hidupAdapter: p.mcp ? (p.mcp.hidup ?? null) : null,
      portDimintaAdapter: p.mcp ? (p.mcp.portDiminta ?? null) : null } });
`;
const P = await baca(POTRET);
const potret = P.teks || '';
console.log(`\n--- potret keadaan yang berlaku, disusun ulang dari store app (${P.panjang} karakter) ---\n${potong(potret)}\n--- akhir potret ---\n`);

const KEPALA = '# Zephyr runtime state - snapshot taken';
const KEPALA_POTRET = 'ZEPHYR · KEADAAN RUNTIME';
const KEPALA_LIVE = "# Zephyr's live state";
/* Batas blok keadaan di dalam prompt yang BENAR-BENAR dikirim: dari kepalanya
   sampai judul bagian tetap berikutnya (`# How you work`). Dipakai untuk
   mengukur panjang blok apa adanya - bukan panjang yang dihitung di tempat lain. */
const batasBlok = (teks) => {
  const i0 = teks.indexOf(KEPALA);
  if (i0 < 0) return null;
  const i1 = teks.indexOf('\n# How you work', i0);
  return { i0, i1: i1 > i0 ? i1 : -1 };
};
/* Wilayah potret (`aiZephyrState`) saja di dalam prompt terkirim: berhenti
   sebelum blok live `zephyrRuntime.ts` yang menyusul di belakangnya. Semua
   pemeriksaan nilai dibatasi ke wilayah ini - mencocokkan seluruh prompt
   menyesatkan, blok fakta statis memuat pola yang sama. */
const wilayahPotret = (teks) => {
  const b = batasBlok(teks);
  if (!b) return '';
  const iPotret = teks.indexOf(KEPALA_POTRET, b.i0);
  if (iPotret < 0) return '';
  const iLive = teks.indexOf(KEPALA_LIVE, iPotret);
  const akhir = iLive > iPotret ? iLive : (b.i1 > iPotret ? b.i1 : teks.length);
  return teks.slice(iPotret, akhir);
};
const potretTerkirim = wilayahPotret(p1);
rep.check('K4', p1.includes(KEPALA), `prompt yang DIKIRIM memuat kepala blok keadaan "${KEPALA}"`);
console.log(
  `\n--- blok keadaan seperti yang DIKIRIM ke provider (potongan awal) ---\n${potong(p1.slice(p1.indexOf(KEPALA) < 0 ? 0 : p1.indexOf(KEPALA)), 1400)}\n--- akhir blok terkirim ---`,
);

const capWaktu = /snapshot taken (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(p1);
let umurMenit = null;
if (capWaktu) umurMenit = (Date.now() - Date.parse(capWaktu[1])) / 60000;
rep.check(
  'K5',
  !!capWaktu && umurMenit !== null && umurMenit >= -1 && umurMenit <= 20,
  `blok menyebut dirinya potret sesaat bertanggal: ${capWaktu ? capWaktu[1] : '(tidak ada cap waktu)'} (umur ${umurMenit === null ? '?' : umurMenit.toFixed(2)} menit)`,
);

rep.check(
  'K6',
  potret.length > 0 && P.jumlahEkstensi > 0,
  `potret keadaan tersusun dari store hidup (${P.panjang} karakter, ${P.jumlahEkstensi} ekstensi, sumber gagal baca: ${JSON.stringify(P.gagalBaca)})`,
);
const barisPotret = potret.split('\n').filter((l) => l.trim());
const hilangDiTerkirim = barisPotret.filter((l) => !potretTerkirim.includes(l));
rep.check(
  'K7',
  barisPotret.length > 0 && hilangDiTerkirim.length === 0,
  `prompt yang dikirim memuat potret yang disusun dari store app: ${barisPotret.length - hilangDiTerkirim.length}/${barisPotret.length} baris ketemu di wilayah potret yang terkirim` +
    (hilangDiTerkirim.length
      ? `; TIDAK ketemu mis. ${JSON.stringify(hilangDiTerkirim[0].slice(0, 120))}`
      : ` (identik kata-per-kata: ${potretTerkirim.trim() === potret.trim()})`),
);
const b1 = batasBlok(p1);
const blokTerkirim = b1 && b1.i1 > b1.i0 ? p1.slice(b1.i0, b1.i1) : '';
const panjangBlok = b1 && b1.i1 > b1.i0 ? b1.i1 - b1.i0 : 0;
rep.check(
  'K8',
  panjangBlok > 0 && panjangBlok <= BATAS_BLOK,
  `blok keadaan yang BENAR-BENAR dikirim ${panjangBlok} karakter (batas ${BATAS_BLOK}; = kepala + potret ${P.panjang} + blok live + riwayat/SSH)`,
);

/* Nilai acuan harness vs potret yang terkirim — semuanya dibatasi ke baris
   potret yang relevan, bukan ke seluruh prompt. */
const cekNilai = (id, kunci, nilai, label) => {
  const baris = barisDengan(potretTerkirim, kunci);
  const ok = !!nilai && baris.length > 0 && String(baris).includes(String(nilai));
  rep.check(id, ok, `${label}: potret terkirim memuat ${JSON.stringify(String(nilai))} — baris ${JSON.stringify(baris.slice(0, 150))}`);
  return baris;
};

cekNilai('K9', 'versi', F.versi, 'versi app (dibaca harness dari store)');
const barisGaya = barisDengan(potretTerkirim, String(F.gayaJawab ?? '\u0000'));
rep.check(
  'K10',
  !!F.gayaJawab && barisGaya.length > 0,
  `setelan yang sedang dipakai: ${JSON.stringify(F.gayaJawab)} (baris ${JSON.stringify(barisGaya.slice(0, 150))})`,
);
/* K11 - port MCP. Acuan HARUS dari jalur yang SAMA dengan adapter: mcp_status
   (Rust) + useMcp.status, dibaca sesudah giliran. Field `store.mcp` DULU
   warisan yang tidak pernah ditulis siapa pun (nilainya tetap
   {enabled:false, running:false, port:9222} - itu yang membuat K11 merah
   padahal potret sudah benar) dan sudah DIHAPUS 2026-10-13; `F.mcpPort` pun
   hanya port DIMINTA saat reload (MCP belum mengikat), jadi bukan acuan. */
const barisMcp = barisDengan(potretTerkirim, 'mcp');
const portDiPotret = (/(?:port\s+)(\d+)/.exec(barisMcp) || [])[1] || null;
const mk = P.mcpBasi || {};
const lv = P.mcpHidup || {};
/* Acuan hidup/mati + port = jalur adapter (mcp_status Rust + useMcp.status).
   `mk.*` (bekas field store.mcp) hanya dicatat untuk penjaga regresi K11b. */
const mcpBoleh = [lv.rustPort, lv.statusPort, lv.requestedPort, mk.portAdapter].filter((x) => x !== null && x !== undefined).map(String);
const hidupApp = lv.rustRunning ?? lv.statusRunning ?? (mk.hidupAdapter ?? null);
const kataHidup = /mcp:\s*(hidup|mati)/.exec(barisMcp);
const hidupCocok = hidupApp === null || !kataHidup || (kataHidup[1] === 'hidup') === !!hidupApp;
/* Port hanya disebut app saat MCP HIDUP (`mcp: hidup port 9222`). Saat MATI
   barisnya jujur tanpa angka, dan `(dimatikan)` muncul kalau setelannya sendiri
   yang mematikan (aiZephyrState.ts:525) - jadi menuntut angka di baris "mati"
   bukan memeriksa potret, melainkan memaksa app menyebut port yang tidak dipakai.
   Yang tetap diperiksa: baris mati hanya sah kalau acuan memang mati, dan tanda
   `(dimatikan)` harus cocok dengan setelan nyala/mati dari jalur yang sama. */
const nyalaApp = lv.rustEnabled ?? lv.statusEnabled ?? null;
const tanpaPortSah = kataHidup?.[1] === 'mati' && nyalaApp === false;
const portCocok = tanpaPortSah || (!!portDiPotret && mcpBoleh.includes(portDiPotret));
const tandaDimatikan = /\(dimatikan\)/.test(barisMcp) === (nyalaApp === false);
rep.check(
  'K11',
  barisMcp.length > 0 && portCocok && hidupCocok && tandaDimatikan,
  `port MCP: potret terkirim ${JSON.stringify(barisMcp.slice(0, 150))} — acuan hidup ${JSON.stringify(lv)} | port yang boleh ${JSON.stringify(mcpBoleh)} ` +
    `(port di potret=${portDiPotret}; tanpa port sah=${tanpaPortSah}; nyala setelan=${nyalaApp}; tanda (dimatikan) cocok=${tandaDimatikan}; ` +
    `bekas field store.mcp ada=${mk.ada} - tidak dipakai acuan; sebelum giliran F.mcpPort=${F.mcpPort}; hidup/mati cocok=${hidupCocok})`,
);
/* K11b - penjaga regresi: field warisan `store.mcp` (sumber fakta palsu yang
   membuat K11 merah) harus tetap TIDAK ADA di store. */
rep.check(
  'K11b',
  mk.ada === false,
  `field warisan store.mcp: ada=${mk.ada}${mk.nilai ? ` ${JSON.stringify(mk.nilai)}` : ''} - harus TIDAK ada; sumber angka MCP kini hanya mcp_status + useMcp.status`,
);
const barisExt = barisDengan(potretTerkirim, F.extId ?? '\u0000');
rep.check(
  'K12',
  !!F.extId && barisExt.length > 0,
  `ekstensi terpasang ${F.extId} v${F.extVersi} (${F.extSebab}) ada di potret terkirim: ${JSON.stringify(barisExt.slice(0, 170))}`,
);
if (F.extAlasan) {
  const cuplik = F.extAlasan.slice(0, 24);
  const barisAlasan = potretTerkirim.split('\n').find((l) => l.includes(cuplik)) ?? '';
  rep.check('K13', barisAlasan.length > 0, `alasan kegagalan ekstensi ikut: ${JSON.stringify(cuplik)} (baris ${JSON.stringify(barisAlasan.slice(0, 170))})`);
} else {
  rep.check(
    'K13',
    barisExt.length > 0,
    'ext19 sedang tidak punya ekstensi yang gagal, jadi alasan gagal dibuktikan lewat kontrol negatif hantu (K16/K17)',
  );
}
const barisEkstGagal = barisDengan(potretTerkirim, 'ekstensi gagal/tak dipakai');
rep.check(
  'K13b',
  barisEkstGagal.length === 0 || /\(\d+\)/.test(barisEkstGagal),
  `bagian "yang tidak bisa dipakai dan kenapa" ada di potret: ${JSON.stringify(barisEkstGagal.slice(0, 170) || '(tidak ada ekstensi bermasalah)')}`,
);
const barisLayout = potretTerkirim.split('\n').find((l) => /layout|panel/i.test(l)) ?? '';
rep.check(
  'K14',
  barisLayout.length > 0 && (!F.panelTab || barisLayout.includes(F.panelTab)),
  `layout/panel aktif ikut: ${JSON.stringify(barisLayout.slice(0, 170))} (panelTab store=${F.panelTab})`,
);
/* Riwayat & SSH datang dari `barisRiwayatSsh()` di perakit blok, jadi barisnya
   ada di blok keadaan penuh - bukan di wilayah potret. */
const barisHist = barisDengan(blokTerkirim, 'History & SSH');
rep.check(
  'K15',
  barisHist.includes(String(F.timeline)) && barisHist.includes(String(F.ssh)),
  `jumlah riwayat & SSH ikut di blok keadaan: ${JSON.stringify(barisHist.slice(0, 170))} (store: ${F.timeline} entri, ${F.ssh} pane SSH)`,
);

/* ================== (d) KONTROL NEGATIF: penanda hantu ==================== */

/* Bentuk hantu sengaja dipilih agar MUSTAHIL tidak tampil di potret: entri
   tanpa `manifest` masuk cabang `!m` di adapter (`kumpulkanDariApp`), yang
   mendorong ekstensi dengan `error` terisi; aturan pertama `nilaiEkstensi`
   (R1) lalu menghasilkan `manifest tidak bisa dibaca: <error>`. Jadi id DAN
   alasan hantu harus muncul di potret - kalau pembacanya tidak benar-benar
   membaca store, keduanya tidak akan muncul (itu kegagalan yang dicari). */
const HANTU = { path: HANTU_ID, manifest: null, enabled: false, error: HANTU_ALASAN };
const STORE_EXT19 = `
  const ext19 = window.__ZEPHYR_EXT19__;
  const st = ext19 && (typeof ext19.store === 'function' ? ext19.store() : (typeof ext19.getState === 'function' ? ext19 : null));
`;
const PASANG_HANTU = `
  ${STORE_EXT19}
  if (!st || typeof st.setState !== 'function') return JSON.stringify({ ok: false, sebab: 'bridge __ZEPHYR_EXT19__ tidak menyediakan store' });
  if (!window.__UJI_EXT19_ASLI__) window.__UJI_EXT19_ASLI__ = st.getState().manifests;
  st.setState({ manifests: [${JSON.stringify(HANTU)}] });
  const kini = st.getState().manifests;
  return JSON.stringify({ ok: kini.length === 1 && kini[0].path === ${JSON.stringify(HANTU_ID)} && kini[0].manifest === null,
    jumlah: kini.length, path: kini[0] ? kini[0].path : null });
`;
const PULIH_EXT19 = `
  ${STORE_EXT19}
  if (!st || typeof st.setState !== 'function') return JSON.stringify({ ok: false });
  st.setState({ manifests: window.__UJI_EXT19_ASLI__ ?? [] });
  return JSON.stringify({ ok: true, jumlah: st.getState().manifests.length });
`;

const pasang = await baca(PASANG_HANTU);
console.log('suntik hantu:', JSON.stringify(pasang));
rep.check('K16', !!pasang?.ok, 'penanda hantu tersuntik ke nilai store yang dibaca pengumpul potret (kontrol negatif disiapkan)');

const g2 = await giliran('2 (hantu di store)');
const p2 = g2.prompt;
const potret2 = wilayahPotret(p2);
const barisHantu = potret2.split('\n').find((l) => l.includes(HANTU_ID)) ?? '';
const hantuMuncul = !!pasang?.ok && potret2.includes(HANTU_ID) && potret2.includes(HANTU_ALASAN);
rep.check(
  'K17',
  hantuMuncul,
  `pembaca BENAR-BENAR membaca store: setelah store diubah, potret di prompt giliran berikutnya memuat ${HANTU_ID} + alasan hantunya — baris ${JSON.stringify(barisHantu.slice(0, 200))} (hantu ada di potret giliran 1=${wilayahPotret(p1).includes(HANTU_ID)})`,
);

const pulih = await baca(PULIH_EXT19);
const g3 = await giliran('3 (store dipulihkan)');
const p3 = g3.prompt;
const potret3 = wilayahPotret(p3);
rep.check(
  'K18',
  !!pulih?.ok && !potret3.includes(HANTU_ID) && p3.includes(KEPALA) && potret3.length > 0,
  `hantu HILANG lagi setelah store dipulihkan (${JSON.stringify(pulih)}) dan blok keadaan tetap ada di prompt (potret ${potret3.length} karakter)`,
);

const barisVersi3 = p3.split('\n').find((l) => l.startsWith('versi:')) ?? '';
rep.check(
  'K19',
  barisVersi3.includes(String(F.versi)),
  `giliran setelah pemulihan kembali membawa keadaan nyata: ${JSON.stringify(barisVersi3.slice(0, 150))}`,
);

/* (b) prompt TERKOMPOSISI dari halaman juga memuat potretnya. */
const LOKAL = `
  const mod = await import('/src/lib/aiZephyrState.ts');
  const p = await mod.kumpulkanDariApp();
  const teks = mod.ringkasKeadaan(p, 900);
  let sistem = '';
  try { sistem = window.__ZEPHYR_PROMPT__.system('en', '', ''); } catch (e) { sistem = 'GAGAL: ' + String((e && e.message) || e); }
  const baris = teks.split('\\n').filter((l) => l.trim());
  const hilang = baris.filter((l) => !sistem.includes(l));
  return JSON.stringify({ barisPotret: baris.length, hilang: hilang.length, contohHilang: hilang.slice(0, 2),
    kepalaAda: sistem.includes(${JSON.stringify(KEPALA)}), panjang: sistem.length });
`;
const L = await baca(LOKAL);
rep.check(
  'K20',
  !!L && L.barisPotret > 0 && L.hilang === 0 && !!L.kepalaAda,
  `prompt terkomposisi dari halaman (${L?.panjang} karakter) juga memuat potret keadaan + kepalanya: ${L?.barisPotret - L?.hilang}/${L?.barisPotret} baris potret ketemu${L?.hilang ? ` - hilang mis. ${JSON.stringify(L.contohHilang)}` : ''}`,
);

console.log(`\n=== contoh blok keadaan yang BENAR-BENAR dikirim (potret dari store app) ===\n${potong(potret)}\n=== akhir contoh ===`);

/* ------------------------------------------------------------------ bersih */

await cdp.close(); // memulihkan setelan/provider yang diarahkan ke mock
if (anak) {
  anak.kill();
  console.log('(mock-ai yang diluncurkan skrip ini dimatikan kembali)');
}
const { lulus, total } = rep.selesai();
console.log(`ringkasan: ${lulus}/${total} lulus; mock versi ${versiMock}; CDP ${CDP_PORT}`);
keluarBersih(lulus === total ? 0 : 1);
