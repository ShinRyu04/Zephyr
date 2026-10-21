import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');

/* Find the EXACT module URLs the running app loaded, including HMR timestamps. */
const urls = JSON.parse(
  await c.eval(`JSON.stringify((()=>{
    const res = performance.getEntriesByType('resource').map(e => e.name);
    const cari = (bagian) => res.find(n => n.includes(bagian)) ?? null;
    return {
      store: cari('/src/lib/store.ts'),
      ai: cari('/src/lib/aiStore.ts'),
      tools: cari('/src/lib/agentTools.ts'),
      terminal: cari('/src/lib/terminalAgent.ts'),
      review: cari('/src/lib/reviewUbah.ts'),
      autoFix: cari('/src/lib/autoFix.ts'),
      notif: cari('/src/lib/notifikasiAi.ts'),
      bunyi: cari('/src/lib/bunyiNotif.ts'),
    };
  })())`),
);
console.log('URL modul yang dipakai app:');
console.log(JSON.stringify(urls, null, 1));

c.close();
process.exit(0);
