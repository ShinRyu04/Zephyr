/*
 * Fungsional layar mulai jendela Agents: klik kartu kategori -> draft terisi,
 * baris folder tampil, tombol kirim ada.
 *
 * Usage: node scripts/uji-agents-start.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';

const port = Number(process.argv[2] || 9223);
const daftar = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
if (!page) {
  console.error('jendela Agents tidak terbuka');
  process.exit(1);
}
const cdp = await Cdp.connect(page.webSocketDebuggerUrl);

/* Layar mulai hanya tampil kalau percakapan ini kosong; sesi aktif di window
   mungkin sudah berisi percakapan lama, jadi buat sesi baru dulu. */
await cdp.eval(`(() => {
  const ai = window.__ZEPHYR_AI__;
  if (!ai?.store) return false;
  ai.store.getState().newChat('agents');
  return true;
})()`);
await new Promise((r) => setTimeout(r, 500));

let lulus = 0;
let total = 0;
const check = (id, ok, ket) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${ket}`);
};

const t1 = await cdp.eval(`(() => {
  const q = (s) => !!document.querySelector(s);
  const h1 = document.querySelector('[data-testid="agx-heading"]')?.textContent ?? null;
  return {
    heading: h1,
    sub: q('[data-testid="agx-sub"]'),
    cards: document.querySelectorAll('[data-testid^="agx-card-"]').length,
    box1: q('[data-testid="agx-box1"]'),
    box2: q('[data-testid="agx-box2"]'),
    folder: q('[data-testid="agx-folder"]'),
    send: q('[data-testid="agx-send"]'),
    model: q('[data-testid="agx-model"]'),
    ideChip: q('[data-testid="ag-ide-chip"]'),
  };
})()`);
check('S1', t1.heading === 'Build with Zephyr', `judul layar (${JSON.stringify(t1.heading)})`);
check('S2', t1.sub === true, 'subjudul ada');
check('S3', t1.cards === 4, `empat kartu kategori (dapat ${t1.cards})`);
check('S4', t1.box1 && t1.box2 && t1.folder, 'composer dua kotak + baris folder');
check('S5', t1.send && t1.model, 'tombol kirim + pemilih model ada');
check('S6', t1.ideChip === true, 'chip IDE di kanan atas');

const t2 = await cdp.eval(`(() => {
  document.querySelector('[data-testid="agx-card-app"]').click();
  return true;
})()`);
await new Promise((r) => setTimeout(r, 400));
const t3 = await cdp.eval(`(() => {
  const st = window.__ZEPHYR_AI__?.store?.getState?.();
  const field = document.querySelector('[data-testid="agx-field"] textarea, [data-testid="agx-field"] input');
  return {
    draftStore: st ? (st.drafts?.agents ?? null) : 'bridge-absen',
    draftDom: field ? field.value : null,
  };
})()`);
check('S7', typeof t3.draftStore === 'string' && t3.draftStore.startsWith('Build a small feature'), `klik kartu mengisi draft (dapat ${JSON.stringify((t3.draftStore || '').slice(0, 40))})`);

/* Bersihkan draft supaya jendela ditinggal dalam keadaan kosong. */
await cdp.eval(`(() => { window.__ZEPHYR_AI__?.store?.getState()?.setDraft?.('', 'agents'); return true; })()`);
await new Promise((r) => setTimeout(r, 300));
const t4 = await cdp.eval(`(() => window.__ZEPHYR_AI__?.store?.getState?.()?.drafts?.agents ?? null)()`);
check('S8', t4 === '', 'draft dibersihkan kembali');

console.log(`\n== ${lulus}/${total} lulus ==`);
cdp.close();
process.exit(lulus === total ? 0 : 1);
