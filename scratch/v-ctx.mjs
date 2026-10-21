/*
 * Verify the fact-context work (ctx1..ctx8) against the LIVE main window.
 *
 *   node scratch/v-ctx.mjs
 *
 * Proves, from the running app rather than from the source:
 *   V1  the core block carries the new sections (tunjuk limits, screen, runtime, bundled)
 *   V2  tunjuk opens AI Models as the POP-UP, not a Settings page
 *   V3  tunjuk opens Agent Customizations on a NAMED tab
 *   V4  every dev bridge is searchable by its own name
 *   V5  an unknown bridge name gets the honest fallback, not silence
 *   V6  the hard-limits block gained rule 10
 */
import * as Cdp from '../scripts/lib-cdp.mjs';

const cdp = await Cdp.Cdp.attach(9223, 'Zephyr');
const t = (s, v) => console.log(`[ctx] ${s}\n      ${v}`);

const v1 = await cdp.eval(`(async () => {
  const m = await import('/src/lib/zephyrFakta.ts');
  const s = m.FAKTA_ZEPHYR;
  return JSON.stringify({
    tunjuk: s.includes('## What') && s.includes('IT DOES NOT OPEN'),
    layar: s.includes('## Looking at the reader'),
    runtime: s.includes('## Runtime behaviour'),
    ekstensi: s.includes('## Bundled extensions'),
    panjang: s.length,
  });
})()`, 30000);
t('V1 fakta inti', v1);

const v2 = await cdp.eval(`(async () => {
  const { tunjukTool } = await import('/src/lib/zephyrTools/tunjuk.ts');
  const { useStore } = await import('/src/lib/store.ts');
  useStore.getState().setSettingsOpen(false);
  const out = await tunjukTool.run({ niat: 'di mana saya taruh api key' });
  await new Promise((r) => setTimeout(r, 900));
  const modal = document.querySelector('[data-testid="ai-models-modal"], .aim-modal, [role="dialog"]');
  return JSON.stringify({
    out: String(out).slice(0, 150),
    modal: !!modal,
    settingsOpen: useStore.getState().settingsOpen,
  });
})()`, 60000);
t('V2 AI Models popup', v2);

const v3 = await cdp.eval(`(async () => {
  const { tunjukTool } = await import('/src/lib/zephyrTools/tunjuk.ts');
  const out = await tunjukTool.run({ niat: 'saya mau tulis aturan agen' });
  await new Promise((r) => setTimeout(r, 1200));
  const list = await fetch('http://127.0.0.1:9223/json/list').then((r) => r.json());
  return JSON.stringify({
    out: String(out).slice(0, 190),
    jendela: list.map((w) => w.url.split('#')[1] ?? '').filter(Boolean),
  });
})()`, 60000);
t('V3 agent-custom tab', v3);

const v45 = await cdp.eval(`(async () => {
  const cari = await import('/src/lib/zephyrCari.ts');
  const a = cari.cariFakta('__ZEPHYR_GIT__', { batas: 3 });
  const b = cari.cariFakta('__ZEPHYR_NGAWUR__', { batas: 3 });
  return JSON.stringify({
    git: a.map((x) => x.kunci + ' :: ' + x.teks.slice(0, 80)),
    asing: b.length,
    bridge: cari.kategoriTersedia().find((k) => k.kategori === 'bridge'),
    entri: cari.jumlahEntri(),
  });
})()`, 40000);
t('V4/V5 bridge', v45);

const v6 = await cdp.eval(`(async () => {
  const m = await import('/src/lib/systemPrompt.ts');
  const b = m.blokLarangan();
  return JSON.stringify({ sepuluh: /^10\\./m.test(b), baris: b.split('\\n').length });
})()`, 30000);
t('V6 larangan', v6);

await cdp.close();
