// verify33.mjs — regression guard untuk dua bug fatal di src/lib/aiStore.ts.
//
// Kenapa tes ini ada: dua bug ini sudah pernah terjadi, dan keduanya TIDAK
// punya tes sama sekali. Yang ada hanya uji-t7-performa.mjs, dan itu pun cuma
// memeriksa konstanta HISTORY_*, bukan perilakunya. Akibatnya nyata: saat sesi
// berikutnya mencari watchdog-nya, ia dikira hilang (namanya bahasa Indonesia,
// pencarian bahasa Inggris tidak menemukan) dan hampir ditulis ulang.
//
// Yang dijaga:
//   BUG 1  status 'completed' dari model dulu dipaksa jadi 'pending', jadi todo
//          tidak pernah centang dan AI mengulang tugasnya tanpa henti.
//   BUG 2  aksi tool yang sama diulang tanpa progres dulu tidak terdeteksi,
//          jadi agent bisa berputar selamanya (loop setan).
//
// Kenapa lewat CDP dan bukan unit test Node: aiStore.ts menarik rantai import
// Tauri (@tauri-apps/api/core, plugin-opener) yang mengevaluasi
// window.__TAURI_INTERNALS__ saat modul dimuat, jadi `import` di Node meledak
// sebelum store terbentuk. Tidak ada skrip di repo ini yang meng-import
// aiStore.ts dari Node - semuanya lewat CDP. Ikut pola itu.
//
// Pakai: node scripts/verify33.mjs [port-cdp]
// Syarat: zephyr.exe hidup dengan --remote-debugging-port=<port> DAN dev server.

import { Cdp, reporter, keluarBersih } from './lib-cdp.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const R = reporter('aiStore guard');

