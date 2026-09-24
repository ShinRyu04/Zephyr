// cek-v2-09.mjs — why is ai-goto-settings missing during V2?
//
// V2 checks for the "Isi API key" button, which lives in AiSidebar and only
// renders while the active provider has no key. This reproduces V2's state
// exactly and reports which selector finds what.

import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ?? '9223';

const main = async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.title.includes('Zephyr'));
  if (!page) throw new Error('target Zephyr tidak ditemukan');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  console.log(`# target: ${page.title}\n`);

  const out = JSON.parse(
    await cdp.runAsync(`
      const st = S.getState();
      st.setSettingsOpen(false);
      st.setActivity('ai');
      if (!S.getState().sidebarVisible) st.toggleSidebar();
      T.getState().setVisible(true);
      T.getState().setVisible(true); window.__ZEPHYR_PANEL__.store.getState().focusTab('ai');
      await wait(400);

      await SET.setKey('gemini', '');
      await SET.setKey('anthropic', '');
      await X.store.getState().loadKeys();
      await wait(200);
      const tanpaKey = X.store.getState().keys.find((k) => !k.hasKey)?.provider ?? 'gemini';
      X.store.setState({ provider: tanpaKey, model: '' });
      await wait(300);
      await X.store.getState().loadKeys();
      await wait(250);

      const badge = q('[data-testid="ai-keystate"]');
      const tombol = q('[data-testid="ai-goto-settings"]');
      const sidebar = q('[data-testid="ai-side-key"]');

      // ── tiru V2: kirim lalu periksa lagi
      const sebelumKirim = {
        tombol: !!q('[data-testid="ai-goto-settings"]'),
        haskey: badge.dataset.haskey,
        provider: X.store.getState().provider,
      };
      const input = q('[data-testid="ai-input"]');
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, 'halo tanpa key');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      q('[data-testid="ai-send"]').click();
      await wait(900);
      const sesudahKirim = {
        tombol: !!q('[data-testid="ai-goto-settings"]'),
        haskey: q('[data-testid="ai-keystate"]')?.dataset.haskey ?? null,
        provider: X.store.getState().provider,
        model: X.store.getState().model,
        toast: q('[data-testid="ai-toast"]')?.textContent ?? '',
        pesan: X.store.getState().activeSession()?.messages.length ?? -1,
        pending: X.store.getState().pending,
      };

      // Apa saja testid yang ada di DOM sekarang (untuk melihat yang mirip)
      const semuaTestid = qa('[data-testid]').map((el) => el.dataset.testid)
        .filter((t) => t && (t.startsWith('ai-'))).sort();

      return JSON.stringify({
        provider: X.store.getState().provider,
        model: X.store.getState().model,
        haskey: badge ? badge.dataset.haskey : null,
        kelas: badge ? badge.className : null,
        adaTombolSettings: !!tombol,
        teksTombol: tombol ? tombol.textContent : null,
        adaSideKey: !!sidebar,
        teksSideKey: sidebar ? sidebar.textContent : null,
        sidebarVisible: S.getState().sidebarVisible,
        activity: S.getState().activity,
        semuaTestid,
        sebelumKirim, sesudahKirim,
      });
    `),
  );

  console.log('provider        :', out.provider, '/ model:', out.model);
  console.log('badge haskey    :', out.haskey, '| kelas:', (out.kelas ?? '').trim());
  console.log('tombol settings :', out.adaTombolSettings, out.teksTombol ? `("${out.teksTombol}")` : '');
  console.log('ai-side-key     :', out.adaSideKey, out.teksSideKey ? `("${out.teksSideKey}")` : '');
  console.log('sidebarVisible  :', out.sidebarVisible, '| activity:', out.activity);
  console.log('');
  console.log('');
  console.log('SEBELUM kirim :', JSON.stringify(out.sebelumKirim));
  console.log('SESUDAH kirim :', JSON.stringify(out.sesudahKirim));
  console.log('');
  console.log('testid ai-* di DOM:');
  console.log('  ' + out.semuaTestid.join(', '));
  cdp.close();
};

main().catch((e) => {
  console.error('cek-v2-09 error:', e.message ?? e);
  process.exitCode = 2;
});
