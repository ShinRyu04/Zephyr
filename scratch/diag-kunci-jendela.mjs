// Diag: keadaan store AI di tiap jendela (kunci, provider, model).
import { Cdp, sleep } from '../scripts/lib-cdp.mjs';

const port = Number(process.env.ZEPHYR_PORT || 9223);
const { get } = await import('node:http');
const daftar = await new Promise((res, rej) => {
  get({ host: '127.0.0.1', port, path: '/json/list', family: 4 }, (r) => {
    let d = '';
    r.on('data', (c) => (d += c)).on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

const EKSPRESI = `(() => {
  const ai = window.__ZEPHYR_AI__;
  const st = ai?.store?.getState?.();
  if (!st) return { err: 'tidak ada __ZEPHYR_AI__' };
  const s = window.__ZEPHYR__?.getState?.();
  return {
    provider: st.provider,
    model: st.model,
    keys: (st.keys ?? []).map((k) => k.provider + (k.hasKey ? '+key' : '-')),
    disk: [...(st.disk ?? [])],
    hasKeySendiri: st.hasKey?.(st.provider),
    lastActiveProvider: st.lastActiveProvider,
    settingsAktif: s?.settings?.models?.activeProvider,
    providersSettings: Object.fromEntries(
      Object.entries(s?.settings?.models?.providers ?? {}).map(([k, v]) => [k, { url: v?.baseUrl, model: v?.model }]),
    ),
    customModels: (s?.settings?.models?.custom ?? []).map((c) => c.provider + '/' + c.id),
    notifKey: (document.querySelector('[class*=nokey], [data-testid*=nokey]')?.textContent ?? '').slice(0, 160),
  };
})()`;

for (const page of daftar.filter((p) => p.type === 'page')) {
  let cdp;
  try {
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    const hasil = await cdp.eval(`JSON.stringify(${EKSPRESI})`, 15000);
    console.log('==', page.url.replace('http://localhost:5173', ''), '==');
    console.log(typeof hasil === 'string' ? hasil : JSON.stringify(hasil, null, 1));
  } catch (e) {
    console.log('==', page.url, 'GAGAL', e.message);
  } finally {
    try { cdp?.close(); } catch { /* */ }
  }
  await sleep(200);
}
