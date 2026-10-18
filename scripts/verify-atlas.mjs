// Bukti: ActivityBar menampilkan "Atlas", tab Map/Cards, badge generated.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const q = (s) => document.querySelector(s);
  const out = {};

  S.getState().setActivity('wiki');
  S.getState().setSidebarVisible(true);
  await tunggu(1200);

  /* Label di rel kiri: tombol wiki harus berlabel Atlas. */
  const rel = q('[data-activity="wiki"]');
  out.rel = {
    ada: !!rel,
    judul: rel?.getAttribute('title') ?? null,
    aria: rel?.getAttribute('aria-label') ?? null,
  };

  /* Tab: teks apa adanya. */
  out.tabMap = q('[data-testid="wiki-tab-wiki"]')?.textContent?.trim() ?? null;
  out.tabCards = q('[data-testid="wiki-tab-knowledge"]')?.textContent?.trim() ?? null;
  out.badge = q('[data-testid="wiki-map-badge"]')?.textContent?.trim() ?? null;

  /* Tab default harus Cards. */
  out.tabAktif = q('[data-testid="wiki-tab-knowledge"]')?.getAttribute('aria-selected');
  out.mapNonaktif = q('[data-testid="wiki-tab-wiki"]')?.getAttribute('aria-selected');

  /* Judul halaman di area editor. */
  out.judul = q('[data-testid="wiki-page"] .wiki-page-title')?.textContent?.trim() ?? null;

  /* Istilah lama tidak boleh tersisa di UI mana pun. */
  const teks = document.body.innerText;
  out.sisaIstilahLama = ['Repo Wiki', 'Knowledge Card'].filter((t) => teks.includes(t));

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  120000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti rename:');
cek('tombol rel berlabel Atlas', /Atlas/.test(d.rel?.judul ?? '') || /Atlas/.test(d.rel?.aria ?? ''), d.rel?.judul ?? '');
cek('tab pertama = Map', /Map/.test(d.tabMap ?? ''), String(d.tabMap));
cek('tab kedua = Cards', /Cards/.test(d.tabCards ?? ''), String(d.tabCards));
cek('badge generated ada', !!d.badge, String(d.badge));
cek('tab default = Cards', d.tabAktif === 'true' && d.mapNonaktif === 'false', `cards=${d.tabAktif} map=${d.mapNonaktif}`);
cek('judul = Generate Your Atlas', /Generate Your Atlas/.test(d.judul ?? ''), String(d.judul));
cek('tidak ada istilah lama di layar', (d.sisaIstilahLama ?? []).length === 0, JSON.stringify(d.sisaIstilahLama));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
