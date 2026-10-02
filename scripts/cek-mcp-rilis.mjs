/**
 * cek-mcp-rilis.mjs - lihat apa yang dikatakan UI tentang status server MCP.
 *
 *   node scripts/cek-mcp-rilis.mjs [port]
 *
 * Alat bantu, bukan uji. Dipakai untuk membedakan dua kemungkinan yang
 * gejalanya sama: "servernya tidak pernah dinyalakan" dan "servernya gagal bind
 * lalu melaporkan error yang tidak terbaca".
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9444';
const { cdp } = await Cdp.attach(PORT);

async function lihat(nama, expr) {
  const hasil = await cdp.eval('JSON.stringify(' + expr + ')');
  console.log(nama + ':', hasil);
}

/* Baris teks yang menyebut MCP atau port. */
await lihat(
  'barisMcp',
  "(() => { const L = (document.body.innerText || '').split(String.fromCharCode(10)); " +
    "return L.map(x => x.trim()).filter(x => /mcp|9222|9223|9224|port/i.test(x)).slice(0, 16); })()",
);

/* Sakelar dan tetangganya di section yang sedang terbuka. */
await lihat(
  'switch',
  "(() => { const s = [...document.querySelectorAll('[role=switch]')]; " +
    "return s.map(x => ({ checked: x.getAttribute('aria-checked'), teks: (x.parentElement ? x.parentElement.textContent : '').trim().slice(0, 90) })); })()",
);

/* Tombol di section aktif, untuk menemukan tombol "Nyalakan". */
await lihat(
  'tombolSection',
  "(() => [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => t && t.length < 40).slice(0, 24))()",
);

/* Section mana yang sedang aktif. */
await lihat(
  'sectionAktif',
  "(() => { const a = document.querySelector('.set-nav-item.is-active'); " +
    "return a ? a.textContent.trim() : null; })()",
);

await cdp.close();
process.exit(0);
