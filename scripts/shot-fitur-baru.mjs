// shot-fitur-baru.mjs — screenshot fitur baru v1.1.10 untuk README.
//
// Kenapa CDP dan bukan alat screenshot OS: user memakai layarnya, dan
// Page.bringToFront dilarang di proyek ini. Page.captureScreenshot membaca
// surface WebView2 langsung, jadi jendela tidak perlu diangkat ke depan.
//
// PELAJARAN yang sudah dibayar (jangan diulang):
//   * deviceScaleFactor 2 untuk teks tajam di layar HiDPI.
//   * setDeviceMetricsOverride MENEMPEL sampai dicabut — WAJIB clearDeviceMetricsOverride
//     di akhir, kalau tidak harness verifikasi berikutnya membaca viewport palsu.
//   * Panel bawah harus dibuka dengan tinggi yang cukup, kalau tidak isinya
//     terpotong jadi satu baris.
//   * Workspace demo D:/zephyr-demo WAJIB dipercaya dulu (fase 29) — kalau tidak,
//     dialog trust modal + backdrop blur membuat SELURUH frame redup.

import fs from 'node:fs';
import path from 'node:path';
import { Cdp, sleep } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const OUT = 'D:/Zephyr/docs/screenshots';
const DEMO = 'D:/zephyr-demo';
const W = 1440;
const H = 810;

fs.mkdirSync(OUT, { recursive: true });

const { cdp, page } = await Cdp.attach('9223');
console.log('tersambung:', page.title);

await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: W,
  height: H,
  deviceScaleFactor: 2,
  mobile: false,
});
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

async function simpan(nama) {
  await sleep(1100);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const b64 = r?.result?.data;
  if (!b64) throw new Error(`captureScreenshot gagal (${nama})`);
  const file = path.join(OUT, `${nama}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`  ${nama}.png  ${Math.round(fs.statSync(file).size / 1024)} KB`);
}

/** Bersihkan notifikasi + status + palette sebelum memotret. */
const BERSIH = `
  window.__ZEPHYR_NOTIF__.clear();
  S.getState().setSettingsOpen(false);
  S.getState().setStatus('');
  CP.close();
`;

/** Buka panel bawah dengan tinggi tetap, tab tertentu. */
const panel = (tab, tinggi = 300) => `
  TS().setVisible(true);
  TS().setHeight(${tinggi});
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab(${JSON.stringify(tab)});
  await wait(400);
`;

console.log('menyiapkan workspace...');
await cdp.json(`
  ${BERSIH}
  await window.__ZEPHYR_WS__.setTrust('D:/Zephyr', true);
  await wait(300);
  const stA = S.getState();
  stA.setActivity('explorer');
  if (!stA.sidebarVisible) stA.toggleSidebar();
  if (stA.workspace !== 'D:/Zephyr') {
    await stA.openWorkspace('D:/Zephyr');
    await wait(1000);
  }
  return JSON.stringify({ ws: S.getState().workspace });
`);

// ── 1. Subagent paralel (fitur andalan) ──────────────────────────────────
console.log(
  '1:',
  await cdp.json(`
  ${BERSIH}
  TS().setVisible(true);
  TS().setHeight(320);
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  // Buka panel AI (dock bawah).
  TS().setDock('ai');
  await wait(500);

  // Isi store subagent dengan data NYATA supaya kartunya terlihat seperti
  // saat dipakai (bukan mock): dua agen, satu selesai satu jalan.
  const SUB = window.__ZEPHYR_SUB__;
  SUB.store.getState().bersihkan();
  // jalankan() memanggil provider nyata; kita tidak mau itu di screenshot.
  // Pakai setState langsung untuk mengisi tampilan.
  SUB.store.setState({
    sibuk: true,
    agents: [
      {
        id: 'demo-1', nama: 'Comet', tugas: 'Cari semua pemakaian fungsi parseConfig di src/',
        status: 'selesai', mulai: Date.now() - 8400, selesai: Date.now() - 1200,
        langkah: [
          { kind: 'pikir', teks: 'Saya perlu mencari pemanggilan parseConfig di seluruh src/, bukan hanya file yang terbuka.' },
          { kind: 'tool', nama: 'search_files', args: 'parseConfig, src/', hasil: '12 hasil di 5 file', ok: true },
          { kind: 'tool', nama: 'read_file', args: 'src/lib/config.ts', hasil: 'definisi + 3 pemakaian', ok: true },
        ],
        hasil: 'parseConfig dipakai di 5 file: config.ts (definisi), store.ts, aiStore.ts, cli.ts, main.ts.',
      },
      {
        id: 'demo-2', nama: 'Odyssey', tugas: 'Ringkas struktur folder src/components/ai',
        status: 'jalan', mulai: Date.now() - 3200,
        langkah: [
          { kind: 'pikir', teks: 'Folder ai punya beberapa komponen; saya baca daftar file dulu lalu ringkas perannya.' },
          { kind: 'tool', nama: 'scan_dir', args: 'src/components/ai', hasil: '8 komponen', ok: true },
        ],
      },
    ],
  });
  await wait(700);
  ${BERSIH}
  return JSON.stringify({ agen: SUB.store.getState().agents.length });
`),
);
await simpan('06-subagent-paralel');

// ── 2. API Client ────────────────────────────────────────────────────────
console.log(
  '2:',
  await cdp.json(`
  ${BERSIH}
  ${panel('api', 320)}
  const APIC = window.__ZEPHYR_API__;
  // Isi collection dengan contoh yang masuk akal supaya panel tidak kosong.
  APIC.store.setState({
    collections: [
      {
        id: 'c1', nama: 'Zephyr API',
        requests: [
          { id: 'r1', nama: 'Health check', method: 'GET', url: '{{base}}/health' },
          { id: 'r2', nama: 'Daftar model', method: 'GET', url: '{{base}}/v1/models' },
          { id: 'r3', nama: 'Kirim prompt', method: 'POST', url: '{{base}}/v1/chat' },
        ],
      },
    ],
    environments: [
      { id: 'e1', nama: 'Lokal', vars: [['base', 'http://127.0.0.1:9222']] },
    ],
    aktif: 'r2',
  });
  await wait(700);
  ${BERSIH}
  return JSON.stringify({ ok: true });
`),
);
await simpan('07-api-client');

// ── 3. Dev Environment ───────────────────────────────────────────────────
console.log(
  '3:',
  await cdp.json(`
  ${BERSIH}
  ${panel('devenv', 300)}
  await wait(2200);
  ${BERSIH}
  const nSvc = document.querySelectorAll('[data-testid^="devenv-svc-"]').length;
  return JSON.stringify({ layanan: nSvc });
`),
);
await simpan('08-devenv');

// ── 4. Database browser ──────────────────────────────────────────────────
console.log(
  '4:',
  await cdp.json(`
  ${BERSIH}
  ${panel('db', 300)}
  // Buat database contoh lalu buka lewat UI supaya tabel + hasil terlihat.
  const pathDb = 'D:/Zephyr/.shot-db.sqlite';
  // File dibuat lewat Node di luar; di sini cukup arahkan panelnya.
  const inp = document.querySelector('[data-testid="db-path"]');
  if (inp) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, pathDb);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(200);
    const tombol = document.querySelector('[data-testid="db-open"]');
    if (tombol) tombol.click();
    await wait(1200);
    const sql = document.querySelector('[data-testid="db-sql"]');
    if (sql) {
      const setS = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setS.call(sql, 'SELECT nama, harga FROM produk ORDER BY harga DESC');
      sql.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(200);
      const run = document.querySelector('[data-testid="db-run"]');
      if (run) run.click();
      await wait(900);
    }
  }
  ${BERSIH}
  return JSON.stringify({ baris: document.querySelectorAll('.db-table tbody tr').length });
