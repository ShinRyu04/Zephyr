/**
 * uji-nyangkut.mjs - regresi untuk seluruh kelas bug "agent menggantung".
 *
 * Semua temuan di sini berasal dari app hidup dan dari analisa independen:
 *
 *   1. `maxOut` salah → output berhenti di 4k token → JSON tool terpotong →
 *      "malformed JSON arguments" → langkah berikutnya ditolak 400.
 *   2. Frame terminal yang ditelan guard `onChunk` tidak melepaskan langkah,
 *      jadi loop parkir di `await` sampai batas keras 15 menit.
 *   3. Watchdog diam di-reset oleh SETIAP frame, termasuk keep-alive tanpa isi -
 *      jadi stream yang hidup tapi mandek tidak pernah memicu apa pun.
 *   4. Asisten kosong tanpa toolCalls tidak boleh dikirim ke provider.
 *
 *   node scripts/uji-nyangkut.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('anti-nyangkut: maxOut, watchdog, wire');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr — Code Editor', 'localhost:5173']);
cdp.snapshot = null;

/* ---------- 1. maxOut ---------- */

const mo = await cdp.json(`return JSON.stringify(await (async () => {
  const mc = await import('/src/lib/modelCatalog.tsx');
  const uji = ['deepseek-v4.1-flash','deepseek-v4-pro','deepseek-chat','gpt-4o','claude-sonnet-4.6','gemini-3.8-flash','grok-4.6','o3-mini','unknown-model'];
  return uji.map((id) => ({ id, maxOut: mc.findModel(id, 'custom').maxOut }));
})())`);

const deepseek = mo.find((m) => m.id === 'deepseek-v4.1-flash');
R.check(
  'N1',
  deepseek.maxOut > 8192,
  `deepseek-v4.1-flash lewat Custom dapat ${deepseek.maxOut} token (dulu 4096 - terlalu kecil untuk write_file)`,
);
R.check(
  'N2',
  mo.filter((m) => m.id === 'unknown-model')[0].maxOut >= 4096,
  'model tak dikenal tetap dapat bawaan konservatif',
);
R.check(
  'N3',
  mo.filter((m) => m.maxOut > 8192).length >= 6,
  `${mo.filter((m) => m.maxOut > 8192).length}/9 nama model terdeteksi butuh ruang besar`,
);

/* ---------- 2. Wire: asisten kosong ---------- */

const wire = await cdp.json(`return JSON.stringify((() => {
  const B = window.__ZEPHYR_RIWAYAT__;
  const a = B.bentukWireRiwayat([
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'tugas' },
    { role: 'assistant', content: '' },
  ]);
  const b = B.bentukWireRiwayat([
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'tugas' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'read_file', args: {} }] },
    { role: 'tool', toolCallId: 'a', content: 'isi' },
  ]);
  const c = B.bentukWireRiwayat([
    { role: 'user', content: 'tugas' },
    { role: 'assistant', content: '   ' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'read_file', args: {} }] },
    { role: 'tool', toolCallId: 'a', content: 'isi' },
  ]);
  return {
    a: a.filter((m) => m.role === 'assistant').length,
    b: b.filter((m) => m.role === 'assistant').length,
    c: c.filter((m) => m.role === 'assistant').map((m) => ({ len: String(m.content || '').length, calls: (m.toolCalls || []).length })),
  };
})())`);

R.check('N4', wire.a === 0, `asisten kosong tanpa tool call dibuang (sisa: ${wire.a})`);
R.check('N5', wire.b === 1, 'asisten kosong DENGAN tool call tetap dikirim');
R.check(
  'N6',
  wire.c.length === 1 && wire.c[0].calls === 1,
  `asisten spasi digabung ke langkah bertool-call (${JSON.stringify(wire.c)})`,
);

/* ---------- 3. Watchdog ---------- */

const wd = await cdp.json(`return JSON.stringify(await (async () => {
  const src = await (await fetch('/src/lib/aiStore.ts')).text();
  return {
    adaNoProgress: /AGENT_NO_PROGRESS_MS/.test(src),
    diResetHanyaDenganIsi: /if \\(c\\.text \\|\\| c\\.reasoning\\) \\{[\\s\\S]{0,120}agentNoProgressTandai/.test(src),
    adaLepaskanDitelan: /lepaskanLangkahDitelan/.test(src),
    adaBersihSet: /retiredAgentAttempts\\.clear\\(\\)[\\s\\S]{0,80}cancelledAttempts\\.clear\\(\\)/.test(src),
  };
})())`);

R.check('N7', wd.adaNoProgress === true, 'timer tanpa-kemajuan terpisah ada');
R.check('N8', wd.diResetHanyaDenganIsi === true, 'timer itu hanya di-reset frame yang membawa isi');
R.check('N9', wd.adaLepaskanDitelan === true, 'frame terminal yang ditelan guard tetap melepaskan langkah');
R.check('N10', wd.adaBersihSet === true, 'jejak percobaan dibersihkan di akhir run');

/* ---------- 4. Susunan akhir: run hidup selalu punya terminal ---------- */

const st = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  return { busy: A.agentBusy, phase: A.agentPhase, streamingNyangkut: false };
})())`);
R.check('N11', st.busy === false, `agent tidak nyangkut saat tes dimulai (phase=${st.phase})`);

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
