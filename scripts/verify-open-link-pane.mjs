/*
 * Bukti: `open_link` membuka PANE ZEPHYR (webview), bukan browser OS.
 *
 * Permintaan pemilik aplikasi, dua kali: tautan harus dibuka di pane browser
 * yang sudah ada di terminal (split) dan di kolom browser jendela "Open in
 * Agents" - supaya halaman tampil di sebelah kode DAN agen bisa membacanya.
 * Membuka browser OS salah karena halaman itu di luar jangkauan agen.
 *
 *   P1  open_link tidak memanggil opener OS
 *   P2  open_link membuat/menavigasi pane browser (kind='browser')
 *   P3  URL yang sama bisa DIBACA lewat browser_read (isi halaman terbaca)
 *   P4  izin mati -> ditolak, tanpa membuat pane
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const T = window.__ZEPHYR_TERM__;
  const out = {};
  const asli = S.getState().settings;
  const izinAwal = asli.izinIsiWeb === true;
  const allowAwal = Array.isArray(asli.allowlistWeb) ? [...asli.allowlistWeb] : [];

  /* Nyalakan izin + izinkan host uji. */
  await S.getState().applySettings({
    izinIsiWeb: true,
    allowlistWeb: [...new Set([...allowAwal, 'example.com', 'github.com'])],
  });
  await tunggu(300);

  const at = await import('/src/lib/agentTools.ts');
  const openLink = at.AGENT_TOOLS.find((t) => t.spec.name === 'open_link');
  /*
   * browser_read bukan tool terpisah lagi: ketujuh aksi browser digabung jadi
   * satu tool bernama browser. Uji yang mencari nama lama di registry akan
   * "gagal" untuk alasan yang salah - yang harus dibuktikan adalah bahwa
   * halaman yang baru dibuka BISA DIBACA, bukan nama tool yang dipakai.
   */
  const baca = at.AGENT_TOOLS.find((t) => t.spec.name === 'browser');
  out.adaOpenLink = !!openLink;
  out.adaBaca = !!baca;

  /* Berapa pane browser sebelum. */
  const sebelum = T.getState().allPanes().filter((p) => p.kind === 'browser').length;
  out.paneSebelum = sebelum;

  /* Buka lewat open_link. */
  if (openLink) {
    try {
      out.hasil = String(await openLink.run({ url: 'https://example.com' })).slice(0, 220);
    } catch (e) {
      out.galat = String(e).slice(0, 220);
    }
  }
  await tunggu(1200);

  const panes = T.getState().allPanes().filter((p) => p.kind === 'browser');
  out.paneSesudah = panes.length;
  out.paneUrl = panes.map((p) => p.url).slice(0, 3);
  out.adaPaneBaru = panes.length > sebelum || panes.some((p) => String(p.url).includes('example.com'));

  /* P3: baca halaman yang sama lewat aksi read pada tool browser. */
  if (baca) {
    try {
      out.baca = String(await baca.run({ aksi: 'read' })).slice(0, 300);
    } catch (e) {
      out.bacaGalat = String(e).slice(0, 160);
    }
  }

  /* P4: izin mati -> ditolak, tanpa pane baru. */
  await S.getState().applySettings({ izinIsiWeb: false });
  await tunggu(300);
  const sebelumTolak = T.getState().allPanes().filter((p) => p.kind === 'browser').length;
  if (openLink) {
    out.tolak = String(await openLink.run({ url: 'https://github.com' })).slice(0, 160);
  }
  await tunggu(400);
  out.paneSetelahTolak = T.getState().allPanes().filter((p) => p.kind === 'browser').length;
  out.paneSebelumTolak = sebelumTolak;

  /* Pulihkan setelan. */
  await S.getState().applySettings({ izinIsiWeb: izinAwal, allowlistWeb: allowAwal });
  await tunggu(200);
  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  180000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — tautan dibuka di PANE Zephyr:');
cek('tool open_link ada', d.adaOpenLink === true, String(d.adaOpenLink));
cek(
  'P1 tidak memakai browser OS (hasil menyebut pane)',
  typeof d.hasil === 'string' && /pane/i.test(d.hasil) && !/system browser/i.test(d.hasil),
  String(d.hasil ?? d.galat ?? '').slice(0, 110),
);
cek('P2 pane browser dibuat/dinavigasi', d.adaPaneBaru === true, `${d.paneSebelum} -> ${d.paneSesudah}`);
cek(
  'P3 halaman yang sama bisa DIBACA',
  typeof d.baca === 'string' && d.baca.length > 20 && !/No browser pane/i.test(d.baca),
  String(d.baca ?? d.bacaGalat ?? '').slice(0, 90),
);
cek(
  'P4 izin mati -> ditolak tanpa pane baru',
  typeof d.tolak === 'string' && /ditolak/i.test(d.tolak) && d.paneSetelahTolak === d.paneSebelumTolak,
  `${d.paneSebelumTolak} -> ${d.paneSetelahTolak}`,
);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
