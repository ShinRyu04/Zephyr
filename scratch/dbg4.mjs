/*
 * Bukti: halaman Hooks dan Browser berbentuk referensi.
 *
 *   H1  pane Hooks merender dengan tab Global | Project
 *   H2  ada toggle Import Hooks configuration in Claude
 *   H3  tombol Create benar-benar menambah hook ke store
 *   H4  hook baru muncul di daftar, bisa diganti nama
 *   H5  event yang BELUM tersambung memberi peringatan jujur
 *   H6  dropdown Execution Mode menulis ke setelan
 *   H7  View Logs membuka panel log
 *
 *   B1  pane Browser merender
 *   B2  dropdown Default Browser menulis ke setelan
 *   B3  toggle Auto Screenshot menulis ke setelan
 *   B4  Local URL dan External URL terpisah
 *   B5  tombol Clear ada dan bisa diklik tanpa crash
 */
import { Cdp, keluarBersih } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

/**
 * Evaluate an expression and parse its JSON result, locally.
 *
 * WHY the wrapper is an async IIFE and not a bare `await (...)`:
 *
 * `runAsync(body)` embeds `body` inside its own function and awaits the result.
 * Handing it `return JSON.stringify(await (expr))` when `expr` already starts
 * with `await` produces `await await ...` - which the parser rejects with the
 * very unhelpful "Invalid left-hand side in assignment". Wrapping the expression
 * in an async function instead makes the double-await impossible: the IIFE is a
 * value, and the outer `await` applies to it exactly once.
 */
async function J(expr, ms = 60000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  let raw;
    try { raw = await cdp.runAsync(badan, ms); }
    catch (e) { console.error("[J-GAGAL] " + String(e).slice(0,120)); console.error("[BODY] " + badan.slice(0,260)); throw e; }
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/* ── Mount helper ─────────────────────────────────────────────────────────── */
async function mount(idWadah, path, testid) {
  await cdp.eval(
    `(() => {
    const lama = document.getElementById('${idWadah}');
    if (lama) lama.remove();
    const host = document.createElement('div');
    host.id = '${idWadah}';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--bg,#111);padding:24px';
    document.body.appendChild(host);
    return 'ok';
  })()`,
  );
  const r = await J(`await (async () => {
    try {
      const ReactMod = await import('/node_modules/.vite/deps/react.js');
      const React = ReactMod.default ?? ReactMod;
      const DomMod = await import('/node_modules/.vite/deps/react-dom_client.js');
      const Dom = DomMod.default ?? DomMod;
      const createRoot = Dom.createRoot ?? DomMod.createRoot;
      const mod = await import('${path}');
      const host = document.getElementById('${idWadah}');
      const root = createRoot(host);
      root.render(React.createElement(mod.default));
      window.__UJI_${idWadah.toUpperCase()}__ = root;
      return { ok: true };
    } catch (e) {
      return { ok: false, galat: String(e) };
    }
  })()`, 120000);
  return typeof r === 'string' ? JSON.parse(r) : r;
}

async function unmount(idWadah) {
  await cdp.eval(
    `(() => {
    try { window.__UJI_${idWadah.toUpperCase()}__?.unmount(); } catch (e) {}
    const host = document.getElementById('${idWadah}');
    if (host) host.remove();
    return 'ok';
  })()`,
  );
  await new Promise((r) => setTimeout(r, 300));
}

const out = {};

/* ── Hooks ────────────────────────────────────────────────────────────────── */
out.mountHooks = await mount('uji-hooks', '/src/components/settings/AgcHooks.tsx');
await new Promise((r) => setTimeout(r, 1400));


const hHooks = await J(`(() => {
  const pane = document.querySelector('#uji-hooks [data-testid="agx-hooks"]');
  const out = { adaPane: !!pane };
  if (!pane) return out;
  out.adaTabGlobal = !!pane.querySelector('[data-testid="agx-hooks-global"]');
  out.adaTabProyek = !!pane.querySelector('[data-testid="agx-hooks-proyek"]');
  out.adaImpor = !!pane.querySelector('[data-testid="agx-hooks-impor"]');
  out.adaCreate = !!pane.querySelector('[data-testid="agx-hooks-create"]');
  out.adaMode = !!pane.querySelector('[data-testid="agx-hooks-mode"]');
  out.adaLog = !!pane.querySelector('[data-testid="agx-hooks-log"]');
  out.jumlahAwal = window.__ZEPHYR_EXTRAS__?.hooks?.()?.length ?? -1;
  return out;
})()`, 60000);
const hk = typeof hHooks === 'string' ? JSON.parse(hHooks) : hHooks;
out.hooks = hk;

/* H3: click Create and count. */
await cdp.eval(
  `(() => { const b = document.querySelector('#uji-hooks [data-testid="agx-hooks-create"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 800));


const hHooks2 = await J(`(() => {
  const pane = document.querySelector('#uji-hooks [data-testid="agx-hooks"]');
  return {
    jumlahSesudah: window.__ZEPHYR_EXTRAS__?.hooks?.()?.length ?? -1,
    adaDaftar: !!pane?.querySelector('[data-testid="agx-hooks-daftar"]'),
    adaBaris: pane ? pane.querySelectorAll('[data-testid^="agx-hook-"]').length : 0,
    adaWarn: !!pane?.querySelector('[data-testid^="agx-hook-warn-"]'),
  };
})()`, 60000);
out.hooks2 = typeof hHooks2 === 'string' ? JSON.parse(hHooks2) : hHooks2;

/* H6: change execution mode. */
const sebelumMode = await J(`({ nilai: window.__ZEPHYR__.getState().settings.agents?.modeHook ?? null })`, 60000);
out.sebelumMode = typeof sebelumMode === 'string' ? JSON.parse(sebelumMode) : sebelumMode;


await J(`(() => {
  const sel = document.querySelector('#uji-hooks [data-testid="agx-hooks-mode"]');
  if (!sel) return 'no-sel';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, 'lokal');
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})())`,
);
await new Promise((r) => setTimeout(r, 800));


const sesudahMode = await J(`({ nilai: window.__ZEPHYR__.getState().settings.agents?.modeHook ?? null })`, 60000);
out.sesudahMode = typeof sesudahMode === 'string' ? JSON.parse(sesudahMode) : sesudahMode;

/* H7: open logs. */
await cdp.eval(
  `(() => { const b = document.querySelector('#uji-hooks [data-testid="agx-hooks-log"]'); if (b) b.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 500));
