// cek-keystate09.mjs — why is the key badge green with no keys stored?
//
// V2 clears the gemini and anthropic keys and expects an orange badge. The
// badge renders is-ok instead, so either `keys` still lists a provider with a
// key or the active provider resolves to one that does.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');
const r = await cdp.runAsync(
  `
  const St = window.__ZEPHYR__;
  const A = window.__ZEPHYR_AI__;
  const tunggu = (ms) => new Promise(r => setTimeout(r, ms));
  const cari = (sl) => document.querySelector(sl);

  // Hapus key uji persis seperti V2.
  const Xx = window.__ZEPHYR_SET__;
  await Xx.setKey('gemini', '');
  await Xx.setKey('anthropic', '');
  await St.getState().reloadSettings();
  await tunggu(800);
  await A.store.getState().loadKeys();
  await tunggu(400);

  const keys = A.store.getState().keys;
  const badge = cari('[data-testid="ai-keystate"]');
  return JSON.stringify({
    keys: keys.map(k => ({ provider: k.provider, hasKey: k.hasKey })),
    badgeAda: !!badge,
    badgeKelas: badge?.className ?? null,
    badgeHaskey: badge?.dataset?.haskey ?? null,
    badgeWarna: badge ? getComputedStyle(badge).color : null,
    providerAktif: St.getState().settings.models.activeProvider,
  });
`,
  90000,
);
console.log(r);
await cdp.close();
