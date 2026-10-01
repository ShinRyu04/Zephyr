import { Cdp } from './lib-cdp.mjs';

/*
 * Diagnosa: kenapa kartu subagent tidak muncul.
 * Periksa (1) panel bawah kelihatan, (2) store subagent punya agen,
 * (3) komponen SubAgentPanel benar-benar ada di DOM.
 */

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const { cdp } = await Cdp.attach('9223', page.title);

const r = await cdp.runAsync(`
  const zzT = TS();
  const zzOut = {
    panelVisible: zzT.visible,
    activeTab: zzT.activeTab,
    setVisibleAda: typeof zzT.setVisible,
    setActiveTabAda: typeof zzT.setActiveTab,
  };

  if (!zzT.visible && typeof zzT.setVisible === 'function') zzT.setVisible(true);
  if (typeof zzT.setActiveTab === 'function' && zzT.activeTab !== 'ai') zzT.setActiveTab('ai');
  await wait(1200);

  zzOut.setelahBuka = {
    visible: TS().visible,
    activeTab: TS().activeTab,
    panelEl: !!q('.panel, [data-testid="panel"]'),
    aiPanelEl: !!q('.ai-panel, [data-testid="ai-panel"]'),
    subPanelEl: !!q('.sub-panel, [data-testid="sub-panel"]'),
  };

  const zzMod = await import('/src/lib/subagentStore.ts');
  zzOut.agenCount = zzMod.useSubAgent.getState().agents?.length ?? -1;

  zzOut.showPanelSetting = window.__ZEPHYR__.getState().settings.subagent?.showPanel;

  return zzOut;
`, 40000);

console.log(JSON.stringify(r, null, 2));
cdp.close();
