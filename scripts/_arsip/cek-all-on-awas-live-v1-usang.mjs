/*
 * B3 live: tombol "All on" harus memperingatkan SEBELUM ditekan.
 *
 * Tombol itu menyalakan seluruh katalog - termasuk tool yang menulis berkas,
 * mengunduh, dan menjalankan perintah di mesin ini. Peringatannya harus bisa
 * dibaca user sebelum menekan, menyebut angka nyata dari katalog (bukan
 * "hati-hati"), dan warnanya harus datang dari variabel tema.
 *
 * Gerbang:
 *   B3-1 panel tool gate terbuka lewat jalur UI (menu ... -> Tool Sets).
 *   B3-2 baris peringatan ada saat ada tool wajib-izin yang mati, dan angka
 *        di dalamnya cocok dengan hitungan independen dari katalog.
 *   B3-3 warna baris itu benar-benar var(--warning), bukan hex yang ditulis di
 *        dalam komponen.
 *   B3-4 "All on" tetap sekali klik: peringatan hilang, total menjadi N of N.
 *   B3-5 "All off" memunculkan peringatan lagi.
 *   B3-6 pemulihan: tool set kembali seperti semula setelah uji.
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

const bukaLewatTombol = async () => {
  await cdp.json(`return JSON.stringify((() => {
  const more = document.querySelector('[data-testid="ai-more"]');
  if (!more) return { klik: false };
  more.click();
  const item = document.querySelector('[data-testid="ai-open-toolsets"]');
  if (!item) return { klik: false };
  item.click();
  return { klik: true };
})())`);
  for (let i = 0; i < 12; i++) {
    const ada = await cdp.json(`return JSON.stringify({ ada: !!document.querySelector('[data-testid="toolgate"]') })`);
    if (ada.ada) return true;
    await sleep(250);
  }
  return false;
};

const aktifAwal = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tg = await import('/src/lib/toolGate.ts');
  return { daftar: [...tg.useToolGate.getState().aktif] };
})())`,
);

let terbuka = await bukaLewatTombol();
let lewatTombol = true;
if (!terbuka) {
  lewatTombol = false;
  await cdp.json(`return JSON.stringify(await (async () => {
  const tg = await import('/src/lib/toolGate.ts');
  tg.useToolGate.getState().setBuka(true);
  return true;
})())`);
  await sleep(600);
  terbuka = (await cdp.json(`return JSON.stringify({ ada: !!document.querySelector('[data-testid="toolgate"]') })`)).ada;
}
oknama('B3-1 panel tool gate terbuka', terbuka === true, lewatTombol ? 'lewat tombol ... -> Tool Sets' : 'fallback setBuka(true)');

const baca = async () =>
  cdp.json(
    `return JSON.stringify(await (async () => {
  const cat = await import('/src/lib/zephyrTools/catalog.ts');
  const tg = await import('/src/lib/toolGate.ts');
  const st = tg.useToolGate.getState();
  const semua = tg.SEMUA_TOOL;
  const wajibIzin = semua.filter((n) => cat.TOOL_BY_NAME.get(n) && cat.TOOL_BY_NAME.get(n).needsApproval);
  const matiWajibIzin = wajibIzin.filter((n) => !st.aktif.has(n));
  const awas = document.querySelector('.tg-awas[data-testid="toolgate-all-on-awas"]');
  const total = document.querySelector('[data-testid="toolgate-total"]');
  let warnaAwas = null;
  let warnaVar = null;
  if (awas) {
    warnaAwas = getComputedStyle(awas).color;
    const probe = document.createElement('span');
    probe.style.color = 'var(--warning)';
    probe.style.position = 'absolute';
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
    teksAwas: awas ? String(awas.textContent || '').trim() : null,
    totalTeks: total ? String(total.textContent || '').trim() : null,
    nyala: st.aktif.size,
    warnaAwas,
    warnaVar,
  };
})())`,
  );

/* Kondisi pertama: perkecil ke set inti dulu supaya ada tool wajib-izin yang mati.
 * Ini juga jalur yang dipakai user: "All off" lalu membaca peringatannya. */
await cdp.json(`return JSON.stringify((() => {
  document.querySelector('[data-testid="toolgate-all-off"]').click();
  return true;
})())`);
await sleep(500);

const s1 = await baca();
console.log(`     katalog=${s1.n} wajib-izin-mati=${s1.m} nyala=${s1.nyala}`);
console.log(`     teks: ${s1.teksAwas}`);
oknama('B3-2 peringatan muncul dengan angka nyata', s1.adaAwas === true && s1.m > 0 && s1.teksAwas.includes(String(s1.n)) && s1.teksAwas.includes(String(s1.m)), `m=${s1.m} n=${s1.n}`);
const namaTampil = s1.namaSingkat.every((nm) => s1.teksAwas && s1.teksAwas.includes(nm.replace(/^mcp__[^_]+__/, '')));
oknama('B3-2b nama tool yang dimaksud ikut ditulis', namaTampil, JSON.stringify(s1.namaSingkat));
oknama('B3-3 warna dari var(--warning), bukan hex di komponen', !!s1.warnaAwas && s1.warnaAwas === s1.warnaVar, `awas=${s1.warnaAwas} var(--warning)=${s1.warnaVar}`);

await cdp.json(`return JSON.stringify((() => {
  document.querySelector('[data-testid="toolgate-all-on"]').click();
  return true;
})())`);
await sleep(500);
const s2 = await baca();
oknama('B3-4 All on: peringatan hilang, total N of N', s2.adaAwas === false && s2.nyala === s2.n, `ada=${s2.adaAwas} nyala=${s2.nyala}/${s2.n} total="${s2.totalTeks}"`);

await cdp.json(`return JSON.stringify((() => {
  document.querySelector('[data-testid="toolgate-all-off"]').click();
  return true;
})())`);
await sleep(500);
const s3 = await baca();
oknama('B3-5 All off: peringatan balik lagi', s3.adaAwas === true && s3.nyala < s3.n, `ada=${s3.adaAwas} nyala=${s3.nyala}`);

await cdp.json(
  `return JSON.stringify(await (async () => {
  const tg = await import('/src/lib/toolGate.ts');
  tg.useToolGate.getState().dari(${JSON.stringify(aktifAwal.daftar)});
  tg.useToolGate.getState().setBuka(false);
  return true;
})())`,
);
await sleep(400);
const akhir = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tg = await import('/src/lib/toolGate.ts');
  return { nyala: tg.useToolGate.getState().aktif.size, panel: !!document.querySelector('[data-testid="toolgate"]') };
})())`,
);
oknama('B3-6 tool set kembali seperti semula', akhir.nyala === aktifAwal.daftar.length && akhir.panel === false, `nyala=${akhir.nyala} (awal ${aktifAwal.daftar.length})`);

console.log(gagal.length ? `GAGAL: ${gagal.join(', ')}` : 'SEMUA GERBANG LULUS');
await cdp.close();
process.exit(gagal.length ? 1 : 0);
