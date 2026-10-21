import * as Cdp from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.Cdp.attach(9223, 'Zephyr');

const expr = [
  '(() => {',
  '  const q = (s) => document.querySelector(s);',
  '  const rect = (el) => el ? Math.round(el.getBoundingClientRect().x) : null;',
  '  const agent = q(\'[data-testid="mb-open-agents"]\');',
  '  const lay = q(\'[data-testid="mb-customize-layout"]\');',
  '  const cs = agent ? getComputedStyle(agent) : null;',
  '  return JSON.stringify({',
  '    agentAda: !!agent,',
  '    teks: agent ? agent.textContent.trim() : null,',
  '    agentX: rect(agent),',
  '    layoutX: rect(lay),',
  '    lebar: agent ? Math.round(agent.getBoundingClientRect().width) : null,',
  '    border: cs ? cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor : null,',
  '    radius: cs ? cs.borderTopLeftRadius : null,',
  '    sep: document.querySelectorAll(".mb-layout-sep").length,',
  '    pillHilang: !q(\'[data-testid="mb-ai-pill"]\'),',
  '    galat: (window.__ZEPHYR_GALAT__ || []).join(" | ").slice(0, 150) || null,',
  '  });',
  '})()',
].join('\n');

console.log(await cdp.eval(expr, 20000));
await cdp.close();
