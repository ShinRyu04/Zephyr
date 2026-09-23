// uji-t3-11.mjs — verifikasi 4 fitur baru dari contoh user (T3.11).
//
// Yang diminta user lewat 4 gambar:
//   1. Pemilih mode agent (label + keterangan + centang) — bukan dropdown
//      putih yang tak terbaca
//   2. Indikator pemakaian konteks (persen + model + jendela konteks)
//   3. Tingkat penalaran: Auto / low / medium / high / xhigh
//   4. Tombol dikte suara (mikrofon)
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== T3.11: pemilih mode + konteks + penalaran + suara ===\n');

// Panel AI harus terbuka.
await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  T.getState().setVisible(true);
  T.getState().setHeight(420);
  await new Promise((r) => setTimeout(r, 1200));
  return 1;
})())`, 60000);

// ── V1: pemilih mode persetujuan (bukan <select> native) ──
const appr = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__;
  A.store.getState().setAgentMode('agent');
  await new Promise((r) => setTimeout(r, 900));
  const btn = document.querySelector('[data-testid="ai-approval"]');
  const select = document.querySelector('select[data-testid="ai-approval"]');
  return {
    adaTombol: !!btn,
    masihSelectNative: !!select,
    tag: btn ? btn.tagName : '',
    label: btn ? btn.textContent.trim() : '',
    mode: btn ? btn.getAttribute('data-mode') : '',
  };
})())`, 90000);
cek('tombol mode persetujuan ada', appr.adaTombol === true);
cek('BUKAN <select> native lagi', appr.masihSelectNative === false, appr.tag);
cek('tombol menampilkan label mode', (appr.label || '').length > 3, appr.label);

// ── V2: popover mode terbuka dengan keterangan + centang ──
const pop = await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="ai-approval"]').click();
  await new Promise((r) => setTimeout(r, 700));
  const p = document.querySelector('[data-testid="approval-pop"]');
  if (!p) return { err: 'popover tidak muncul' };
  const items = [...p.querySelectorAll('.pick-item')];
  const bg = getComputedStyle(p).backgroundColor;
  return {
    ada: true,
    n: items.length,
    label: items.map((e) => e.querySelector('b')?.textContent?.trim()),
    hint: items.map((e) => e.querySelector('i')?.textContent?.trim()).filter(Boolean).length,
    centang: p.querySelectorAll('.pick-check').length,
    bg,
  };
})())`, 90000);
cek('popover mode terbuka', pop.ada === true, pop.err || '');
cek('4 mode tersedia', pop.n === 4, `${pop.n} mode`);
cek('tiap mode punya keterangan', pop.hint >= 3, `${pop.hint} keterangan`);
cek('mode aktif ditandai centang', pop.centang === 1);
// Warna gelap = tidak putih (masalah <select> native).
const rgb = (pop.bg || '').match(/\d+/g)?.map(Number) ?? [255, 255, 255];
cek('popover berlatar GELAP (bukan putih OS)', rgb[0] < 100 && rgb[1] < 100 && rgb[2] < 100, pop.bg);

// ── V3: memilih mode benar-benar mengubah store ──
const pilih = await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="approval-readonly"]').click();
  await new Promise((r) => setTimeout(r, 800));
  const mode = window.__ZEPHYR_AI__.store.getState().approvalMode;
  const tutup = !document.querySelector('[data-testid="approval-pop"]');
  // kembalikan
  document.querySelector('[data-testid="ai-approval"]')?.click();
  await new Promise((r) => setTimeout(r, 400));
  document.querySelector('[data-testid="approval-work"]')?.click();
  await new Promise((r) => setTimeout(r, 500));
  return { mode, tutup };
})())`, 90000);
cek('memilih mode mengubah store', pilih.mode === 'readonly', String(pilih.mode));
cek('popover tertutup setelah memilih', pilih.tutup === true);

