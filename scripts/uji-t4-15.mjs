// uji-t4-15.mjs — About ringkas ala TEDI + tautan komunitas/donasi.
//
// Permintaan user (verbatim): "UI untuk about atau tentang zephyr teks nya
// kebanyakan, dan jga buatkan kek sih TEDI dan ada view on github, report an
// issue ke github, untuk link wa itu group wa, dan donasi dll deh".
//
// Yang diuji:
//   V1  halaman About hidup, kartu identitas ada (logo + nama + versi)
//   V2  TIDAK ada lagi 3 tabel penuh (Build/Runtime/Data) — teks dipadatkan
//   V3  kartu detail: <= 6 baris, ada Website + Kode sumber sebagai tautan
//   V4  tombol wajib ada: Cek update, Lihat di GitHub, Laporkan masalah,
//       Grup WhatsApp, Dukung Zephyr
//   V5  URL-nya BENAR (repo, issues, grup WA, releases) — bukan karangan
//   V6  utilitas langka tetap bisa dijangkau (Salin info sistem dll)
//   V7  i18n: label berubah saat bahasa diganti (bukan teks Indonesia beku)
import { Cdp } from './lib-cdp.mjs';

const cek = (nama, syarat, info = '') => {
  console.log(`  ${syarat ? 'LULUS' : 'GAGAL'}  ${nama}${info ? `  ${info}` : ''}`);
  if (!syarat) process.exitCode = 1;
};

const { cdp } = await Cdp.attach(9223, 'Zephyr');
console.log('=== About ringkas ala TEDI ===\n');

// ── V1..V3: struktur kartu ────────────────────────────────────────────────
const r1 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  // Deterministik lewat store (ikon ActivityBar itu toggle — klik membabi
  // buta bergantung state run sebelumnya).
  S.getState().setActivity('settings');
  S.getState().setSettingsOpen(true);
  S.getState().setSidebarVisible(true);
  await new Promise((r) => setTimeout(r, 900));
  let nav = null;
  const t1 = Date.now() + 9000;
  while (Date.now() < t1 && !nav) {
    nav = document.querySelector('[data-testid="set-nav-about"]');
    if (!nav) await new Promise((r) => setTimeout(r, 200));
  }
  nav?.click();
  // Tunggu tombol About render (UpdatePanel + DiagnosticsPanel memanggil Rust).
  const t2 = Date.now() + 9000;
  while (Date.now() < t2 && !document.querySelector('[data-testid="about-donate"]')) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const kartu = document.querySelector('[data-testid="about-kartu"]');
  const tabel = document.querySelector('[data-testid="about-table"]');
  const baris = tabel ? tabel.querySelectorAll('tr').length : 0;
  return {
    navAda: !!nav,
    navId: nav?.getAttribute('data-testid'),
    adaKartu: !!kartu,
    adaLogo: !!kartu?.querySelector('img'),
    nama: kartu?.querySelector('.about-name')?.textContent?.trim(),
    versi: document.querySelector('[data-testid="about-ver"]')?.textContent?.trim(),
    adaTabel: !!tabel,
    jumlahBaris: baris,
    // Sisa tabel lama: harus TIDAK ada lagi.
    adaGrupBuild: !!document.querySelector('[data-testid="about-grup-Build"]'),
    adaGrupRuntime: !!document.querySelector('[data-testid="about-grup-Runtime"]'),
    adaGrupData: !!document.querySelector('[data-testid="about-grup-Data"]'),
  };
})())`,
  90000,
);
cek('halaman About hidup + nav ketemu', r1.adaKartu === true, r1.navId || 'nav tidak ketemu');
cek('kartu identitas ada (logo + nama)', r1.adaLogo === true && /zephyr/i.test(r1.nama || ''), r1.nama);
cek('versi tampil di kartu',
  (r1.versi || '').startsWith('v') && (r1.versi || '').length > 2, r1.versi);
cek('tabel Build/Runtime/Data lama HILANG', r1.adaGrupBuild === false && r1.adaGrupRuntime === false && r1.adaGrupData === false);
cek('detail dipadatkan (<= 6 baris)', r1.adaTabel === true && r1.jumlahBaris <= 6, `${r1.jumlahBaris} baris`);

// ── V4..V5: tombol + URL benar ───────────────────────────────────────────
const r2 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const btn = (id) => document.querySelector('[data-testid="' + id + '"]');
  return {
    update: !!btn('about-update'),
    github: !!btn('about-github'),
    issue: !!btn('about-issue'),
    wa: !!btn('about-wa'),
    donate: !!btn('about-donate'),
    source: !!btn('about-source'),
    // Utilitas langka
    copy: !!btn('about-copy'),
    logs: !!btn('about-logs'),
    data: !!btn('about-data'),
    releases: !!btn('about-releases'),
  };
})())`,
  90000,
);
for (const [nama, ada] of Object.entries(r2)) {
  cek(`tombol "${nama}" ada`, ada === true);
}

