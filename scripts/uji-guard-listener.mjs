// uji-guard-listener.mjs - verifikasi guard listener tingkat modul.
//
// Kenapa STATIS, bukan runtime: `window.__TAURI_INTERNALS__.invoke` dikunci
// (writable:false, configurable:false), dan `window.__TAURI_INTERNALS__`
// sendiri juga begitu - pencatat runtime tidak bisa dipasang dari luar,
// assignment gagal diam-diam dan hitungannya nol untuk semua event. Itu
// kegagalan harness, bukan aplikasi.
//
// Yang diuji: setiap situs `listen('event', ...)` di App.tsx punya penanda
// "sudah dipasang" yang dicek sebelum pasang - pola yang mencegah StrictMode
// memasang effect dua kali (= teks dobel "HHaiai"). Dua BENTUK penanda sah:
//
//   1. flag modul `*Bound` (aiListenerBound, gitProgressListenerBound);
//   2. bidang objek jembatan `jembatanMCP` yang disetel 'proses' sebelum
//      memasang dan SENGAJA tidak dilepas lagi (jembatanMCP.shot di
//      App.tsx:1241-1246, jembatanMCP.connect di :1263; alasan tidak dilepas
//      ada di komentar App.tsx:1274-1280 - cleanup justru akar bugnya).
//
// Versi lama hanya mengenal bentuk 1 DAN dengan nama literal
// `mcpShotListenerBound` / `mcpConnectListenerBound`, jadi dua situs yang
// benar dicap GAGAL.
//
// `ram-usage` dikecualikan: ia helper di events.ts dengan satu pemilik,
// bukan effect yang bisa remount.
//
// Pakai: node scripts/uji-guard-listener.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync('src/App.tsx', 'utf8');

const target = [
  { helper: 'onAiChunk', guard: ['let aiListenerBound = false', 'if (!aiListenerBound'] },
  { helper: 'onMcpScreenshot', guard: ['const jembatanMCP', 'if (!jembatanMCP.shot)', "jembatanMCP.shot = 'proses'"] },
  { helper: 'onMcpConnect', guard: ['const jembatanMCP', 'if (!jembatanMCP.connect)', "jembatanMCP.connect = 'proses'"] },
  { helper: 'onGitProgress', guard: ['let gitProgressListenerBound = false', 'if (gitProgressListenerBound) return'] },
];

let gagal = 0;
for (const { helper, guard } of target) {
  const adaListen = src.includes(`${helper}(`);
  const kurang = guard.filter((g) => !src.includes(g));
  const ok = adaListen && kurang.length === 0;
  if (!ok) gagal++;
  console.log(
    `${ok ? 'LULUS' : 'GAGAL'}  ${helper} -> pakai:${adaListen ? 1 : 0} guard:${kurang.length ? `kurang ${kurang.length}` : 'lengkap'}`,
  );
}
console.log(gagal === 0 ? 'SEMUA LULUS' : `${gagal} GAGAL`);
process.exitCode = gagal === 0 ? 0 : 1;
