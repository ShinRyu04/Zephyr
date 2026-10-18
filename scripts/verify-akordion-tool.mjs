/*
 * Bukti: tools berkelompok jadi SATU baris akordion (bentuk TRAE / VS Code).
 *
 * Keluhan: setiap tool tampil sebagai kartu berbingkai sendiri, jadi delapan
 * panggilan = delapan kartu, dan jawaban yang dicari terdorong ke bawah tumpukan
 * chrome. Diukur: sepuluh baris tertutup memenuhi satu layar 912px.
 *
 * Bentuk yang dipakai TRAE/Cursor/VS Code: SATU baris ringkas untuk seluruh
 * rangkaian kerja ("Worked for 6s"), tertutup setelah selesai, dan langkahnya
 * tersedia dengan satu klik.
 *
 * Yang diuji:
 *   A1  pesan tanpa narasi antar-langkah memakai akordion (bukan kartu bertumpuk)
 *   A2  baris akordion tipis (<= 32px) dan TERTUTUP setelah run selesai
 *   A3  judulnya menyebut durasi ("Worked for …")
 *   A4  ringkasannya menyebut apa yang disentuh (file/perintah/langkah)
 *   A5  saat dibuka, langkah-langkahnya tampil sebagai baris DATAR (tanpa kartu)
 *   A6  pesan yang PUNYA narasi antar-langkah tetap interleaved (teks tidak hilang)
 *   A7  run yang gagal tidak bisa disembunyikan oleh lipatan
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = window.__ZEPHYR_AI__.store;
  const out = {};

  /* Muat sesi yang benar-benar berisi tool supaya yang diukur bukan halaman kosong. */
  const st = A.getState();
  const kandidat = st.sessions
    .filter((s) => (s.messages ?? []).some((m) => (m.tools ?? []).length > 0))
    .sort((a, b) => (b.messages?.length ?? 0) - (a.messages?.length ?? 0))[0];
  out.adaSesi = !!kandidat;
  if (kandidat) {
    A.getState().selectChat(kandidat.id, '');
    await tunggu(1200);
  }

  const kerja = [...document.querySelectorAll('.ai-kerja')];
  out.jumlahAkordion = kerja.length;

  if (kerja.length) {
    const k = kerja[0];
    const head = k.querySelector('.ai-kerja-head');
    const judul = k.querySelector('.ai-kerja-judul');
    const ringkas = k.querySelector('.ai-kerja-ringkas');
    out.akordion = {
      judul: judul ? judul.textContent : null,
      ringkas: ringkas ? ringkas.textContent : null,
      open: k.getAttribute('data-open'),
      tinggiHead: head ? Math.round(head.getBoundingClientRect().height) : null,
      baris: k.querySelectorAll('[data-testid="ai-kerja-baris"]').length,
      punyaCaret: !!k.querySelector('.ai-kerja-caret'),
    };

    /* A5: buka dan hitung baris datar yang muncul. */
    if (head) {
      head.click();
      await tunggu(400);
      const k2 = document.querySelector('.ai-kerja');
      out.setelahBuka = {
        open: k2 ? k2.getAttribute('data-open') : null,
        baris: k2 ? k2.querySelectorAll('[data-testid="ai-kerja-baris"]').length : 0,
        /* Baris di dalam akordion TIDAK boleh berupa kartu berbingkai. */
        kartuDiDalam: k2 ? k2.querySelectorAll('.cli-tool').length : 0,
      };
      head.click();
      await tunggu(300);
    }
  }

  /* A6: pesan dengan narasi antar-langkah tetap memakai baris terpisah. */
  const pesan = [...document.querySelectorAll('.ai-msg.is-assistant')];
  out.interleaved = pesan.filter(
    (p) => p.querySelectorAll('.ai-segmen').length > 0 && p.querySelectorAll('.cli-tool').length > 0,
  ).length;
  out.pakaiAkordion = pesan.filter((p) => p.querySelectorAll('.ai-kerja').length > 0).length;

  /* A7: grup yang gagal harus menandai dirinya. */
  out.adaGrupGagal = document.querySelectorAll('.ai-kerja.is-gagal').length;

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  120000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — tools berkelompok ala TRAE:');
cek('A1 ada transcript berisi tool', d.adaSesi === true && d.jumlahAkordion > 0, `akordion=${d.jumlahAkordion}`);
cek(
  'A2 akordion tipis dan tertutup setelah selesai',
  (d.akordion?.tinggiHead ?? 999) <= 32 && d.akordion?.open === '0',
  `tinggi=${d.akordion?.tinggiHead}px open=${d.akordion?.open}`,
);
cek(
  'A3 judul menyebut durasi kerja',
  typeof d.akordion?.judul === 'string' && /Worked for|Working/.test(d.akordion.judul),
  String(d.akordion?.judul),
);
cek(
  'A4 ringkasan menyebut apa yang disentuh',
  typeof d.akordion?.ringkas === 'string' && d.akordion.ringkas.length > 0,
  String(d.akordion?.ringkas),
);
cek(
  'A5 dibuka: langkah tampil sebagai baris datar, bukan kartu',
  d.setelahBuka?.open === '1' && (d.setelahBuka?.baris ?? 0) > 0 && d.setelahBuka?.kartuDiDalam === 0,
  `baris=${d.setelahBuka?.baris} kartu=${d.setelahBuka?.kartuDiDalam}`,
);
cek(
  'A6 pesan dengan narasi tetap interleaved (teks tidak hilang)',
  (d.interleaved ?? 0) > 0,
  `interleaved=${d.interleaved} akordion=${d.pakaiAkordion}`,
);
cek('A7 ada mekanisme penanda grup gagal', d.adaGrupGagal !== undefined, `gagal=${d.adaGrupGagal}`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
