// Diagnosa V10: kenapa harness menganggap switch MCP gagal.
// Satu kali pakai, hapus setelah selesai.
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const port = process.argv[2] ?? '9224';
const halaman = await halamanZephyr(port);
if (!halaman) {
  console.error('tidak ada halaman Zephyr');
  process.exit(2);
}
const cdp = await Cdp.connect(halaman.webSocketDebuggerUrl);

// Helper yang sama seperti harness, disuntikkan ke halaman.
await cdp.send('Runtime.evaluate', {
  expression: `
    window.__D = { q: (s) => document.querySelector(s), qa: (s) => [...document.querySelectorAll(s)] };
    1
  `,
});

const hasil = await cdp.runAsync(`
  const Mx = window.__ZEPHYR_MCP__;
  await Mx.toggle(false);
  const tunggu = async () => {
    const batas = Date.now() + 20000;
    while (Mx.store.getState().busy && Date.now() < batas) await wait(80);
    await wait(150);
  };
  await tunggu();
  const el0 = __D.q('[data-testid="mcp-status"]');
  const mati = { running: el0?.dataset.running, teks: el0?.textContent?.trim() };

  const elTombol = __D.q('[data-testid="mcp-enable"]');
  const adaTombol = !!elTombol;

  elTombol?.click();
  await tunggu();
  await wait(400);
  await Mx.refresh();
  const elHidup = __D.q('[data-testid="mcp-status"]');
  const hidup = { running: elHidup?.dataset.running, teks: elHidup?.textContent?.trim() };
  const st = Mx.status();
  const disk = (await SET.settingsFromDisk()).mcp;

  return JSON.stringify({
    adaTombol,
    mati,
    hidup,
    port: st?.port,
    tokenLen: (st?.token || '').length,
    enabledDisk: disk.enabled,
    writeToCli: disk.writeToCli,
    cli: __D.qa('[data-testid^="mcp-cli-row-"]').length,
    tokenDiSettings: (disk.token || ''),
    busy: Mx.store.getState().busy,
  });
`, 90000);

console.log(JSON.stringify(JSON.parse(hasil), null, 2));


