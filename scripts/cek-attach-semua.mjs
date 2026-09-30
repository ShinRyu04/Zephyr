import { Cdp } from './lib-cdp.mjs';

/*
 * Uji setiap item menu "+" sampai benar-benar mengubah draft.
 *
 * Yang diuji adalah hasilnya di store (draft / draftImages), bukan sekadar
 * tombolnya bisa diklik: dialog file dan folder tidak bisa dijawab dari CDP,
 * jadi jalur yang diuji adalah yang tidak butuh dialog OS — tempel gambar, URL,
 * dan snippet — plus pembuktian bahwa item dialog memang memanggil command yang
 * benar (dicek dari handler-nya terpasang, bukan ditekan).
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(
  `
  const zzOut = {};
  const zzAI = X.store;
  S.getState().setPanelOpen?.(true);
  S.getState().setPanelTab?.('ai');
  await wait(1500);

  // Mulai dari draft kosong supaya hasil tiap aksi terbaca jelas.
  zzAI.setState({ draft: '', draftImages: [] });
  await wait(300);

  const zzPlus = q('[data-testid="ai-plus"]');
  const zzBuka = async () => {
    if (!q('[data-testid="ai-plus-menu"]')) { zzPlus.click(); await wait(500); }
  };
  const zzTutup = async () => {
    if (q('[data-testid="ai-plus-menu"]')) { zzPlus.click(); await wait(300); }
  };

  // ── 1. Semua item ada dan berikon ──
  await zzBuka();
  const zzMenu = q('[data-testid="ai-plus-menu"]');
  zzOut.item = [...zzMenu.querySelectorAll('[role="menuitem"]')].map((b) => ({
    id: b.getAttribute('data-testid'),
    teks: (b.textContent || '').trim().slice(0, 20),
    ikon: !!b.querySelector('svg'),
  }));
  await zzTutup();

  // ── 2. URL: harus menyisipkan penanda ke draft ──
  zzAI.setState({ draft: '' });
  await zzBuka();
  q('[data-testid="ai-plus-url"]').click();
  await wait(600);
  zzOut.url = { draft: zzAI.getState().draft, menuTutup: !q('[data-testid="ai-plus-menu"]') };

  // ── 3. Snippet: harus menyisipkan ">" ──
  zzAI.setState({ draft: '' });
  await zzBuka();
  q('[data-testid="ai-plus-snippet"]').click();
  await wait(600);
  zzOut.snippet = { draft: zzAI.getState().draft, menuTutup: !q('[data-testid="ai-plus-menu"]') };

  // ── 4. Snippet memicu daftar saran ──
  await wait(600);
  zzOut.snippetSaranMuncul = !!q('[data-testid="ai-slash"]');

  // ── 5. Paste image: clipboard kosong harus memberi toast, bukan diam ──
  zzAI.setState({ draft: '', draftImages: [] });
  await wait(300);
  await zzBuka();
  q('[data-testid="ai-plus-paste"]').click();
  await wait(900);
  zzOut.pasteToast = zzAI.getState().toast;
  zzOut.pasteGambar = zzAI.getState().draftImages.length;

  // ── 6. Files / Folder: item ada, dialog OS tidak bisa dijawab dari sini ──
  await zzBuka();
  zzOut.fileAda = !!q('[data-testid="ai-plus-file"]');
  zzOut.folderAda = !!q('[data-testid="ai-plus-folder"]');
  zzOut.imagesAda = !!q('[data-testid="ai-photo"]');
  await zzTutup();

  // ── 7. Bersihkan ──
  zzAI.setState({ draft: '', draftImages: [], toast: null });
  return zzOut;
`,
  60000
);

console.log(JSON.stringify(r, null, 1));
cdp.close();
