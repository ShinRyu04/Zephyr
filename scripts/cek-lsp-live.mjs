/*
 * Apakah halaman Settings -> Language Servers mencari biner yang BENAR-BENAR ada?
 *
 * Keluhannya (Ryu, 2026-10-13): "pas di install malah sering error". Ada dua
 * sebab yang berbeda dan keduanya harus dibuktikan terpisah:
 *
 *   (1) SARAN SALAH -> `cmd[0]` menanyakan biner yang paketnya tidak pernah
 *       menyediakan (mis. `vscode-css-languageserver` tanpa tanda hubung),
 *       sehingga baris itu MUSTAHIL hijau walau user mengikuti instruksi persis.
 *   (2) BINER DI LUAR PATH PROSES -> install sukses, tapi mendarat di
 *       %APPDATA%\npm / %USERPROFILE%\go\bin / C:\Program Files\LLVM\bin yang
 *       tidak dicari resolver.
 *
 * Uji ini TIDAK memercayai kode maupun teks: setiap baris yang dilaporkan `ok`
 * dicek ulang ke disk oleh node (`fs.existsSync`), dan untuk baris yang gagal
 * diperiksa apakah pesannya menyebut DI MANA ia sudah mencari (bukan "not
 * found" telanjang). Yang diuji dari UI adalah yang dilihat user: jumlah baris,
 * dan tooltip alasan pada baris yang menampilkan "Install:".
 *
 * Pemakaian: node scripts/cek-lsp-live.mjs [port]   (default 9223)
 * Keluar 0 = semua gerbang lolos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const VITE = 'http://localhost:5173';
const gagal = [];
const oknama = (n, lulus, catatan) => {
  console.log(`${lulus ? 'OK  ' : 'GAGAL'} ${n}${catatan ? ' - ' + catatan : ''}`);
  if (!lulus) gagal.push(n);
};

const { cdp } = await Cdp.attach(PORT);

/* ---------- A. probe lewat jalur yang dipakai halaman ---------- */
const baris = await cdp.runAsync(
  `
  const st = window.__ZEPHYR_LSP__.store;
  await st.getState().probeAll();
  const p = st.getState().probe;
  return Object.keys(p).map((id) => ({
    id,
    ok: !!p[id].ok,
    exe: p[id].exe ? String(p[id].exe) : null,
    error: p[id].error ? String(p[id].error) : null,
  }));
  `,
  240000,
);
if (!Array.isArray(baris) || !baris.length) {
  console.log('TIDAK ADA hasil probe lewat __ZEPHYR_LSP__.store - reload app?');
  process.exit(2);
}
oknama('L1 semua baris diprobe', baris.length >= 19, `${baris.length} baris`);

/* ---------- B. jujur soal klaim: tiap "ok" dicek ke disk ---------- */
let palsu = 0;
let hijau = 0;
for (const b of baris) {
  if (!b.ok) continue;
  hijau++;
  if (!b.exe || !fs.existsSync(b.exe)) {
    palsu++;
    console.log(`     KLAIM TANPA BERKAS: ${b.id} -> ${b.exe}`);
  }
}
oknama('L2 tiap baris hijau menunjuk berkas yang ada', palsu === 0, `${hijau} hijau, ${palsu} tanpa berkas`);

/* ---------- C. baris gagal harus menyebut lokasi yang sudah diperiksa ---------- */
const merah = baris.filter((b) => !b.ok);
const tanpaAlasan = merah.filter((b) => !(b.error || '').includes('Checked:'));
oknama(
  'L3 pesan gagal menyebut lokasi yang diperiksa',
  tanpaAlasan.length === 0,
  `${merah.length} gagal, ${tanpaAlasan.length} tanpa alasan`,
);

/* ---------- D. biner yang dulu mustahil dicari: apakah sekarang ketemu? ---------- */
const npmDir = path.join(process.env.APPDATA || '', 'npm');
const tiga = [
  ['json', 'vscode-json-language-server'],
  ['html', 'vscode-html-language-server'],
  ['css', 'vscode-css-language-server'],
];
for (const [id, bin] of tiga) {
  const diDisk = ['', '.cmd', '.exe'].some((e) => fs.existsSync(path.join(npmDir, bin + e)));
  const row = baris.find((b) => b.id === id);
  console.log(`     ${id}: biner di disk=${diDisk} probe.ok=${row?.ok} exe=${row?.exe ?? '-'}`);
  if (diDisk) {
    oknama(`L4.${id} biner ada di disk -> baris harus hijau`, !!row?.ok, row?.error ?? bin);
  } else {
    console.log(`     (${bin} tidak ada di ${npmDir} - mesin ini memang belum install, bukan temuan produk)`);
  }
}

