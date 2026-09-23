// uji-t4-12.mjs — posisi panel AI + Enter di subagent.
//
// PERMINTAAN USER (verbatim):
//   "gimna caranya biar chat AI ke samping kanan gtu ? ada settingannya ?"
//   "di subagents jga tolong saat enter bener" terkirim ,bkn teks kebawah gtu ,
//    tpi saat di bawah itu shift enter"
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (nama, ok, info = '') => {
  if (ok) lulus++;
  else gagal++;
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}${info ? '  ' + info : ''}`);
};

// ── 1. Posisi panel AI bisa diubah dari Customize Layout ─────────────────
const r1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(false);
  const L = window.__ZEPHYR_LAYOUT__;
  L.store.getState().setMenuBuka(true);
  await new Promise((r) => setTimeout(r, 900));
  const bawah = document.querySelector('[data-testid="lm-ai-bottom"]');
  const kanan = document.querySelector('[data-testid="lm-ai-right"]');
  return {
    adaBawah: !!bawah,
    adaKanan: !!kanan,
    teksBawah: bawah?.textContent?.trim() ?? '',
    teksKanan: kanan?.textContent?.trim() ?? '',
    aktif: document.querySelector('[data-testid="lm-ai-bottom"].is-aktif') ? 'bottom' : 'right',
  };
})())`,
  90000,
);
cek('pilihan "Bawah" ada di Customize Layout', r1.adaBawah, r1.teksBawah);
cek('pilihan "Kanan" ada di Customize Layout', r1.adaKanan, r1.teksKanan);
cek('posisi sekarang = Bawah', r1.aktif === 'bottom', r1.aktif);

// ── 2. Klik "Kanan" -> chat pindah ke kolom kanan ────────────────────────
const r2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
  await new Promise((r) => setTimeout(r, 900));
  document.querySelector('[data-testid="lm-ai-right"]')?.click();
  await new Promise((r) => setTimeout(r, 1300));
  const kolom = document.querySelector('[data-testid="ai-side-col"]');
  const panel = document.querySelector('[data-testid="ai-panel"]');
  const rc = kolom?.getBoundingClientRect();
  return {
    aiPanel: S.getState().settings.general.aiPanel,
    adaKolom: !!kolom,
    x: rc ? Math.round(rc.left) : null,
    lebar: rc ? Math.round(rc.width) : null,
    posAttr: panel?.dataset.pos ?? null,
    adaTabMoved: !!document.querySelector('[data-testid="ai-tab-moved"]'),
    jumlahPanel: document.querySelectorAll('[data-testid="ai-panel"]').length,
  };
})())`,
  90000,
);
cek('setelan tersimpan sebagai "right"', r2.aiPanel === 'right', r2.aiPanel);
cek('kolom kanan muncul', r2.adaKolom, `x=${r2.x} lebar=${r2.lebar}px`);
cek('panel ditandai posisi kanan', r2.posAttr === 'kanan', r2.posAttr || '');
cek('hanya SATU AiPanel ter-mount', r2.jumlahPanel === 1, `${r2.jumlahPanel} panel`);
cek('tab AI di panel bawah beri keterangan', r2.adaTabMoved);

// ── 3. Kelas khusus kolom kanan benar-benar dipasang ─────────────────────
const r3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const panel = document.querySelector('[data-testid="ai-panel"]');
  const head = panel?.querySelector('.ai-head');
  const cs = head ? getComputedStyle(head) : null;
  const namaBtn = panel?.querySelector('.ai-model-name');
  return {
    adaKelasKanan: panel?.classList.contains('is-kanan') ?? false,
    headWrap: cs?.flexWrap ?? '',
    // Nama sesi disembunyikan di kolom kanan (informasi sekunder).
    chatnameTersembunyi: getComputedStyle(panel?.querySelector('.ai-chatname') ?? document.body).display === 'none',
    namaModelTampil: (namaBtn?.textContent ?? '').length > 0,
  };
})())`,
  60000,
);
cek('kelas is-kanan terpasang', r3.adaKelasKanan);
cek('kepala panel jadi dua baris (wrap)', r3.headWrap === 'wrap', r3.headWrap || '');
cek('nama sesi disembunyikan di kolom kanan', r3.chatnameTersembunyi);
cek('nama model tetap tampil', r3.namaModelTampil);

