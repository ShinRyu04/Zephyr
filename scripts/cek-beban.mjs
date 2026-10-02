/**
 * cek-beban.mjs - lihat apa yang dirender saat daftar langkah diisi banyak.
 *
 *   node scripts/cek-beban.mjs [port]
 *
 * Alat bantu. Menjawab: kenapa tumpukan status tidak muncul saat `agentSteps`
 * diisi 25 langkah padahal dengan 10 langkah ia muncul.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const isi = await cdp.json(`return JSON.stringify(await (async () => {
  const a = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'aiStore.ts');
  const langkah = [];
  for (let i = 0; i < 25; i++) {
    langkah.push({
      tool: 'read_file',
      args: '{ path: "/src/a/b/c/berkas-' + i + '.tsx" }',
      at: Date.now() + i,
      ok: true,
      ms: 40 + i,
    });
  }
  a.useAi.setState({ agentBusy: true, agentSteps: langkah, agentPhase: 'working' });
  await new Promise((res) => setTimeout(res, 1000));
  const s = a.useAi.getState();
  return { busy: s.agentBusy, jumlah: (s.agentSteps || []).length, phase: s.agentPhase };
})())`);

console.log('store:', isi);

const dom = await cdp.json(`return JSON.stringify((() => {
  const stack = document.querySelector('.ai-work-stack');
  return {
    adaStack: !!stack,
    isiRingkas: stack ? stack.innerText.slice(0, 200) : null,
    anak: stack ? stack.children.length : 0,
    kelasAnak: stack ? [...stack.children].map((e) => String(e.className)) : [],
    body: !!document.querySelector('.ai-work-body'),
    panjang: !!document.querySelector('.ai-work-long'),
    semuaKelas: [...document.querySelectorAll('[class^=ai-work]')].map((e) => String(e.className)),
  };
})())`);

console.log('dom:', dom);

await cdp.close();
process.exit(0);
