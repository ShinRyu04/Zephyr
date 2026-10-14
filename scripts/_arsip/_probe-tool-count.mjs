/*
 * Berapa tool yang benar-benar terlihat model, dan atas nama apa?
 *
 * Dipakai sekali untuk menuliskan angka yang BENAR di komentar registry
 * (komentar lamanya menyebut 51/26 dan sudah tidak cocok dengan kodenya).
 *
 *   node scripts/_probe-tool-count.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const d = await cdp.json(`return JSON.stringify(await (async () => {
  const at = await import('/src/lib/agentTools.ts');
  const cat = await import('/src/lib/zephyrTools/catalog.ts');
  const b = await import('/src/lib/zephyrTools/builtins.ts');
  const m = await import('/src/lib/zephyrTools/mcp.ts');
  const w = await import('/src/lib/zephyrTools/web.ts');
  const nama = at.AGENT_TOOLS.map((t) => t.spec.name);
  return {
    agent: nama.length,
    bawaan: b.TOOL_BAWAAN.length,
    mcp: m.TOOL_MCP.length,
    web: w.TOOL_WEB.length,
    katalog: cat.TOOL_CATALOG.length,
    adaFetch: nama.includes('fetch'),
    adaWebFetch: nama.includes('web_fetch'),
    dikirimSelalu: cat.TOOL_DIKIRIM_SELALU.length,
    webAktif: cat.TOOL_WEB_AKTIF_AWAL.length,
  };
})())`);

console.log(JSON.stringify(d, null, 2));
await cdp.close?.();
