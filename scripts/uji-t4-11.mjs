// uji-t4-11.mjs — tab AI jadi tab tersendiri di strip panel bawah (T4.11).
//
// PERMINTAAN USER (verbatim): "ini kan AI msih di tab terminal, jdi klo bisa di
// sebelah ports di aja, kek ports AI subagents gtu"
//
// Jadi yang diperiksa: tab AI benar-benar ada DI STRIP TAB (bukan sub-tab di
// dalam Terminal), urutannya tepat setelah Ports, bisa diklik, menampilkan
// panel chat, dan tidak ada AiPanel ganda saat AI dipindah ke kolom kanan.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) lulus++;
  else gagal++;
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? '  ' + info : ''}`);
};

// 1. Urutan tab di strip.
const r1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(false);
  // T4.14: tab AI disembunyikan saat chat di kolom kanan — pastikan di BAWAH
  // dulu supaya tabnya ada di strip.
  await S.getState().applySettings({ general: { aiPanel: 'bottom' } });
  await new Promise((r) => setTimeout(r, 800));
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  await new Promise((r) => setTimeout(r, 800));
  const tabs = [...document.querySelectorAll('[data-testid="pts-tab"]')].map((e) => ({
    id: e.dataset.tabId || e.getAttribute('data-tab') || '',
    teks: e.textContent.trim(),
  }));
  return { tabs };
})())`,
  90000,
);
const id = (t) => t.id || t.teks.toLowerCase();
console.log('  urutan tab:', r1.tabs.map((t) => t.teks).join(' | '));
cek(
  'ada tab AI di strip utama',
  r1.tabs.some((t) => t.teks === 'AI' || id(t) === 'ai'),
  r1.tabs.map((t) => t.teks).join(', '),
);
const iP = r1.tabs.findIndex((t) => /ports/i.test(t.teks));
const iA = r1.tabs.findIndex((t) => t.teks === 'AI');
const iS = r1.tabs.findIndex((t) => /subagent/i.test(t.teks));
cek('AI tepat setelah Ports', iA === iP + 1, `ports=${iP} ai=${iA} subagents=${iS}`);
cek('Subagents setelah AI', iS === iA + 1, `ai=${iA} subagents=${iS}`);

// 2. Klik tab AI -> panel chat muncul.
const r2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tab = [...document.querySelectorAll('[data-testid="pts-tab"]')].find((e) => e.textContent.trim() === 'AI');
  if (!tab) throw new Error('tab AI tidak ada di strip');
  tab.click();
  await new Promise((r) => setTimeout(r, 900));
  const panel = document.querySelector('[data-testid="ai-panel"]');
  const aktif = document.querySelector('[data-testid="pts-tab"].is-active')?.textContent?.trim();
  const body = document.querySelector('[data-testid="panel-body"]')?.dataset.activeTab;
  return {
    adaPanel: !!panel,
    tabAktif: aktif,
    activeTab: body,
    jumlahPanel: document.querySelectorAll('[data-testid="ai-panel"]').length,
    adaDockSwitch: !!document.querySelector('[data-testid="dock-switch"]'),
  };
})())`,
  90000,
);
cek('klik tab AI menampilkan panel chat', r2.adaPanel && r2.activeTab === 'ai', `activeTab=${r2.activeTab}`);
cek('tab AI jadi aktif', r2.tabAktif === 'AI', r2.tabAktif || '');
cek('hanya SATU AiPanel ter-mount', r2.jumlahPanel === 1, `${r2.jumlahPanel} panel`);
cek('DockSwitch sudah tidak ada', !r2.adaDockSwitch);

// 3. Terminal tetap murni terminal (tidak ada sub-tab AI di dalamnya).
const r3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  // Nama tab Terminal bisa berakhiran angka badge (mis. "Terminal1") — jangan
  // cocokkan sama persis, itu membuat pencarian mengembalikan undefined.
  const tab = [...document.querySelectorAll('[data-testid="pts-tab"]')].find((e) =>
    e.textContent.trim().startsWith('Terminal'),
  );
  tab.click();
  await new Promise((r) => setTimeout(r, 900));
  const host = document.querySelector('[data-testid="panel-term-host"]');
  return {
    adaTerminal: !!host,
    adaDock: !!document.querySelector('[data-testid="dock-switch"]'),
    adaAiDiDalamTerminal: !!host?.querySelector('[data-testid="ai-panel"]'),
    activeTab: document.querySelector('[data-testid="panel-body"]')?.dataset.activeTab,
  };
})())`,
  90000,
);
cek('tab Terminal menampilkan terminal', r3.adaTerminal && r3.activeTab === 'terminal', r3.activeTab || '');
cek('TIDAK ada sub-tab AI di dalam Terminal', !r3.adaDock && !r3.adaAiDiDalamTerminal);

