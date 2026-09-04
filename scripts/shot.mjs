// shot.mjs — screenshot ASLI dari app hidup lewat CDP, untuk README.
//
// Kenapa CDP dan bukan alat screenshot OS: user memakai layarnya, dan
// Page.bringToFront dilarang di proyek ini. Page.captureScreenshot membaca
// surface WebView2 langsung, jadi jendela tidak perlu diangkat ke depan.
//
// Workspace SENGAJA bukan D:/Zephyr: repo ini penuh artefak kerja (BUGLOG.md,
// LANJUT-FASE-21.md, folder fixture bernama angka) yang membuat tree terlihat
// seperti folder sampah. D:/zephyr-demo proyek kecil yang wajar dilihat.
//
// PELAJARAN yang sudah dibayar (jangan diulang):
//   * Folder demo WAJIB dipercaya dulu (fase 29) — kalau tidak, dialog trust
//     modal + backdrop blur membuat SELURUH frame redup dan buram.
//   * Path anak di explorer store memakai BACKSLASH ('D:/zephyr-demo\\src')
//     sementara root memakai slash. Jangan susun path sendiri; baca node.path.
//   * toggleExpand tidak memuat isi direktori — loadDir dulu, kalau tidak
//     folder terbuka tapi kosong.
//   * Tab panel wajib disetel eksplisit ke 'terminal'; kalau tab 'output'
//     tertinggal aktif, isinya cuma "Channel Zephyr masih kosong".
//   * deviceScaleFactor 2 untuk teks tajam di layar HiDPI.

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
  // 2x: README dibaca di layar HiDPI; 1x membuat teks 12px terlihat kabur.
  deviceScaleFactor: 2,
  mobile: false,
});
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

