/*
 * B3 live: tombol "All on" harus memperingatkan SEBELUM ditekan.
 *
 * Tombol itu menyalakan seluruh katalog - termasuk tool yang menulis berkas,
 * mengunduh, dan menjalankan perintah di mesin ini. Peringatannya harus bisa
 * dibaca user sebelum menekan, menyebut angka nyata dari katalog (bukan
 * "hati-hati"), dan warnanya harus datang dari variabel tema.
 *
 * Gerbang:
 *   B3-1 panel tool gate terbuka lewat jalur UI nyata (menu ... -> Chat Settings
 *        -> nav Tools -> tombol "Open tool sets…").
 *   B3-2 baris peringatan ada saat ada tool wajib-izin yang mati, angka di
 *        dalamnya cocok dengan hitungan dari katalog, dan nama toolnya ikut.
 *   B3-3 warna baris itu benar-benar var(--warning), bukan hex di komponen.
 *   B3-4 "All on" tetap sekali klik: peringatan hilang, total menjadi N of N.
 *   B3-5 "All off" memunculkan peringatan lagi.
 *   B3-6 pemulihan: set tool kembali persis seperti semula.
 *
 * Uji ini TIDAK mengimpor `toolGate.ts` sendiri: Vite menyajikan salinan modul
 * yang berbeda ke skrip luar, jadi perubahan di salinan itu tidak menggerakkan
 * panel sama sekali. Lewat jembatan `__ZEPHYR_AI__.toolGate`, uji memakai
 * instance aplikasi yang sebenarnya - dan bisa memulihkannya.
 *
 * Pemakaian: node scripts/cek-all-on-awas-live.mjs [port]
 */
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const gagal = [];
const oknama = (n, lulus, catatan) => {
  console.log(`${lulus ? 'OK  ' : 'GAGAL'} ${n}${catatan ? ' - ' + catatan : ''}`);
  if (!lulus) gagal.push(n);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

const ada = async (sel) =>
  (await cdp.json(`return JSON.stringify({ ada: !!document.querySelector(${JSON.stringify(sel)}) })`)).ada;

const klik = async (sel) =>
  cdp.json(
    `return JSON.stringify((() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { ok: false };
  el.click();
  return { ok: true };
})())`,
  );

/* Jeda antar klik itu bagian dari ujinya: menu ⋯ muncul setelah React selesai
 * render, jadi dua klik dalam satu evaluasi selalu kehilangan klik kedua. */
const bukaPanel = async () => {
  if (!(await klik('[data-testid="ai-more"]')).ok) return 'tidak ada tombol ...';
  await sleep(450);
  /* Entri menu lama "Tool Sets" (ai-open-toolsets) sudah dicabut dari UI. Jalur
     baru ke picker tool: Chat Settings -> nav Tools -> "Open tool sets…"
     (cset-tools). */
  if (!(await klik('[data-testid="ai-open-chat-settings"]')).ok) return 'menu ... tanpa item Chat Settings';
  await sleep(500);
  await klik('[data-testid="cset-nav-tools"]');
  await sleep(400);
  if (!(await klik('[data-testid="cset-tools"]')).ok) return 'Chat Settings tanpa tombol "Open tool sets…" (cset-tools)';
  for (let i = 0; i < 16; i++) {
    if (await ada('[data-testid="toolgate"]')) return null;
    await sleep(250);
  }
  return 'panel tidak muncul setelah item diklik';
};

const aktifAwal = (await cdp.json(`return JSON.stringify({ daftar: window.__ZEPHYR_AI__.toolGate.aktif() })`)).daftar;

const galat = await bukaPanel();
oknama(
  'B3-1 panel tool gate terbuka lewat menu ... -> Chat Settings -> Tools -> "Open tool sets…"',
  galat === null,
  galat || `set tool awal: ${aktifAwal.length} nyala`,
);

const baca = async () =>
  cdp.json(
    `return JSON.stringify(await (async () => {
  const cat = await import('/src/lib/zephyrTools/catalog.ts');
  const aktif = new Set(window.__ZEPHYR_AI__.toolGate.aktif());
  const semua = [...cat.TOOL_NAMES];
  const matiWajibIzin = semua.filter((n) => {
    const e = cat.TOOL_BY_NAME.get(n);
    return !!e && e.needsApproval && !aktif.has(n);
  });
  const awas = document.querySelector('.tg-awas[data-testid="toolgate-all-on-awas"]');
  const total = document.querySelector('[data-testid="toolgate-total"]');
  let warnaAwas = null;
  let warnaVar = null;
  if (awas) {
    warnaAwas = getComputedStyle(awas).color;
    const probe = document.createElement('span');
    probe.style.color = 'var(--warning)';
    probe.style.position = 'fixed';
    probe.style.opacity = '0';
    probe.textContent = 'x';
    document.body.appendChild(probe);
    warnaVar = getComputedStyle(probe).color;
    probe.remove();
  }
  return {
    n: semua.length,
    m: matiWajibIzin.length,
    namaSingkat: matiWajibIzin.slice(0, 4),
    adaAwas: !!awas,
    teksAwas: awas ? String(awas.textContent || '').replace(/\\s+/g, ' ').trim() : null,
    totalTeks: total ? String(total.textContent || '').replace(/\\s+/g, ' ').trim() : null,
    nyala: aktif.size,
    warnaAwas,
    warnaVar,
  };
})())`,
  );

/* Mulai dari "All off" supaya pasti ada tool wajib-izin yang mati - dan karena
 * itu jalur yang dipakai user untuk membaca peringatannya. */
await klik('[data-testid="toolgate-all-off"]');
await sleep(500);

const s1 = await baca();
console.log(`     katalog=${s1.n} wajib-izin-mati=${s1.m} nyala=${s1.nyala}`);
console.log(`     teks: ${s1.teksAwas}`);
oknama(
  'B3-2 peringatan muncul dengan angka nyata dari katalog',
  s1.adaAwas === true &&
    s1.m > 0 &&
    !!s1.teksAwas &&
    s1.teksAwas.includes(String(s1.n)) &&
    s1.teksAwas.includes(String(s1.m)),
  `ada=${s1.adaAwas} m=${s1.m} n=${s1.n}`,
);
const namaIkut = s1.namaSingkat.every((nm) => !!s1.teksAwas && s1.teksAwas.includes(nm.replace(/^mcp__[^_]+__/, '')));
oknama('B3-2b nama tool yang dimaksud ikut ditulis', namaIkut, JSON.stringify(s1.namaSingkat));
oknama(
  'B3-3 warna dari var(--warning), bukan hex di komponen',
  !!s1.warnaAwas && s1.warnaAwas === s1.warnaVar,
  `awas=${s1.warnaAwas} var(--warning)=${s1.warnaVar}`,
);

await klik('[data-testid="toolgate-all-on"]');
await sleep(500);
const s2 = await baca();
oknama(
  'B3-4 All on tetap sekali klik: peringatan hilang, total N of N',
  s2.adaAwas === false && s2.nyala === s2.n && s2.totalTeks === `${s2.n} of ${s2.n} on`,
  `ada=${s2.adaAwas} nyala=${s2.nyala}/${s2.n} total="${s2.totalTeks}"`,
);

await klik('[data-testid="toolgate-all-off"]');
await sleep(500);
const s3 = await baca();
oknama(
  'B3-5 All off: peringatan balik lagi',
  s3.adaAwas === true && s3.nyala < s3.n,
  `ada=${s3.adaAwas} nyala=${s3.nyala}`,
);

await cdp.json(`return JSON.stringify({ isi: (window.__ZEPHYR_AI__.toolGate.isi(${JSON.stringify(aktifAwal)}), true) })`);
await klik('[data-testid="toolgate-tutup"]');
await sleep(400);
const akhir = await cdp.json(
  `return JSON.stringify({ nyala: window.__ZEPHYR_AI__.toolGate.aktif().length, panel: !!document.querySelector('[data-testid="toolgate"]') })`,
);
oknama(
  'B3-6 set tool kembali persis seperti semula & panel tertutup',
  akhir.nyala === aktifAwal.length && akhir.panel === false,
  `nyala=${akhir.nyala} (awal ${aktifAwal.length}) panel=${akhir.panel}`,
);

console.log(gagal.length ? `GAGAL: ${gagal.join(', ')}` : 'SEMUA GERBANG LULUS');
await cdp.close();
process.exit(gagal.length ? 1 : 0);
