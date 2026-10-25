/*
 * Verifikasi popup `@` (bentuk bertingkat seperti TRAE) + tidak ada kotak tool.
 *
 * Bukti diambil dari DOM yang HIDUP, bukan dari modul yang diimpor: harness
 * mengetik "@" di composer sungguhan lalu membaca apa yang tampil.
 *
 *   P1  "@" membuka MENU kategori (File/Folder/Rule/Agent), bukan list campur
 *   P2  tidak ada chip filter lagi (chip-lah yang mengunci filter di depan)
 *   P3  memilih satu kategori membuka daftarnya, dan judulnya menamai kategori
 *   P4  tombol kembali mengembalikan layar menu
 *   P5  Escape menutup popup (dan kategori + kata kunci ikut hilang)
 *   P6  buka-tutup 10x: popup selalu kembali ke menu yang bersih ("nyangkut")
 *   P7  folder disisip dengan garis miring (`@src/lib/`)
 *   P8  tidak ada satu pun `.cli-tool` di seluruh sesi (bukan cuma yang aktif)
 *
 * Dijalankan bertahap, satu `runAsync` per tahap: satu blok raksasa melewati
 * batas waktu CDP di app ini dan mengembalikan "tidak ada jawaban".
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const hasil = {};

const tahap = async (nama, body, ms = 60000) => {
  try {
    hasil[nama] = await cdp.runAsync(body, ms);
  } catch (e) {
    hasil[nama] = { fatal: e.message };
  }
};

const BUKA = `
  const input = document.querySelector('[data-testid="ai-input"]');
  if (!input) return { fatal: 'composer tidak ada' };
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  /*
   * Dipasang ULANG tiap tahap, bukan sekali. Helper dulu dijaga "kalau belum
   * ada", dan app yang sudah pernah menjalankan harness versi lama memakai
   * fungsi LAMA itu - selector yang sudah diperbaiki tidak pernah terpakai, dan
   * uji melaporkan gagal padahal aplikasinya benar.
   */
  window.__VPA_KETIK__ = (teks) => {
    setter.call(input, teks);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.setSelectionRange(teks.length, teks.length);
    input.dispatchEvent(new Event('select', { bubbles: true }));
  };
  window.__VPA_ESC__ = (el) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  /* The category menu is the popup's first screen; .ai-ref-menu-item is its row. */
  window.__VPA_MENU__ = () => [...document.querySelectorAll('.ai-ref-menu-item')];
  window.__VPA_LAYAR__ = () =>
    document.querySelector('.ai-slash.is-ref')?.getAttribute('data-layar') ?? null;
