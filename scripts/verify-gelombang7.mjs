/**
 * verify-gelombang7.mjs - verifikasi hidup perbaikan Gelombang 7.
 *
 *   node scripts/verify-gelombang7.mjs 9223
 *
 * Yang diuji harus bisa DIBUKTIKAN dari DOM hidup, bukan dari niat kode:
 *   G7-1  klik ikon AI membuka panel AI (dan menutupnya lagi)
 *   G7-2  ActivityBar berada di atas lapisan overlay melayang
 *   G7-3  tidak ada teks status yang menempel ke angka ("51running")
 *   G7-4  menu subagent benar-benar melayang (position absolute)
 *   G7-5  baris "Tasks" kembar sudah tidak ada di area status
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('gelombang7');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* ---- G7-1: ikon AI membuka panel ---- */

/* Pastikan keadaan awal bersih. */
await cdp.eval(`(() => {
  const t = window.__ZEPHYR_TERMINAL__;
  return true;
})()`);

const buka = await cdp.json(`return JSON.stringify((() => {
  const btn = document.querySelector('[data-testid="activity-ai"], [aria-label*="AI" i][role="button"]');
  const kandidat = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')]
    .map((b) => ({ label: b.getAttribute('aria-label') || b.title || '', el: b }));
  return {
    adaTombol: kandidat.length,
    label: kandidat.map((k) => k.label),
  };
})())`);
r.check('G7-1a', buka.adaTombol > 0, `tombol ActivityBar ditemukan: ${buka.adaTombol} (${buka.label.join(' | ')})`);

/* Klik ikon AI dua kali: harus buka lalu tutup. */
const klikAi = await cdp.json(`return JSON.stringify(await (async () => {
  const semua = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')];
  const ai = semua.find((b) => /ai|assistant|asisten/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
  if (!ai) return { ada: false, label: semua.map((b) => b.getAttribute('aria-label') || b.title) };

  const panelAda = () => !!document.querySelector('.ai-panel');

  /* Pastikan mulai dari TERTUTUP. Harness lain bisa meninggalkan panel
     terbuka, dan kalau kita mulai dari terbuka, klik pertama berarti "tutup" -
     lalu ujinya gagal padahal aplikasinya benar. */
  if (panelAda()) {
    ai.click();
    await new Promise((res) => setTimeout(res, 450));
  }
  const sebelum = panelAda();

  ai.click();
  await new Promise((res) => setTimeout(res, 450));
  const sesudahBuka = panelAda();
  ai.click();
  await new Promise((res) => setTimeout(res, 450));
  const sesudahTutup = panelAda();

  return { ada: true, label: ai.getAttribute('aria-label') || ai.title, sebelum, sesudahBuka, sesudahTutup };
})())`);

if (!klikAi.ada) {
  r.check('G7-1b', false, `ikon AI tidak ketemu. Label tersedia: ${(klikAi.label || []).join(' | ')}`);
} else {
  r.check(
    'G7-1b',
    klikAi.sesudahBuka !== klikAi.sebelum,
    `klik ikon AI mengubah keberadaan panel (${klikAi.sebelum} -> ${klikAi.sesudahBuka}) pada "${klikAi.label}"`,
  );
  r.check(
    'G7-1c',
    klikAi.sesudahBuka === true && klikAi.sesudahTutup === false,
    `klik pertama membuka, klik kedua menutup (buka=${klikAi.sesudahBuka} tutup=${klikAi.sesudahTutup})`,
  );
}

/* ---- G7-2: ActivityBar di atas overlay melayang ---- */

const z = await cdp.json(`return JSON.stringify((() => {
  const ab = document.querySelector('.activitybar');
  if (!ab) return { ada: false };
  const c = getComputedStyle(ab);
  return { ada: true, zIndex: c.zIndex, position: c.position };
})())`);

