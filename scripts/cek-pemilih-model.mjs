/*
 * BUG 3, bagian UI - baris placeholder tidak boleh ditawarkan di pemilih model.
 *
 * Uji store (cek-model-placeholder.mjs) membuktikan setModel MENOLAK placeholder.
 * Uji ini membuktikan barisnya tidak pernah sampai ke pengguna, supaya tidak ada
 * yang perlu ditolak.
 *
 * Baris nyata di DOM memakai class `ai-model-item` (dibaca dari aplikasi hidup,
 * bukan ditebak).
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

const r = await cdp.runAsync(`
  const cat = await import('/src/lib/modelCatalog.tsx');
  const placeholder = [...cat.PLACEHOLDER_MODEL_IDS];

  // Buka pemilih model lewat store, lalu kumpulkan SEMUA baris dari DOM.
  X.store.getState().setModelMenuOpen(true);
  await wait(700);

  const baris = qa('.ai-model-item');
  const teks = baris.map((n) => n.textContent.trim());
  // Id yang benar-benar bisa diklik: atribut data-* kalau ada, kalau tidak teksnya.
  const idBaris = baris.map((n) => n.getAttribute('data-model-id') || n.getAttribute('title') || n.textContent.trim());

  return {
    placeholder,
    jumlah: baris.length,
    contoh: teks.slice(0, 14),
    idBaris,
    adaKosong: !!q('.ai-model-empty'),
    adaKetik: !!q('.ai-model-typed'),
  };
`);

console.log('placeholder katalog:', r.placeholder.join(', '));
console.log('contoh baris:', JSON.stringify(r.contoh));

const cocok = r.idBaris.filter((b) => r.placeholder.some((p) => String(b).includes(p)));
console.log('baris yang cocok placeholder:', JSON.stringify(cocok));

cek('tidak ada baris placeholder di pemilih model', cocok.length === 0, cocok.join(', ') || '(bersih)');
cek('pemilih tetap menampilkan baris model lain', r.jumlah > 0, `total ${r.jumlah} baris`);

// Tutup lagi supaya tidak mengganggu harness berikutnya (pelajaran fase 08/11).
await cdp.runAsync(`X.store.getState().setModelMenuOpen(false); return {};`);

const lulus = hasil.filter(Boolean).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
cdp.close();
process.exit(lulus === hasil.length ? 0 : 1);