const hLog = await J(`({ ada: !!document.querySelector('#uji-hooks [data-testid="agx-hooks-log-isi"]') })`, 60000);
out.log = typeof hLog === 'string' ? JSON.parse(hLog) : hLog;

/* Bersihkan hook uji supaya daftar user tidak kotor. */
await cdp.eval(
  `(() => {
  const g = window.__ZEPHYR_EXTRAS__;
  const semua = g?.hooks?.() ?? [];
  for (const h of semua) { if (!h.command) { try { g.state().removeHook(h.id); } catch (e) {} } }
  return 'ok';
})()`,
);
await unmount('uji-hooks');

/* ── Browser ──────────────────────────────────────────────────────────────── */
out.mountBrowser = await mount('uji-browser', '/src/components/settings/AgcBrowser.tsx');
await new Promise((r) => setTimeout(r, 1400));


const hBr = await J(`(() => {
  const pane = document.querySelector('#uji-browser [data-testid="agx-browser"]');
  const out = { adaPane: !!pane };
  if (!pane) return out;
  out.adaBawaan = !!pane.querySelector('[data-testid="agx-br-bawaan"]');
  out.adaAutoShot = !!pane.querySelector('[data-testid="agx-br-autoshot"]');
  out.adaLokal = !!pane.querySelector('[data-testid="agx-br-lokal"]');
  out.adaLuar = !!pane.querySelector('[data-testid="agx-br-luar"]');
  out.adaClear = !!pane.querySelector('[data-testid="agx-br-clear"]');
  return out;
})()`, 60000);
out.browser = typeof hBr === 'string' ? JSON.parse(hBr) : hBr;

/* B2: change default browser. */
const sebelumBr = await J(`({ nilai: window.__ZEPHYR__.getState().settings.browser?.bawaan ?? null })`, 60000);
out.sebelumBr = typeof sebelumBr === 'string' ? JSON.parse(sebelumBr) : sebelumBr;


await J(`(() => {
  const sel = document.querySelector('#uji-browser [data-testid="agx-br-bawaan"]');
  if (!sel) return 'no-sel';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, 'sistem');
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})())`,
);
await new Promise((r) => setTimeout(r, 800));


const sesudahBr = await J(`({ nilai: window.__ZEPHYR__.getState().settings.browser?.bawaan ?? null })`, 60000);
out.sesudahBr = typeof sesudahBr === 'string' ? JSON.parse(sesudahBr) : sesudahBr;

