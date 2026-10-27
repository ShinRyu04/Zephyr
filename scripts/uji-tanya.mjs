/*
 * Kartu pertanyaan agen (tool `ask_user`) - FORM BERTAHAP.
 *
 * Yang diperiksa: kartu muncul lewat jalur aslinya (`agentAjukanTanya`),
 * judulnya pertanyaan langkah itu, counter `n/m` benar, navigasi antar langkah
 * jalan, keempat tipe field merender kontrol yang tepat, jawaban terkumpul jadi
 * SATU ringkasan bernomor saat dikirim, dan batal mengirim null.
 *
 * Kenapa bentuk ini yang diuji, bukan chips: satu pertanyaan hanya bisa
 * menampilkan pilihan, sedangkan widget yang ditiru (VS Code) punya beberapa
 * LANGKAH dengan field berbeda. Uji yang hanya mengecek "opsi bisa diklik" akan
 * lulus pada kartu satu-langkah yang sudah tidak dipakai lagi.
 *
 * Pola CDP: `cdp.json("return JSON.stringify(await (async () => ...)())")` -
 * sama seperti harness lain; Runtime.evaluate awaitPromise bergantung pada
 * runAsync() di lib-cdp (jangan dipanggil langsung dari sini).
 *
 * Usage: node scripts/uji-tanya.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';

const port = Number(process.argv[2] || 9223);
const daftar = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = daftar.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:5173'));
if (!page) {
  console.error('tidak ada halaman dev di port', port);
  process.exit(1);
}
const { cdp } = await Cdp.attach(port, page.title);

let lulus = 0;
let total = 0;
const check = (id, ok, ket) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${ket}`);
};

/*
 * Pembuka yang dipakai setiap langkah uji.
 *
 * `setNat` menulis lewat setter asli prototipe lalu melempar event input dan
 * change: mengubah `input.value` langsung TIDAK memicu onChange React
 * (pelajaran fase 08), dan tanpa itu semua uji "isi field lalu kirim" gagal
 * padahal aplikasinya benar.
 */
const BUKA = `
  /* q, qa dan wait sudah disediakan runAsync di lingkup yang sama -
     mendeklarasikan ulang berarti SyntaxError dan seluruh uji mati senyap. */
  const setNat = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const tombol = (el) => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ctrlKey: true, target: el });
  const tekanKey = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const ai = () => window.__ZEPHYR_AI__.store.getState();
  const tanya = (langkah) => {
    window.__T__ = 'BERJALAN';
    ai().agentAjukanTanya(langkah).then((v) => { window.__T__ = v; });
  };
  const kartu = () => q('[data-testid="ai-agent-tanya"]');
  const opsi = () => qa('[data-testid^="ai-tanya-opsi-"]');
  const field = () => q('[data-testid="ai-tanya-field"]');
`;

/* ─────────── T1: satu langkah teks — kepala, field, counter, Submit ─────────── */
const t1 = await cdp.json(`return JSON.stringify(await (async () => {
${BUKA}
  tanya([{ tipe: 'teks', pertanyaan: 'Nama branch-nya apa?', deskripsi: 'Field teks bebas.', wajib: true }]);
  await wait(450);
  const k = kartu();
  const f = field();
  return {
    kartuAda: !!k,
    judul: k?.querySelector('.ai-tanya-judul')?.textContent ?? '',
    deskripsi: k?.querySelector('.ai-tanya-deskripsi')?.textContent ?? '',
    counter: q('[data-testid="ai-tanya-langkah-1"]')?.textContent ?? '',
    fieldAda: !!f,
    tipeField: f?.getAttribute('type') ?? '',
    placeholder: f?.getAttribute('placeholder') ?? '',
    adaSubmit: !!q('[data-testid="ai-tanya-kirim"]'),
    adaBatal: !!q('[data-testid="ai-tanya-batal"]'),
    hint: q('.ai-tanya-hint')?.textContent ?? '',
    mundurMati: q('[data-testid="ai-tanya-mundur"]')?.disabled === true,
    majuMati: q('[data-testid="ai-tanya-maju"]')?.disabled === true,
    diDalamGulir: !!k?.closest('.ai-chat'),
  };
})())`);
check('T1a', t1.kartuAda === true, 'kartu tanya muncul lewat agentAjukanTanya');
check('T1b', t1.judul === 'Nama branch-nya apa?', `judul langkah tampil di kepala (dapat "${t1.judul}")`);
check('T1c', t1.deskripsi === 'Field teks bebas.', `deskripsi tampil di badan (dapat "${t1.deskripsi}")`);
check('T1d', t1.counter === '1/1', `counter menampilkan langkah (dapat "${t1.counter}")`);
check('T1e', t1.fieldAda && t1.tipeField === 'text', `field teks ada (type=${t1.tipeField})`);
check('T1f', t1.adaSubmit && t1.adaBatal, 'tombol Submit dan ✕(batal) ada');
check('T1g', t1.hint.length > 0, `petunjuk Ctrl+Enter ada (dapat "${t1.hint}")`);
check('T1h', t1.mundurMati === true && t1.majuMati === true, 'panah mundur/maju mati saat hanya satu langkah');
check('T1i', t1.diDalamGulir === true, 'kartu hidup di dalam area gulir .ai-chat');

