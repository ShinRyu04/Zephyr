import * as Cdp from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.Cdp.attach(9223, 'Zephyr');

await cdp.eval('location.reload()', 1000).catch(() => {});
await new Promise((r) => setTimeout(r, 5000));

const expr = [
  '(() => {',
  '  const q = (s) => document.querySelector(s);',
  '  const rect = (el) => el ? Math.round(el.getBoundingClientRect().x) : null;',
  '  const agent = q(\'[data-testid="mb-open-agents"]\');',
  '  const lay = q(\'[data-testid="mb-customize-layout"]\');',
  '  const wcs = [...document.querySelectorAll(\'.wc .wc-btn\')];',
  '  return JSON.stringify({',
  '    agentAda: !!agent,',
  '    agentTeks: agent ? agent.textContent.trim() : null,',
  '    agentX: rect(agent),',
  '    agentLebar: agent ? Math.round(agent.getBoundingClientRect().width) : null,',
  '    layoutX: rect(lay),',
  '    wcX: wcs.map((b) => b.dataset.testid + "@" + rect(b)),',
  '    pillHilang: !q(\'[data-testid="mb-ai-pill"]\'),',
  '    jumlahSeparator: document.querySelectorAll(".mb-layout-sep").length,',
  '    galat: (window.__ZEPHYR_GALAT__ || []).join(" | ").slice(0, 200) || null,',
  '  });',
  '})()',
].join('\n');

console.log(await cdp.eval(expr, 15000));
await cdp.close();
