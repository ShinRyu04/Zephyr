/*
 * Verifikasi popup `/`: kotak cari benar-benar menyaring, dan tidak ada sisa.
 *
 *   S1  mengetik "rev" di kotak cari menyempitkan daftar ke perintah yang cocok
 *   S2  memilih perintah: composer berisi `/cmd `, popup TERTUTUP, kata kunci hilang
 *   S3  membuka `/` lagi: kotak cari kosong dan daftar penuh (bukan tersaring kata lama)
 *   S4  menghapus `/` dari composer menutup popup walau kotak cari masih berisi
 *   S5  kata kunci tanpa hasil menampilkan pesan kosong, bukan daftar penuh
 *
 * Bukti diambil dari DOM hidup; angka yang dilaporkan (jumlah baris, isi field,
 * isi composer) adalah nilai sesudah aksi, bukan yang diharapkan.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
await cdp.eval(`window.__ZEPHYR__.getState().setActivity('ai')`);
await new Promise((r) => setTimeout(r, 1200));

const hasil = {};

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

const ketikCari = (teks) =>
  cdp.runAsync(
    `(() => {
      const i = document.querySelector('[data-testid="ai-slash-cari"]');
      if (!i) return 'tidak ada field';
      const sp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      sp.call(i, ${JSON.stringify(teks)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`,
    8000,
  );

const baca = async () =>
  JSON.parse(
    await cdp.eval(`JSON.stringify({
      popup: !!document.querySelector('[data-testid="ai-slash"]'),
      cari: document.querySelector('[data-testid="ai-slash-cari"]')?.value ?? null,
      baris: [...document.querySelectorAll('[data-testid="ai-slash"] .ai-slash-item')].map((b) => b.textContent.trim()),
      draft: document.querySelector('[data-testid="ai-input"]')?.value ?? null,
      kosong: !!document.querySelector('[data-testid="ai-slash-empty"]'),
    })`),
  );

await ketikDraft('');
await ketikDraft('/');
await new Promise((r) => setTimeout(r, 700));
hasil.penuh = await baca();

await ketikCari('rev');
await new Promise((r) => setTimeout(r, 500));
hasil.saring = await baca();

await cdp.runAsync(
  `document.querySelector('[data-testid="ai-slash"] .ai-slash-item')?.click(); await wait(600); return 'ok'`,
  15000,
);
hasil.sesudahPilih = await baca();

await ketikDraft('');
await ketikDraft('/');
await new Promise((r) => setTimeout(r, 700));
hasil.bukaLagi = await baca();

await ketikCari('rev');
await new Promise((r) => setTimeout(r, 400));
await ketikDraft('hello');
await new Promise((r) => setTimeout(r, 600));
hasil.hapusSlash = await baca();

await ketikDraft('');
await ketikDraft('/');
await new Promise((r) => setTimeout(r, 700));
await ketikCari('zzz');
await new Promise((r) => setTimeout(r, 500));
hasil.tanpaHasil = await baca();

await ketikCari('rev');
await new Promise((r) => setTimeout(r, 300));
await cdp.eval(
  `document.querySelector('[data-testid="ai-input"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`,
);
await ketikDraft('');
await new Promise((r) => setTimeout(r, 300));

console.log(JSON.stringify(hasil, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

cek(
  'S1 kotak cari menyaring daftar',
  hasil.saring.baris.length === 1 && /review/.test(hasil.saring.baris[0]),
  `${hasil.penuh.baris.length} -> ${hasil.saring.baris.length}: ${JSON.stringify(hasil.saring.baris)}`,
);
cek(
  'S2 memilih perintah menutup popup dan membuang kata kunci',
  hasil.sesudahPilih.popup === false &&
    hasil.sesudahPilih.cari === null &&
    (hasil.sesudahPilih.draft ?? '').startsWith('/review'),
  JSON.stringify(hasil.sesudahPilih),
);
cek(
  'S3 membuka / lagi bersih (tidak tersaring kata lama)',
  hasil.bukaLagi.popup === true &&
    hasil.bukaLagi.cari === '' &&
    hasil.bukaLagi.baris.length === hasil.penuh.baris.length,
  `cari="${hasil.bukaLagi.cari}" baris=${hasil.bukaLagi.baris.length}/${hasil.penuh.baris.length}`,
);
cek(
  'S4 menghapus "/" menutup popup walau kotak cari berisi',
  hasil.hapusSlash.popup === false,
  JSON.stringify({ popup: hasil.hapusSlash.popup, draft: hasil.hapusSlash.draft, cari: hasil.hapusSlash.cari }),
);
cek(
  'S5 tanpa hasil menampilkan pesan kosong',
  hasil.tanpaHasil.kosong === true && hasil.tanpaHasil.baris.length === 0,
  JSON.stringify(hasil.tanpaHasil),
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
keluarBersih(gagal === 0 ? 0 : 1);