`),
);
await simpan('09-database');

// ── 5. Test Explorer ─────────────────────────────────────────────────────
console.log(
  '5:',
  await cdp.json(`
  ${BERSIH}
  ${panel('test', 300)}
  await wait(1600);
  ${BERSIH}
  const nRun = document.querySelectorAll('.test-item').length;
  return JSON.stringify({ runner: nRun });
`),
);
await simpan('10-test-explorer');

// ── 6. Cloudflare Tunnel ─────────────────────────────────────────────────
console.log(
  '6:',
  await cdp.json(`
  ${BERSIH}
  ${panel('tunnel', 260)}
  await wait(1500);
  ${BERSIH}
  return JSON.stringify({ ok: !!document.querySelector('[data-testid="tunnel-view"]') });
`),
);
await simpan('11-tunnel');

// ── 7. SFTP + port forwarding ────────────────────────────────────────────
console.log(
  '7:',
  await cdp.json(`
  ${BERSIH}
  ${panel('sftp', 280)}
  await wait(1200);
  // Pindah ke tab Port supaya form tunnel terlihat.
  const tp = document.querySelector('[data-testid="sftp-tab-port"]');
  if (tp) { tp.click(); await wait(600); }
  ${BERSIH}
  return JSON.stringify({ ok: !!document.querySelector('[data-testid="sftp-view"]') });
`),
);
await simpan('12-sftp');

// ── 8. Zen mode ──────────────────────────────────────────────────────────
console.log(
  '8:',
  await cdp.json(`
  ${BERSIH}
  TS().setVisible(false);
  // Buka satu file supaya editor terisi.
  for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
  await S.getState().openPath('D:/Zephyr/src/lib/i18n.ts');
  await wait(900);
  window.__ZEPHYR_UI__.setMode('zen');
  await wait(600);
  ${BERSIH}
  return JSON.stringify({ mode: window.__ZEPHYR_UI__.mode() });
`),
);
await simpan('13-zen-mode');

// Kembalikan ke normal.
await cdp.json(`window.__ZEPHYR_UI__.setMode('normal'); return '1';`);

// WAJIB: cabut override emulasi. Kalau ditinggalkan, harness verifikasi
// berikutnya membaca viewport palsu.
await cdp.send('Emulation.clearDeviceMetricsOverride');
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });

console.log(
  'pulih:',
  await cdp.json(`
  TS().setVisible(false);
  TS().setDock('terminal');
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  await S.getState().openWorkspace('D:/Zephyr');
  await wait(900);
  for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
  ${BERSIH}
  return JSON.stringify({ ws: S.getState().workspace });
`),
);

console.log('SELESAI');
process.exit(0);
