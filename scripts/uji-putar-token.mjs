/**
 * uji-putar-token.mjs - buktikan token MCP yang DIPUTAR langsung berlaku.
 *
 *   node scripts/uji-putar-token.mjs [port-cdp]
 *
 * Ini mengunci bug yang sudah diperbaiki: token baru ditulis ke mcp.json dan
 * ditampilkan di UI, tapi server masih memegang salinan token dari saat bind -
 * sehingga setiap permintaan dijawab 401, dan tidak ada cara memperbaikinya
 * selain mematikan lalu menyalakan server.
 *
 * Yang dibuktikan:
 *   T1  token LAMA diterima sebelum diputar
 *   T2  setelah "New token" ditekan, token BARU diterima
 *   T3  dan token LAMA sekarang DITOLAK (bukan keduanya berlaku)
 *
 * T3 yang paling penting: memutar token yang membuat LAMA dan BARU sama-sama
 * berlaku bukan perbaikan - itu justru meninggalkan kunci lama tetap hidup.
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.argv[2] ? String(process.argv[2]) : '9444';
const KANDIDAT = [9222, 9224, 9225, 9226, 9227];
const r = reporter('putar-token');

const { cdp } = await Cdp.attach(PORT);

async function baca(expr) {
  try {
    return JSON.parse(await cdp.eval('JSON.stringify(' + expr + ')'));
  } catch {
    return null;
  }
}

function bacaTokenDariBerkas() {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const berkas = path.join(appdata, 'zephyr', 'mcp.json');
  try {
    return JSON.parse(fs.readFileSync(berkas, 'utf8')).token || null;
  } catch {
    return null;
  }
}

async function tanya(port, token) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const teks = await res.text();
    let jumlah = -1;
    try {
      const j = JSON.parse(teks);
      jumlah = j.result && j.result.tools ? j.result.tools.length : -1;
    } catch {
      jumlah = -1;
    }
    return { status: res.status, jumlah };
  } catch {
    return { status: 0, jumlah: -1 };
  }
}

/* Cari port MCP yang hidup. */
let MCP = 0;
for (const p of KANDIDAT) {
  try {
    const res = await fetch(`http://127.0.0.1:${p}/health`);
    if (res.status === 200) {
      MCP = p;
      break;
    }
  } catch {
    /* port berikutnya */
  }
}

r.check('T0', MCP > 0, MCP > 0 ? `server MCP hidup di 127.0.0.1:${MCP}` : `tidak ada server MCP di ${KANDIDAT.join(', ')}`);

const tokenLama = bacaTokenDariBerkas();
r.check('T0b', !!tokenLama, `token lama terbaca dari mcp.json (${tokenLama ? tokenLama.length : 0} karakter)`);

/* ---- T1: token lama diterima SEBELUM diputar ---- */

const sebelum = await tanya(MCP, tokenLama);
r.check(
  'T1',
  sebelum.status === 200 && sebelum.jumlah > 0,
  `token lama diterima sebelum diputar: ${sebelum.status}, ${sebelum.jumlah} tool`,
);

/* ---- Putar token lewat tombol di UI ---- */

/*
 * Halaman MCP dibuka DULU, dengan menunggu.
 *
 * Ikon Settings adalah toggle, dan nav Settings hanya ada saat halamannya
 * terbuka. Versi pertama skrip ini langsung mencari tombolnya dan gagal -
 * padahal tombolnya ada, hanya halamannya belum terbuka. Tanpa klik, token
 * memang tidak berubah, lalu T3 ikut gagal karena token lama masih sah - satu
 * penyebab, tiga kegagalan yang tampak berbeda.
 */
await baca(`(() => {
  const btns = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')];
  const set = btns.find((b) => /settings/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
  if (set && !document.querySelector('.set-nav-item')) set.click();
  return true;
})()`);

let adaNav = false;
for (let i = 0; i < 14 && !adaNav; i++) {
  await sleep(400);
  const c = await baca(`({ n: document.querySelectorAll('.set-nav-item').length })`);
  adaNav = c && c.n > 0;
}

await baca(`(() => {
  const n = [...document.querySelectorAll('.set-nav-item')].find((x) => /^mcp$/i.test((x.textContent || '').trim()));
  if (n) n.click();
  return true;
})()`);

await sleep(1000);

const klik = await baca(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /^new token$/i.test((x.textContent || '').trim()));
  if (!b) {
    return {
      ok: false,
      adaNav: document.querySelectorAll('.set-nav-item').length,
      tombol: [...document.querySelectorAll('button')].map((x) => (x.textContent || '').trim()).filter(Boolean).slice(0, 12),
    };
  }
  b.click();
  return { ok: true };
})()`);

r.check(
  'T2a',
  klik && klik.ok === true,
  klik && klik.ok ? 'tombol "New token" ditemukan dan diklik' : `tombol tidak ketemu (nav=${klik ? klik.adaNav : '?'}, tombol=${JSON.stringify(klik ? klik.tombol : [])})`,
);

await sleep(2000);

const tokenBaru = bacaTokenDariBerkas();
r.check(
  'T2b',
  !!tokenBaru && tokenBaru !== tokenLama,
  `mcp.json berisi token BERBEDA setelah diputar (${tokenBaru ? tokenBaru.slice(0, 8) : '?'} vs ${tokenLama ? tokenLama.slice(0, 8) : '?'})`,
);

/* ---- T2: token baru diterima ---- */

const sesudah = await tanya(MCP, tokenBaru);
r.check(
  'T2',
  sesudah.status === 200 && sesudah.jumlah > 0,
  `token BARU langsung diterima TANPA memulai ulang server: ${sesudah.status}, ${sesudah.jumlah} tool`,
);

/* ---- T3: token lama DITOLAK ---- */

const lamaDitolak = await tanya(MCP, tokenLama);
r.check(
  'T3',
  lamaDitolak.status === 401 || lamaDitolak.status === 403,
  `token LAMA sekarang DITOLAK (${lamaDitolak.status}) - bukan dua-duanya berlaku`,
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