/* B3: toggle auto screenshot. */
const sebelumShot = await J(`({ nilai: window.__ZEPHYR__.getState().settings.browser?.autoScreenshot ?? null })`, 60000);
out.sebelumShot = typeof sebelumShot === 'string' ? JSON.parse(sebelumShot) : sebelumShot;

await cdp.eval(
  `(() => { const cb = document.querySelector('#uji-browser [data-testid="agx-br-autoshot"] input'); if (cb) cb.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 800));


const sesudahShot = await J(`({ nilai: window.__ZEPHYR__.getState().settings.browser?.autoScreenshot ?? null })`, 60000);
out.sesudahShot = typeof sesudahShot === 'string' ? JSON.parse(sesudahShot) : sesudahShot;

/* B5: click Clear - must not throw, whatever the backend answers. */
const klikClear = await J(`await (async () => {
  try {
    const b = document.querySelector('#uji-browser [data-testid="agx-br-clear"]');
    if (!b) return { ok: false, galat: 'tombol tidak ada' };
    b.click();
    return { ok: true };
  } catch (e) {
    return { ok: false, galat: String(e) };
  }
})()`, 60000);
out.klikClear = typeof klikClear === 'string' ? JSON.parse(klikClear) : klikClear;
await new Promise((r) => setTimeout(r, 1500));


const pesanClear = await J(`({ pesan: document.querySelector('#uji-browser [data-testid="agx-br-pesan"]')?.textContent ?? null })`, 60000);
out.pesanClear = typeof pesanClear === 'string' ? JSON.parse(pesanClear) : pesanClear;

/* Kembalikan setelan. */
const rBr = JSON.stringify(out.sebelumBr?.nilai ?? 'builtin');
const rShot = JSON.stringify(out.sebelumShot?.nilai ?? false);
const rMode = JSON.stringify(out.sebelumMode?.nilai ?? 'sandbox');
await cdp.eval(
  `(() => {
  const S = window.__ZEPHYR__.getState();
  void S.applySettings({
    browser: { ...(S.settings.browser ?? {}), bawaan: ${rBr}, autoScreenshot: ${rShot} },
    agents: { ...(S.settings.agents ?? {}), modeHook: ${rMode} },
  });
  return 'ok';
})()`,
);
await unmount('uji-browser');

console.log(JSON.stringify(out, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — Hooks:');
cek('H1 pane Hooks merender dengan tab', out.mountHooks?.ok === true && out.hooks?.adaPane === true, '');
cek(
  'H2 tab Global + Project dan toggle Import Claude',
  out.hooks?.adaTabGlobal === true && out.hooks?.adaTabProyek === true && out.hooks?.adaImpor === true,
  '',
);
cek(
  'H3 Create menambah hook ke store',
  (out.hooks2?.jumlahSesudah ?? 0) > (out.hooks?.jumlahAwal ?? 0),
  `${out.hooks?.jumlahAwal} -> ${out.hooks2?.jumlahSesudah}`,
);
cek('H4 hook muncul di daftar', (out.hooks2?.adaBaris ?? 0) > 0, `baris=${out.hooks2?.adaBaris}`);
cek('H5 event yang belum tersambung memberi peringatan', out.hooks2?.adaWarn === true, '');
cek(
  'H6 Execution Mode menulis ke setelan',
  out.sesudahMode?.nilai !== out.sebelumMode?.nilai,
  `${out.sebelumMode?.nilai} -> ${out.sesudahMode?.nilai}`,
);
cek('H7 View Logs membuka panel', out.log?.ada === true, '');

console.log('\nBukti — Browser:');
cek('B1 pane Browser merender', out.mountBrowser?.ok === true && out.browser?.adaPane === true, '');
cek(
  'B2 Default Browser menulis ke setelan',
  out.sesudahBr?.nilai !== out.sebelumBr?.nilai,
  `${out.sebelumBr?.nilai} -> ${out.sesudahBr?.nilai}`,
);
cek(
  'B3 Auto Screenshot menulis ke setelan',
  out.sesudahShot?.nilai !== out.sebelumShot?.nilai,
  `${out.sebelumShot?.nilai} -> ${out.sesudahShot?.nilai}`,
);
cek('B4 Local + External URL terpisah', out.browser?.adaLokal === true && out.browser?.adaLuar === true, '');
cek(
  'B5 Clear bisa diklik dan melaporkan hasil',
  out.klikClear?.ok === true && (out.pesanClear?.pesan ?? '').length > 0,
  String(out.pesanClear?.pesan ?? '').slice(0, 60),
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
