/**
 * cek-error-panel.mjs - baca error yang membuat tumpukan status tidak dirender.
 *
 *   node scripts/cek-error-panel.mjs [port]
 *
 * Alat bantu. Menjawab: ketika store terisi tapi tumpukannya tidak muncul,
 * apakah ada exception yang tertangkap, atau ada syarat render yang tidak
 * terpenuhi.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

/* Pasang penangkap error SEBELUM mengisi state. */
await cdp.eval(`(() => {
  window.__err = [];
  window.addEventListener('error', (e) => window.__err.push('error: ' + (e.message || '').slice(0, 200)));
  window.addEventListener('unhandledrejection', (e) => window.__err.push('reject: ' + String(e.reason).slice(0, 200)));
  const asli = console.error;
  console.error = (...a) => { window.__err.push('console: ' + a.map(String).join(' ').slice(0, 200)); asli.apply(console, a); };
  return true;
})()`);

/* Isi state seperti harness. */
const isi = await cdp.json(`return JSON.stringify(await (async () => {
  const st = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'store.ts');
  st.useStore.getState().setAiOpen(true);
  await new Promise((res) => setTimeout(res, 700));

  const a = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'aiStore.ts');
  const langkah = [];
  for (let i = 0; i < 6; i++) {
    langkah.push({ tool: 'read_file', args: '{ path: "a.ts" }', at: Date.now() + i, ok: true, ms: 100 + i });
  }
  a.useAi.setState({ agentBusy: true, agentSteps: langkah, agentPhase: 'working' });
  await new Promise((res) => setTimeout(res, 1200));

  const s = a.useAi.getState();
  return {
    agentBusy: s.agentBusy,
    langkah: (s.agentSteps || []).length,
    stack: !!document.querySelector('.ai-work-stack'),
    stackKosong: s.stackKosong === undefined ? 'tidak ada field' : s.stackKosong,
    adaChat: !!document.querySelector('.ai-chat'),
    /* Apakah ada elemen yang MIRIP tumpukan, dengan kelas lain? */
    kandidat: [...document.querySelectorAll('[class*=work], [class*=status-stack], [class*=composer]')]
      .map((e) => String(e.className))
      .slice(0, 10),
  };
})())`);

console.log('state:', JSON.stringify(isi, null, 1));

const err = await cdp.eval(`JSON.stringify((window.__err || []).slice(0, 10))`);
console.log('error:', err);

await cdp.close();
process.exit(0);
