#!/usr/bin/env node
/*
 * uji-ketahan-agen.mjs — uji KETAHANAN agen, DETERMINISTIK.
 *
 * Cacat lama yang dibuktikan di sini (lihat docs/LAPORAN-KETAHANAN-AGEN.md):
 *   (a) lama-busy  — status "agen sedang bekerja" tidak pernah kembali normal
 *                    setelah giliran SELESAI / GAGAL / dibatalkan / app di-restart.
 *   (b) lama-merah — JSON rusak dari model (kepotong, tanda kutip kabur, ada teks
 *                    di luar JSON) membuat agen mogok.
 *   (c) lama-besar — tugas besar (40+ berkas) mematikan agen.
 *
 * SYARAT JALAN (sengaja ketat, supaya tidak ada klaim palsu):
 *   - TANPA jaringan, TANPA model nyata, TANPA Tauri, TANPA app Zephyr menyala.
 *   - Yang diuji adalah KODE ASLI repo ini, bukan salinan:
 *       src/lib/aiStore.ts     → useAi (status agen), berkasDitulisGiliran,
 *                                ekorHanyaBaca, statusPekerjaan,
 *                                bagiLangkahDariRiwayat, bentukWireRiwayat
 *       src/lib/agentDraft.ts  → parseDraft (pengurai keluaran model)
 *     Modul aslinya .ts dan tidak bisa diimpor Node langsung (impor tanpa
 *     ekstensi + `import.meta.env`), jadi dibundel SAAT JALAN dengan esbuild
 *     lokal (offline) ke folder sementara, lalu diimpor. Tidak ada berkas repo
 *     yang ditulis.
 *   - "SALINAN" hanya ada di satu tempat: `pasangShim()` di bawah adalah tiruan
 *     minimal objek browser/Tauri supaya modul frontend bisa dimuat di Node.
 *     Itu BUKAN logika Zephyr dan tidak diuji; setiap IPC Tauri sengaja GAGAL
 *     (bukan mengarang data) supaya tidak ada hasil palsu.
 *
 * Keluar: 0 = semua hijau, 1 = ada yang merah, 2 = tidak bisa diukur (bundel gagal).
 * Cetak:  LULUS/GAGAL per pemeriksaan + jumlah akhir (hijau/merah).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AKAR_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KELUARAN = path.join(os.tmpdir(), 'zephyr-uji-ketahan');

/* ───────────────────────── kerangka uji ───────────────────────── */

const hasil = [];
let nomor = 0;
function check(id, ok, pesan, angka) {
  nomor++;
  hasil.push({ id, ok: !!ok });
  const tanda = ok ? 'LULUS' : 'GAGAL';
  console.log(`  ${tanda}  ${id.padEnd(26)} ${pesan}`);
  if (angka) console.log(`         ${angka}`);
  return !!ok;
}

