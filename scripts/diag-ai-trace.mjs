import { Cdp } from './lib-cdp.mjs';

/* Diagnosa: kenapa .ai-agent-step tidak render walau agentSteps diisi. */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const zzAI = X.store;
  const zzLangkah = [
    { kind: 'tool', name: 'file_read', args: '{"path":"D:/Zephyr/src/components/ai/AiPanel.tsx"}', result: 'ok', ok: true, at: Date.now() },
    { kind: 'selesai', at: Date.now() },
  ];
  zzAI.setState({ agentSteps: zzLangkah });
  await wait(1500);

  return {
    storeSteps: zzAI.getState().agentSteps.length,
    storeBusy: zzAI.getState().agentBusy,
    panelAda: !!q('[data-testid="ai-panel"]'),
    panelPos: q('[data-testid="ai-panel"]')?.getAttribute('data-pos'),
    agentEl: !!q('[data-testid="ai-agent"]'),
    agentElH: q('[data-testid="ai-agent"]')?.offsetHeight ?? -1,
    stepEl: qa('.ai-agent-step').length,
    semuaAnakPanel: [...(q('[data-testid="ai-panel"]')?.children ?? [])].map((c) => c.className),
  };
`, 40000);

console.log(JSON.stringify(r, null, 2));
cdp.close();
