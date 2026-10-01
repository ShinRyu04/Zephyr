// cek-v3-09.mjs — kenapa V3 tidak sampai ke mock?
//
// Menirukan urutan V3 persis (setKey gemini -> loadKeys -> setModel -> kirim)
// lalu melaporkan provider yang benar-benar dipakai saat request dikirim,
// isi jejak streaming, dan entri log mock.

import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';
const MOCK = 8098;

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  const r = await cdp.runAsync(`
    // ── Tiru V1: pasang key gemini, buka menu, pilih provider + model.
    await SET.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
    await X.store.getState().loadKeys();
    await wait(250);
    const st = S.getState();
    st.setSettingsOpen(false);
    st.setActivity('ai');
    if (!S.getState().sidebarVisible) st.toggleSidebar();
    T.getState().setVisible(true);
    window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
    await wait(400);
    if (!q('[data-testid="ai-model-menu"]')) {
      q('[data-testid="ai-model-btn"]')?.click();
      await wait(400);
    }
    const rows = qa('[data-provider-item]').map((el) => el.dataset.provider);
    const pilih = rows.includes('gemini') ? 'gemini' : rows[0];
    q('[data-provider-item="' + pilih + '"]')?.click();
    await wait(300);
    const item0 = qa('[data-model-item]')[0]?.dataset.modelItem;
    if (item0) { q('[data-model-item="' + item0 + '"]')?.click(); await wait(500); }
    const setelahV1 = {
      provider: X.store.getState().provider,
      model: X.store.getState().model,
      menuTerbuka: !!q('[data-testid="ai-model-menu"]'),
    };

    // ── Tiru V2: kosongkan provider aktif.
    await SET.setKey('gemini', '');
    await SET.setKey('anthropic', '');
    await X.store.getState().loadKeys();
    await wait(250);
    const tanpaKey = X.store.getState().keys.find((k) => !k.hasKey)?.provider ?? 'gemini';
    X.store.setState({ provider: tanpaKey, model: '' });
    await wait(250);
    const setelahV2 = { provider: X.store.getState().provider, model: X.store.getState().model };

    // Tiru V3.
    await SET.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
    await X.store.getState().loadKeys();
    await wait(250);
    const keysSetelah = X.store.getState().keys.map((k) => k.provider + (k.hasKey ? '+key' : ''));
    await X.store.getState().setModel('gemini-3.8-flash');
    await wait(450);
    const setelahSetModel = {
      provider: X.store.getState().provider,
      model: X.store.getState().model,
      tombol: q('[data-testid="ai-model-btn"]')?.dataset.provider,
    };

    // Kirim dan pantau.
    X.store.getState().newChat();
    await wait(350);
    const input = q('[data-testid="ai-input"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, 'sapa saya SLOW');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(150);
    q('[data-testid="ai-send"]').click();

    const jejak = [];
    for (let i = 0; i < 10; i++) {
      await wait(300);
      const m = X.store.getState().activeSession()?.messages?.find((x) => x.role === 'assistant');
      jejak.push({ n: (m?.content ?? '').length, err: m?.error ?? null });
    }
    await wait(1500);
    const akhir = X.store.getState().activeSession()?.messages?.slice(-1)[0];

    return JSON.stringify({
      setelahV1, setelahV2, keysSetelah, setelahSetModel, jejak,
      akhir: { role: akhir?.role, isi: (akhir?.content ?? '').slice(0, 80), err: akhir?.error ?? null },
    });
  `, 90000);

  const d = JSON.parse(r);
  console.log('setelah V1     :', JSON.stringify(d.setelahV1));
  console.log('setelah V2     :', JSON.stringify(d.setelahV2));
  console.log('keys           :', d.keysSetelah.join(', '));
  console.log('setelah setModel:', JSON.stringify(d.setelahSetModel));
  console.log('');
  console.log('jejak streaming:', d.jejak.map((x) => x.n).join('→'));
  console.log('  error        :', d.jejak.map((x) => x.err).filter(Boolean)[0] ?? '(tidak ada)');
  console.log('');
  console.log('jawaban akhir  :', JSON.stringify(d.akhir));
  console.log('mock dipanggil :', d.mockTotal, 'x ->', d.mockKinds.join(', ') || '(tidak ada)');
  cdp.close();
};

main().catch((e) => {
  console.error('cek-v3-09 error:', e.message ?? e);
  process.exitCode = 2;
});
