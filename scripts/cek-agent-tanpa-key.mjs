/*
 * BUG 2, kasus paling langsung: kirim di mode agent untuk provider yang TIDAK
 * punya API key. Dulu ini salah satu jalur yang bisa berakhir tanpa jejak.
 *
 * Dipisah dari cek-agent-jejak.mjs karena uji ini butuh keadaannya BERSIH:
 * kalau langkah sebelumnya masih berjalan, `send` akan mengantre pesan
 * ("Added to the queue") dan jalur tanpa-key-nya tidak pernah tercapai - jadi
 * hasilnya menguji hal lain. Setiap proses = satu keadaan.
 *
 * Syarat: aplikasi hidup dengan port debug 9223.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);

const hasil = [];
const cek = (nama, lulus, detail) => {
  hasil.push(lulus);
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${detail ? '  ->  ' + detail : ''}`);
};

const r = await cdp.runAsync(
  `
  const st = () => X.store.getState();
  const ses = () => { const s = st().sessions[st().activeId] || { messages: [] }; return s.messages; };

  // Tunggu sampai benar-benar menganggur dulu, supaya tidak mengantre.
  for (let i = 0; i < 80 && st().agentBusy; i++) await wait(250);
  st().setAgentMode('agent');

  // Cari provider yang TIDAK punya key di mesin ini.
  const snap = JSON.parse(await window.__ZEPHYR_SECRETS__.snapshot());
  const ada = Object.keys(snap);
  const semua = ['gemini','openai','anthropic','deepseek','local','custom','xai','lmstudio'];
  const kosong = semua.find((p) => !ada.includes(p)) || null;
  if (!kosong) return { lewati: true };

  const prev = st().provider;
  S.setState({ settings: { ...S.getState().settings,
    models: { ...S.getState().settings.models, activeProvider: kosong } } });
  st().sinkronProvider();
  await wait(800);

  const sebelum = ses().length;
  st().setToast(null);
  // send() mengembalikan Promise<boolean>; tanpa await, hasilnya objek Promise.
  const kembali = await st().send('halo');
  for (let i = 0; i < 60; i++) {
    await wait(200);
    if (!st().agentBusy) break;
  }
  await wait(400);

  const pesan = ses();
  const akhir = pesan[pesan.length - 1] || {};
  return {
    lewati: false,
    provider: kosong,
    prev,
    kembali,
    toast: st().toast || null,
    pesanBaru: pesan.length - sebelum,
    peran: akhir.role || null,
    err: akhir.error || null,
    streaming: !!akhir.streaming,
    isi: String(akhir.content || '').slice(0, 200),
  };
`,
  60000,
);
console.log('tanpa key ->', JSON.stringify(r));

if (r.lewati) {
  console.log('SKIP   semua provider punya key di mesin ini, jalur ini tidak bisa diuji');
  cdp.close();
  process.exit(0);
}

/*
 * Jejak yang sah bisa berbentuk toast ATAU bubble error - yang penting pengguna
 * melihat SESUATU. Jadi asersinya pada "ada jejak", bukan pada bentuk tertentu.
 */
const adaToast = !!r.toast;
const adaBubble = !!r.err || /tidak ada|no api key|key/i.test(r.isi);
cek('kirim tanpa key TIDAK diklaim terkirim', r.kembali === false, `send() -> ${r.kembali}`);
cek('kirim tanpa key meninggalkan jejak yang terlihat (toast atau bubble)', adaToast || adaBubble,
  r.toast ? `toast: ${r.toast}` : `err: ${r.err} | isi: ${r.isi}`);
cek('jejaknya menjelaskan APA yang terjadi (bukan pesan kosong)',
  String(r.toast || r.err || r.isi).length > 12, String(r.toast || r.err || r.isi).slice(0, 120));
cek('bubble tidak berhenti dalam keadaan streaming', r.streaming === false, String(r.streaming));

// Pulihkan provider semula.
await cdp.runAsync(`
  S.setState({ settings: { ...S.getState().settings,
    models: { ...S.getState().settings.models, activeProvider: ${JSON.stringify(r.prev)} } } });
  X.store.getState().sinkronProvider();
  await wait(600);
  return {};
`);

const lulus = hasil.filter(Boolean).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
cdp.close();
process.exit(lulus === hasil.length ? 0 : 1);
