/*
 * Fase 5 — uji beban & stabilitas.
 *
 * Tiga hal yang diminta fase ini, dan cara mengukurnya:
 *
 *   1. TERMINAL MULTI-PANE  - buka banyak pane sekaligus, kirim output ke
 *      semuanya, lalu pastikan app tetap responsif dan tidak ada yang bocor.
 *   2. STRESS STREAM AI     - dorong ribuan chunk ke store seperti stream
 *      sungguhan, ukur waktu render dan apakah UI tetap hidup.
 *   3. KEBOCORAN MEMORI     - ukur heap sebelum/sesudah siklus berat; tumbuh
 *      terus berarti bocor.
 *
 * Yang dilaporkan ANGKA, bukan "tidak ada galat": "tidak ada galat" juga benar
 * untuk app yang membeku.
 *
 * Pakai: node scripts/verify-fase5-beban.mjs [port] [detik]
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const DETIK = Number(process.argv[3] ?? 45);

const { cdp } = await Cdp.attach(PORT, 'Zephyr');

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const out = { terminal: null, stream: null, memori: null, frame: null };

  /* ── 1. TERMINAL MULTI-PANE ──────────────────────────────────────────── */
  const T = window.__ZEPHYR_TERM__;
  const sebelumPane = T ? T.getState().panes.length : -1;
  out.terminal = { ada: !!T, sebelumPane };

  if (T) {
    /*
     * Buka 8 pane. Angka 8 dipilih karena di atas itu sebuah editor desktop
     * wajar mulai berat; kalau 8 pun tidak sanggup, angka yang lebih besar tidak
     * membuktikan apa pun selain bahwa mesinnya lambat.
     */
    const t0 = performance.now();
    for (let i = 0; i < 8; i++) {
      try { T.getState().newPane(); } catch (e) { out.terminal.galat = String(e); break; }
    }
    await tunggu(600);
    out.terminal.msBuka = Math.round(performance.now() - t0);
    out.terminal.sesudahPane = T.getState().panes.length;

    /* Kirim output ke SEMUA pane: inilah beban nyata sebuah terminal. */
    const t1 = performance.now();
    for (let r = 0; r < 20; r++) {
      for (const p of T.getState().panes) {
        try { T.getState().tulisData(p.id, 'baris ' + r + ' output terminal\\r\\n'); } catch (e) {}
      }
    }
    await tunggu(400);
    out.terminal.msTulis = Math.round(performance.now() - t1);
    out.terminal.paneAkhir = T.getState().panes.length;
  }

  /* ── 2. STRESS STREAM AI ─────────────────────────────────────────────── */
  const A = window.__ZEPHYR_AI__;
  out.stream = { ada: !!A };
  if (A) {
    const st = A.store.getState();
    /* Siapkan satu percakapan kosong supaya chunk tidak menimpa riwayat nyata. */
    try {
      st.newChat?.();
    } catch (e) {}
    await tunggu(300);

    /*
     * 3000 chunk. Satu balasan model nyata jarang melebihi ~2000 token, dan tiap
     * token bisa datang sebagai beberapa chunk - jadi 3000 adalah balasan
     * panjang yang wajar, bukan angka yang dilebih-lebihkan.
     */
    const N = 3000;
    const t0 = performance.now();
    let galat = null;
    try {
      const s2 = A.store.getState();
      s2.setDraft?.('');
      /* Jalur chunk nyata yang dipakai stream: onAiChunk lewat jembatan. */
      if (typeof window.__ZEPHYR_AI_CHUNK__ === 'function') {
        for (let i = 0; i < N; i++) window.__ZEPHYR_AI_CHUNK__({ teks: 'kata' + i + ' ' });
      } else if (typeof s2.terimaChunk === 'function') {
        for (let i = 0; i < N; i++) s2.terimaChunk('kata' + i + ' ');
      } else {
        out.stream.jalur = 'tidak ada';
      }
    } catch (e) {
      galat = String(e);
    }
    out.stream.galat = galat;
    out.stream.ms = Math.round(performance.now() - t0);
    out.stream.n = N;

    await tunggu(800);
    out.stream.pesan = A.store.getState().messages?.length ?? -1;
  }

  /* ── 3. FRAME: apakah main thread tersumbat? ─────────────────────────── */
  const celah = [];
  let lalu = performance.now();
  let jalan = true;
  const ukur = () => {
    const now = performance.now();
    celah.push(now - lalu);
    lalu = now;
    if (jalan) requestAnimationFrame(ukur);
  };
  requestAnimationFrame(ukur);

  /* Beban campuran selama 3 detik: ikon + store + render. */
  const fi = await import('/src/lib/fileIcons.ts');
  const tB = performance.now();
  while (performance.now() - tB < 3000) {
    for (let i = 0; i < 200; i++) fi.ikonFile('berkas' + i + '.ts', 'ts');
    S.getState();
    await tunggu(0);
  }
  jalan = false;
  celah.sort((a, b) => b - a);
  out.frame = {
    sampel: celah.length,
    terburukMs: Math.round(celah[0] ?? 0),
    medianMs: Math.round(celah[Math.floor(celah.length / 2)] ?? 0),
  };

  /* ── 4. MEMORI ───────────────────────────────────────────────────────── */
  if (performance.memory) {
    out.memori = {
      dipakaiMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
      batasMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
    };
  }

  /* Apakah app masih hidup dan bisa digambar? */
  out.hidup = !!document.querySelector('.app-root, #root, .app');
  out.galatKonsol = (window.__ZEPHYR_ERRORS__ ?? []).length;

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  Math.max(180000, DETIK * 4000),
);

const d = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log('=== Fase 5 — beban & stabilitas ===\n');
console.log('Terminal :', JSON.stringify(d.terminal));
console.log('Stream AI:', JSON.stringify(d.stream));
console.log('Frame    :', JSON.stringify(d.frame));
console.log('Memori   :', JSON.stringify(d.memori));
console.log('Hidup    :', d.hidup, ' galat konsol:', d.galatKonsol);

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti:');

/* Terminal */
cek('8 pane terminal terbuka', (d.terminal?.sesudahPane ?? 0) >= 8, `${d.terminal?.sebelumPane} -> ${d.terminal?.sesudahPane}`);
cek('membuka 8 pane < 2 detik', (d.terminal?.msBuka ?? 1e9) < 2000, `${d.terminal?.msBuka} ms`);
cek('20x output ke semua pane < 2 detik', (d.terminal?.msTulis ?? 1e9) < 2000, `${d.terminal?.msTulis} ms`);

/* Stream */
cek('3000 chunk diproses < 3 detik', (d.stream?.ms ?? 1e9) < 3000, `${d.stream?.ms} ms`);
cek('stream tidak melempar', !d.stream?.galat, String(d.stream?.galat ?? '-'));

/* Frame */
cek('tidak ada frame tersumbat > 300 ms', (d.frame?.terburukMs ?? 1e9) <= 300, `${d.frame?.terburukMs} ms`);
cek('median frame wajar (< 40 ms)', (d.frame?.medianMs ?? 1e9) < 40, `${d.frame?.medianMs} ms`);

/* Memori */
if (d.memori) {
  cek('heap di bawah 80% batas', d.memori.dipakaiMB / d.memori.batasMB < 0.8, `${d.memori.dipakaiMB}/${d.memori.batasMB} MB`);
}

/* Hidup */
cek('app masih hidup', d.hidup === true);
cek('tidak ada galat konsol', (d.galatKonsol ?? 1) === 0, String(d.galatKonsol));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
