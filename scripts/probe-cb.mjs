import { Cdp, sleep } from "./lib-cdp.mjs";
const { cdp } = await Cdp.attach("9223");
const r = await cdp.runAsync(`
  S.getState().setSettingsOpen(false);
  TS().setVisible(false);
  S.setState({ sidebarVisible: true });
  S.getState().setActivity("devenv");
  for (let i=0;i<60;i++){ await wait(100); if(document.querySelector('[data-testid="dv-svc-nginx-auto"]')) break; }
  await wait(1500);
  const cb = document.querySelector('[data-testid="dv-svc-nginx-auto"]');
  if(!cb) return JSON.stringify({err:"no checkbox"});
  const sebelum = cb.checked;
  // Measure how fast the DOM box flips after a real click.
  const t0 = Date.now();
  cb.click();
  let flipMs = -1;
  for (let i=0;i<50;i++){ await wait(10); if(cb.checked !== sebelum){ flipMs = Date.now()-t0; break; } }
  const domSetelah = cb.checked;
  // Then how long the disk write actually takes, in the background.
  const t1 = Date.now();
  for (let i=0;i<100;i++){ await wait(20); if(S.getState().settings.devenv?.services?.nginx?.autoStart === domSetelah){ break; } }
  const simpanMs = Date.now()-t1;
  return JSON.stringify({ sebelum, domSetelah, flipKeDomMs: flipMs, tersimpanKeDiskMs: simpanMs }, null, 1);
`, 60000);
console.log(r);
await cdp.close();
