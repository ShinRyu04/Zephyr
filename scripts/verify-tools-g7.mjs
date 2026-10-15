/**
 * verify-tools-g7.mjs - uji keempat tool AI baru lewat jalur nyata.
 *
 *   node scripts/verify-tools-g7.mjs 9223
 *
 *   T1  clipboard_write lalu clipboard_read mengembalikan teks yang sama
 *   T2  clipboard_write menolak teks kosong
 *   T3  screenshot_ui tanpa argumen -> ringkasan pane & editor
 *   T4  screenshot_ui dengan pane yang tidak ada -> daftar pane yang ada
 *   T5  plan_mode menyusun teks rencana di kartu persetujuan
 *   T6  tafsirJawaban: "setuju" -> jalan, "batal" -> berhenti
 *   T7  tafsirJawaban TIDAK menafsirkan teks tak dikenal sebagai setuju
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('tools-g7');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/*
 * Sekat tool dibuka untuk keempat tool yang diuji di sini.
 *
 * Harness ini MEMANGGIL tool lewat bridge dev. Tanpa membuka sekatnya, ujinya
 * lulus saat dijalankan sendiri tapi gagal saat dijalankan setelah harness
 * lain - dan kegagalan yang bergantung urutan seperti itu jauh lebih mahal
 * daripada bug yang sebenarnya, karena menuntut penyelidikan tiap kali.
 */