/* ─────────── T2: isi field lalu Submit — ringkasan bernomor ─────────── */
const t2 = await cdp.json(`return JSON.stringify(await (async () => {
${BUKA}
  setNat(field(), 'fix/diff-warna');
  await wait(200);
  const sblm = q('[data-testid="ai-tanya-kirim"]')?.disabled === true;
  q('[data-testid="ai-tanya-kirim"]').click();
  await wait(450);
  return { sblm, jawaban: window.__T__, kartuTutup: !kartu() };
})())`);
check('T2a', t2.sblm === false, 'Submit aktif setelah langkah wajib terisi');
check(
  'T2b',
  typeof t2.jawaban === 'string' && /1\. Nama branch-nya apa\?: fix\/diff-warna/.test(t2.jawaban),
  `sudah dikirim: ringkasan bernomor (dapat ${JSON.stringify(t2.jawaban)})`,
);
check('T2c', t2.kartuTutup === true, 'kartu hilang setelah dijawab');

/* ─────────── T3: tiga langkah — navigasi, opsi bernomor, pintasan angka ─────────── */
const t3 = await cdp.json(`return JSON.stringify(await (async () => {
${BUKA}
  tanya([
    { tipe: 'teks', pertanyaan: 'Judul?', wajib: true },
    { tipe: 'pilih-satu', pertanyaan: 'Pilih satu', deskripsi: 'Pilih satu opsi dari daftar.', pilihan: ['Opsi A', 'Opsi B', 'Opsi C'] },
    { tipe: 'angka', pertanyaan: 'Jumlah' },
  ]);
  await wait(450);
  const c1 = q('[data-testid="ai-tanya-langkah-1"]')?.textContent ?? '';
  const submitDiAwal = !!q('[data-testid="ai-tanya-kirim"]');
  setNat(field(), 'Zephyr');
  await wait(150);
  q('[data-testid="ai-tanya-maju"]').click();
  await wait(300);
  const c2 = q('[data-testid="ai-tanya-langkah-2"]')?.textContent ?? '';
  const jumlahOpsi = opsi().length;
  const nomorOpsi = opsi().map((r) => r.querySelector('.ai-tanya-no')?.textContent ?? '');
  const adaFieldBebas = !!q('.ai-tanya-baris-bebas [data-testid="ai-tanya-field"]');
  // pintasan angka: fokus bukan di field teks, jadi '3' memilih opsi ketiga
  tekanKey(opsi()[0], '3');
  await wait(250);
  const aktifSetelahAngka = opsi().map((r) => r.className.includes('aktif'));
  const centang = opsi().filter((r) => !!r.querySelector('.ai-tanya-centang')).length;
  // kembali ke langkah 1, lalu maju lagi ke 3
  q('[data-testid="ai-tanya-mundur"]').click();
  await wait(250);
  const c1lagi = q('[data-testid="ai-tanya-langkah-1"]')?.textContent ?? '';
  q('[data-testid="ai-tanya-maju"]').click();
  await wait(200);
  q('[data-testid="ai-tanya-maju"]').click();
  await wait(300);
  const c3 = q('[data-testid="ai-tanya-langkah-3"]')?.textContent ?? '';
  const tipeDi3 = field()?.getAttribute('type') ?? '';
  return { c1, submitDiAwal, c2, c3, c1lagi, jumlahOpsi, nomorOpsi, adaFieldBebas, aktifSetelahAngka, centang, tipeDi3 };
})())`);
check('T3a', t3.c1 === '1/3', `counter langkah pertama (dapat "${t3.c1}")`);
check('T3b', t3.submitDiAwal === false, 'Submit TIDAK muncul di langkah antara (bentuk VS Code)');
check('T3c', t3.c2 === '2/3', `panah maju memindah langkah (dapat "${t3.c2}")`);
check('T3d', t3.jumlahOpsi === 3, `tiga opsi dirender (dapat ${t3.jumlahOpsi})`);
check('T3e', JSON.stringify(t3.nomorOpsi) === '["1","2","3"]', `opsi bernomor 1..3 (dapat ${JSON.stringify(t3.nomorOpsi)})`);
check('T3f', t3.adaFieldBebas === true, 'baris terakhir berisi field jawaban tulis-sendiri');
check('T3g', JSON.stringify(t3.aktifSetelahAngka) === '[false,false,true]', `pintasan angka '3' memilih opsi ketiga (dapat ${JSON.stringify(t3.aktifSetelahAngka)})`);
check('T3h', t3.centang === 1, `tepat satu opsi tercentang (dapat ${t3.centang})`);
check('T3i', t3.c1lagi === '1/3', `panah mundur kembali ke langkah pertama (dapat "${t3.c1lagi}")`);
check('T3j', t3.c3 === '3/3' && t3.tipeDi3 === 'number', `langkah 3 = field angka (dapat "${t3.c3}", type=${t3.tipeDi3})`);

