/**
 * verify-browser-tab.mjs - bukti bahwa browser Zephyr hidup sebagai TAB EDITOR.
 *
 * Yang dibuktikan (dari DOM/state yang HIDUP, bukan dari bacaan sumber):
 *   V1 ikon `browser` ada di ActivityBar, urutannya setelah `scm` dan sebelum
 *      `debug` (urutan yang diminta pemilik aplikasi)
 *   V2 membuka tab Browser membuat tab `view === 'browser'` + host `.bp-tab-host`
 *      benar-benar ter-mount dan berukuran (bukan pane di panel terminal)
 *   V3 panel terminal TIDAK lagi memuat pane browser (0)
 *   V4 URL kedua MEMAKAI ULANG tab yang sama (tetap 1, id tetap, url berganti)
 *   V5 toolbar TRAE lengkap: back/fwd/reload/home + url + external, tanpa `▾`
 *   V6 tool `browser` aksi open membuka TAB (bukan pane), aksi list menjawab
 *   V7 tool `browser` aksi close menutup tab; host ikut hilang
 *
 * Pakai: npm run verify:browser-tab
 * Prasyarat: dev server (npm run dev) + app dengan --remote-debugging-port=9223.
 * Tanpa CDP, skrip keluar kode 2 (prasyarat tidak terpenuhi) - supaya "tidak
 * dijalankan" tidak pernah terbaca sebagai "lulus".
 */
import { Cdp, reporter, sleep, keluarBersih } from './lib-cdp.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT || '9223';
const ID_TAB_BROWSER = 'tab-browser';
const URL_A = 'https://example.org/';
const URL_B = 'https://example.org/?kedua=1';

const R = reporter('browser sebagai TAB EDITOR (bukan pane)');

/**
 * Potongan bersama: pembacaan state + DOM.
 *
 * Di dalam `runAsync`, `S` = store utama, `TS()` = store terminal, `q`/`qa` =
 * querySelector. Host webview dibaca dari `.bp-tab-host` (pembungkus stage tab
 * browser); pane browser lama hidup di `terminalTabs[].panes[]` dengan
 * `kind === 'browser'`, jadi yang dihitung di sini adalah sisa struktur lama.
 */
const SNAP = `(() => {
  const st = S.getState();
  const tabs = Array.isArray(st.tabs) ? st.tabs : [];
  const tabBrowser = tabs.filter((t) => t && t.view === 'browser');
  const aktif = tabs.find((t) => t && t.id === st.activeTabId) || null;
  const host = q('.bp-tab-host');
  const rect = host ? host.getBoundingClientRect() : null;
  let paneBrowserDiPanel = 0;
  try {
    const ts = TS();
    for (const tb of (ts.terminalTabs || [])) {
      for (const p of (tb.panes || [])) {
        if (p && p.kind === 'browser') paneBrowserDiPanel++;
      }
    }
  } catch { paneBrowserDiPanel = -1; }
  const ada = (sel) => !!q(sel);
  return {
    jumlah: tabBrowser.length,
    id: tabBrowser.map((t) => t.id),
    url: tabBrowser.map((t) => t.url || ''),
    aktifView: aktif ? aktif.view : null,
    host: !!host,
    rect: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
    paneBrowserDiPanel,
    tb: {
      back: ada('[data-testid="bp-back"]'),
      fwd: ada('[data-testid="bp-fwd"]'),
      reload: ada('[data-testid="bp-reload"]'),
      home: ada('[data-testid="bp-home"]'),
      url: ada('.bp-url'),
      external: ada('[data-testid="bp-external"]'),
      caret: !!q('.bp-services'),
    },
    rail: qa('[data-testid^="ab-"]').map((b) => (b.getAttribute('data-testid') || '').replace(/^ab-/, '')),
  };
})()`;

