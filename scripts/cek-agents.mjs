/*
 * Periksa isi jendela Agents yang hidup: layout, kolom, dan composer.
 *
 * CATATAN PENTING: `Cdp.attach` sengaja MEMILIH jendela utama (skor 0) di atas
 * target ber-hash (skor 2) — lihat komentar di lib-cdp.mjs. Untuk jendela ini
 * harus dipilih manual lewat `Cdp.connect(webSocketDebuggerUrl)` target
 * `#agents`, kalau tidak semua hasil terbaca dari main window dan palsu.
 *
 * Usage: node scripts/cek-agents.mjs [port]
 */
import { Cdp } from './lib-cdp.mjs';

const port = Number(process.argv[2] || 9223);
const daftar = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = daftar.find((t) => t.type === 'page' && t.url.includes('#agents'));
if (!page) {
  console.error('jendela Agents tidak terbuka di port', port);
  process.exit(1);
}
const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
if ((await cdp.eval('1+1', 4000)) !== 2) {
  console.error('target #agents tidak menjawab');
  process.exit(1);
}

const hasil = await cdp.eval(`(() => {
  const q = (s) => !!document.querySelector(s);
  const t = (s) => document.querySelector(s)?.textContent?.trim().slice(0, 60) ?? null;
  return {
    hash: location.hash,
    layout: q('[data-testid="agents-layout"]'),
    titlebar: q('[data-testid="agents-titlebar"]'),
    kolomSesi: q('[data-testid="ag-sessions"]'),
    tombolTugasBaru: q('[data-testid="ag-new-session"]'),
    mulai: q('[data-testid="ag-start-here"]') || q('[data-testid="ag-conversation"]'),
    composer: q('[data-testid="agx-composer"]'),
    judulLayar: t('.ag-start-title, h1'),
    jumlahSesi: document.querySelectorAll('.ag-sesi-item, .ag-sesi-row').length,
    pesanError: t('.ag-error, [role="alert"]'),
  };
})()`);
console.log(JSON.stringify(hasil, null, 2));
cdp.close();
process.exit(0);
