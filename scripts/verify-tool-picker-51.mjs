/**
 * verify-tool-picker-51.mjs - verifikasi picker tool lewat DOM aplikasi hidup.
 *
 *   node scripts/verify-tool-picker-51.mjs [port]
 *
 * Kontrak UI:
 *   - hanya dua kepala tingkat atas: BUILT-IN dan MCP
 *   - 11 tool web/browser berada di bawah BUILT-IN, tanpa label Optional
 *   - keadaan dasar 40/51: BUILT-IN 26/37, MCP 14/14
 *   - All on -> 51/51; All off -> kembali 40/51
 *   - nama MCP ditampilkan polos, bukan awalan protokol mcp__tedi__
 *   - tidak ada nama aplikasi di teks picker
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
  const klik = (s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error('elemen tidak ditemukan: ' + s);
    el.click();
  };

  /* Buka picker dengan jalur UI yang dipakai user. */
  if (!document.querySelector('[data-testid="toolgate"]')) {
    klik('[data-testid="ai-toolgate"]');
    await tidur(250);
  }

  /* Keadaan dasar harus selalu bisa dipulihkan dari UI. */
  klik('[data-testid="toolgate-all-off"]');
  await tidur(150);

  /* Buka dua section dan seluruh grup sebelum memeriksa anaknya. Status lipat
     adalah preferensi tampilan dan bisa tersisa dari interaksi sebelumnya;
     verifikasi tidak boleh bergantung pada urutan uji atau klik user. */
  for (const tombol of document.querySelectorAll('.tg-bagian-head .tg-caret[aria-expanded="false"]')) {
    tombol.click();
  }
  await tidur(100);
  for (const tombol of document.querySelectorAll('.tg-grup-head .tg-caret[aria-expanded="false"]')) {
    tombol.click();
  }
  await tidur(100);

  const ambil = () => {
    const panel = document.querySelector('[data-testid="toolgate"]');
    const bagian = [...panel.querySelectorAll(':scope .tg-bagian')].map((b) => ({
      id: b.getAttribute('data-testid'),
      label: b.querySelector('.tg-bagian-nama')?.textContent?.trim() ?? '',
      count: b.querySelector('.tg-bagian-angka')?.textContent?.trim() ?? '',
      groups: [...b.querySelectorAll(':scope > .tg-grup')].map((g) =>
        g.querySelector('.tg-nama-grup')?.textContent?.trim() ?? '',
      ),
    }));
    const namaBaris = [...panel.querySelectorAll('.tg-nama')].map((e) => e.textContent?.trim() ?? '');
    return {
      bagian,
      total: panel.querySelector('[data-testid="toolgate-total"]')?.textContent?.trim() ?? '',
      trigger: document.querySelector('[data-testid="ai-toolgate-angka"]')?.textContent?.trim() ?? '',
      namaBaris,
      teks: panel.textContent ?? '',
      jumlahSwitch: panel.querySelectorAll('.tg-row').length,
    };
  };

  const dasar = ambil();
  klik('[data-testid="toolgate-all-on"]');
  await tidur(150);
  const semuaNyala = ambil();
  klik('[data-testid="toolgate-all-off"]');
  await tidur(150);
  const kembali = ambil();

  return { dasar, semuaNyala, kembali };
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

const label = hasil.dasar.bagian.map((b) => b.label);
const builtin = hasil.dasar.bagian.find((b) => b.label === 'BUILT-IN');
const mcp = hasil.dasar.bagian.find((b) => b.label === 'MCP');

console.log('\n== Struktur ==');
cek('tepat dua header tingkat atas', label.length === 2, { label });
cek('header persis BUILT-IN lalu MCP', JSON.stringify(label) === JSON.stringify(['BUILT-IN', 'MCP']), { label });
cek('BUILT-IN berisi grup Web', builtin?.groups.includes('Web'), { grup: builtin?.groups });
cek('BUILT-IN berisi grup Browser', builtin?.groups.includes('Browser'), { grup: builtin?.groups });
cek('MCP tidak berisi Web/Browser', !mcp?.groups.some((g) => g === 'Web' || g === 'Browser'), { grup: mcp?.groups });
cek('tidak ada label Optional', !/optional/i.test(hasil.dasar.teks));
cek('tidak ada nama aplikasi di picker', !/Zephyr|TEDI/.test(hasil.dasar.teks));
cek('nama MCP tampil polos', hasil.dasar.namaBaris.includes('inspect') && !hasil.dasar.namaBaris.some((n) => n.includes('mcp__')), {
  contoh: hasil.dasar.namaBaris.filter((n) => n.includes('inspect') || n.includes('mcp__')).slice(0, 5),
});

console.log('\n== Counter dasar ==');
cek('footer 40 of 51 on', hasil.dasar.total === '40 of 51 on', { dapat: hasil.dasar.total });
cek('trigger 40/51', hasil.dasar.trigger === '40/51', { dapat: hasil.dasar.trigger });
cek('BUILT-IN 26/37', builtin?.count === '26/37', { dapat: builtin?.count });
cek('MCP 14/14', mcp?.count === '14/14', { dapat: mcp?.count });

console.log('\n== All on / All off ==');
cek('All on menghasilkan 51 of 51 on', hasil.semuaNyala.total === '51 of 51 on', { dapat: hasil.semuaNyala.total });
cek('trigger sesudah All on = 51/51', hasil.semuaNyala.trigger === '51/51', { dapat: hasil.semuaNyala.trigger });
cek('All off kembali 40 of 51 on', hasil.kembali.total === '40 of 51 on', { dapat: hasil.kembali.total });
cek('trigger sesudah All off = 40/51', hasil.kembali.trigger === '40/51', { dapat: hasil.kembali.trigger });

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