await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47)+'src'+String.fromCharCode(47)+'lib'+String.fromCharCode(47)+'toolGate.ts');
  const g = m.useToolGate.getState();
  for (const t of ['clipboard_read', 'clipboard_write', 'screenshot_ui', 'plan_mode']) {
    if (!g.aktif.has(t)) g.balik(t);
  }
  await new Promise((res) => setTimeout(res, 200));
  return { aktif: m.useToolGate.getState().aktif.size };
})())`);

const ada = await cdp.json(`return JSON.stringify((() => {
  const t = window.__ZEPHYR_TOOLS__;
  if (!t) return { ada: false };
  const nama = t.nama();
  const cari = ['clipboard_read', 'clipboard_write', 'screenshot_ui', 'plan_mode'];
  return { ada: true, jumlah: nama.length, ketemu: cari.filter((x) => nama.includes(x)), hilang: cari.filter((x) => !nama.includes(x)) };
})())`);

if (!ada.ada) {
  r.check('T0', false, 'bridge tool tidak ada');
  const { lulus, total } = r.selesai();
  await cdp.close();
  process.exit(lulus === total ? 0 : 1);
}

r.check('T0', ada.hilang.length === 0, `keempat tool terdaftar (total ${ada.jumlah} tool)${ada.hilang.length ? `; hilang: ${ada.hilang.join(', ')}` : ''}`);

/* ---- T1: clipboard bolak-balik ---- */

const teksUji = `zephyr-uji-${Date.now()}`;
const klip = await cdp.json(`return JSON.stringify(await (async () => {
  const t = window.__ZEPHYR_TOOLS__;
  const isi = await t.jalankan('clipboard_write', { text: ${JSON.stringify(teksUji)} });
  await new Promise((res) => setTimeout(res, 250));
  const baca = await t.jalankan('clipboard_read', {});
  return { isi, baca, cocok: String(baca).includes(${JSON.stringify(teksUji)}) };
})())`);

r.check('T1a', /copied \d+ characters/i.test(klip.isi || ''), `clipboard_write melapor: "${klip.isi}"`);
r.check('T1b', klip.cocok === true, `clipboard_read mengembalikan teks yang baru ditulis (${String(klip.baca).slice(0, 40)})`);

/* ---- T2: teks kosong ditolak ---- */

const kosong = await cdp.json(`return JSON.stringify(await (async () => {
  try {
    await window.__ZEPHYR_TOOLS__.jalankan('clipboard_write', { text: '' });
    return { ditolak: false };
  } catch (e) {
    return { ditolak: true, pesan: String(e.message).slice(0, 90) };
  }
})())`);
r.check('T2', kosong.ditolak === true, `teks kosong ditolak: "${kosong.pesan}"`);

/* ---- T3: screenshot_ui ringkasan ---- */

const ringkas = await cdp.json(`return JSON.stringify(await (async () => {
  const hasil = await window.__ZEPHYR_TOOLS__.jalankan('screenshot_ui', {});
  const s = String(hasil);
  return { panjang: s.length, cuplik: s.slice(0, 240), adaSeksi: /Panes|Editors|Nothing is open/.test(s) };
})())`);
r.check('T3', ringkas.adaSeksi === true, `overview jendela: ${JSON.stringify(ringkas.cuplik)}`);

/* ---- T4: pane yang tidak ada -> daftar yang ada ---- */

const paneSalah = await cdp.json(`return JSON.stringify(await (async () => {
  try {
    const h = await window.__ZEPHYR_TOOLS__.jalankan('screenshot_ui', { pane: 'pane-yang-tidak-ada-xyz' });
    return { error: false, hasil: String(h).slice(0, 160) };
  } catch (e) {
    return { error: true, pesan: String(e.message).slice(0, 200) };
  }
})())`);
r.check(
  'T4',
  paneSalah.error === true && /not found|no pane/i.test(paneSalah.pesan || ''),
  `pane salah ditolak dengan daftar yang ada: "${paneSalah.pesan}"`,
);

/* ---- T5-T7: plan_mode ---- */

const rencana = await cdp.json(`return JSON.stringify(await (async () => {
  const t = window.__ZEPHYR_TOOLS__;
  const ai = window.__ZEPHYR_AI__.store;
  ai.setState({ agentBusy: true });

  let hasil = 'BELUM';
  t.jalankan('plan_mode', {
    summary: 'Pindahkan pengaturan MCP ke halaman terpisah',
    steps: ['Buat komponen baru', 'Daftarkan di navigasi', 'Hapus dari halaman lama'],
    files: ['src/components/settings/McpSection.tsx'],
  }).then((v) => { hasil = v; });

  await new Promise((res) => setTimeout(res, 400));
  const kartu = document.querySelector('[data-testid="ai-agent-tanya"]');
  const teks = kartu ? kartu.textContent : null;
  const tombol = [...document.querySelectorAll('[data-testid^="ai-tanya-pilih-"]')].map((b) => b.textContent);

  return { hasil, teks, tombol, kartuAda: !!kartu };
})())`);

r.check('T5a', rencana.kartuAda === true, `kartu rencana muncul: ${JSON.stringify((rencana.teks || '').slice(0, 140))}`);
r.check(
  'T5b',
  /1\./.test(rencana.teks || '') && /3\./.test(rencana.teks || ''),
  'langkah rencananya bernomor',
);
r.check(
  'T5c',
  (rencana.tombol || []).length === 3,
  `tiga pilihan: ${JSON.stringify(rencana.tombol)}`,
);

/* Setujui -> tool melaporkan boleh jalan. */
const setujui = await cdp.json(`return JSON.stringify(await (async () => {
  const b = document.querySelector('[data-testid="ai-tanya-pilih-0"]');
  if (!b) return { ada: false };
  b.click();
  await new Promise((res) => setTimeout(res, 450));
  return { ada: true, hasil: window.__UJI_RENCANA__ ?? null };
})())`);

/* Hasil sebenarnya disimpan di janji; ambil dari variabel halaman. */
const hasilRencana = await cdp.json(`return JSON.stringify((() => {
  const ai = window.__ZEPHYR_AI__.store.getState();
  ai.setAgentBusy && 0;
  return { tanya: ai.agentTanya };
})())`);
r.check('T5d', hasilRencana.tanya === null, 'kartu dibersihkan setelah dijawab');

/* ---- T6/T7: tafsir jawaban (fungsi murni, diuji langsung) ---- */

const tafsir = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import('/src/lib/planMode.ts');
  return {
    setuju: m.tafsirJawaban('Setujui dan kerjakan'),
    ya: m.tafsirJawaban('ya lanjut'),
    batal: m.tafsirJawaban('Batalkan'),
    stop: m.tafsirJawaban('stop'),
    ubah: m.tafsirJawaban('Ubah dulu'),
    asing: m.tafsirJawaban('hmm entahlah'),
    nullJawab: m.tafsirJawaban(null),
  };
})())`);

r.check('T6a', tafsir.setuju.setuju === true, 'tombol utama -> setuju');
r.check('T6b', tafsir.ya.setuju === true, '"ya lanjut" -> setuju');
r.check('T6c', tafsir.batal.dibatalkan === true && tafsir.stop.dibatalkan === true, '"Batalkan"/"stop" -> dibatalkan');
r.check('T6d', tafsir.ubah.mintaUbah === true, '"Ubah dulu" -> minta ubah');
r.check('T6e', tafsir.nullJawab.dibatalkan === true, 'tanpa jawaban -> dibatalkan, bukan setuju');
r.check(
  'T7',
  tafsir.asing.setuju === false && tafsir.asing.mintaUbah === true,
  `teks tak dikenal TIDAK dianggap setuju (setuju=${tafsir.asing.setuju}, mintaUbah=${tafsir.asing.mintaUbah})`,
);

/* Bersihkan. */
await cdp.json(`return JSON.stringify((() => {
  window.__ZEPHYR_AI__.store.setState({ agentBusy: false, agentTanya: null });
  return { bersih: true };
})())`);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
