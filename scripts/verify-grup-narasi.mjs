/*
 * Bukti: narasi MEMBUKA kelompok baru, dan tiap kelompok jadi akordion sendiri.
 *
 * Keluhan (dengan screenshot): satu kalimat narasi sudah cukup membuat seluruh
 * pesan kembali ke tampilan kartu, sehingga tiga perintah shell setelah kalimat
 * itu menumpuk jadi tiga kotak berbingkai:
 *
 *     Read package.json
 *     Run  if exist ...
 *     "Electron sudah terpasang, jadi langsung saya jalankan npm start..."
 *     [kartu] Run start "" cmd ...      <- ini yang harusnya satu baris
 *     [kartu] Run timeout /t 4 ...
 *     [kartu] Run type dev-run.log ...
 *
 * Bentuk yang benar (TRAE): kalimat MEMBUKA kelompok, dan tiap kelompok melipat
 * jadi satu baris "Worked for Xs". Narasi tetap terlihat; panggilan di bawahnya
 * tidak pernah jadi kartu.
 *
 * Yang diuji di app hidup:
 *   G1  ada pesan yang berisi narasi DAN tools
 *   G2  pesan itu TIDAK punya satu pun kartu berbingkai (.cli-tool)
 *   G3  ia punya >= 1 akordion
 *   G4  narasinya tetap tampil (.ai-segmen ada)
 *   G5  akordion tipis (<= 32px) dan tertutup setelah run selesai
 *   G6  dibuka: langkah jadi baris datar, bukan kartu
 *   G7  pesan tanpa narasi pun tetap akordion (bukan kartu)
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = window.__ZEPHYR_AI__.store;
  const out = {};

  /* Muat sesi terbesar yang berisi tools, supaya yang diukur bukan halaman kosong. */
  const st = A.getState();
  const kandidat = st.sessions
    .filter((s) => (s.messages ?? []).some((m) => (m.tools ?? []).length > 0))
    .sort((a, b) => (b.messages?.length ?? 0) - (a.messages?.length ?? 0))[0];
  out.adaSesi = !!kandidat;
  if (kandidat) {
    A.getState().selectChat(kandidat.id, '');
    await tunggu(1500);
  }

  const pesan = [...document.querySelectorAll('.ai-msg.is-assistant')];
  const denganTool = pesan.filter(
    (p) => p.querySelector('.ai-kerja') || p.querySelector('.cli-tool'),
  );

  out.rincian = denganTool.map((p) => ({
    akordion: p.querySelectorAll('.ai-kerja').length,
    kartu: p.querySelectorAll('.cli-tool').length,
    segmen: p.querySelectorAll('.ai-segmen').length,
    judul: [...p.querySelectorAll('.ai-kerja-judul')].map((x) => x.textContent),
  }));

  /* G1..G4: pesan yang bernarasi (segmen > 0) tidak boleh punya kartu. */
  const bernarasi = out.rincian.filter((r) => r.segmen > 0 && r.akordion + r.kartu > 0);
  out.bernarasi = bernarasi;
  out.bernarasiTanpaKartu = bernarasi.length > 0 && bernarasi.every((r) => r.kartu === 0);
  out.bernarasiPunyaAkordion = bernarasi.length > 0 && bernarasi.every((r) => r.akordion > 0);

  /* G5: ukuran bar akordion. */
  const kerja = [...document.querySelectorAll('.ai-kerja')];
  out.akordionTotal = kerja.length;
  if (kerja.length) {
    const k = kerja[0];
    const head = k.querySelector('.ai-kerja-head');
    out.akordion = {
      open: k.getAttribute('data-open'),
      tinggiHead: head ? Math.round(head.getBoundingClientRect().height) : null,
      judul: k.querySelector('.ai-kerja-judul')?.textContent ?? null,
    };
    if (head) {
      head.click();
      await tunggu(400);
      const k2 = document.querySelector('.ai-kerja');
      out.setelahBuka = {
        open: k2 ? k2.getAttribute('data-open') : null,
        baris: k2 ? k2.querySelectorAll('[data-testid="ai-kerja-baris"]').length : 0,
        kartuDiDalam: k2 ? k2.querySelectorAll('.cli-tool').length : 0,
      };
      head.click();
      await tunggu(250);
    }
  }

  /* G7: pesan TANPA narasi juga harus akordion, bukan kartu. */
  const tanpaNarasi = out.rincian.filter((r) => r.segmen === 0 && r.akordion + r.kartu > 0);
  out.tanpaNarasi = tanpaNarasi;
  out.tanpaNarasiAkordion = tanpaNarasi.length === 0 || tanpaNarasi.every((r) => r.akordion > 0);

  out.kartuTotal = document.querySelectorAll('.cli-tool').length;
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

console.log('\nBukti — narasi membuka kelompok, tiap kelompok jadi akordion:');
cek('G1 ada transcript berisi tool', d.adaSesi === true && (d.akordionTotal ?? 0) > 0, `akordion=${d.akordionTotal}`);
cek(
  'G2 pesan bernarasi TIDAK punya kartu berbingkai',
  d.bernarasiTanpaKartu === true,
  `bernarasi=${d.bernarasi?.length} kartu=${d.bernarasi?.map((r) => r.kartu).join(',')}`,
);
cek(
  'G3 pesan bernarasi punya akordion',
  d.bernarasiPunyaAkordion === true,
  `akordion=${d.bernarasi?.map((r) => r.akordion).join(',')}`,
);
cek(
  'G4 narasi tetap tampil',
  (d.bernarasi?.length ?? 0) > 0 && d.bernarasi.every((r) => r.segmen > 0),
  `segmen=${d.bernarasi?.map((r) => r.segmen).join(',')}`,
);
cek(
  'G5 akordion tipis dan tertutup setelah selesai',
  (d.akordion?.tinggiHead ?? 999) <= 32 && d.akordion?.open === '0',
  `tinggi=${d.akordion?.tinggiHead}px open=${d.akordion?.open}`,
);
cek(
  'G6 dibuka: langkah jadi baris datar, bukan kartu',
  d.setelahBuka?.open === '1' && (d.setelahBuka?.baris ?? 0) > 0 && d.setelahBuka?.kartuDiDalam === 0,
  `baris=${d.setelahBuka?.baris} kartu=${d.setelahBuka?.kartuDiDalam}`,
);
cek(
  'G7 pesan tanpa narasi juga akordion',
  d.tanpaNarasiAkordion === true,
  `jumlah=${d.tanpaNarasi?.length ?? 0}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
