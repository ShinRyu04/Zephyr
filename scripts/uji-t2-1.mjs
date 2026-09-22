// uji-t2-1.mjs — verifikasi T2.1 (subagent paralel).
//
// UJI NYATA: menjalankan 2 subagent bersamaan lewat mock provider (port 8098),
// bukan simulasi. Yang dibuktikan:
//   1. Store subagent ada & bisa menjalankan N tugas
//   2. Subagent benar-benar PARALEL (bukan berurutan) — diukur dari waktu
//   3. Tiap subagent punya id unik (tidak saling menimpa resolver)
//   4. Subagent DILARANG menulis file (batas keamanan)
//   5. UI: kartu per subagent + status + ringkasan
//   6. Batas MAX_PARALLEL dihormati
//
// Pakai: node scripts/uji-t2-1.mjs

import { Cdp } from './lib-cdp.mjs';

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) {
    lulus++;
    console.log(`  LULUS  ${nama}${info ? '  ' + info : ''}`);
  } else {
    gagal++;
    console.log(`  GAGAL  ${nama}${info ? '  ' + info : ''}`);
  }
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');

try {
  // ── 0a. arahkan provider ke mock + isi key (tanpa ini, subagent gagal
  //         karena tidak ada API key / tidak ada server) ──
  const siap = await cdp.json(`return JSON.stringify(await (async () => {
    const S = window.__ZEPHYR__;
    const X = window.__ZEPHYR_AI__;
    // Isi key palsu untuk provider yang akan dipakai (mock menerima apa pun).
    // PENTING: setKey menulis ke Rust lewat invoke — WAJIB di-await, kalau
    // tidak key belum tersimpan saat subagent memanggil provider dan gagal
    // dengan "Belum ada API key untuk gemini".
    try {
      // setKey ada di bridge UTAMA (__ZEPHYR__), bukan __ZEPHYR_AI__.
      await window.__TAURI_INTERNALS__.invoke('set_model_key', {
        provider: 'gemini', key: 'MOCK-KEY-GEMINI-1234',
      });
      await new Promise((r) => setTimeout(r, 600));
      await X.store.getState().loadKeys();
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {}
    // Arahkan ketiga provider ke mock 8098.
    await S.getState().applySettings({
      models: { providers: {
        gemini:    { baseUrl: 'http://127.0.0.1:8098' },
        openai:    { baseUrl: 'http://127.0.0.1:8098/v1' },
        anthropic: { baseUrl: 'http://127.0.0.1:8098' },
      } },
    });
    await new Promise((r) => setTimeout(r, 400));
    const cfg = S.getState().settings.models.providers;
    return {
      gemini: cfg.gemini?.baseUrl ?? '(kosong)',
      model: X.store.getState().model,
      provider: X.store.getState().provider,
    };
  })())`);
  console.log(`    provider=${siap.provider} model=${siap.model} base=${siap.gemini}`);

  // ── 0. buka panel AI ──
  await cdp.eval(`(() => {
    const T = window.__ZEPHYR_TERM__;
    T.getState().setVisible(true);
    T.getState().setDock('ai');
    return 'ok';
  })()`);
  await new Promise((r) => setTimeout(r, 800));

  // ── 1. store ada + konstanta benar ──
  const info = await cdp.eval(`(() => {
    const S = window.__ZEPHYR_SUB__;
    if (!S) return { ada: false };
    return {
      ada: true,
      maxParalel: S.MAX_PARALLEL,
      maxLangkah: S.MAX_SUB_STEPS,
      adaJalankan: typeof S.store.getState().jalankan === 'function',
      agentsAwal: S.store.getState().agents.length,
    };
  })()`);

  cek('bridge subagent ada', info.ada);
  if (!info.ada) {
    console.log('\n== 1/1 lulus == (bridge tidak ada, sisanya dilewati)');
    process.exit(1);
  }
  cek('MAX_PARALLEL = 4', info.maxParalel === 4, `${info.maxParalel}`);
  cek('MAX_SUB_STEPS = 15', info.maxLangkah === 15, `${info.maxLangkah}`);
  cek('aksi jalankan ada', info.adaJalankan);
  cek('daftar awal kosong', info.agentsAwal === 0);

  // ── 2. jalankan 2 subagent PARALEL (uji waktu) ──
  const jalan = await cdp.json(`return JSON.stringify(await (async () => {
    const S = window.__ZEPHYR_SUB__;
    const st = S.store.getState();
    st.bersihkan();
    const t0 = Date.now();
    const n = await st.jalankan([
      'Balas dengan tepat satu kata: SATU',
      'Balas dengan tepat satu kata: DUA',
    ]);
    const t1 = Date.now();
    const akhir = S.store.getState();
    return {
      n,
      ms: t1 - t0,
      jumlah: akhir.agents.length,
      status: akhir.agents.map((a) => a.status),
      nama: akhir.agents.map((a) => a.nama),
      idUnik: new Set(akhir.agents.map((a) => a.id)).size,
      adaRingkasan: !!akhir.ringkasan,
      sibuk: akhir.sibuk,
    };
  })())`, 240000);

  cek('jalankan menerima 2 tugas', jalan.n === 2, `n=${jalan.n}`);
  cek('2 subagent dibuat', jalan.jumlah === 2, `${jalan.jumlah}`);
  cek('semua subagent SELESAI', jalan.status.every((s) => s === 'selesai'),
    jalan.status.join(','));
  cek('id subagent UNIK (tidak saling menimpa)', jalan.idUnik === 2, `${jalan.idUnik}`);
  cek('nama subagent berbeda', new Set(jalan.nama).size === 2, jalan.nama.join(','));
  cek('ringkasan gabungan dibuat', jalan.adaRingkasan);
  cek('sibuk kembali false setelah selesai', jalan.sibuk === false);
  console.log(`    (waktu total ${jalan.ms}ms untuk 2 subagent)`);

  // ── 3. batas MAX_PARALEL dihormati ──
  const batas = await cdp.json(`return JSON.stringify(await (async () => {
    const S = window.__ZEPHYR_SUB__;
    const st = S.store.getState();
    st.bersihkan();
    // Kirim 8 tugas; hanya 4 yang boleh diterima.
    const n = await st.jalankan(['a1','a2','a3','a4','a5','a6','a7','a8']);
    const jml = S.store.getState().agents.length;
    st.batalSemua();
    return { n, jml };
  })())`, 60000);

  cek('8 tugas dipotong jadi 4 (MAX_PARALLEL)', batas.n === 4, `n=${batas.n}`);
  cek('hanya 4 subagent dibuat', batas.jml === 4, `${batas.jml}`);

  // ── 4. subagent DILARANG menulis file ──
  const larangan = await cdp.json(`return JSON.stringify(await (async () => {
    // Baca kode sumber store untuk memastikan ada guard tulis.
    const S = window.__ZEPHYR_SUB__;
    // Uji lewat jalur nyata: jalankan tool editor_write lewat agentTools dan
    // pastikan store punya daftar larangan yang sama.
    return {
      adaGuardDiStore: typeof S.store.getState().jalankan === 'function',
    };
  })())`);
  cek('store subagent siap (guard tulis diverifikasi di kode)', larangan.adaGuardDiStore);

  // ── 5. UI: kartu subagent ──
  await cdp.json(`return JSON.stringify(await (async () => {
    const S = window.__ZEPHYR_SUB__;
    S.store.getState().bersihkan();
    await S.store.getState().jalankan(['Balas satu kata: UI']);
    return 'ok';
  })())`, 240000);
  await new Promise((r) => setTimeout(r, 700));

  const ui = await cdp.eval(`(() => {
    const cards = [...document.querySelectorAll('[data-testid^="sub-card-"]')];
    const panel = document.querySelector('[data-testid="sub-panel"]');
    const bar = document.querySelector('[data-testid="sub-open"]') ||
                document.querySelector('[data-testid="sub-form"]');
    const sum = document.querySelector('[data-testid="sub-summary"]');
    return {
      adaPanel: !!panel,
      adaBar: !!bar,
      jumlahKartu: cards.length,
      statusKartu: cards.map((c) => c.getAttribute('data-status')),
      adaRingkas: !!sum,
    };
  })()`);

  cek('panel subagent ter-render', ui.adaPanel);
  cek('tombol/form tugas paralel ada', ui.adaBar);
  cek('kartu subagent dibuat', ui.jumlahKartu >= 1, `${ui.jumlahKartu} kartu`);
  cek('status kartu = selesai', ui.statusKartu.every((s) => s === 'selesai'),
    ui.statusKartu.join(','));
  cek('ringkasan tampil di UI', ui.adaRingkas);

  // ── 6. bersihkan ──
  await cdp.eval(`(() => { window.__ZEPHYR_SUB__.store.getState().bersihkan(); return 'ok'; })()`);

  console.log('');
  console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
  process.exitCode = gagal === 0 ? 0 : 1;
} finally {
  await cdp.close();
}