// ── V4: pemilih penalaran (Auto/low/medium/high/ultra) ──
const eff = await cdp.json(`return JSON.stringify(await (async () => {
  const btn = document.querySelector('[data-testid="ai-effort"]');
  const select = document.querySelector('select[data-testid="ai-effort"]');
  btn.click();
  await new Promise((r) => setTimeout(r, 700));
  const p = document.querySelector('[data-testid="effort-pop"]');
  const items = p ? [...p.querySelectorAll('.pick-item')] : [];
  const label = items.map((e) => e.querySelector('b')?.textContent?.trim());
  const bg = p ? getComputedStyle(p).backgroundColor : '';
  return { adaTombol: !!btn, masihSelect: !!select, n: items.length, label, bg,
           adaKaki: !!p?.querySelector('.pick-kaki') };
})())`, 90000);
cek('tombol penalaran ada', eff.adaTombol === true);
cek('BUKAN <select> native', eff.masihSelect === false);
cek('6 tingkat (Auto..Ultra)', eff.n === 6, eff.label.join(', '));
cek('popover penalaran gelap', (() => {
  const c = (eff.bg || '').match(/\d+/g)?.map(Number) ?? [255, 255, 255];
  return c[0] < 100 && c[1] < 100 && c[2] < 100;
})(), eff.bg);
cek('ada keterangan teknis di kaki popover', eff.adaKaki === true);

// ── V5: memilih tingkat penalaran mengubah store ──
const effPilih = await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="effort-high"]').click();
  await new Promise((r) => setTimeout(r, 800));
  const v = window.__ZEPHYR_AI__.store.getState().reasoningEffort;
  const tombol = document.querySelector('[data-testid="ai-effort"]');
  const teks = tombol.textContent.trim();
  const aktif = tombol.getAttribute('data-aktif');
  // kembalikan ke Auto
  tombol.click();
  await new Promise((r) => setTimeout(r, 400));
  document.querySelector('[data-testid="effort-auto"]')?.click();
  await new Promise((r) => setTimeout(r, 500));
  return { v, teks, aktif };
})())`, 90000);
cek('memilih High mengubah store', effPilih.v === 'high', String(effPilih.v));
cek('label tombol ikut berubah', effPilih.teks.includes('High'), effPilih.teks);
cek('data-aktif = true saat bukan default', effPilih.aktif === 'true');

// ── V6: indikator konteks ──
const ctx = await cdp.json(`return JSON.stringify(await (async () => {
  const btn = document.querySelector('[data-testid="ctx-meter"]');
  if (!btn) return { err: 'meter tidak ada' };
  const persen = btn.getAttribute('data-persen');
  btn.click();
  await new Promise((r) => setTimeout(r, 700));
  const p = document.querySelector('[data-testid="ctx-pop"]');
  if (!p) return { err: 'popover konteks tidak muncul', persen };
  const baris = [...p.querySelectorAll('.ctx-baris')].map((e) => e.textContent.trim());
  return {
    persen: Number(persen),
    adaBar: !!p.querySelector('.ctx-bar'),
    angka: p.querySelector('[data-testid="ctx-angka"]')?.textContent?.trim(),
    baris,
    note: p.querySelector('.ctx-note')?.textContent?.trim(),
  };
})())`, 90000);
cek('meter konteks ada', ctx.err === undefined || ctx.persen !== undefined, ctx.err || '');
cek('meter menampilkan persen', typeof ctx.persen === 'number' && ctx.persen >= 0, `${ctx.persen}%`);
cek('popover punya progress bar', ctx.adaBar === true);
cek('popover menampilkan 3 baris info', (ctx.baris || []).length === 3, (ctx.baris || []).join(' | '));
cek('angka konteks format "dipakai / total"', /\/ /.test(ctx.angka || ''), ctx.angka);
cek('ada catatan bahwa ini perkiraan', (ctx.note || '').length > 10, ctx.note);

// ── V8: helper konteks benar ──
const helper = await cdp.json(`return JSON.stringify(await (async () => {
  const M = await import('/src/components/ai/ContextMeter.tsx');
  return {
    token4: M.kiraToken('abcd'),          // 4 char -> 1
    token0: M.kiraToken(''),              // 0
    jendelaGemini: M.jendelaKonteks('gemini-3.8-flash'),
    jendelaTakDikenal: M.jendelaKonteks('model-karangan-xyz'),
  };
})())`, 90000);
cek('kiraToken(4 char) = 1', helper.token4 === 1, String(helper.token4));
cek('kiraToken("") = 0', helper.token0 === 0, String(helper.token0));
cek('jendela konteks Gemini besar', helper.jendelaGemini >= 1_000_000, helper.jendelaGemini?.toLocaleString('id-ID'));
cek('model tak dikenal -> fallback 128k', helper.jendelaTakDikenal === 128_000, String(helper.jendelaTakDikenal));

// ── bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="ctx-meter"]')?.click();
  await new Promise((r) => setTimeout(r, 300));
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
