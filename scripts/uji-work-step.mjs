/**
 * uji-work-step.mjs - uji label langkah kerja di area status.
 *
 *   node scripts/uji-work-step.mjs 9223
 *
 * Yang dibuktikan: angka "X of Y" yang tidak bermakna sudah tidak ada, dan yang
 * menggantikannya memberi tahu berapa langkah DIKERJAKAN.
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('work-step');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* Teks sumbernya diperiksa lebih dulu: membuktikan "tidak ada X of Y" lewat DOM
   saja tidak cukup, karena elemennya hanya ada saat agen berjalan. */
const sumber = await cdp.json(`return JSON.stringify(await (async () => {
  const teks = await fetch(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'components' + String.fromCharCode(47) + 'ai' + String.fromCharCode(47) + 'AiPanel.tsx').then((x) => x.text());
  return {
    adaProgressOf: teks.includes('Progress {current} of {total}'),
    adaStepsDone: teks.includes('steps done'),
    adaStepsLeft: teks.includes('steps left'),
  };
})())`);

r.check('W1', sumber.adaProgressOf === false, '"Progress {current} of {total}" sudah tidak ada di sumber');
r.check('W2', sumber.adaStepsDone === true, 'label "N steps done" ada');
r.check('W3', sumber.adaStepsLeft === true, 'peringatan "N steps left" ada untuk saat mendekati plafon');

/* Lalu bentuk DOM-nya: muncul saat sibuk, dan bunyinya benar. */
const tampil = await cdp.json(`return JSON.stringify(await (async () => {
  const ai = window.__ZEPHYR_AI__.store;
  const simpan = { agentBusy: ai.getState().agentBusy, agentStepIndex: ai.getState().agentStepIndex, agentStepLimit: ai.getState().agentStepLimit };

  const potret = async (idx, limit) => {
    ai.setState({ agentBusy: true, agentStepIndex: idx, agentStepLimit: limit, agentPhase: 'thinking' });
    await new Promise((res) => setTimeout(res, 320));
    const el = document.querySelector('[data-testid="ai-work-step"]');
    return el ? el.textContent : null;
  };

  const nol = await potret(0, 120);
  const satu = await potret(1, 120);
  const lima = await potret(5, 120);
  const hampir = await potret(100, 120);

  ai.setState(simpan);
  await new Promise((res) => setTimeout(res, 250));
  return { nol, satu, lima, hampir };
})())`);

r.check('W4', tampil.nol === 'Starting', `langkah 0 -> "${tampil.nol}"`);
r.check('W5', tampil.satu === '1 step done', `langkah 1 -> "${tampil.satu}" (tunggal, bukan "1 steps")`);
r.check('W6', /^5 steps done$/.test(tampil.lima || ''), `langkah 5 -> "${tampil.lima}"`);
r.check(
  'W7',
  /steps done/.test(tampil.hampir || '') && /steps left/.test(tampil.hampir || ''),
  `mendekati plafon memunculkan peringatan sisa: "${tampil.hampir}"`,
);
r.check(
  'W8',
  !/of 120/.test(tampil.lima || '') && !/of 120/.test(tampil.satu || ''),
  `angka "of 120" tidak lagi bocor ke UI (${tampil.satu} / ${tampil.lima})`,
);

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
