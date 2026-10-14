/** Probe sementara: apakah kode HydraFusion benar-benar hidup di app yang jalan. */
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');
const r = await cdp.json(`
  const A = X.store.getState();
  const panel = await fetch('/src/components/ai/AiPanel.tsx').then((r) => r.text());
  const setelan = await fetch('/src/components/ai/ChatSettingsPage.tsx').then((r) => r.text());
  return JSON.stringify({
    kunciHydra: Object.keys(A).filter((k) => /hydra/i.test(k)),
    panelHydraDiKode: panel.includes('ai-work-hydra'),
    setelanHydraDiKode: setelan.includes('cset-hydra'),
    panelAda: !!q('.ai-chat'),
    tesidCset: qa('[data-testid^="cset-"]').map((e) => e.getAttribute('data-testid')).slice(0, 15),
    tombolSetelanChat: !!q('[data-testid="ai-open-chat-settings"]'),
  });
`);
console.log(JSON.stringify(r, null, 2));
