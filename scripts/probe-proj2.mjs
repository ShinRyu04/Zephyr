import { Cdp } from "./lib-cdp.mjs";
const { cdp } = await Cdp.attach("9223");
const r = await cdp.runAsync(`
  S.getState().setActivity("explorer"); await wait(300);
  S.getState().setActivity("devenv");
  for (let i=0;i<60;i++){ await wait(100); if(document.querySelector('[data-testid="dv-proj-toko-online-more"]')) break; }
  // scroll it into view first
  const btn = document.querySelector('[data-testid="dv-proj-toko-online-more"]');
  if(!btn) return JSON.stringify({err:"no btn"});
  btn.scrollIntoView({block:"center"}); await wait(200);
  btn.click(); await wait(300);
  const menu = document.querySelector('[data-dv-menu-root] [role="menu"]');
  const items = menu ? [...menu.querySelectorAll('[role="menuitem"]')].map(x=>x.textContent) : [];
  return JSON.stringify({ menu:!!menu, items }, null, 1);
`, 60000);
console.log(r);
await cdp.close();
