import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * Bandingkan panel AI di dua posisi: kolom kanan (sempit) dan dock bawah
 * (lebar). Yang diukur: tinggi header, jumlah baris kontrol, dan apakah
 * elemen berdesakan atau melar.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const ukur = async (pos) => {
  await cdp.runAsync(`
    // aiMax harus dimatikan: kalau nyala, panel mengambil lebar penuh dan
    // pengukuran kolom kanan jadi tidak bermakna.
    S.getState().setAiMax(false);
    await S.getState().applySettings({ general: { aiPanel: '${pos}' } });
    await wait(1600);
    return 'ok';
  `, 20000);

  const r = await cdp.runAsync(`
    const zzPanel = q('[data-testid="ai-panel"]');
    const zzHead = q('.ai-head');
    const zzAnak = zzHead ? [...zzHead.children] : [];
    const zzBaris = new Set(zzAnak.map((e) => Math.round(e.getBoundingClientRect().top)));
    const zzSide = q('.ai-input-side');
    const zzBtns = zzSide ? [...zzSide.querySelectorAll('button')] : [];
    const zzTops = new Set(zzBtns.map((b) => Math.round(b.getBoundingClientRect().top)));

    return {
      pos: zzPanel?.getAttribute('data-pos'),
      panelW: zzPanel?.offsetWidth ?? -1,
      headH: zzHead?.offsetHeight ?? -1,
      headBaris: zzBaris.size,
      modelW: q('.ai-model-wrap')?.offsetWidth ?? -1,
      inputSideFlex: zzSide ? getComputedStyle(zzSide).flexDirection : '-',
      inputSideW: zzSide?.offsetWidth ?? -1,
      barisTombol: zzTops.size,
      inputH: q('[data-testid="ai-input"]')?.offsetHeight ?? -1,
      saranKartu: qa('[data-testid^="ai-saran-"]').length,
    };
  `, 30000);

  return r;
};

const kanan = await ukur('right');
console.log('  KANAN :', JSON.stringify(kanan));
const sh1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh1?.result?.data) {
  writeFileSync('D:/Zephyr/shot-ai-kanan.png', Buffer.from(sh1.result.data, 'base64'));
  console.log('  shot-ai-kanan.png');
}

const bawah = await ukur('bottom');
console.log('  BAWAH :', JSON.stringify(bawah));
const sh2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh2?.result?.data) {
  writeFileSync('D:/Zephyr/shot-ai-bawah.png', Buffer.from(sh2.result.data, 'base64'));
  console.log('  shot-ai-bawah.png');
}

cdp.close();
