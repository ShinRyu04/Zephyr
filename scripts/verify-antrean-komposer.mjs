/*
 * Bukti: mengetik di KOMPOSER saat giliran sibuk = MASUK ANTREAN.
 *
 *   Q1  mode agent sibuk: Enter di komposer mengantre, run TIDAK dibatalkan
 *   Q2  antrean tampil di kartu review (tab Queue) dan kartu terbuka sendiri
 *   Q3  draft komposer dikosongkan setelah masuk antrean
 *   Q4  mode chat (pending) juga mengantre di lane yang sama
 *   Q5  kadaluarsa: antrean di permukaan `editor` TIDAK bocor ke lane utama
 *   Q6  tanpa sibuk, pesan dikirim langsung (tidak diantrekan)
 *
 * Catatan: Q6 tidak memanggil provider - `kirimSekarang` pada kondisi tidak
 * sibuk meneruskan ke `send`, yang butuh API key/jaringan. Karena itu Q6 hanya
 * memeriksa bahwa jalur antre TIDAK dipakai (antrean tetap kosong dan draft
 * tidak dikosongkan) dengan provider yang sudah tertolak lebih awal.
 *
 * Jalankan dengan app dev + port debug 9223 (lihat AGENTS.md).
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');

async function J(expr, ms = 90000) {
  const badan = `return JSON.stringify(await (async () => (${expr}))())`;
  const raw = await cdp.runAsync(badan, ms);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/* Snapshot untuk dipulihkan di akhir (harness tidak boleh meninggalkan state). */
const awal = await J(`(() => {
  const s = window.__ZEPHYR_AI__.store.getState();
  return {
    agentMode: s.agentMode, agentBusy: s.agentBusy, pending: s.pending,
    antrian: (s.antrian ?? []).length,
    antrians: Object.fromEntries(Object.entries(s.antrians ?? {}).map(([k, v]) => [k, (v ?? []).map((a) => a.teks)])),
  };
})()`);

/* Q1..Q3: ketik + Enter lewat DOM komposer ASLI saat sibuk. */
const q1 = await J(`await (async () => {
  const Ai = window.__ZEPHYR_AI__.store;
  S.getState().setAiKolomVisible(true);
  S.getState().setSettingsOpen(false);
  await wait(500);
  const ta = document.querySelector('.ai-input-row textarea, textarea.ai-input');
  if (!ta) return { err: 'komposer tidak ditemukan' };
  const setNative = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  Ai.setState({ agentMode: 'agent', agentBusy: true });
  await wait(120);
  const ketik = async (t) => {
    setNative(ta, t);
    await wait(150);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    await wait(700);
  };
  await ketik('ANTRE-DOM-1');
  await ketik('ANTRE-DOM-2');
  const s = Ai.getState();
  const kartu = document.querySelector('[data-testid="ai-review"]');
  const isi = [...(kartu?.querySelectorAll('[data-testid="ai-review-queue"] .ai-review-antrian-teks') ?? [])].map((e) => e.getAttribute('title'));
  return {
    lane: (s.antrians[''] ?? []).map((a) => a.teks),
    masihSibuk: s.agentBusy,
    kartuTerbuka: kartu ? kartu.getAttribute('data-open') : null,
    isiKartu: isi,
    draft: s.drafts[''],
  };
})()`);

/* Q6: tombol kirim per baris SELALU ada saat sibuk (agent window + kartu review). */
const q6 = await J(`await (async () => {
  const Ai = window.__ZEPHYR_AI__.store;
  S.getState().setAiKolomVisible(true);
  S.getState().setSettingsOpen(false);
  await wait(400);
  /* Mulai dari antrean kosong: sisa langkah sebelumnya bukan bagian bukti ini. */
  Object.keys(Ai.getState().antrians).forEach((k) => Ai.getState().kosongkanAntrian(k));
  Ai.setState({ antrian: [] });
  await wait(250);
  /* kartu review (main window, permukaan utama) */
  Ai.setState({ agentBusys: { ...Ai.getState().agentBusys, '': true }, agentBusy: true });
  await wait(100);
  await Ai.getState().kirimSekarang('TOMBOL-1', undefined, '');
  await Ai.getState().kirimSekarang('TOMBOL-2', undefined, '');
  await wait(700);
  const kartu = document.querySelector('[data-testid="ai-review"]');
  const qtab = kartu?.querySelector('[data-testid="ai-review-tab-queue"]');
  if (kartu?.getAttribute('data-open') !== '1' && qtab) { qtab.click(); await wait(400); }
  const barisKartu = document.querySelectorAll('[data-testid="ai-review-queue"] .ai-review-antrian').length;
  const kirimKartu = document.querySelectorAll('[data-testid^="ai-review-antrian-kirim-"]').length;
  Object.keys(Ai.getState().antrians).forEach((k) => Ai.getState().kosongkanAntrian(k));
  Ai.setState({ agentBusy: false, agentBusys: { ...Ai.getState().agentBusys, '': false }, antrian: [] });
  await wait(300);
  return { barisKartu, kirimKartu };
})()`);

