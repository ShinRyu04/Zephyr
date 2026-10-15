/**
 * cek-loop-navigasi.mjs - perilaku penghentian agent pada permintaan navigasi.
 *
 *   node scripts/cek-loop-navigasi.mjs 9223
 *
 * Menguji `isNavigationOnlyRequest` di aplikasi yang hidup. Yang penting di
 * sini adalah pasangan kasus BENAR dan kasus SALAH: uji yang hanya memuat
 * kasus "harus true" akan lulus juga kalau fungsinya dibuat selalu true.
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = Number(process.argv[2] || 9223);
const { cdp } = await Cdp.attach(PORT, 'Zephyr');
const r = reporter('cek-loop-navigasi');

const KASUS = [
  // harus TRUE - navigasi eksplisit, kata terminal/shell hanya menyebut tempat
  ['buka youtube.com di terminal web shell', true, 'kata terminal menyebut tempat'],
  ['buka youtube.com', true, 'domain telanjang'],
  ['buka google.com', true, 'domain telanjang tanpa skema'],
  ['open google.com in the browser pane', true, 'pane browser'],
  ['buka https://github.com di pane browser', true, 'url + buka'],
  ['navigasi ke www.google.com', true, 'verb navigasi'],
  ['coba jalankan ini http://localhost:3000', true, 'bentuk coba jalankan ini'],

  // harus FALSE - ada maksud lain pada URL-nya, atau memang bukan navigasi
  ['jalankan script ini di terminal', false, 'tidak ada url'],
  ['cek output terminal', false, 'tidak ada url, bukan navigasi'],
  ['download https://example.com/file.zip lalu baca isinya', false, 'unduh, bukan buka'],
  ['buka https://example.com lalu jalankan npm install', false, 'ada penyuntingan setelahnya'],
  ['buka file src/main.ts', false, 'buka berkas, bukan url'],
  ['buka example.com lalu install dependensinya', false, 'install setelah buka'],
  ['baca https://example.com/docs', false, 'baca, bukan buka'],
];

console.log('\n== Klasifikasi navigasi di aplikasi hidup ==');
for (const [teks, harap, catatan] of KASUS) {
  const dapat = await cdp.json(
    `return JSON.stringify(await (async () => {
       const m = await import('/src/lib/aiStore.ts');
       return m.isNavigationOnlyRequest(${JSON.stringify(teks)});
     })())`,
  );
  r.check(
    harap === dapat ? 'N' : 'N!',
    dapat === harap,
    `${catatan} :: ${JSON.stringify(teks)} -> ${dapat} (harap ${harap})`,
  );
}

/* Store harus benar-benar menerima saran perintah, bukan hanya punya tipenya. */
console.log('\n== kartu saran perintah menyimpan saran ==');
const saran = await cdp.json(`return JSON.stringify(await (async () => {
  const { useAi } = await import('/src/lib/aiStore.ts');
  useAi.getState().setCommandSuggestion({ command: 'npm run build', alasan: 'membangun rilis' });
  const a = useAi.getState().commandSuggestion;
  useAi.getState().setCommandSuggestion(null);
  const b = useAi.getState().commandSuggestion;
  return { ada: a, kosong: b };
})())`);
const s = typeof saran === 'string' ? JSON.parse(saran) : saran;
r.check('S1', s.ada && s.ada.command === 'npm run build', `command tersimpan (${s.ada?.command})`);
r.check('S2', s.ada && s.ada.alasan === 'membangun rilis', 'alasan tersimpan');
r.check('S3', s.kosong === null, 'bisa dikosongkan lagi');

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
