import { Cdp } from "./lib-cdp.mjs";
const { cdp } = await Cdp.attach("9223");
const r = await cdp.runAsync(`
  S.getState().setSettingsOpen(false); TS().setVisible(false);
  S.setState({ sidebarVisible: true }); S.getState().setActivity("devenv");
  for (let i=0;i<60;i++){ await wait(100); if(document.querySelector('[data-testid="dv-svc-nginx-more"]')) break; }
  await wait(1200);
  const out = [];
  for (const t of ["dv-rt-node-more","dv-svc-nginx-more","dv-proj-toko-online-more"]) {
    const btn = document.querySelector('[data-testid="'+t+'"]');
    if(!btn){ out.push({t, ada:false}); continue; }
    btn.click();
    await wait(250);
    const menu = document.querySelector('[data-dv-menu-root] [role="menu"]');
    const items = menu ? [...menu.querySelectorAll('[role="menuitem"]')].map(x=>x.textContent) : [];
    out.push({ t, menu: !!menu, items });
    // close
    document.body.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));
    await wait(200);
  }
  return JSON.stringify(out, null, 1);
`, 60000);
console.log(r);
await cdp.close();