async function main() {
  console.log('== aiStore guard (2 bug fatal) ==\n');
  const { cdp } = await Cdp.attach(CDP_PORT);

  // ---------------------------------------------------------------- BUG 1
  // 'completed' dari model harus bertahan sebagai 'done'. Dulu dipaksa
  // 'pending', dan itu mematikan SELURUH fitur todo: tidak ada yang pernah
  // centang, jadi agent mengulang tugas yang sudah selesai.
  const v1 = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    const st = m.useAi.getState();
    st.setAgentTodos([
      { content: 'tugas satu', status: 'completed' },
      { content: 'tugas dua', status: 'pending' },
      { content: 'tugas tiga', status: 'done' },
    ]);
    return JSON.stringify(m.useAi.getState().agentTodos.map((t) => t.status));
  `);
  const status1 = JSON.parse(v1);
  R.check('V1', status1[0] === 'done', `'completed' bertahan jadi 'done' (dapat: ${status1[0]})`);
  R.check('V2', status1[1] === 'pending', `'pending' tetap 'pending' (dapat: ${status1[1]})`);
  R.check('V3', status1[2] === 'done', `'done' tetap 'done' (dapat: ${status1[2]})`);

  // Sinonim lain yang dipakai model berbeda-beda. Kalau salah satu lolos diam
  // saat ditambah, todo akan berhenti centang lagi - persis bug aslinya.
  const v2 = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    const st = m.useAi.getState();
    st.setAgentTodos([
      { content: 'a', status: 'complete' },
      { content: 'b', status: 'finished' },
      { content: 'c', status: 'selesai' },
      { content: 'd', status: 'SELESAI' },
    ]);
    return JSON.stringify(m.useAi.getState().agentTodos.map((t) => t.status));
  `);
  const status2 = JSON.parse(v2);
  R.check('V4', status2.every((s) => s === 'done'), `sinonim complete/finished/selesai -> done (dapat: ${status2.join(',')})`);

  // ---------------------------------------------------------------- BUG 2
  // Watchdog harus MENGHENTIKAN, bukan cuma menghitung. Bug asli bukan
  // "tidak ada deteksi", tapi deteksi yang dihitung lalu diabaikan.
  //
  // catatAksiBerulang dipanggil dengan URUTAN KEY BERBEDA dan path beda
  // huruf/slash - pemanggilan yang sama secara makna harus menghasilkan
  // sidik jari yang sama, kalau tidak deteksinya bisa dilewati.
  const v3 = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    const peta = new Map();
    const a = m.catatAksiBerulang(peta, 'file_read', { path: 'D:\\\\Zephyr\\\\A.ts', line: 1 });
    const b = m.catatAksiBerulang(peta, 'file_read', { line: 1, path: 'd:/zephyr/a.ts' });
    return JSON.stringify({ a, b });
  `);
  const ulang = JSON.parse(v3);
  R.check(
    'V5',
    ulang.a.jumlah === 1 && ulang.b.jumlah === 2,
    `sidik jari menormalkan key order + path (jumlah ${ulang.a.jumlah} -> ${ulang.b.jumlah})`,
  );
  R.check('V6', ulang.a.hentikan === false, `panggilan pertama belum hentikan (dapat: ${ulang.a.hentikan})`);

  // Urutan lengkapnya yang penting, bukan satu panggilan terakhir:
  //   1  -> jalan biasa
  //   2  -> PERINGATAN (sekali saja, tepat di panggilan kedua)
  //   3+ -> HENTIKAN
  //
  // `ingatkan` memakai `===`, jadi ia hanya true TEPAT di detik kedua. Kalau
  // seseorang kelak mengubahnya jadi `>=`, peringatan akan diulang setiap kali
  // dan tes ini menangkapnya - itu perilaku yang berbeda.
  const v4 = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    const peta = new Map();
    const urut = [];
    for (let i = 0; i < 4; i++) {
      const r = m.catatAksiBerulang(peta, 'shell_exec', { cmd: 'npm test' });
      urut.push({ jumlah: r.jumlah, ingatkan: r.ingatkan, hentikan: r.hentikan });
    }
    return JSON.stringify(urut);
  `);
  const urut = JSON.parse(v4);
  R.check('V7', urut[0].ingatkan === false && urut[0].hentikan === false, `aksi ke-1 jalan biasa (ingatkan=${urut[0].ingatkan}, hentikan=${urut[0].hentikan})`);
  R.check('V8', urut[1].ingatkan === true && urut[1].hentikan === false, `aksi ke-2 MEMBERI PERINGATAN, belum hentikan (ingatkan=${urut[1].ingatkan}, hentikan=${urut[1].hentikan})`);
  R.check('V8b', urut[2].hentikan === true && urut[3].hentikan === true, `aksi ke-3+ MENGHENTIKAN loop (ke-3=${urut[2].hentikan}, ke-4=${urut[3].hentikan})`);
  R.check('V8c', urut[3].ingatkan === false, `peringatan tidak diulang di ke-4 (dapat: ${urut[3].ingatkan})`);

  // Aksi BERBEDA tidak boleh dianggap berulang - kalau tidak, agent normal
  // akan dihentikan di tengah kerja.
  const v5 = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    const peta = new Map();
    let r;
    for (let i = 0; i < 5; i++) r = m.catatAksiBerulang(peta, 'file_read', { path: 'file' + i + '.ts' });
    return JSON.stringify(r);
  `);
  const beda = JSON.parse(v5);
  R.check('V9', beda.hentikan === false, `aksi berbeda tidak dihentikan (dapat: ${beda.hentikan})`);

  // ---------------------------------------------------------------- BUG 3
  // Context bloat: nilai ini dijaga eksplisit karena menaikkannya kembali
  // membuat langkah ke-14 memakan puluhan ribu token (bug asli).
  const v6 = await cdp.runAsync(`
    const m = await import('/src/lib/aiStore.ts');
    return JSON.stringify({
      chars: m.HISTORY_TOOL_CHARS,
      steps: m.HISTORY_KEEP_STEPS,
      ringkasAda: typeof m.ringkasRiwayat === 'function',
    });
  `);
  const batas = JSON.parse(v6);
  R.check('V10', batas.chars <= 800, `HISTORY_TOOL_CHARS tetap kecil (dapat: ${batas.chars})`);
  R.check('V11', batas.steps <= 10, `HISTORY_KEEP_STEPS tetap kecil (dapat: ${batas.steps})`);
  R.check('V12', batas.ringkasAda === true, 'ringkasRiwayat masih diekspor (dipakai pemotongan riwayat)');

  R.selesai();
  await cdp.close();
  keluarBersih(0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  keluarBersih(1);
});
