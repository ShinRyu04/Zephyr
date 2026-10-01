import { Cdp, sleep } from "./lib-cdp.mjs";
const { cdp } = await Cdp.attach("9223");
const r = await cdp.runAsync(`
  S.getState().setSettingsOpen(false); TS().setVisible(false);
  S.setState({ sidebarVisible: true }); S.getState().setActivity("devenv");
  for (let i=0;i<60;i++){ await wait(100); if(document.querySelector('[data-testid="dv-svc-nginx-auto"]')) break; }
  await wait(1500);
  const cb = document.querySelector('[data-testid="dv-svc-nginx-auto"]');
  // Measure the synchronous work a click triggers (React commit + store set).
  const t0 = performance.now();
  cb.click();
  // force the browser to lay out/commit before measuring
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const commitMs = performance.now() - t0;
  // Count how many dv rows re-rendered by watching a MutationObserver briefly.
  let mut = 0;
  const root = document.querySelector('[data-testid="dv-root"]');
  const mo = new MutationObserver(list => { mut += list.length; });
  mo.observe(root, { childList:true, subtree:true, attributes:true });
  const t1 = performance.now();
  cb.click();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const commit2 = performance.now()-t1;
  await wait(300);
  mo.disconnect();
  return JSON.stringify({ commitMs: +commitMs.toFixed(1), commit2Ms: +commit2.toFixed(1), mutasiSetelahKlik: mut }, null, 1);
`, 60000);
console.log(r);
await cdp.close();
