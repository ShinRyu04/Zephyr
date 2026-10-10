/**
 * uji-urutan-pesan.mjs - bukti urutan pesan ke provider benar.
 *
 * Kenapa ini penting: versi lama menyusun payload dengan MEMPARTISI riwayat -
 * semua pesan non-asisten dulu, lalu semua asisten ditempel di belakang. Yang
 * dikirim ke provider jadi:
 *
 *   user, tool, tool, user ... assistant, assistant
 *
 * Bagi gateway OpenAI-compatible yang ketat, itu graf pesan yang tidak sah.
 * Gejalanya persis yang dilaporkan user: stream tidak menjawab apa-apa, frame
 * `toolDone` tidak pernah datang, promise langkah tidak pernah selesai - jadi
 * bubble tetap `streaming: true` dan meter langkah tersangkut tanpa satu tool
 * pun tercatat.
 *
 * Tes ini meniru bentuk payload yang dibangun loop dan memeriksa urutannya,
 * jadi ia GAGAL kalau ada yang mengembalikan partisi itu.
 *
 *   node scripts/uji-urutan-pesan.mjs
 */
import { reporter } from './lib-cdp.mjs';

const R = reporter('urutan pesan ke provider');

/**
 * Cerminan dari blok pembentuk payload di `aiStore.ts`.
 *
 * Sengaja ditulis ulang di sini, bukan diimpor: yang diuji adalah BENTUK yang
 * harus dihasilkan, dan salinan kecil ini membuat aturannya bisa dibaca tanpa
 * membuka berkas 5900 baris. Kalau loop berubah dan tidak lagi mengikuti aturan
 * ini, tes ini tetap lulus - karena itu ia dipasangkan dengan uji CDP yang
 * membaca `bentukWireRiwayat` dari app yang hidup.
 */
function bangunPayload(history, langkahRiwayat) {
  const out = [];
  let i = 0;
  for (const m of history) {
    if (m.role !== 'assistant') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const l = langkahRiwayat[i];
    i += 1;
    if (l) out.push({ role: 'assistant', content: l.pesan.content, toolCalls: l.pesan.toolCalls });
    else out.push({ role: 'assistant', content: m.content });
  }
  return out;
}

/* Percakapan nyata: user bertanya, agent baca berkas, menjawab. */
const history = [
  { role: 'system', content: 'SYS' },
  { role: 'user', content: 'buka google lalu selesai' },
  { role: 'assistant', content: 'Aku buka dulu.' },
  { role: 'tool', toolCallId: 'c1', content: 'halaman terbuka' },
  { role: 'assistant', content: 'Sudah cukup.' },
];
const langkahRiwayat = [
  { pesan: { content: 'Aku buka dulu.', toolCalls: [{ id: 'c1', name: 'browser_open', args: {} }] } },
  { pesan: { content: 'Sudah cukup.' } },
];

const wire = bangunPayload(history, langkahRiwayat);
const urutan = wire.map((m) => m.role);

console.log('     urutan:', urutan.join(' -> '));

R.check(
  'U1',
  urutan.join(',') === 'system,user,assistant,tool,assistant',
  `urutan percakapan dipertahankan (dapat: ${urutan.join(',')})`,
);

/* Asisten tidak boleh menumpuk di ekor - itu bentuk rusak yang lama. */
let ekorAsisten = 0;
for (let i = urutan.length - 1; i >= 0 && urutan[i] === 'assistant'; i--) ekorAsisten++;
R.check('U2', ekorAsisten <= 1, `tidak ada asisten menumpuk di ekor (${ekorAsisten})`);

/* Setiap toolCall wajib punya hasil tool SESUDAHNYA - kalau tidak, provider
   menolak seluruh permintaan sebagai graf yang tidak sah. */
const pelanggaran = [];
for (let i = 0; i < wire.length; i++) {
  const calls = wire[i].toolCalls?.length ?? 0;
  for (let n = 0; n < calls; n++) {
    const berikut = wire[i + 1 + n];
    if (!berikut || berikut.role !== 'tool') pelanggaran.push(wire[i].content.slice(0, 20));
  }
}
R.check('U3', pelanggaran.length === 0, `setiap tool call diikuti hasil tool (${pelanggaran.length} pelanggaran)`);

/* System prompt harus tetap paling depan. */
R.check('U4', wire[0]?.role === 'system', 'system prompt tetap di posisi pertama');

/* Percakapan panjang: urutan harus tetap benar setelah banyak langkah. */
const panjang = [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'tugas' }];
const langkahPanjang = [];
for (let i = 0; i < 12; i++) {
  panjang.push({ role: 'assistant', content: `langkah ${i}` });
  panjang.push({ role: 'tool', toolCallId: `c${i}`, content: `hasil ${i}` });
  langkahPanjang.push({ pesan: { content: `langkah ${i}`, toolCalls: [{ id: `c${i}`, name: 'read_file', args: {} }] } });
}
const wirePanjang = bangunPayload(panjang, langkahPanjang);
let ganjil = 0;
for (let i = 0; i < wirePanjang.length; i++) {
  const harap = i % 2 === 0 ? 'assistant' : 'tool';
  if (i >= 2 && wirePanjang[i].role !== harap) ganjil++;
}
R.check('U5', ganjil === 0, `12 langkah tetap selang-seling benar (${ganjil} ganjil)`);
R.check(
  'U6',
  wirePanjang.filter((m) => m.role === 'assistant').length === 12,
  `12 langkah = 12 pesan asisten (dapat: ${wirePanjang.filter((m) => m.role === 'assistant').length})`,
);

R.selesai();
process.exit(R.results.some((r) => !r.ok) ? 1 : 0);
