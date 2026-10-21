import { cdp } from './cdp2.mjs';

const c = await cdp(9223, 'localhost:5173');

const j = async (body, ms = 180000) => {
  const src = `(async () => {
    const batas = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ${ms}));
    try {
      const __r = await Promise.race([(async () => { ${body} })(), batas]);
      return JSON.stringify(__r);
    } catch (e) { return JSON.stringify({ galat: String(e && e.message ? e.message : e) }); }
  })()`;
  return JSON.parse(await c.eval(src));
};

const hasil = {};

/*
 * Auto Fix with a file INSIDE the real workspace.
 *
 * The workspace here is D:\ZephyrDesktop, so a file under D:\Zephyr is correctly
 * rejected — that refusal is the safety boundary working, not a bug. To prove the
 * fixer path end to end, the probe temporarily points the workspace at the
 * throwaway project, which has a package.json and an installed prettier.
 */
hasil.autoFixHidup = await j(`
  const store = window.__ZEPHYR__;
  const asli = store.getState().workspace;
  const conv = store.getState().settings.conversation;

  store.setState({ workspace: 'D:\\\\Zephyr\\\\scratch\\\\proyek-uji' });
  store.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,250));

  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/a.js']);

  store.setState({ workspace: asli });
  store.getState().applySettings({ conversation: { ...conv } });
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 110), diminta: r?.diminta ?? 0, berubah: (r?.berubah ?? []).length, galat: r?.galat ?? null };
`, 180000);

/* Auto Fix OFF: nothing runs at all, not even a refusal report. */
hasil.autoFixMati = await j(`
  const store = window.__ZEPHYR__;
  const asli = store.getState().workspace;
  const conv = store.getState().settings.conversation;
  store.setState({ workspace: 'D:\\\\Zephyr\\\\scratch\\\\proyek-uji' });
  store.getState().applySettings({ conversation: { ...conv, autoFixIde: false } });
  await new Promise(r=>setTimeout(r,250));
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/a.js']);
  store.setState({ workspace: asli });
  store.getState().applySettings({ conversation: { ...conv } });
  return { hasil: r };
`);

/*
 * Notification: the SAME run id for start and finish.
 *
 * The previous probe used a random id on start and a fixed one on finish, so the
 * module never found the run and (correctly) returned early. The bug was in the
 * probe; the feature was never reached.
 */
hasil.notif = await j(`
  const store = window.__ZEPHYR__;
  const n = await import('/src/lib/notifikasiAi.ts');
  const conv = store.getState().settings.conversation;

  const jalan = async (patch) => {
    store.getState().applySettings({ conversation: { ...conv, ...patch } });
    await new Promise(x=>setTimeout(x,150));
    const id = 'uji-' + Math.random().toString(36).slice(2, 8);
    const sebelum = n.riwayatBunyiNotif().length;
    n.catatMulaiRun(id, Date.now() - 60000);
    n.catatSelesaiRun(id, 'Uji', 'selesai', 'selesai');
    await new Promise(x=>setTimeout(x,300));
    return n.riwayatBunyiNotif().length > sebelum ? n.riwayatBunyiNotif().at(-1) : null;
  };

  const chime = await jalan({ notifSound: true, notifVolume: 40, soundCompleted: 'chime' });
  const bell = await jalan({ notifSound: true, notifVolume: 40, soundCompleted: 'bell' });
  const none = await jalan({ notifSound: true, soundCompleted: 'none' });
  const mati = await jalan({ notifSound: false });
  store.getState().applySettings({ conversation: { ...conv } });
  return { chime, bell, none, mati };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
