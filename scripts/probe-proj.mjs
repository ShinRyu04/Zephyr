import { Cdp } from "./lib-cdp.mjs";
const { cdp } = await Cdp.attach("9223");
const r = await cdp.runAsync(`
  const st = window.__ZEPHYR_DEVENV__.state();
  return JSON.stringify({ proyek: st.projects.map(p=>p.nama), adaMenu: [...document.querySelectorAll('[data-testid$="-more"]')].map(x=>x.getAttribute("data-testid")).filter(x=>x.includes("proj")) }, null, 1);
`, 30000);
console.log(r);
await cdp.close();
