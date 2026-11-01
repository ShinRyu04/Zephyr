/**
 * Bukti unit izin Experts (2 Nov) — lewat CDP di app sandbox yang jalan.
 * Membuktikan: (a) baris delegasi experts boleh menulis walau allowWrite mati,
 * (b) subagent biasa tetap ditolak, (c) shell yang benar-benar merusak tetap
 * butuh approval Auto juga untuk experts.
 */
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
const hasil = await cdp.runAsync(`
  const zUrl = (frag) => performance.getEntriesByType('resource').map((e) => e.name)
    .filter((n) => n.includes(frag)).sort().pop();
  const zSa = (await import(zUrl('/src/lib/subagentStore.ts')));
  const zAi = window.__ZEPHYR_AI__.store;

  /* simpan & paksa allowWrite MATI untuk membuktikan pengecualian experts */
  const st = await (async () => (await import(zUrl('/src/lib/store.ts'))).useStore)();
  const awal = st.getState().settings.subagent?.allowWrite;
  st.setState((s) => ({ settings: { ...s.settings, subagent: { ...s.settings.subagent, allowWrite: false } } }));

  const barisDemo = {
    id: 'uji-experts-a1',
    nama: 'Uji Ahli',
    peran: 'fullstack',
    delegasiId: 'experts-uji-demo',
    status: 'jalan',
    langkah: [], fileDitulis: [], tulisDitolak: 0,
  };
  zSa.useSubAgent.setState((s) => ({ agents: [...s.agents.filter((a) => a.id !== barisDemo.id), barisDemo] }));
  const modeAwal = zAi.getState().approvalMode;
  zAi.setState({ approvalMode: 'work' });

  const putusan = (nama, o) => zSa.putusanTulis(nama, o);
  const keluar = {
    expertsTulis: putusan('write_file', { agentId: 'uji-experts-a1' }).boleh,
    biasaTulis: putusan('write_file', { agentId: 'subagent-manual-x' }).boleh,
    expertsShellNormal: putusan('bash_run', { agentId: 'uji-experts-a1' }).boleh,
    expertsShellBahaya: putusan('bash_run', { agentId: 'uji-experts-a1', bahayaShell: true }).boleh,
  };

  /* bersihkan */
  zSa.useSubAgent.setState((s) => ({ agents: s.agents.filter((a) => a.id !== barisDemo.id) }));
  zAi.setState({ approvalMode: modeAwal });
  st.setState((s) => ({ settings: { ...s.settings, subagent: { ...s.settings.subagent, allowWrite: awal } } }));
  return keluar;
`);
console.log(JSON.stringify(hasil, null, 2));
console.log(hasil.expertsTulis && !hasil.biasaTulis && hasil.expertsShellNormal && !hasil.expertsShellBahaya
  ? 'LULUS 4/4 — pengecualian experts jalan, gerbang lain tetap tertutup'
  : 'GAGAL — periksa output di atas');
await cdp.close();
