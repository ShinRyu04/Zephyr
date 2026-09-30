// verify-subagent-orchestration.mjs — STEP 2 checks: pipeline split, file
// ownership, and per-role tool filtering. All are pure or bridge-exposed, so no
// provider call is needed.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');
const hasil = [];
const check = (id, ok, detail) => { hasil.push(ok); console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`); };

const r = await cdp.runAsync(`
  const ROLE = await import('/src/lib/subagentRoles.ts');
  const TOOLS = await import('/src/lib/agentTools.ts');

  const chain = ROLE.pisahPipeline('buat API -> tulis test -> jalankan test');
  const single = ROLE.pisahPipeline('cari pemakaian');

  // Read-only role: no write tools, and no nested subagent when depth is maxed.
  const ro = TOOLS.agentToolSpecs({ bolehTulis: false, kedalaman: 0 });
  const rw = TOOLS.agentToolSpecs({ bolehTulis: true, kedalaman: 0 });
  const deep = TOOLS.agentToolSpecs({ bolehTulis: true, kedalaman: TOOLS.MAX_SUB_DEPTH });

  const names = (a) => a.map((s) => s.name);
  return JSON.stringify({
    chain, single,
    ro: names(ro), rw: names(rw), deep: names(deep),
    adaTulisRO: names(ro).some((n) => n.startsWith('file_') && n !== 'file_read' && n !== 'file_list'),
    adaTulisRW: names(rw).includes('file_write'),
    adaNestedDeep: names(deep).includes('subagent_run'),
  });
`, 40000);
const d = JSON.parse(r);

check('STEP2C', JSON.stringify(d.chain) === '["buat API","tulis test","jalankan test"]' && d.single.length === 1, `pipeline: ${JSON.stringify(d.chain)} | tunggal: ${JSON.stringify(d.single)}`);
check('STEP2F', d.adaTulisRO === false && d.adaTulisRW === true && d.adaNestedDeep === false, `read-only tanpa tool tulis (${d.adaTulisRO}); read-write punya file_write (${d.adaTulisRW}); kedalaman maks tanpa subagent_run (${d.adaNestedDeep})`);
check('STEP2A', typeof (await cdp.runAsync(`return JSON.stringify(window.__ZEPHYR_SUB__.pemilikFile())`, 20000)) === 'string', 'ownership table terbaca lewat bridge');

const lulus = hasil.filter(Boolean).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
await cdp.close();
process.exitCode = lulus === hasil.length ? 0 : 1;
