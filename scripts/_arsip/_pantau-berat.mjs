/**
 * _pantau-berat.mjs - pantau satu run agen yang sedang jalan.
 *
 * Cetak satu baris status tiap 30 detik: langkah, tulis/baca, todo done/total,
 * tool terakhir, dan umur langkah terakhir (kalau > 2 menit berarti benar-benar
 * nyangkut, bukan sekadar menunggu provider).
 *
 *   node scripts/_pantau-berat.mjs 9223 8
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = String(process.argv[2] ?? '9223');
const PUTARAN = Number(process.argv[3] ?? 8);
const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'localhost']);

const baca = async () =>
  cdp.json(`return JSON.stringify((() => {
    const A = window.__ZEPHYR_AI__.store.getState();
    const steps = (A.agentSteps || []).filter((x) => x.name);
    const nama = steps.map((x) => x.name);
    const now = Date.now();
    return {
      busy: A.agentBusy, fase: A.agentPhase, idx: A.agentStepIndex,
      n: nama.length,
      tulis: nama.filter((n) => n === 'write_file' || n === 'edit' || n === 'multi_edit').length,
      baca: nama.filter((n) => ['read_file','list_directory','glob','grep','search_files'].includes(n)).length,
      todo: (A.agentTodos || []).map((t) => t.status).filter((s) => s === 'done').length + '/' + (A.agentTodos || []).length,
      ekor: nama.slice(-6),
      umur: steps.length ? Math.round((now - (steps[steps.length - 1].at || now)) / 1000) : -1,
      gagal: steps.filter((x) => x.ok === false).length,
    };
  })())`);

for (let i = 0; i < PUTARAN; i++) {
  const s = await baca();
  console.log(
    `${
      s.busy ? 'JALAN' : 'DIAM '
    } ${new Date().toLocaleTimeString('id-ID')} langkah=${s.n} tulis=${s.tulis} baca=${s.baca} todo=${s.todo} ` +
      `fase=${s.fase} idx=${s.idx}/200 umurLangkah=${s.umur}s gagal=${s.gagal} ekor=${s.ekor.join(',')}`,
  );
  if (!s.busy && i > 0) break;
  await new Promise((r) => setTimeout(r, 30000));
}
await cdp.close();
