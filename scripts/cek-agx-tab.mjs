import { Cdp, sleep } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * Cek cepat panel kanan jendela Agents (dipakai sambil kerja, bukan harness
 * rilis). Mengukur:
 *   - lebar panel kanan (%) saat baru dibuka (acuan ~56%)
 *   - tab File: pilih file di pohon -> label tab jadi nama file + ikon file
 *   - posisi `+` harus tetap di kiri deretan tab saat tab bertambah
 *   - pohon File menempel ke ujung kanan panel
 */
const { cdp } = await Cdp.attach('9223', ['Zephyr Agents', 'Zephyr']);

const eval_ = (expr) => cdp.eval(expr);

const klik = (sel) =>
  eval_(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return 'tidak ada: ' + ${JSON.stringify(sel)};
    el.click();
    return 'ok';
  })()`);

function ukurDiPage() {
  const body = document.querySelector('.agx-body')?.getBoundingClientRect();
  const sidebar = document.querySelector('.agx-sidebar')?.getBoundingClientRect();
  const kanan = document.querySelector('.agx-kanan')?.getBoundingClientRect();
  const plus = document.querySelector('[data-testid="agx-view-dropdown"]')?.getBoundingClientRect();
  const tabs = document.querySelector('.agx-tabs')?.getBoundingClientRect();
  const pohon = document.querySelector('[data-testid="agx-file-pohon"]')?.getBoundingClientRect();
  const tabFile = document.querySelector('[role="tab"][data-testid="agx-tab-file"]');
  const sisaSidebar = body && sidebar ? body.width - sidebar.width : null;
  return JSON.stringify({
    bodyPx: body ? Math.round(body.width) : null,
    sidebarPx: sidebar ? Math.round(sidebar.width) : null,
    kananPx: kanan ? Math.round(kanan.width) : null,
    persenDariBody: body && kanan ? Math.round((kanan.width / body.width) * 100) : null,
    persenDariSisa: sisaSidebar && kanan ? Math.round((kanan.width / sisaSidebar) * 100) : null,
    lebarStyle: document.querySelector('.agx-kanan')?.style.flex ?? null,
    plusKiriTabs: plus && tabs ? plus.left <= tabs.left + 1 : null,
    pohonKeKanan: pohon && kanan ? Math.round(kanan.right - pohon.right) : null,
    judulTabFile: tabFile ? tabFile.querySelector('.agx-tab-nama')?.textContent : null,
    tabs: [...document.querySelectorAll('[role="tab"]')].map((e) => e.getAttribute('data-testid')),
  });
}

const ukur = async () => JSON.parse(await eval_(`(${ukurDiPage.toString()})()`));

try {
  if (process.argv.includes('--reload')) {
    await eval_('location.reload()');
    await sleep(2500);
  }
  const adaBar = await eval_(`!!document.querySelector('[data-testid="agx-kanan-bar"]')`);
  if (!adaBar) {
    await eval_(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /panel kanan|right panel/i.test(x.getAttribute('title') || ''));
      if (b) b.click();
    })()`);
    await sleep(600);
  }
  console.log('awal        :', await ukur());

  console.log('klik File   :', await klik('[data-testid="agx-start-file"]'));
  await sleep(800);
  console.log('setelah File:', await ukur());

  const itemPohon = await eval_(`(() => {
    const b = document.querySelector('[data-testid="agx-file-item"]');
    if (!b) return 'tidak ada item';
    b.click();
    return 'ok';
  })()`);
  console.log('pilih file  :', itemPohon);
  await sleep(900);
  console.log('setelah pilih:', await ukur());

  writeFileSync('D:/Zephyr/scripts/_agx.png', Buffer.from(await cdp.screenshot(), 'base64'));
  console.log('screenshot: scripts/_agx.png');
} finally {
  await cdp.close();
}
