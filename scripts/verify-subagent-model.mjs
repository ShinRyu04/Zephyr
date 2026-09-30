// verify-subagent-model.mjs — batch model + per-line [model:...] override.
//
// The batch model is chosen ONCE, in the Subagents tab header (ModelSelector
// target="subagent", which reads "Follow chat" while settings.subagent.model is
// empty). There is deliberately NO per-row dropdown: N lines used to mean N
// <select> elements, which was noisy and a second, conflicting way to set the
// same thing. A single line still overrides the batch by writing [model:...] on
// that line, and that override shows up as a badge instead of a hidden control.
//
// Usage: node scripts/verify-subagent-model.mjs [port]
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const { cdp } = await Cdp.attach(PORT);

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

// The parser is pure, so test it in isolation first.
const parser = await cdp.runAsync(`
  const m = await import('/src/lib/subagentRoles.ts');
  const a = m.modelDariPrefix('[model:gemini/gemini-3.7-flash] perbaiki auth');
  const b = m.modelDariPrefix('cari pemakaian fungsi X');
  const c = m.modelDariPrefix('@kerja [model:claude-opus-5] tambah endpoint');
  return JSON.stringify({ a, b, c });
`, 30000);
const p = JSON.parse(parser);
check(
  'SUB-V1',
  p.a.model === 'gemini-3.7-flash' &&
    p.a.provider === 'gemini' &&
    p.a.sisa === 'perbaiki auth' &&
    p.b.model === null &&
    p.c.model === 'claude-opus-5' &&
    p.c.provider === null,
  `parser: [model:gemini/x] -> ${p.a.provider}/${p.a.model}; polos -> null; @kerja+tag -> ${p.c.model}`,
);

// The task list renders one row per line, carries no <select>, and gives every
// row a clickable model badge (the batch default until that line overrides it).
const ui = await cdp.runAsync(`
  S.getState().setSettingsOpen(false);
  TS().setVisible(true);
  window.__ZEPHYR_PANEL__.focusTab('subagents');
  for (let i = 0; i < 40; i++) { await wait(100); if (document.querySelector('[data-testid="sub-input"]')) break; }
  await wait(600);
  const ta = document.querySelector('[data-testid="sub-input"]');
  if (!ta) return JSON.stringify({ err: 'no sub-input' });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'cari pemakaian fungsiX\\ntambah endpoint baru\\n[model:gemini/gemini-3.7-flash] cek log error');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(900);
  const rows = [...document.querySelectorAll('[data-testid^="sub-daftar-"]')]
    .filter((r) => /sub-daftar-\\d+$/.test(r.getAttribute('data-testid')));
  const selectPerBaris = document.querySelectorAll('select[data-testid^="sub-model-"]').length;
  const badge = document.querySelector('[data-testid="sub-daftar-model-2"]');
  const badge0 = document.querySelector('[data-testid="sub-daftar-model-0"]');
  const barisTeks = rows.map((r) => r.querySelector('.sub-daftar-teks')?.textContent?.trim());
  return JSON.stringify({
    baris: rows.length,
    selectPerBaris,
    badge: badge ? badge.textContent.trim() : null,
    badge0: badge0 ? badge0.textContent.trim() : null,
    override0: badge0 ? badge0.getAttribute('data-override') : null,
    override2: badge ? badge.getAttribute('data-override') : null,
    barisTeks,
    batch: document.querySelector('[data-testid="sub-model-batch"]')?.getAttribute('data-ikut'),
  });
`, 40000);
const u = JSON.parse(ui);
check(
  'SUB-V2',
  u.baris === 3 && u.selectPerBaris === 0 && !!u.badge && !!u.badge0,
  `daftar: ${u.baris} baris, ${u.selectPerBaris} select (harus 0), badge: [0]="${u.badge0}" [2]="${u.badge}"`,
);
check(
  'SUB-V3',
  Array.isArray(u.barisTeks) &&
    u.barisTeks[2] === 'cek log error' &&
    !u.barisTeks[2].includes('[model') &&
    u.override2 === '1' &&
    u.override0 === '0',
  `tag dilepas dari teks ("${u.barisTeks && u.barisTeks[2]}"); override: baris1=${u.override0} baris3=${u.override2}`,
);

