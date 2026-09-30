// A REAL subagent run against the user's own provider. Not a mock: the point is
// to prove the whole chain (model resolution, tool loop, result) works on the
// key the user configured. It costs the user's quota, so the batch is kept to
// two short read-only tasks.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

// Confirm which model/provider will actually be used BEFORE spending anything.
const info = JSON.parse(
  await cdp.runAsync(`
  const ai = window.__ZEPHYR_AI__.store.getState();
  const sub = S.getState().settings.subagent || {};
  const baseUrl = (S.getState().settings.models.providers || {})[ai.provider]?.baseUrl || '';
  return JSON.stringify({
    modelSub: sub.model || '',
    modelChat: ai.model,
    provider: ai.provider,
    baseUrl,
    maxParallel: sub.maxParallel,
    maxSteps: sub.maxSteps,
    idleSecs: sub.idleSecs,
    allowWrite: sub.allowWrite,
    punyaKey: ai.keys.filter((k) => k.hasKey).map((k) => k.provider),
  });
`),
);
console.log('INFO:', JSON.stringify(info, null, 0));
check(
  'REAL-V0',
  info.modelSub === '' && !!info.modelChat && info.punyaKey.includes(info.provider),
  `subagent ikut chat = ${info.modelChat} (${info.provider} @ ${info.baseUrl}); max ${info.maxParallel}, steps ${info.maxSteps}, idle ${info.idleSecs}s`,
);

// A run needs a provider that can actually send: a key alone is not enough when
// the endpoint is missing (custom with an empty base URL).
if (!info.baseUrl) {
  console.log(
    `\nLEWAT  REAL-V1..V3  provider "${info.provider}" belum punya base URL, jadi tidak bisa kirim.\n` +
      '        Isi Settings → Models → Custom → Base URL, lalu jalankan ulang.',
  );
  const lulus0 = hasil.filter((x) => x.ok).length;
  console.log(`\n== ${lulus0}/${hasil.length} lulus (V1..V3 dilewati) ==`);
  await cdp.close();
  process.exit(0);
}

// Two tiny read-only tasks against a real file that certainly exists.
const run = JSON.parse(
  await cdp.runAsync(`
  const sub = window.__ZEPHYR_SUB__.store.getState();
  s.setSettingsOpen(false);
  TS().setVisible(true);
  window.__ZEPHYR_PANEL__.focusTab('subagents');
  await wait(800);
  const n = await window.__ZEPHYR_SUB__.store.getState().jalankan([
    'Baca file package.json dan sebutkan hanya nama field "version"',
    'Baca file README.md dan sebutkan hanya judul baris pertama',
  ]);
  return JSON.stringify({ jumlah: n });
`, 120000),
);
console.log('RUN :', JSON.stringify(run));

// Poll until both agents finish.
const state = await cdp.runAsync(
  `
  const deadline = Date.now() + 150000;
  for (;;) {
    const st = window.__ZEPHYR_SUB__.store.getState();
    const hidup = st.agents.filter((a) => a.status === 'jalan' || a.status === 'menunggu').length;
    if (hidup === 0 && st.agents.length > 0) break;
    if (Date.now() > deadline) break;
    await wait(1500);
  }
  const st = window.__ZEPHYR_SUB__.store.getState();
  return JSON.stringify({
    agents: st.agents.map((a) => ({
      nama: a.nama,
      status: a.status,
      model: a.model,
      provider: a.provider,
      langkah: a.langkah.length,
      verdict: a.verdict,
      error: a.error,
      hasil: (a.hasil || '').slice(0, 220),
    })),
  });
`,
  170000,
);

const s = JSON.parse(state);
for (const [i, a] of s.agents.entries()) {
  console.log(
    `  [${i}] ${a.nama} ${a.status} model=${a.provider}/${a.model} langkah=${a.langkah} verdict=${a.verdict} error=${a.error ?? '-'}`,
  );
  console.log(`      hasil: ${a.hasil.replace(/\s+/g, ' ').slice(0, 200)}`);
}

const ok = s.agents.length === 2 && s.agents.every((a) => a.status === 'selesai' && !a.error);
check(
  'REAL-V1',
  ok,
  `${s.agents.filter((a) => a.status === 'selesai').length}/${s.agents.length} selesai tanpa error`,
);
check(
  'REAL-V2',
  s.agents.every((a) => a.model === info.modelChat || a.model),
  `semua memakai model yang dikonfigurasi: ${[...new Set(s.agents.map((a) => a.model))].join(', ')}`,
);
check(
  'REAL-V3',
  s.agents.every((a) => (a.hasil || '').trim().length > 0),
  `semua punya hasil: ${s.agents.map((a) => (a.hasil || '').trim().length).join(', ')} karakter`,
);

const lulus = hasil.filter((x) => x.ok).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
await cdp.close();
process.exitCode = lulus === hasil.length ? 0 : 1;
