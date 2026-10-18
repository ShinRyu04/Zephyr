import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

const r = await cdp.eval(
  `JSON.stringify((() => {
  const S = window.__ZEPHYR_PLUGINS__;
  return { ada: !!S, kunci: S ? Object.keys(S) : [] };
})())`,
);
console.log('bridge:', r);

const r2 = await cdp.eval(
  `(async () => {
  const sk = (await import('/src/lib/skillsStore.ts')).useSkills.getState();
  await sk.muatKatalog();
  const st = (await import('/src/lib/skillsStore.ts')).useSkills.getState();
  return JSON.stringify({
    daftar: st.daftar.map((x) => x.name),
    katalog: st.katalog.map((x) => x.name),
    galat: st.galat,
  });
})()`,
);
console.log('skills:', r2);
process.exit(0);