// The footer must say which model the batch runs on, and say "follow chat"
// while settings.subagent.model is empty. The test drives that setting itself
// (and puts back whatever the user had) instead of assuming a clean profile.
// Clicking a row badge opens the picker, and a choice sticks to that line only.
const perBaris = await cdp.runAsync(`
  const badge0 = document.querySelector('[data-testid="sub-daftar-model-0"]');
  if (!badge0) return JSON.stringify({ err: 'no badge 0' });
  badge0.click();
  await wait(500);
  const menu = document.querySelector('[data-testid="sub-daftar-menu-0"]');
  if (!menu) return JSON.stringify({ err: 'menu tidak terbuka', badge: badge0.textContent.trim() });
  const ikut = document.querySelector('[data-testid="sub-daftar-menu-ikut-0"]');
  const pilih = [...menu.querySelectorAll('[data-value]')];
  if (!pilih.length) return JSON.stringify({ err: 'tidak ada model di menu' });
  const nilai = pilih[0].getAttribute('data-value');
  pilih[0].click();
  await wait(500);
  const b0 = document.querySelector('[data-testid="sub-daftar-model-0"]');
  const b1 = document.querySelector('[data-testid="sub-daftar-model-1"]');
  return JSON.stringify({
    nilai,
    label0: b0 ? b0.textContent.trim() : null,
    override0: b0 ? b0.getAttribute('data-override') : null,
    label1: b1 ? b1.textContent.trim() : null,
    override1: b1 ? b1.getAttribute('data-override') : null,
    adaIkut: !!ikut,
    jumlahOpsi: pilih.length,
  });
`, 40000);
const pb = JSON.parse(perBaris);
if (pb.err === 'tidak ada model di menu') {
  // No provider is usable in this profile (no key, or no base URL), so there is
  // nothing to pick. That is a configuration state, not a code failure - report
  // it as such instead of a false GAGAL.
  console.log(`LEWAT  SUB-V5  dilewati: ${pb.err} (tidak ada provider siap di profil ini)`);
} else {
  check(
    'SUB-V5',
    !pb.err && pb.override0 === '1' && pb.override1 === '0' && pb.label0 !== pb.label1,
    `baris 1 dipilih "${pb.nilai}" -> "${pb.label0}" (override=${pb.override0}); baris 2 tetap "${pb.label1}" (override=${pb.override1}); ${pb.jumlahOpsi} opsi + ikut=${pb.adaIkut}${pb.err ? ' ERR:' + pb.err : ''}`,
  );
}

const MODEL_AWAL = JSON.parse(
  await cdp.runAsync(
    `return JSON.stringify((S.getState().settings.subagent || {}).model || '');`,
  ),
);

await cdp.runAsync(
  `await S.getState().applySettings({ subagent: { model: null } }); await wait(900); return 'ok';`,
  30000,
);
const saatKosong = JSON.parse(
  await cdp.runAsync(`
  const el = document.querySelector('[data-testid="sub-model-batch"]');
  return JSON.stringify({
    label: el ? el.textContent.trim() : '',
    ikut: el ? el.getAttribute('data-ikut') : null,
    chat: window.__ZEPHYR_AI__.store.getState().model,
  });
`),
);

await cdp.runAsync(
  `await S.getState().applySettings({ subagent: { model: 'gemini-3.7-flash' } }); await wait(900); return 'ok';`,
  30000,
);
const saatDiSet = JSON.parse(
  await cdp.runAsync(`
  const el = document.querySelector('[data-testid="sub-model-batch"]');
  return JSON.stringify({
    label: el ? el.textContent.trim() : '',
    ikut: el ? el.getAttribute('data-ikut') : null,
  });
`),
);

await cdp.runAsync(
  `await S.getState().applySettings({ subagent: { model: ${JSON.stringify(MODEL_AWAL)} } }); await wait(700); return 'ok';`,
  30000,
);
const kembali = JSON.parse(
  await cdp.runAsync(
    `return JSON.stringify((S.getState().settings.subagent || {}).model || '');`,
  ),
);

check(
  'SUB-V4',
  saatKosong.ikut === '1' &&
    /Follow chat/i.test(saatKosong.label) &&
    typeof saatKosong.chat === 'string' &&
    saatKosong.chat.length > 0 &&
    saatDiSet.ikut === '0' &&
    saatDiSet.label === 'Gemini 3.7 Flash' &&
    kembali === MODEL_AWAL,
  `kosong -> ikut=${saatKosong.ikut} "${saatKosong.label}" (chat=${saatKosong.chat}) | di-set -> ikut=${saatDiSet.ikut} "${saatDiSet.label}" | dikembalikan: ${JSON.stringify(kembali)} (semula ${JSON.stringify(MODEL_AWAL)})`,
);

const lulus = hasil.filter((x) => x.ok).length;console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
await cdp.close();
process.exitCode = lulus === hasil.length ? 0 : 1;
