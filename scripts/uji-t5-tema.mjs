// uji-t5-tema.mjs — tema baru + latar belakang kustom.
//
// Permintaan user: "tambahkan banyak tema nya ya, bebas tema gimna pun, dan jga
// bisa edit background jga ntah pasang foto, apakah bisa?"
import { Cdp } from './lib-cdp.mjs';

const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (!ok) process.exitCode = 1;
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== Tema baru + latar belakang ===\n');

// ── V1: katalog tema ─────────────────────────────────────────────────────
const v1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setActivity('settings');
  S.getState().setSidebarVisible(true);
  S.getState().setSettingsOpen(true);
  await new Promise((r) => setTimeout(r, 900));
  document.querySelector('[data-testid="set-nav-theme"]')?.click();
  await new Promise((r) => setTimeout(r, 1200));
  const kartu = [...document.querySelectorAll('[data-theme-card]')].map((e) => e.getAttribute('data-theme-card'));
  return { jumlah: kartu.length, kartu };
})())`,
  90000,
);
cek('katalog tema bertambah (>= 18)', v1.jumlah >= 18, `${v1.jumlah} tema`);
for (const id of ['dracula', 'catppuccin-mocha', 'rose-pine', 'kanagawa', 'everforest-dark', 'github-dark', 'ayu-mirage', 'solarized-light', 'nord-light', 'min-light']) {
  cek(`tema "${id}" ada`, v1.kartu.includes(id));
}

// ── V2: tiap tema punya token LENGKAP (tidak jatuh ke tema lain) ─────────
const v2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const ids = ${JSON.stringify(['dracula', 'catppuccin-mocha', 'rose-pine', 'kanagawa', 'everforest-dark', 'github-dark', 'ayu-mirage', 'solarized-light', 'nord-light', 'min-light'])};
  const out = [];
  const TOKEN = ['--bg', '--surface', '--text', '--accent', '--border', '--editor-bg', '--syn-keyword', '--syn-string'];
  for (const id of ids) {
    await S.getState().applySettings({ theme: { current: id }, general: { theme: id.includes('light') ? 'light' : 'dark' } });
    await new Promise((r) => setTimeout(r, 320));
    const cs = getComputedStyle(document.documentElement);
    const nilai = TOKEN.map((t) => (cs.getPropertyValue(t) || '').trim());
    out.push({ id, lengkap: nilai.every((x) => x.length > 0), contoh: nilai[0] });
  }
  return out;
})())`,
  150000,
);
for (const x of v2) {
  cek(`tema "${x.id}" semua token terisi`, x.lengkap, x.contoh);
}

// ── V3: ganti tema benar-benar mengubah warna ─────────────────────────────
const v3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const baca = () => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  await S.getState().applySettings({ theme: { current: 'dracula' }, general: { theme: 'dark' } });
  await new Promise((r) => setTimeout(r, 400));
  const a = baca();
  await S.getState().applySettings({ theme: { current: 'nord' }, general: { theme: 'dark' } });
  await new Promise((r) => setTimeout(r, 400));
  const b = baca();
  await S.getState().applySettings({ theme: { current: 'zephyr-dark' }, general: { theme: 'dark' } });
  await new Promise((r) => setTimeout(r, 400));
  const c = baca();
  return { dracula: a, nord: b, kembali: c, dataTheme: document.documentElement.dataset.theme };
})())`,
  120000,
);
cek('ganti tema mengubah warna latar', v3.dracula !== v3.nord, `dracula=${v3.dracula} nord=${v3.nord}`);
cek('kembali ke zephyr-dark', v3.dataTheme === 'zephyr-dark', v3.dataTheme);

// ── V4: UI latar belakang ada ─────────────────────────────────────────────
const v4 = await cdp.json(
  `return JSON.stringify({
  pick: !!document.querySelector('[data-testid="theme-bg-pick"]'),
  clear: !!document.querySelector('[data-testid="theme-bg-clear"]'),
  adaRowLatar: [...document.querySelectorAll('.set-label')].some((e) => /latar belakang/i.test(e.textContent || '')),
})`,
  60000,
);
cek('tombol "Pilih gambar" ada', v4.pick);
cek('tombol reset latar ada', v4.clear);
cek('baris "Latar belakang" ada', v4.adaRowLatar);

// ── V5: pasang latar (pakai gambar sintetis kecil) ────────────────────────
const v5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  // PNG 1x1 transparan sebagai data URL — cukup untuk membuktikan jalur
  // CSS variable + atribut data-bg bekerja tanpa perlu file di disk.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await S.getState().applySettings({ background: { image: png, opacity: 40, size: 'fill', transparan: true } });
  await new Promise((r) => setTimeout(r, 700));
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const sebelum = {
    dataBg: root.dataset.bg ?? null,
    bgImage: cs.getPropertyValue('--bg-image').trim().slice(0, 30),
    opacity: cs.getPropertyValue('--bg-opacity').trim(),
    size: cs.getPropertyValue('--bg-size').trim(),
  };
  // Panel jadi tembus pandang
  const panel = document.querySelector('.sidebar') || document.querySelector('.main-area');
  const bgPanel = panel ? getComputedStyle(panel).backgroundColor : '';
  // Bersihkan
  await S.getState().applySettings({ background: { image: '' } });
  await new Promise((r) => setTimeout(r, 700));
  const sesudah = {
    dataBg: root.dataset.bg ?? null,
    bgImage: cs.getPropertyValue('--bg-image').trim(),
  };
  return { sebelum, sesudah, bgPanel };
})())`,
  120000,
);
cek('latar terpasang (data-bg=on)', v5.sebelum.dataBg === 'on', String(v5.sebelum.dataBg));
cek('--bg-image terisi', v5.sebelum.bgImage.includes('url'), v5.sebelum.bgImage);
cek('--bg-opacity = 0.4', v5.sebelum.opacity === '0.4', v5.sebelum.opacity);
cek('--bg-size = cover', v5.sebelum.size === 'cover', v5.sebelum.size);
cek('latar bisa dihapus', v5.sesudah.dataBg === null && !v5.sesudah.bgImage.includes('url'), String(v5.sesudah.dataBg));

// ── V6: command Rust bg_image_read menolak file non-gambar ────────────────
const v6 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const Ti = window.__TAURI_INTERNALS__;
  const out = {};
  try {
    await Ti.invoke('bg_image_read', { path: 'D:/Zephyr/package.json' });
    out.nonGambar = 'DITERIMA (salah)';
  } catch (e) {
    out.nonGambar = (e?.message ?? JSON.stringify(e)).slice(0, 80);
  }
  try {
    await Ti.invoke('bg_image_read', { path: 'D:/tidak-ada-file-ini.png' });
    out.hilang = 'DITERIMA (salah)';
  } catch (e) {
    out.hilang = (e?.message ?? JSON.stringify(e)).slice(0, 80);
  }
  return out;
})())`,
  90000,
);
cek('bg_image_read menolak file non-gambar', /format|dikenali/i.test(v6.nonGambar), v6.nonGambar.slice(0, 50));
cek('bg_image_read menolak file tidak ada', /bukan file|tidak/i.test(v6.hilang), v6.hilang.slice(0, 50));

await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`,
  60000,
);

await cdp.close();
console.log(`\n== ${process.exitCode ? 'ADA YANG GAGAL' : 'SEMUA LULUS'} ==`);
