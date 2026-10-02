/**
 * periksa-rilis.mjs - melihat struktur UI exe rilis, untuk menyusun harness.
 *
 *   node scripts/periksa-rilis.mjs [port]
 *
 * Bukan uji: ini alat bantu. Exe rilis tidak punya bridge dev, jadi nama kelas
 * dan label tombolnya harus DILIHAT dulu sebelum harness bisa menunjuknya.
 * Menebak nama dari kode sumber dev sudah beberapa kali keliru.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9444';
const { cdp } = await Cdp.attach(PORT);

async function lihat(nama, expr) {
  /* Kutip tunggal dipakai di dalam ekspresi supaya tidak berkelahi dengan
     template literal di sini. */
  const hasil = await cdp.eval('JSON.stringify(' + expr + ')');
  console.log(nama + ':', hasil);
}

/* Semua tombol ActivityBar beserta labelnya. */
await lihat(
  'activitybar',
  "(() => { const b = [...document.querySelectorAll('.activitybar button, .activitybar [role=button]')]; " +
    "return b.map((x, i) => i + ':' + ((x.getAttribute('aria-label') || x.title || x.textContent || '').trim().slice(0, 28))); })()",
);

/* Struktur halaman yang sedang tampil. */
await lihat(
  'halaman',
  "(() => ({ settings: !!document.querySelector('.settings-page, .set-root, [class*=settings-]'), " +
    "panel: !!document.querySelector('.panel, .pts-root'), " +
    "kelasUtama: [...document.querySelectorAll('[class]')].map(e => String(e.className)).filter(c => /setting|set-/.test(c)).slice(0, 10) }))()",
);

/* Semua role=switch yang ada, untuk menemukan sakelar MCP. */
await lihat(
  'switch',
  "(() => { const s = [...document.querySelectorAll('[role=switch]')]; " +
    "return { jumlah: s.length, checked: s.map(x => x.getAttribute('aria-checked')) }; })()",
);

/* Presensi halaman Settings di DOM. */
await lihat(
  'adaSettings',
  "(() => ({ ada: !!document.querySelector('.settings-page'), body: document.body.innerText.slice(0, 120) }))()",
);

await cdp.close();
process.exit(0);
