/**
 * uji-ai-hidup.mjs - bukti agent benar-benar bisa menyelesaikan tugas.
 *
 * Menjawab pertanyaan yang tidak bisa dijawab dengan membaca kode: apakah alur
 * agent SUNGGUHAN berjalan akhir-akhir ini, atau masih 400 / macet / berhenti
 * di tengah seperti yang dilaporkan.
 *
 * Tiga hal yang diuji, semuanya lewat jalur nyata (provider asli, loop asli):
 *   1. run BERAKHIR sendiri - tidak menggantung sampai batas langkah
 *   2. tool benar-benar dipanggil dan hasilnya kembali
 *   3. tidak ada error provider di langkah terakhir
 *
 * Kalau gagal, ia melaporkan APA yang terjadi - pesan error, jumlah langkah,
 * nama tool - supaya diagnosisnya tidak perlu menebak.
 *
 *   node scripts/uji-ai-hidup.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('agent AI hidup - tugas nyata');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr']);
cdp.snapshot = null;

/* ── 0. Keadaan awal ──────────────────────────────────────────────────── */

const awal = await cdp.json(`return JSON.stringify((() => {
  const st = window.__ZEPHYR__.getState();
  const A = window.__ZEPHYR_AI__.store.getState();
  const p = st.settings.models.providers?.[A.provider] || {};
  return {
    provider: A.provider,
    model: A.model,
    baseUrl: p.baseUrl || '',
    busy: A.agentBusy,
    adaKey: A.keys?.some((k) => k.provider === A.provider && k.hasKey) ?? false,
  };
})())`);

R.check('A1', awal.busy === false, `agent idle (${awal.provider}/${awal.model})`);
R.check('A2', awal.adaKey, `API key ada untuk ${awal.provider}`);

if (!awal.adaKey) {
  console.log('  -> tanpa key, uji live tidak mungkin dijalankan');
  R.selesai();
  await cdp.close();
  process.exit(1);
}

/*
 * `auto` supaya tidak ada dialog konfirmasi yang menggantung. Ini BUKAN yang
 * menghilangkan izin tulis — `run_subagent`/write tetap dijaga gerbang lain.
 */
await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  if (A.getState().setApprovalMode) A.getState().setApprovalMode('auto');
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
  return true;
})())`);

/* ── 1. Tugas dua langkah: baca lalu jawab ────────────────────────────── */

const TUGAS =
  process.argv[3] ??
  'Baca berkas package.json di akar workspace, lalu jawab dengan satu baris: apa nama paketnya? Jangan membaca berkas lain.';

const t0 = Date.now();
await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)});
  return true;
})())`);

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const s = A.getState();
    if (!s.agentBusy) {
      const sesi = s.activeSession ? s.activeSession() : null;
      const msgs = (sesi && sesi.messages) ? sesi.messages : [];
      const last = msgs[msgs.length - 1] || null;
      const tools = (s.agentSteps || []).filter((x) => x.kind === 'tool');
      return {
        ok: true,
        ms: Date.now() - t0,
        langkah: tools.length,
        namaTool: tools.map((x) => x.name),
        balasan: last ? String(last.content || '').slice(0, 500) : '',
        error: last ? (last.error || null) : null,
        streaming: last ? !!last.streaming : null,
        phase: s.agentPhase,
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, ms: Date.now() - t0, error: 'TIMEOUT 240s' };
})())`);

const detik = Math.round((Date.now() - t0) / 1000);

R.check('A3', hasil.ok === true, `run BERAKHIR sendiri dalam ${detik}s`);
R.check('A4', hasil.streaming === false, `bubble tidak menggantung di streaming (${hasil.streaming})`);
R.check('A5', !hasil.error, `tidak ada error provider (${hasil.error ?? 'bersih'})`);
R.check('A6', (hasil.langkah ?? 0) >= 1, `agent memanggil ${hasil.langkah} tool: ${(hasil.namaTool ?? []).join(', ')}`);
R.check('A7', String(hasil.balasan ?? '').trim().length > 0, `agent menjawab (${String(hasil.balasan ?? '').trim().length} char)`);

/* Sinyal 400 yang khas: agent berhenti tanpa tool dan tanpa jawaban. */
const kosong = !hasil.langkah && !String(hasil.balasan ?? '').trim();
R.check('A8', !kosong, 'TIDAK berhenti tanpa tool dan tanpa jawaban (gejala 400)');

console.log('\n--- jawaban agent ---');
console.log(String(hasil.balasan ?? '').trim() || '(kosong)');
console.log('--------------------\n');

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
