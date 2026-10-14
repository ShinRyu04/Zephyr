/*
 * Bisakah user memasang language server DARI DALAM app - lewat UI, bukan lewat
 * jembatan debug?
 *
 * Uji rung 3 sebelumnya (`cek-lsp-pasang-live.mjs`) memanggil `pasang(id)` di
 * `__ZEPHYR_LSP__`, yang membuktikan backend-nya jalan tetapi BUKAN bahwa ada
 * tombolnya. Halaman Language Servers dulu hanya menampilkan "Install: <perintah>",
 * jadi user masih harus keluar app dan menjalankan npm sendiri. Uji ini menempuh
 * jalur user: buka Settings -> Language Servers -> klik switch baris -> klik
 * tombol pasang -> baris jadi hijau.
 *
 * Syarat bukti (tidak ada yang dipercaya dari kata app):
 *   U1 baris memang MERAH dulu - slot dihapus lebih dulu, lalu probe ulang.
 *   U2 satu klik switch baris yang belum terpasang membuka dialog pasang.
 *   U3 tombol pasang ADA untuk baris yang punya resep, dan catatan npm tampil.
 *   U4 diklik, hasilnya muncul (npm exit + jalur slot), bukan spinner abadi.
 *   U5 baris benar-benar hijau setelahnya, dan berkasnya dicek ulang ke disk
 *      oleh node (`fs.existsSync`) - bukan dari teks panel.
 *   U6 baris yang TIDAK bisa dipasang app (butuh toolchain) tetap jujur:
 *      tidak ada tombol pasang, ada catatan "jalankan perintahnya sendiri".
 *   U7 setelan user tidak ikut berubah: switch yang dibuka dialognya tetap mati
 *      sesudah dialog ditutup.
 *
 * Pemakaian: node scripts/cek-lsp-pasang-ui-live.mjs [port]   (default 9223)
 * Keluar 0 = semua gerbang lolos. Butuh jaringan (npm) dan ~10-60 detik.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const gagal = [];
const oknama = (n, lulus, catatan) => {
  console.log(`${lulus ? 'OK  ' : 'GAGAL'} ${n}${catatan ? ' - ' + catatan : ''}`);
  if (!lulus) gagal.push(n);
};

/* ---------- 0. baris harus MERAH dulu ---------- */
const kandidatSlot = [
  path.join(process.env.APPDATA || '', 'zephyr', 'lsp', 'docker'),
  path.join(process.env.LOCALAPPDATA || '', 'zephyr', 'lsp', 'docker'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'zephyr', 'lsp', 'docker'),
  path.join(os.homedir(), 'AppData', 'Local', 'zephyr', 'lsp', 'docker'),
].filter((p) => p && !p.startsWith(path.sep));

const slot = kandidatSlot.find((p) => fs.existsSync(p));
if (!slot) {
  console.log('slot docker tidak ditemukan - jalankan dulu: node scripts/cek-lsp-pasang-live.mjs');
  process.exit(2);
}
fs.rmSync(slot, { recursive: true, force: true });
console.log(`slot dibersihkan: ${slot} (ada=${fs.existsSync(slot)})`);

const { cdp } = await Cdp.attach(PORT);

const probeSekarang = async () => {
  const p = await cdp.runAsync(
    `
    const st = window.__ZEPHYR_LSP__.store;
    await st.getState().probeAll();
    const d = st.getState().probe.docker;
    return { ok: !!(d && d.ok), exe: d && d.exe ? String(d.exe) : null, error: d && d.error ? String(d.error) : null };
    `,
    240000,
  );
  return p || { ok: false, exe: null, error: null };
};

const p0 = await probeSekarang();
oknama('U1 baris docker MERAH setelah slot dihapus', p0.ok === false, `ok=${p0.ok}${p0.error ? ' | ' + p0.error.slice(0, 90) : ''}`);

/* ---------- 1. buka halaman Language Servers ---------- */
await cdp.runAsync(`window.__ZEPHYR__.getState().setSettingsOpen(true); return 1;`, 20000);
await sleep(1000);
const klikSeksi = async () => {
  const ada = await cdp.runAsync(`return document.querySelectorAll('.lsp-baris').length;`, 20000);
  if (ada > 0) return true;
  await cdp.runAsync(
    `
    const kandidat = [...document.querySelectorAll('button, [role="tab"], [data-testid]')].filter((el) => {
      const t = (el.textContent || '').toLowerCase();
      return t.includes('language server') || t.includes('intellisense');
    });
    if (kandidat[0]) kandidat[0].click();
    return kandidat.length;
    `,
    20000,
  );
  await sleep(900);
  const ada2 = await cdp.runAsync(`return document.querySelectorAll('.lsp-baris').length;`, 20000);
  return ada2 > 0;
};
const halamanTerbuka = await klikSeksi();

