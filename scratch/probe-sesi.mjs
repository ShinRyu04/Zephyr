import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

/* Cek isi pesan sesi asli: field apa yang dipakai, dan mengapa detail kosong. */
await cdp.eval(
  `(() => {
  window.__PROBE__ = null;
  import('/src/lib/aiStore.ts').then((m) => {
    const st = m.useAi.getState();
    const s = (st.sessions || []).map((x) => ({
      id: x.id,
      title: (x.title || '').slice(0, 40),
      n: (x.messages || []).length,
      field: (x.messages || [])[0] ? Object.keys((x.messages || [])[0]).join(',') : null,
      role0: (x.messages || [])[0]?.role,
      content0: String((x.messages || [])[0]?.content ?? '').slice(0, 60),
    }));
    window.__PROBE__ = JSON.stringify({ jumlah: (st.sessions || []).length, aktif: st.activeIds, s });
  }).catch((e) => { window.__PROBE__ = 'ERR ' + e; });
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 2200));
const r = await cdp.eval(`window.__PROBE__`);
console.log(r);
process.exit(0);
