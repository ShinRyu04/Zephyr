// Bukti: Atlas SUDAH HILANG dari Zephyr.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const q = (s) => document.querySelector(s);
  const out = {};

  await tunggu(600);

  /* 1. Rel kiri: berapa tombol, dan apakah wiki masih ada? */
  const rel = [...document.querySelectorAll('[data-activity]')].map((b) => b.getAttribute('data-activity'));
  out.rel = { tombol: rel, jumlah: rel.length, adaWiki: rel.includes('wiki') };

  /* 2. Jembatan store harus hilang. */
  out.bridge = typeof window.__ZEPHYR_WIKI__;

  /* 3. Paksa activity 'wiki' (profil lama): harus jatuh ke tempat yang nyata. */
  try {
    S.getState().setActivity('wiki');
    await tunggu(500);
    out.paksaWiki = {
      activity: S.getState().activity,
      sidebar: q('.side-panel, .explorer-panel, .wiki-panel')?.className ?? null,
      adaPaneWiki: !!q('[data-testid="wiki-panel"]'),
      adaHalamanWiki: !!q('[data-testid="wiki-page"]'),
    };
  } catch (e) {
    out.paksaWiki = { galat: String(e) };
  }

  /* 4. Teks di layar tidak boleh menyebut Atlas / Repo Wiki. */
  S.getState().setActivity('explorer');
  S.getState().setSidebarVisible(true);
  await tunggu(700);
  const teks = document.body.innerText;
  out.sisaTeks = ['Atlas', 'Repo Wiki', 'Knowledge Card', 'Map', 'Cards'].filter((t) => teks.includes(t));

  /* 5. Sidebar tetap berfungsi: explorer punya isi. */
  out.sidebarHidup = !!q('[data-testid="tree-row"], .tree-row, .side-panel');

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

console.log('\nBukti Atlas sudah dihapus:');
cek('tombol wiki TIDAK ada di rel', d.rel?.adaWiki === false, `rel: ${(d.rel?.tombol ?? []).join(', ')}`);
cek('jembatan __ZEPHYR_WIKI__ hilang', d.bridge === 'undefined', String(d.bridge));
cek('paksa activity wiki tidak merender pane', d.paksaWiki?.adaPaneWiki === false, JSON.stringify(d.paksaWiki?.adaPaneWiki));
cek('paksa activity wiki tidak merender halaman', d.paksaWiki?.adaHalamanWiki === false, JSON.stringify(d.paksaWiki?.adaHalamanWiki));
cek('tidak ada teks Atlas/Repo Wiki di layar', (d.sisaTeks ?? []).length === 0, JSON.stringify(d.sisaTeks));
cek('sidebar tetap berfungsi', d.sidebarHidup === true);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