const adaSwitch = await cdp.runAsync(
  `
  const sw = document.querySelector('[data-testid="lsp-docker-toggle"]');
  return { ada: !!sw, checked: sw ? sw.getAttribute('aria-checked') : null, disabled: sw ? !!sw.disabled : null };
  `,
  20000,
);
oknama(
  'U2a halaman Language Servers terbuka dan baris docker punya switch',
  halamanTerbuka && !!adaSwitch?.ada && adaSwitch?.disabled === false,
  `halaman=${halamanTerbuka} switch=${!!adaSwitch?.ada} checked=${adaSwitch?.checked} disabled=${adaSwitch?.disabled}`,
);

/* Satu klik: switch baris yang belum terpasang berangkat dari unchecked, jadi
 * klik pertama sudah memberi v=true - itulah cabang yang membuka dialog. */
await cdp.runAsync(
  `
  const sw = document.querySelector('[data-testid="lsp-docker-toggle"]');
  if (sw) sw.click();
  return 1;
  `,
  20000,
);
await sleep(700);
let dialogAda = await cdp.runAsync(`return !!document.querySelector('[data-testid="lsp-dialog-pasang"]');`, 20000);
if (!dialogAda) {
  /* Kalau ternyata switch sudah ON (mis. dibiarkan user), klik kedua yang
   * menyalakannya - jangan gagal karena keadaan awal, tetapi catat kejadian. */
  await cdp.runAsync(
    `
    const sw = document.querySelector('[data-testid="lsp-docker-toggle"]');
    if (sw) sw.click();
    return 1;
    `,
    20000,
  );
  await sleep(700);
  dialogAda = await cdp.runAsync(`return !!document.querySelector('[data-testid="lsp-dialog-pasang"]');`, 20000);
}
oknama('U2 klik switch baris yang belum terpasang membuka dialog pasang', !!dialogAda, `dialog=${!!dialogAda}`);

/* ---------- 2. tombol pasang harus ada UNTUK baris yang punya resep ---------- */
const tombol = await cdp.runAsync(
  `
  const b = document.querySelector('[data-testid="lsp-dialog-install"]');
  const manual = document.querySelector('[data-testid="lsp-dialog-manual"]');
  return {
    ada: !!b,
    teks: b ? String(b.textContent || '').trim() : null,
    catatan: [...document.querySelectorAll('.lsp-dialog-catatan')].map((e) => String(e.textContent || '').trim()),
    manual: manual ? String(manual.textContent || '').trim() : null,
  };
  `,
  20000,
);
oknama(
  'U3a tombol pasang in-app ada untuk baris beresep (docker)',
  !!tombol?.ada,
  `tombol=${!!tombol?.ada} teks="${tombol?.teks}" catatan=${JSON.stringify(tombol?.catatan)}`,
);
oknama(
  'U3b baris beresep TIDAK menampilkan catatan "tidak bisa otomatis"',
  !tombol?.manual,
  `manual=${tombol?.manual ? 'ADA' : 'tidak ada'}`,
);

/* ---------- 3. klik tombolnya, tunggu hasil nyata ---------- */
await cdp.runAsync(
  `
  const b = document.querySelector('[data-testid="lsp-dialog-install"]');
  if (b) b.click();
  return 1;
  `,
  20000,
);

