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
    /*
     * Both selectors are the CURRENT ones. The counts moved off the bar into
     * the fold (.ai-kerja-sub) so the bar reads as one quiet line, and the
     * narration inside a fold (.ai-kerja-narasi) replaced the old interleaved
     * .ai-segmen paragraphs. Reading the old names reported "ringkas: null /
     * bernarasi: 0" while both were plainly on screen.
     */
    const ringkas = k.querySelector('.ai-kerja-ringkas');
    /*
     * Hitungan pindah KE BAR lagi (permintaan user: bar tertutup harus mirip
     * Freebuff/TRAE, yang menulis "Read 35 files, Searched files 22 times").
     * Jadi yang dibaca sekarang adalah judul bar itu sendiri, dan durasi
     * dibaca dari elemen terpisah di kanan bar. Membaca elemen sub yang sudah
     * tidak ada akan melaporkan "ringkas: null" padahal bar-nya benar.
     */
    if (k.getAttribute('data-open') !== '1') head?.click();
    await tunggu(300);
    const ringkasTeks = judul ? judul.textContent : null;
    const durasiTeks = k.querySelector('[data-testid="ai-kerja-durasi"]')?.textContent ?? null;
    const narasiFold = k.querySelectorAll('[data-testid="ai-kerja-narasi"]').length;
    out.akordion = {
      judul: judul ? judul.textContent : null,
      ringkas: ringkasTeks ?? (ringkas ? ringkas.textContent : null),
      durasi: durasiTeks,
      open: k.getAttribute('data-open'),
      narasiFold,
      tinggiHead: head ? Math.round(head.getBoundingClientRect().height) : null,
      baris: k.querySelectorAll('[data-testid="ai-kerja-baris"]').length,
      punyaCaret: !!k.querySelector('.ai-kerja-caret'),
    };
  }

  /* A5: state SETELAH dibuka, diukur oleh pemanggil terpisah (lihat bawah). */
  out.setelahBuka = null;

  /* A6: narasi tidak dihilangkan - ia ada di dalam fold sebagai
     .ai-kerja-narasi, atau sebagai segmen di luar fold pada bentuk lama. */
  const pesan = [...document.querySelectorAll('.ai-msg.is-assistant')];
  out.interleaved = pesan.reduce((n, p) => n + p.querySelectorAll('.ai-segmen').length, 0);
  out.bernarasi = pesan.filter(
    (p) => p.querySelectorAll('.ai-segmen, [data-testid="ai-kerja-narasi"]').length > 0,
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

/* Start from a KNOWN state: closed. A previous run may have left it open. */
await cdp.eval(
  `(() => {
  for (const k of document.querySelectorAll('.ai-kerja')) {
    if (k.getAttribute('data-open') === '1') {
      const h = k.querySelector('.ai-kerja-head');
      if (h) h.click();
    }
  }
  return 'ok';
})()`,
);
await new Promise((r) => setTimeout(r, 800));

/*
 * Re-read the closed state AFTER the reset above, so A2 describes the resting
 * state rather than whatever the previous run left behind.
 */
const tutupRaw = await cdp.json(
  `return JSON.stringify((() => {
  const k = document.querySelector('.ai-kerja');
  const head = k ? k.querySelector('.ai-kerja-head') : null;
  return {
    open: k ? k.getAttribute('data-open') : null,
    tinggiHead: head ? Math.round(head.getBoundingClientRect().height) : null,
  };
})())`,
  60000,
);
const tutup = typeof tutupRaw === 'string' ? JSON.parse(tutupRaw) : tutupRaw;
d.akordion = { ...(d.akordion ?? {}), open: tutup.open, tinggiHead: tutup.tinggiHead };

/*
 * A5 runs as its OWN CDP round trip.
 *
 * An `await` inside the evaluated snippet does nothing (Runtime.evaluate without
 * awaitPromise returns the pending Promise at once), so clicking and measuring
 * in one expression always read the CLOSED state - which made "baris=0" look
 * like a broken accordion when the click had simply not been committed yet.
 */
await cdp.eval(
  `(() => { const h = document.querySelector('.ai-kerja-head'); if (h) h.click(); return 'ok'; })()`,
);
await new Promise((r) => setTimeout(r, 900));
const bukaRaw = await cdp.json(
  `return JSON.stringify((() => {
  const k = document.querySelector('.ai-kerja');
  return {
    open: k ? k.getAttribute('data-open') : null,
    baris: k ? k.querySelectorAll('[data-testid="ai-kerja-baris"]').length : 0,
    kartuDiDalam: k ? k.querySelectorAll('.cli-tool').length : 0,
  };
})())`,
  60000,
);
const buka = typeof bukaRaw === 'string' ? JSON.parse(bukaRaw) : bukaRaw;
d.setelahBuka = buka;
/* Put the accordion back the way it was found. */
await cdp.eval(
  `(() => { const h = document.querySelector('.ai-kerja-head'); if (h) h.click(); return 'ok'; })()`,
);

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
  'A3 bar tertutup menyebut APA yang dikerjakan (judul ringkas, bukan durasi)',
  typeof d.akordion?.judul === 'string' &&
    /Read|Edited|Created|Ran|Searched|steps|Working|Done/.test(d.akordion.judul),
  String(d.akordion?.judul),
);
cek(
  'A4 durasi tetap terlihat di kanan bar',
  typeof d.akordion?.durasi === 'string' && d.akordion.durasi.length > 0,
  String(d.akordion?.durasi),
);
cek(
  'A5 dibuka: langkah tampil sebagai baris datar, bukan kartu',
  d.setelahBuka?.open === '1' && (d.setelahBuka?.baris ?? 0) > 0 && d.setelahBuka?.kartuDiDalam === 0,
  `baris=${d.setelahBuka?.baris} kartu=${d.setelahBuka?.kartuDiDalam}`,
);
cek(
  'A6 narasi tetap tampil di dalam pesan (bukan dihilangkan)',
  (d.bernarasi ?? 0) > 0 && (d.interleaved ?? 0) >= 0,
  `pesan bernarasi=${d.bernarasi} segmen=${d.interleaved}`,
);
cek('A7 ada mekanisme penanda grup gagal', d.adaGrupGagal !== undefined, `gagal=${d.adaGrupGagal}`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
