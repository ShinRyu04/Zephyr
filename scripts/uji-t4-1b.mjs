// uji-t4-1b.mjs — panel INFO subagent di sebelah KANAN chat AI (T4.1b).
//
// KENAPA diuji begini: user dua kali bilang tidak menemukan panel subagent
// ("gua cari kok ga nemu"). Jadi yang diperiksa bukan cuma "komponennya ada di
// kode", tapi: panel benar-benar muncul DI DOM saat dinyalakan, berada di
// KANAN panel chat, bisa ditutup, dan pilihannya tersimpan ke settings.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) lulus++;
  else gagal++;
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? '  ' + info : ''}`);
};

// Siapkan: chat di kolom KANAN + subagent punya sesuatu untuk ditampilkan.
const setup = await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  await Ti.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await new Promise((r) => setTimeout(r, 600));
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({
    general: { aiPanel: 'right' },
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 700));
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  T.getState().setVisible(true);
  const AI = window.__ZEPHYR_AI__.store.getState();
  await AI.loadKeys();
  // setModel memilih provider+model sekaligus; tanpa ini provider aktif masih
  // yang lama dan subagent tidak pernah sampai ke mock.
  await AI.setModel('gemini-3.8-flash');
  await new Promise((r) => setTimeout(r, 1000));
  return {
    aiPanel: S.getState().settings.general.aiPanel,
    adaKolom: !!document.querySelector('[data-testid="ai-side-col"]'),
  };
})())`,
  90000,
);
cek('panel AI di kolom kanan', setup.aiPanel === 'right' && setup.adaKolom, `aiPanel=${setup.aiPanel}`);

// 1. Default: panel info TERTUTUP.
const r1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  // Bersihkan subagent sisa uji sebelumnya — kalau tidak, uji "status kosong"
  // di bawah gagal padahal panelnya benar.
// Pastikan baseUrl mock benar-benar terpasang — kalau tidak, request pergi
// ke API asli dan uji menggantung sampai timeout.
{
  const bu = window.__ZEPHYR__.getState().settings.models.providers.gemini?.baseUrl ?? '';
  if (!bu.includes('8098')) throw new Error('baseUrl mock tidak terpasang: ' + bu);
}

  window.__ZEPHYR_SUB__.bersihkan();
  await new Promise((r) => setTimeout(r, 600));
  return { ada: !!document.querySelector('[data-testid="sai-root"]') };
})())`,
  60000,
);
cek('default panel info tertutup', !r1.ada);

// 2. Nyalakan dari LayoutMenu -> panel muncul di DOM.
const r2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.store.getState().setSubKanan(true);
  await L.store.getState().simpan();
  await new Promise((r) => setTimeout(r, 1000));
  const sai = document.querySelector('[data-testid="sai-root"]');
  const col = document.querySelector('[data-testid="ai-side-col"]');
  const panel = document.querySelector('[data-testid="ai-panel"]');
  const rc = sai?.getBoundingClientRect();
  const rp = panel?.getBoundingClientRect();
  return {
    ada: !!sai,
    // Panel info harus di KANAN panel chat.
    kananChat: !!(rc && rp && rc.left >= rp.right - 2),
    x: rc ? Math.round(rc.left) : null,
    lebarChat: rp ? Math.round(rp.width) : null,
    lebarInfo: rc ? Math.round(rc.width) : null,
    diDalamKolom: !!(col && sai && col.contains(sai)),
    teks: sai?.textContent?.slice(0, 90) || '',
  };
})())`,
  90000,
);
cek('panel info muncul di DOM', r2.ada, `x=${r2.x} lebar=${r2.lebarInfo}`);
cek('berada di KANAN chat', r2.kananChat, `chat ${r2.lebarChat}px | info ${r2.lebarInfo}px`);
cek('di dalam kolom AI', r2.diDalamKolom);
cek('menampilkan status kosong', r2.teks.includes('Belum ada subagent'), r2.teks.slice(0, 60));

// 3. Jalankan subagent -> panel menampilkan item.
const r3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  await window.__ZEPHYR_SUB__.store.getState().jalankan([
    'Balas satu kata: SATU',
    'Balas satu kata: DUA',
  ]);
  // Tunggu sampai benar-benar selesai — waktu tetap membuat uji rapuh saat
  // provider lambat, dan status "jalan" bikin assertion berikutnya gagal.
  const batas = Date.now() + 25000;
  while (Date.now() < batas && window.__ZEPHYR_SUB__.store.getState().sibuk) {
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 700));
  const items = [...document.querySelectorAll('[data-testid^="sai-item-"]')].map((e) => ({
    status: e.dataset.status,
    teks: e.textContent.trim().slice(0, 70),
  }));
  const angka = document.querySelector('[data-testid="sai-angka"]')?.textContent?.trim();
  return { jumlah: items.length, items, angka };
})())`,
  150000,
);
cek('panel menampilkan subagent', r3.jumlah === 2, `${r3.jumlah} item`);
cek('ada nama + peran + langkah', r3.items.every((x) => x.teks.length > 8), r3.items[0]?.teks || '');
cek('angka status terisi', !!r3.angka && r3.angka.length > 0, r3.angka || '');

// 4. Tombol tutup -> panel hilang + tersimpan ke settings.
const r4 = await cdp.json(
  `return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="sai-tutup"]')?.click();
  await new Promise((r) => setTimeout(r, 900));
  const disk = await window.__ZEPHYR_SET__.settingsFromDisk();
  return {
    ada: !!document.querySelector('[data-testid="sai-root"]'),
    disk: disk?.general?.layout?.subKanan ?? null,
  };
})())`,
  90000,
);
cek('panel tertutup setelah tombol X', !r4.ada);
cek('pilihan tersimpan ke settings', r4.disk === false, `disk=${r4.disk}`);

// 5. Baris di Customize Layout ada.
const r5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.store.getState().setMenuBuka(true);
  await new Promise((r) => setTimeout(r, 700));
  const baris = document.querySelector('[data-testid="lm-subKanan"]');
  const label = baris?.textContent?.trim() || '';
  const aktif = baris?.getAttribute('aria-pressed');
  baris?.click();
  await new Promise((r) => setTimeout(r, 900));
  return {
    ada: !!baris, label, aktif, sesudah: window.__ZEPHYR_LAYOUT__.store.getState().subKanan,
    panelAda: !!document.querySelector('[data-testid="sai-root"]'),
  };
})())`,
  90000,
);
cek('baris Customize Layout ada', r5.ada, r5.label);
cek('klik baris menyalakan panel', r5.sesudah === true && r5.panelAda, `subKanan=${r5.sesudah}`);

// Bersihkan: matikan panel + kembali ke dock bawah (default user).
await cdp.json(
  `return JSON.stringify(await (async () => {
  const L = window.__ZEPHYR_LAYOUT__;
  L.store.getState().setSubKanan(false);
  L.store.getState().setMenuBuka(false);
  await L.store.getState().simpan();
  const S = window.__ZEPHYR__;
  await S.getState().applySettings({ general: { aiPanel: 'bottom' } });
  window.__ZEPHYR_SUB__.bersihkan();
  await new Promise((r) => setTimeout(r, 800));
  return 1;
})())`,
  90000,
);
await cdp.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal > 0 ? 1 : 0);
