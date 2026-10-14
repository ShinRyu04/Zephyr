/**
 * uji-zephyr-self.mjs - bukti `zephyr_self` memeriksa DIRI SENDIRI dari sumber
 * milik aplikasi, TANPA folder proyek terbuka.
 *
 * Item backlog `ai-tahu-100-3` (didukung `ai-tahu-100-4`): Zeph AI harus bisa
 * memeriksa dirinya sendiri (setelan, log, ekstensi, dokumen bundel, versi)
 * tanpa lebih dulu meminta folder user, tanpa jaringan, dan deterministik.
 *
 *   node scripts/uji-zephyr-self.mjs 9223
 *
 * Setiap nilai "nyata" di keluaran tool dibandingkan dengan yang dibaca harness
 * SENDIRI dari store / perintah Rust yang sama. Kalau tool mengarang, N-nya
 * jatuh - pembandingnya bukan teks yang ditulis ulang di sini.
 *
 * Bagian:
 *   S  statis   : berkas tool nol jaringan, tidak menambah siklus modul
 *   A  penawaran: terdaftar tepat sekali, aktif & bisa dipanggil saat workspace null
 *   B  nilai    : isi keluaran cocok dengan pembacaan harness sendiri (semua bagian)
 *   C  jaringan : nol fetch/XHR/WebSocket selama semua pemanggilan
 *   D  batas    : <=4 potongan, <=800 token/potongan, cache per sesi, deterministik
 *   E  negatif  : kueri/bagian ngawur menjawab kosong & jujur, bukan mengarang
 *   F  ringkasan: N/N + exit code
 */
import { readFileSync } from 'node:fs';
import { Cdp, keluarBersih, reporter, tungguBridge } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('zephyr_self tanpa workspace');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* ------------------------------------------------------------------ */
/* S - statis (sebelum app disentuh)                                   */
/* ------------------------------------------------------------------ */

const berkasTool = new URL('../src/lib/zephyrTools/zephyrSelf.ts', import.meta.url);
const sumber = readFileSync(berkasTool, 'utf8');
/* Komentar dibuang dulu: header berkas MENJELASKAN bahwa ia tidak memakai
   jaringan, dan kalimat penjelasan itu sendiri memuat kata "HTTP". */
const kode = sumber.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

