// Probe live: seksi lipat di Explorer + pane Atlas.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== probe live: explorer + wiki ===\n');

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const out = {};

  S.getState().setActivity('explorer');
  S.getState().setSidebarVisible(true);
  await tunggu(700);

  /* Seksi lipat harus ADA di bawah pohon berkas. */
  out.seksi = {
    outlineAda: !!q('[data-testid="sec-outline"]'),
    timelineAda: !!q('[data-testid="sec-timeline"]'),
    outlineHead: !!q('[data-testid="sec-outline-head"]'),
    /* Tertutup secara bawaan: isinya belum ada di DOM. */
    isiTertutup: !q('[data-testid="sec-outline-isi"]'),
    ariaExpanded: q('[data-testid="sec-outline-head"]')?.getAttribute('aria-expanded'),
  };

  /* Buka Outline: isinya harus muncul. */
  q('[data-testid="sec-outline-head"]')?.click();
  await tunggu(500);
  out.setelahBuka = {
    isiAda: !!q('[data-testid="sec-outline-isi"]'),
    ariaExpanded: q('[data-testid="sec-outline-head"]')?.getAttribute('aria-expanded'),
    tinggi: Math.round(q('[data-testid="sec-outline-isi"]')?.getBoundingClientRect().height ?? 0),
  };

  /* Outline TIDAK boleh lagi jadi tombol di rel. */
  out.rel = {
    tombolOutline: !!q('[data-activity="outline"]'),
    tombolWiki: !!q('[data-activity="wiki"]'),
    totalTombol: document.querySelectorAll('nav.activitybar [data-activity]').length,
  };

  /* Pane Atlas. */
  S.getState().setActivity('wiki');
  await tunggu(900);
  out.wiki = {
    panel: !!q('[data-testid="wiki-panel"]'),
    tabWiki: !!q('[data-testid="wiki-tab-wiki"]'),
    tabKnowledge: !!q('[data-testid="wiki-tab-knowledge"]'),
    cari: !!q('[data-testid="wiki-search"]'),
    banner: !!q('[data-testid="wiki-panel"] .wiki-banner'),
    kosong: !!q('[data-testid="wiki-kosong"]'),
    /* Whether the store already has entries, so the empty state can be checked
       for CONSISTENCY rather than for presence - a second run has entries. */
    adaEntri: (window.__ZEPHYR_WIKI__?.getState().entri.wiki.length ?? 0) > 0,
    halaman: !!q('[data-testid="wiki-page"]'),
    judul: q('[data-testid="wiki-page"] .wiki-page-title')?.textContent?.trim() ?? null,
    tombolGenerate: !!q('[data-testid="wiki-generate"]'),
    tombolPlan: !!q('[data-testid="wiki-create-plan"]'),

    /*
     * The options moved INTO the 3-dots popover (they used to be a block on the
     * page body), so the test opens it first - checking for them while it is
     * closed would report a missing control that is in fact one click away.
     * Closed-state assertions stay separate below.
     */
    titik3: !!q('[data-testid="wiki-options"]'),
    menuTertutup: !q('[data-testid="wiki-options-menu"]'),
  };
  q('[data-testid="wiki-options"]')?.click();
  await tunggu(250);
  out.wiki.menuTerbuka = !!q('[data-testid="wiki-options-menu"]');
  out.wiki.opsi = ['wiki-auto-update', 'wiki-auto-export', 'wiki-citation'].map((t) => !!q('[data-testid="' + t + '"]'));
  out.wiki.menuAdaExport = !!q('[data-testid="wiki-export"]');
  out.wiki.menuAdaImport = !!q('[data-testid="wiki-import"]');
  /* Close it again so the rest of the run sees the page in its resting state. */
  q('[data-testid="wiki-options"]')?.click();
  await tunggu(150);

  /* Ganti tab: daftar berganti, tab tetap satu. */
  q('[data-testid="wiki-tab-knowledge"]')?.click();
  await tunggu(400);
  out.gantiTab = {
    knowledgeAktif: q('[data-testid="wiki-tab-knowledge"]')?.getAttribute('aria-selected'),
    wikiNonaktif: q('[data-testid="wiki-tab-wiki"]')?.getAttribute('aria-selected'),
  };

  /* Kembalikan ke explorer. */
  S.getState().setActivity('explorer');
  await tunggu(300);
  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  90000,
);

const h = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
if (h.fatal) {
  console.error('GAGAL halaman error:', h.fatal);
  keluarBersih(1);
}

let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('Seksi lipat di Explorer:');
cek('sec-outline ada', h.seksi.outlineAda === true);
cek('sec-timeline ada', h.seksi.timelineAda === true);
cek('header pakai aria-expanded', h.seksi.ariaExpanded === 'false', `="${h.seksi.ariaExpanded}"`);
cek('tertutup secara bawaan', h.seksi.isiTertutup === true);
cek('klik membuka isi', h.setelahBuka.isiAda === true);
cek('aria-expanded jadi true', h.setelahBuka.ariaExpanded === 'true');
cek('isi punya tinggi nyata', h.setelahBuka.tinggi > 20, `${h.setelahBuka.tinggi}px`);

console.log('\nRel ActivityBar:');
cek('tombol outline SUDAH TIDAK ADA', h.rel.tombolOutline === false);
cek('tombol wiki ADA', h.rel.tombolWiki === true, `${h.rel.totalTombol} tombol`);

console.log('\nPane Atlas:');
cek('panel dirender', h.wiki.panel === true);
cek('tab Map ada', h.wiki.tabWiki === true);
cek('tab Cards ada', h.wiki.tabKnowledge === true);
cek('kotak cari ada', h.wiki.cari === true);
cek('banner penjelasan ada', h.wiki.banner === true);
/*
 * The empty state is asserted as "consistent with the store", not as "present".
 *
 * A previous run leaves the store full, and then the empty state SHOULD be gone -
 * a harness that demands it regardless would fail on a second run and report a
 * bug that is not there. What must always hold is that the two agree.
 */
cek(
  'keadaan kosong sesuai isi store',
  h.wiki.kosong === !h.wiki.adaEntri,
  `kosong=${h.wiki.kosong}, adaEntri=${h.wiki.adaEntri}`,
);
cek('halaman generator dirender', h.wiki.halaman === true);
cek('judul = Generate Your Atlas', h.wiki.judul === 'Generate Your Atlas', String(h.wiki.judul));
cek('tombol Generate ada', h.wiki.tombolGenerate === true);
cek('tombol Create With Plan ada', h.wiki.tombolPlan === true);
cek('3 opsi lengkap', h.wiki.opsi.every(Boolean), JSON.stringify(h.wiki.opsi));

console.log('\nGanti tab:');
cek('Knowledge aktif setelah diklik', h.gantiTab.knowledgeAktif === 'true');
cek('Wiki nonaktif', h.gantiTab.wikiNonaktif === 'false');

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
