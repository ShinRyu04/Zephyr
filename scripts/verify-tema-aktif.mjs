/*
 * Kenapa paket ikon berstatus enabled:false setelah dipasang?
 *
 * Ditemukan: installed.json berisi 11 paket ikon dengan `enabled: false`, dan
 * loader melewati paket yang tidak aktif. Akibatnya store kosong setiap restart
 * dan pohon berkas kembali ke ikon bawaan.
 *
 * Skrip ini mengaktifkan semuanya lewat jalur resmi (extensionsSetEnabled),
 * lalu membuktikan loader benar-benar melihatnya.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const cmd = await import('/src/lib/commands.ts');
  const out = { sebelum: [], diaktifkan: [], gagal: [], sesudah: null };

  const m = await cmd.extensionsManifests();
  const ikon = m.filter((x) => (x.manifest?.id ?? '').includes('ikon'));
  out.sebelum = ikon.map((x) => ({ id: x.manifest.id, enabled: x.enabled }));

  /* Aktifkan setiap paket ikon yang masih mati. */
  for (const x of ikon) {
    if (x.enabled) continue;
    try {
      await cmd.extensionsSetEnabled(x.manifest.id, true);
      out.diaktifkan.push(x.manifest.id);
      await tunggu(120);
    } catch (e) {
      out.gagal.push(x.manifest.id + ': ' + String(e).slice(0, 90));
    }
  }

  await tunggu(600);

  /* Muat ulang dan baca APA ADANYA. */
  const loader = await import('/src/lib/extLoader.ts');
  const r = await loader.muatSemuaEkstensi().catch(() => null);
  await tunggu(1500);

  const st = await import('/src/lib/ikonTemaStore.ts');
  out.sesudah = {
    ringkasanGagal: (r?.gagal ?? []).length,
    paket: st.useIkonTema.getState().packs.map((p) => ({
      id: p.extId,
      label: p.label,
      ikon: Object.keys(p.ikon).length,
    })),
  };

  /* enabled sekarang? */
  const m2 = await cmd.extensionsManifests();
  out.enabledSekarang = m2
    .filter((x) => (x.manifest?.id ?? '').includes('ikon'))
    .map((x) => ({ id: x.manifest.id, enabled: x.enabled }));

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  400000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log('sebelum:');
for (const x of d.sebelum ?? []) console.log(`  ${x.id.padEnd(26)} enabled=${x.enabled}`);
console.log('\ndiaktifkan:', d.diaktifkan.length);
if (d.gagal?.length) for (const g of d.gagal) console.log('  !', g);

console.log('\nsetelah muat ulang:');
for (const p of d.sesudah?.paket ?? []) console.log(`  ${p.id.padEnd(28)} ${p.label.padEnd(18)} ${p.ikon} ikon`);

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti:');
cek('11 paket terlihat loader', (d.sesudah?.paket ?? []).length === 11, String((d.sesudah?.paket ?? []).length));
cek('semua paket punya ikon', (d.sesudah?.paket ?? []).every((p) => p.ikon > 0), '');
cek('semua enabled sekarang', (d.enabledSekarang ?? []).every((x) => x.enabled), '');
cek('tidak ada gagal aktifkan', (d.gagal ?? []).length === 0, String((d.gagal ?? []).length));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
