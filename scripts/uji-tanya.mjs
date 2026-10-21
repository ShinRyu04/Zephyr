  /*
 * Kartu pertanyaan agen (tool ask_user) — gaya Claude/TRAE.
 *
 * Yang diperiksa: kartu muncul lewat jalur asli (`agentAjukanTanya`), opsi
 * dirender sebagai tombol blok selebar (`.ai-tanya-op`), mengklik opsi
 * menyelesaikan janji dengan teks opsi persis, input bebas tetap jalan, dan
 * batal mengirim null. Pengganti T5-T5d di verify-tools-g7.mjs yang basi
 * (keempat tool-nya sudah dihapus dari katalog).
 *
 * Pola CDP: `cdp.json("return JSON.stringify(await (async () => ...)())")` —
 * sama seperti verify-tools-g7; Runtime.evaluate awaitPromise bergantung pada
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

/* ---- T1: kartu muncul dengan opsi blok ---- */
const t1 = await cdp.json(`return JSON.stringify(await (async () => {
  const ai = window.__ZEPHYR_AI__.store.getState();
  window.__UJI_TANYA__ = 'BERJALAN';
  ai.agentAjukanTanya(
    'Mau dipindah atau diduplikat berkasnya?',
    ['Pindahkan', 'Duplikat', 'Batal dulu'],
  ).then((v) => { window.__UJI_TANYA__ = v; });
  await new Promise((r) => setTimeout(r, 400));
  const kartu = document.querySelector('[data-testid="ai-agent-tanya"]');
  const opsi = [...document.querySelectorAll('[data-testid^="ai-tanya-pilih-"]')];
  const kelas = opsi.map((b) => b.className);
  return {
    kartuAda: !!kartu,
    jumlah: opsi.length,
    semuaBlok: kelas.length === 3 && kelas.every((k) => k.includes('ai-tanya-op')),
    labelAda: !!kartu?.querySelector('.ai-tanya-dot'),
    pemisahAda: !!kartu?.querySelector('.ai-tanya-pemisah'),
  };
})())`);
check('T1a', t1.kartuAda === true, 'kartu tanya muncul');
check('T1b', t1.jumlah === 3, `tiga opsi (dapat ${t1.jumlah})`);
check('T1c', t1.semuaBlok === true, 'opsi pakai tombol blok .ai-tanya-op');
check('T1d', t1.labelAda === true, 'label dengan titik berdenyut ada');
check('T1e', t1.pemisahAda === true, 'pemisah "or write your own" ada');

/* ---- T2: klik opsi -> janji selesai dengan teks opsi ---- */
const t2 = await cdp.json(`return JSON.stringify(await (async () => {
  document.querySelector('[data-testid="ai-tanya-pilih-1"]').click();
  await new Promise((r) => setTimeout(r, 400));
  return {
    jawaban: window.__UJI_TANYA__,
    kartuTutup: !document.querySelector('[data-testid="ai-agent-tanya"]'),
  };
})())`);
check('T2a', t2.jawaban === 'Duplikat', `klik opsi 1 mengembalikan "Duplikat" (dapat ${JSON.stringify(t2.jawaban)})`);
check('T2b', t2.kartuTutup === true, 'kartu hilang setelah dijawab');

/* ---- T3: input bebas ---- */
const t3 = await cdp.json(`return JSON.stringify(await (async () => {
  const ai = window.__ZEPHYR_AI__.store.getState();
  window.__UJI_TANYA2__ = 'BERJALAN';
  ai.agentAjukanTanya('Nama branch-nya apa?').then((v) => { window.__UJI_TANYA2__ = v; });
  await new Promise((r) => setTimeout(r, 400));
  const tanpaPilihan = !document.querySelector('[data-testid^="ai-tanya-pilih-"]');
  const inp = document.querySelector('[data-testid="ai-tanya-jawab"]');
  /* React onChange tidak menyala lewat input.value= (pelajaran fase 08):
     pakai setter asli prototipe + event input/change. */
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  ).set;
  setter.call(inp, 'fix/diff-warna');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  document.querySelector('[data-testid="ai-tanya-kirim"]').click();
  await new Promise((r) => setTimeout(r, 400));
  return { tanpaPilihan, jawaban: window.__UJI_TANYA2__ };
})())`);
check('T3a', t3.tanpaPilihan === true, 'pertanyaan tanpa opsi tidak menampilkan daftar tombol');
check('T3b', t3.jawaban === 'fix/diff-warna', `input bebas terkirim (dapat ${JSON.stringify(t3.jawaban)})`);

/* ---- T4: batal ---- */
const t4 = await cdp.json(`return JSON.stringify(await (async () => {
  const ai = window.__ZEPHYR_AI__.store.getState();
  window.__UJI_TANYA3__ = 'BERJALAN';
  ai.agentAjukanTanya('Hapus semua?').then((v) => { window.__UJI_TANYA3__ = v; });
  await new Promise((r) => setTimeout(r, 400));
  document.querySelector('[data-testid="ai-tanya-batal"]').click();
  await new Promise((r) => setTimeout(r, 400));
  return { jawaban: window.__UJI_TANYA3__ };
})())`);
check('T4', t4.jawaban === null, `batal mengirim null (dapat ${JSON.stringify(t4.jawaban)})`);

console.log(`\n== ${lulus}/${total} lulus ==`);
cdp.close();
process.exit(lulus === total ? 0 : 1);
