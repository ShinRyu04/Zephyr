// cek-panel-mcp.mjs — confirm the MCP settings panel renders its write button.
//
// V9 of the phase-12 harness clicks [data-testid="mcp-write"]. If the panel
// never renders, the click throws on null and the whole run stops with an
// unhelpful message. This prints what the panel actually contains.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const r = await cdp.runAsync(`
  const out = {};
  const st = window.__ZEPHYR__.getState();
  const setui = window.__ZEPHYR_SETUI__;

  out.bridgeAda = {
    ZEPHYR: !!window.__ZEPHYR__,
    SETUI: !!setui,
    MCP: !!window.__ZEPHYR_MCP__,
  };
  out.settingsOpenAwal = st.settingsOpen;

  st.setSettingsOpen(true);
  await new Promise(r => setTimeout(r, 400));
  setui.getState().setSection('mcp');
  await new Promise(r => setTimeout(r, 1800));

  out.section = setui.getState().section;
  out.settingsOpen = window.__ZEPHYR__.getState().settingsOpen;
  out.adaMcpWrite = !!document.querySelector('[data-testid="mcp-write"]');
  out.semuaMcp = [...document.querySelectorAll('[data-testid^="mcp-"]')].map(e => e.getAttribute('data-testid')).slice(0, 14);
  out.judulTopbar = document.querySelector('.set-topbar h2')?.textContent ?? null;
  out.panelAda = !!document.querySelector('.mcp-panel, [data-testid="mcp-status"]');

  return JSON.stringify(out);
`, 60000);

console.log(r);
await cdp.close();
