/**
 * cek-status-mcp.mjs - baca kartu status MCP apa adanya.
 *
 *   node scripts/cek-status-mcp.mjs [port]
 *
 * Alat bantu. Dipakai untuk menjawab satu pertanyaan: apa teks yang benar-benar
 * ditampilkan halaman MCP tentang servernya? Harness yang menebak bentuk teks
 * itu akan gagal setiap kali tata letaknya dirapikan.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9444';
const { cdp } = await Cdp.attach(PORT);

async function lihat(nama, expr) {
  console.log(nama + ':', await cdp.eval('JSON.stringify(' + expr + ')'));
}

/* Pastikan halaman MCP yang terbuka. */
await lihat(
  'buka',
  "(() => { const n = [...document.querySelectorAll('.set-nav-item')].find(x => /^mcp$/i.test((x.textContent || '').trim())); if (n) n.click(); return !!n; })()",
);

await new Promise((r) => setTimeout(r, 900));

/* Seluruh teks halaman, dipotong per baris - ini yang paling jujur. */
await lihat(
  'teksHalaman',
  "(() => { const t = (document.body.innerText || '').split(String.fromCharCode(10)).map(x => x.trim()).filter(Boolean); const i = t.findIndex(x => /^MCP$/i.test(x)); return t.slice(i, i + 30); })()",
);

/* Semua input di halaman, untuk menemukan kolom token. */
await lihat(
  'input',
  "(() => [...document.querySelectorAll('input')].map(i => ({ jenis: i.type, nilai: (i.value || '').slice(0, 44), readonly: i.readOnly })))()",
);

/* Tombol di halaman MCP. */
await lihat(
  'tombol',
  "(() => [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => t && t.length < 30))()",
);

await cdp.close();
process.exit(0);
