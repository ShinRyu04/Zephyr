/*
 * Verifikasi referensi `@` di COMPOSER tampil sebagai chip (bukan teks mentah).
 *
 *   C1  memilih berkas dari popup: chip muncul, draft TIDAK berisi "@path"
 *   C2  mengirim: teks yang dikirim memuat "@<path>" + kalimat yang diketik
 *   C3  tombol ✕ di chip menghapusnya
 *   C4  Backspace di draft kosong menghapus chip terakhir
 *   C5  setelah terkirim, strip chip kosong lagi
 *
 * `kirimSekarang` diganti SEMENTARA dengan perekam supaya uji tidak memanggil
 * provider (tidak ada kuota terpakai), lalu dikembalikan di akhir. Yang direkam
 * adalah argumen asli jalur kirim, jadi C2 menguji string yang benar-benar akan
 * dikirim, bukan tebakan dari DOM.
 *
 * Setiap blok dibungkus IIFE: `runAsync` mengevaluasi di scope global, jadi dua
 * `const` dengan nama sama di dua panggilan adalah SyntaxError.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

const siapkan = async () => {
  for (let i = 0; i < 12; i += 1) {
    await cdp.eval(`window.__ZEPHYR__.getState().setActivity('ai')`);
    await new Promise((r) => setTimeout(r, 500));
    const ada = await cdp.eval(`!!document.querySelector('[data-testid="ai-input"]')`);
    if (ada) return;
  }
  throw new Error('composer AI tidak muncul');
};

const ketikDraft = (teks) =>
  cdp.runAsync(
    `(() => {
      const ta = document.querySelector('[data-testid="ai-input"]');
      if (!ta) return 'tidak ada composer';
      const sp = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      sp.call(ta, ${JSON.stringify(teks)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      return 'ok';
    })()`,
    8000,
  );

const baca = async () =>
  JSON.parse(
    await cdp.eval(`JSON.stringify({
      draft: document.querySelector('[data-testid="ai-input"]')?.value ?? null,
      chip: [...document.querySelectorAll('[data-testid="ai-refstrip"] .ai-ref-chip-pesan')].map((c) => c.getAttribute('data-ref')),
      popup: !!document.querySelector('.ai-slash.is-ref'),
    })`),
  );

const pilih = async (kategori) => {
  await ketikDraft('');
  await ketikDraft('@');
  await new Promise((r) => setTimeout(r, 900));
  await cdp.runAsync(
    `(() => {
      document.querySelector('[data-testid="ai-ref-menu-${kategori}"]')?.click();
      return 'ok';
    })()`,
    10000,
  );
  await new Promise((r) => setTimeout(r, 600));
  await cdp.runAsync(
    `(() => {
      document.querySelector('[data-testid="ai-file-list"] .ai-slash-item')?.click();
      return 'ok';
    })()`,
    10000,
  );
  await new Promise((r) => setTimeout(r, 700));
};

await siapkan();

await pilih('file');
const hasilPick = await baca();
console.log('C1', JSON.stringify(hasilPick));

/* Ketik satu kalimat di sebelah chip, lalu rekam jalur kirim. */
await ketikDraft('tolong jelaskan berkas ini');
await cdp.runAsync(
  `(() => {
    const S = window.__ZEPHYR_AI__.store;
    window.__KIRIM_ASLI__ = S.getState().kirimSekarang;
    S.setState({ kirimSekarang: (t, i, c) => { window.__KIRIM__ = { t, i, c }; return Promise.resolve(); } });
    return 'ok';
  })()`,
  10000,
);
await cdp.runAsync(
  `(() => {
    document.querySelector('[data-testid="ai-send"]')?.click();
    return 'ok';
  })()`,
  10000,
);
await new Promise((r) => setTimeout(r, 600));
const kirim = JSON.parse(await cdp.eval(`JSON.stringify(window.__KIRIM__ ?? null)`));
const sesudahKirim = await baca();
await cdp.runAsync(
  `(() => {
    const S = window.__ZEPHYR_AI__.store;
    if (window.__KIRIM_ASLI__) S.setState({ kirimSekarang: window.__KIRIM_ASLI__ });
    return 'ok';
  })()`,
  10000,
);

/* C3: chip baru, lalu dihapus lewat tombol ✕. */
await pilih('folder');
const sebelumHapus = await baca();
await cdp.runAsync(
  `(() => {
    document.querySelector('[data-testid="ai-refstrip"] .ai-ref-chip-pesan-x')?.click();
    return 'ok';
  })()`,
  10000,
);
await new Promise((r) => setTimeout(r, 400));
const sesudahHapus = await baca();

/* C4: Backspace di draft kosong. */
await pilih('file');
const sebelumBackspace = await baca();
await cdp.runAsync(
  `(() => {
    const ta = document.querySelector('[data-testid="ai-input"]');
    ta.focus();
    ta.setSelectionRange(0, 0);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    return 'ok';
  })()`,
  10000,
);
await new Promise((r) => setTimeout(r, 500));
const sesudahBackspace = await baca();

await ketikDraft('');

console.log(
  JSON.stringify(
    { hasilPick, kirim, sesudahKirim, sebelumHapus, sesudahHapus, sebelumBackspace, sesudahBackspace },
    null,
    1,
  ),
);

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

cek(
  'C1 memilih referensi: chip muncul, draft bersih dari "@path"',
  hasilPick.chip.length === 1 &&
    hasilPick.popup === false &&
    !String(hasilPick.draft).includes('@') &&
    String(hasilPick.chip[0]).length > 0,
  JSON.stringify(hasilPick),
);
cek(
  'C2 yang dikirim = referensi (dikutip bila berspasi) + kalimat',
  !!kirim &&
    /^@"?.+"?/m.test(String(kirim.t)) &&
    String(kirim.t).includes(hasilPick.chip[0]) &&
    String(kirim.t).includes('tolong jelaskan berkas ini'),
  JSON.stringify(kirim),
);
cek('C3 tombol ✕ menghapus chip', sebelumHapus.chip.length === 1 && sesudahHapus.chip.length === 0, JSON.stringify(sesudahHapus));
cek(
  'C4 Backspace di draft kosong menghapus chip terakhir',
  sebelumBackspace.chip.length === 1 && sesudahBackspace.chip.length === 0,
  JSON.stringify(sesudahBackspace),
);
cek('C5 strip kosong setelah kirim', sesudahKirim.chip.length === 0, JSON.stringify(sesudahKirim.chip));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
keluarBersih(gagal === 0 ? 0 : 1);
