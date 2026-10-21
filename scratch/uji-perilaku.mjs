import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');
const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  return JSON.parse(await c.eval(src));
};

/*
 * The settings on disk are now: autoFixIde=false, todoListIde=true,
 * questioningIde=true. The panel wrote them, so the ONE store instance the UI
 * uses has them — and the tool handlers read that instance through the same
 * module the UI imported.
 *
 * `jalankanAgentTool` is imported by PATH, which in Vite is the module the app
 * already loaded, so its `useStore` is the app's.
 */
const hasil = {};

hasil.tanya = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  const ai = await import('/src/lib/aiStore.ts');
  const janji = jalankanAgentTool('ask_user', { pertanyaan: 'Mana?', pilihan: ['a','b'] });
  await new Promise(r=>setTimeout(r,150));
  const kartu = ai.useAi.getState().agentTanya;
  ai.useAi.getState().jawabTanya('b');
  return { adaKartu: !!kartu, pertanyaan: kartu?.pertanyaan ?? null, hasil: String(await janji).slice(0,50) };
`);

hasil.todo = await j(`
  const { jalankanAgentTool } = await import('/src/lib/agentTools.ts');
  return { hasil: String(await jalankanAgentTool('todo_write', { todos: [{ id:'a', title:'x', status:'pending' }] })).slice(0,80) };
`);

hasil.autoFix = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  return { hasil: r };
`);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
