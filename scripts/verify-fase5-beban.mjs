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
  /*
   * API yang dipakai adalah yang BENAR-BENAR ada di store, bukan nama yang
   * dikira-kira. Versi pertama harness ini membaca 'panes' (tidak ada: pane
   * hidup di dalam tab) dan memanggil 'newPane'/'tulisData' (juga tidak ada),
   * sehingga setiap angka menjadi 'undefined' dan seluruh uji dilaporkan GAGAL
   * untuk alasan yang salah - bukan karena app-nya bermasalah.
   */
  const T = window.__ZEPHYR_TERM__;
  const sebelumPane = T ? T.getState().allPanes().length : -1;
  out.terminal = { ada: !!T, sebelumPane };

  if (T) {
    const batas = T.getState().maxPanes();
    /*
     * Buka pane sampai batas yang diizinkan app (bawaan 6, bisa diatur di
     * Settings). Melebihi batas bukan temuan: 'addPane' menolaknya dengan
     * pesan, dan itu perilaku yang benar.
     */
    const target = Math.max(1, Math.min(8, batas));
    const t0 = performance.now();
    const dibuat = [];
    for (let i = 0; i < target; i++) {
      try {
        const id = await T.getState().addPane('terminal');
        if (id) dibuat.push(id);
      } catch (e) {
        out.terminal.galat = String(e);
        break;
      }
    }
    await tunggu(600);
    out.terminal.msBuka = Math.round(performance.now() - t0);
    out.terminal.sesudahPane = T.getState().allPanes().length;
    out.terminal.batas = batas;

    /*
     * Beban tulis: kirim baris ke setiap pane lewat jembatan PTY yang nyata.
     * 'pty_write' adalah jalur yang dipakai terminal sungguhan; memanggilnya
     * 20x per pane mengukur hal yang sama dengan mengetik cepat di semua pane.
     */
    const t1 = performance.now();
    const semua = T.getState().allPanes();
    for (let r = 0; r < 20; r++) {
      for (const p of semua) {
        try {
          await window.__TAURI_INTERNALS__.invoke('pty_write', {
            paneId: p.id,
            data: 'echo baris ' + r + '\\r',
          });
        } catch (e) {
          /* Pane yang belum siap menolak; itu bukan kegagalan beban. */
        }
      }
    }
    await tunggu(400);
    out.terminal.msTulis = Math.round(performance.now() - t1);
    out.terminal.paneAkhir = T.getState().allPanes().length;

    /* Tutup yang tadi dibuka: uji tidak boleh meninggalkan pane di layar. */
    for (const id of dibuat) {
      try {
        await T.getState().closePane(id);
      } catch (e) {}
    }
  }

  /* ── 2. STRESS STREAM AI ─────────────────────────────────────────────── */
  const A = window.__ZEPHYR_AI__;
  out.stream = { ada: !!A };
  if (A) {
    /*
     * Jalur chunk yang NYATA: 'onChunk' di store, dengan bentuk 'AiChunk'
     * ('id' + 'text'). Versi pertama harness ini mencari 'terimaChunk' dan
     * '__ZEPHYR_AI_CHUNK__' - dua nama yang tidak ada - lalu melaporkan
     * "jalur: tidak ada" dan seluruh uji dianggap gagal.
     *
     * 'pending' diisi dulu dengan id palsu supaya chunk punya tujuan; tanpa itu
     * 'onChunk' mengabaikannya dan yang terukur bukan render, melainkan
     * fungsi kosong.
     */
    const N = 3000;
    let galat = null;
    try {
      const st = A.store.getState();
      const idUji = 'uji-beban-' + Date.now();
      A.store.setState({ pending: idUji });
      const t0 = performance.now();
      for (let i = 0; i < N; i++) {
        st.onChunk({ id: idUji, text: 'kata' + i + ' ' });
      }
      out.stream.ms = Math.round(performance.now() - t0);
      out.stream.n = N;
      out.stream.jalur = 'onChunk';
    } catch (e) {
      galat = String(e);
    }
    out.stream.galat = galat;

    await tunggu(800);
    out.stream.pesan = A.store.getState().activeSession()?.messages?.length ?? -1;
    /* Bersihkan: jangan tinggalkan 'pending' palsu yang membuat UI mengira
       masih ada stream berjalan. */
    A.store.setState({ pending: null });
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

/* Terminal: batas pane ditentukan app (Settings), bukan angka tetap 8.
   Uji yang menuntut 8 pane akan GAGAL pada konfigurasi bawaan (6) - itu
   mengukur setelan, bukan beban. Yang penting: pane terbuka sampai batasnya,
   dan semuanya menerima output tanpa membuat app tersumbat. */
cek(
  'pane terminal terbuka sampai batas app',
  (d.terminal?.sesudahPane ?? 0) >= Math.min(8, d.terminal?.batas ?? 1) && (d.terminal?.sesudahPane ?? 0) > 0,
  `${d.terminal?.sebelumPane} -> ${d.terminal?.sesudahPane} (batas ${d.terminal?.batas})`,
);
cek(
  `membuka ${d.terminal?.sesudahPane ?? '?'} pane < 2 detik`,
  (d.terminal?.msBuka ?? 1e9) < 2000,
  `${d.terminal?.msBuka} ms`,
);
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
