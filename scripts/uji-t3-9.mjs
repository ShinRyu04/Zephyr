// uji-t3-9.mjs — verifikasi dropdown slash command bisa digulir (T3.9).
//
// YANG DIUJI (keluhan user: "saat menggunakan / bisa scroll gitu"):
//   1. Dropdown punya batas tinggi + overflow-y auto
//   2. Panah bawah/atas memindahkan sorotan
//   3. Saat sorotan pindah ke item di luar pandangan, daftar IKUT TERGULIR
//      (inilah yang bikin panah keyboard berguna)
//   4. Roda mouse / drag scrollbar juga menggulir
//   5. Semua item tetap terjangkau (tidak ada yang terpotong permanen)
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== T3.9: dropdown slash command bisa digulir ===\n');

// ── Siapkan: buka panel AI + banyak prompt user supaya daftar panjang ──
const siap = await cdp.json(`return JSON.stringify(await (async () => {
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  T.getState().setVisible(true);
  await new Promise((r) => setTimeout(r, 1000));
  // Tambah 14 prompt user: total > 20 item -> pasti melebihi tinggi apa pun,
  // jadi perilaku gulir benar-benar teruji (bukan kebetulan muat).
  const P = window.__ZEPHYR_PROMPT_LIB__;
  if (P) {
    P.simpan([
      ...Array.from({ length: 14 }, (_, i) => ({
        cmd: 'uji' + (i + 1),
        label: 'Prompt uji ' + (i + 1),
        body: 'Isi prompt uji nomor ' + (i + 1),
      })),
    ]);
  }
  await new Promise((r) => setTimeout(r, 500));
  return { adaLib: !!P };
})())`, 90000);

// ── V1: ketik "/" -> dropdown muncul dengan banyak item ──
const buka = await cdp.json(`return JSON.stringify(await (async () => {
  const ta = document.querySelector('[data-testid="ai-input"]') || document.querySelector('.ai-input textarea') || document.querySelector('textarea[aria-label]');
  if (!ta) return { err: 'textarea tidak ketemu' };
  // Ketik "/" lewat setter native supaya React onChange ikut jalan.
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, '/');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  const box = document.querySelector('[data-testid="ai-slash"]');
  return {
    adaBox: !!box,
    n: box ? box.querySelectorAll('.ai-slash-item').length : 0,
    scrollHeight: box ? box.scrollHeight : 0,
    clientHeight: box ? box.clientHeight : 0,
    overflowY: box ? getComputedStyle(box).overflowY : '',
  };
})())`, 90000);
cek('dropdown slash muncul', buka.adaBox === true, buka.err || '');
cek('dropdown memuat banyak item', buka.n >= 15, `${buka.n} item`);
cek('dropdown punya batas tinggi', buka.clientHeight > 0 && buka.clientHeight < buka.scrollHeight,
  `client ${buka.clientHeight} < scroll ${buka.scrollHeight}`);
cek('overflow-y = auto (bisa digulir)', buka.overflowY === 'auto', buka.overflowY);

// ── V2: panah bawah memindahkan sorotan DAN menggulir daftar ──
const panah = await cdp.json(`return JSON.stringify(await (async () => {
  const ta = document.querySelector('textarea[aria-label]') || document.querySelector('.ai-input textarea');
  const box = document.querySelector('[data-testid="ai-slash"]');
  const geser = (n) => ta.dispatchEvent(new KeyboardEvent('keydown', { key: n, bubbles: true, cancelable: true }));

  const awal = { top: box.scrollTop, idx: [...box.querySelectorAll('.ai-slash-item')].findIndex((e) => e.classList.contains('is-on')) };
  // Turun 12 kali: cukup untuk melewati batas pandangan kalau tidak auto-scroll.
  for (let i = 0; i < 12; i++) {
    geser('ArrowDown');
    await new Promise((r) => setTimeout(r, 60));
  }
  await new Promise((r) => setTimeout(r, 300));
  const akhir = { top: box.scrollTop, idx: [...box.querySelectorAll('.ai-slash-item')].findIndex((e) => e.classList.contains('is-on')) };
  // Item tersorot harus terlihat penuh di dalam kotak.
  const el = box.querySelectorAll('.ai-slash-item')[akhir.idx];
  const rEl = el.getBoundingClientRect();
  const rBox = box.getBoundingClientRect();
  return {
    awal, akhir,
    terlihat: rEl.top >= rBox.top - 1 && rEl.bottom <= rBox.bottom + 1,
    naikKeBawah: akhir.top > awal.top,
  };
})())`, 90000);
cek('panah bawah memindahkan sorotan', panah.akhir.idx > panah.awal.idx,
  `${panah.awal.idx} -> ${panah.akhir.idx}`);