/* ─────────── T4: batal mengirim null ─────────── */
const t4 = await cdp.json(`return JSON.stringify(await (async () => {
${BUKA}
  if (kartu()) { q('[data-testid="ai-tanya-batal"]').click(); await wait(300); }
  tanya([{ tipe: 'teks', pertanyaan: 'Hapus semua?' }]);
  await wait(400);
  q('[data-testid="ai-tanya-batal"]').click();
  await wait(450);
  return { jawaban: window.__T__, kartuTutup: !kartu() };
})())`);
check('T4a', t4.jawaban === null, `✕ mengirim null (dapat ${JSON.stringify(t4.jawaban)})`);
check('T4b', t4.kartuTutup === true, 'kartu hilang setelah dibatalkan');

/* ─────────── T5: lima langkah, keempat tipe, satu ringkasan ─────────── */
const t5 = await cdp.json(`return JSON.stringify(await (async () => {
${BUKA}
  tanya([
    { tipe: 'teks', pertanyaan: 'Nama proyek?', wajib: true },
    { tipe: 'pilih-satu', pertanyaan: 'Target?', pilihan: ['Opsi A', 'Opsi B'] },
    { tipe: 'angka', pertanyaan: 'Jumlah berkas?' },
    { tipe: 'pilih-banyak', pertanyaan: 'Modul mana?', pilihan: ['A', 'B', 'C'] },
    { tipe: 'teks', pertanyaan: 'Catatan?' },
  ]);
  await wait(500);
  const c1 = q('[data-testid="ai-tanya-langkah-1"]')?.textContent ?? '';
  setNat(field(), 'Zephyr');
  await wait(150);
  q('[data-testid="ai-tanya-maju"]').click(); await wait(250);
  opsi()[1].querySelector('input').click(); await wait(200);
  q('[data-testid="ai-tanya-maju"]').click(); await wait(250);
  setNat(field(), '7'); await wait(150);
  q('[data-testid="ai-tanya-maju"]').click(); await wait(250);
  opsi()[0].querySelector('input').click(); await wait(120);
  opsi()[2].querySelector('input').click(); await wait(200);
  q('[data-testid="ai-tanya-maju"]').click(); await wait(250);
  setNat(field(), 'selesai'); await wait(150);
  const c5 = q('[data-testid="ai-tanya-langkah-5"]')?.textContent ?? '';
  // kembali ke langkah 1 lalu Ctrl+Enter: kirim harus bisa dari langkah mana pun
  for (let i = 0; i < 4; i++) { q('[data-testid="ai-tanya-mundur"]').click(); await wait(120); }
  const c1lagi = q('[data-testid="ai-tanya-langkah-1"]')?.textContent ?? '';
  field()?.dispatchEvent(tombol(field()));
  await wait(500);
  return { c1, c5, c1lagi, jawaban: window.__T__, kartuTutup: !kartu() };
})())`);
check('T5a', t5.c1 === '1/5', `counter awal lima langkah (dapat "${t5.c1}")`);
check('T5b', t5.c5 === '5/5', `counter langkah kelima (dapat "${t5.c5}")`);
check('T5c', t5.c1lagi === '1/5', `empat panah mundur kembali ke awal (dapat "${t5.c1lagi}")`);
const ringkas = typeof t5.jawaban === 'string' ? t5.jawaban : '';
check(
  'T5d',
  /1\. Nama proyek\?: Zephyr/.test(ringkas) &&
    /2\. Target\?: Opsi B/.test(ringkas) &&
    /3\. Jumlah berkas\?: 7/.test(ringkas) &&
    /4\. Modul mana\?: A, C/.test(ringkas) &&
    /5\. Catatan\?: selesai/.test(ringkas),
  `lima jawaban terkumpul dalam satu ringkasan: ${JSON.stringify(ringkas)}`,
);
check('T5e', t5.kartuTutup === true, 'kartu hilang setelah Ctrl+Enter dari langkah 1');

console.log(`\n== ${lulus}/${total} lulus ==`);
cdp.close();
process.exit(lulus === total ? 0 : 1);