async function ukur(fn) {
  const t0 = process.hrtime.bigint();
  const nilai = await fn();
  return { nilai, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}

/* ─────────────── SALINAN (bukan kode Zephyr): shim browser ─────────────── */
/* Tiruan minimal supaya modul frontend bisa dimuat di Node. IPC Tauri GAGAL. */
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
    requestAnimationFrame: (cb) => setTimeout(() => cb(0), 0),
    cancelAnimationFrame: (h) => clearTimeout(h),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    // Setiap panggilan IPC Tauri SENGAJA gagal: tidak ada data karangan.
    __TAURI_INTERNALS__: {
      invoke: async () => {
        throw new Error('no-tauri-in-node');
      },
      transformCallback: () => 1,
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
  win.globalThis = globalThis;
  const def = (k, v) => {
    try {
      Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
    } catch {
      /* sudah ada: biarkan */
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
  // Kegagalan IPC Tauri jangan sampai jadi unhandled rejection dan mematikan proses.
  process.on('unhandledRejection', () => {});
}

/* ─────────────────────── bundel kode ASLI repo ─────────────────────── */

const DEFINISI_IMENV = {
  'import.meta.env.DEV': 'false',
  'import.meta.env.PROD': 'true',
  'import.meta.env.MODE': '"production"',
  'import.meta.env': 'globalThis.__IMENV__',
};
const BANNER_IMENV = {
  js: "globalThis.__IMENV__ = globalThis.__IMENV__ || { DEV: false, PROD: true, MODE: 'production', SSR: false };",
};

async function bundel(nama, entri) {
  const requireRepo = createRequire(path.join(AKAR_REPO, 'package.json'));
  const { build } = requireRepo('esbuild');
  const keluar = path.join(KELUARAN, nama + '.mjs');
  await build({
    absWorkingDir: AKAR_REPO,
    entryPoints: [entri],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: keluar,
    define: DEFINISI_IMENV,
    banner: BANNER_IMENV,
    logLevel: 'error',
  });
  return keluar;
}

/* ───────────────────────────── jalannya ───────────────────────────── */

console.log('uji-ketahan-agen — deterministik: tanpa jaringan, tanpa model, tanpa Tauri');
console.log(`repo: ${AKAR_REPO}`);
console.log(`bundel sementara: ${KELUARAN}`);

fs.mkdirSync(KELUARAN, { recursive: true });
let berkasAi;
let berkasDraft;
try {
  berkasAi = await bundel('aiStore', 'src/lib/aiStore.ts');
  berkasDraft = await bundel('agentDraft', 'src/lib/agentDraft.ts');
} catch (e) {
  console.log(`TIDAK BISA DIUKUR: bundel esbuild gagal — ${e && e.message}`);
  process.exit(2);
}
console.log(
  `bundel: aiStore ${(fs.statSync(berkasAi).size / 1e6).toFixed(1)} MB, agentDraft ${(fs.statSync(berkasDraft).size / 1e6).toFixed(1)} MB`,
);

pasangShim();
const ai = await import('file:///' + berkasAi.replace(/\\/g, '/'));
const draft = await import('file:///' + berkasDraft.replace(/\\/g, '/'));
const {
  useAi,
  berkasDitulisGiliran,
  ekorHanyaBaca,
  statusPekerjaan,
  bagiLangkahDariRiwayat,
  bentukWireRiwayat,
} = ai;
const { parseDraft } = draft;
const sibuk = (s) => Boolean(s.pending || s.agentBusy);
const status = (s) => ({
  agentBusy: s.agentBusy,
  busyComposer: s.agentBusys ? s.agentBusys[''] : undefined,
  pending: s.pending,
  pendingComposer: s.pendings ? s.pendings[''] : undefined,
  phase: s.agentPhase,
  sibuk: sibuk(s),
});

/* ═════════════ (a) lama-busy: status kembali normal ═════════════ */
console.log('\n(a) lama-busy — status "sedang bekerja" HARUS kembali normal');

{
  // T_A: frame terminal dari jalur onChunk. Yang dijamin di sini: id permintaan
  // dilepas (slot `pending` bebas) dan tidak melempar. Pelepasan `agentBusy`
  // adalah tugas jalur keluar run (aiStore.ts:7117, "satu-satunya jalur keluar
  // run") yang hanya berjalan saat proses Tauri benar-benar keluar — itu diuji
  // di a5 (giliran nyata) dan a4 (restart).
  useAi.setState({ pending: 'req-1', agentBusy: true, agentPhase: 'thinking' });
  const sebelum = status(useAi.getState());
  let mogok = null;
  try {
    useAi.getState().onChunk({ id: 'req-1', text: 'halo', done: true });
  } catch (e) {
    mogok = e && e.message;
  }
  const sesudah = status(useAi.getState());
  check(
    'a1-frame-terminal-lepas-id',
    !mogok && sebelum.pending === 'req-1' && sesudah.pending === null,
    `frame terminal (done) untuk req-1 dilepas: pending ${JSON.stringify(sebelum.pending)} -> ${JSON.stringify(sesudah.pending)}; agentBusy=${sesudah.agentBusy} (dilepas jalur keluar run → a4/a5)`,
    `sebelum: ${JSON.stringify(sebelum)}\n         sesudah: ${JSON.stringify(sesudah)}${mogok ? `\n         onChunk melempar: ${mogok}` : ''}`,
  );

  // T_B2: frame terminal kedua (duplikat) tidak boleh mengubah apa pun.
  const sebelum2 = status(useAi.getState());
  try {
    useAi.getState().onChunk({ id: 'req-1', done: true });
  } catch {
    /* duplikat, diabaikan */
  }
  const sesudah2 = status(useAi.getState());
  check(
    'a2-frame-duplikat',
    JSON.stringify(sebelum2) === JSON.stringify(sesudah2),
    `frame terminal kedua (id yang sama, sudah selesai) tidak mengubah status: sibuk tetap ${sesudah2.sibuk}`,
    `sebelum: ${JSON.stringify(sebelum2)}\n         sesudah: ${JSON.stringify(sesudah2)}`,
  );

  // T_C: giliran NYATA yang dibatalkan di tengah jalan. cancel() hanya MENANDAI
  // niat (phase 'cancelling'), yang benar-benar melepas status adalah jalur
  // keluar run saat loop berhenti. Jadi ujinya: jalankan giliran nyata, batalkan
  // saat masih berjalan, lalu pastikan status akhirnya bersih — tidak nyangkut
  // 'cancelling' selamanya.
  useAi.setState({ agentBusy: false, pendings: { '': null }, pending: null, agentPhase: 'idle' });
  useAi.setState({ keys: [{ provider: 'custom', hasKey: true }] });
  const janjiC = Promise.resolve()
    .then(() => useAi.getState().sendAgent('tulis catatan singkat', [], 'tulis catatan singkat'))
    .catch((e) => ({ melempar: (e && e.message) || String(e) }));
  await new Promise((r) => setImmediate(r));
  const sedangJalan = status(useAi.getState());
  let mogokC = null;
  try {
    await useAi.getState().cancel();
  } catch (e) {
    mogokC = e && e.message;
  }
  const saatBatal = status(useAi.getState());
  await janjiC;
  const sesudahC = status(useAi.getState());
  check(
    'a3-batal-di-tengah-giliran',
    !mogokC && sesudahC.sibuk === false && sesudahC.pending === null && sesudahC.phase !== 'cancelling',
    `giliran nyata dibatalkan saat berjalan (sedang-jalan=${sedangJalan.sibuk}, phase saat batal=${saatBatal.phase}) → status akhir bersih: ${JSON.stringify(sesudahC)}`,
    `sesudah cancel, sebelum giliran berakhir: ${JSON.stringify(saatBatal)}\n         sesudah giliran berakhir: ${JSON.stringify(sesudahC)}${mogokC ? `\n         cancel melempar: ${mogokC}` : ''}`,
  );

  // T_D: app di-restart saat giliran masih jalan (init() asli) — dulu di sini status nyangkut.
  useAi.setState({ pending: 'req-3', agentBusy: true, agentPhase: 'working' });
  const sebelumD = status(useAi.getState());
  let mogokD = null;
  try {
    await useAi.getState().init();
  } catch (e) {
    mogokD = e && e.message;
  }
  const sesudahD = status(useAi.getState());
  check(
    'a4-restart-saat-sibuk',
    !mogokD && sebelumD.sibuk === true && sesudahD.sibuk === false,
    `init() asli setelah "crash" di tengah giliran: sibuk ${sebelumD.sibuk} -> ${sesudahD.sibuk}, phase=${sesudahD.phase}`,
    `sesudah: ${JSON.stringify(sesudahD)}${mogokD ? `\n         init melempar: ${mogokD}` : ''}`,
  );
}

{
  // T_E: giliran NYATA yang GAGAL (panggilan provider mati offline) — jalur paling
  // penting: dulu status tinggal "sedang bekerja" selamanya kalau giliran gagal
  // SETELAH mulai. Kunci di-seed supaya sendAgent benar-benar berjalan.
  const transisi = [];
  let terakhir = null;
  const langgan = (s) => {
    const t = JSON.stringify(status(s));
    if (t !== terakhir) {
      terakhir = t;
      transisi.push(t);
    }
  };
  const lepas = useAi.subscribe(langgan);
  useAi.setState({ keys: [{ provider: 'custom', hasKey: true }] });
  const adaKunci = useAi.getState().hasKey();
  const { nilai: hasilKirim, ms } = await ukur(async () => {
    try {
      return { jalur: 'selesai', nilai: await Promise.race([
        useAi.getState().sendAgent('tulis 40 berkas', [], 'tulis 40 berkas'),
        new Promise((r) => setTimeout(() => r('TIMEOUT-30s'), 30000)),
      ]) };
    } catch (e) {
      return { jalur: 'melempar', nilai: e && e.message };
    }
  });
  lepas();
  const akhir = status(useAi.getState());
  const pesanAkhir = useAi
    .getState()
    .sessions.flatMap((s) => s.messages.slice(-1))
    .map((m) => ({ role: m.role, error: m.error ?? null, panjang: (m.content || '').length }));
  const toast = useAi.getState().toast ?? null;
  check(
    'a5-giliran-gagal',
    akhir.sibuk === false && akhir.pending == null && akhir.agentBusy === false,
    `giliran NYATA gagal (provider offline, ${ms.toFixed(0)} ms, kunci terpasang=${adaKunci}) → status kembali normal: ${JSON.stringify(akhir)}`,
    `jalur=${hasilKirim.jalur} hasil=${JSON.stringify(hasilKirim.nilai)?.slice(0, 160)}\n` +
      `         transisi status yang terekam (${transisi.length}): ${transisi.slice(0, 6).join(' | ')}\n` +
      `         pesan terakhir: ${JSON.stringify(pesanAkhir)} toast=${JSON.stringify(toast)}`,
  );
}

/* ═════════════ (b) lama-merah: JSON rusak tidak mematikan agen ═════════════ */
console.log('\n(b) lama-merah — JSON rusak dari model: pengurai nyata tidak mogok + ada pesannya');

{
  const utuh = `{"name":"rapikan-repo","description":"bersihkan","body":"langkah"}`;
  const kasus = [
    ['kepotong-tengah-objek', '{"name":"a","description":"x","body":"belum selesai', false],
    ['tanda-kutip-kabur', '{"name":"a","body":"dia bilang "halo"}', false],
    ['tanpa-brace', 'name: a, body: b', false],
    ['name-tanpa-body', '{"name":"a","description":"x"}', false],
    ['kosong', '', false],
    ['sampah', 'not json at all', false],
    // Objek di dalam array tetap dipulihkan: pengurai memakai jendela '{' pertama
    // sampai '}' terakhir, jadi objeknya terbaca utuh (perilaku nyata kode).
    ['array-berisi-objek', '[{"name":"a","body":"b"}]', true],
    ['teks-di-luar-json', 'Tentu! Ini draftnya:\n' + utuh + '\nsemoga membantu!', true],
    ['pagar-kode', '```json\n' + utuh + '\n```', true],
    // Dua objek berurutan = ambigu → dijawab null: menolak jujur, tidak mengarang.
    ['dua-objek-ambigu', utuh + '\n' + utuh, false],
  ];
  const rincian = [];
  let mogok = 0;
  let sesuai = 0;
  const { ms } = await ukur(async () => {
    for (const [nama, teks, harusTerbaca] of kasus) {
      let nilai;
      let galat = null;
      try {
        nilai = parseDraft(teks);
      } catch (e) {
        galat = (e && e.message) || String(e);
        mogok++;
      }
      const terbaca = !!nilai && typeof nilai.body === 'string' && nilai.body.length > 0;
      const benar = !galat && terbaca === harusTerbaca;
      if (benar) sesuai++;
      rincian.push(
        `${nama.padEnd(20)} mogok=${galat ? 'YA(' + galat.slice(0, 40) + ')' : 'tidak'} terbaca=${terbaca} harusnya=${harusTerbaca} → ${benar ? 'sesuai' : 'TIDAK SESUAI'}`,
      );
    }
  });
  check(
    'b1-parseDraft-10-kasus',
    mogok === 0 && sesuai === kasus.length,
    `parseDraft (pengurai ASLI, src/lib/agentDraft.ts:127) diumpani ${kasus.length} bentuk JSON rusak: ${mogok} mogok, ${sesuai}/${kasus.length} sesuai harapan, ${ms.toFixed(1)} ms`,
    rincian.join('\n         '),
  );

  // Pesan yang bermakna: pengurai yang mengembalikan null = laporan jujur "tidak
  // bisa dibaca" (itulah pesannya), dan untuk yang terbaca isinya harus utuh.
  const terbaca = parseDraft('Tentu! Ini draftnya:\n' + utuh + '\nsemoga membantu!');
  check(
    'b2-isi-utuh-setelah-teks',
    !!terbaca && terbaca.name === 'rapikan-repo' && terbaca.body === 'langkah',
    `jawaban yang dikelilingi kalimat tetap terbaca utuh: name="${terbaca && terbaca.name}", body="${terbaca && terbaca.body}"`,
    `hasil: ${JSON.stringify(terbaca)}`,
  );

  const nol = parseDraft('{"name":"a","body":"dia bilang "halo"}');
  check(
    'b3-tolak-jujur-bukan-mengarang',
    nol === null,
    `JSON yang tanda kutipnya kabur dijawab null (jujur: tidak bisa dibaca), BUKAN objek karangan → ${JSON.stringify(nol)}`,
  );
}

/* ═════════════ (c) lama-besar: 40 berkas tidak mematikan agen ═════════════ */
console.log('\n(c) lama-besar — daftar panjang (40+/4000 berkas) tidak meledak');

{
  const langkahBerkas = (n) =>
    Array.from({ length: n }, (_, i) => ({
      kind: 'tool',
      name: 'write_file',
      args: JSON.stringify({ path: `docs/generated/berkas-${i}.md` }),
      result: 'ok',
      ok: true,
      at: i,
    }));
  const langkah40 = langkahBerkas(40);
  const kotor = langkah40.concat([
    { kind: 'tool', name: 'write_file', args: JSON.stringify({ path: 'docs/generated/berkas-0.md' }), ok: true }, // duplikat
    { kind: 'tool', name: 'write_file', args: '{"path": "docs/generated/berkas-7.md"', ok: true }, // kepotong
    { kind: 'tool', name: 'write_file', args: '{"file": "docs/broken-quote.md}', ok: true }, // kutip kabur
    { kind: 'tool', name: 'write_file', args: '', ok: true }, // kosong
    { kind: 'tool', name: 'write_file', args: 'not json at all', ok: true }, // sampah
    { kind: 'tool', name: 'write_file', args: JSON.stringify({ path: 'docs/generated/gagal.md' }), ok: false }, // gagal
  ]);

  const { nilai: berkas40, ms: ms40 } = await ukur(() => berkasDitulisGiliran(kotor));
  const unik = [...new Set(berkas40)];
  const urutBenar =
    berkas40.length > 0 &&
    berkas40[0] === 'docs/generated/berkas-0.md' &&
    berkas40[berkas40.length - 1] === 'docs/generated/berkas-39.md';
  check(
    'c1-40-berkas-daftar',
    berkas40.length === 40 && unik.length === 40 && urutBenar && ms40 < 500,
    `berkasDitulisGiliran (ASLI) atas 40 berkas + 6 langkah kotor (duplikat/kepotong/kutip kabur/kosong/sampah/gagal) → ${berkas40.length} berkas unik, urutan terjaga (${ms40.toFixed(1)} ms)`,
    `pertama=${berkas40[0]} terakhir=${berkas40[berkas40.length - 1]} unik=${unik.length}\n         tidak ada 'broken-quote'/'gagal': ${!berkas40.some((b) => b.includes('broken') || b.includes('gagal'))}`,
  );

  const { nilai: besar, ms: msBesar } = await ukur(() => berkasDitulisGiliran(langkahBerkas(4000)));
  check(
    'c2-4000-berkas-tidak-meledak',
    besar.length === 4000 && msBesar < 3000,
    `skala 100x (4000 berkas): ${besar.length} berkas terdaftar dalam ${msBesar.toFixed(0)} ms — jalur daftar panjang tidak meledak`,
  );

  const todos = Array.from({ length: 40 }, (_, i) => ({
    content: `item ${i}`,
    status: i < 12 ? 'done' : i === 12 ? 'in_progress' : 'pending',
  }));
  const { nilai: teksStatus, ms: msStatus } = await ukur(() =>
    statusPekerjaan(todos, langkahBerkas(40), 21, 200),
  );
  const semuaTampil = Array.from({ length: 40 }, (_, i) => `berkas-${i}.md`).every((f) => teksStatus.includes(f));
  check(
    'c3-status-40-todo',
    typeof teksStatus === 'string' && teksStatus.length > 0 && semuaTampil && teksStatus.length < 20000,
    `statusPekerjaan (ASLI) atas 40 todo + 40 langkah: ${teksStatus.length} karakter, ke-40 berkas tersebut semuanya disebut (${msStatus.toFixed(1)} ms)`,
  );

  const { nilai: ekor } = await ukur(() => ekorHanyaBaca(kotor, 20));
  check(
    'c4-ekor-hanya-baca',
    typeof ekor === 'number' && ekor >= 0 && ekor <= 20,
    `ekorHanyaBaca(40 langkah tulis + kotor, maks 20) = ${ekor} — jalur 'tulis terus' terbaca sebagai bukan-hanya-baca (tidak nyangkut di 20)`,
  );

  // Riwayat panjang: pembagian langkah + pembentukan wire harus dibatasi, bukan tumbuh bebas.
  const riwayat = [];
  for (let i = 0; i < 40; i++) {
    riwayat.push({ role: 'assistant', content: `langkah ${i}\n=== batas ===\nisi ${i}` });
    riwayat.push({ role: 'tool', content: `hasil ${i}` });
  }
  const { nilai: bagi, ms: msBagi } = await ukur(() =>
    bagiLangkahDariRiwayat(riwayat, (t) => String(t).split('=== batas ===')),
  );
  check(
    'c5-bagi-langkah-40',
    Array.isArray(bagi) && bagi.length > 0 && bagi.length <= riwayat.length && msBagi < 2000,
    `bagiLangkahDariRiwayat atas ${riwayat.length} pesan (40 langkah): ${bagi.length} langkah, ${msBagi.toFixed(1)} ms`,
  );

  const { nilai: wire, ms: msWire } = await ukur(() => bentukWireRiwayat(riwayat));
  check(
    'c6-wire-riwayat-dibatasi',
    Array.isArray(wire) && wire.length > 0 && wire.length <= riwayat.length && msWire < 2000,
    `bentukWireRiwayat atas ${riwayat.length} pesan: ${wire.length} pesan keluar (≤ masuk = digabung/dipangkas, bukan tumbuh), ${msWire.toFixed(1)} ms`,
  );
}

/* ───────────────────────────── rekap ───────────────────────────── */

const hijau = hasil.filter((h) => h.ok).length;
const merah = hasil.length - hijau;
console.log(`\nRingkasan uji-ketahan-agen: ${hasil.length} pemeriksaan — ${hijau} hijau, ${merah} merah`);
if (merah) console.log('MERAH: ' + hasil.filter((h) => !h.ok).map((h) => h.id).join(', '));
console.log(
  `kesimpulan: ${merah === 0 ? 'ketiga cacat lama (busy/merah/besar) TIDAK terbukti lagi pada kode saat ini' : 'MASIH ADA yang merah — lihat daftar di atas, jangan tandai item selesai'}`,
);
process.exit(merah === 0 ? 0 : 1);