async function simpan(nama) {
  await sleep(900);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const b64 = r?.result?.data;
  if (!b64) throw new Error(`captureScreenshot gagal (${nama}): ${JSON.stringify(r).slice(0, 200)}`);
  const file = path.join(OUT, `${nama}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`  ${nama}.png  ${Math.round(fs.statSync(file).size / 1024)} KB`);
}

const BERSIH = `
  window.__ZEPHYR_NOTIF__.clear();
  S.getState().setSettingsOpen(false);
  // Pesan status error dari sesi uji sebelumnya ikut terfoto. Ini bukan bug
  // produk: penyebabnya harness lama memanggil killPane TANPA await, jadi
  // promise-nya jadi unhandledrejection dan handler global di App.tsx
  // melaporkannya. Tetap dibersihkan supaya frame bersih.
  S.getState().setStatus('');
  // Palette WAJIB ditutup: adegan sebelumnya meninggalkannya terbuka dan
  // modal itu meredupkan SELURUH frame adegan berikutnya.
  CP.close();
`;

const LIPAT_TIMELINE = `
  const tgl = q('[data-testid="timeline-toggle"]');
  if (tgl && tgl.getAttribute('aria-expanded') === 'true') tgl.click();
  await wait(250);
`;

/** Buka folder demo + seluruh subfolder, lalu percayai. Dipakai semua adegan. */
const SIAP = `
  ${BERSIH}
  await WS.setTrust(${JSON.stringify(DEMO)}, true);
  await wait(250);
  const st = S.getState();
  st.setActivity('explorer');
  if (!st.sidebarVisible) st.toggleSidebar();
  if (st.workspace !== ${JSON.stringify(DEMO)}) {
    await st.openWorkspace(${JSON.stringify(DEMO)});
    await wait(900);
  }
  // EXP, bukan EX: prelude lib-cdp.mjs sudah memakai "const EX".
  const EXP = window.__ZEPHYR_EX__;
  const E = () => EXP.getState();
  const bukaRek = async (dir, sisa) => {
    await E().loadDir(dir, true);
    await wait(200);
    if (!E().expanded[dir]) { await E().toggleExpand(dir); await wait(200); }
    if (sisa <= 0) return;
    for (const n of (E().children[dir] || []).filter((x) => x.isDir)) {
      await bukaRek(n.path, sisa - 1);
    }
  };
  // node_modules DIKECUALIKAN: kalau ikut diexpand, isinya membanjiri sidebar
  // dan menutupi struktur proyek yang justru ingin ditunjukkan.
  const lewati = (p) => /node_modules|[\\\\/]\\.git$/.test(p);
  for (const n of (E().children[${JSON.stringify(DEMO)}] || []).filter((x) => x.isDir && !lewati(x.path))) {
    await bukaRek(n.path, 2);
  }
  ${LIPAT_TIMELINE}
`;

// ── 1. Editor + explorer + terminal ───────────────────────────────────────
console.log(
  '1:',
  await cdp.json(`
  ${SIAP}
  for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
  await S.getState().openPath(${JSON.stringify(DEMO + '/src/lib/router.ts')});
  await wait(700);
  const cm = window.__ZEPHYR_CM__ && window.__ZEPHYR_CM__();
  if (cm) {
    // Kursor di AKHIR baris: kolom 1 pada baris lanjutan terlihat nyasar.
    const ln = cm.state.doc.line(24);
    cm.dispatch({ selection: { anchor: ln.to }, scrollIntoView: true });
  }
  await wait(350);

  TS().setVisible(true);
  TS().setHeight(180);
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  await wait(300);
  // TAB terminal lama ditutup seluruhnya, bukan pane-nya dibunuh satu-satu.
  // killPane menyisakan pane berlabel "exited" dengan scrollback pager mati
  // yang tetap terlihat di frame, dan menambah pane baru = layar terbagi dua.
  for (const t of [...TS().terminalTabs]) TS().closeTab(t.id);
  await wait(700);
  TS().newTab();
  await TS().addPane('shell');
  await wait(3200);

  const p1 = TS().allPanes()[0] && TS().allPanes()[0].id;
  if (p1) {
    // Jebakan yang sudah kena di sini:
    //   * npx tanpa typescript lokal mencetak dua baris saran instalasi.
    //   * '; echo "tsc: 0 error"' itu BOHONG — ';' di PowerShell bukan gerbang
    //     sukses, teks tercetak walau tsc gagal.
    //   * 'git log' tanpa --no-pager berhenti di pager less.
    //   * Beberapa PTY.write berurutan memicu bracketed-paste PSReadLine
    //     ("Accept pasted input") — kirim SATU perintah saja per pane baru.
    PTY.write(p1, 'npm run typecheck; git --no-pager log --oneline -3\\r');
    await wait(8000);
  }
  ${BERSIH}
  return JSON.stringify({ tab: S.getState().tabs.length, pane: TS().allPanes().length });
`),
);
await simpan('01-editor');

/** Adegan tambahan: Source Control, palette, dan AI panel. */
const ADEGAN = [
  {
    nama: '02-source-control',
    kode: `
      ${SIAP}
      TS().setVisible(false);
      S.getState().setActivity('scm');
      await wait(500);
      if (window.__ZEPHYR_GIT__) {
        await window.__ZEPHYR_GIT__.refresh();
        await wait(1400);
      }
      for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
      await S.getState().openPath(${JSON.stringify(DEMO + '/src/routes/halaman.ts')});
      await wait(700);
      ${BERSIH}
      return JSON.stringify({
        activity: S.getState().activity,
        berubah: (window.__ZEPHYR_GIT__.changes() || []).length,
      });
    `,
  },
  {
    nama: '03-palette',
    kode: `
      ${SIAP}
      TS().setVisible(false);
      S.getState().setActivity('explorer');
      // CP.open dipanggil SETELAH SIAP (yang memuat BERSIH → CP.close()).
      CP.open('command');
      await wait(500);
      CP.setQuery('git');
      await wait(700);
      // BERSIH TIDAK dipakai di sini: ia menutup palette, dan palette
      // justru subjek foto ini.
      window.__ZEPHYR_NOTIF__.clear();
      S.getState().setStatus('');
      return JSON.stringify({
        mode: q('[data-testid="cp-modal"]') && q('[data-testid="cp-modal"]').dataset.mode,
        item: qa('[data-testid="cp-list"] [role="option"]').length,
      });
    `,
  },
];

for (const a of ADEGAN) {
  console.log(`${a.nama}:`, await cdp.json(a.kode));
  await simpan(a.nama);
}

// WAJIB: cabut override emulasi.
//
// setDeviceMetricsOverride MENEMPEL di page sampai dicabut atau app di-restart.
// Kalau ditinggalkan, harness verifikasi berikutnya membaca viewport palsu —
// verify12 V5 mengukur lebar pane 0px dan gagal, padahal produknya benar.
await cdp.send('Emulation.clearDeviceMetricsOverride');
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });

// Pulihkan workspace ke D:/Zephyr: harness fase 12/22/23/25 mengharapkannya,
// dan extensions_load fase 29 menolak jalan tanpa workspace.
console.log(
  'pulih:',
  await cdp.json(`
  await WS.setTrust('D:/Zephyr', true);
  await wait(200);
  await S.getState().openWorkspace('D:/Zephyr');
  await wait(900);
  for (const t of [...S.getState().tabs]) S.getState().forceCloseTab(t.id);
  ${BERSIH}
  return JSON.stringify({ ws: S.getState().workspace, tab: S.getState().tabs.length });
`),
);

console.log('SELESAI');
process.exit(0);

