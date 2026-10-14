import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const paneId = await cdp.json(`return JSON.stringify(await (async () => {
  const T = (await import('/src/lib/terminalStore.ts')).useTerminal.getState();
  return await T.addPane('shell', { cwd: 'D:/Testing/nada' });
})())`);
console.log('pane dibuat:', paneId);
if (!paneId) { console.log('GAGAL buat pane'); await cdp.close(); process.exit(1); }
await new Promise(s=>setTimeout(s,2500));
// kirim perintah; CR = String.fromCharCode(13) dirakit di dalam page agar lolos escaping
const sent = await cdp.json(`return JSON.stringify(await (async () => {
  const { ptyWrite } = await import('/src/lib/commands.ts');
  const CR = String.fromCharCode(13);
  const pane = ${JSON.stringify(paneId)};
  await ptyWrite(pane, 'python -m http.server 8099' + CR);
  return 'ok';
})())`);
console.log('perintah server dikirim:', sent);
await new Promise(s=>setTimeout(s,3500));
await cdp.close();
