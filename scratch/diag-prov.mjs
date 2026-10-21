import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

const r = await cdp.eval(
  `JSON.stringify((() => {
  const p = document.getElementById('uji-d');
  if (!p) return { ada: false };
  const prov = p.querySelector('[data-testid="aim-grup-provider"]');
  const provIsi = p.querySelector('[data-testid="aim-grup-provider-isi"]');
  const rect = prov ? prov.getBoundingClientRect() : null;
  const halaman = p.getBoundingClientRect();
  return {
    adaGrupProvider: !!prov,
    adaIsiProvider: !!provIsi,
    jumlahBarisProvider: provIsi ? provIsi.querySelectorAll('[data-testid^="aim-prov-"]').length : 0,
    posisiY: rect ? Math.round(rect.top - halaman.top) : null,
    tinggiHalaman: Math.round(p.scrollHeight),
    perluScroll: rect ? rect.top - halaman.top > 400 : null,
  };
})())`,
);
console.log(r);
process.exit(0);
