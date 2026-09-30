import { Cdp, sleep } from "./lib-cdp.mjs";
const { cdp } = await Cdp.attach("9223");
const r = await cdp.runAsync(`
  S.getState().setSettingsOpen(false); TS().setVisible(false);
  S.setState({ sidebarVisible: true });
  S.getState().setActivity("explorer");
  await wait(400);
  // Cold open after cache reset: measure the whole mount.
  const t0 = performance.now();
  S.getState().setActivity("devenv");
  let mountMs = -1;
  for (let i=0;i<80;i++){ await wait(50); if(document.querySelector('[data-testid="dv-services"]')){ mountMs = performance.now()-t0; break; } }
  // Then measure a warm re-open (cache hit).
  await wait(1200);
  S.getState().setActivity("explorer"); await wait(300);
  const t1 = performance.now();
  S.getState().setActivity("devenv");
  let warmMs = -1;
  for (let i=0;i<80;i++){ await wait(50); if(document.querySelector('[data-testid="dv-services"]')){ warmMs = performance.now()-t1; break; } }
  const st = window.__ZEPHYR_DEVENV__.state();
  return JSON.stringify({ mountPertamaMs: +mountMs.toFixed(0), mountKeduaMs: +warmMs.toFixed(0), sudahMuat: st.sudahMuat, jumlahBaris: document.querySelectorAll('.dv-baris').length, jumlahProyek: st.projects.length }, null, 1);
`, 90000);
console.log(r);
await cdp.close();
