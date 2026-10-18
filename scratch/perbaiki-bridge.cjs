const fs = require('fs');
const p = 'scripts/verify-agc-hooks-browser.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.split('window.__ZEPHYR_EXTRAS__?.hooks?.()').join('window.__ZEPHYR_AGENT_EXTRAS__?.useAgentExtras.getState().hooks');
s = s.split('g?.hooks?.()').join('g?.useAgentExtras.getState().hooks');
s = s.split('window.__ZEPHYR_EXTRAS__').join('window.__ZEPHYR_AGENT_EXTRAS__');
s = s.split('g.state().removeHook').join('g.useAgentExtras.getState().removeHook');
fs.writeFileSync(p, s);
console.log('bridge diperbaiki');
