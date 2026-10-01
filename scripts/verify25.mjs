// verify25.mjs — verifikasi fase 25 (Global Search & Replace via ripgrep).
//
// Pakai:  node scripts/verify25.mjs [portCdp]
// Syarat: zephyr.exe --remote-debugging-port=9223 + `npm run dev`,
//         workspace app = D:\Zephyr.
//
// Peta V → brief fase 25:
//   V1  tsc --noEmit 0 error + cargo test --lib lulus
//   V2  Cari kata umum di workspace besar → hasil < 2s, terkelompok per file,
//       klik membuka editor + menyorot posisi benar
//   V3  Regex + capture group replace benar; .gitignore dihormati
//   V4  Replace All bisa di-undo (snapshot Local History sebelum tulis)
//   V5  Kontrak search remote (SSH fase 07 DITUNDA) — yang diuji di sini:
//       batas keamanan `root` + jalur rg yang dipakai, karena leg remote
//       memakai keduanya. Lihat catatan di bagian2.mjs.
//   V6  Virtualisasi: ribuan hasil, node DOM tetap sedikit
//   V7  max results + cancel + riwayat query
//
// CATATAN HARNESS:
//  * Fixture di `.zephyr/uji25/` — DI DALAM workspace (search.rs menolak root
//    di luar workspace) tapi di LUAR `src/` supaya Vite HMR tidak full reload
//    dan membuang window[slot] milik runAsync (pelajaran fase 24).
//  * `.zephyr/` ADA di .gitignore repo (baris 51). Akibatnya query dengan
//    root = workspace TIDAK akan pernah melihat fixture selama
//    respectGitignore true — itu bukan bug, dan justru dipakai V3.
//    Uji yang butuh fixture menyetel `root` ke folder fixture langsung.
//  * prelude lib-cdp.mjs menyediakan S, q, qa, wait, TS, HS, SR — jangan
//    deklarasi ulang.

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Cdp, reporter } from './lib-cdp.mjs';
import { bagian1 } from './v25/bagian1.mjs';
import { bagian2 } from './v25/bagian2.mjs';

const CDP_PORT = process.argv[2] ?? '9223';
const { check, selesai } = reporter('verify25');

const DIR = 'D:/Zephyr/.zephyr/uji25';

export const F = {
  dir: DIR,
  a: `${DIR}/a.txt`,
  diabaikan: `${DIR}/diabaikan.txt`,
  banyak: `${DIR}/banyak.txt`,
  regex: `${DIR}/regex.txt`,
  utf8: `${DIR}/utf8.txt`,
};

/** Isi awal file regex — dipakai juga untuk membandingkan hasil undo. */
export const REGEX_AWAL = 'nama: Budi\nnama: Ani\nnama: Cakra\n';

const siapkanFixture = () => {
  mkdirSync(DIR, { recursive: true });

  writeFileSync(F.a, 'alpha beta gamma\nfoo alpha bar\nBETA kapital\n', 'utf8');

  // .gitignore LOKAL di folder fixture: rg harus melewati diabaikan.txt saat
  // respectGitignore true, dan melihatnya saat false. Ini bukti V3 yang tidak
  // bergantung pada .gitignore repo.
  writeFileSync(`${DIR}/.gitignore`, 'diabaikan.txt\n', 'utf8');
  writeFileSync(F.diabaikan, 'alpha rahasia\n', 'utf8');

  // 900 baris × 1 match = cukup untuk membuktikan virtualisasi.
  let s = '';
  for (let i = 1; i <= 900; i++) s += `baris ${i} PENANDAUJI25 ekor\n`;
  writeFileSync(F.banyak, s, 'utf8');

  writeFileSync(F.regex, REGEX_AWAL, 'utf8');

  // Emoji sebelum match: kolom harus dihitung dalam KARAKTER, bukan byte.
  // '🙂' = 4 byte / 2 unit UTF-16, jadi byte-offset mentah dari rg akan
  // menunjuk kolom yang salah kalau tidak dikonversi.
  writeFileSync(F.utf8, '🙂🙂 TARGETUTF8 ekor\n', 'utf8');
};

const bersihkanFixture = () => {
  try {
    if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* biar saja */
  }
};

export const bacaFixture = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

const main = async () => {
  bersihkanFixture();
  siapkanFixture();

  // ═════════ V1: tsc + cargo ═════════
  const tsc = spawnSync(process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit'], {
    cwd: 'D:/Zephyr',
    encoding: 'utf8',
  });
  const cargo = spawnSync('cargo', ['test', '--lib'], {
    cwd: 'D:/Zephyr/src-tauri',
    encoding: 'utf8',
  });
  const cargoOut = `${cargo.stdout ?? ''}${cargo.stderr ?? ''}`;
  const cargoOk = /test result: ok\./.test(cargoOut) && cargo.status === 0;
  const jml = (cargoOut.match(/(\d+) passed/) ?? [])[1] ?? '?';
  const ujiSearch = (cargoOut.match(/^test search::/gm) ?? []).length;

  check(
    'V1',
    tsc.status === 0 && cargoOk,
    `tsc --noEmit exit ${tsc.status}; cargo test --lib exit ${cargo.status} ` +
      `(${jml} uji lulus, ${ujiSearch} milik search.rs)` +
      (tsc.status !== 0 ? `\n${(tsc.stdout || '').split('\n').slice(0, 6).join('\n')}` : ''),
  );

  const { cdp } = await Cdp.attach(CDP_PORT);

  // Keadaan awal yang bisa diprediksi.
  await cdp.runAsync(
    `
    // Workspace WAJIB dibuka: search.rs memakai workspace sebagai root default
    // dan menolak root di luarnya; app yang baru start punya workspace null.
    if (S.getState().workspace !== 'D:/Zephyr') {
      await S.getState().openWorkspace('D:/Zephyr');
      await wait(1500);
    }
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setSettingsOpen(false);
    S.getState().setFindOpen(false);
    // Panel bawah yang di-maximize membuat .editor-area display:none dan semua
    // uji ukuran gagal (pelajaran fase 13).
    if (TS().maximized || TS().visible) TS().setVisible(false);
    S.getState().setActivity('search');
    if (!S.getState().sidebarVisible) S.getState().toggleSidebar();
    await wait(500);

    SR.bersihkan();
    SR.setQuery('');
    SR.setInclude('');
    SR.setExclude('');
    SR.setMaxResults(5000);
    SR.setRoot('');
    SR.setReplaceWith('');
    SR.setReplaceTerbuka(false);
    SR.setFlag({
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      respectGitignore: true,
      includeHidden: false,
      replaceTerakhir: null,
      riwayat: [],
    });
    window.__ZEPHYR_NOTIF__.clear();
    await SR.cekRg();
    return JSON.stringify({ workspace: S.getState().workspace, rg: SR.rg() });
  `,
    90000,
  );

  await bagian1(cdp, check, F);
  await bagian2(cdp, check, F);

  // Kembalikan keadaan.
  await cdp.runAsync(
    `
    SR.bersihkan();
    SR.setQuery('');
    SR.setReplaceTerbuka(false);
    SR.setFlag({ respectGitignore: true, includeHidden: false, regex: false, replaceTerakhir: null });
    S.getState().tabs.slice().forEach((t) => S.getState().forceCloseTab(t.id));
    S.getState().setActivity('explorer');
    window.__ZEPHYR_NOTIF__.clear();
    return 'beres';
  `,
    60000,
  );

  await cdp.close();
  bersihkanFixture();
  selesai();
};

main().catch((e) => {
  console.error('verify25 error:', e.message);
  bersihkanFixture();
  process.exit(1);
});