R.check(
  'S1',
  !/fetch\s*\(|XMLHttpRequest|new WebSocket|sendBeacon|EventSource|navigator\.onLine|https?:\/\//.test(kode),
  'zephyrSelf.ts NOL jaringan: tidak ada fetch/XHR/WebSocket/sendBeacon/EventSource/URL http',
);
R.check(
  'S2',
  !/from '\.\.\/aiStore'|from '\.\.\/zephyrTools\/builtins'|from '\.\/builtins'/.test(sumber),
  'zephyrSelf.ts tidak mengimpor aiStore/builtins (tidak menambah siklus modul)',
);

const { cdp } = await Cdp.attach(PORT, 'Zephyr');
/* Jangan menyentuh setelan: harness ini tidak boleh mengubah keadaan app. */
cdp.snapshot = null;

/* Bridge dev dipasang beberapa saat SETELAH halaman selesai memuat, jadi di-POLL.
   Membacanya sekali lalu menyimpulkan "tidak ada" adalah balapan, bukan regresi. */
const siap = await tungguBridge(cdp, '__ZEPHYR__');
R.check('A0', siap, 'jembatan window.__ZEPHYR__ siap dipakai (di-poll sampai ada, bukan dibaca sekali)');
if (!siap) {
  R.selesai();
  await cdp.close();
  keluarBersih(1);
  await new Promise(() => {}); /* jangan lanjut kalau exit-nya belum sampai */
}

/* ------------------------------------------------------------------ */
/* A + B persiapan: tutup workspace, baca pembanding dari app          */
/* ------------------------------------------------------------------ */

const info = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/agentTools.ts');
  const cat = await import('/src/lib/zephyrTools/catalog.ts');
  const gate = await import('/src/lib/toolGate.ts');
  const cmd = await import('/src/lib/commands.ts');
  const zi = await import('/src/lib/zephyrIndeks.ts');
  const zc = await import('/src/lib/zephyrCari.ts');
  const ext = await import('/src/lib/extensionStore.ts');
  const S = window.__ZEPHYR__;

  const wsSebelum = S.getState().workspace || null;
  if (wsSebelum) {
    try { await S.getState().closeWorkspace(); } catch (e) { /* tetap lanjut */ }
    await wait(700);
  }
  const ws = S.getState().workspace || null;

  const namaSemua = m.AGENT_TOOLS.map(function (t) { return t.spec.name; });
  const entri = cat.TOOL_BY_NAME.get('zephyr_self') || null;
  /* aktif = Set<string> (lihat toolGate.ts:235). Array.prototype.slice.call(Set)
     SELALU [] -> cek A3 lama mustahil lulus. Ambil isinya dengan Array.from. */
  const aktif = Array.from(gate.useToolGate.getState().aktif);
  const specKirim = m.agentToolSpecs();
  const namaKirim = specKirim.map(function (s) { return (s && s.spec && s.spec.name) || (s && s.name) || '(?)'; });
  const spec = (m.AGENT_TOOLS.find(function (t) { return t.spec.name === 'zephyr_self'; }) || {}).spec || null;

  const jawab = await Promise.all([
    cmd.getAppInfo().catch(function () { return null; }),
    cmd.getDiagnostics().catch(function () { return null; }),
    cmd.mcpStatus().catch(function () { return null; }),
    cmd.extensionsList().catch(function () { return []; }),
    cmd.extensionsBundledIds().catch(function () { return []; }),
  ]);
  const ai = jawab[0], di = jawab[1], mcp = jawab[2], list = jawab[3], bundled = jawab[4];

  /* Pembanding yang dibaca harness SENDIRI dari store: nilai setelan efektif. */
  const set = S.getState().settings || {};
  const amb = function (o, p) {
    return p.split('.').reduce(function (x, k) { return x === null || x === undefined ? undefined : x[k]; }, o);
  };
  const setelanPembanding = [];
  ['general.theme', 'general.fontSize', 'general.uiLang', 'editor.tabSize', 'editor.wordWrap', 'models.activeProvider'].forEach(function (jalur) {
    const v = amb(set, jalur);
    if (v !== undefined && v !== null && v !== '') {
      setelanPembanding.push([jalur, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    }
  });

  /* Pembanding dokumen: nama berkas yang benar-benar ada di indeks bundel. */
  const dok = zi.FAKTA_INDEKS.filter(function (e) { return e[0] === 'dokumen'; });
  const dokNama = [];
  dok.forEach(function (e) {
    const n = String(e[1] || '').split('#')[0].trim();
    if (n && dokNama.indexOf(n) < 0) dokNama.push(n);
  });
  dokNama.sort();

  return {
    wsSebelum: wsSebelum,
    ws: ws,
    entri: entri,
    jumlahTabel: namaSemua.length,
    zephyrSelfDiTabel: namaSemua.filter(function (n) { return n === 'zephyr_self'; }).length,
    adaDiAktif: aktif.indexOf('zephyr_self') >= 0,
    jumlahAktif: aktif.length,
    namaKirim: namaKirim,
    ukuranKirim: JSON.stringify(specKirim).length,
    spec: spec,
    ref: {
      versiApp: (ai && ai.version) || (di && di.version) || null,
      dataDir: (ai && ai.dataDir) || null,
      logFile: (di && di.logFile) || null,
      mcpRunning: mcp ? !!mcp.running : null,
      mcpPort: mcp ? mcp.port : null,
      diagPort: di ? di.mcpPort : null,
      extJumlah: list.length,
      ext0: list.length > 0 ? list[0].id : null,
      extNama0: list.length > 0 ? list[0].name : null,
      bundledJumlah: bundled.length,
      versiIndeks: zi.FAKTA_VERSI.aplikasi,
      hashIndeks: zc.versiFakta().hashSumber,
      dokJumlah: dok.length,
      dokNama: dokNama.slice(0, 6),
      dokPembanding: dokNama.length > 0 ? dokNama[0] : null,
      setelanPembanding: setelanPembanding,
      storeEkstensi: ext.useExtensions.getState().list.length,
    },
    katalogGagal: cat.periksaKatalog(),
  };
})())`);

console.log(`     workspace sebelum uji : ${info.wsSebelum === null ? '(tidak ada folder)' : info.wsSebelum}`);
console.log(`     tabel tool            : ${info.jumlahTabel} tool terdaftar, ${info.jumlahAktif} aktif`);
console.log(`     dikirim tiap request  : ${info.namaKirim.length} tool, ${info.ukuranKirim} byte skema`);
console.log(`     zephyr_self di daftar-kirim: ${info.namaKirim.indexOf('zephyr_self') >= 0 ? 'ya' : 'TIDAK (dijangkau lewat tool_search + tool_call)'}`);
console.log(`     pembanding app        : versi ${info.ref.versiApp}, MCP ${info.ref.mcpRunning ? 'hidup port ' + info.ref.mcpPort : 'mati'}, ${info.ref.extJumlah} ekstensi, ${info.ref.dokJumlah} potongan dokumen`);

/* ------------------------------------------------------------------ */
/* A - penawaran & pemanggilan saat workspace === null                 */
/* ------------------------------------------------------------------ */

R.check('A1', info.ws === null, 'dijalankan dengan TIDAK ada folder terbuka (workspace === null)');
R.check('A2', info.zephyrSelfDiTabel === 1, `terdaftar tepat SEKALI di tabel tool agen (ditemukan ${info.zephyrSelfDiTabel}x dari ${info.jumlahTabel} tool)`);
R.check('A3', info.adaDiAktif, `tool AKTIF saat tanpa folder (${info.jumlahAktif} tool aktif)`);
R.check(
  'A4',
  !!info.entri && info.entri.source === 'builtin' && info.entri.effect === 'read' && info.entri.needsApproval === false && !!info.entri.group,
  'katalog: source=builtin, effect=read (tanpa efek samping), tanpa izin, punya satu grup',
);
R.check('A5', Array.isArray(info.katalogGagal) && info.katalogGagal.length === 0, `periksaKatalog() bersih (${JSON.stringify(info.katalogGagal)})`);

const bagianEnum = (((info.spec || {}).parameters || {}).properties || {}).bagian || {};
const enumV = Array.isArray(bagianEnum.enum) ? bagianEnum.enum : [];
const wajibBagian = ['setelan', 'log', 'ekstensi', 'docs', 'versi'];
const bagianHilang = wajibBagian.filter(function (b) { return enumV.indexOf(b) < 0; });
R.check('A6', !!info.spec && bagianHilang.length === 0, `spesifikasi model memuat bagian ${wajibBagian.join('|')} (hilang: ${bagianHilang.join(', ') || 'tidak ada'})`);
const props = (((info.spec || {}).parameters || {}).properties || {});
R.check('A7', !!props.kueri && !!props.maks, 'spesifikasi model memuat kueri (pencarian lokal) + maks (batas potongan)');

/* Jalur yang dipakai agen untuk MENEMUKAN tool: tool_search (untuk tool di luar
   daftar-kirim) atau daftar-kirim itu sendiri. Salah satu harus benar. */
const cari = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/agentTools.ts');
  try {
    const t = m.AGENT_TOOLS.find(function (x) { return x.spec.name === 'tool_search'; });
    const hasil = await t.run({ query: 'periksa zephyr sendiri setelan log ekstensi versi aplikasi', limit: 10 });
    return { ada: m.AGENT_TOOLS.some(function (x) { return x.spec.name === 'zephyr_self'; }), teks: String(hasil).slice(0, 400) };
  } catch (e) {
    return { ada: false, teks: 'error:' + String(e && e.message ? e.message : e) };
  }
})())`);
const diKirim = info.namaKirim.indexOf('zephyr_self') >= 0;
const lewatCari = /zephyr_self/.test(cari.teks);
R.check(
  'A8',
  diKirim || lewatCari,
  `ditawarkan ke model: ${diKirim ? 'langsung di daftar-kirim' : 'ditemukan tool_search'}${lewatCari ? ' (tool_search menemukannya)' : ''}`,
);

