import { cdp } from './cdp2.mjs';

/*
 * Reload FIRST so the whole page is one module graph.
 *
 * Vite serves `/src/lib/store.ts?t=<hmr>` to the running app after an edit, and a
 * probe that imports the bare `/src/lib/store.ts` gets a SECOND instance with its
 * own empty state. That is why an earlier run reported settings the app never
 * had: the probe was reading a different store than the controls were writing.
 * A full reload makes the app load bare URLs too, so the probe and the UI share
 * one graph.
 */
const c0 = await cdp(9223, '#panel=agent-custom');
await c0.eval(`location.reload()`);
c0.close();
await new Promise((r) => setTimeout(r, 6000));

const c = await cdp(9223, '#panel=agent-custom');

const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  return JSON.parse(await c.eval(src));
};

const setSaklar = async (id, nyala) => {
  const sekarang = await c.eval(
    `document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked') === 'true'`,
  );
  if (sekarang !== nyala) {
    await c.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

const setPilih = async (id, nilai) => {
  await c.eval(`(()=>{
    const s = document.querySelector('[data-testid="${id}"]');
    if (!s) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(s, ${JSON.stringify(nilai)});
    s.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));
};

const hasil = {};

hasil.modulSatuGraf = await j(`
  const res = performance.getEntriesByType('resource').map(e => e.name);
  const store = await import('/src/lib/store.ts');
  const autoFix = await import('/src/lib/autoFix.ts');
  return {
    storeUrlBertimestamp: res.filter(n => n.includes('/src/lib/store.ts')).slice(0,2),
    convTerbaca: !!store.useStore.getState().settings.conversation,
    autoFixSaklar: typeof autoFix.autoFixGiliran,
  };
`);

/* ── Notification: sound off => no tone; choice 'none' => recorded as null ─ */
await setSaklar('agx-conv-notif-sound', true);
await setPilih('agx-conv-sound-completed', 'chime');
await c.eval(`(()=>{
  const s = document.querySelector('[data-testid="agx-conv-notif-volume"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(s, '35');
  s.dispatchEvent(new Event('input', { bubbles: true }));
  s.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await new Promise((r) => setTimeout(r, 400));

hasil.notifHidup = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  n.catatMulaiRun('uji-hidup', Date.now() - 60000);
  n.catatSelesaiRun('uji-hidup', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,250));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await setPilih('agx-conv-sound-completed', 'none');
hasil.notifNone = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  n.catatMulaiRun('uji-none', Date.now() - 60000);
  n.catatSelesaiRun('uji-none', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,200));
  return { bunyi: n.riwayatBunyiNotif().at(-1) ?? null };
`);

await setSaklar('agx-conv-notif-sound', false);
hasil.notifMati = await j(`
  const n = await import('/src/lib/notifikasiAi.ts');
  const sebelum = n.riwayatBunyiNotif().length;
  n.catatMulaiRun('uji-mati', Date.now() - 60000);
  n.catatSelesaiRun('uji-mati', 'Uji', 'selesai', 'selesai');
  await new Promise(r=>setTimeout(r,150));
  return { sebelum, sesudah: n.riwayatBunyiNotif().length, bertambah: n.riwayatBunyiNotif().length > sebelum };
`);

/* ── Auto Fix Lints through the switch ─────────────────────────────────── */
await setSaklar('agx-conv-lint-ide', true);
hasil.autoFixHidup = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0,100), diminta: r?.diminta ?? 0, galat: r?.galat ?? null };
`);
await setSaklar('agx-conv-lint-ide', false);
hasil.autoFixMati = await j(`
  const m = await import('/src/lib/autoFix.ts');
  return { hasil: await m.autoFixGiliran('', ['src/lib/autoFix.ts']) };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