/** Tutup semua tab browser (bersih-bersih sesi sebelumnya, bukan yang diuji). */
const BERSIH = `{
  const ids = (S.getState().tabs || []).filter((t) => t && t.view === 'browser').map((t) => t.id);
  for (const id of ids) S.getState().forceCloseTab(id);
  await wait(250);
  /*
   * Closing the tab unmounts BrowserTab, whose cleanup tells Rust to drop the
   * child webview on a later turn - so the store can be clean while the host is
   * still painted. The flush round-trip is the only way to wait for that turn
   * from here; it is also what makes a later V7c ("host gone") honest.
   */
  if (ids.length && typeof window.__ZEPHYR_FLUSH__ === 'function') await window.__ZEPHYR_FLUSH__();
  return { ditutup: ids.length };
}`;

async function main() {
  let cdp;
  try {
    ({ cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']));
  } catch (e) {
    console.error(`\n[TIDAK DIJALANKAN] CDP port ${PORT}: ${e.message}`);
    console.error('Jalankan dulu: npm run dev  +  zephyr.exe --remote-debugging-port=' + PORT);
    keluarBersih(2);
    return;
  }

  try {
    await cdp.runAsync(BERSIH);

    /* ---------------- V1: ikon rail + urutan ---------------- */
    {
      const s = await cdp.runAsync(`return ${SNAP};`);
      const rail = s.rail || [];
      const iScm = rail.indexOf('scm');
      const iBrowser = rail.indexOf('browser');
      const iDebug = rail.indexOf('debug');
      R.check('V1a', iBrowser >= 0, `ikon rail "browser" ada (rail=${rail.join('>') || 'kosong'})`);
      R.check(
        'V1b',
        iScm >= 0 && iBrowser > iScm && iDebug > iBrowser,
        `urutan scm(${iScm}) < browser(${iBrowser}) < debug(${iDebug})`,
      );
    }

    /* ---------------- V2/V3: tab terbentuk, bukan pane ---------------- */
    {
      await cdp.runAsync(`S.getState().bukaViewAi('browser', { url: ${JSON.stringify(URL_A)} }); return 1;`);
      /* Webview anak butuh satu putaran render sebelum host punya ukuran. */
      let s = null;
      for (let i = 0; i < 24; i++) {
        await sleep(250);
        s = await cdp.runAsync(`return ${SNAP};`);
        if (s.jumlah === 1 && s.host && s.rect && s.rect.h > 100) break;
      }
      R.check('V2a', s.jumlah === 1, `tepat 1 tab view='browser' (${s.jumlah}: ${s.id.join(',')})`);
      R.check('V2b', s.aktifView === 'browser', `tab aktif = browser (${s.aktifView})`);
      R.check('V2c', s.host, '.bp-tab-host ter-mount di stage editor');
      R.check(
        'V2d',
        !!s.rect && s.rect.h > 100,
        `host berukuran nyata (${s.rect ? s.rect.w + 'x' + s.rect.h : 'null'})`,
      );
      R.check('V2e', (s.url[0] || '') === URL_A, `url tab = ${s.url[0]}`);
      R.check('V3', s.paneBrowserDiPanel === 0, `pane browser di panel terminal = ${s.paneBrowserDiPanel}`);

      /* ---------------- V5: toolbar TRAE ---------------- */
      const t = s.tb || {};
      const ada = ['back', 'fwd', 'reload', 'home', 'url', 'external'].filter((k) => t[k]);
      R.check('V5a', ada.length === 6, `tombol toolbar lengkap (${ada.join(',') || '-'})`);
      R.check('V5b', t.caret === false, 'TIDAK ada dropdown service di toolbar');
    }

    /* ---------------- V4: URL kedua memakai ulang tab yang sama ---------------- */
    {
      const sebelum = await cdp.runAsync(`return ${SNAP};`);
      await cdp.runAsync(`S.getState().bukaViewAi('browser', { url: ${JSON.stringify(URL_B)} }); return 1;`);
      let s = null;
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        s = await cdp.runAsync(`return ${SNAP};`);
        if ((s.url[0] || '') === URL_B) break;
      }
      R.check('V4a', s.jumlah === 1, `tetap 1 tab setelah URL kedua (${s.jumlah})`);
      R.check(
        'V4b',
        JSON.stringify(s.id) === JSON.stringify(sebelum.id) && s.id.length === 1,
        `id tab dipakai ulang (${sebelum.id.join(',')} -> ${s.id.join(',')})`,
      );
      R.check('V4c', (s.url[0] || '') === URL_B, `url tab berganti ke ${s.url[0]}`);
    }

    /* ---------------- V6: tool `browser` menulis ke TAB ---------------- */
    {
      await cdp.runAsync(BERSIH);
      const jembatan = await cdp.runAsync(`return typeof window.__ZEPHYR_TOOLS__;`);
      if (jembatan !== 'object') {
        R.check('V6a', false, `bridge tool tidak ada (typeof=${jembatan})`);
        R.check('V6b', false, 'dilewati: bridge tool tidak ada');
      } else {
        const buka = await cdp.runAsync(
          `const r = await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'open', url: ${JSON.stringify(URL_A)} })
             .then((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
             .catch((e) => 'ERR ' + (e && e.message));
           return r;`,
        );
        let s = null;
        for (let i = 0; i < 28; i++) {
          await sleep(250);
          s = await cdp.runAsync(`return ${SNAP};`);
          if (s.jumlah === 1) break;
        }
        const teks = String(buka || '');
        R.check('V6a', !teks.startsWith('ERR'), `aksi open tidak melempar (${teks.slice(0, 90)})`);
        R.check('V6b', s.jumlah === 1, `tool membuka 1 TAB (${s.jumlah})`);
        R.check('V6c', s.paneBrowserDiPanel === 0, `tool TIDAK membuat pane (${s.paneBrowserDiPanel})`);

        const daftar = await cdp.runAsync(
          `const r = await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'list' })
             .then((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
             .catch((e) => 'ERR ' + (e && e.message));
           return r;`,
        );
        const d = String(daftar || '');
        R.check(
          'V6d',
          !d.startsWith('ERR') && d.length > 2,
          `aksi list menjawab (${d.slice(0, 90).replace(/\n/g, ' ')})`,
        );
      }
    }

    /* ---------------- V7: aksi close menutup tab ---------------- */
    {
      const tutup = await cdp.runAsync(
        `const r = await window.__ZEPHYR_TOOLS__.jalankan('browser', { aksi: 'close' })
           .then((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
           .catch((e) => 'ERR ' + (e && e.message));
         return r;`,
      );
      let s = null;
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        s = await cdp.runAsync(`return ${SNAP};`);
        if (s.jumlah === 0) break;
      }
      const teks = String(tutup || '');
      R.check('V7a', !teks.startsWith('ERR'), `aksi close tidak melempar (${teks.slice(0, 90)})`);
      R.check('V7b', s.jumlah === 0, `tab browser tertutup (sisa ${s.jumlah})`);
      /*
       * `close` drops the tab; the webview itself goes away when the unmounted
       * BrowserTab's cleanup reaches Rust. Poll instead of asserting on the
       * frame that happens to follow the click.
       */
      for (let i = 0; i < 20 && s.host; i++) {
        await sleep(250);
        s = await cdp.runAsync(`return ${SNAP};`);
      }
      R.check('V7c', s.host === false, 'host .bp-tab-host ikut hilang dari stage');
    }

    const hasil = R.selesai();
    await cdp.close();
    keluarBersih(hasil.lulus === hasil.total ? 0 : 1);
  } catch (e) {
    console.error('\nHARNESS ERROR:', e && e.stack ? e.stack : e);
    try {
      await cdp.close();
    } catch {
      /* koneksi sudah mati */
    }
    keluarBersih(1);
  }
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e && e.stack ? e.stack : e);
  keluarBersih(1);
});