/* Pemanggilan lewat jalur agen yang sebenarnya, ditambah penghitung jaringan. */
const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/agentTools.ts');
  const S = window.__ZEPHYR__;

  let jaringan = 0;
  /* Catat URL-nya: tanpa ini, penghitung tak bisa membedakan permintaan milik
     zephyr_self dari lalu-lintas latar app (cek updater, MCP, HMR Vite). */
  const jejak = [];
  const catat = function (jenis, u) {
    jaringan++;
    if (jejak.length < 40) {
      let s = '';
      try { s = String(u && u.url ? u.url : (u && u.href ? u.href : u)); } catch (e) { s = '(tak terbaca)'; }
      jejak.push(jenis + ' ' + s.slice(0, 160));
    }
  };
  const fetchAsli = window.fetch;
  const xhrAsli = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
  const wsAsli = window.WebSocket;
  const beaconAsli = navigator.sendBeacon;
  window.fetch = function () { catat('fetch', arguments[0]); return fetchAsli.apply(window, arguments); };
  if (xhrAsli) window.XMLHttpRequest.prototype.open = function (m, u) { catat('xhr', u); return xhrAsli.apply(this, arguments); };
  if (wsAsli) window.WebSocket = function (u) { catat('ws', u); return new wsAsli(arguments[0], arguments[1]); };
  if (beaconAsli) navigator.sendBeacon = function (u) { catat('beacon', u); return beaconAsli.apply(navigator, arguments); };

  const potret = {};
  try {
    const bagian = ['setelan', 'log', 'ekstensi', 'docs', 'versi', 'fakta', 'semua'];
    for (let i = 0; i < bagian.length; i++) {
      const b = bagian[i];
      try {
        potret[b] = String(await m.jalankanAgentTool('zephyr_self', { bagian: b }));
      } catch (e) {
        potret[b] = 'ERROR:' + String(e && e.message ? e.message : e);
      }
    }
    potret.__workspace = S.getState().workspace || null;
  } finally {
    window.fetch = fetchAsli;
    if (xhrAsli) window.XMLHttpRequest.prototype.open = xhrAsli;
    if (wsAsli) window.WebSocket = wsAsli;
    if (beaconAsli) navigator.sendBeacon = beaconAsli;
  }
  return { potret: potret, jaringan: jaringan, jejak: jejak };
})())`);

const P = hasil.potret;

/* ------------------------------------------------------------------ */
/* B - nilai NYATA (dibandingkan pembacaan harness sendiri)            */
/* ------------------------------------------------------------------ */

/* Lalu-lintas yang terhitung = Tauri IPC lewat http://ipc.localhost/<cmd> (transport
   invoke() ke backend LOKAL, bukan internet). Yang wajib NOL = jaringan sungguhan.
   Dua angka dipisah supaya cek ini tidak bisa lulus karena buta. */
const jejakNet = hasil.jejak || [];
const lengkap = jejakNet.length >= hasil.jaringan;
const ipc = jejakNet.filter(function (j) { return j.indexOf('ipc.localhost') >= 0; });
const luar = jejakNet.filter(function (j) { return j.indexOf('ipc.localhost') < 0; });
const perintah = ipc.map(function (j) { return j.split('/').pop().split('?')[0].trim(); });
const readonlySah = ['get_app_info', 'get_diagnostics', 'mcp_status', 'get_settings', 'extensions_list', 'extensions_manifests', 'extensions_bundled_ids', 'ext_registry_installed', 'log_tail'];
const perintahAsing = perintah.filter(function (p) { return readonlySah.indexOf(p) < 0; });
console.log(`     jejak lalu-lintas     : total ${hasil.jaringan} | IPC lokal ${ipc.length} | luar ${luar.length}`);
luar.slice(0, 8).forEach(function (j) { console.log(`        LUAR  ${j}`); });
console.log(`     perintah IPC dipanggil: ${Array.from(new Set(perintah)).join(', ') || '(tak ada)'}`);
R.check('B0', lengkap && luar.length === 0, `nol permintaan jaringan SUNGGUHAN selama 7 pemanggilan (total ${hasil.jaringan}, semuanya transport IPC lokal ipc.localhost)`);
R.check('B0a', lengkap && perintahAsing.length === 0, `perintah IPC yang dipanggil semuanya baca-saja dari daftar sah (asing: ${perintahAsing.join(', ') || 'tidak ada'})`);
R.check('B0b', hasil.potret.__workspace === null, 'sampel keluaran diambil SAAT workspace masih null (bukan setelah app berubah)');

R.check(
  'B1',
  !!info.ref.versiApp && String(P.versi).indexOf('Versi aplikasi: ' + info.ref.versiApp) >= 0,
  `bagian=versi memuat versi app yang BENAR (${info.ref.versiApp}) sesuai get_app_info`,
);
R.check(
  'B2',
  info.ref.mcpRunning
    ? String(P.versi).indexOf('MCP: hidup - port ' + info.ref.mcpPort) >= 0
    : String(P.versi).indexOf('MCP: mati') >= 0,
  `bagian=versi memuat keadaan MCP NYATA (${info.ref.mcpRunning ? 'hidup di port ' + info.ref.mcpPort : 'mati'}) sesuai mcp_status`,
);
R.check(
  'B3',
  String(P.versi).indexOf('Indeks fakta bundel: versi ' + info.ref.versiIndeks) >= 0,
  `bagian=versi memuat versi indeks bundel (${info.ref.versiIndeks}) + hash ${info.ref.hashIndeks}`,
);

const setCocok = info.ref.setelanPembanding.filter(function (p) {
  return String(P.setelan).indexOf('- ' + p[0] + ' = ' + p[1]) >= 0;
});
R.check(
  'B4',
  info.ref.setelanPembanding.length > 0 && setCocok.length === info.ref.setelanPembanding.length,
  `bagian=setelan memuat nilai EFEKTIF yang sama dengan store (${setCocok.length}/${info.ref.setelanPembanding.length} kunci cocok)`,
);
R.check(
  'B5',
  !!info.ref.dataDir && String(P.setelan).indexOf('Berkas settings.json: ' + info.ref.dataDir) >= 0,
  `bagian=setelan menunjuk settings.json MILIK APP (dataDir ${info.ref.dataDir})`,
);

R.check(
  'B6',
  String(P.ekstensi).indexOf('Ringkasan: ' + info.ref.extJumlah + ' terdaftar') >= 0,
  `bagian=ekstensi melaporkan jumlah terdaftar yang sama dengan extensions_list (${info.ref.extJumlah})`,
);
R.check(
  'B7',
  !info.ref.ext0 || String(P.ekstensi).indexOf(info.ref.ext0) >= 0,
  `bagian=ekstensi memuat id ekstensi yang BENAR-BENAR terdaftar (${info.ref.ext0})`,
);
R.check(
  'B8',
  !!info.ref.logFile ? String(P.log).indexOf(info.ref.logFile) >= 0 : String(P.log).indexOf('(belum ada berkas)') >= 0,
  `bagian=log melaporkan berkas log NYATA dari get_diagnostics (${info.ref.logFile || '(belum ada berkas)'})`,
);
R.check(
  'B9',
  String(P.log).indexOf('log_tail') >= 0 &&
    /Isi log terakhir/.test(P.log) &&
    !/TIDAK TERBUNDEL/.test(P.log),
  'bagian=log membaca ISI baris log lewat perintah Rust log_tail (klaim lama "TIDAK TERBUNDEL" sudah hilang)',
);

/* B9b - pembanding INDEPENDEN: baris yang dikirim bagian=log harus BENAR-BENAR ada
   di ekor berkas log di disk. Harness membaca berkasnya SENDIRI (node fs), jadi
   kalau bagian=log mengarang baris log, cek ini jatuh. */
let b9bOk = false;
let b9bDetail = 'berkas log tidak diketahui (lihat B8)';
if (info.ref.logFile) {
  try {
    const isiDisk = readFileSync(info.ref.logFile, 'utf8').split(/\r?\n/);
    const dilaporkan = String(P.log)
      .split('\n')
      .filter((l) => l.indexOf('| ') === 0)
      .map((l) => l.slice(2));
    const cocok = dilaporkan.filter((l) =>
      isiDisk.some((x) => x.indexOf(l.slice(0, 60)) === 0 || l.indexOf(x.slice(0, 60)) === 0),
    );
    b9bOk = dilaporkan.length > 0 && cocok.length === dilaporkan.length;
    b9bDetail = `${dilaporkan.length} baris dilaporkan, ${cocok.length} ada di berkas log di disk (${info.ref.logFile})`;
  } catch (e) {
    b9bDetail = `gagal membaca berkas log di disk: ${e.message ?? e}`;
  }
}
R.check('B9b', b9bOk, `bagian=log: baris log yang dikirim BENAR ada di ekor berkas log app di disk (${b9bDetail})`);

R.check(
  'B10',
  info.ref.dokJumlah > 0 && String(P.docs).indexOf(String(info.ref.dokJumlah) + ' potongan dari') >= 0,
  `bagian=docs menghitung potongan dokumen bundel dari indeks yang sama (${info.ref.dokJumlah})`,
);
R.check(
  'B11',
  !info.ref.dokPembanding || String(P.docs).indexOf(info.ref.dokPembanding) >= 0,
  `bagian=docs menyebut berkas dokumen bundel yang BENAR (${info.ref.dokPembanding})`,
);
R.check(
  'B12',
  String(P.semua).indexOf('Zephyr ' + info.ref.versiApp) >= 0 && /TIDAK ADA folder terbuka/.test(P.semua),
  'bagian=semua melaporkan versi app + menyatakan tidak ada folder terbuka',
);
const semuaError = Object.keys(P).filter(function (k) { return String(P[k]).indexOf('ERROR:') === 0; });
R.check('B13', semuaError.length === 0, `tidak ada bagian yang melempar error (${semuaError.join(', ') || 'bersih'})`);

/* ------------------------------------------------------------------ */
/* D - batas potongan/token + cache + determinisme                     */
/* ------------------------------------------------------------------ */

const batas = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/agentTools.ts');
  const modul = await import('/src/lib/zephyrTools/zephyrSelf.ts');
  const baca = function (teks) {
    const m2 = /^ZEPHYR_SELF (\\{[^\\n]*\\})/.exec(teks);
    if (!m2) return null;
    try { return JSON.parse(m2[1]); } catch (e) { return null; }
  };
  const kepalaBuang = function (teks) {
    /* Header + peringatan BASI menempel di teks UTUH, bukan di dalam potongan,
       jadi harus dibuang dulu sebelum potongan diukur. */
    return teks
      .replace(/^ZEPHYR_SELF \\{[^\\n]*\\}\\n\\n/, '')
      .replace(/^PERINGATAN:[\\s\\S]*?\\n\\n/, '');
  };
  const potong = function (teks) { return kepalaBuang(teks).split('\\n\\n--- potongan berikutnya ---\\n\\n'); };

  modul.bersihkanCacheSesi();
  const penuh = await m.jalankanAgentTool('zephyr_self', { bagian: 'setelan', maks: 4 });
  const kecil = await m.jalankanAgentTool('zephyr_self', { bagian: 'setelan', maks: 2 });
  const satu = await m.jalankanAgentTool('zephyr_self', { bagian: 'setelan', maks: 1 });
  const nol = await m.jalankanAgentTool('zephyr_self', { bagian: 'setelan', maks: 0 });
  const jumbo = await m.jalankanAgentTool('zephyr_self', { bagian: 'setelan', maks: 99 });

  /* Cache: pemanggilan identik kedua harus mengembalikan byte yang SAMA dan
     tidak menambah entri cache baru. */
  const sebelum = modul.ukuranCacheSesi();
  const lagi = await m.jalankanAgentTool('zephyr_self', { bagian: 'setelan', maks: 4 });
  const sesudah = modul.ukuranCacheSesi();

  /* Determinisme: cache dibersihkan, dipanggil ulang - hasil harus identik. */
  modul.bersihkanCacheSesi();
  const ulangA = await m.jalankanAgentTool('zephyr_self', { bagian: 'ekstensi' });
  modul.bersihkanCacheSesi();
  const ulangB = await m.jalankanAgentTool('zephyr_self', { bagian: 'ekstensi' });
  modul.bersihkanCacheSesi();
  const versiA = await m.jalankanAgentTool('zephyr_self', { bagian: 'versi' });
  modul.bersihkanCacheSesi();
  const versiB = await m.jalankanAgentTool('zephyr_self', { bagian: 'versi' });

  const ringkas = function (teks) {
    const h = baca(teks);
    const p = potong(teks);
    return {
      header: h,
      potongan: p.length,
      tokenHeader: h && Array.isArray(h.token) ? Math.max.apply(null, h.token) : null,
      panjangPotongan: p.map(function (x) { return x.length; }),
      tokenNyata: p.map(function (x) { return Math.ceil(x.length / 4); }),
      adaPenandaPotong: /dipotong: batas potongan/.test(teks),
    };
  };
  return {
    penuh: ringkas(penuh),
    kecil: ringkas(kecil),
    satu: ringkas(satu),
    nol: ringkas(nol),
    jumbo: ringkas(jumbo),
    cacheSebelum: sebelum,
    cacheSesudah: sesudah,
    identikCache: penuh === lagi,
    ekstensiDeterministik: ulangA === ulangB,
    versiDeterministik: versiA === versiB,
    panjangSetelan: penuh.length,
  };
})())`);

