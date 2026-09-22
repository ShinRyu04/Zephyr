// uji-t3-4.mjs — verifikasi T3.4 (Zen mode, pratinjau gambar, peek).
//
// UJI NYATA: gambar PNG sungguhan dibaca lewat Rust dan dimensinya diperiksa
// terhadap ukuran yang diketahui; zen mode benar-benar menyembunyikan elemen
// (diukur dari DOM, bukan dari state saja).
import { Cdp } from './lib-cdp.mjs';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
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

// PNG 4x2 merah (dibuat sendiri supaya dimensinya pasti).
const DIR = 'D:/Zephyr/.uji-img';
const PNG = `${DIR}/uji-4x2.png`;
try {
  mkdirSync(DIR, { recursive: true });
  // PNG minimal 4x2: signature + IHDR + IDAT + IEND. IDAT-nya kosong —
  // decoder akan komplain, tapi HEADER-nya valid dan itu yang dibaca Rust.
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdrData = [
    0, 0, 0, 4, // lebar 4
    0, 0, 0, 2, // tinggi 2
    8, 6, 0, 0, 0, // 8-bit RGBA
  ];
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc(Buffer.concat([t, Buffer.from(data)])));
    return Buffer.concat([len, t, Buffer.from(data), crcBuf]);
  };
  const png = Buffer.concat([
    Buffer.from(sig),
    chunk('IHDR', ihdrData),
    chunk('IEND', []),
  ]);
  writeFileSync(PNG, png);
  console.log(`  (PNG uji dibuat: ${PNG} — 4×2, ${png.length} byte)\n`);
} catch (e) {
  console.log(`  (gagal membuat PNG: ${String(e).slice(0, 100)})\n`);
}

console.log('=== T3.4: Zen + pratinjau gambar ===\n');

// ── V1: baca gambar lewat Rust ──
const g = await cdp.json(`return JSON.stringify(await (async () => {
  const r = await window.__TAURI_INTERNALS__.invoke('baca_gambar', { path: ${JSON.stringify(PNG)} });
  return { lebar: r.lebar, tinggi: r.tinggi, n: r.base64.length, bytes: r.bytes };
})())`, 90000);
cek('baca_gambar jalan', !g.err, `${g.lebar}×${g.tinggi} ${g.n} char base64`);
cek('dimensi terbaca dari header PNG (4×2)', g.lebar === 4 && g.tinggi === 2, `${g.lebar}×${g.tinggi}`);

// ── V2: file tidak ada -> error jelas ──
const hilang = await cdp.json(`return JSON.stringify(await (async () => {
  try {
    await window.__TAURI_INTERNALS__.invoke('baca_gambar', { path: 'D:/tidak-ada-xyz.png' });
    return { err: false };
  } catch (e) {
    return { err: true, pesan: String(e && e.message ? e.message : e).slice(0, 80) };
  }
})())`, 60000);
cek('file tidak ada -> error jelas', hilang.err === true, hilang.pesan || '');

// ── V3: helper apakahGambar benar ──
const ext = await cdp.json(`return JSON.stringify(await (async () => {
  const U = window.__ZEPHYR_UI__;
  return {
    png: U.apakahGambar('logo.png'),
    jpg: U.apakahGambar('foto.JPG'),
    ts: U.apakahGambar('main.ts'),
    md: U.apakahGambar('catatan.md'),
    mime: U.mimeGambar('a.webp'),
  };
})())`, 60000);
cek('apakahGambar: .png/.JPG ya', ext.png === true && ext.jpg === true, JSON.stringify(ext));
cek('apakahGambar: .ts/.md bukan', ext.ts === false && ext.md === false);
cek('mimeGambar benar', ext.mime === 'image/webp', String(ext.mime));

