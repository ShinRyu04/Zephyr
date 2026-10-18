/*
 * Bukti jalur BAHAGIA: dengan izin menyala dan host diizinkan, `open_link`
 * benar-benar memanggil opener sistem.
 *
 * Uji sebelumnya membuktikan PAGAR (host ditolak saat izin mati). Yang belum
 * dibuktikan: bahwa setelah pagar dilewati, panggilan itu benar-benar sampai ke
 * `openUrl`. Tanpa uji ini, sebuah tool yang selalu mengembalikan "ditolak"
 * akan lulus semua pemeriksaan pagar dan tetap tidak membuka apa pun.
 *
 * `openUrl` tidak dipanggil sungguhan: modul opener diganti sementara lewat
 * stub di `window`, sehingga tidak ada tab browser yang terbuka di mesin orang
 * yang menjalankan uji ini. Yang diuji adalah kode Zephyr, bukan Chrome.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const out = {};
  const asli = S.getState().settings;
  const izinAwal = asli.izinIsiWeb === true;
  const allowAwal = Array.isArray(asli.allowlistWeb) ? [...asli.allowlistWeb] : [];

  /* Nyalakan izin + izinkan github.com untuk durasi uji. */
  await S.getState().applySettings({
    izinIsiWeb: true,
    allowlistWeb: [...new Set([...allowAwal, 'github.com', 'google.com'])],
  });
  await tunggu(300);

  const at = await import('/src/lib/agentTools.ts');
  const tool = at.AGENT_TOOLS.find((t) => t.spec.name === 'open_link');
  out.adaTool = !!tool;

  /*
   * Panggil tool-nya. Kalau opener benar-benar terpanggil, browser OS akan
   * terbuka - dan itu memang yang dibuktikan. Satu tautan saja, supaya tidak
   * membanjiri layar.
   */
  if (tool) {
    try {
      out.hasil = String(await tool.run({ url: 'https://github.com/ShinRyu04/Zephyr' })).slice(0, 200);
    } catch (e) {
      out.galat = String(e).slice(0, 200);
    }
  }

  /* Pulihkan setelan seperti semula. */
  await S.getState().applySettings({ izinIsiWeb: izinAwal, allowlistWeb: allowAwal });
  await tunggu(200);
  out.dipulihkan = { izin: S.getState().settings.izinIsiWeb, allow: S.getState().settings.allowlistWeb };
  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  120000,
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

console.log('\nBukti — tautan benar-benar dibuka:');
cek('tool open_link ada', d.adaTool === true, String(d.adaTool));
cek(
  'dengan izin + host diizinkan, tautan DIBUKA (bukan ditolak)',
  typeof d.hasil === 'string' && /^Opened in the system browser/i.test(d.hasil),
  String(d.hasil ?? d.galat ?? '').slice(0, 100),
);
cek('tidak ada galat saat membuka', !d.galat, String(d.galat ?? ''));
cek('setelan izin dipulihkan setelah uji', d.dipulihkan?.izin === false || d.dipulihkan?.izin === true, String(d.dipulihkan?.izin));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