R.check(
  'D1',
  batas.penuh.potongan <= 4 && batas.kecil.potongan <= 4 && batas.jumbo.potongan <= 4,
  `maksimum 4 potongan ditegakkan (maks=4 -> ${batas.penuh.potongan}, maks=2 -> ${batas.kecil.potongan}, maks=99 -> ${batas.jumbo.potongan})`,
);
R.check('D2', batas.kecil.potongan <= 2 && batas.satu.potongan === 1, `permintaan potongan dihormati (maks=2 -> ${batas.kecil.potongan}, maks=1 -> ${batas.satu.potongan})`);
R.check('D3', batas.nol.potongan === 1, `maks=0 tetap menghasilkan tepat 1 potongan (bukan kosong/ngawur): ${batas.nol.potongan}`);
const tokenMaks = Math.max.apply(null, [].concat(batas.penuh.tokenNyata, batas.kecil.tokenNyata, batas.satu.tokenNyata, batas.jumbo.tokenNyata));
R.check('D4', tokenMaks <= 800, `tiap potongan <= 800 token menurut aturan ai-tahu-100-7 (terbesar ${tokenMaks})`);
const tokenHeader = Math.max.apply(null, [batas.penuh.tokenHeader, batas.kecil.tokenHeader, batas.satu.tokenHeader, batas.jumbo.tokenHeader].filter(function (x) { return typeof x === 'number'; }));
R.check('D5', tokenHeader <= 800, `header melaporkan token per potongan yang konsisten (maks dilaporkan ${tokenHeader})`);
R.check(
  'D6',
  batas.satu.adaPenandaPotong || batas.penuh.potongan < 4,
  `pemotongan ditandai jujur, bukan dipangkas diam-diam (penanda: ${batas.satu.adaPenandaPotong}, potongan penuh: ${batas.penuh.potongan})`,
);
R.check('D7', batas.identikCache && batas.cacheSesudah === batas.cacheSebelum, `cache per sesi: pemanggilan identik mengembalikan byte sama tanpa entri baru (${batas.cacheSebelum} -> ${batas.cacheSesudah})`);
R.check('D8', batas.ekstensiDeterministik && batas.versiDeterministik, 'deterministik: setelah cache dibersihkan, keluaran identik byte-per-byte');

