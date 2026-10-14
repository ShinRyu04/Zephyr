/**
 * uji-riwayat-langkah.mjs - uji bentuk wire riwayat agent.
 *
 * Yang dibuktikan di sini adalah satu kelas bug yang membuat model mengulang
 * tool: riwayat yang dikirim ke provider berisi lebih dari satu pesan asisten
 * untuk SATU langkah, dengan teks yang menumpuk. Model membacanya sebagai "aku
 * sudah mengatakan ini berkali-kali", lalu mengulang aksi yang sama persis.
 *
 * Fungsi aslinya diambil dari bundle dev (bukan salinan), lewat bridge
 * `window.__ZEPHYR_RIWAYAT__`.
 *
 *   node scripts/uji-riwayat-langkah.mjs [port-cdp]
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('bentuk wire riwayat agent');
let gagal = false;
const asliCheck = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asliCheck(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);
cdp.snapshot = null;

const ada = await cdp.eval(
  `!!(window.__ZEPHYR_RIWAYAT__ && window.__ZEPHYR_RIWAYAT__.bentukWireRiwayat)`,
);
R.check('R1', ada === true, 'bridge bentuk wire tersedia di mode dev');
if (!ada) {
  R.selesai();
  await cdp.close();
  process.exit(1);
}

/** Satu langkah: pesan asisten + hasil tool yang menyusul. */
const riwayat = await cdp.json(`return JSON.stringify((() => {
  const B = window.__ZEPHYR_RIWAYAT__;
  const history = [
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'perbaiki index.html' },
    { role: 'assistant', content: 'Aku baca dulu.', toolCalls: [{ id: 'c1', name: 'read_file', args: { path: 'index.html' } }] },
    { role: 'tool', toolCallId: 'c1', name: 'read_file', content: '<html>' },
    { role: 'assistant', content: 'Aku baca dulu.Aku sunting sekarang.', toolCalls: [{ id: 'c2', name: 'edit', args: { path: 'index.html' } }] },
    { role: 'tool', toolCallId: 'c2', name: 'edit', content: 'ok' },
    { role: 'assistant', content: 'Aku baca dulu.Aku sunting sekarang.Selesai.' },
  ];
  const wire = B.bentukWireRiwayat(history);
  const asisten = wire.filter((m) => m.role === 'assistant');
  return {
    jumlahAsisten: asisten.length,
    toolCalls: asisten.map((m) => (m.toolCalls || []).length),
    teks: asisten.map((m) => m.content),
    panjangTeks: asisten.map((m) => m.content.length),
  };
})())`);

R.check(
  'R2',
  riwayat.jumlahAsisten === 3,
  `satu pesan asisten per langkah (dapat: ${riwayat.jumlahAsisten})`,
);
R.check(
  'R3',
  riwayat.toolCalls.join(',') === '1,1,0',
  `toolCalls tidak menggantung dan tidak dobel: [${riwayat.toolCalls.join(',')}]`,
);
R.check(
  'R4',
  riwayat.jumlahAsisten === 0 || new Set(riwayat.panjangTeks).size !== 1 || riwayat.panjangTeks[0] === riwayat.panjangTeks[1],
  `teks tidak menumpuk: [${riwayat.panjangTeks.join(', ')}] char`,
);

/* Perbaikan bentuk: asisten tanpa tool call yang disusul asisten bertool-call
   pada langkah yang sama harus digabung, bukan dibiarkan jadi dua entri. */
const gabung = await cdp.json(`return JSON.stringify((() => {
  const B = window.__ZEPHYR_RIWAYAT__;
  const wire = B.bentukWireRiwayat([
    { role: 'user', content: 'x' },
    { role: 'assistant', content: 'kalimat pembuka' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'read_file', args: {} }] },
    { role: 'tool', toolCallId: 'c1', content: 'isi' },
  ]);
  const asisten = wire.filter((m) => m.role === 'assistant');
  return { jumlah: asisten.length, teks: asisten[0] ? asisten[0].content : '', calls: (asisten[0] && asisten[0].toolCalls ? asisten[0].toolCalls.length : 0) };
})())`);

R.check('R5', gabung.jumlah === 1, `langkah terpecah digabung jadi satu (dapat: ${gabung.jumlah})`);
R.check('R6', gabung.teks === 'kalimat pembuka' && gabung.calls === 1, 'teks dan tool call bertahan setelah digabung');

/* Ringkas pesan harus tetap menghasilkan bentuk yang sah setelah dipotong. */
const dipotong = await cdp.json(`return JSON.stringify((() => {
  const B = window.__ZEPHYR_RIWAYAT__;
  const panjang = [];
  panjang.push({ role: 'system', content: 'SYS' });
  panjang.push({ role: 'user', content: 'tugas panjang' });
  for (let i = 0; i < 40; i++) {
    panjang.push({ role: 'assistant', content: 'langkah ' + i, toolCalls: [{ id: 'c' + i, name: 'read_file', args: { path: 'f' + i } }] });
    panjang.push({ role: 'tool', toolCallId: 'c' + i, name: 'read_file', content: 'x'.repeat(6000) });
  }
  const a = B.bentukWireRiwayat(panjang);
  const m = B.ringkasRiwayat ? B.ringkasRiwayat(a) : null;
  const b = m ? B.bentukWireRiwayat(m) : null;
  const asistenA = a.filter((x) => x.role === 'assistant');
  const asistenB = b ? b.filter((x) => x.role === 'assistant') : [];
  return {
    a: asistenA.length,
    b: asistenB.length,
    unik: new Set(asistenB.map((x) => x.content)).size,
    chat: asistenB.filter((x) => !!x.toolCalls).length,
  };
})())`);

R.check('R7', dipotong.a === 40, `40 langkah tetap 40 pesan asisten sebelum dipotong (dapat: ${dipotong.a})`);
R.check(
  'R8',
  dipotong.b === 0 || dipotong.unik === dipotong.b,
  `setelah pemotongan tidak ada teks kembar (${dipotong.unik}/${dipotong.b})`,
);

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
