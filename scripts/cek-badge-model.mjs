import { Cdp } from './lib-cdp.mjs';
import { writeFileSync } from 'node:fs';

/*
 * Item 4: the per-row model badge on subagent cards.
 *
 * The card only renders inside the AI panel, so this opens that panel first,
 * seeds one finished agent with a model, and reads the badge back off the DOM.
 *
 * runAsync already declares S, s, T, TS, q, qa, wait, ... as prelude shortcuts;
 * every local here is prefixed zz so nothing collides with them.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

console.log('  mount :', await cdp.eval('String(document.getElementById("root")?.children.length ?? -1)'));

const hasil = await cdp.runAsync(`
  const zzT = TS();
  if (!zzT.visible) zzT.setVisible(true);
  if (zzT.activeTab !== 'ai') zzT.setActiveTab('ai');
  await wait(1000);

  const zzMod = await import('/src/lib/subagentStore.ts');
  const zzId = 'uji-badge-' + Date.now();
  const zzSt = zzMod.useSubAgent.getState();

  zzMod.useSubAgent.setState({
    agents: [
      ...(zzSt.agents ?? []),
      {
        id: zzId,
        nama: 'Pemeta tes',
        peran: 'cari',
        status: 'selesai',
        langkah: [],
        hasil: 'selesai',
        verdict: 'ok',
        model: 'custom-model',
        provider: 'custom',
        mulai: Date.now(),
        selesai: Date.now(),
      },
    ],
  });

  await wait(1000);

  const zzBadge = q('[data-testid="sub-model-badge-' + zzId + '"]');
  window.__UJI_BADGE__ = zzId;
  return {
    badgeAda: !!zzBadge,
    teks: zzBadge?.textContent ?? null,
    model: zzBadge?.getAttribute('data-model') ?? null,
    provider: zzBadge?.getAttribute('data-provider') ?? null,
    title: zzBadge?.getAttribute('title') ?? null,
    semuaBadge: qa('[data-testid^="sub-model-badge-"]').length,
    kartuAda: !!q('[data-testid^="sub-kartu-"], .sub-kartu'),
  };
`, 40000);

console.log('  badge :', JSON.stringify(hasil));

const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
if (sh?.result?.data) {
  writeFileSync('D:/Zephyr/shot-badge-model.png', Buffer.from(sh.result.data, 'base64'));
  console.log('  shot-badge-model.png');
}

await cdp.runAsync(`
  const zzMod = await import('/src/lib/subagentStore.ts');
  const zzId = window.__UJI_BADGE__;
  zzMod.useSubAgent.setState({
    agents: zzMod.useSubAgent.getState().agents.filter((a) => a.id !== zzId),
  });
  return 'bersih';
`, 15000);

cdp.close();
