// uji-t1-4.mjs — verifikasi T1.4 (format on save) lewat store yang hidup.
//
// Yang diuji BUKAN "apakah file berubah di disk" (itu butuh LSP server nyata),
// tapi apakah rantai keputusannya benar:
//   1. setting formatOnSave ada & bisa dinyalakan/dimatikan
//   2. store punya aksi formatTab yang aman dipanggil
//   3. saveTab MEMANGGIL formatTab saat toggle menyala
//   4. formatOnSave mati -> formatTab TIDAK dipanggil
//
// CATATAN PENTING: `cdp.eval` TIDAK menunggu promise (awaitPromise:true sering
// gagal di WebView2 — lihat catatan di lib-cdp.mjs). Semua blok async di sini
// memakai `cdp.runAsync`, yang menyimpan promise di window lalu polling.
//
// Pakai: node scripts/uji-t1-4.mjs

import { Cdp } from './lib-cdp.mjs';

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

const { cdp } = await Cdp.attach(9223, 'Zephyr');

try {
  // ── 1. aksi + setting ada ──
  const ada = await cdp.json(`return JSON.stringify((() => {
    const st = s;
    return {
      ada: typeof st.formatTab === 'function',
      adaSetting: 'formatOnSave' in (st.settings?.editor ?? {}),
      nilai: st.settings?.editor?.formatOnSave,
    };
  })())`);

  cek('aksi formatTab ada di store', ada.ada);
  cek('setting formatOnSave ada', ada.adaSetting, `nilai=${ada.nilai}`);

  // ── 2. formatTab pada tab tidak ada -> 0, tidak melempar ──
  const tanpaFile = await cdp.json(`return JSON.stringify(await (async () => {
    try {
      const n = await s.formatTab('tab-yang-tidak-ada');
      return { ok: true, n };
    } catch (e) {
      return { ok: false, pesan: String(e).slice(0, 140) };
    }
  })())`);
  cek(
    'formatTab pada tab tidak ada -> 0, tidak melempar',
    tanpaFile.ok && tanpaFile.n === 0,
    `n=${tanpaFile.n} ${tanpaFile.pesan ?? ''}`,
  );

  // ── 3. buka file contoh, nyalakan formatOnSave, save -> formatTab dipanggil ──
  const hasil = await cdp.json(`return JSON.stringify(await (async () => {
    // Nyalakan toggle.
    S.setState((x) => ({ settings: { ...x.settings, editor: { ...x.settings.editor, formatOnSave: true } } }));
    // Buka file contoh supaya tab punya path + EditorView.
    try { await s.openPath('D:/Zephyr/package.json'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1200));
    const id = S.getState().activeTabId;
    const tab = S.getState().tabs.find((t) => t.id === id);

    // Bungkus formatTab supaya bisa dihitung.
    let dipanggil = 0;
    const asli = S.getState().formatTab;
    S.setState({
      formatTab: async (x) => { dipanggil++; return await asli.call(S.getState(), x); },
    });

    const ok = await s.saveTab(id);
    return {
      ok,
      dipanggil,
      path: tab?.path ?? null,
      formatOnSave: S.getState().settings.editor.formatOnSave,
    };
  })())`);

  cek('file contoh terbuka (punya path)', !!hasil.path, `path=${hasil.path}`);
  cek('save berhasil', hasil.ok === true);
  cek(
    'formatTab DIPANGGIL saat save (formatOnSave menyala)',
    hasil.dipanggil > 0,
    `dipanggil=${hasil.dipanggil}×`,
  );

  // ── 4. matikan toggle -> formatTab tidak dipanggil ──
  const mati = await cdp.json(`return JSON.stringify(await (async () => {
    S.setState((x) => ({ settings: { ...x.settings, editor: { ...x.settings.editor, formatOnSave: false } } }));
    let dipanggil = 0;
    const asli = S.getState().formatTab;
    S.setState({
      formatTab: async (x) => { dipanggil++; return await asli.call(S.getState(), x); },
    });
    const id = S.getState().activeTabId;
    const ok = await s.saveTab(id);
    return { dipanggil, ok, formatOnSave: S.getState().settings.editor.formatOnSave };
  })())`);

  cek('save tetap berhasil saat formatOnSave mati', mati.ok === true);
  cek('formatOnSave mati -> formatTab TIDAK dipanggil', mati.dipanggil === 0,
    `dipanggil=${mati.dipanggil}×`);

  // ── 5. bersihkan ──
  await cdp.eval(`(() => {
    window.__ZEPHYR__.setState((x) => ({
      settings: { ...x.settings, editor: { ...x.settings.editor, formatOnSave: false } },
    }));
    return 'ok';
  })()`);

  console.log('');
  console.log(`== ${lulus}/${lulus + gagal} lulus ==`);
  process.exitCode = gagal === 0 ? 0 : 1;
} finally {
  await cdp.close();
}