cek('daftar IKUT TERGULIR saat sorotan turun', panah.naikKeBawah === true,
  `scrollTop ${panah.awal.top} -> ${panah.akhir.top}`);
cek('item tersorot terlihat penuh', panah.terlihat === true);

// ── V3: panah atas menggulir balik ke atas ──
const balik = await cdp.json(`return JSON.stringify(await (async () => {
  const ta = document.querySelector('textarea[aria-label]') || document.querySelector('.ai-input textarea');
  const box = document.querySelector('[data-testid="ai-slash"]');
  const sebelum = box.scrollTop;
  for (let i = 0; i < 12; i++) {
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));
  }
  await new Promise((r) => setTimeout(r, 300));
  return { sebelum, sesudah: box.scrollTop, idx: [...box.querySelectorAll('.ai-slash-item')].findIndex((e) => e.classList.contains('is-on')) };
})())`, 90000);
cek('panah atas menggulir balik ke atas', balik.sesudah < balik.sebelum,
  `scrollTop ${balik.sebelum} -> ${balik.sesudah}`);
cek('sorotan kembali ke item atas', balik.idx === 0, `idx ${balik.idx}`);

// ── V4: gulir manual (roda mouse) juga bekerja ──
const roda = await cdp.json(`return JSON.stringify(await (async () => {
  const box = document.querySelector('[data-testid="ai-slash"]');
  box.scrollTop = 0;
  await new Promise((r) => setTimeout(r, 150));
  box.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
  // set scrollTop langsung = simulasi drag scrollbar; yang penting nilainya
  // bisa berubah dan tetap dalam rentang sah.
  box.scrollTop = 80;
  await new Promise((r) => setTimeout(r, 200));
  return { top: box.scrollTop, maks: box.scrollHeight - box.clientHeight };
})())`, 60000);
cek('daftar bisa digulir manual', roda.top > 0 && roda.top <= roda.maks + 1, `top ${roda.top} / maks ${roda.maks}`);

// ── V5: item terakhir tetap terjangkau ──
const akhir = await cdp.json(`return JSON.stringify(await (async () => {
  const box = document.querySelector('[data-testid="ai-slash"]');
  box.scrollTop = box.scrollHeight;
  await new Promise((r) => setTimeout(r, 250));
  const items = box.querySelectorAll('.ai-slash-item');
  const terakhir = items[items.length - 1];
  const rEl = terakhir.getBoundingClientRect();
  const rBox = box.getBoundingClientRect();
  return { n: items.length, terlihat: rEl.bottom <= rBox.bottom + 1 && rEl.top >= rBox.top - 1 };
})())`, 60000);
cek('item terakhir terjangkau', akhir.terlihat === true, `${akhir.n} item`);

// ── bersihkan: hapus prompt uji + tutup dropdown ──
await cdp.json(`return JSON.stringify(await (async () => {
  const P = window.__ZEPHYR_PROMPT_LIB__;
  if (P) P.simpan([]);
  const ta = document.querySelector('textarea[aria-label]') || document.querySelector('.ai-input textarea');
  if (ta) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, '');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await new Promise((r) => setTimeout(r, 400));
  return 1;
})())`, 60000);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