// ── V4: Zen mode benar-benar menyembunyikan elemen ──
const sebelum = await cdp.json(`return JSON.stringify({
  act: getComputedStyle(document.querySelector('.activitybar')).display,
  sb: (() => { const e = document.querySelector('.sidebar'); return e ? getComputedStyle(e).display : 'tanpa'; })(),
})`);
const zen = await cdp.json(`return JSON.stringify(await (async () => {
  const U = window.__ZEPHYR_UI__;
  U.setMode('zen');
  await new Promise((r) => setTimeout(r, 500));
  const app = document.querySelector('.app-body');
  return {
    mode: U.mode(),
    kelas: app ? app.className.includes('is-zen') : false,
    act: getComputedStyle(document.querySelector('.activitybar')).display,
    sb: (() => { const e = document.querySelector('.sidebar'); return e ? getComputedStyle(e).display : 'tanpa'; })(),
  };
})())`, 60000);
cek('zen: kelas is-zen terpasang', zen.kelas === true, `mode=${zen.mode}`);
cek('zen: ActivityBar disembunyikan', sebelum.act !== 'none' && zen.act === 'none',
  `${sebelum.act} -> ${zen.act}`);
cek('zen: sidebar disembunyikan', zen.sb === 'none' || zen.sb === 'tanpa', `-> ${zen.sb}`);

// ── V5: keluar dari zen -> elemen kembali ──
const keluar = await cdp.json(`return JSON.stringify(await (async () => {
  const U = window.__ZEPHYR_UI__;
  U.setMode('normal');
  await new Promise((r) => setTimeout(r, 500));
  const app = document.querySelector('.app-body');
  return {
    mode: U.mode(),
    kelas: app ? app.className.includes('is-zen') : true,
    act: getComputedStyle(document.querySelector('.activitybar')).display,
  };
})())`, 60000);
cek('keluar zen: kelas hilang', keluar.kelas === false, `mode=${keluar.mode}`);
cek('keluar zen: ActivityBar kembali', keluar.act !== 'none', `display=${keluar.act}`);

// ── V6: command zenMode terdaftar ──
const cmd = await cdp.json(`return JSON.stringify(await (async () => {
  const U = window.__ZEPHYR_UI__;
  // Command dicek lewat PALETTE NYATA: buka palette, cari 'zen', lihat hasilnya.
  const P = window.__ZEPHYR_CP__;
  P.open('command');
  P.setQuery('zen');
  await new Promise((r) => setTimeout(r, 400));
  const hasil = P.items().map((x) => (x && x.id) || x);
  const ada = hasil.includes('view.zenMode');
  P.close();
  U.toggleZen();
  const setelah = U.mode();
  U.toggleZen();
  return { ada, setelah, akhir: U.mode() };
})())`, 60000);
cek('command view.zenMode muncul di palette (cari "zen")', cmd.ada === true, JSON.stringify(cmd.ada));
cek('command zen bekerja (toggle bolak-balik)', cmd.setelah === 'zen' && cmd.akhir === 'normal',
  `${cmd.setelah} -> ${cmd.akhir}`);

// ── V7: UI pratinjau gambar ter-render ──
const ui = await cdp.json(`return JSON.stringify(await (async () => {
  const U = window.__ZEPHYR_UI__;
  U.setGambar({
    path: ${JSON.stringify(PNG)},
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    lebar: 4, tinggi: 2,
  });
  await new Promise((r) => setTimeout(r, 600));
  return {
    ada: !!document.querySelector('[data-testid="img-view"]'),
    adaEl: !!document.querySelector('[data-testid="img-el"]'),
    adaZoom: !!document.querySelector('[data-testid="img-zoom"]'),
    teks: (document.querySelector('[data-testid="img-view"]')?.textContent || '').slice(0, 70),
  };
})())`, 60000);
cek('panel pratinjau gambar ter-render', ui.ada === true && ui.adaEl === true, ui.teks);
cek('tombol zoom ada', ui.adaZoom === true);

// ── V8: bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_UI__.setGambar(null);
  return 1;
})())`, 30000);
try {
  if (existsSync(PNG)) rmSync(DIR, { recursive: true, force: true });
} catch {}

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
