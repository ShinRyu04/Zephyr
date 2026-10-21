import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agents&seksi=conversations');
const out = [];
const langkah = async (nama, expr) => {
  try {
    const v = await c.eval(expr);
    out.push(`OK   ${nama} :: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  } catch (e) {
    out.push(`GAGAL ${nama} :: ${String(e.message ?? e).slice(0, 400)}`);
  }
};

await new Promise((r) => setTimeout(r, 1000));

await langkah(
  'kontrol',
  `JSON.stringify((()=>{
    const ada = (id) => !!document.querySelector('[data-testid="'+id+'"]');
    const wajib = ['agx-conv-todo-ide','agx-conv-todo-solo','agx-conv-lint-ide','agx-conv-lint-solo','agx-conv-tanya-ide','agx-conv-tanya-solo','agx-conv-review-jump','agx-conv-notif-banner','agx-conv-notif-sound','agx-conv-notif-volume','agx-conv-review-scope','agx-conv-terminal-env','agx-conv-terminal-open','agx-conv-sound-completed','agx-conv-sound-waiting','agx-conv-sound-stopped'];
    return {saklar:document.querySelectorAll('.conv-saklar').length, pilih:document.querySelectorAll('.conv-pilih').length, bagian:document.querySelectorAll('.conv-set').length, hilang:wajib.filter(id=>!ada(id))};
  })())`,
);

await langkah(
  'lint_fix_files',
  `(async()=>{
    try {
      const core = await import('/node_modules/.vite/deps/@tauri-apps_api_core.js').catch(()=>null);
      return JSON.stringify({core:!!core});
    } catch(e){ return JSON.stringify({err:String(e).slice(0,120)}); }
  })()`,
);

await langkah(
  'policy',
  `(async()=>{
    const t = await import('/src/lib/terminalAgent.ts');
    const r = await import('/src/lib/reviewUbah.ts');
    return JSON.stringify({
      env: t.keputusanTerminal('npm run build').lingkungan,
      latar: t.tampakLatar('npm run dev'),
      bukanLatar: t.tampakLatar('npm run build'),
      cakupan: r.cakupanReview(),
      simpan: r.simpanCheckpoint(),
      buangLatest: r.checkpointYangDibuang('latest', ['a','b','c'], 'c'),
      buangAll: r.checkpointYangDibuang('all', ['a','b','c'], 'c'),
    });
  })()`,
);

await langkah(
  'bunyi',
  `(async()=>{
    const m = await import('/src/lib/bunyiNotif.ts');
    return JSON.stringify({
      v0: m.mainkanNada('selesai', 0),
      v100: m.mainkanNada('selesai', 100),
      v20: m.mainkanNada('menunggu', 20),
      none: m.nadaDariNama('none','selesai'),
      chime: m.nadaDariNama('chime','selesai'),
      def: m.nadaDariNama('default','berhenti'),
    });
  })()`,
);

await langkah(
  'katalog',
  `(async()=>{
    const m = await import('/src/lib/zephyrTools/catalog.ts');
    return JSON.stringify({
      askUserDiKatalog: m.TOOL_CATALOG.some(t=>t.name==='ask_user'),
      askUserDikirim: m.TOOL_DIKIRIM_SELALU.includes('ask_user'),
      total: m.TOOL_COUNTS.total,
    });
  })()`,
);

await langkah(
  'notifikasiAi',
  `(async()=>{
    const m = await import('/src/lib/notifikasiAi.ts');
    m.catatMulaiRun('uji-x', Date.now() - 30000);
    m.catatSelesaiRun('uji-x', 'Zephyr test', 'done', 'selesai');
    return JSON.stringify({riwayat: m.riwayatNotifikasi().length, bunyi: m.riwayatBunyiNotif()});
  })()`,
);

c.close();
console.log(out.join('\n'));
process.exit(0);
