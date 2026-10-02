/**
 * cek-token-mcp.mjs - apa yang terjadi saat "New token" diklik?
 *
 *   node scripts/cek-token-mcp.mjs [port]
 *
 * Alat bantu. Menjawab satu pertanyaan: setelah tombol New token ditekan, di
 * mana token barunya muncul? Harness yang menebak lokasinya (mis. mengira
 * selalu `input[type=password]`) akan gagal padahal tombolnya bekerja.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9444';
const { cdp } = await Cdp.attach(PORT);

async function lihat(nama, expr) {
  console.log(nama + ':', await cdp.eval('JSON.stringify(' + expr + ')'));
}

/* Pastikan halaman MCP terbuka. */
await lihat(
  'bukaMcp',
  "(() => { const s = [...document.querySelectorAll('.activitybar button, .activitybar [role=button]')].find(b => /settings/i.test((b.getAttribute('aria-label') || '') + (b.title || ''))); const sudah = !!document.querySelector('.set-nav-item'); if (s && !sudah) s.click(); return { sudah }; })()",
);
await new Promise((r) => setTimeout(r, 1200));

await lihat(
  'klikMcp',
  "(() => { const n = [...document.querySelectorAll('.set-nav-item')].find(x => /^mcp$/i.test((x.textContent || '').trim())); if (n) n.click(); return !!n; })()",
);
await new Promise((r) => setTimeout(r, 1000));

/* Keadaan sebelum. */
await lihat(
  'sebelum',
  "(() => ({ input: [...document.querySelectorAll('input')].map(i => ({ t: i.type, len: (i.value || '').length, ro: i.readOnly })), teks: (document.body.innerText || '').split(String.fromCharCode(10)).map(x => x.trim()).filter(x => /token|belum|none|kosong/i.test(x)).slice(0, 6) }))()",
);

/* Klik New token. */
await lihat(
  'klikNewToken',
  "(() => { const b = [...document.querySelectorAll('button')].find(x => /^new token$/i.test((x.textContent || '').trim())); if (!b) return { ada: false }; b.click(); return { ada: true, disabled: b.disabled }; })()",
);

await new Promise((r) => setTimeout(r, 2000));

/* Keadaan sesudah - SEMUA elemen yang mungkin memuat token. */
await lihat(
  'sesudah',
  "(() => ({ input: [...document.querySelectorAll('input')].map(i => ({ t: i.type, len: (i.value || '').length, ro: i.readOnly })), textarea: [...document.querySelectorAll('textarea')].map(t => (t.value || '').length), kode: [...document.querySelectorAll('code, pre, .token, [class*=token]')].map(e => (e.textContent || '').trim().slice(0, 60)).filter(Boolean).slice(0, 6), teks: (document.body.innerText || '').split(String.fromCharCode(10)).map(x => x.trim()).filter(x => /token|baru|dibuat|copy/i.test(x)).slice(0, 8) }))()",
);

await cdp.close();
process.exit(0);
