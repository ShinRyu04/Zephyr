import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * Verifikasi batch UI composer: menu "+", tombol Send ikon, antrian, dan
 * picker model flat.
 *
 * Semua diperiksa dari DOM hidup, bukan dari CSS yang ditulis.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(
  `
  const zzOut = {};
  const zzS = q('.ai-input-side');
  if (!zzS) return { ada: false, kenapa: 'composer tidak ketemu' };

  // ── 1. Tombol "+" ada dan di paling kiri ──
  const zzPlus = q('[data-testid="ai-plus"]');
  zzOut.plusAda = !!zzPlus;
  if (zzPlus) {
    const pr = zzPlus.getBoundingClientRect();
    const sr = zzS.getBoundingClientRect();
    zzOut.plusPalingKiri = Math.round(pr.left - sr.left) < 6;
    zzOut.plusX = Math.round(pr.left);
  }

  // ── 2. Tombol Send = ikon bulat, bukan teks ──
  const zzSend = q('[data-testid="ai-send"]');
  zzOut.sendAda = !!zzSend;
  if (zzSend) {
    const sc = getComputedStyle(zzSend);
    zzOut.sendTeks = (zzSend.textContent || '').trim();
    zzOut.sendRadius = sc.borderRadius;
    zzOut.sendLebar = Math.round(zzSend.getBoundingClientRect().width);
    zzOut.sendAdaSvg = !!zzSend.querySelector('svg');
    zzOut.sendBulat = sc.borderRadius === '50%';
  }

  // ── 3. Menu "+" berisi 6 item + tip ──
  if (zzPlus) {
    zzPlus.click();
    await wait(600);
    const zzMenu = q('[data-testid="ai-plus-menu"]');
    zzOut.plusMenuBuka = !!zzMenu;
    if (zzMenu) {
      const mr = zzMenu.getBoundingClientRect();
      const pr2 = zzPlus.getBoundingClientRect();
      zzOut.plusBukaKeAtas = mr.bottom <= pr2.top + 4;
      const item = [...zzMenu.querySelectorAll('[role="menuitem"]')].map((b) =>
        (b.textContent || '').trim().slice(0, 22)
      );
      zzOut.plusItems = item;
      zzOut.plusJumlah = item.length;
      zzOut.plusAdaTip = /@/.test(zzMenu.textContent || '');
      // Ikon per item
      zzOut.plusIkon = [...zzMenu.querySelectorAll('[role="menuitem"]')].filter(
        (b) => b.querySelector('svg')
      ).length;
    }
    // tutup
    zzPlus.click();
    await wait(300);
  }

  // ── 4. Antrian: dorong 2 pesan saat sibuk ──
  const zzAI = X.store;
  zzAI.setState({ antrian: [], pending: 'uji-bukti', draft: '' });
  await wait(400);
  zzAI.getState().send('pesan antrian satu');
  await wait(300);
  zzAI.getState().send('pesan antrian dua');
  await wait(700);
  const zzA = q('[data-testid="ai-antrian"]');
  zzOut.antrianMuncul = !!zzA;
  if (zzA) {
    zzOut.antrianJumlah = zzA.querySelectorAll('.ai-antrian-item').length;
    zzOut.antrianTeks = [...zzA.querySelectorAll('.ai-antrian-teks')].map((e) =>
      (e.textContent || '').trim()
    );
    zzOut.antrianAdaHapus = !!q('[data-testid="ai-antrian-hapus-0"]');
    // Satu baris per pesan
    const satu = q('.ai-antrian-teks');
    zzOut.antrianSatuBaris = satu ? getComputedStyle(satu).whiteSpace === 'nowrap' : false;
  }
  zzAI.setState({ antrian: [], pending: null });
  await wait(300);

  // ── 5. Picker model: flat list + ikon per model ──
  const zzMB = q('[data-testid="ai-model-btn"]');
  zzOut.modelBtnAda = !!zzMB;
  if (zzMB) {
    zzMB.click();
    await wait(700);
    const zzMM = q('[data-testid="ai-model-menu"]');
    zzOut.modelMenuBuka = !!zzMM;
    if (zzMM) {
      const mr2 = zzMM.getBoundingClientRect();
      const wb = q('.ai-model-wrap').getBoundingClientRect();
      const panel = q('.ai-panel')?.getBoundingClientRect();
      zzOut.modelTahap = zzMM.getAttribute('data-tahap');
      zzOut.modelGrup = [...zzMM.querySelectorAll('.ai-model-group')].map((g) =>
        (g.textContent || '').trim()
      );
      zzOut.modelJumlahItem = zzMM.querySelectorAll('.ai-model-item').length;
      // Ikon per model: setiap item harus punya svg
      const items = [...zzMM.querySelectorAll('.ai-model-item')];
      zzOut.modelItemBerikon = items.filter((b) => b.querySelector('svg')).length;
      // Keluarga ikon: cek beberapa label
      zzOut.modelIkonKeluarga = items.slice(0, 6).map((b) => {
        const svg = b.querySelector('svg');
        return (b.querySelector('.ai-mi-name')?.textContent || '').slice(0, 18) + '=' + (svg?.getAttribute('aria-label') || '-');
      });
      // Tidak keluar panel (clipping)
      if (panel) {
        zzOut.modelDalamPanelKanan = mr2.right <= panel.right + 1;
        zzOut.modelDalamPanelKiri = mr2.left >= panel.left - 1;
      }
      // Footer 2 aksi
      zzOut.modelAdaRefresh = !!q('[data-testid="ai-model-refresh"]');
      zzOut.modelAdaEdit = !!q('[data-testid="ai-model-edit"]');
      zzOut.modelAdaCari = !!q('[data-testid="ai-model-cari"]');
      zzMB.click();
      await wait(250);
    }
  }

  return zzOut;
`,
  60000
);

console.log(JSON.stringify(r, null, 1));

const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh?.result?.data) {
  writeFileSync('D:/Zephyr/shot-composer-baru.png', Buffer.from(sh.result.data, 'base64'));
  console.log('  shot-composer-baru.png');
}

cdp.close();
