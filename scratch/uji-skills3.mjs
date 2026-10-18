import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

/* Panggil muatKatalog, tunggu, lalu baca hasilnya di panggilan TERPISAH. */
await cdp.eval(
  `(() => {
  import('/src/lib/skillsStore.ts').then((m) => m.useSkills.getState().muatKatalog());
  return 'mulai';
})()`,
);
await new Promise((r) => setTimeout(r, 2500));

const r = await cdp.eval(
  `JSON.stringify((() => {
  const S = window.__ZEPHYR_SKILLS__;
  return { adaBridge: !!S };
})())`,
);
console.log('bridge:', r);

const r2 = await cdp.eval(
  `(() => {
  return JSON.stringify(window.__UJI_SK__ || null);
})()`,
);
console.log('slot:', r2);

/* Baca lewat modul langsung - import sudah tercache, jadi ini sinkron. */
await cdp.eval(
  `(() => {
  import('/src/lib/skillsStore.ts').then((m) => {
    const st = m.useSkills.getState();
    window.__UJI_SK__ = {
      daftar: st.daftar.map((x) => x.name),
      katalog: st.katalog.map((x) => x.name + ':' + x.terpasang),
      galat: st.galat,
    };
  });
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 1200));

const r3 = await cdp.eval(`JSON.stringify(window.__UJI_SK__ || null)`);
console.log('isi:', r3);
process.exit(0);
