/**
 * cek-kontrak-40.mjs - buktikan kontrak 40 inti di aplikasi yang HIDUP.
 *
 *   node scripts/cek-kontrak-40.mjs [port]
 *
 * Verifikasi katalog membuktikan KATALOGNYA benar. Berkas ini membuktikan
 * yang berbeda: bahwa sekat yang benar-benar dipakai aplikasi saat berjalan
 * sudah menerima kontrak itu. Dua hal itu bisa berbeda - katalog bisa benar
 * sementara store belum pernah membacanya.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const WEB = [
  'web_search', 'web_fetch', 'browser_open', 'browser_read', 'browser_click',
  'browser_type', 'browser_nav', 'browser_list', 'browser_close',
  'browser_download_url', 'system_browser_open',
];

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const { AGENT_TOOLS } = await import('/src/lib/agentTools.ts');
  const { useToolGate, TOOL_INTI } = await import('/src/lib/toolGate.ts');
  const aktif = useToolGate.getState().aktif;
  const nama = AGENT_TOOLS.map((t) => t.spec.name);
  const web = ${JSON.stringify(WEB)};
  return {
    terpasang: nama.length,
    inti: TOOL_INTI.length,
    aktif: aktif.size,
    intiKurang: TOOL_INTI.filter((n) => !aktif.has(n)),
    webMenyala: web.filter((w) => aktif.has(w)),
    popoverSubagents: !!document.querySelector('[data-testid="ai-subagents-trigger"]'),
  };
})())`);

let lulus = 0;
let gagal = 0;
const cek = (nama, syarat, rincian) => {
  if (syarat) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    console.log('  GAGAL  ' + nama + (rincian ? '  -> ' + JSON.stringify(rincian) : ''));
  }
};

console.log('\n== Kontrak tool di aplikasi yang hidup ==');
cek('51 tool terpasang', hasil.terpasang === 51, { dapat: hasil.terpasang });
cek('40 tool inti terdaftar', hasil.inti === 40, { dapat: hasil.inti });
cek('40 tool inti AKTIF', hasil.intiKurang.length === 0, { kurang: hasil.intiKurang });
cek('tidak ada tool web yang menyala', hasil.webMenyala.length === 0, { bocor: hasil.webMenyala });
cek('popover subagents sudah hilang', hasil.popoverSubagents === false);

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
