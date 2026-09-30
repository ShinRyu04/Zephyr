import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';
const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);
await cdp.send('Log.enable');
await cdp.send('Runtime.enable');
const errs = [];
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error' || p.type === 'warning') {
    errs.push(p.args.map(a => a.value || a.description || '').join(' ').slice(0, 200));
  }
});
cdp.on('Runtime.exceptionThrown', (p) => {
  errs.push('EXC: ' + (p.exceptionDetails?.exception?.description || '').slice(0, 200));
});
const r = await cdp.runAsync(`
  const reg = await import('/src/lib/editorRegistry.ts');
  const v = reg.getActiveView();
  v.dispatch({ selection: { anchor: v.state.doc.line(700).from } });
  await wait(1500);
  return { zbr: document.querySelectorAll('.cm-zbr').length };
`, 60000);
console.log('hasil:', JSON.stringify(r));
console.log('ERRORS:', errs.length ? errs.join(' | ') : '(tidak ada)');
cdp.close();
