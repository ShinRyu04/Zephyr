// uji-guard-listener.mjs - verifikasi guard listener tingkat modul.
//
// Kenapa STATIS, bukan runtime: `window.__TAURI_INTERNALS__.invoke` dikunci
// (writable:false, configurable:false), dan `window.__TAURI_INTERNALS__`
// sendiri juga begitu - pencatat runtime tidak bisa dipasang dari luar,
// assignment gagal diam-diam dan hitungannya nol untuk semua event. Itu
// kegagalan harness, bukan aplikasi.
//
// Yang diuji: setiap situs `listen('event', ...)` di App.tsx dijaga flag
// modul `*Bound` yang dicek sebelum pasang dan di-set sesudah sukses - pola
// yang mencegah StrictMode memasang effect dua kali (= teks dobel "HHaiai").
// `ram-usage` dikecualikan: ia helper di events.ts dengan satu pemilik,
// bukan effect yang bisa remount.
//
// Pakai: node scripts/uji-guard-listener.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync('src/App.tsx', 'utf8');

const target = {
  'onAiChunk': 'aiListenerBound',
  'onMcpScreenshot': 'mcpShotListenerBound',
  'onMcpConnect': 'mcpConnectListenerBound',
  'onGitProgress': 'gitProgressListenerBound',
};

let gagal = 0;
for (const [helper, guard] of Object.entries(target)) {
  const adaListen = src.includes(`${helper}(`);
  const adaGuard = src.includes(`let ${guard} = false`) && (src.includes(`if (!${guard}`) || src.includes(`if (${guard})`));
  const ok = adaListen && adaGuard;
  if (!ok) gagal++;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${helper} -> pakai:${adaListen ? 1 : 0} guard:${guard}=${adaGuard ? 1 : 0}`);
}
console.log(gagal === 0 ? 'SEMUA LULUS' : `${gagal} GAGAL`);
process.exitCode = gagal === 0 ? 0 : 1;
