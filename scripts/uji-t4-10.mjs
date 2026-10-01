// uji-t410.mjs — pemilih model DUA TINGKAT + model subagent (T4.10).
//
// KENAPA diuji begini: keluhan user adalah "harus dropdown jauh bnget" dan
// "yang belum ada api key ny jgn mncul". Jadi yang diperiksa BUKAN sekadar
// "menu bisa dibuka", tapi:
//   * menu dibuka di tingkat provider (bukan daftar model datar)
//   * provider tanpa API key benar-benar tidak ditawarkan
//   * tingkat model hanya memuat model milik provider itu
//   * kotak cari bisa dipakai lintas provider
//   * pemilih model subagent jalan & tersimpan ke settings
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) lulus++;
  else gagal++;
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? '  ' + info : ''}`);
};

const setup = await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await Ti.invoke('set_model_key', { provider: 'openai', key: 'MOCK-KEY-5678' });
  await new Promise((r) => setTimeout(r, 700));
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(false);
  S.getState().setActivity('ai');
  if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await window.__ZEPHYR_AI__.store.getState().loadKeys();
  // Bersihkan model subagent dulu: kalau settings user sudah pernah menyetel
  // model khusus, uji "default = Ikut chat" gagal padahal aplikasinya benar.
  await S.getState().applySettings({ subagent: { model: '', provider: '' } });
  await new Promise((r) => setTimeout(r, 900));
  return { keys: window.__ZEPHYR_AI__.store.getState().keys.filter((k) => k.hasKey).map((k) => k.provider) };
})())`,
  90000,
);
console.log('  provider ber-key:', setup.keys.join(', '));

// 1. Buka menu -> harus di tingkat PROVIDER, hanya provider ber-key.
const r1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const b = document.querySelector('[data-testid="ai-model-btn"]');
  b.click();
  await new Promise((r) => setTimeout(r, 700));
  const menu = document.querySelector('[data-testid="ai-model-menu"]');
  const prov = [...document.querySelectorAll('[data-provider-item]')].map((e) => e.dataset.provider);
  const modelLangsung = document.querySelectorAll('[data-model-item]').length;
  return {
    adaMenu: !!menu, tahap: menu?.dataset.tahap, prov, modelLangsung,
    adaCari: !!document.querySelector('[data-testid="ai-model-cari"]'),
    catatan: document.querySelector('[data-testid="ai-mp-note"]')?.textContent?.trim() || null,
  };
})())`,
  90000,
);
cek('menu terbuka di tingkat provider', r1.adaMenu && r1.tahap === 'provider', `tahap=${r1.tahap}`);
cek(
  'hanya provider ber-key + bebas',
  r1.prov.includes('gemini') && r1.prov.includes('openai') && !r1.prov.includes('anthropic'),
  r1.prov.join(', '),
);
cek('model TIDAK tampil di tingkat provider', r1.modelLangsung === 0, `${r1.modelLangsung} model`);
cek('ada kotak cari', r1.adaCari);
cek('ada catatan provider disembunyikan', !!r1.catatan, r1.catatan || '');

// 2. Masuk ke provider gemini -> hanya model gemini.
const r2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-provider-item="gemini"]').click();
  await new Promise((r) => setTimeout(r, 800));
  const menu = document.querySelector('[data-testid="ai-model-menu"]');
  const items = [...document.querySelectorAll('[data-model-item]')].map((e) => ({ id: e.dataset.modelItem, prov: e.dataset.provider }));
  return {
    tahap: menu?.dataset.tahap,
    jumlah: items.length,
    semuaGemini: items.every((x) => x.prov === 'gemini'),
    contoh: items.slice(0, 3).map((x) => x.id),
    adaBack: !!document.querySelector('[data-testid="ai-mp-back"]'),
    judul: document.querySelector('.ai-mp-title')?.textContent?.trim(),
  };
})())`,
  90000,
);
cek('masuk tingkat model', r2.tahap === 'model', `tahap=${r2.tahap}`);
cek('judul = provider dipilih', r2.judul === 'Google Gemini', r2.judul || '');
cek('hanya model gemini', r2.semuaGemini && r2.jumlah >= 9, `${r2.jumlah} model: ${r2.contoh.join(', ')}`);
cek('ada tombol kembali', r2.adaBack);

