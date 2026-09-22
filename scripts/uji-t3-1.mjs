// uji-t3-1.mjs — verifikasi T3.1 Dev Environment.
//
// UJI NYATA: deteksi layanan di D:\DevEnv, lalu benar-benar MENYALAKAN Redis
// (paling ringan, ~2 MB) dan membuktikan port 6379 menjawab, lalu mematikannya.
//
// KENAPA Redis: PHP/Nginx/MariaDB butuh konfigurasi awal (vhost, data dir).
// Redis jalan tanpa config apa pun — jadi ia membuktikan jalur spawn bekerja
// tanpa menuntut setup yang belum ada.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
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

console.log('=== T3.1: Dev Environment ===\n');

// ── V1: deteksi layanan ──
const det = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DEVENV__;
  if (!D) return { err: 'bridge devenv tidak ada' };
  const r = await D.detect();
  const per = {};
  for (const x of r) per[x.layanan] = (per[x.layanan] || []).concat(x.versi);
  return { n: r.length, per, adaExe: r.every((x) => !!x.exe) };
})())`, 90000);
cek('devenv_detect jalan', !det.err, `n=${det.n}`);
cek('semua layanan punya path exe', det.adaExe === true);
cek('PHP terdeteksi', !!(det.per && det.per.php), JSON.stringify(det.per && det.per.php));
cek('Redis terdeteksi', !!(det.per && det.per.redis), JSON.stringify(det.per && det.per.redis));
cek('MariaDB terdeteksi', !!(det.per && det.per.mariadb), JSON.stringify(det.per && det.per.mariadb));
cek('Nginx terdeteksi', !!(det.per && det.per.nginx), JSON.stringify(det.per && det.per.nginx));

// ── V2: panel ter-render ──
await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PANEL__;
  P.store.getState().setActiveTab('devenv');
  await new Promise((r) => setTimeout(r, 900));
  return 1;
})())`, 60000);
// Panel memuat daftar lewat Rust — periksa DOM setelah daftar benar-benar
// muncul, bukan setelah jangka waktu tetap (deteksi bisa >1s di folder besar).
let ui = { ada: false, nSvc: 0, nVer: 0, teks: '' };
for (let i = 0; i < 20; i++) {
  ui = await cdp.json(`return JSON.stringify({
    ada: !!document.querySelector('[data-testid="devenv-view"]'),
    nSvc: document.querySelectorAll('[data-testid^="devenv-svc-"]').length,
    nVer: document.querySelectorAll('[data-testid^="devenv-ver-"]').length,
    teks: (document.querySelector('[data-testid="devenv-view"]')?.textContent || '').slice(0, 100),
  })`);
  if (ui.nSvc >= 4) break;
  await new Promise((r) => setTimeout(r, 700));
}
cek('panel Dev Environment ter-render', ui.ada === true);
cek('UI menampilkan layanan', ui.nSvc >= 4, `${ui.nSvc} layanan`);
cek('UI menampilkan versi', ui.nVer >= 1, `${ui.nVer} versi | ${ui.teks}`);

// ── V3: NYALAKAN Redis (bukti jalur spawn bekerja) ──
const nyala = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DEVENV__;
  const r = await D.detect();
  const redis = r.find((x) => x.layanan === 'redis');
  if (!redis) return { err: 'redis tidak ada di DevEnv' };
  const h = await D.start('redis', redis.path);
  return { pid: h.pid, port: h.port, layanan: h.layanan };
})())`, 90000);
cek('Redis dinyalakan (spawn lewat proc::cmd)', !nyala.err && nyala.pid > 0,
  `pid=${nyala.pid} port=${nyala.port}`);

// Tunggu redis siap (biasanya < 2s).
let siap = false;
for (let i = 0; i < 14; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const st = await cdp.json(`return JSON.stringify(await (async () => {
    const D = window.__ZEPHYR_DEVENV__;
    const s = await D.status();
    return { layanan: s.map((x) => x.layanan), redis: !!s.find((x) => x.layanan === 'redis') };
  })())`, 60000);
  if (st.redis) {
    siap = true;
    console.log(`    (redis siap setelah ${i + 1}s)`);
    break;
  }
}
cek('port 6379 BENAR-BENAR menjawab (redis siap)', siap);

// ── V4: port yang sudah dipakai TIDAK direbut ──
const rebut = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DEVENV__;
  const r = await D.detect();
  const redis = r.find((x) => x.layanan === 'redis');
  try {
    await D.start('redis', redis.path);
    return { ditolak: false };
  } catch (e) {
    return { ditolak: true, pesan: String(e && e.message ? e.message : e).slice(0, 110) };
  }
})())`, 60000);
cek('port terpakai -> ditolak (tidak merebut)', rebut.ditolak === true, rebut.pesan || '');

// ── V5: matikan lagi (tidak meninggalkan proses) ──
const mati = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DEVENV__;
  const ok = await D.stop(6379);
  await new Promise((r) => setTimeout(r, 1500));
  const s = await D.status();
  return { ok, masihHidup: !!s.find((x) => x.layanan === 'redis') };
})())`, 90000);
cek('devenv_stop mematikan redis', mati.ok === true && mati.masihHidup === false,
  `ok=${mati.ok} masihHidup=${mati.masihHidup}`);

// ── V6: tutup panel ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  return 1;
})())`, 30000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
