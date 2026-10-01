import { Cdp } from "./lib-cdp.mjs";
const { cdp } = await Cdp.attach("9223");
const r = await cdp.runAsync(`
  return JSON.stringify({
    judul: document.title,
    bridge: !!window.__ZEPHYR__,
    sub: !!window.__ZEPHYR_SUB__,
    devenv: !!window.__ZEPHYR_DEVENV__,
    lsp: !!window.__ZEPHYR_LSP__,
    errors: (window.__ZEPHYR_ERRORS__||[]).length,
    settingsLoaded: window.__ZEPHYR__?.getState?.().settingsLoaded ?? null,
    versi: window.__ZEPHYR__?.getState?.().settings?.subagent ?? null,
  }, null, 1);
`, 30000);
console.log(r);
await cdp.close();
