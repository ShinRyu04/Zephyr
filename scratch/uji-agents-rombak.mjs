import { cdp } from './cdp2.mjs';

/*
 * Functional check of the rebuilt window. Layout numbers are already matched;
 * this proves the CONTROLS still do something, which is what a visual rebuild
 * most easily breaks.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const ag = list.find((x) => x.url.includes('#agents'));
const a = await cdp(9223, '#agents');

const j = async (body, ms = 20000) => {
  const src = `(async () => {
    const batas = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ${ms}));
    try { return JSON.stringify(await Promise.race([(async () => { ${body} })(), batas])); }
    catch (e) { return JSON.stringify({ galat: String(e && e.message ? e.message : e) }); }
  })()`;
  return JSON.parse(await a.eval(src));
};

const ada = async (sel) => a.eval(`!!document.querySelector(${JSON.stringify(sel)})`);
const teks = async (sel) => a.eval(`(document.querySelector(${JSON.stringify(sel)})?.innerText || '').trim()`);
const klik = async (sel) => {
  await a.eval(`document.querySelector(${JSON.stringify(sel)})?.click()`);
  await new Promise((r) => setTimeout(r, 400));
};

const hasil = {};

/* ── What exists ───────────────────────────────────────────────────────── */
hasil.elemen = await j(`
  const q = (s) => document.querySelector(s);
  const hitung = (s) => document.querySelectorAll(s).length;
  return {
    menubar: !!q('.ag-menubar'),
    menuFile: !!q('[data-testid="ag-menu-file"]'),
    menuView: !!q('[data-testid="ag-menu-view"]'),
    menuHelp: !!q('[data-testid="ag-menu-help"]'),
    newTask: !!q('[data-testid="ag-new-session"]'),
    grupHead: hitung('.ag-sesi-grup-head'),
    sesiRow: hitung('.ag-sesi-row'),
    hariJudul: hitung('.ag-sesi-hari-judul'),
    footer: !!q('.ag-sesi-footer'),
    footerMore: !!q('[data-testid="ag-footer-more"]'),
    tabChanges: !!q('[data-testid="ag-tab-changes"]'),
    tabFiles: !!q('[data-testid="ag-tab-files"]'),
    sashKiri: !!q('[data-testid="ag-sash-left"]'),
    sashChat: !!q('[data-testid="ag-sash-chat"]'),
    headerChat: !!q('.ag-center .ai-head'),
    composer: !!q('.ag-center .ai-input-row'),
  };
`);

/* ── Menus open, and their items are real commands ─────────────────────── */
await klik('[data-testid="ag-menu-file"]');
hasil.menuFileBuka = await j(`
  const d = document.querySelector('[data-testid="ag-dropdown-file"]');
  return { ada: !!d, item: d ? [...d.querySelectorAll('[role="menuitem"]')].map(e=>e.innerText.trim().split('\\n')[0]) : [] };
`);
await klik('[data-testid="ag-menu-file"]');

await klik('[data-testid="ag-menu-view"]');
hasil.menuViewBuka = await j(`
  const d = document.querySelector('[data-testid="ag-dropdown-view"]');
  return { ada: !!d, item: d ? [...d.querySelectorAll('[role="menuitem"]')].map(e=>e.innerText.trim().split('\\n')[0]) : [] };
`);
await klik('[data-testid="ag-menu-view"]');

/* ── Footer menu: the 8 customizations ─────────────────────────────────── */
await klik('[data-testid="ag-footer-more"]');
hasil.footerMenu = await j(`
  const d = document.querySelector('[data-testid="ag-footer-dropdown"]');
  return { ada: !!d, item: d ? [...d.querySelectorAll('[role="menuitem"]')].map(e=>e.innerText.trim()) : [] };
`);
await klik('[data-testid="ag-footer-more"]');

/* ── Tabs switch, and the body follows ─────────────────────────────────── */
await klik('[data-testid="ag-tab-changes"]');
hasil.tabChanges = await j(`
  return {
    aktif: document.querySelector('[data-testid="ag-tab-changes"]')?.getAttribute('aria-selected'),
    isi: (document.querySelector('[data-testid="ag-body-list"]')?.innerText || '').slice(0, 60),
  };
`);
await klik('[data-testid="ag-tab-files"]');
hasil.tabFiles = await j(`
  return {
    aktif: document.querySelector('[data-testid="ag-tab-files"]')?.getAttribute('aria-selected'),
    isi: (document.querySelector('[data-testid="ag-body-list"]')?.innerText || '').slice(0, 60),
  };
`);

/* ── The sashes actually resize ────────────────────────────────────────── */
hasil.seret = await j(`
  const sash = document.querySelector('[data-testid="ag-sash-left"]');
  const kiri = document.querySelector('.ag-left');
  const sebelum = Math.round(kiri.getBoundingClientRect().width);
  const b = sash.getBoundingClientRect();
  sash.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, clientX: b.x + 2, pointerId: 1}));
  await new Promise(r=>setTimeout(r,30));
  window.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, clientX: b.x + 82}));
  await new Promise(r=>setTimeout(r,60));
  window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true}));
  await new Promise(r=>setTimeout(r,60));
  const sesudah = Math.round(kiri.getBoundingClientRect().width);
  return { sebelum, sesudah, berubah: sesudah !== sebelum };
`);

/* ── "New task" creates a session ──────────────────────────────────────── */
hasil.newTask = await j(`
  const store = window.__ZEPHYR__;
  const ai = window.__ZEPHYR_AI__.store;
  const sebelum = ai.getState().sessions.length;
  document.querySelector('[data-testid="ag-new-session"]')?.click();
  await new Promise(r=>setTimeout(r,500));
  const sesudah = ai.getState().sessions.length;
  return { sebelum, sesudah, bertambah: sesudah > sebelum };
`);

a.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
