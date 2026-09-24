// cek-provider09.mjs — probe the AI provider switch, step by step.
//
// verify09 V2 and V3 both depend on the active provider actually being the
// one the test picked. This prints the store's provider/model, the badge,
// and what the dropdown really contains after each step, so a failing run
// shows which step drifted instead of just the final boolean.

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
      const langkah = [];

      const baca = (nama) => langkah.push({
        nama,
        provider: X.store.getState().provider,
        model: X.store.getState().model,
        badge: q('[data-testid="ai-keystate"]')?.dataset.haskey ?? null,
        badgeKelas: q('[data-testid="ai-keystate"]')?.className ?? null,
        btnProvider: q('[data-testid="ai-model-btn"]')?.dataset.provider ?? null,
        btnModel: q('[data-testid="ai-model-btn"]')?.dataset.model ?? null,
      });

      // ── keadaan awal
      baca('awal');

      // ── seperti setup verify09: kosongkan gemini+anthropic
      await SET.setKey('gemini', '');
      await SET.setKey('anthropic', '');
      await X.store.getState().loadKeys();
      await wait(250);
      baca('setelah kosongkan gemini+anthropic');

      const tanpaKey = X.store.getState().keys.find((k) => !k.hasKey)?.provider ?? 'gemini';
      const daftarKey = X.store.getState().keys.map((k) => k.provider + (k.hasKey ? '+key' : ''));

      X.store.setState({ provider: tanpaKey, model: '' });
      await wait(250);
      await X.store.getState().loadKeys();
      await wait(200);
      baca('setelah setState provider=' + tanpaKey + ' model=""');

      // ── buka menu: provider apa saja yang tampil
      const btn = q('[data-testid="ai-model-btn"]');
      if (btn) { btn.click(); await wait(350); }
      const barisProvider = qa('[data-provider-item]').map((el) => el.dataset.provider);

      // ── pasang key gemini lalu lihat menu lagi
      await SET.setKey('gemini', 'MOCK-KEY-GEMINI-1234');
      await X.store.getState().loadKeys();
      await wait(250);
      if (q('[data-testid="ai-model-menu"]')) { q('[data-testid="ai-model-btn"]').click(); await wait(250); }
      q('[data-testid="ai-model-btn"]').click();
      await wait(350);
      const barisProvider2 = qa('[data-provider-item]').map((el) => el.dataset.provider);

      // ── klik gemini
      const rowGemini = qa('[data-provider-item]').find((el) => el.dataset.provider === 'gemini');
      if (rowGemini) { rowGemini.click(); await wait(350); }
      const modelItems = qa('[data-model-item]').map((el) => ({
        id: el.dataset.modelItem, provider: el.dataset.provider,
      })).slice(0, 3);

      // ── klik model pertama
      const pertama = qa('[data-model-item]')[0];
      let klikId = null;
      if (pertama) { klikId = pertama.dataset.modelItem; pertama.click(); await wait(500); }
      baca('setelah klik gemini + model pertama');

      return JSON.stringify({
        langkah, daftarKey, tanpaKey,
        barisProvider, barisProvider2, modelItems, klikId,
        providerAkhir: X.store.getState().provider, modelAkhir: X.store.getState().model,
      });
    `),
  );

  console.log('daftar key :', out.daftarKey.join(', '));
  console.log('tanpaKey   :', out.tanpaKey);
  console.log('');
  for (const l of out.langkah) {
    console.log(`  [${l.nama}]`);
    console.log(`     store: provider=${l.provider} model=${l.model}`);
    console.log(`     badge: haskey=${l.badge} kelas=${(l.badgeKelas ?? '').trim()}`);
    console.log(`     tombol: provider=${l.btnProvider} model=${l.btnModel}`);
  }
  console.log('');
  console.log('baris provider (sebelum key gemini):', out.barisProvider.join(', ') || '(kosong)');
  console.log('baris provider (sesudah key gemini):', out.barisProvider2.join(', ') || '(kosong)');
  console.log('model items setelah klik gemini   :', JSON.stringify(out.modelItems));
  console.log('diklik                            :', out.klikId);
  console.log('AKHIR                             : provider=' + out.providerAkhir + ' model=' + out.modelAkhir);
  cdp.close();
};

main().catch((e) => {
  console.error('cek-provider09 error:', e.message ?? e);
  process.exitCode = 2;
});
