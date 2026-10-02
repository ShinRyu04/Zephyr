/**
 * verify-tool-picker-51.mjs - verifikasi picker tool lewat DOM aplikasi hidup.
 *
 *   node scripts/verify-tool-picker-51.mjs [port]
 *
 * Kontrak UI:
 *   - hanya dua kepala tingkat atas: BUILT-IN dan MCP
 *   - 11 tool web/browser berada di bawah BUILT-IN, tanpa label Optional
 *   - keadaan dasar: semua tool inti ON, semua web OFF
 *   - All on -> semua ON; All off -> kembali seperti keadaan dasar
 *   - nama MCP ditampilkan polos, bukan awalan protokol mcp__tedi__
 *   - tidak ada nama aplikasi di teks picker
 *
 * Angka "N of M on" TIDAK dipatok di sini. Versi lama mematok '40 of 51 on'
 * dan '26/37', sehingga setiap tool baru memaksa sunting berkas ini - dan
 * sunting itu mudah dibuat salah. Yang diperiksa sekarang: total pada footer
 * HARUS SAMA dengan jumlah baris yang benar-benar dirender, dan keadaan dasar
 * harus dapat dipulihkan persis dengan All on lalu All off.
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

/*
 * Membaca "A of B on" tanpa mematok A atau B; yang dipakai adalah hubungan
 * antara footer, trigger, dan jumlah baris yang benar-benar dirender.
 */
const bacaCounter = (teks) => {
  const m = String(teks).match(/^(\d+)\s*(?:of|\/)\s*(\d+)/);
  return m ? { nyala: Number(m[1]), total: Number(m[2]) } : null;
};
const dasarCount = bacaCounter(hasil.dasar.total);
const dasarTrigger = bacaCounter(hasil.dasar.trigger);
const semuaCount = bacaCounter(hasil.semuaNyala.total);
const semuaTrigger = bacaCounter(hasil.semuaNyala.trigger);
const kembaliCount = bacaCounter(hasil.kembali.total);
const kembaliTrigger = bacaCounter(hasil.kembali.trigger);

console.log('\n== Counter dasar ==');
cek(
  'footer memakai bentuk "N of M on"',
  dasarCount !== null && /^\d+ of \d+ on$/.test(hasil.dasar.total),
  { dapat: hasil.dasar.total },
);
cek(
  'M footer = jumlah baris yang dirender',
  dasarCount !== null && dasarCount.total === hasil.dasar.jumlahSwitch,
  { footer: dasarCount, baris: hasil.dasar.jumlahSwitch },
);
cek(
  'trigger dasar cocok dengan footer',
  dasarTrigger !== null && dasarTrigger.nyala === dasarCount?.nyala && dasarTrigger.total === dasarCount?.total,
  { trigger: dasarTrigger, footer: dasarCount },
);
cek(
  'keadaan dasar: web/browser OFF',
  dasarCount !== null && dasarCount.nyala < dasarCount.total,
  { dapat: hasil.dasar.total },
);
cek('MCP penuh: seluruh tool MCP nyala', /^(\d+)\/\1$/.test(String(mcp?.count ?? '')), { dapat: mcp?.count });

console.log('\n== All on / All off ==');
cek(
  'All on: semua nyala',
  semuaCount !== null && semuaCount.nyala === semuaCount.total && semuaCount.total === dasarCount?.total,
  { dapat: hasil.semuaNyala.total },
);
cek('trigger sesudah All on = M/M', /^(\d+)\/\1$/.test(String(hasil.semuaNyala.trigger)), {
  dapat: hasil.semuaNyala.trigger,
});
cek(
  'All off memulihkan keadaan dasar persis',
  kembaliCount?.nyala === dasarCount?.nyala && kembaliCount?.total === dasarCount?.total,
  { dasar: hasil.dasar.total, kembali: hasil.kembali.total },
);
cek(
  'trigger sesudah All off = keadaan dasar',
  kembaliTrigger?.nyala === dasarTrigger?.nyala && kembaliTrigger?.total === dasarTrigger?.total,
  { dasar: hasil.dasar.trigger, kembali: hasil.kembali.trigger },
);

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
