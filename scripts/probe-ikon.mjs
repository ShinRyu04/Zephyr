import { Cdp } from "./lib-cdp.mjs";
const { cdp } = await Cdp.attach("9223");
const r = await cdp.runAsync(`
  S.getState().setSettingsOpen(false); TS().setVisible(false);
  S.setState({ sidebarVisible: true }); S.getState().setActivity("devenv");
  for (let i=0;i<60;i++){ await wait(100); if(document.querySelector('[data-testid="dv-row-path"]')) break; }
  await wait(1000);
  const ikon = (row) => {
    const el = document.querySelector('[data-testid="'+row+'"] .dv-brand svg');
    if(!el) return null;
    const r = el.getBoundingClientRect();
    return { ada:true, w:Math.round(r.width), h:Math.round(r.height), aria: el.getAttribute("aria-label") };
  };
  return JSON.stringify({ root: ikon("dv-row-root"), runtimes: ikon("dv-row-runtimes"), path: ikon("dv-row-path") }, null, 1);
`, 60000);
console.log(r);
await cdp.close();
