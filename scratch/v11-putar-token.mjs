/*
 * Uji putar token: apakah token di mcp.json/UI = token yang DITERIMA server?
 * Kalau sesudah putar token baru diterima -> runtime sempat basi.
 */
import { Cdp } from '../scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const hasil = JSON.parse(
  await cdp.runAsync(`
    const MS_ = () => M.store.getState();
    await M.refresh();
    const sebelum = MS_().status?.token ?? null;
    await M.rotate();
    await wait(400);
    await M.refresh();
    const sesudah = MS_().status?.token ?? null;
    return JSON.stringify({ sebelum, sesudah, sama: sebelum === sesudah });
  `),
);
console.log(JSON.stringify(hasil));
try {
  cdp.close();
} catch {
  /* tidak apa-apa */
}
