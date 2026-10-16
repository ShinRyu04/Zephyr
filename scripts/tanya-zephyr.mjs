/**
 * tanya-zephyr.mjs - tanya Zeph AI banyak hal soal ZEPHYR SENDIRI, pakai
 * PROVIDER ASLI, lalu cetak jawabannya apa adanya supaya bisa dinilai manusia.
 *
 *   node scripts/tanya-zephyr.mjs [port]
 *
 * Bukan harness lulus/gagal: tujuannya MEMBACA jawaban. Setiap pertanyaan
 * dijalankan sebagai chat baru tanpa folder terbuka (keadaan yang paling sulit:
 * tidak ada berkas yang bisa disisir).
 *
 * Pertanyaan sengaja menuntut JENIS pengetahuan yang berbeda:
 *   1. kunci setelan + nilai bawaan     (angka)
 *   2. port + tujuannya                 (angka + alasan)
 *   3. pintasan keyboard                (pintasan)
 *   4. di mana sebuah kontrol hidup     (lokasi UI)
 *   5. berkas apa yang menyimpan nilai  (lokasi disk)
 *   6. tool apa yang dia punya          (kemampuan diri)
 *   7. batas/plafon yang berlaku        (batas)
 *   8. gejala -> penyebab + tempat cek  (diagnosa)
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const MENIT = Number(process.env.MENIT ?? 4);

const PERTANYAAN = [
  'Soal Zephyr sendiri (aplikasi ini), bukan berkas: berapa pane terminal maksimum secara bawaan, dan kunci setelan mana yang mengaturnya?',
  'Soal Zephyr sendiri: port berapa yang dipakai server MCP-nya, dan port mana yang dipakai untuk debug WebView2/CDP? Sebutkan angkanya apa adanya.',
  'Soal Zephyr sendiri: pintasan keyboard apa yang menampilkan/menyembunyikan panel bawah, dan apa nama grup setelannya?',
  'Soal Zephyr sendiri: kontrol sub-agent (maxParallel, allowWrite) ada di halaman mana? Sebut nama halamannya apa adanya.',
  'Soal Zephyr sendiri: di berkas mana nilai setelannya disimpan? Sebut jalur berkasnya, dan sebutkan kalau ada lapisan kedua.',
  'Soal Zephyr sendiri: tool apa saja yang kamu punya untuk membaca KODE (bukan teks biasa)? Sebutkan namanya.',
  'Soal Zephyr sendiri: berapa batas tool yang dikirim ke model dalam satu permintaan, dan tool apa yang dipakai untuk menjangkau sisanya?',
  'Gejala: "panel bawah saya hilang, kenapa dan di mana saya cek?" Jawab dari setelan/pintasan Zephyr - jangan jalankan perintah apa pun.',
];

const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

/* Keadaan awal: chat baru, tanpa folder. */
const pra = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  if (A.getState().agentBusy) return { busy: true };
  if (A.getState().newChat) A.getState().newChat();
  A.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });
  return { busy: false, provider: A.getState().provider, model: A.getState().model,
    workspace: (window.__ZEPHYR__.getState().workspace ?? null) };
})())`,
  30000,
);
console.log(`provider: ${pra.provider} / ${pra.model} | workspace: ${pra.workspace ?? '(tidak ada)'}\n`);
if (pra.busy) {
  console.log('agen sedang sibuk - ulangi setelah idle.');
  await cdp.close();
  process.exit(2);
}

const jalankan = async (soal) =>
  await cdp.json(
    `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentMode) A.getState().setAgentMode('agent');
  A.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });

  const t0 = Date.now();
  try { void A.getState().send(${JSON.stringify(soal)}); } catch (e) { return { galat: String(e) }; }
  while (Date.now() - t0 < 20000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));

  let diam = Date.now();
  let terakhir = '';
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const sn = s.activeSession ? s.activeSession() : null;
    const ms = (sn && sn.messages) ? sn.messages : [];
    const bot = ms.filter((m) => m.role === 'assistant').pop();
    const teks = (bot && bot.content) ? String(bot.content) : '';
    if (teks !== terakhir) { terakhir = teks; diam = Date.now(); }
    if (!s.agentBusy && teks) break;
    if (!s.agentBusy && Date.now() - diam > 3000) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const s2 = A.getState();
  const sn2 = s2.activeSession ? s2.activeSession() : null;
  const ms2 = (sn2 && sn2.messages) ? sn2.messages : [];
  const bot2 = ms2.filter((m) => m.role === 'assistant').pop();
  const alat = (s2.agentSteps || []).filter((x) => x.kind === 'tool').map((x) => x.name);
  return { jawaban: (bot2 && bot2.content) ? String(bot2.content) : '(kosong)',
    langkah: alat, galat: s2.agentFailure ?? null, detik: Math.round((Date.now() - t0) / 1000) };
})())`,
    (MENIT + 1) * 60000,
  );

for (const [i, q] of PERTANYAAN.entries()) {
  console.log('='.repeat(78));
  console.log(`TANYA ${i + 1}: ${q}`);
  const r = await jalankan(q);
  console.log(`--- JAWABAN ZEPH (${r.detik ?? '?'}s, tool: ${(r.langkah ?? []).join(', ') || 'tidak ada'}) ---`);
  console.log(r.jawaban ?? '(tidak ada jawaban)');
  if (r.galat) console.log(`!!! GALAT: ${JSON.stringify(r.galat).slice(0, 200)}`);
  console.log('');
}

await cdp.close();
