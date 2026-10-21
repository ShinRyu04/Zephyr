import { panelCdp } from './panel-cdp.mjs';

const hasil = {};

/* ── 1. Settings: conversation keys exist and default sanely ─────────────── */
const c = await panelCdp(9223, '#panel=agents&seksi=conversations');
await new Promise((r) => setTimeout(r, 1200));

hasil.kontrol = JSON.parse(
  await c.eval(`JSON.stringify((()=>{
    const q = (s) => document.querySelectorAll(s).length;
    const ada = (id) => !!document.querySelector('[data-testid="'+id+'"]');
    return {
      saklar: q('.conv-saklar'),
      pilih: q('.conv-pilih'),
      volume: ada('agx-conv-notif-volume'),
      bagian: q('.conv-set'),
      semuaTestid: [
        'agx-conv-todo-ide','agx-conv-todo-solo','agx-conv-lint-ide','agx-conv-lint-solo',
        'agx-conv-tanya-ide','agx-conv-tanya-solo','agx-conv-review-jump',
        'agx-conv-notif-banner','agx-conv-notif-sound','agx-conv-notif-volume',
        'agx-conv-review-scope','agx-conv-terminal-env','agx-conv-terminal-open',
        'agx-conv-sound-completed','agx-conv-sound-waiting','agx-conv-sound-stopped'
      ].filter((id) => !ada(id)),
    };
  })())`),
);

/* ── 2. Auto Fix Lints: the Rust command is registered and callable ─────── */
hasil.autoFix = JSON.parse(
  await c.eval(`JSON.stringify(await (async()=>{
    try {
      const core = await import('@tauri-apps/api/core');
      const r = await core.invoke('lint_fix_files', { root: 'D:/Zephyr', paths: ['src/lib/autoFix.ts'] });
      return { ok: true, alat: r.alat, pesan: String(r.pesan||'').slice(0,90), berubah: (r.berubah||[]).length };
    } catch (e) { return { ok: false, galat: String(e).slice(0,200) }; }
  })())`),
);

/* ── 3. ask_user is in the tool catalogue the model receives ─────────────── */
hasil.askUser = JSON.parse(
  await c.eval(`JSON.stringify(await (async()=>{
    const m = await import('/src/lib/zephyrTools/catalog.ts');
    return {
      diKatalog: m.TOOL_CATALOG.some(t => t.name === 'ask_user'),
      dikirimSelalu: m.TOOL_DIKIRIM_SELALU.includes('ask_user'),
    };
  })())`),
);

/* ── 4. The policy modules answer from the live settings ────────────────── */
hasil.policy = JSON.parse(
  await c.eval(`JSON.stringify(await (async()=>{
    const t = await import('/src/lib/terminalAgent.ts');
    const r = await import('/src/lib/reviewUbah.ts');
    return {
      terminalEfisien: t.keputusanTerminal('npm run build').lingkungan,
      terminalLatar: t.tampakLatar('npm run dev'),
      terminalBukanLatar: t.tampakLatar('npm run build'),
      cakupan: r.cakupanReview(),
      simpan: r.simpanCheckpoint(),
      buangLatest: r.checkpointYangDibuang('latest', ['a','b','c'], 'c'),
      buangAll: r.checkpointYangDibuang('all', ['a','b','c'], 'c'),
    };
  })())`),
);

/* ── 5. Sound synthesis: a tone is scheduled, and volume reaches the gain ── */
hasil.bunyi = JSON.parse(
  await c.eval(`JSON.stringify(await (async()=>{
    const m = await import('/src/lib/bunyiNotif.ts');
    const nol = m.mainkanNada('selesai', 0);
    const biasa = m.mainkanNada('selesai', 100);
    const pelan = m.mainkanNada('menunggu', 20);
    return {
      volume0: nol, volume100: biasa, volume20: pelan,
      namaNone: m.nadaDariNama('none','selesai'),
      namaChime: m.nadaDariNama('chime','selesai'),
      namaDefault: m.nadaDariNama('default','berhenti'),
    };
  })())`),
);

c.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);
