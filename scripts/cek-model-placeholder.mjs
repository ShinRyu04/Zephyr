/*
 * BUG 3 - pilihan model pengguna harus BERTAHAN, dan placeholder tidak boleh
 * pernah dipakai sebagai nama model yang dikirim ke provider.
 *
 * Gejala asli: provider custom memakai "custom-model" (placeholder) walau
 * pengguna memilih model lain. Baris placeholder di pemilih model bisa diklik,
 * dan klik itu MENIMPA pilihan asli - lalu router menolak nama yang tidak ada.
 *
 * Uji ini tidak menebak dari bentuk id atau dari nama berkas. Ia membaca
 * `PLACEHOLDER_MODEL_IDS` dari MODUL katalog, mencoba menimpanya, memastikan
 * penolakannya terlihat, lalu memilih model nyata dan MEMUAT ULANG halaman
 * untuk membuktikan pilihannya bertahan.
 *
 * Syarat: aplikasi hidup dengan port debug 9223.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);

const hasil = [];
const cek = (nama, lulus, detail) => {
  hasil.push(lulus);
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${detail ? '  ->  ' + detail : ''}`);
};

// --- 0. Sumber kebenaran placeholder dibaca dari MODUL katalog.
const katalog = await cdp.runAsync(`
  const m = await import('/src/lib/modelCatalog.tsx');
  const custom = m.PROVIDER_BY_ID.get('custom');
  return {
    placeholder: [...m.PLACEHOLDER_MODEL_IDS],
    customPertama: (custom?.models ?? [])[0]?.id ?? null,
    dikenali: custom?.models?.[0]?.id ? m.isPlaceholderModel(custom.models[0].id) : null,
    nyataDikenali: m.isPlaceholderModel('deepseek-v4.1-flash'),
  };
`);
console.log('katalog:', JSON.stringify(katalog));
cek('katalog menandai minimal satu id sebagai placeholder', katalog.placeholder.length > 0, katalog.placeholder.join(', '));
cek(
  'placeholder katalog dikenali isPlaceholderModel',
  katalog.dikenali === true,
  `custom[0]=${katalog.customPertama} -> ${katalog.dikenali}`,
);
cek('id model nyata BUKAN placeholder', katalog.nyataDikenali === false);

// --- 1. setModel menolak placeholder, dan penolakannya TERLIHAT.
const tolak = await cdp.runAsync(`
  const sebelum = X.store.getState().model;
  X.store.getState().setToast(null);
  X.store.getState().setModel(${JSON.stringify(katalog.customPertama)});
  return { sebelum, sesudah: X.store.getState().model, toast: X.store.getState().toast };
`);
console.log('setModel(placeholder) ->', JSON.stringify(tolak));
cek('setModel(placeholder) TIDAK mengubah model', tolak.sesudah === tolak.sebelum, `${tolak.sebelum} -> ${tolak.sesudah}`);
cek('setModel(placeholder) meninggalkan toast yang terlihat', !!tolak.toast, tolak.toast);

// --- 2. Pilihan model NYATA mengubah store dan tersimpan ke settings.
const NYATA = 'deepseek-v4.1-flash';
const set = await cdp.runAsync(`
  X.store.getState().setToast(null);
  X.store.getState().setModel(${JSON.stringify(NYATA)});
  return { model: X.store.getState().model, toast: X.store.getState().toast };
`);
console.log('setModel(nyata) ->', JSON.stringify(set));
cek('setModel(id nyata) mengubah model', set.model === NYATA, set.model);

await new Promise((r) => setTimeout(r, 1500));
/*
 * Dibaca dari DISK, bukan dari store - kalau hanya store yang benar, tidak ada
 * yang tersimpan dan bug-nya masih ada. `settingsFromDisk()` mengembalikan
 * objek, jadi runAsync dipakai (cdp.json akan mem-parse dua kali).
 */
const disk = await cdp.runAsync(`
  const d = await SET.settingsFromDisk();
  return { model: d?.models?.providers?.custom?.model ?? null };
`);
console.log('settings.json custom.model ->', JSON.stringify(disk.model));
cek('pilihan tersimpan ke settings.json', disk.model === NYATA, disk.model);

// --- 3. Reload halaman: pilihan harus kembali, bukan placeholder.
console.log('\n-- reload halaman --');
await cdp.eval(`location.reload(); 'ok'`);
await new Promise((r) => setTimeout(r, 11000));
const sesudah = await cdp.runAsync(`
  // tunggu sampai store AI siap lagi
  for (let i = 0; i < 60; i++) {
    if (window.__ZEPHYR_AI__ && X.store.getState().model) break;
    await wait(250);
  }
  return { model: window.__ZEPHYR_AI__ ? X.store.getState().model : null };
`);
console.log('model sesudah reload ->', JSON.stringify(sesudah.model));
cek('model bertahan sesudah reload', sesudah.model === NYATA, `diharapkan ${NYATA}, dapat ${sesudah.model}`);
cek('model sesudah reload BUKAN placeholder', !katalog.placeholder.includes(String(sesudah.model)), String(sesudah.model));

const lulus = hasil.filter(Boolean).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
cdp.close();
process.exit(lulus === hasil.length ? 0 : 1);