if (!z.ada) {
  r.check('G7-2', false, '.activitybar tidak ada');
} else {
  const tinggi = z.position !== 'static' && Number(z.zIndex) >= 1000;
  r.check(
    'G7-2',
    tinggi,
    `ActivityBar punya lapisan sendiri: position=${z.position} z-index=${z.zIndex} (harus >= 1000)`,
  );
}

/* ---- G7-3: tidak ada status yang menempel ---- */

/* Buka panel AI supaya elemen statusnya benar-benar ter-render. */
await cdp.eval(`(() => {
  const semua = [...document.querySelectorAll('.activitybar button, .activitybar [role="button"]')];
  const ai = semua.find((b) => /ai|assistant|asisten/i.test((b.getAttribute('aria-label') || '') + (b.title || '')));
  if (ai && !document.querySelector('.ai-panel')) ai.click();
})()`);
await sleep(500);

const tempel = await cdp.json(`return JSON.stringify((() => {
  const teks = [];
  for (const sel of ['.sai-root', '.w4-thinking-status', '.ai-subagents-count']) {
    for (const el of document.querySelectorAll(sel)) teks.push(el.textContent || '');
  }
  /* Pola yang salah: huruf langsung diikuti angka tanpa spasi, mis. "1running". */
  const rusak = teks.filter((t) => /[a-zA-Z]{2,}\\d|\\d[a-zA-Z]{2,}/.test(t.trim()));
  return { diperiksa: teks.length, contoh: teks.slice(0, 6), rusak };
})())`);

r.check(
  'G7-3',
  tempel.rusak.length === 0,
  `tidak ada teks status yang menempel${tempel.rusak.length ? ` (rusak: ${JSON.stringify(tempel.rusak)})` : ''}. Diperiksa: ${JSON.stringify(tempel.contoh)}`,
);

/* ---- G7-4: menu subagent melayang ---- */

const menu = await cdp.json(`return JSON.stringify(await (async () => {
  const wrap = document.querySelector('.ai-subagents-wrap');
  if (!wrap) return { ada: false };
  const btn = wrap.querySelector('button');
  if (!btn) return { ada: false, alasan: 'tombol tidak ada' };

  btn.click();
  await new Promise((res) => setTimeout(res, 350));
  const el = document.querySelector('.ai-subagents-menu');
  if (!el) return { ada: true, menuMuncul: false };

  const c = getComputedStyle(el);
  const rkt = el.getBoundingClientRect();
  return {
    ada: true,
    menuMuncul: true,
    position: c.position,
    zIndex: c.zIndex,
    borderRadius: c.borderTopLeftRadius,
    shadow: c.boxShadow !== 'none',
    maxHeight: c.maxHeight,
    lebar: Math.round(rkt.width),
  };
})())`);

if (!menu.ada || !menu.menuMuncul) {
  r.check('G7-4', false, `menu subagent tidak muncul (${JSON.stringify(menu)})`);
} else {
  const melayang = menu.position === 'absolute' && menu.borderRadius !== '0px' && menu.shadow === true;
  r.check(
    'G7-4',
    melayang,
    `menu melayang: position=${menu.position} radius=${menu.borderRadius} shadow=${menu.shadow} z=${menu.zIndex} lebar=${menu.lebar}px maxH=${menu.maxHeight}`,
  );
}

/* ---- G7-5: baris "Tasks" kembar sudah tidak ada ---- */

const kembar = await cdp.json(`return JSON.stringify((() => {
  const area = document.querySelector('.w4-status-area, .ai-status-area');
  const semuaH4 = [...document.querySelectorAll('.w4-status-section h4')].map((h) => h.textContent);
  const taskList = !!document.querySelector('.todo-dock .todo-judul');
  return { adaArea: !!area, bagian: semuaH4, adaKartuTugas: taskList };
})())`);

const adaTasks = kembar.bagian.some((h) => /task/i.test(h || ''));
r.check(
  'G7-5',
  !adaTasks,
  `baris "Tasks" kembar sudah dibuang. Bagian tersisa: ${JSON.stringify(kembar.bagian)} (kartu tugas: ${kembar.adaKartuTugas})`,
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