// 4. Command palette punya View: Show AI.
const r4 = await cdp.json(
  `return JSON.stringify(await (async () => {
  // Palette punya items() yang sudah terfilter. Untuk mencari command tertentu,
  // buka palette dengan query 'show ai' lalu periksa id-nya.
  const CP = window.__ZEPHYR_CP__;
  CP.open('command');
  await new Promise((r) => setTimeout(r, 500));
  CP.setQuery('show ai');
  await new Promise((r) => setTimeout(r, 500));
  const daftar = CP.items().map((x) => x.id);
  const ada = daftar.includes('aiPanel.focus');
  CP.close();
  await new Promise((r) => setTimeout(r, 300));
  return { ada, daftar: daftar.slice(0, 5) };
})())`,
  60000,
);
cek('command View: Show AI terdaftar', r4.ada === true, (r4.daftar || []).join(', '));

// 5. AI di kolom kanan: tab AI TIDAK merender panel kedua.
const r5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({ general: { aiPanel: 'right' } });
  await new Promise((r) => setTimeout(r, 900));
  const P = window.__ZEPHYR_PANEL__;
  P.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 1000));
  const jumlahPanel = document.querySelectorAll('[data-testid="ai-panel"]').length;
  const pindah = !!document.querySelector('[data-testid="ai-tab-moved"]');
  const kolom = !!document.querySelector('[data-testid="ai-side-col"]');
  return { jumlahPanel, pindah, kolom };
})())`,
  90000,
);
cek('AI di kanan: kolom kanan muncul', r5.kolom);
cek('AI di kanan: hanya SATU AiPanel', r5.jumlahPanel === 1, `${r5.jumlahPanel} panel`);
cek('AI di kanan: tab AI beri keterangan', r5.pindah);

// 6. T4.14: tab AI HILANG saat chat dipindah ke kolom kanan.
const r6 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({ general: { aiPanel: 'right' } });
  await new Promise((r) => setTimeout(r, 1100));
  const tabs = [...document.querySelectorAll('[data-testid="pts-tab"]')].map((e) => e.textContent.trim());
  const adaKolom = !!document.querySelector('[data-testid="ai-side-col"]');
  return { tabs, adaAi: tabs.includes('AI'), adaKolom };
})())`,
  90000,
);
cek('chat di kanan: tab AI HILANG dari strip', !r6.adaAi, r6.tabs.join(', '));
cek('chat di kanan: kolom kanan muncul', r6.adaKolom);

// 7. T4.14: kolom kanan bisa di-drag (lebar berubah).
const r7 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const sebelum = S.getState().aiWidth;
  S.getState().setAiWidth(520);
  await new Promise((r) => setTimeout(r, 700));
  const kolom = document.querySelector('[data-testid="ai-side-col"]');
  return {
    sebelum,
    sesudah: S.getState().aiWidth,
    lebarKotak: kolom ? Math.round(kolom.getBoundingClientRect().width) : 0,
    adaResizer: !!document.querySelector('[data-testid="ai-resizer"]'),
  };
})())`,
  90000,
);
cek('lebar kolom AI bisa diubah', r7.sesudah === 520 && r7.lebarKotak >= 500, `${r7.sebelum} -> ${r7.lebarKotak}px`);
cek('ada resizer untuk drag', r7.adaResizer);

// 8. T4.14: tombol maximize melebarkan penuh.
const r8 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const btn = document.querySelector('[data-testid="ai-max"]');
  const adaTombol = !!btn;
  btn?.click();
  await new Promise((r) => setTimeout(r, 900));
  const kolom = document.querySelector('[data-testid="ai-side-col"]');
  return {
    adaTombol,
    aiMax: S.getState().aiMax,
    kelasMax: kolom?.classList.contains('is-max') ?? false,
    lebarKotak: kolom ? Math.round(kolom.getBoundingClientRect().width) : 0,
    adaResizerSaatMax: !!document.querySelector('[data-testid="ai-resizer"]'),
  };
})())`,
  90000,
);
cek('tombol maximize ada di kolom kanan', r8.adaTombol);
cek('maximize melebarkan kolom', r8.aiMax === true && r8.kelasMax, `${r8.lebarKotak}px`);
cek('resizer disembunyikan saat maximize', !r8.adaResizerSaatMax);

// Bersihkan: kembali ke bawah.
await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({ general: { aiPanel: 'bottom' } });
  const S2 = window.__ZEPHYR__;
  S2.getState().setAiMax(false);
  S2.getState().setAiWidth(340);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  await new Promise((r) => setTimeout(r, 700));
  return 1;
})())`,
  90000,
);
await cdp.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal > 0 ? 1 : 0);