// 3. Pilih model -> tersimpan & menu tertutup.
const r3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const target = [...document.querySelectorAll('[data-model-item]')].find((e) => e.dataset.modelItem === 'gemini-3.1-pro-preview');
  target.click();
  await new Promise((r) => setTimeout(r, 900));
  return {
    model: document.querySelector('[data-testid="ai-model-btn"]')?.dataset.model,
    menuTertutup: !document.querySelector('[data-testid="ai-model-menu"]'),
  };
})())`,
  90000,
);
cek('model terpilih', r3.model === 'gemini-3.1-pro-preview', r3.model || '');
cek('menu tertutup setelah pilih', r3.menuTertutup);

// 4. Cari lintas provider.
const r4 = await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="ai-model-btn"]').click();
  await new Promise((r) => setTimeout(r, 500));
  const inp = document.querySelector('[data-testid="ai-model-cari"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'gpt-5');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 700));
  const menu = document.querySelector('[data-testid="ai-model-menu"]');
  const items = [...document.querySelectorAll('[data-model-item]')].map((e) => ({ id: e.dataset.modelItem, prov: e.dataset.provider }));
  return {
    tahap: menu?.dataset.tahap, jumlah: items.length, items: items.slice(0, 6),
    semuaCocok: items.every((x) => x.id.toLowerCase().includes('gpt-5')),
  };
})())`,
  90000,
);
cek('mode cari aktif', r4.tahap === 'cari', `tahap=${r4.tahap}`);
cek('hasil cari cocok semua', r4.semuaCocok && r4.jumlah > 0, `${r4.jumlah} hasil: ${r4.items.map((x) => x.id).join(', ')}`);

// 5. Pilih dari hasil cari.
const r5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const t = [...document.querySelectorAll('[data-model-item]')].find((e) => e.dataset.modelItem === 'gpt-5.2');
  t.click();
  await new Promise((r) => setTimeout(r, 900));
  return { model: document.querySelector('[data-testid="ai-model-btn"]')?.dataset.model,
           prov: document.querySelector('[data-testid="ai-model-btn"]')?.dataset.provider };
})())`,
  90000,
);
cek('pilih dari hasil cari', r5.model === 'gpt-5.2' && r5.prov === 'openai', `${r5.prov}/${r5.model}`);

// 6. Pemilih model SUBAGENT.
const r6 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1000));
  const btn = document.querySelector('[data-testid="sub-model-btn"]');
  const label = btn?.querySelector('.ai-model-name')?.textContent?.trim();
  btn?.click();
  await new Promise((r) => setTimeout(r, 700));
  const menu = document.querySelector('[data-testid="sub-model-menu"]');
  const prov = [...document.querySelectorAll('[data-provider-item]')].map((e) => e.dataset.provider);
  const ikut = !!document.querySelector('[data-testid="sub-model-ikut"]');
  return { adaBtn: !!btn, label, adaMenu: !!menu, tahap: menu?.dataset.tahap, prov, ikut,
           chatMenuIkutTerbuka: !!document.querySelector('[data-testid="ai-model-menu"]') };
})())`,
  120000,
);
cek('pemilih model subagent ada', r6.adaBtn, `label="${r6.label}"`);
cek('default = Ikut chat', r6.label === 'Ikut chat', r6.label || '');
cek('menu subagent terbuka', r6.adaMenu && r6.tahap === 'provider');
cek('menu chat TIDAK ikut terbuka', !r6.chatMenuIkutTerbuka);
cek('ada opsi "Ikut model chat"', r6.ikut);
cek('provider ber-key sama', r6.prov.includes('gemini') && r6.prov.includes('openai'), r6.prov.join(', '));

// 7. Pilih model subagent -> tersimpan ke settings.
const r7 = await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-provider-item="openai"]').click();
  await new Promise((r) => setTimeout(r, 700));
  const t = [...document.querySelectorAll('[data-model-item]')].find((e) => e.dataset.modelItem === 'gpt-5-nano');
  t.click();
  await new Promise((r) => setTimeout(r, 1100));
  const S = window.__ZEPHYR__;
  return {
    sub: S.getState().settings.subagent,
    label: document.querySelector('[data-testid="sub-model-btn"]')?.querySelector('.ai-model-name')?.textContent?.trim(),
  };
})())`,
  120000,
);
cek('model subagent tersimpan', r7.sub?.model === 'gpt-5-nano', JSON.stringify(r7.sub));
cek('label berubah', r7.label === 'GPT-5 nano', r7.label || '');

// 8. Kembalikan ke "Ikut chat".
const r8 = await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="sub-model-btn"]')?.click();
  await new Promise((r) => setTimeout(r, 600));
  document.querySelector('[data-testid="sub-model-ikut"]')?.click();
  await new Promise((r) => setTimeout(r, 1000));
  return { sub: window.__ZEPHYR__.getState().settings.subagent,
           label: document.querySelector('[data-testid="sub-model-btn"]')?.querySelector('.ai-model-name')?.textContent?.trim() };
})())`,
  120000,
);
cek('kembali ke Ikut chat', r8.sub?.model === '' && r8.label === 'Ikut chat', `${r8.label} model="${r8.sub?.model}"`);

// Bersihkan: kembali ke panel AI.
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR_TERM__.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 500));
  return 1;
})())`,
  60000,
);
await cdp.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal > 0 ? 1 : 0);