/* ---------- E. modul yang DISAJIKAN app, bukan berkas di disk ---------- */
try {
  const served = await (await fetch(`${VITE}/src/lib/lsp.ts`)).text();
  const lama = ['vscode-json-languageserver', 'vscode-html-languageserver', 'vscode-css-languageserver'].filter(
    (n) => served.includes(n) && !served.includes(n.replace('languageserver', 'language-server')),
  );
  oknama('L5 modul tersaji tak lagi memakai nama biner lama', lama.length === 0, lama.join(', ') || 'bersih');
  const putPath = (served.match(/put it on PATH/g) || []).length;
  oknama('L6 modul tersaji tak lagi menyuruh "put it on PATH"', putPath === 0, `${putPath} sisa`);
} catch (e) {
  console.log('LEWAT L5/L6: vite tidak menjawab di 5173 -', String(e).slice(0, 120));
  gagal.push('L5/L6 tidak terukur');
}

/* ---------- F. yang dilihat user di UI ---------- */
try {
  await cdp.runAsync(
    `
    window.__ZEPHYR__.getState().setSettingsOpen(true);
    return 1;
    `,
    20000,
  );
  await new Promise((r) => setTimeout(r, 900));
  /* Seksi bisa perlu diklik di daftar setelan; kalau barisnya belum ada, cari
     tombol bernama Language/IntelliSense lalu klik sekali. */
  let ui = await cdp.runAsync(
    `
    const rows = document.querySelectorAll('.lsp-baris');
    return { rows: rows.length, tombol: document.querySelectorAll('.lsp-install').length };
    `,
    20000,
  );
  if (!ui || ui.rows === 0) {
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
    await new Promise((r) => setTimeout(r, 900));
    ui = await cdp.runAsync(
      `
      const rows = document.querySelectorAll('.lsp-baris');
      return { rows: rows.length, tombol: document.querySelectorAll('.lsp-install').length };
      `,
      20000,
    );
  }
  const tips = await cdp.runAsync(
    `
    const els = [...document.querySelectorAll('.lsp-install')];
    return { total: els.length, tanpaJudul: els.filter((e) => !(e.getAttribute('title') || '').trim()).length };
    `,
    20000,
  );
  oknama('L7 baris Language Servers benar-benar dirender', (ui?.rows ?? 0) >= 19, `${ui?.rows ?? 0} baris`);
  oknama(
    'L8 baris "Install:" membawa alasan asli sebagai tooltip',
    (tips?.total ?? 0) === 0 || (tips?.tanpaJudul ?? 1) === 0,
    `${tips?.total ?? 0} baris install, ${tips?.tanpaJudul ?? '?'} tanpa tooltip`,
  );
  await cdp.runAsync(`window.__ZEPHYR__.getState().setSettingsOpen(false); return 1;`, 20000);
} catch (e) {
  console.log('LEWAT L7/L8:', String(e).slice(0, 160));
  gagal.push('L7/L8 tidak terukur');
}

/* ---------- L9: baris 'docker' benar-benar bisa kepilih ---------- */
try {
  const petakan = await cdp.json(
        /*
     * `serverForPath` lewat bridge mengembalikan ID barisnya (`'docker'`), bukan
     * objek def - jadi jangan dibaca sebagai `.id`.
     */
    `return JSON.stringify(['C:/x/Dockerfile','C:/x/a.dockerfile','C:/x/main.rs','C:/x/catatan.md']
       .map((p) => [p, __ZEPHYR_LSP__.serverForPath(p) || null]));`,
    20000,
  );
  const m = Object.fromEntries(petakan);
  oknama(
    'L9 berkas Dockerfile memetakan ke baris docker (bukan null)',
    m['C:/x/Dockerfile'] === 'docker' && m['C:/x/a.dockerfile'] === 'docker' && m['C:/x/main.rs'] === 'rust',
    JSON.stringify(m),
  );
} catch (e) {
  gagal.push('L9 tidak terukur');
  console.log('LEWAT L9:', String(e).slice(0, 120));
}

/* ---------- laporan ---------- */
console.log('\n--- tabel probe ---');
for (const b of baris.slice().sort((a, x) => Number(x.ok) - Number(a.ok))) {
  const ket = b.ok ? b.exe : (b.error || '').slice(0, 110);
  console.log(`${b.ok ? 'HIJAU' : 'merah'} ${b.id.padEnd(11)} ${ket}`);
}
console.log(`\nRINGKAS: ${hijau}/${baris.length} hijau, ${merah.length} merah`);
await cdp.close();
if (gagal.length) {
  console.log('GERBANG GAGAL: ' + gagal.join(', '));
  process.exit(1);
}
console.log('SEMUA GERBANG LULUS');
