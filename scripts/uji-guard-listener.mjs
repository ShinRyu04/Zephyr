// uji-guard-listener.mjs - verifikasi guard listener tingkat modul.
//
// Kenapa bukan tsc saja: tsc membuktikan tidak ada error tipe, BUKAN bahwa
// listener hanya terpasang sekali saat StrictMode memasang effect dua kali.
// Uji ini menempel ke WebView yang SEDANG berjalan lewat CDP, menyuntikkan
// pencatat SEBELUM bundel app dieksekusi, lalu menghitung berapa kali
// plugin:event|listen dipanggil per nama event.
//
// Pakai: node scripts/uji-guard-listener.mjs [portCdp]

import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';

// Disuntik lewat Page.addScriptToEvaluateOnNewDocument supaya berjalan SEBELUM
// modul app (yang meng-capture invoke ke binding lokal saat load).
const RECORDER = `
window.__ujiListener = { hitung: {}, dilepas: {} };
(() => {
  let T = window.__TAURI_INTERNALS__;
  let invokeAsli = null;
  const pasangWrap = () => {
    T = window.__TAURI_INTERNALS__;
    if (!T || typeof T.invoke !== 'function' || T.invoke === invokeAsli) return !!invokeAsli;
    invokeAsli = T.invoke;
    T.invoke = function (cmd, args, opts) {
      const e = args && args.event;
      if (cmd === 'plugin:event|listen' && e) {
        window.__ujiListener.hitung[e] = (window.__ujiListener.hitung[e] || 0) + 1;
      }
      if (cmd === 'plugin:event|unlisten' && e) {
        window.__ujiListener.dilepas[e] = (window.__ujiListener.dilepas[e] || 0) + 1;
      }
      return invokeAsli.call(this, cmd, args, opts);
    };
    return true;
  };
  if (!pasangWrap()) {
    // Belum ada; coba lagi tiap tick sampai modul Tauri siap.
    const id = setInterval(() => { if (pasangWrap()) clearInterval(id); }, 1);
  }
})();
`;

const BACA = `(() => new Promise((res) => setTimeout(() => res(JSON.stringify(window.__ujiListener || null)), 50)))()`;

const main = async () => {
  // attach() mengembalikan { cdp, page }; objek Cdp-nya ada di .cdp.
  const { cdp } = await Cdp.attach(PORT);
  try {
    console.log('terhubung ke CDP :' + PORT);
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
    console.log('pencatat dipasang sebelum navigasi');

    // Muat ulang penuh: StrictMode akan memasang setiap effect DUA kali, jadi
    // tanpa guard jumlah listen per event akan >= 2.
    await cdp.eval('location.reload()');
    await sleep(10000);

    const raw = await cdp.eval(BACA);
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data) {
      console.log('GAGAL  pencatat tidak ada di halaman');
      process.exitCode = 2;
      return;
    }
    const hitung = data.hitung || {};

    const target = ['mcp-screenshot', 'mcp-connect', 'git-progress', 'ram-usage'];
    let gagal = 0;
    for (const ev of target) {
      const n = hitung[ev] ?? 0;
      const ok = n === 1;
      if (!ok) gagal++;
      console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${ev} -> ${n} pemasangan (harus 1)`);
    }
    console.log('--- semua event yang terdaftar (nama -> jumlah listen) ---');
    console.log(JSON.stringify(hitung, null, 1));
    console.log(gagal === 0 ? 'SEMUA LULUS' : `${gagal} GAGAL`);
    process.exitCode = gagal === 0 ? 0 : 1;
  } finally {
    if (typeof cdp.close === 'function') await cdp.close();
  }
};

main().catch((e) => {
  console.error('gagal: ', e?.message || e);
  process.exit(2);
});
