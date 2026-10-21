import { cdp } from './cdp2.mjs';

const c = await cdp(9223, 'localhost:5173');

const j = async (body, ms = 120000) => {
  const src = `(async () => {
    const batas = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ${ms}));
    try {
      const __r = await Promise.race([(async () => { ${body} })(), batas]);
      return JSON.stringify(__r);
    } catch (e) { return JSON.stringify({ galat: String(e && e.message ? e.message : e) }); }
  })()`;
  return JSON.parse(await c.eval(src));
};

/*
 * The notification is gated on `document.hasFocus()` on purpose: a toast for
 * something already on screen is noise. This probe simulates "the reader is in
 * another window" by stubbing that ONE method, so the rest of the path â€” the
 * length gate, the banner switch, the sound switch, the per-outcome choice, and
 * the volume â€” runs exactly as it would in real use.
 */
const hasil = await j(`
  const store = window.__ZEPHYR__;
  const n = await import('/src/lib/notifikasiAi.ts');
  const conv = store.getState().settings.conversation;

  const asli = document.hasFocus.bind(document);
  document.hasFocus = () => false;

  const jalan = async (patch, hasilRun = 'selesai') => {
    store.getState().applySettings({ conversation: { ...conv, ...patch } });
    await new Promise(x=>setTimeout(x,150));
    const id = 'uji-' + Math.random().toString(36).slice(2, 8);
    const sebelum = n.riwayatBunyiNotif().length;
    n.catatMulaiRun(id, Date.now() - 60000);
    n.catatSelesaiRun(id, 'Uji', 'selesai', hasilRun);
    await new Promise(x=>setTimeout(x,1500));
    return {
      bunyi: n.riwayatBunyiNotif().length > sebelum ? n.riwayatBunyiNotif().at(-1) : null,
      keputusan: n.riwayatNotifikasi().at(-1) ?? null,
    };
  };

  const chime = await jalan({ notifSound: true, notifVolume: 40, soundCompleted: 'chime' });
  const bell = await jalan({ notifSound: true, notifVolume: 40, soundCompleted: 'bell' });
  const none = await jalan({ notifSound: true, soundCompleted: 'none' });
  const mati = await jalan({ notifSound: false });
  const volume0 = await jalan({ notifSound: true, notifVolume: 0, soundCompleted: 'default' });
  const berhenti = await jalan({ notifSound: true, soundStopped: 'bell' }, 'berhenti');

  document.hasFocus = asli;
  store.getState().applySettings({ conversation: { ...conv } });
  return { chime, bell, none, mati, volume0, berhenti };
`);

console.log(JSON.stringify(hasil, null, 1));
c.close();
process.exit(0);

