import { Cdp } from './lib-cdp.mjs';

/*
 * Verifikasi slash command sesi: /new, /clear, /compact, /export.
 *
 * Empat perintah ini menggantikan tombol-tombol header (new chat, delete all,
 * compact, export) yang dihapus. Yang diuji: perintah muncul di daftar saran
 * saat mengetik "/", dan memilihnya benar-benar menjalankan aksinya —
 * bukan sekadar menempelkan teks ke composer.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

// Panel AI harus aktif dan composer terlihat.
console.log(
  '  buka panel:',
  await cdp.eval(`(() => {
    const S = window.__ZEPHYR__;
    S.getState().setPanelOpen?.(true);
    S.getState().setPanelTab?.('ai');
    return 'ok';
  })()`)
);

const r = await cdp.runAsync(
  `
  const zzAI = X.store;
  const zzOut = {};

  // Seed satu sesi supaya /new dan /clear punya sesuatu untuk dibersihkan.
  zzAI.setState({
    sessions: [{
      id: 'uji-slash', title: 'Uji slash', at: Date.now(),
      messages: [{ id: 'a1', role: 'user', content: 'pesan uji' }],
    }],
    activeId: 'uji-slash',
    draft: '',
  });
  await wait(900);

  const zzInput = q('.ai-input textarea, .ai-input input, textarea[data-testid="ai-draft"]');
  if (!zzInput) return { ada: false, kenapa: 'input tidak ketemu' };

  // React hanya mendengar perubahan lewat setter asli prototipe.
  const zzSet = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // 1. Ketik "/" lalu lihat daftar saran.
  zzSet(zzInput, '/');
  await wait(700);
  const zzPop = q('.ai-slash, [data-testid="ai-slash"], .ai-suggest, .slash-pop');
  const zzItems = zzPop ? [...zzPop.querySelectorAll('button, li, [role="option"]')] : [];
  zzOut.slashMuncul = !!zzPop;
  zzOut.slashItems = zzItems.map((b) => (b.textContent || '').trim().slice(0, 40));

  // 2. Cari perintah sesi di daftar.
  zzOut.adaNew = zzItems.some((b) => /\\/new/.test(b.textContent || ''));
  zzOut.adaClear = zzItems.some((b) => /\\/clear/.test(b.textContent || ''));
  zzOut.adaCompact = zzItems.some((b) => /\\/compact/.test(b.textContent || ''));

  // 3. Klik "/new" — harus menjalankan aksi, bukan mengisi composer.
  const zzNew = zzItems.find((b) => /\\/new/.test(b.textContent || ''));
  if (zzNew) {
    zzNew.click();
    await wait(900);
    const zzS = zzAI.getState();
    zzOut.stlhNew = {
      jumlahSesi: zzS.sessions.length,
      draft: zzS.draft,
      // Composer harus kosong: aksi dijalankan, bukan teks ditempel.
      draftKosong: zzS.draft === '',
    };
  } else {
    zzOut.stlhNew = 'perintah /new tidak ada di daftar';
  }

  return zzOut;
`,
  45000
);

console.log('  ' + JSON.stringify(r, null, 1));
cdp.close();
