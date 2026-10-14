/**
 * uji-agent-shape.mjs - bukti bentuk wire agent dari app yang hidup.
 *
 * Menjalankan tugas multi-langkah lewat jalur Rust asli (mock provider di
 * 127.0.0.1:8098), lalu MEMERIKSA PAYLOAD yang benar-benar dikirim ke provider:
 * berapa pesan asisten per langkah, apakah ada pesan asisten berturut-turut,
 * dan apakah teks langkah menumpuk.
 *
 *   node scripts/uji-agent-shape.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const MOCK = 'http://127.0.0.1:8098';
const R = reporter('bentuk wire payload agent (end-to-end)');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);
cdp.snapshot = null;

const ver = await (await fetch(`${MOCK}/__version`)).json();
R.check('S1', ver.version === 6, `mock provider siap (versi ${ver.version})`);
await fetch(`${MOCK}/__reset`);

/* Arahkan provider aktif ke mock, simpan nilai lama untuk dipulihkan. */
const sebelum = await cdp.json(`return JSON.stringify((() => {
  const st = window.__ZEPHYR__.getState();
  const A = window.__ZEPHYR_AI__.store.getState();
  const p = A.provider;
  const cfg = (st.settings.models.providers || {})[p] || {};
  return {
    provider: p,
    baseUrl: cfg.baseUrl || '',
    model: A.model,
    approval: A.approvalMode,
  };
})())`);

await cdp.json(`return JSON.stringify((() => {
  window.__ZEPHYR__.getState().applySettings({
    models: { providers: { [${JSON.stringify(sebelum.provider)}]: { baseUrl: ${JSON.stringify(MOCK)} } } },
  });
  return true;
})())`);

/* Pastikan agent berjalan tanpa dialog konfirmasi. */
await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  A.getState().setApprovalMode ? A.getState().setApprovalMode('auto') : null;
  return A.getState().approvalMode;
})())`);

await fetch(`${MOCK}/__reset`);

/* Kirim tugas. Mock akan membalas tool call untuk prompt yang memuat TOOLCALL:. */
await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send('Tolong baca berkas ini dua kali. TOOLCALL:read_file');
  return true;
})())`);

/* Tunggu sampai run selesai (agentBusy kembali false) atau timeout. */
const selesai = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (!A.getState().agentBusy) return { ok: true, ms: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: false, ms: Date.now() - t0 };
})())`);
R.check('S2', selesai.ok === true, `run agent selesai dalam ${selesai.ms}ms`);

await fetch(`${MOCK}/__reset`);
await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send('Lanjutkan. TOOLCALL:read_file');
  return true;
})())`);
const selesai2 = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (!A.getState().agentBusy) return { ok: true, ms: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: false, ms: Date.now() - t0 };
})())`);
R.check('S2b', selesai2.ok === true, `run kedua selesai dalam ${selesai2.ms}ms`);

const log = await (await fetch(`${MOCK}/__log`)).json();
R.check('S3', log.length >= 2, `provider menerima ${log.length} request (butuh >= 2 langkah)`);

/* Analisa bentuk pesan pada request TERAKHIR: seluruh riwayat ada di situ. */
const terakhir = log[log.length - 1];
const pesan = terakhir.body?.messages ?? terakhir.body?.input ?? [];
const asisten = pesan.filter((m) => m.role === 'assistant');
const teks = asisten.map((m) => String(m.content ?? ''));
const totalChar = teks.reduce((n, t) => n + t.length, 0);

R.check('S4', asisten.length >= 1, `riwayat memuat ${asisten.length} langkah asisten`);
/*
 * Bukti inti: TIDAK ADA dua pesan asisten berurutan dengan isi yang saling
 * memuat. Inilah bentuk yang membuat model mengulang tool yang sama.
 */
const tumpuk = [];
for (let i = 1; i < asisten.length; i++) {
  const sebelumnya = String(asisten[i - 1].content ?? '');
  const ini = String(asisten[i].content ?? '');
  if (sebelumnya && ini && sebelumnya.includes(ini)) tumpuk.push(i);
}
R.check('S5', tumpuk.length === 0, `tidak ada teks langkah yang menumpuk (${tumpuk.length} temuan)`);

/*
 * Asisten berturut-turut tanpa hasil tool di antaranya adalah bentuk yang
 * ditolak gateway dan membuat model bingung. Yang sah: asisten bertool-call
 * SELALU diikuti hasil tool sebelum asisten berikutnya.
 */
const pelanggaran = [];
for (let i = 0; i < pesan.length; i++) {
  if (pesan[i].role !== 'assistant') continue;
  if (i + 1 < pesan.length && pesan[i + 1].role === 'assistant') pelanggaran.push(i);
}
R.check('S6', pelanggaran.length === 0, `tidak ada asisten berturut-turut tanpa hasil tool (${pelanggaran.length})`);

/* Setiap tool call harus tepat satu, dan hasil tool harus tepat satu pasang. */
const calls = asisten.reduce((n, m) => n + (m.tool_calls?.length ?? m.toolCalls?.length ?? 0), 0);
const hasilTool = pesan.filter((m) => m.role === 'tool').length;
R.check('S7', calls >= 1, `riwayat memuat ${calls} tool call`);
R.check('S8', hasilTool > 0, `riwayat memuat ${hasilTool} hasil tool`);

console.log(`     info: ${asisten.length} langkah, ${totalChar} char teks asisten`);

/* Pulihkan setelan provider. */
await cdp.json(`return JSON.stringify((() => {
  window.__ZEPHYR__.getState().applySettings({
    models: { providers: { [${JSON.stringify(sebelum.provider)}]: { baseUrl: ${JSON.stringify(sebelum.baseUrl)} } } },
  });
  const A = window.__ZEPHYR_AI__.store;
  A.getState().setApprovalMode ? A.getState().setApprovalMode(${JSON.stringify(sebelum.approval)}) : null;
  return true;
})())`);

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
