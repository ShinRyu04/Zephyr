/*
 * G1 live: baris "Loop running" harus benar-benar hilang dari tumpukan status.
 *
 * Baris itu dulu muncul pada SETIAP run biasa (tidak ada loop terjadwal di
 * Zephyr), menghitung langkah agen sebagai "n runs", dan menyembunyikan menu ⋯
 * dengan satu isi: "Stop loop". Uji ini menjalankan tugas nyata yang singkat dan
 * MENGAMATI header saat sibuk - karena barisnya cuma ada saat sibuk, tidak ada
 * cara membuktikannya dari kode saja.
 *
 * Gerbang:
 *   G1 bagian "ai-work-stack-loop" benar-benar muncul selagi sibuk.
 *   G2 judulnya label jujur ("Thinking"/"Berpikir"), bukan "Loop running".
 *   G3 testid menu ⋯ / popup / Stop loop TIDAK PERNAH ada di DOM (sampel 400 ms).
 *   G4 tidak ada teks "Loop running" / "runs" di bagian itu.
 *   G5 run berakhir sendiri dan barisnya hilang lagi setelah idle.
 *
 * Pemakaian: node scripts/cek-stack-loop-live.mjs [port] [folder] [menit]
 */
import fs from 'node:fs';
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const WS = (process.argv[3] || 'D:/Testing/stack-loop').replace(/\\/g, '/');
const MENIT = Number(process.argv[4] || 6);

fs.mkdirSync(WS, { recursive: true });
const gagal = [];
const oknama = (n, lulus, catatan) => {
  console.log(`${lulus ? 'OK  ' : 'GAGAL'} ${n}${catatan ? ' - ' + catatan : ''}`);
  if (!lulus) gagal.push(n);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

const awal = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, ws: window.__ZEPHYR__.getState().workspace, model: A.model };
})())`);
console.log(`     sebelum: ws=${awal.ws} model=${awal.model} busy=${awal.busy}`);
if (awal.busy) {
  console.log('app sedang sibuk - uji ini butuh app idle (jalankan util-tunggu-idle dulu)');
  process.exit(2);
}

await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS)});
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  return true;
})())`);
for (let i = 0; i < 40; i++) {
  const r = await cdp.json(`return JSON.stringify({ ws: window.__ZEPHYR__.getState().workspace })`);
  if (String(r.ws ?? '').split(String.fromCharCode(92)).join('/') === WS) break;
  await sleep(500);
}
const wsKini = await cdp.json(`return JSON.stringify({ ws: window.__ZEPHYR__.getState().workspace })`);
if (String(wsKini.ws ?? '').split(String.fromCharCode(92)).join('/') !== WS) {
  console.log(`gagal pindah workspace: ${wsKini.ws}`);
  process.exit(3);
}

await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  if (A.newChat) A.newChat();
  if (A.setApprovalMode) A.setApprovalMode('auto');
  return true;
})())`);

const TUGAS = [
  'Tugas singkat: buat DUA berkas di dalam workspace.',
  '1. catatan.md - lima baris berisi ringkasan singkat proyek ini.',
  '2. halaman.html - halaman HTML kecil yang menautkan catatan itu.',
  'Tulis keduanya dengan write_file, isi nyata (tanpa placeholder), lalu tutup dengan satu baris ringkasan.',
].join(' ');

await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)});
  return true;
})())`);
console.log('     tugas dikirim, mulai mengamati header...');

/* Satu loop di dalam halaman: sampel tiap 400 ms, berhenti setelah run selesai
 * (atau jendela waktu habis). Jejaknya dikembalikan sebagai data. */
const jejak = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  const keluar = [];
  let pernahSibuk = false;
  let sibukSejak = 0;
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const busy = !!A.getState().agentBusy;
    if (busy && !pernahSibuk) { pernahSibuk = true; sibukSejak = Date.now(); }
    const sec = document.querySelector('.ai-work-section[data-testid="ai-work-stack-loop"]');
    const title = sec ? sec.querySelector('.ai-work-title') : null;
    keluar.push({
      t: Date.now() - t0,
      busy: busy,
      sec: !!sec,
      judul: title ? String(title.textContent || '').trim() : null,
      menu: !!document.querySelector('[data-testid="ai-work-menu"]'),
      popup: !!document.querySelector('[data-testid="ai-work-menu-pop"]'),
      stop: !!document.querySelector('[data-testid="ai-work-stop"]'),
      langkah: A.getState().agentStates[Object.keys(A.getState().agentStates)[0]] ? true : false,
    });
    if (pernahSibuk && !busy && Date.now() - sibukSejak > 3000) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return {
    selesai: !A.getState().agentBusy,
    sampel: keluar.length,
    pertamaSibuk: keluar.findIndex((k) => k.busy),
    secMuncul: keluar.some((k) => k.busy && k.sec),
    judulUnik: [...new Set(keluar.filter((k) => k.sec).map((k) => k.judul))],
    menuPernah: keluar.some((k) => k.menu || k.popup || k.stop),
    secSaatAdaMenu: keluar.filter((k) => k.menu || k.popup || k.stop).length,
    secAkhirLiving: (() => { const l = keluar[keluar.length - 1]; return l ? l.sec : null; })(),
    langkah: keluar.length,
  };
})())`,
  (MENIT + 1) * 60000,
);

const detik = jejak.sampel * 0.4;
console.log(
  `     jejak: ${jejak.sampel} sampel (~${Math.round(detik)}s), sibuk mulai sampel ke-${jejak.pertamaSibuk}, selesai=${jejak.selesai}`,
);
console.log(`     judul yang terlihat: ${JSON.stringify(jejak.judulUnik)}`);

oknama('G1 bagian baris loop muncul selagi sibuk', jejak.secMuncul === true, `sec=${jejak.secMuncul}`);
const judulOk = jejak.judulUnik.length > 0 && jejak.judulUnik.every((t) => /^(Thinking|Berpikir|思考中|생각 중)$/.test(String(t || '').trim()));
oknama('G2 judulnya label jujur (Thinking/Berpikir), bukan "Loop running"', judulOk, JSON.stringify(jejak.judulUnik));
const adaRuns = jejak.judulUnik.some((t) => /runs|Loop running/i.test(String(t || '')));
oknama('G3 tidak ada "Loop running" / "n runs" di header', !adaRuns, `judul=${JSON.stringify(jejak.judulUnik)}`);
oknama(
  'G4 menu ⋯ / popup / Stop loop tidak pernah muncul',
  jejak.menuPernah === false,
  `sampel dengan menu=${jejak.secSaatAdaMenu}`,
);
oknama('G5 run berakhir sendiri', jejak.selesai === true, `selesai=${jejak.selesai}`);
await sleep(1500);
const sesudah = await cdp.json(
  `return JSON.stringify({ busy: window.__ZEPHYR_AI__.store.getState().agentBusy, sec: !!document.querySelector('.ai-work-section[data-testid="ai-work-stack-loop"]') })`,
);
oknama(
  'G5b baris ikut hilang setelah idle',
  sesudah.busy === false,
  `busy=${sesudah.busy} sec=${sesudah.sec}`,
);

const berkas = fs.existsSync(WS.replace(/\//g, '\\'));
console.log(`     (folder uji: ${WS} ada=${berkas})`);

console.log(gagal.length ? `GAGAL: ${gagal.join(', ')}` : 'SEMUA GERBANG LULUS');
await cdp.close();
process.exit(gagal.length ? 1 : 0);