// ── 4. Setelan yang sama juga ada di Settings → Umum ─────────────────────
const r4 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setActivity('settings');
  S.getState().setSettingsOpen(true);
  if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
  await new Promise((r) => setTimeout(r, 800));
  window.__ZEPHYR_SETUI__.store.getState().setSection('general');
  await new Promise((r) => setTimeout(r, 900));
  const sel = document.querySelector('[data-testid="general-ai-panel"]');
  return { ada: !!sel, nilai: sel?.value ?? null };
})())`,
  90000,
);
cek('setelan juga ada di Settings → Umum', r4.ada, `nilai=${r4.nilai}`);
cek('nilainya sinkron dengan pilihan', r4.nilai === 'right', r4.nilai || '');

// ── 5. Subagent: Enter mengirim, Shift+Enter baris baru ──────────────────
const r5 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(false);
  await S.getState().applySettings({ general: { aiPanel: 'bottom' } });
  const T = window.__ZEPHYR_TERM__;
  T.getState().setVisible(true);
  window.__ZEPHYR_PANEL__.store.getState().focusTab('subagents');
  await new Promise((r) => setTimeout(r, 1200));
  window.__ZEPHYR_SUB__.bersihkan();
  await new Promise((r) => setTimeout(r, 500));

  const ta = document.querySelector('[data-testid="sub-input"]');
  if (!ta) return { err: 'textarea sub-input tidak ada' };
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  const ketik = (v) => { setter.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true })); };
  const key = (k, shift) => ta.dispatchEvent(new KeyboardEvent('keydown', {
    key: k, shiftKey: !!shift, bubbles: true, cancelable: true,
  }));

  // A. Shift+Enter -> TIDAK mengirim (teks tetap, boleh jadi baris baru).
  ketik('Balas satu kata: SATU');
  await new Promise((r) => setTimeout(r, 250));
  key('Enter', true);
  await new Promise((r) => setTimeout(r, 700));
  const setelahShift = window.__ZEPHYR_SUB__.store.getState().agents.length;

  // B. Enter -> mengirim.
  key('Enter', false);
  await new Promise((r) => setTimeout(r, 1600));
  const setelahEnter = window.__ZEPHYR_SUB__.store.getState().agents.length;

  return {
    setelahShift, setelahEnter,
    teksMasih: ta.value.length,
    sibuk: window.__ZEPHYR_SUB__.store.getState().sibuk,
  };
})())`,
  150000,
);
cek('Shift+Enter TIDAK mengirim', r5.setelahShift === 0, `${r5.setelahShift} subagent`);
cek('Enter MENGIRIM', r5.setelahEnter >= 1, `${r5.setelahEnter} subagent`);

// ── 6. Hint tombol menyebut Enter & Shift+Enter ──────────────────────────
const r6 = await cdp.json(
  `return JSON.stringify(await (async () => {
  await new Promise((r) => setTimeout(r, 2500));
  const ta = document.querySelector('[data-testid="sub-input"]');
  const btn = document.querySelector('[data-testid="sub-run"]');
  return { titleInput: ta?.getAttribute('title') ?? '', titleBtn: btn?.getAttribute('title') ?? '' };
})())`,
  90000,
);
cek('petunjuk di input menyebut Enter/Shift+Enter', r6.titleInput.includes('Enter') && r6.titleInput.includes('Shift'), r6.titleInput);

// Bersihkan.
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR_SUB__.bersihkan();
  window.__ZEPHYR_PANEL__.store.getState().focusTab('terminal');
  await new Promise((r) => setTimeout(r, 700));
  return 1;
})())`,
  90000,
);
await cdp.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal > 0 ? 1 : 0);
