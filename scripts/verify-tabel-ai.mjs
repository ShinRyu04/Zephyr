/*
 * Bukti: tabel di jawaban AI tidak lagi memotong kata per huruf.
 *
 * Keluhan: di panel kanan (340px), tabel jawaban tampil dengan kolom "Berkas"
 * yang isinya "packa-ge.jso-n" - dipecah per huruf ke bawah. Penyebabnya
 * `word-break: break-word` yang diwarisi `.ai-body` ke setiap `<td>`, ditambah
 * pembungkus `.ai-tabel-bungkus` yang tidak punya CSS sama sekali sehingga
 * tabel DIPAKSA muat, bukan digeser.
 *
 * Uji ini menyuntik tabel ke app yang hidup lalu MENGUKUR:
 *   T1  sel tabel memakai word-break normal (kata tidak dipecah per huruf)
 *   T2  satu baris tabel muat dalam satu baris teks (tinggi <= 1,5x line-height)
 *   T3  nama berkas tetap utuh di DOM
 *   T4  tabel yang lebih lebar dari panel BISA digeser mendatar
 *   T5  CSS pembungkus benar-benar ada di stylesheet (bukan inline style)
 *   T6  paragraf biasa TETAP membungkus kata panjang (tidak ikut dikunci)
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify((() => {
  const out = {};

  /* Wadah berukuran sama dengan panel AI yang sempit. */
  const host = document.createElement('div');
  host.className = 'ai-body';
  host.style.width = '340px';
  host.style.maxWidth = '340px';
  document.body.appendChild(host);

  const bungkus = document.createElement('div');
  bungkus.className = 'ai-tabel-bungkus';
  bungkus.innerHTML =
    '<table><thead><tr><th>Berkas</th><th>Baris</th><th>Bukti</th></tr></thead><tbody>' +
    '<tr><td>package.json</td><td>1-20</td><td>metadata, script start, devDependency electron</td></tr>' +
    '<tr><td>main.js</td><td>1-140</td><td>BrowserWindow, IPC chat:stream / chat:stop</td></tr>' +
    '</tbody></table>';
  host.appendChild(bungkus);

  const tabel = bungkus.querySelector('table');
  const tds = tabel.querySelectorAll('tbody tr:first-child td');
  const tcs = getComputedStyle(tds[0]);
  out.wordBreakSel = tcs.wordBreak;

  const kolom = [];
  for (let i = 0; i < tds.length; i++) {
    const r = tds[i].getBoundingClientRect();
    kolom.push({ lebar: Math.round(r.width), tinggi: Math.round(r.height) });
  }
  out.kolom = kolom;
  out.lineHeight = Math.round(parseFloat(tcs.lineHeight) || 19);
  out.barisTerpakai = Math.round(kolom[0].tinggi / out.lineHeight);

  out.teksSel = tds[0].textContent;
  out.teksUtuh = out.teksSel === 'package.json';

  out.lebarTabel = Math.round(tabel.getBoundingClientRect().width);
  out.lebarBungkus = Math.round(bungkus.getBoundingClientRect().width);
  out.bisaScroll = bungkus.scrollWidth > bungkus.clientWidth;
  out.scrollW = bungkus.scrollWidth;
  out.clientW = bungkus.clientWidth;

  out.adaCssBungkus = [...document.styleSheets].some((sh) => {
    try {
      return [...sh.cssRules].some((r) => r.selectorText && r.selectorText.includes('ai-tabel-bungkus'));
    } catch {
      return false;
    }
  });

  /*
   * T6: paragraf biasa HARUS tetap boleh membungkus kata panjang. Kalau
   * perbaikan tabel ikut mengunci .ai-body, URL panjang akan meluber keluar
   * panel - menukar satu bug dengan bug lain.
   */
  const p = document.createElement('p');
  p.textContent = 'https://contoh.example/' + 'a'.repeat(120);
  host.appendChild(p);
  out.wordBreakParagraf = getComputedStyle(p).wordBreak;
  out.paragrafMembungkus = out.wordBreakParagraf === 'break-word' || getComputedStyle(p).overflowWrap === 'break-word' || getComputedStyle(p).overflowWrap === 'anywhere';

  host.remove();
  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  60000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — tabel tidak memotong kata:');
cek('T1 sel memakai word-break normal', d.wordBreakSel === 'normal', d.wordBreakSel);
cek(
  'T2 baris tabel muat satu baris teks',
  d.barisTerpakai <= 1,
  `${d.kolom?.[0]?.tinggi}px / ${d.lineHeight}px = ${d.barisTerpakai} baris`,
);
cek('T3 nama berkas utuh', d.teksUtuh === true, String(d.teksSel));
cek(
  'T4 tabel lebar bisa digeser mendatar',
  d.bisaScroll === true,
  `scroll ${d.scrollW} > client ${d.clientW}`,
);
cek('T5 CSS pembungkus ada di stylesheet', d.adaCssBungkus === true, '');
cek('T6 paragraf biasa tetap membungkus kata panjang', d.paragrafMembungkus === true, d.wordBreakParagraf);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