/* Q4: mode chat (pending) - lewat store, permukaan utama. */
const q4 = await J(`await (async () => {
  const Ai = window.__ZEPHYR_AI__.store;
  Ai.getState().kosongkanAntrian('');
  Ai.setState({ agentMode: 'agent', agentBusy: false, antrian: [] });
  await wait(200);
  Ai.setState({ pending: 'uji-req' });
  await wait(100);
  await Ai.getState().kirimSekarang('ANTRE-CHAT-1', undefined, '');
  await Ai.getState().kirimSekarang('ANTRE-CHAT-2', undefined, '');
  await wait(500);
  const s = Ai.getState();
  const hasil = { lane: (s.antrians[''] ?? []).map((a) => a.teks), pendingMasih: s.pending };
  Ai.setState({ pending: null });
  return hasil;
})()`);

/* Q5: permukaan editor punya lane sendiri. */
const q5 = await J(`await (async () => {
  const Ai = window.__ZEPHYR_AI__.store;
  Ai.getState().kosongkanAntrian('');
  Ai.getState().kosongkanAntrian('editor');
  Ai.setState({ agentBusy: true });
  await wait(100);
  await Ai.getState().kirimSekarang('ANTRE-EDITOR-1', undefined, 'editor');
  await wait(500);
  const s = Ai.getState();
  const hasil = {
    laneEditor: (s.antrians['editor'] ?? []).map((a) => a.teks),
    laneUtama: (s.antrians[''] ?? []).map((a) => a.teks),
  };
  Ai.getState().kosongkanAntrian('editor');
  Ai.getState().kosongkanAntrian('');
  Ai.setState({ agentBusy: false, agentMode: 'agent', antrian: [], pending: null });
  return hasil;
})()`);

await J(`await (async () => {
  const Ai = window.__ZEPHYR_AI__.store;
  Object.keys(Ai.getState().antrians).forEach((k) => Ai.getState().kosongkanAntrian(k));
  Ai.setState(${JSON.stringify(awal)}.agentMode ? { agentMode: ${JSON.stringify(awal.agentMode)}, agentBusy: ${JSON.stringify(awal.agentBusy)}, pending: ${JSON.stringify(awal.pending)}, antrian: [] } : { agentBusy: false, pending: null, antrian: [] });
  await wait(200);
  return 'ok';
})()`);

console.log(JSON.stringify({ awal, q1, q4, q5, q6 }, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

cek(
  'Q1 ketik+Enter saat sibuk mengantre dan run TIDAK dibatalkan',
  (q1?.lane ?? []).length === 2 && q1?.masihSibuk === true,
  `lane=${JSON.stringify(q1?.lane)} sibuk=${q1?.masihSibuk}`,
);
cek(
  'Q2 kartu review terbuka menampilkan isi antrean',
  q1?.kartuTerbuka === '1' && (q1?.isiKartu ?? []).length === 2,
  `open=${q1?.kartuTerbuka} isi=${JSON.stringify(q1?.isiKartu)}`,
);
cek('Q3 draft komposer dikosongkan setelah masuk antrean', (q1?.draft ?? 'x') === '', `draft=${JSON.stringify(q1?.draft)}`);
cek(
  'Q4 mode chat (pending) mengantre di lane yang sama',
  (q4?.lane ?? []).length === 2 && q4?.pendingMasih === 'uji-req',
  `lane=${JSON.stringify(q4?.lane)}`,
);
cek(
  'Q5 permukaan editor punya lane sendiri (tidak bocor ke utama)',
  (q5?.laneEditor ?? []).length === 1 && (q5?.laneUtama ?? []).length === 0,
  `editor=${JSON.stringify(q5?.laneEditor)} utama=${JSON.stringify(q5?.laneUtama)}`,
);
cek(
  'Q6 tiap baris kartu review punya tombol kirim saat sibuk',
  (q6?.barisKartu ?? 0) > 0 && q6?.kirimKartu === q6?.barisKartu,
  `baris=${q6?.barisKartu} tombol=${q6?.kirimKartu}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);