`;

await tahap(
  'p1',
  `${BUKA}
  input.focus();
  window.__VPA_KETIK__('@');
  await wait(1000);
  return {
    buka: !!document.querySelector('[data-pemicu="ref"]'),
    layar: window.__VPA_LAYAR__(),
    jenisTampil: window.__VPA_MENU__().map((b) => b.getAttribute('data-testid')),
    adaChip: document.querySelectorAll('.ai-ref-chip, .ai-ref-chips').length,
    baris: document.querySelectorAll('.ai-slash.is-ref .ai-slash-item').length,
    kepala: document.querySelectorAll('.ai-kerja-live').length,
  };`,
);

await tahap(
  'p3',
  `${BUKA}
  const awal = window.__VPA_LAYAR__();
  window.__VPA_MENU__()[0]?.click();
  await wait(700);
  const jenis = (window.__VPA_MENU__()[0]?.getAttribute('data-testid') ?? '').replace('ai-ref-menu-', '') || 'file';
  const judul = document.querySelector('[data-testid="ai-ref-judul"]')?.textContent?.trim() ?? null;
  const baris = [...document.querySelectorAll('[data-testid="ai-file-list"] .ai-slash-item')];
  const uji = baris.map((b) => b.getAttribute('data-testid') ?? '');
  const semuaSatuJenis = uji.length > 0 && uji.every((t) => t.startsWith('ai-ref-' + jenis + '-'));
  const layarSempit = window.__VPA_LAYAR__();
  window.__VPA_ESC__(document.querySelector('[data-testid="ai-ref-cari"]') ?? input);
  await wait(300);
  /* Kosongkan dulu: menulis "@" di atas "@" tidak mengubah draft, jadi popup
     yang sudah ditutup Escape tidak akan terbuka lagi dan P4 mengukur layar
     kosong. */
  window.__VPA_KETIK__('');
  await wait(160);
  window.__VPA_KETIK__('@');
  await wait(700);
  const layarLagi = window.__VPA_LAYAR__();
  window.__VPA_MENU__()[0]?.click();
  await wait(500);
  const kembali = !!document.querySelector('[data-testid="ai-ref-kembali"]');
  document.querySelector('[data-testid="ai-ref-kembali"]')?.click();
  await wait(600);
  const layarPulang = window.__VPA_LAYAR__();
  return { awal, jenis, judul, baris: baris.length, semuaSatuJenis, layarSempit, layarLagi, kembali, layarPulang };`,
);

/* P5: Escape menutup popup, lalu buka lagi dengan "@ " di belakangnya -
   persis seperti orang mengetik setelah Escape (composer masih berisi "@"),
   dan itu dulu membuka popup kosong dengan "@@" di pesan. */
await tahap(
  'p5',
  `${BUKA}
  window.__VPA_MENU__()[0]?.click();
  await wait(400);
  const cari = document.querySelector('[data-testid="ai-ref-cari"]');
  window.__VPA_ESC__(cari ?? input);
  await wait(500);
  const tutup = !document.querySelector('[data-pemicu="ref"]');
  /* Karakter sebelum "@" kedua adalah "@" (berspasi) - itulah bentuk "pembaca
     mengetik @ lagi setelah Escape", dan itu yang dulu membuka popup kosong
     plus "@@" di pesan. */
  window.__VPA_KETIK__(input.value + ' @');
  await wait(900);
  const isiSetelah = input.value;
  const sesudahBukaLagi = window.__VPA_MENU__().length;
  const layarLagi = window.__VPA_LAYAR__();
  const cariLagi = document.querySelector('[data-testid="ai-ref-cari"]');
  window.__VPA_ESC__(cariLagi ?? input);
  await wait(300);
  window.__VPA_KETIK__('');
  await wait(300);
  return {
    tutup,
    sesudahBukaLagi,
    layarLagi,
    isiSetelah,
    cariKosong: !cariLagi || cariLagi.value === '',
  };`,
);

await tahap(
  'p6',
  `${BUKA}
  let bersih = 0;
  for (let i = 0; i < 10; i += 1) {
    /* Tiap putaran mulai dari composer kosong, seperti pembaca yang mengosongkan
       pesannya - lalu mengetik "@", MASUK ke satu kategori, dan keluar dengan
       Escape. */
    window.__VPA_KETIK__('');
    await wait(160);
    window.__VPA_KETIK__('@');
    await wait(420);
    window.__VPA_MENU__()[0]?.click();
    await wait(180);
    const cari = document.querySelector('[data-testid="ai-ref-cari"]');
    window.__VPA_ESC__(cari ?? input);
    await wait(260);
    window.__VPA_KETIK__('');
    await wait(120);
    window.__VPA_KETIK__('@');
    await wait(420);
    const menu = window.__VPA_MENU__().length;
    const layar = window.__VPA_LAYAR__();
    const c = document.querySelector('[data-testid="ai-ref-cari"]');
    if (menu >= 2 && layar === 'menu' && (!c || c.value === '')) bersih += 1;
    window.__VPA_ESC__(document.querySelector('[data-testid="ai-ref-cari"]') ?? input);
    await wait(200);
  }
  window.__VPA_KETIK__('');
  await wait(200);
  return { putaran: 10, bersih };`,
  120000,
);

await tahap(
  'p7',
  `
  const mod = await import('/src/lib/contextRefs.ts');
  const semua = await mod.muatRef();
  const folder = semua.filter((r) => r.jenis === 'folder');
  return {
    total: semua.length,
    folder: folder.length,
    semuaSlash: folder.length > 0 && folder.every((f) => f.sisip.endsWith('/')),
    contoh: folder.slice(0, 3).map((f) => f.sisip),
  };`,
);

/* P8: satu sesi per panggilan, supaya tidak menembus batas waktu. */
const st = await cdp.eval(
  `JSON.stringify(window.__ZEPHYR_AI__.store.getState().sessions.map((s) => s.id))`,
);
const ids = JSON.parse(st);
hasil.p8 = { sesi: ids.length, kartu: 0, dicek: 0 };
for (const id of ids) {
  const r = await tahap(
    `p8-${id}`,
    `
    const A = window.__ZEPHYR_AI__.store;
    A.getState().selectChat(${JSON.stringify(id)}, '');
    await wait(900);
    for (const head of document.querySelectorAll('[data-testid="ai-kerja-toggle"]')) {
      if (head.getAttribute('aria-expanded') !== 'true') head.click();
    }
    await wait(320);
    return { kartu: document.querySelectorAll('[data-testid="ai-msg"] .cli-tool').length };
    `,
    60000,
  );
  hasil.p8.kartu += r?.kartu ?? 0;
  hasil.p8.dicek += 1;
}

console.log(JSON.stringify(hasil, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

const p1 = hasil.p1 ?? {};
const p3 = hasil.p3 ?? {};
const p5 = hasil.p5 ?? {};
const p6 = hasil.p6 ?? {};
const p7 = hasil.p7 ?? {};

console.log('\nBukti — popup @ dan kotak tool:');
cek(
  'P1 "@" membuka MENU kategori',
  p1.buka === true && p1.layar === 'menu' && (p1.jenisTampil ?? []).length >= 2,
  `layar=${p1.layar} ${p1.jenisTampil}`,
);
cek('P2 tidak ada chip filter lagi', p1.adaChip === 0, `chip=${p1.adaChip}`);
cek(
  'P3 memilih kategori membuka daftarnya, hanya jenis itu',
  p3.layarSempit === 'daftar' && p3.semuaSatuJenis === true && !!p3.judul,
  `layar=${p3.layarSempit} jenis=${p3.jenis} judul="${p3.judul}" baris=${p3.baris}`,
);
cek(
  'P4 tombol kembali mengembalikan layar menu',
  p3.kembali === true && p3.layarPulang === 'menu',
  `kembali=${p3.kembali} layar=${p3.layarPulang}`,
);
cek(
  'P5 Escape menutup popup, dan "@ " berikutnya kembali ke menu bersih',
  p5.tutup === true && p5.sesudahBukaLagi >= 2 && p5.layarLagi === 'menu' && p5.cariKosong === true,
  JSON.stringify(p5),
);
cek('P6 buka-tutup 10x tetap bersih', p6.bersih === 10, `bersih=${p6.bersih}/10 ${p6.fatal ?? ''}`);
cek('P7 folder disisip dengan garis miring', p7.semuaSlash === true, JSON.stringify(p7.contoh));
cek(
  'P8 tidak ada kotak tool di sesi mana pun',
  hasil.p8.kartu === 0,
  `sesi=${hasil.p8.sesi} dicek=${hasil.p8.dicek} kartu=${hasil.p8.kartu}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal === 0 ? 0 : 1);