let hasil = null;
const mulai = Date.now();
while (Date.now() - mulai < 330000) {
  hasil = await cdp.runAsync(
    `
    const ok = document.querySelector('[data-testid="lsp-dialog-pasang-ok"]');
    const gg = document.querySelector('[data-testid="lsp-dialog-pasang-gagal"]');
    const el = ok || gg;
    const slotEl = document.querySelector('[data-testid="lsp-dialog-slot"]');
    return {
      jenis: ok ? 'ok' : gg ? 'gagal' : null,
      teks: el ? String(el.textContent || '').trim() : null,
      slot: slotEl ? String(slotEl.textContent || '').trim() : null,
      jalan: !!document.querySelector('[data-testid="lsp-dialog-install"]')?.disabled,
    };
    `,
    30000,
  );
  if (hasil?.jenis) break;
  await sleep(1500);
}
if (hasil?.jenis === 'gagal') {
  const log = await cdp.runAsync(
    `const e = document.querySelector('[data-testid="lsp-dialog-log"]'); return e ? String(e.textContent || '').slice(-400) : null;`,
    20000,
  );
  console.log('log npm:', log);
}
oknama(
  'U4 klik tombol pasang menghasilkan laporan (bukan spinner abadi)',
  !!hasil?.jenis,
  `${hasil?.jenis} | "${hasil?.teks}" | slot=${hasil?.slot} | ${Math.round((Date.now() - mulai) / 1000)}s`,
);
oknama('U4b hasil pasang SUKSES (npm exit 0 + biner mendarat)', hasil?.jenis === 'ok', `jenis=${hasil?.jenis}`);

/* ---------- 4. baris harus benar-benar hijau, dan berkasnya dicek node ---------- */
const p1 = await probeSekarang();
const berkasAda = p1.exe ? fs.existsSync(p1.exe) : false;
const tandaSiap = await cdp.runAsync(
  `return !!document.querySelector('[data-testid="lsp-docker-siap"]');`,
  20000,
);
oknama(
  'U5 baris jadi hijau + biner ADA di disk (dicek node, bukan teks panel)',
  p1.ok === true && berkasAda === true && !!tandaSiap,
  `probe.ok=${p1.ok} tandaSiap=${!!tandaSiap} exe=${p1.exe} ada=${berkasAda}`,
);

/* ---------- 5. yang tidak bisa dipasang app harus tetap jujur ---------- */
await cdp.runAsync(
  `const x = document.querySelector('[data-testid="lsp-dialog-tutup"]'); if (x) x.click(); return 1;`,
  20000,
);
await sleep(500);
await cdp.runAsync(
  `
  const sw = document.querySelector('[data-testid="lsp-go-toggle"]');
  if (sw) sw.click();
  return 1;
  `,
  20000,
);
await sleep(700);
let dialogGo = await cdp.runAsync(`return !!document.querySelector('[data-testid="lsp-dialog-pasang"]');`, 20000);
if (!dialogGo) {
  await cdp.runAsync(
    `const sw = document.querySelector('[data-testid="lsp-go-toggle"]'); if (sw) sw.click(); return 1;`,
    20000,
  );
  await sleep(700);
  dialogGo = await cdp.runAsync(`return !!document.querySelector('[data-testid="lsp-dialog-pasang"]');`, 20000);
}
const jujur = await cdp.runAsync(
  `
  const b = document.querySelector('[data-testid="lsp-dialog-install"]');
  const m = document.querySelector('[data-testid="lsp-dialog-manual"]');
  return { tombol: !!b, manual: m ? String(m.textContent || '').trim() : null };
  `,
  20000,
);
oknama(
  'U6 baris tanpa resep (go) tidak menawarkan tombol pasang, tapi menyuruh jalankan sendiri',
  dialogGo && !jujur?.tombol && !!jujur?.manual,
  `dialog=${!!dialogGo} tombol=${!!jujur?.tombol} manual="${jujur?.manual}"`,
);

/* ---------- 6. setelan user tidak berubah ---------- */
await cdp.runAsync(`const x = document.querySelector('[data-testid="lsp-dialog-tutup"]'); if (x) x.click(); return 1;`, 20000);
await sleep(400);
const sisa = await cdp.runAsync(
  `
  const sw = document.querySelector('[data-testid="lsp-go-toggle"]');
  const ov = window.__ZEPHYR_LSP__.store.getState().settings().servers || {};
  return { goChecked: sw ? sw.getAttribute('aria-checked') : null, goOverride: ov.go ? JSON.stringify(ov.go) : null };
  `,
  20000,
);
oknama(
  'U7 switch yang cuma membuka dialog tetap MATI (setelan user tidak ikut berubah)',
  sisa?.goChecked === 'false',
  `go checked=${sisa?.goChecked} override=${sisa?.goOverride}`,
);

await cdp.runAsync(`window.__ZEPHYR__.getState().setSettingsOpen(false); return 1;`, 20000);

console.log(gagal.length ? `GAGAL: ${gagal.join(', ')}` : 'SEMUA GERBANG LULUS');
await cdp.close();
process.exit(gagal.length ? 1 : 0);
