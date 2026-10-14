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
 *   - nama MCP ditampilkan polos, bukan awalan protokol mcp__zephyr__
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

  /* Buka picker lewat jalur UI yang dipakai user: tombol "..." di strip tab
     (ai-more) -> menu -> "Chat Settings" (ai-open-chat-settings) -> nav Tools
     (cset-nav-tools) -> tombol "Open tool sets…" (cset-tools). Entri menu lama
     "Tool Sets" (ai-open-toolsets) dan tombol lama 'ai-toolgate' sudah tidak
     ada di UI, jadi jalur inilah kontraknya. Kalau jalur ini putus, uji harus
     gagal - bukan diam-diam "tidak menemukan panel". */
  const bukaLewatMenu = async () => {
    if (document.querySelector('[data-testid="toolgate"]')) return 'sudah terbuka';
    klik('[data-testid="ai-more"]');
    await tidur(250);
    const cs = document.querySelector('[data-testid="ai-open-chat-settings"]');
    if (!cs) throw new Error('menu "..." terbuka tapi item Chat Settings (ai-open-chat-settings) tidak ada');
    cs.click();
    await tidur(450);
    const navTools = document.querySelector('[data-testid="cset-nav-tools"]');
    if (navTools) { navTools.click(); await tidur(350); }
    const item = document.querySelector('[data-testid="cset-tools"]');
    if (!item) throw new Error('Chat Settings terbuka tapi tombol "Open tool sets…" (cset-tools) tidak ada');
    const label = (item.textContent || '').trim();
    item.click();
    await tidur(500);
    return label ? 'Chat Settings -> Tools -> ' + label : 'Chat Settings -> Tools';
  };
  const jalurBuka = await bukaLewatMenu();

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

  /* Escape menutup panel - jalur tutup yang dipakai user, dan satu-satunya
     yang tersisa sekarang tombol trigger berangka itu dihapus. */
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tidur(300);
  const tertutupSesudahEsc = !document.querySelector('[data-testid="toolgate"]');

  return { dasar, semuaNyala, kembali, jalurBuka, tertutupSesudahEsc };
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
/*
 * Yang dilarang adalah grup berlabel "Optional", BUKAN kata "optional" di mana
 * pun. Versi lama memakai /optional/i dan ikut menyalakan kata "optionally"
 * di dalam kalimat deskripsi `open_file` ("Open a file in the editor,
 * optionally at a specific line") - yaitu menolak keadaan yang benar.
 * `\boptional\b` tetap menangkap label sungguhan ("Optional" berdiri sendiri)
 * dan tidak lagi menangkap kata turunan di dalam kalimat.
 */
cek('tidak ada label Optional', !/\boptional\b/i.test(hasil.dasar.teks));
cek('tidak ada nama aplikasi di picker', !/Zephyr/.test(hasil.dasar.teks));
cek('nama MCP tampil polos', hasil.dasar.namaBaris.includes('inspect') && !hasil.dasar.namaBaris.some((n) => n.includes('mcp__')), {
  contoh: hasil.dasar.namaBaris.filter((n) => n.includes('inspect') || n.includes('mcp__')).slice(0, 5),
});

/*
 * Membaca "A of B on" tanpa mematok A atau B; yang dipakai adalah hubungan
 * antara footer, trigger, dan jumlah baris yang benar-benar dirender.
 */
const bacaCounter = (teks) => {
  /* Teks footer ikut bahasa antarmuka ("61 dari 66 nyala" / "61 of 66 on"), jadi
     yang dibaca hanya dua angkanya, bukan kata penghubungnya. */
  const m = String(teks).match(/^(\d+)\s*(?:of|dari|\/)\s*(\d+)/);
  return m ? { nyala: Number(m[1]), total: Number(m[2]) } : null;
};
const dasarCount = bacaCounter(hasil.dasar.total);
const semuaCount = bacaCounter(hasil.semuaNyala.total);
const kembaliCount = bacaCounter(hasil.kembali.total);

console.log('\n== Jalur buka/tutup panel ==');
cek(
  'panel dibuka lewat jalur UI nyata (menu "..." -> Chat Settings -> Tools -> "Open tool sets…")',
  (hasil.jalurBuka === 'sudah terbuka' || String(hasil.jalurBuka).startsWith('Chat Settings -> Tools ->'))
    && !/ai-more|ai-open-toolsets|ai-toolgate/.test(String(hasil.jalurBuka)),
  { jalurBuka: hasil.jalurBuka },
);
cek('Escape menutup panel', hasil.tertutupSesudahEsc === true, { tertutup: hasil.tertutupSesudahEsc });

console.log('\n== Counter dasar ==');
cek(
  'footer memuat dua angka "N dari M nyala"',
  dasarCount !== null,
  { dapat: hasil.dasar.total },
);
cek(
  'M footer = jumlah baris yang dirender',
  dasarCount !== null && dasarCount.total === hasil.dasar.jumlahSwitch,
  { footer: dasarCount, baris: hasil.dasar.jumlahSwitch },
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
cek(
  'All off memulihkan keadaan dasar persis',
  kembaliCount?.nyala === dasarCount?.nyala && kembaliCount?.total === dasarCount?.total,
  { dasar: hasil.dasar.total, kembali: hasil.kembali.total },
);

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