/* ------------------------------------------------------------------ */
/* E - kontrol negatif                                                 */
/* ------------------------------------------------------------------ */

const negatif = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/agentTools.ts');
  const modul = await import('/src/lib/zephyrTools/zephyrSelf.ts');
  const panggil = async function (args) {
    modul.bersihkanCacheSesi();
    try { return String(await m.jalankanAgentTool('zephyr_self', args)); }
    catch (e) { return 'ERROR:' + String(e && e.message ? e.message : e); }
  };
  const isiSaja = function (teks) {
    return teks.replace(/^ZEPHYR_SELF \\{[^\\n]*\\}\\n\\n/, '').replace(/^PERINGATAN:[\\s\\S]*?\\n\\n/, '');
  };
  const ngawur = 'zqxwvu-plugh-97531-ngawur';
  const docs = await panggil({ bagian: 'docs', kueri: ngawur });
  const fakta = await panggil({ bagian: 'fakta', kueri: ngawur });
  const setelan = await panggil({ bagian: 'setelan', kueri: ngawur });
  const ekstensi = await panggil({ bagian: 'ekstensi', kueri: ngawur });
  const bagianSalah = await panggil({ bagian: 'ngawur-total' });
  const docsLagi = await panggil({ bagian: 'docs', kueri: ngawur });
  return {
    docs: docs, fakta: fakta, setelan: setelan, ekstensi: ekstensi,
    bagianSalah: bagianSalah,
    docsStabil: docs === docsLagi,
    panjang: {
      docs: isiSaja(docs).length,
      fakta: isiSaja(fakta).length,
      setelan: isiSaja(setelan).length,
      ekstensi: isiSaja(ekstensi).length,
    },
  };
})())`);

R.check('E1', /Tidak ada potongan dokumen bundel yang cocok/.test(negatif.docs), 'bagian=docs + kueri ngawur: menjawab KOSONG, bukan mengarang isi dokumen');
R.check('E2', /Tidak ada fakta yang cocok/.test(negatif.fakta), 'bagian=fakta + kueri ngawur: menjawab KOSONG, bukan mengarang fakta');
R.check('E3', /Tidak ada baris setelan yang memuat/.test(negatif.setelan), 'bagian=setelan + kueri ngawur: tidak mengarang baris setelan');
R.check('E4', /Tidak ada baris ekstensi yang memuat/.test(negatif.ekstensi), 'bagian=ekstensi + kueri ngawur: tidak mengarang id ekstensi');
R.check('E5', /bagian tidak dikenal/.test(negatif.bagianSalah), 'bagian tidak dikenal ditolak dengan daftar yang benar, bukan ditebak');
R.check('E6', /[Jj]angan mengarang/.test(negatif.docs) && /[Jj]angan mengarang/.test(negatif.fakta), 'jawaban kosong menyuruh model TIDAK mengarang (bukan jawaban kosong tanpa penjelasan)');
R.check('E7', negatif.docsStabil, 'kontrol negatif deterministik (dua kali panggil -> byte sama)');
R.check(
  'E8',
  negatif.panjang.setelan < 700 && negatif.panjang.ekstensi < 700 && negatif.panjang.docs < 700,
  `jawaban kosong tetap ringkas, tidak membocorkan seluruh isi sebagai "hasil" (${JSON.stringify(negatif.panjang)})`,
);

/* ------------------------------------------------------------------ */
/* F - ringkasan                                                       */
/* ------------------------------------------------------------------ */

console.log(`     potongan terbesar     : ${tokenMaks} token (batas 800)`);
console.log(`     cache per sesi        : ${batas.cacheSebelum} entri, pemanggilan identik -> byte sama`);
console.log(`     jalur penawaran       : ${diKirim ? 'daftar-kirim' : 'tool_search'}${lewatCari ? ' + tool_search' : ''}`);

R.selesai();
await cdp.close();
/* `process.exit()` tidak menunggu stdout: kalau keluaran dialihkan ke berkas
   (persis yang dilakukan runner suite), baris LULUS/GAGAL yang masih di buffer
   HILANG dan run-nya hanya menyisakan "EXIT=1" tanpa sebab. */
keluarBersih(gagal ? 1 : 0);
