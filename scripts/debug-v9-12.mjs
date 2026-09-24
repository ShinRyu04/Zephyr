// debug-v9-12.mjs — inspect each V9 condition separately.
//
// V9 has many conditions in one check, and its failure message lists values
// that all look right, so the failing one has to be isolated.

import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223', 'Zephyr');

const r = await cdp.runAsync(`
  const st = window.__ZEPHYR__.getState();
  const setui = window.__ZEPHYR_SET__.ui;
  const _M = window.__ZEPHYR_MCP__;
  const MS = () => _M.store.getState();

  st.setSettingsOpen(true);
  await new Promise(r => setTimeout(r, 400));
  setui.getState().setSection('mcp');
  await new Promise(r => setTimeout(r, 900));

  await _M.refresh();
  await _M.refreshClis();
  await new Promise(r => setTimeout(r, 600));

  const out = {};
  out.statusRunning = _M.status()?.running ?? null;
  out.statusPort = _M.status()?.port ?? null;
  out.tokenLen = (_M.status()?.token ?? '').length;

  const rows = [...document.querySelectorAll('[data-testid^="mcp-cli-row-"]')].map(e => ({
    id: e.dataset.cliId,
    path: e.querySelector('.mcp-cli-path')?.getAttribute('title') ?? null,
  }));
  out.jumlahRows = rows.length;
  out.rows = rows.map(r => ({ id: r.id, panjangPath: (r.path ?? '').length, path: r.path }));

  out.adaWrite = !!document.querySelector('[data-testid="mcp-write"]');
  out.adaUnwrite = !!document.querySelector('[data-testid="mcp-unwrite"]');
  out.ringkas = document.querySelector('[data-testid="mcp-ringkas"]')?.textContent ?? null;

  return JSON.stringify(out);
`, 90000);

console.log(r);
await cdp.close();