// URL diperiksa dari SUMBER komponen — bukan ditebak dari DOM (tombol tidak
// menyimpan href). Kalau URL-nya salah, uji ini gagal.
const fs = await import('node:fs');
const sumber = fs.readFileSync('src/components/settings/SectionsMisc.tsx', 'utf8');
const urlHarus = [
  ['repo Zephyr', 'https://github.com/ShinRyu04/Zephyr'],
  ['halaman issues', 'https://github.com/ShinRyu04/Zephyr/issues/new'],
  ['grup WhatsApp', 'https://chat.whatsapp.com/LNp12sKUWFFGH1RRSyHQkb'],
  ['halaman rilis', 'https://github.com/ShinRyu04/Zephyr/releases'],
];
for (const [nama, url] of urlHarus) {
  cek(`URL ${nama} benar`, sumber.includes(url), url);
}
// Website karangan tidak boleh ada (Zephyr belum punya situs resmi).
cek('TIDAK ada URL karangan', !sumber.includes('zephyr.shinryu.dev'));

// ── V6: donasi benar-benar membuka dialog ────────────────────────────────
const r3 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  // Deterministik: set activity + buka halaman lewat STORE. Ikon Settings di
  // ActivityBar itu toggle, jadi mengkliknya bergantung state run sebelumnya
  // (pernah bikin uji ini gagal sendiri saat dijalankan berulang).
  S.getState().setActivity('settings');
  S.getState().setSettingsOpen(true);
  S.getState().setSidebarVisible(true);
  await new Promise((r) => setTimeout(r, 900));
  // Tunggu nav About benar-benar ada, lalu klik.
  let nav = null;
  const t1 = Date.now() + 9000;
  while (Date.now() < t1 && !nav) {
    nav = document.querySelector('[data-testid="set-nav-about"]');
    if (!nav) await new Promise((r) => setTimeout(r, 200));
  }
  nav?.click();
  // Tunggu tombolnya render (UpdatePanel + DiagnosticsPanel memanggil Rust).
  let tombol = null;
  const t2 = Date.now() + 9000;
  while (Date.now() < t2 && !tombol) {
    tombol = document.querySelector('[data-testid="about-donate"]');
    if (!tombol) await new Promise((r) => setTimeout(r, 200));
  }
  document.querySelector('[data-testid="about-donate"]')?.click();
  await new Promise((r) => setTimeout(r, 900));
  const dlg = document.querySelector('[data-testid="donate-dialog"]');
  const opsi = document.querySelectorAll('[data-testid="donate-options"] .donate-opt').length;
  window.__ZEPHYR__.getState().setDonateOpen(false);
  await new Promise((r) => setTimeout(r, 400));
  return { adaDialog: !!dlg, opsi };
})())`,
  90000,
);
cek('tombol Dukung Zephyr membuka dialog donasi', r3.adaDialog === true);
cek('dialog donasi punya pilihan platform', r3.opsi >= 2, `${r3.opsi} opsi`);

// ── V7: i18n berganti bahasa ─────────────────────────────────────────────
const r4 = await cdp.json(
  `return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  S.getState().setSettingsOpen(true);
  await new Promise((r) => setTimeout(r, 800));
  // Klik ikon Settings di ActivityBar: SIDEBAR baru berganti ke SettingsNav
  // setelah klik ini (setSettingsOpen saja tidak cukup — terbukti di uji).
  document.querySelector('[data-testid="ab-settings"]')?.click();
  // Tunggu nav About benar-benar ada, lalu klik.
  let nav = null;
  const t1 = Date.now() + 9000;
  while (Date.now() < t1 && !nav) {
    nav = document.querySelector('[data-testid="set-nav-about"]');
    if (!nav) await new Promise((r) => setTimeout(r, 200));
  }
  nav?.click();
  // Tunggu tombolnya render (UpdatePanel + DiagnosticsPanel memanggil Rust).
  let tombol = null;
  const t2 = Date.now() + 9000;
  while (Date.now() < t2 && !tombol) {
    tombol = document.querySelector('[data-testid="about-donate"]');
    if (!tombol) await new Promise((r) => setTimeout(r, 200));
  }
  const baca = () => ({
    github: document.querySelector('[data-testid="about-github"]')?.textContent?.trim(),
    wa: document.querySelector('[data-testid="about-wa"]')?.textContent?.trim(),
    judul: document.querySelector('[data-testid="about-table"]')
      ? document.querySelector('.about-judul')?.textContent?.trim() : null,
  });
  const id = baca();
  await S.getState().applySettings({ general: { uiLang: 'en' } });
  await new Promise((r) => setTimeout(r, 900));
  const en = baca();
  await S.getState().applySettings({ general: { uiLang: 'id' } });
  await new Promise((r) => setTimeout(r, 700));
  return { id, en };
})())`,
  90000,
);
cek('label ID berbeda dari EN', r4.id.github !== r4.en.github, `${r4.id.github} / ${r4.en.github}`);
cek('EN memakai teks Inggris', r4.en.github === 'View on GitHub', r4.en.github);

// Tutup Settings supaya harness lain tidak terpengaruh.
await cdp.json(
  `return JSON.stringify(await (async () => {
  window.__ZEPHYR__.getState().setSettingsOpen(false);
  await new Promise((r) => setTimeout(r, 500));
  return 1;
})())`,
  60000,
);

await cdp.close();
console.log(`\n== ${process.exitCode ? 'ADA YANG GAGAL' : 'SEMUA LULUS'} ==`);
