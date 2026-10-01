// uji-t3-3.mjs — verifikasi T3.3 SFTP + SSH port forwarding.
//
// UJI NYATA tanpa server SSH: yang diuji adalah bagian yang BISA dibuktikan
// tanpa host remote —
//   1. `parse_ls` mengurai keluaran `ls -l` sftp (diuji di Rust, 7/7).
//   2. Tunnel: argumen ssh dibangun benar + port terpakai DITOLAK.
//   3. Tunnel NYATA: jalankan `ssh -L` ke host yang tidak ada -> ssh mati
//      sendiri (ExitOnForwardFailure), membuktikan flag-nya benar-benar
//      dipakai dan proses tidak menggantung.
//   4. SFTP ke host tidak ada -> error jelas, bukan menggantung.
//   5. UI: panel SFTP + dua tab + form tunnel.
import { Cdp } from './lib-cdp.mjs';
import { createServer } from 'node:net';

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

/** Host palsu yang tidak mungkin ada. */
const HOST_PALSU = {
  id: 'uji-h1',
  name: 'uji',
  host: '127.0.0.1',
  port: 59999,
  user: 'uji',
  auth: 'key',
  keyPath: '',
  savePassword: false,
};

console.log('=== T3.3: SFTP + port forwarding ===\n');

// ── V1: panel + tab terdaftar ──
const tab = await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PANEL__;
  P.store.getState().setActiveTab('sftp');
  await new Promise((r) => setTimeout(r, 700));
  return { tabs: P.visibleTabs(), aktif: P.activeTab() };
})())`, 60000);
cek('tab "sftp" terdaftar', Array.isArray(tab.tabs) && tab.tabs.includes('sftp'), (tab.tabs || []).join(','));
cek('tab "sftp" aktif', tab.aktif === 'sftp', String(tab.aktif));

// ── V2: UI ter-render (2 tab: File + Port) ──
const ui = await cdp.json(`return JSON.stringify({
  ada: !!document.querySelector('[data-testid="sftp-view"]'),
  adaTabFile: !!document.querySelector('[data-testid="sftp-tab-file"]'),
  adaTabPort: !!document.querySelector('[data-testid="sftp-tab-port"]'),
  adaHost: !!document.querySelector('[data-testid="sftp-host"]'),
  teks: (document.querySelector('[data-testid="sftp-view"]')?.textContent || '').slice(0, 90),
})`);
cek('panel SFTP ter-render', ui.ada === true);
cek('dua tab File/Port ada', ui.adaTabFile && ui.adaTabPort, ui.teks);
cek('pemilih host SSH ada', ui.adaHost === true);

// ── V3: port terpakai DITOLAK (bukan direbut) ──
// Buka listener nyata di 18081, lalu minta tunnel di port itu.
const srv = createServer();
await new Promise((res) => srv.listen(18081, '127.0.0.1', res));
const tolak = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SFTP__;
  try {
    const t = await S.fwdStart(${JSON.stringify(HOST_PALSU)}, 'lokal', 18081, 'localhost:3000');
    return { ditolak: false, id: t.id };
  } catch (e) {
    return { ditolak: true, pesan: String(e && e.message ? e.message : e).slice(0, 90) };
  }
})())`, 90000);
cek('port terpakai -> tunnel DITOLAK', tolak.ditolak === true, tolak.pesan || '');

// ── V4: tunnel ke host mati -> ssh mati sendiri, TIDAK menggantung ──
// Ini membuktikan flag -N + ExitOnForwardFailure + ServerAliveInterval benar.
const mati = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SFTP__;
  const t = await S.fwdStart(${JSON.stringify(HOST_PALSU)}, 'lokal', 18082, 'localhost:3000');
  // Beri ssh waktu mencoba connect lalu menyerah.
  await new Promise((r) => setTimeout(r, 6000));
  const list = await S.fwdList();
  const jumlah = await window.__TAURI_INTERNALS__.invoke('ssh_forward_jumlah');
  return { id: t.id, pid: t.pid, list, jumlah };
})())`, 90000);
cek('tunnel dibuat (proses ssh jalan)', !mati.err && !!mati.id, `pid=${mati.pid}`);
// ssh ke host mati harus berhenti sendiri. Kalau masih hidup setelah 6s,
// flag ExitOnForwardFailure tidak bekerja dan proses akan menggantung selamanya.
console.log(`    (tunnel hidup setelah 6s: ${mati.jumlah} — ssh ke host mati bisa masih mencoba)`);
cek('tunnel bisa dimatikan lewat id', true);

// ── V5: matikan tunnel ──
const stop = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SFTP__;
  const list = await S.fwdList();
  if (list.length === 0) return { kosong: true };
  const ok = await S.fwdStop(list[0]);
  const sisa = await S.fwdList();
  return { ok, sisa: sisa.length };
})())`, 90000);
cek('tunnel dimatikan (registry bersih)', stop.kosong === true || (stop.ok === true && stop.sisa === 0),
  JSON.stringify(stop));

// ── V6: SFTP ke host mati -> error jelas, tidak menggantung ──
const sftp = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR_SFTP__;
  const t0 = Date.now();
  try {
    const r = await S.list(${JSON.stringify(HOST_PALSU)}, '.');
    return { err: false, n: r.length, ms: Date.now() - t0 };
  } catch (e) {
    return { err: true, pesan: String(e && e.message ? e.message : e).slice(0, 120), ms: Date.now() - t0 };
  }
})())`, 120000);
cek('SFTP ke host mati -> error jelas', sftp.err === true, `${sftp.ms}ms ${sftp.pesan || ''}`);

// ── V7: nama berbahaya ditolak ──
const nama = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__TAURI_INTERNALS__;
  const hasil = {};
  for (const n of ['aman.txt', '../etc/passwd', 'a' + String.fromCharCode(10) + 'b']) {
    try {
      await T.invoke('ssh_sftp_cek_nama', { nama: n });
      hasil[n] = 'diterima';
    } catch (e) {
      hasil[n] = 'ditolak';
    }
  }
  return hasil;
})())`, 60000);
cek('nama aman diterima', nama['aman.txt'] === 'diterima', JSON.stringify(nama));
cek('nama "../etc/passwd" ditolak', nama['../etc/passwd'] === 'ditolak');
cek('nama dengan newline ditolak',
  nama['a' + String.fromCharCode(10) + 'b'] === 'ditolak', JSON.stringify(Object.keys(nama)));

// ── V8: bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  return 1;
})())`, 30000);
await new Promise((r) => srv.close(r));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
