/**
 * uji-deepseek-shape.mjs - jalankan Agent Zephyr dengan DeepSeek ASLI dan
 * periksa bentuk wire yang terkirim pada setiap langkah.
 *
 * Ini bukan mock. Tugasnya sengaja multi-langkah (baca -> tulis -> verifikasi)
 * supaya bug "asisten menumpuk / tool diulang" muncul kalau masih ada.
 *
 *   node scripts/uji-deepseek-shape.mjs 9223 [tugas]
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const TUGAS =
  process.argv[3] ??
  'Buka D:\\Talos\\index.html, baca isinya, lalu laporkan: 1) apakah ada meta description, 2) apakah ada link canonical, 3) apakah ada tag og:title. Jawab singkat dengan nomor.';
const R = reporter('agent DeepSeek asli - bentuk wire per langkah');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);
cdp.snapshot = null;

const info = await cdp.json(`return JSON.stringify((() => {
  const st = window.__ZEPHYR__.getState();
  const A = window.__ZEPHYR_AI__.store.getState();
  const cfg = (st.settings.models.providers || {})[A.provider] || {};
  return { provider: A.provider, model: A.model, baseUrl: cfg.baseUrl || '', busy: A.agentBusy };
})())`);
R.check('D1', /deepseek/i.test(info.model), `model aktif: ${info.provider}/${info.model}`);
R.check('D2', info.busy === false, 'agent idle sebelum mulai');
if (/127\.0\.0\.1|localhost/.test(info.baseUrl)) {
  console.log('!! baseUrl masih mock, hentikan supaya tidak salah ukur');
  R.check('D3', false, `baseUrl menunjuk mock: ${info.baseUrl}`);
  R.selesai();
  await cdp.close();
  process.exit(1);
}

/* Pasang perekam: setiap event ai-chunk kita simpan bentuk langkahnya. */
await cdp.eval(`(() => {
  if (window.__SHAPE_REC__) return true;
  window.__SHAPE_REC__ = { chunks: [], cap: 0 };
  window.__SHAPE_OFF__ = window.__ZEPHYR__.subscribe ? window.__ZEPHYR__.subscribe(() => {}) : null;
  return true;
})()`);

await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  A.getState().setApprovalMode ? A.getState().setApprovalMode('auto') : null;
  A.getState().setAgentSteps ? A.getState().setAgentSteps([]) : null;
  return true;
})())`);

await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)});
  return true;
})())`);

/* Tunggu selesai, dengan heartbeat supaya kita tahu masih hidup. */
const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  let maksMenitTunggu = 240000;
  while (Date.now() - t0 < maksMenitTunggu) {
    const s = A.getState();
    if (!s.agentBusy) {
      return { ok: true, ms: Date.now() - t0, error: null };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, ms: Date.now() - t0, error: 'timeout' };
})())`);
R.check('D4', hasil.ok === true, `run selesai dalam ${Math.round(hasil.ms / 1000)}s`);

/* Baca hasil dari store: pesan terakhir + langkah tool yang benar-benar jalan. */
const akhir = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sesi = A.activeSession ? A.activeSession() : null;
  const msgs = (sesi && sesi.messages) ? sesi.messages : [];
  const terakhir = msgs[msgs.length - 1] || null;
  const tools = (A.agentSteps || []).filter((s) => s.kind === 'tool');
  return {
    balasan: terakhir ? String(terakhir.content || '').slice(0, 600) : '',
    error: terakhir ? terakhir.error || null : null,
    streaming: terakhir ? !!terakhir.streaming : null,
    tools: tools.map((t) => t.name),
    jumlahTool: tools.length,
  };
})())`);

R.check('D5', akhir.streaming === false, 'bubble tidak menggantung di streaming');
R.check('D6', akhir.jumlahTool >= 1, `agent menjalankan ${akhir.jumlahTool} tool: ${akhir.tools.join(', ')}`);
R.check('D7', !akhir.error, `tidak ada error provider (${akhir.error ?? 'bersih'})`);
R.check('D8', akhir.balasan.trim().length > 0, `agent menjawab ${akhir.balasan.trim().length} char`);

console.log('\n--- jawaban agent ---');
console.log(akhir.balasan.trim() || '(kosong)');
console.log('--------------------\n');

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
