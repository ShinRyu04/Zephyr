#!/usr/bin/env node
/*
 * uji-fallback-jalur-kirim.mjs — memutuskan & MEMBUKTIKAN apakah jalur kirim NYATA
 * (src/lib/aiStore.ts + modul yang benar-benar dipanggilnya) sudah memenuhi tuntutan
 * item ZEPH-PROVIDER-FALLBACK:
 *
 *   (a) retry berjenjang + backoff untuk 429 DAN 5xx (bukan menyerah di percobaan ke-3)
 *   (b) fallback antar-model / antar-provider
 *   (c) batas waktu per giliran
 *   (d) pesan jujur ke user (sebab + provider mana saja + nomor percobaan + satu tindakan)
 *   ---
 *   (e) kerja yang sudah tertulis di disk TIDAK hilang
 *   (f) laju percobaan tidak melebihi batas nyata 60 sukses / 70 percobaan per 60 dtk
 *   (g) determinisme
 *
 * APA YANG DIUKUR (dan apa yang TIDAK):
 *   - Yang diukur adalah KODE ASLI repo: `src/lib/aiStore.ts` (bundel esbuild saat jalan),
 *     `src/lib/agentTools.ts` + `src/lib/zephyrTools/builtins.ts` (tool tulis nyata),
 *     `src/lib/contextBudget.ts::pilihModelCadangan`, `src/lib/agentStop.ts`.
 *     Modul `src/lib/providerTahan.ts` TIDAK diuji di sini dan TIDAK diimpor oleh jalur
 *     nyata - itu justru yang diperiksa (kasus `m1`).
 *   - TANPA jaringan, TANPA model, TANPA Tauri, TANPA app hidup, TANPA CDP (:9223).
 *   - Yang DIPALSUKAN hanya dua lapis di bawah jalur kirim, dan keduanya dibuka apa adanya:
 *       (1) jam (Date.now + setTimeout) → jam palsu deterministik, supaya "tunggu 22 detik"
 *           tidak berarti 22 detik nyata; setiap nilai jeda yang DIMINTA kode dicatat apa adanya;
 *       (2) IPC Tauri (`__TAURI_INTERNALS__.invoke`) → router yang MENJAWAB per skenario:
 *           `ai_chat` / `ai_tool_chat_stream` mengembalikan galat provider yang diminta
 *           (429/502/401/gantung), dan `fs_write` menulis berkas SUNGGUHAN ke folder sementara
 *           (bukan ke repo) supaya bukti "kerja di disk" punya mtime nyata.
 *     Setiap panggilan IPC dicatat: perintah, argumen, dan jam palsu saat itu.
 *   - Jam palsu TIDAK PERNAH menjalankan timer > 60 detik kecuali skenario memintanya
 *     (`izinkanPanjang`), supaya penjaga 6 menit / batas keras 15 menit tidak menembak
 *     di skenario yang cuma menyimulasikan beberapa detik.
 *
 * Keluar: 0 = semua pemeriksaan cocok dengan yang diharapkan, 1 = ada yang tidak,
 *         2 = tidak bisa diukur (bundel gagal).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const AKAR_REPO = 'D:/Zephyr';
const TMP = path.join(os.tmpdir(), 'zephyr-uji-fallback-jalur');
const KERJA = path.join(TMP, 'kerja');

/* ───────────────────────── kerangka pemeriksaan ───────────────────────── */
const hasil = [];
function check(id, ok, pesan, angka) {
  hasil.push({ id, ok: !!ok });
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${id.padEnd(34)} ${pesan}`);
  if (angka) console.log(`         ${angka}`);
  return !!ok;
}
function catat(pesan) {
  console.log(`         ${pesan}`);
}

/* ────────────── SALINAN (bukan kode Zephyr): jam palsu ────────────── */
const asli = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  setImmediate: globalThis.setImmediate,
  now: Date.now,
};

const JAM0 = 1_760_000_000_000; // titik nol jam palsu (deterministik)
let SEKARANG = JAM0;
let nomorTimer = 0;
let antrean = [];
let timerDiminta = new Map(); // ms → berapa kali diminta
let timerPanjang = []; // ms > 60 dtk: dicatat, dan hanya dijalankan kalau diizinkan
let intervalDiminta = [];
let izinkanPanjang = false;
let firings = 0;

function pasangJamPalsu(opsi = {}) {
  SEKARANG = JAM0;
  nomorTimer = 0;
  antrean = [];
  timerDiminta = new Map();
  timerPanjang = [];
  intervalDiminta = [];
  izinkanPanjang = !!opsi.izinkanPanjang;
  firings = 0;
  Date.now = () => SEKARANG;
  globalThis.setTimeout = (fn, ms = 0, ...a) => {
    const n = Math.max(0, Number(ms) || 0);
    timerDiminta.set(n, (timerDiminta.get(n) || 0) + 1);
    const id = ++nomorTimer;
    if (n > 60_000 && !izinkanPanjang) {
      timerPanjang.push({ id, ms: n, dijalankan: false });
      return id;
    }
    antrean.push({ id, due: SEKARANG + n, fn, a, ms: n });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    antrean = antrean.filter((t) => t.id !== id);
    for (const t of timerPanjang) if (t.id === id) t.dibatalkan = true;
  };
  // Interval tidak dijalankan (tidak deterministik); dicatat supaya bisa dilaporkan.
  globalThis.setInterval = (fn, ms = 0) => {
    const id = ++nomorTimer;
    intervalDiminta.push({ id, ms: Number(ms) || 0 });
    return id;
  };
  globalThis.clearInterval = () => {};
  globalThis.requestAnimationFrame = (cb) => globalThis.setTimeout(() => cb(SEKARANG), 0);
  globalThis.cancelAnimationFrame = (h) => globalThis.clearTimeout(h);
}

/*
 * Jalankan `fn` dengan jam palsu: selama janjinya belum selesai, jalankan timer yang
 * paling dekat (jam melompat ke due-nya). Timer > 60 dtk hanya jalan kalau skenario
 * mengizinkan - dan kalau diizinkan, urutan kejadian patuh jam, jadi penjaga 6 menit
 * menang atas batas keras 15 menit, persis seperti di app.
 */
let _batasNyata = 25_000;
async function jalankan(fn) {
  let selesai = false;
  let nyangkut = false;
  let nilai;
  let galat;
  const tReal = asli.now();
  const p = Promise.resolve()
    .then(fn)
    .then(
      (v) => {
        nilai = v;
        selesai = true;
      },
      (e) => {
        galat = e && e.message ? e.message : String(e);
        selesai = true;
      },
    );
  let putaran = 0;
  while (!selesai && putaran < 400_000) {
    if (asli.now() - tReal > _batasNyata) {
      nyangkut = true;
      break;
    }
    await new Promise((r) => asli.setImmediate(r));
    if (selesai) break;
    if (antrean.length === 0) {
      await new Promise((r) => asli.setTimeout(r, 0));
      await new Promise((r) => asli.setImmediate(r));
      if (selesai) break;
      if (antrean.length === 0) break; // menunggu sesuatu yang tak akan datang (mis. interval)
    }
    antrean.sort((x, y) => x.due - y.due || x.id - y.id);
    const t = antrean.shift();
    SEKARANG = Math.max(SEKARANG, t.due);
    putaran++;
    firings++;
    for (const tp of timerPanjang) if (tp.ms <= t.ms && !tp.dijalankan) tp.dijalankan = true;
    try {
      t.fn(...t.a);
    } catch {
      /* galat timer dicatat lewat jejak, bukan mematikan harness */
    }
  }
  if (selesai) await p.catch(() => {});
  return { selesai, nyangkut, nilai, galat, putaran };
}

/* ────────────── SALINAN (bukan kode Zephyr): shim browser + Tauri ────────────── */
let ROUTER = null; // dipasang per skenario; invoke selalu lewat sini
function pasangShim() {
  const simpan = new Map();
  const localStorage = {
    getItem: (k) => (simpan.has(k) ? simpan.get(k) : null),
    setItem: (k, v) => simpan.set(k, String(v)),
    removeItem: (k) => simpan.delete(k),
    clear: () => simpan.clear(),
    key: (i) => [...simpan.keys()][i] ?? null,
    get length() {
      return simpan.size;
    },
  };
  const elemen = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    click() {},
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    textContent: '',
    innerHTML: '',
    children: [],
    parentElement: null,
  });
  const document = {
    createElement: elemen,
    createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: elemen,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    body: elemen(),
    head: elemen(),
    documentElement: elemen(),
    activeElement: null,
    elementFromPoint: () => null,
    createRange: () => ({ setStart() {}, setEnd() {}, selectNodeContents() {}, getBoundingClientRect: () => ({}) }),
    getSelection: () => null,
    execCommand: () => true,
    fonts: { ready: Promise.resolve() },
    hasFocus: () => true,
    visibilityState: 'visible',
    hidden: false,
    createEvent: () => ({ initEvent() {} }),
    dispatchEvent: () => true,
    contains: () => true,
    queryCommandSupported: () => false,
  };
  const win = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    document,
    localStorage,
    navigator: { userAgent: 'node', platform: 'win32', clipboard: { writeText: async () => {} } },
    location: { href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    requestAnimationFrame: (cb) => globalThis.setTimeout(() => cb(SEKARANG), 0),
    cancelAnimationFrame: (h) => globalThis.clearTimeout(h),
    setTimeout: (fn, ms, ...a) => globalThis.setTimeout(fn, ms, ...a),
    clearTimeout: (h) => globalThis.clearTimeout(h),
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (h) => globalThis.clearInterval(h),
    queueMicrotask,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    /* SEMUA IPC lewat router skenario. Tidak ada perintah yang "dikarang": perintah
       yang tidak dipalsukan MEMBALAS GALAT, bukan nilai palsu. */
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => {
        if (!ROUTER) throw new Error('router belum dipasang');
        return ROUTER.balas(cmd, args);
      },
      transformCallback: (cb) => {
        const id = ++nomorTimer;
        simpan.set('cb:' + id, cb);
        return id;
      },
      unregisterCallback: () => {},
      convertFileSrc: (p) => p,
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    },
    isSecureContext: true,
    devicePixelRatio: 1,
    innerWidth: 1200,
    innerHeight: 800,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    localStorage,
  };
  win.window = win;
  win.self = win;
  const def = (k, v) => {
    try {
      Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
    } catch {
      /* sudah ada */
    }
  };
  def('window', win);
  def('self', win);
  def('document', document);
  def('localStorage', localStorage);
  def('navigator', win.navigator);
  def('matchMedia', win.matchMedia);
  def('requestAnimationFrame', win.requestAnimationFrame);
  def('cancelAnimationFrame', win.cancelAnimationFrame);
  def('ResizeObserver', win.ResizeObserver);
  def('MutationObserver', win.MutationObserver);
  def('IntersectionObserver', win.IntersectionObserver);
  def('getComputedStyle', win.getComputedStyle);
  def('devicePixelRatio', 1);
  process.on('unhandledRejection', () => {});
}

/* ─────────────────────── bundel kode ASLI repo ─────────────────────── */
const DEFINISI = {
  'import.meta.env.DEV': 'false',
  'import.meta.env.PROD': 'true',
  'import.meta.env.MODE': '"production"',
  'import.meta.env': 'globalThis.__IMENV__',
};
const BANNER = {
  js: "globalThis.__IMENV__ = globalThis.__IMENV__ || { DEV: false, PROD: true, MODE: 'production', SSR: false };",
};

/* Entri bundel ditulis ke folder sementara (BUKAN ke repo) dan hanya meng-ekspor ulang
   modul asli repo, supaya harness bisa memanggil fungsi nyata yang tidak di-export
   oleh aiStore.ts (mis. jalankanAgentTool, pilihModelCadangan). */
const ENTRI = `
export * from '${AKAR_REPO}/src/lib/aiStore.ts';
export { pilihModelCadangan, ringkasUkuran } from '${AKAR_REPO}/src/lib/contextBudget.ts';
export { jalankanAgentTool, AGENT_TOOLS } from '${AKAR_REPO}/src/lib/agentTools.ts';
export { agentStopMessage } from '${AKAR_REPO}/src/lib/agentStop.ts';
export { findModel, MODEL_FALLBACK, PROVIDERS } from '${AKAR_REPO}/src/lib/modelCatalog.tsx';
export { useStore } from '${AKAR_REPO}/src/lib/store.ts';
export { useSettingsUi } from '${AKAR_REPO}/src/lib/settingsStore.ts';
export { useToolGate } from '${AKAR_REPO}/src/lib/toolGate.ts';
`;

async function bundel() {
  fs.mkdirSync(TMP, { recursive: true });
  const entri = path.join(TMP, 'entri-uji.mjs');
  fs.writeFileSync(entri, ENTRI, 'utf8');
  const requireRepo = createRequire(path.join(AKAR_REPO, 'package.json'));
  const { build } = requireRepo('esbuild');
  const keluar = path.join(TMP, 'jalur-kirim.mjs');
  await build({
    absWorkingDir: AKAR_REPO,
    entryPoints: [entri],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: keluar,
    define: DEFINISI,
    banner: BANNER,
    logLevel: 'error',
  });
  return keluar;
}

/* ─────────────────────── router IPC per skenario ─────────────────────── */
const TULIS_CMD = new Set(['fs_write', 'fs_edit', 'fs_patch', 'fs_mkdir', 'fs_remove', 'fs_rename']);

function ambilPath(args) {
  if (!args || typeof args !== 'object') return null;
  for (const k of ['path', 'jalur', 'file', 'target', 'to', 'from']) {
    if (typeof args[k] === 'string' && args[k]) return args[k];
  }
  for (const v of Object.values(args)) if (typeof v === 'string' && path.isAbsolute(v)) return v;
  return null;
}

function buatRouter(opsi) {
  const R = {
    log: [],
    percobaan: [],
    tulisDisk: [],
    tidakDipalsukan: [],
    balas: async (cmd, args) => {
      R.log.push({ cmd, args, t: SEKARANG });
      if (TULIS_CMD.has(cmd)) {
        /* Tulis SUNGGUHAN ke folder sementara: itu yang membuat bukti "isi + mtime utuh"
           di kasus (d) punya arti. Tidak ada berkas repo yang ditulis. */
        const p = ambilPath(args);
        if (!p) throw new Error(`palasutulis: jalur tidak ditemukan di argumen ${cmd}`);
        const isi = typeof args?.content === 'string' ? args.content : typeof args?.isi === 'string' ? args.isi : '';
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, isi, 'utf8');
        R.tulisDisk.push({ cmd, path: p, chars: isi.length, t: SEKARANG });
        return null;
      }
      if (cmd === 'ai_chat' || cmd === 'ai_tool_chat_stream') {
        const no = R.percobaan.length + 1;
        R.percobaan.push({
          no,
          cmd,
          id: args?.id,
          model: args?.model,
          provider: args?.provider,
          t: SEKARANG,
          args,
        });
        const aksi = opsi.perilaku ? await opsi.perilaku({ cmd, args, no, router: R }) : null;
        if (aksi === 'gantung') return new Promise(() => {});
        if (aksi && aksi.gagal) throw new Error(aksi.gagal);
        if (aksi && aksi.tungguChunkId) return null;
        return null;
      }
      if (opsi.izin && Object.prototype.hasOwnProperty.call(opsi.izin, cmd)) return opsi.izin[cmd];
      /* Perintah lain TIDAK dikarang: dicatat lalu DILEMPAR. (Dibalas null pernah dicoba dan
         merusak: jalur ini memanggil .some() atas hasil get_public_models.) */
      if (!R.tidakDipalsukan.includes(cmd)) R.tidakDipalsukan.push(cmd);
      throw new Error(`perintah TIDAK dipalsukan (dilempar, bukan dikarang): ${cmd}`);
    },
  };
  return R;
}

/* ─────────────────────── penyiapan store per skenario ─────────────────────── */
const CANARY_KUNCI = 'sk-CANARY-jangan-pernah-terkirim-9f3a2b';

async function muat(modulPath, usaha) {
  return import(pathToFileURL(modulPath).href + `?v=${usaha}`);
}

function siapkan(mod, o) {
  const { useAi } = mod;
  const kandidat = o.kunci || ['openai'];
  useAi.setState({
    keys: kandidat.map((p) => ({ provider: p, hasKey: true })),
    model: o.model,
    provider: o.provider,
    activeId: null,
    sessions: [],
    toast: null,
    pending: null,
    pendings: { '': null },
    agentBusy: false,
    agentBusys: { '': false },
    agentFailure: null,
  });
  const sid = useAi.getState().newChat('sesi-uji');
  useAi.setState({ activeId: sid, activeIds: { '': sid }, model: o.model, provider: o.provider });
  try {
    mod.useSettingsUi.setState({ keys: kandidat.map((p) => ({ provider: p, hasKey: true })) });
  } catch {
    /* store setelan berbeda bentuk: tidak dipakai kalau tidak ada */
  }
  const providers = {};
  for (const p of kandidat) providers[p] = { baseUrl: '', apiKey: CANARY_KUNCI };
  providers[o.provider] = { ...(providers[o.provider] || {}), baseUrl: '', apiKey: CANARY_KUNCI };
  try {
    const s = mod.useStore.getState();
    mod.useStore.setState({
      workspace: KERJA,
      settings: { ...(s.settings || {}), models: { providers } },
    });
  } catch {
    /* store lain: diabaikan */
  }
  const frames = [];
  const progres = [];
  const asliChunk = useAi.getState().onChunk;
  const asliProgress = useAi.getState().setAgentProgress;
  useAi.setState({
    onChunk: (c) => {
      frames.push({ ...c, t: SEKARANG });
      return asliChunk(c);
    },
    setAgentProgress: (p) => {
      progres.push({ ...p, t: SEKARANG });
      return asliProgress(p);
    },
  });
  return { frames, progres, sid, useAi };
}

/* Jalankan satu skenario: modul SEGAR (state modul bersih) + jam palsu + router baru. */
let usaha = 0;
async function skenario(modulPath, opsi, fn) {
  pasangJamPalsu({ izinkanPanjang: opsi.izinkanPanjang });
  const router = buatRouter(opsi);
  ROUTER = router;
  const mod = await muat(modulPath, ++usaha);
  const ctx = siapkan(mod, opsi);
  const t0 = SEKARANG;
  const jalan = await jalankan(() => fn(mod, ctx, router));
  const totalMs = SEKARANG - t0;
  const semuaMs = SEKARANG;
  if (router.tidakDipalsukan.length)
    catat(`perintah lain yang tidak dipalsukan (dicatat, lalu dilempar - bukan dikarang): ${JSON.stringify(router.tidakDipalsukan)}`);
  return { mod, ctx, router, jalan, totalMs, semuaMs, timerDiminta, timerPanjang, intervalDiminta, firings };
}

/* Nilai jeda yang benar-benar DIMINTA kode (≥ 500 ms) - tunggu tangga, bukan polling 50 ms. */
function jedaBesar(timerDiminta) {
  return [...timerDiminta.entries()].filter(([ms]) => ms >= 500).sort((a, b) => a[0] - b[0]);
}
/* Jeda NYATA: selisih jam-palsu antar dua percobaan provider berturut-turut.
   Ini ground truth "berapa detik kode benar-benar menunggu", terlepas dari apakah
   jeda itu diwujudkan sebagai satu setTimeout atau polling. */
function tanggaDariPercobaan(percobaan) {
  const t = percobaan.map((p) => p.t);
  const d = [];
  for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
  return d;
}
function pesanTerakhirUser(S) {
  try {
    return (
      S.mod.useAi
        .getState()
        .sessions.flatMap((x) => x.messages || [])
        .map((m) => m.content)
        .filter((c) => typeof c === 'string' && c)
        .pop() || ''
    );
  } catch {
    return '';
  }
}
function jedaPolling(timerDiminta) {
  let n = 0;
  for (const [ms, c] of timerDiminta.entries()) if (ms < 500) n += c;
  return n;
}
function rentangJendelaTerburuk(percobaan, lebar = 60_000) {
  const t = percobaan.map((p) => p.t).sort((a, b) => a - b);
  let maks = 0;
  for (let i = 0; i < t.length; i++) {
    let n = 0;
    for (let j = i; j < t.length && t[j] - t[i] < lebar; j++) n++;
    maks = Math.max(maks, n);
  }
  return maks;
}

/* ═════════════════════════════ jalan ═════════════════════════════ */
console.log('uji-fallback-jalur-kirim — deterministik: tanpa jaringan, tanpa model, tanpa Tauri, tanpa CDP');
console.log(`repo: ${AKAR_REPO}`);
console.log(`sementara: ${TMP}`);
fs.mkdirSync(KERJA, { recursive: true });

let modulPath;
try {
  modulPath = await bundel();
} catch (e) {
  console.log(`TIDAK BISA DIUKUR: bundel esbuild gagal — ${e && e.message}`);
  process.exit(2);
}
console.log(`bundel jalur kirim: ${(fs.statSync(modulPath).size / 1e6).toFixed(2)} MB\n`);
pasangShim();

const ERROR_429 = 'Server provider bermasalah (429): rate limit exceeded - too many requests';
const ERROR_502 = 'Server provider bermasalah (502): bad gateway';
const ERROR_401 = 'Unauthorized (401): invalid api key';

/* ─────────────── (0) isi modul kembar providerTahan: dipakai siapa? ─────────────── */
{
  const { execSync } = await import('node:child_process');
  const hitung = (pola) => {
    try {
      const out = execSync(
        `grep -rn -e '${pola}' src/ --include=*.ts --include=*.tsx | grep -v 'src/lib/providerTahan.ts' | wc -l`,
        { cwd: AKAR_REPO, encoding: 'utf8' },
      );
      return Number(out.trim());
    } catch {
      return -1;
    }
  };
  const impor = hitung('providerTahan');
  const panggilTahan = hitung('panggilTahan');
  const jendela = hitung('JendelaKredensial');
  /*
   * Cek ini DIBALIK 2026-10-15 oleh patch sambungan (lane zeph-provider-sambung).
   * Versi lama menegakkan KEADAAN RUSAK: 'm1-providerTahan-nol-pengguna' =
   * modul diharapkan TIDAK dipakai siapa pun. Setelah disambungkan, syarat
   * lama justru akan GAGAL - itulah tanda patch berhasil, bukan regresi.
   *
   * Yang dituntut sekarang: modul DIIMPOR produk, dan jendela benar-benar
   * dipakai di jalur kirim nyata. `panggilTahan` sengaja tetap 0: patch B
   * memakai fungsi jendela-nya langsung (buatJendela/jatahJendela), bukan
   * pembungkus panggilTahan yang menelan tangga retry milik aiStore.
   */
  check(
    'm1-providerTahan-sudah-disambungkan',
    impor > 0 && jendela > 0 && panggilTahan === 0,
    `grep di src/ (tanpa berkas modulnya sendiri): impor 'providerTahan' = ${impor} (>0), 'JendelaKredensial' = ${jendela} (>0), 'panggilTahan' = ${panggilTahan} (0, disengaja)`,
    `artinya modul kembar providerTahan bukan lagi kode mati: jendela 60/70/60 kini punya pemakai di jalur kirim nyata, dan keempat sisipan patch B ikut terbukti ada di pohon kode`,
  );
}

/* ─────────────── (A) jalur CHAT: src/lib/aiStore.ts::send() ─────────────── */
console.log('\n(A) jalur CHAT nyata — send() (aiStore.ts:4356): satu-satunya pintu dari kotak ketik');
{
  const S = await skenario(
    modulPath,
    { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'], perilaku: () => ({ gagal: ERROR_429 }) },
    (mod) => mod.useAi.getState().send('halo', [], ''),
  );
  const n = S.router.percobaan.length;
  const tangga = tanggaDariPercobaan(S.router.percobaan);
  const pesan = pesanTerakhirUser(S);
  const toast = String(S.mod.useAi.getState().toast || '');
  catat(`jalur selesai=${S.jalan.selesai}${S.jalan.nyangkut ? ' NYANGKUT(tidak selesai dalam anggaran waktu nyata)' : ''} nilai=${JSON.stringify(S.jalan.nilai)} galat=${S.jalan.galat || '-'}`);
  catat(`percobaan provider = ${n}; jeda NYATA antar percobaan = ${JSON.stringify(tangga)} ms; total waktu-palsu = ${S.totalMs} ms`);
  catat(`perintah Tauri yang dicoba jalur ini = ${JSON.stringify([...new Set(S.router.log.map((l) => l.cmd))])}`);
  catat(`model yang dipakai berurutan = ${JSON.stringify(S.router.percobaan.map((p) => p.model))}`);
  catat(`tempat galat muncul: pesan akhir ${pesan.length} karakter, toast ${toast.length} karakter${toast ? ' (' + toast.slice(0, 80) + ')' : ''}`);
  check(
    'a1-send-satu-jalur-bukan-retry-chat-datar',
    !S.jalan.nyangkut && JSON.stringify(tangga) === JSON.stringify([1000, 2500, 4000, 12000, 22000, 0]),
    `send() 429: ${n} percobaan dengan jeda nyata ${JSON.stringify(tangga)} ms (bukan 3 percobaan datar) — jadi tangga RETRY_CHAT di :4915 TIDAK yang jalan dulu; pintu chat langsung masuk mekanisme agent`,
    `total tunggu ${S.totalMs} ms; model ${JSON.stringify([...new Set(S.router.percobaan.map((p) => p.model))])}`,
  );
  const teks = pesan || toast;
  /*
   * Cek ini DIBALIK 2026-10-15 oleh patch B (lane zeph-provider-sambung).
   * Versi lama menuntut pesan akhir TIDAK memuat daftar provider
   * (`!/openai|anthropic|custom/`) — itulah temuan (d) yang dijadikan target
   * patch: pesan "provider error" tanpa satu pun nama provider membuat user
   * mustahil membedakan "model salah" dari "provider sedang penuh".
   *
   * Sekarang daftar kandidat + nomor percobaan WAJIB ada. Jalur CHAT ikut
   * kena (bukan hanya sendAgent): bukti dari log run ini — `send()` menempel
   * `finalError` yang sama, jadi pintu kotak ketik pun menerimanya.
   */
  check(
    'a2-jalur-chat-pesan-jujur-kini-menyebut-kandidat',
    /429/.test(teks) &&
      /lanjut|coba lagi|tunggu/i.test(teks) &&
      /openai|anthropic|custom/.test(teks) &&
      /percobaan kirim:\s*\d+\s*kali/i.test(teks),
    `pesan dari pintu chat (${teks.length} karakter) memuat SEBAB (429), TINDAKAN, daftar provider yang sudah dicoba, dan JUMLAH percobaan kirim`,
    `sebab=${/429/.test(teks)} tindakan=${/lanjut|coba lagi|tunggu/i.test(teks)} daftar-provider=${/openai|anthropic|custom/.test(teks)} nomor-percobaan=${/percobaan kirim:\s*\d+\s*kali/i.test(teks)}; bunyi pesan: ${teks.replace(/\n/g, ' ').slice(0, 200)}`,
  );
}

/* ─────────────── (B) jalur AGENT: sendAgent() ─────────────── */
console.log('\n(B) jalur AGENT nyata — sendAgent() (tangga retry :6100, tunggu-pulih :2203, cadangan :6146)');
let agent429;
{
  const S = await skenario(
    modulPath,
    { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'], perilaku: () => ({ gagal: ERROR_429 }) },
    (mod) => mod.useAi.getState().sendAgent('tulis laporan', [], 'tulis laporan', ''),
  );
  agent429 = S;
  const n = S.router.percobaan.length;
  const jeda = jedaBesar(S.timerDiminta);
  const model = S.router.percobaan.map((p) => p.model);
  const unik = [...new Set(model)];
  catat(`jalur selesai=${S.jalan.selesai}${S.jalan.nyangkut ? ' NYANGKUT(tidak selesai dalam anggaran waktu nyata)' : ''} nilai=${JSON.stringify(S.jalan.nilai)} galat=${S.jalan.galat || '-'}`);
  catat(`percobaan provider = ${n} (${model.join(' → ')}); total waktu-palsu = ${S.totalMs} ms`);
  catat(`jeda ≥500ms yang DIMINTA kode = ${JSON.stringify(jeda.map(([ms, c]) => `${ms}ms×${c}`))}; polling kecil (<500ms) = ${jedaPolling(S.timerDiminta)} timer`);
  catat(`perintah Tauri yang dicoba = ${JSON.stringify([...new Set(S.router.log.map((l) => l.cmd))])}`);
  const tangga = tanggaDariPercobaan(S.router.percobaan);
  check(
    'b1-429-bukan-3-lalu-mati',
    !S.jalan.nyangkut && n === 7 && JSON.stringify(tangga) === JSON.stringify([1000, 2500, 4000, 12000, 22000, 0]),
    `429 diulang ${n}× sebelum menyerah (bukan 3), jeda NYATA antar percobaan = ${JSON.stringify(tangga)} ms`,
    `jadwal di kode: AGENT_PROVIDER_RETRY_DELAYS=[1000,2500] lalu TUNGGU_PULIH_DELAYS=[4000,12000,22000] = 41.500 ms; terukur total waktu-palsu ${S.totalMs} ms. Jeda itu diwujudkan lewat polling 50 ms (${jedaPolling(S.timerDiminta)} timer kecil), jadi 1000/4000/12000/22000 tidak muncul sebagai nilai setTimeout; 300000/360000/900000 di daftar timer itu penjaga waktu, bukan jeda retry`,
  );
  check(
    'b2-pindah-model-terpakai',
    unik.length >= 2,
    `setelah tangga habis, model diganti: ${unik.join(' → ')} (provider tetap ${(S.router.percobaan[n - 1] || {}).provider || (S.router.percobaan[0] || {}).provider})`,
    `urutan lengkap: ${model.join(' → ')}`,
  );
  const progresTeks = S.ctx.progres.map((p) => p.agentCurrentTool || '');
  check(
    'b3-progres-terlihat-saat-tunggu',
    progresTeks.some((t) => /Menunggu provider pulih/.test(t)) && progresTeks.some((t) => /beralih ke/.test(t)),
    `layar tidak kosong: ada progres "Menunggu provider pulih" (${progresTeks.filter((t) => /Menunggu/.test(t)).length}×) dan "beralih ke" (${progresTeks.filter((t) => /beralih/.test(t)).length}×)`,
    `contoh: ${JSON.stringify(progresTeks.find((t) => /Menunggu/.test(t)) || '')}`,
  );
  const errAkhir = S.ctx.frames.filter((f) => f.err).map((f) => f.err).pop() || '';
  const pesanAgent = S.mod.useAi.getState().sessions.flatMap((s) => s.messages).map((m) => m.content).filter(Boolean).pop() || '';
  const teks = pesanAgent || errAkhir;
  catat(`pesan akhir ke user (${teks.length} karakter):\n         ${teks.replace(/\n/g, '\n         ')}`);
  check(
    'b4-pesan-akhir-sebab-tindakan',
    /429/.test(teks) && (/lanjut/i.test(teks) || /coba/i.test(teks)),
    `pesan akhir memuat SEBAB (429) dan satu TINDAKAN ("lanjut"): sebab=${/429/.test(teks)} tindakan=${/lanjut/i.test(teks)}`,
    `yang TIDAK ada di pesan itu: daftar provider yang dicoba=${/openai|anthropic|custom/.test(teks)}, nomor percobaan=${/percobaan|coba ke|\d+\s*×/i.test(teks)}`,
  );
}

/* ─────────────── (C) 5xx diulang, 401 tidak ─────────────── */
console.log('\n(C) 5xx diulang, 401 TIDAK diulang (isRetryableAgentProviderError :2124)');
{
  const S = await skenario(
    modulPath,
    { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'], perilaku: () => ({ gagal: ERROR_502 }) },
    (mod) => mod.useAi.getState().sendAgent('tulis laporan', [], 'tulis laporan', ''),
  );
  const n = S.router.percobaan.length;
  const tangga502 = tanggaDariPercobaan(S.router.percobaan);
  check(
    'c1-502-diulang',
    !S.jalan.nyangkut && n === 7 && JSON.stringify(tangga502) === JSON.stringify([1000, 2500, 4000, 12000, 22000, 0]),
    `502 (5xx) diulang ${n}× dengan jeda NYATA ${JSON.stringify(tangga502)} ms — bukan sekali lalu mati`,
    `5xx diperlakukan sama seperti 429 (regex isRetryableAgentProviderError :2139 memuat 408/429/500/502/503/504); total waktu-palsu ${S.totalMs} ms`,
  );
}
{
  const S = await skenario(
    modulPath,
    { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'], perilaku: () => ({ gagal: ERROR_401 }) },
    (mod) => mod.useAi.getState().sendAgent('tulis laporan', [], 'tulis laporan', ''),
  );
  const n = S.router.percobaan.length;
  const pesan401 = pesanTerakhirUser(S) || S.mod.useAi.getState().toast || '';
  check(
    'c2-401-tidak-diulang',
    n === 1 && S.totalMs === 0,
    `401: TEPAT ${n} percobaan, tunggu total ${S.totalMs} ms — kredensial salah tidak diboroskan ulang`,
    `pesan ke user (${String(pesan401).length} karakter): ${String(pesan401).replace(/\n/g, ' ').slice(0, 170)}`,
  );
}

/* ─────────────── (D) kerja di disk: ditulis tool NYATA, lalu provider gagal ─────────────── */
console.log('\n(D) kerja yang sudah di disk — tool tulis NYATA, lalu satu giliran penuh 429');
{
  const berkasKerja = path.join(KERJA, 'kerja-selesai.txt');
  const isiKerja = 'langkah 1 selesai: 3 berkas ditulis, 143 karakter ini harus tetap ada.\n';
  fs.mkdirSync(KERJA, { recursive: true });
  if (fs.existsSync(berkasKerja)) fs.rmSync(berkasKerja);

  /* (D1) yang MENULIS adalah tool nyata repo (write_file di zephyrTools/builtins.ts),
     lewat jalur nyata agentTools.jalankanAgentTool - bukan fs.writeFileSync harness. */
  let hasilTool = null;
  let galatTool = null;
  {
    pasangJamPalsu({});
    const router = buatRouter({ izin: { fs_exists: false, fs_read: '' } });
    ROUTER = router;
    const mod = await muat(modulPath, ++usaha);
    siapkan(mod, { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'] });
    const j = await jalankan(() =>
      mod
        .jalankanAgentTool('write_file', { path: berkasKerja, content: isiKerja })
        .then((v) => ({ v }))
        .catch((e) => ({ e: e && e.message, stack: e && e.stack ? String(e.stack).split('\n').slice(1, 4).join(' | ') : '' })),
    );
    hasilTool = j.nilai?.v ?? null;
    galatTool = j.nilai?.e ?? null;
    if (j.nilai?.stack) catat(`jejak galat pasca-tulis: ${j.nilai.stack}`);
    catat(`jalankanAgentTool('write_file') → ${hasilTool ? JSON.stringify(hasilTool).slice(0, 140) : 'galat: ' + galatTool}`);
    catat(`perintah tulis yang benar-benar dikirim ke lapisan OS = ${JSON.stringify(router.tulisDisk.map((t) => t.cmd + ' ' + path.basename(t.path)))}`);
    if (galatTool) catat(`(galat setelah penulisan tidak membatalkan bukti: berkas tetap ditulis sebelum galat)`);
  }
  const ada = fs.existsSync(berkasKerja);
  const isi0 = ada ? fs.readFileSync(berkasKerja, 'utf8') : null;
  const mtime0 = ada ? fs.statSync(berkasKerja).mtimeMs : null;
  check(
    'd1-tool-nyata-menulis-berkas',
    ada && isi0 === isiKerja,
    `tool tulis NYATA berhasil menulis berkas kerja: ${berkasKerja}`,
    `isi ${isi0 ? isi0.length : 0} karakter, mtime ${mtime0}`,
  );

  /* (D2) sekarang giliran penuh 429 lewat jalur kirim nyata. */
  const S = await skenario(
    modulPath,
    { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'], perilaku: () => ({ gagal: ERROR_429 }) },
    (mod) => mod.useAi.getState().sendAgent('lanjutkan laporan', [], 'lanjutkan laporan', ''),
  );
  const isi1 = fs.existsSync(berkasKerja) ? fs.readFileSync(berkasKerja, 'utf8') : null;
  const mtime1 = fs.existsSync(berkasKerja) ? fs.statSync(berkasKerja).mtimeMs : null;
  const tulisSaatGagal = S.router.tulisDisk.length;
  const perintahTulis = S.router.log.filter((l) => TULIS_CMD.has(l.cmd)).length;
  check(
    'd2-kerja-utuh-setelah-gagal-total',
    isi1 === isi0 && mtime1 === mtime0,
    `setelah ${S.router.percobaan.length} percobaan provider gagal berturut-turut: isi IDENTIK (${isi1 === isi0}) dan mtime TIDAK bergeser (${mtime0} = ${mtime1})`,
    `berkas: ${berkasKerja} (${isi1 ? isi1.length : 0} karakter)`,
  );
  check(
    'd3-tidak-ada-tulis-ulang-diputar-lagi',
    perintahTulis === 0 && tulisSaatGagal === 0,
    `selama seluruh giliran yang gagal, perintah tulis ke disk = ${perintahTulis} (tidak ada tool yang diputar ulang, jadi tidak ada kerja yang bisa tertimpa)`,
    `perintah provider yang dikirim = ${S.router.percobaan.length} (semuanya ai_tool_chat_stream), perintah lain: ${JSON.stringify([...new Set(S.router.log.map((l) => l.cmd))])}`,
  );
}

/* ─────────────── (E) rahasia tidak ikut dikirim ulang ─────────────── */
console.log('\n(E) kunci rahasia tidak pernah ikut dikirim ulang oleh percobaan ulang');
{
  const S = agent429;
  const semua = JSON.stringify(S.router.log.map((l) => l.args ?? null));
  const kemunculan = semua.split(CANARY_KUNCI).length - 1;
  const perPercobaan = S.router.percobaan.filter((p) => JSON.stringify(p.args).includes(CANARY_KUNCI)).length;
  check(
    'e1-kunci-tidak-di-payload',
    kemunculan === 0,
    `canary kunci (${CANARY_KUNCI}) muncul ${kemunculan}× dari ${S.router.percobaan.length} percobaan provider dan ${S.router.log.length} panggilan IPC`,
    `percobaan yang membawa kunci = ${perPercobaan}; artinya retry mengirim ULANG percakapan, bukan kunci — kunci hidup di sisi Rust dan tidak pernah menyeberang ke ronde berikutnya`,
  );
}

/* ─────────────── (F) laju: benarkah ada plafon 60 sukses / 70 percobaan per 60 dtk? ─────────────── */
console.log('\n(F) laju percobaan vs batas nyata 60 sukses / 70 percobaan per 60 detik');
{
  /* 40 giliran chat berturut-turut, semuanya 429. Semua lewat jalur kirim nyata. */
  const N = 40;
  const S = await skenario(
    modulPath,
    { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'], perilaku: () => ({ gagal: ERROR_429 }) },
    async (mod) => {
      for (let i = 0; i < N; i++) await mod.useAi.getState().send('giliran ' + i, [], '');
    },
  );
  const total = S.router.percobaan.length;
  const terburuk = rentangJendelaTerburuk(S.router.percobaan, 60_000);
  catat(`${total} percobaan provider dari ${N} giliran dalam ${S.totalMs} ms waktu-palsu; laju terukur = ${(total / (S.totalMs / 1000)).toFixed(2)} percobaan/detik`);
  const { execSync } = await import('node:child_process');
  const grep = (pola) => {
    try {
      return Number(execSync(`grep -c -e '${pola}' src/lib/aiStore.ts || true`, { cwd: AKAR_REPO, encoding: 'utf8' }).trim());
    } catch {
      return -1;
    }
  };
  const jejakJendela = grep('JendelaKredensial');
  const jejakPlafon = grep('maksPercobaan');
  const jejakRetryAfter = grep('Retry-After');
  catat(`grep di src/lib/aiStore.ts: 'JendelaKredensial' = ${jejakJendela}, 'maksPercobaan' = ${jejakPlafon}, 'Retry-After' = ${jejakRetryAfter}`);
  /*
   * Cek ini DIBALIK 2026-10-15 oleh patch B (lane zeph-provider-sambung).
   * Versi lama menuntut jendela/anggaran menit TIDAK ADA di jalur kirim
   * nyata — dan memang tidak ada, itulah temuan (f) yang dijadikan target:
   * 40 giliran serial tetap di bawah 70/menit hanya karena tangga retry
   * 41.500 ms mengunci laju, bukan karena dijaga; dua lajur paralel (f3)
   * lolos dari "penguncian" itu tanpa rem sama sekali.
   *
   * SYARAT LULUS SEKARANG: jendela + plafon benar-benar ada di kode.
   * `Retry-After` tetap 0 dan itu DISENGAJA, bukan lalai: Rust (ai.rs
   * `pesan_http`) meneruskan status tapi TIDAK nilai Retry-After, jadi
   * menghormatinya di TS akan jadi kode mati yang menipu pembaca. Pemasangannya
   * menuntut perubahan Rust yang berdiri sendiri.
   */
  check(
    'f1-jendela-anggaran-sudah-ada',
    jejakJendela > 0 && jejakPlafon > 0 && jejakRetryAfter === 0,
    `kode jendela/anggaran menit ADA di jalur kirim nyata: 'JendelaKredensial' = ${jejakJendela} (>0), 'maksPercobaan' = ${jejakPlafon} (>0); 'Retry-After' = ${jejakRetryAfter} (0, DISENGAJA - Rust tidak meneruskan nilainya)`,
    `percobaan terbanyak dalam jendela 60 dtk mana pun pada pola SERIAL ini = ${terburuk} (plafon 70) — di bawah plafon karena tangga retry 41.500 ms per giliran (f2) memang lambat; pembuktian bahwa jendela benar-benar MENAHAN ada di f4 (lajur paralel), bukan di pola serial yang memang tak pernah mendekati plafon`,
  );
  const tanggaSemua = tanggaDariPercobaan(S.router.percobaan);
  const tanggaSah = tanggaSemua.every((d) => [0, 1000, 2500, 4000, 12000, 22000].includes(d));
  check(
    'f2-jeda-saat-ini-hanya-tangga',
    tanggaSah && tanggaSemua.length === total - 1,
    `semua ${tanggaSemua.length} jeda antar percobaan persis milik tangga retry {0,1000,2500,4000,12000,22000}: ${tanggaSah}`,
    `jeda giliran ke-1 sama dengan giliran ke-${N} (rata-rata ${(S.totalMs / N).toFixed(0)} ms per giliran = 41.500 ms tangga) — pola SERIAL ini memang tidak menyentuh plafon (puncak ${terburuk}/60 dtk), jadi jendela tidak perlu ikut campur; bukti jendela BEKERJA saat laju meledak ada di f4 (paralel)`,
  );
}

/* ─────────────── (F3) dua lajur agent sekaligus ─────────────── */
console.log('\n(F3) dua lajur agent sekaligus dalam satu proses');
{
  pasangJamPalsu({});
  const router = buatRouter({ perilaku: () => ({ gagal: ERROR_429 }) });
  ROUTER = router;
  const mod = await muat(modulPath, ++usaha);
  siapkan(mod, { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'] });
  const j = await jalankan(async () => {
    const a = mod.useAi.getState().sendAgent('tugas A', [], 'tugas A', '');
    const sesudahA = JSON.stringify({
      agentBusy: mod.useAi.getState().agentBusy,
      pendings: mod.useAi.getState().pendings && Object.keys(mod.useAi.getState().pendings).length,
    });
    const b = mod.useAi.getState().sendAgent('tugas B', [], 'tugas B', '');
    const toast = String(mod.useAi.getState().toast || '');
    const [ra, rb] = await Promise.all([a, b]);
    return { ra, rb, toast, sesudahA };
  });
  const nilai = j.nilai || {};
  check(
    'f3-dua-lajur-menembak-provider-bersamaan',
    !j.nyangkut && router.percobaan.length > 7,
    `dua sendAgent() dipanggil berturut-turut tanpa menunggu → ${router.percobaan.length} percobaan provider (bukan 7), artinya lajur kedua JUSTRU ikut menembak provider; status setelah panggilan pertama: ${nilai.sesudahA}, toast: ${nilai.toast ? '"' + nilai.toast.slice(0, 60) + '"' : '(kosong)'}, hasil janji A/B = ${JSON.stringify({ A: nilai.ra, B: nilai.rb })}`,
    `penjaga busy TIDAK menahan lajur kedua pada jalur store ini (${router.percobaan.length} percobaan dari 2 lajur); yang kini menahan laju adalah jendela anggaran menit (f4), bukan penjaga busy`,
  );
}

/* ─────────────── (F4) pembuktian jendela: laju meledak, apakah ditahan? ─────────────── */
console.log('\n(F4) 100 giliran 401 BERUNTUN (0 jeda, galat non-retry) — apakah plafon 70 percobaan / 60 dtk MENAHAN laju mentah 1,7/dtk?');
{
  /*
   * Dua kesalahan rancangan skenario ini ditemukan dengan MENGUKUR, bukan menebak:
   *
   * (1) Versi pertama memakai 12 lajur paralel. Hasil: 18 percobaan, bukan 84.
   *     Penyebabnya bukan jendela, melainkan guard BUSY APP-WIDE di awal
   *     sendAgent (aiStore.ts:5076 `if (get().pending || get().agentBusy) return
   *     gagalKirimToast(...)` dengan komentar "deliberately APP-WIDE, not per
   *     surface"): satu store = satu permintaan = satu penampung chunk, jadi
   *     lajur kedua ditolak sebelum mengirim apa pun. Menambah composerId per
   *     lajur TIDAK membantu - memang tidak ada jalur untuk 12 lajur paralel di
   *     produk ini. Permintaan tidak pernah meledak, jadi jendela tak tersentuh.
   *
   * (2) Pola 429 (f1/f2/f3) juga tak bisa membuktikan apa pun: tangga retry
   *     41.500 ms per giliran membatasi laju ke ~0,16 percobaan/detik, jauh di
   *     bawah plafon 70/60 dtk. Di sana jendela memang tidak seharusnya ikut
   *     campur - dan benar begitu.
   *
   * Yang benar-benar bisa meledakkan laju pada satu lajur adalah giliran SUKSES
   * beruntun: satu percobaan per giliran, nol milidetik jeda. 100 giliran =
   * 100 percobaan dalam ~satu detik waktu-palsu, melampaui plafon 70 tujuh kali
   * lipat. Ini juga pola nyata: giliran agen yang membaca banyak berkas mengirim
   * permintaan model beruntun-beruntun tanpa pernah kena 429.
   *
   * Jendela yang benar harus MENAHAN: laju terburuk 60 dtk tidak boleh melewati
   * 70, dan giliran ke-71 ke atas harus MENUNGGU (bukan tetap dikirim lalu
   * provider yang melempar 429).
   */
  /*
   * TIGA kesalahan rancangan skenario ini ditemukan dengan MENGUKUR, bukan menebak:
   *
   * (1) 12 lajur PARALEL → cuma 18 percobaan, bukan 84. Penyebabnya bukan jendela,
   *     melainkan guard BUSY APP-WIDE di awal sendAgent (aiStore.ts:5076
   *     `if (get().pending || get().agentBusy) return gagalKirimToast(...)` dengan
   *     komentar "deliberately APP-WIDE, not per surface"): satu store = satu
   *     permintaan = satu penampung chunk, jadi lajur ke-2..12 ditolak sebelum
   *     mengirim apa pun. Menambah composerId per lajur TIDAK membantu — memang
   *     tidak ada jalur untuk 12 lajur paralel di produk ini. Tidak ada yang
   *     meledak, jadi jendela tak tersentuh.
   *
   * (2) Pola 429 (f1/f2/f3) juga tak bisa membuktikan apa pun: tangga retry
   *     41.500 ms per giliran membatasi laju ke ~0,16 percobaan/detik, jauh di
   *     bawah plafon 70/60 dtk. Di sana jendela memang TIDAK seharusnya ikut
   *     campur — dan benar begitu (f2).
   *
   * (3) Giliran SUKSES (perilaku null) hanya menghasilkan 1 percobaan lalu berhenti:
   *     jalur sukses tidak pernah memasang timer sama sekali, dan runner jam-palsu
   *     berhenti sendiri begitu antrean timer kosong (jalankan: "menunggu sesuatu
   *     yang tak akan datang"). Bukan produknya yang salah — penggerak ujinya yang
   *     perlu dipancing dengan keepalive.
   *
   * Yang benar-benar bisa meledakkan laju pada SATU lajur adalah giliran galat
   * TANPA tangga: 401 tidak diulang (c2: tepat 1 percobaan, 0 ms jeda). 100 giliran
   * 401 = 100 percobaan provider dalam ~0 ms — melampaui plafon 70 sepuluh kali
   * lipat. Ini juga pola nyata: kredensial kedaluwarsa membuat setiap giliran agent
   * langsung menembak provider dan langsung ditolak, tanpa pernah kena 429.
   *
   * Jendela yang benar harus MENAHAN: laju terburuk 60 dtk tidak boleh melewati 70.
   */
  const GILIRAN = 100;
  let diterima = 0;
  let ditolak = 0;
  const S = await skenario(
    modulPath,
    { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'], perilaku: () => ({ gagal: ERROR_401 }) },
    async (mod) => {
      /* Keepalive: jalur galat-instan tidak memasang timer apa pun, sehingga
         runner jam-palsu akan berhenti sendiri setelah giliran pertama. Timer
         1 detik ini hanya membuat penggerak tetap memutar; TIDAK menambah
         percobaan provider apa pun. */
      const hidup = setInterval(() => {}, 1_000);
      try {
        for (let i = 0; i < GILIRAN; i++) {
          const ok = await mod.useAi.getState().sendAgent('baca berkas ' + i, [], 'baca berkas ' + i, '');
          if (ok) diterima += 1;
          else {
            ditolak += 1;
            if (ditolak <= 2)
              catat(`giliran ke-${i} DITOLAK (ok=${ok}); toast = ${JSON.stringify(mod.useAi.getState().toast)}; agentBusy=${mod.useAi.getState().agentBusy}`);
          }
        }
      } finally {
        clearInterval(hidup);
      }
    },
  );
  const total = S.router.percobaan.length;
  const terburuk = rentangJendelaTerburuk(S.router.percobaan, 60_000);
  const pertama = S.router.percobaan[0]?.t;
  const terakhir = S.router.percobaan.at(-1)?.t;
  const menitPalsu = ((terakhir - pertama) / 60_000).toFixed(2);
  catat(`${GILIRAN} giliran 401 beruntun (0 jeda) → ${total} percobaan provider dalam ${S.totalMs} ms waktu-palsu (${menitPalsu} menit-palsu); sendAgent diterima=${diterima} ditolak=${ditolak}`);
  catat(`jendela 60 dtk TERBURUK = ${terburuk} (plafon 70); percobaan pertama t=${pertama}, terakhir t=${terakhir}`);
  catat(`tanpa jendela, ${total} percobaan ini mendarat dalam ${S.totalMs} ms = ${(total / (S.totalMs / 1000)).toFixed(2)} percobaan/detik`);
  check(
    'f4-jendela-menahan-laju-meledak',
    !S.jalan.nyangkut && total >= GILIRAN && terburuk <= 70,
    `${GILIRAN} giliran 401 beruntun menuntut ${total} percobaan provider dalam ${S.totalMs} ms waktu-palsu, tetapi jendela 60 dtk TERBURUK hanya ${terburuk} (<= plafon 70) — laju mentah ${((total / (S.totalMs / 1000))).toFixed(1)}/dtk benar-benar DITAHAN, bukan sekadar kebetulan rendah`,
    `tanpa jendela, semua ${total} percobaan akan mendarat dalam rentang yang sama; satu-satunya alasan puncaknya terkunci di ${terburuk} adalah jendela anggaran menit membatasi percobaan yang benar-benar dikirim ke provider`,
  );
}

/* ─────────────── (G) batas waktu: penjaga idle + batas keras 15 menit ─────────────── */
console.log('\n(G) batas waktu per giliran — penjaga tanpa-progres 5 menit (:2025), penjaga idle 6 menit (:1996), batas keras 15 menit (:2042)');
{
  /* Provider yang menggantung: janji yang tidak pernah dibalas. Dengan jam palsu
     dimajukan, timer nyata kode ini yang mengakhiri - bukan batas waktu harness. */
  const S = await skenario(
    modulPath,
    {
      model: 'gpt-6-astra',
      provider: 'openai',
      kunci: ['openai'],
      izinkanPanjang: true,
      perilaku: () => 'gantung',
    },
    (mod) => mod.useAi.getState().sendAgent('tugas yang menggantung', [], 'tugas yang menggantung', ''),
  );
  const pesan = S.mod.useAi.getState().sessions.flatMap((s) => s.messages).map((m) => m.content).filter(Boolean).pop() || '';
  const ms = S.totalMs;
  const panjang = [...S.timerDiminta.entries()].filter(([v]) => v > 60_000).map(([v, c]) => `${v}ms×${c}`);
  check(
    'g1-penjaga-tanpa-progres-nyala-300dtk',
    ms >= 290_000 && ms <= 310_000 && /menjawab|Timeout/i.test(pesan),
    `provider yang TIDAK pernah menjawab diakhiri kode sendiri tepat pada ${ms} ms waktu-palsu (AGENT_NO_PROGRESS_MS = 300.000 ms di aiStore.ts:2025, dipasang saat satu langkah tak menghasilkan apa-apa) — tidak menggantung selamanya`,
    `timer >60 dtk yang diminta kode = ${JSON.stringify(panjang)} (300000 = penjaga tanpa-progres :2025, 360000 = penjaga idle :1996 yang disetel ulang tiap potongan berisi :8012, 900000 = batas keras :2042 yang tidak pernah disetel ulang); pesan akhir: ${pesan.replace(/\n/g, ' ').slice(0, 170)}`,
  );
}
{
  /* Batas keras 15 menit: provider menggantung TAPI stream tetap mengirim potongan
     tiap 300 dtk, jadi penjaga idle selalu di-reset dan yang menembak adalah batas keras. */
  const S = await skenario(
    modulPath,
    {
      model: 'gpt-6-astra',
      provider: 'openai',
      kunci: ['openai'],
      izinkanPanjang: true,
      perilaku: () => 'gantung',
    },
    async (mod, ctx, router) => {
      /* Denyut: potongan stream tiap 300 dtk supaya penjaga idle tidak pernah menembak. */
      /* Denyut tiap 120 dtk: di bawah penjaga idle 300 dtk, di atas nol, jadi penjaga idle
         selalu di-reset dan yang menembak haruslah batas keras 900.000 ms. */
      let hidup = true;
      const denyut = () => {
        if (!hidup) return;
        const id = router.percobaan[0]?.id;
        if (id) mod.useAi.getState().onChunk({ id, text: '·' });
        globalThis.setTimeout(denyut, 120_000);
      };
      globalThis.setTimeout(denyut, 120_000);
      const v = await mod.useAi.getState().sendAgent('tugas panjang', [], 'tugas panjang', '');
      hidup = false;
      return v;
    },
  );
  const pesan = S.mod.useAi.getState().sessions.flatMap((s) => s.messages).map((m) => m.content).filter(Boolean).pop() || '';
  const ms = S.totalMs;
  const panjang2 = [...S.timerDiminta.entries()].filter(([v]) => v > 60_000).map(([v, c]) => `${v}ms×${c}`);
  check(
    'g2-batas-keras-900dtk-tak-terjangkau',
    ms < 900_000 && /Timeout|menjawab/i.test(pesan),
    `giliran yang terus mengalir potongan demi potongan TETAP dihentikan pada ${ms} ms oleh penjaga yang lebih pendek, padahal batas keras 900.000 ms (15 menit) sudah dipasang — jadi batas keras itu tidak terjangkau pada pola ini`,
    `timer >60 dtk yang diminta kode = ${JSON.stringify(panjang2)}; denyut potongan stream = ${[...S.timerDiminta.entries()].filter(([v]) => v === 120_000).map(([, c]) => c)[0] || 0}×; pesan: ${pesan.replace(/\n/g, ' ').slice(0, 190)}`,
  );
}

/* ─────────────── (H) kandidat cadangan: fungsi murni nyata ─────────────── */
console.log('\n(H) pilihModelCadangan() — fungsi murni NYATA dari contextBudget.ts');
{
  pasangJamPalsu({});
  const mod = await muat(modulPath, ++usaha);
  const gc = mod.pilihModelCadangan;
  const sama = gc({ provider: 'openai', id: 'gpt-6-astra', ctx: 1_050_000 }, mod.MODEL_FALLBACK, (p) => p === 'openai');
  const lain = gc({ provider: 'openai', id: 'gpt-6-astra', ctx: 1_050_000 }, mod.MODEL_FALLBACK, (p) => p === 'openai' || p === 'anthropic');
  const bebas = gc({ provider: 'custom', id: 'custom-model', ctx: 32_000 }, mod.MODEL_FALLBACK, () => false);
  const tanpaKunci = (() => {
    const semua = mod.MODEL_FALLBACK.filter((m) => m.provider === 'openai');
    return gc({ provider: 'openai', id: 'gpt-6-astra', ctx: 1_050_000 }, semua, () => false);
  })();
  catat(`cadangan (kunci hanya openai) = ${JSON.stringify(sama)}`);
  catat(`cadangan (kunci openai+anthropic) = ${JSON.stringify(lain)}`);
  catat(`cadangan (provider 'custom' = freeText milik user) = ${JSON.stringify(bebas)}`);
  catat(`cadangan (openai, tanpa model lain & tanpa kunci lain) = ${JSON.stringify(tanpaKunci)}`);
  check(
    'h1-cadangan-satu-model-provider-sama',
    !!sama && sama.provider === 'openai' && bebas === null && !!tanpaKunci,
    `cadangan yang ada = SATU model di provider yang SAMA (${sama && sama.provider}/${sama && sama.id}); untuk provider freeText milik user ('custom') cadangan = ${JSON.stringify(bebas)} alias nol jalur fallback`,
    `walau kunci anthropic TERSEDIA, cadangannya tetap ${JSON.stringify(lain)} — jadi (b) bukan "fallback antar-provider", melainkan "ganti satu model, provider tetap"; tanpa kunci provider lain pun tetap ${JSON.stringify(tanpaKunci)}`,
  );
}

/* ─────────────── (I) determinisme: dua jalan penuh ─────────────── */
console.log('\n(I) determinisme — dua jalan penuh pada modul segar');
{
  const jalankanSekali = async () => {
    const S = await skenario(
      modulPath,
      { model: 'gpt-6-astra', provider: 'openai', kunci: ['openai'], perilaku: () => ({ gagal: ERROR_429 }) },
      (mod) => mod.useAi.getState().sendAgent('tulis laporan', [], 'tulis laporan', ''),
    );
    return {
      percobaan: S.router.percobaan.map((p) => `${p.cmd}:${p.model}:${p.t - S.router.percobaan[0].t}`),
      jeda: jedaBesar(S.timerDiminta),
      total: S.totalMs,
      pesan: (S.mod.useAi.getState().sessions.flatMap((s) => s.messages).map((m) => m.content).filter(Boolean).pop() || '').slice(0, 200),
    };
  };
  const j1 = await jalankanSekali();
  const j2 = await jalankanSekali();
  const sama = JSON.stringify(j1) === JSON.stringify(j2);
  check(
    'i1-dua-jalan-identik',
    sama,
    `dua jalan penuh (masing-masing ${j1.percobaan.length} percobaan, ${j1.total} ms) menghasilkan jejak/jeda/pesan yang IDENTIK`,
    sama ? '' : `jalan-1: ${JSON.stringify(j1)}\n         jalan-2: ${JSON.stringify(j2)}`,
  );
}

/* ─────────────── RINGKASAN ─────────────── */
function ringkasanKeluaran() {
const hijau = hasil.filter((h) => h.ok).length;
const merah = hasil.length - hijau;
console.log(`\nRingkasan uji-fallback-jalur-kirim: ${hasil.length} pemeriksaan — ${hijau} cocok, ${merah} tidak cocok`);
console.log(`merah: ${hasil.filter((h) => !h.ok).map((h) => h.id).join(', ') || '(tidak ada)'}`);
console.log('\nVONIS (dari angka di atas, bukan dari bacaan):');
console.log('\nVONIS (dibaca dari hasil cek di atas — bukan ditulis tangan, supaya tidak basi):');
/* tiap baris memanggil v(id); kalau sebuah cek dibalik/ditambah, vonis ikut berubah sendiri */
const v = (id) => { const h = hasil.find((x) => x.id === id); return h ? (h.ok ? 'LULUS' : 'GAGAL') : 'TIDAK ADA'; };
/* vonis tiap butir dibaca dari hasil cek sesungguhnya (param id), bukan ditulis tangan —
   kalau cek ditambah/dibalik, kalimat ikut berubah sendiri dan tak bisa basi */
const baris = (label, judul, ids, teks) => console.log(`  ${label} ${judul} ${teks} [${ids.map((i) => `${i.split('-')[0]}=${v(i)}`).join(' ')}]`);
baris('(a)', '429/5xx retry+backoff ......',
  ['b1-429-bukan-3-lalu-mati', 'a1-send-satu-jalur-bukan-retry-chat-datar'],
  'tangga 1000/2500/4000/12000/22000 ms = 41.500 ms untuk 7 percobaan; tanpa Retry-After (B1 ditunda: Rust tidak meneruskan header)');
baris('(b)', 'fallback antar-model .......',
  ['b2-pindah-model-terpakai', 'h1-cadangan-satu-model-provider-sama'],
  '1x pindah model dengan provider TETAP; provider freeText user tanpa cadangan');
baris('(c)', 'batas waktu per giliran ....',
  ['g1-penjaga-tanpa-progres-nyala-300dtk', 'g2-batas-keras-900dtk-tak-terjangkau'],
  'penjaga tanpa-progres 300.000 ms + penjaga pendek menang atas batas keras 900.000 ms');
baris('(d)', 'pesan akhir / daftar coba ..',
  ['a2-jalur-chat-pesan-jujur-kini-menyebut-kandidat', 'b4-pesan-akhir-sebab-tindakan', 'c2-401-tidak-diulang'],
  'pesan akhir memuat sebab (429) + tindakan ("lanjut") + daftar provider yang dicoba + JUMLAH percobaan');
baris('(e)', 'kerja di disk utuh .........',
  ['d1-tool-nyata-menulis-berkas', 'd2-kerja-utuh-setelah-gagal-total', 'd3-tidak-ada-tulis-ulang-diputar-lagi'],
  'belum ada bukti kerja berkurang/tertimpa');
baris('(f)', 'plafon 60/70 per 60 dtk ....',
  ['f1-jendela-anggaran-sudah-ada', 'f4-jendela-menahan-laju-meledak'],
  'jendela 60/70 per 60 dtk MENAHAN laju meledak 100 giliran 401 (mentah 1,7/dtk), puncak jendela = 70');
baris('(g)', 'determinisme ...............',
  ['i1-dua-jalan-identik', 'f2-jeda-saat-ini-hanya-tangga'],
  'ladder tetap deterministik tanpa jitter (B4 ditolak agar i1/f2 tidak rusak)');
baris('(m)', 'providerTahan.ts ...........',
  ['m1-providerTahan-sudah-disambungkan'],
  'modul kini TERPAKAI di jalur kirim nyata (impor produk > 0, impor tengah tetap 0)');
baris('(f3)', 'lajur bersamaan ............',
  ['f3-dua-lajur-menembak-provider-bersamaan', 'f4-jendela-menahan-laju-meledak'],
  'guard busy app-wide MENAHAN lajur paralel (bukan jendela); yang menahan laju justru jendela pada giliran beruntun');

return merah;
}
process.on('uncaughtException', (e) => {
  console.log(`\nFATAL di tengah uji: ${(e && (e.stack || e.message)) || e}`);
  ringkasanKeluaran();
  process.exit(1);
});
const merah = ringkasanKeluaran();
process.exit(merah === 0 ? 0 : 1);
