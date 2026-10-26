// uji-worktree-ui.mjs — bukti hidup manajer worktree di Source Control.
//
// Kenapa uji ini ada: `worktree_*` TIDAK melempar untuk kesalahan pemakaian; ia
// selalu menjawab `{berhasil,pesan,data}`. UI yang hanya memasang `catch` akan
// melaporkan "berhasil" untuk penolakan paling penting (worktree kotor). Uji
// ini memanggil jalur yang SAMA dengan komponen (`__ZEPHYR_WORKTREE__`) lalu
// memeriksa DOM, bukan menyalin logika.
//
// Repo uji dibuat di %TEMP% dan dihapus di akhir. `D:\Zephyr` tidak pernah
// disentuh: workspace sementara dibuka lewat `openWorkspace`, lalu dikembalikan.
//
// Yang diperiksa:
//   W1  repo mini: daftar menyebut worktree utama, root = akar repo
//   W2  worktree_add membuat checkout nyata dengan branch baru
//   W3  daftar menampilkan worktree baru dengan isMain=false + branch
//   W4  worktree_remove tanpa paksa menolak worktree kotor (berhasil=false)
//   W5  worktree_remove paksa menghapus folder
//   W6  root subfolder ditolak dengan pesan "AKAR repo"
//   W7  panel Source Control merender baris worktree + tombol aksi
//   W8  tombol lipat membuka/menutup isi
//
// Pemakaian:
//   npm run dev
//   cd src-tauri; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"; .\target\debug\zephyr.exe
//   node scripts/uji-worktree-ui.mjs
//
// Exit: 0 lulus, 1 gagal, 2 app tidak hidup.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Cdp, sleep, tungguBridge } from './lib-cdp.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';

let lulus = 0;
let gagal = 0;
function cek(nama, syarat, detail = '') {
  if (syarat) {
    lulus += 1;
    console.log(`  PASS  ${nama}`);
  } else {
    gagal += 1;
    console.log(`  FAIL  ${nama}${detail ? ` — ${detail}` : ''}`);
  }
}

let list;
try {
  list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
} catch (e) {
  console.log(`TIDAK BERLAKU: app tidak hidup di port ${PORT} (${String(e).split('\n')[0]}).`);
  process.exit(2);
}
const page = list.find((t) => t.type === 'page' && !(t.url ?? '').includes('#'));
if (!page) {
  console.log(`TIDAK BERLAKU: tidak ada jendela utama di port ${PORT}.`);
  process.exit(2);
}
const { cdp } = await Cdp.attach(PORT, page.title);

const z = async (expr) => {
  await tungguBridge(cdp, '__ZEPHYR__');
  return cdp.eval(expr);
};
/*
 * `worktree_*` menjawab ASINKRON, dan `cdp.eval` TIDAK menunggu promise (ia
 * mengembalikan objek request yang belum selesai). Karena itu semua panggilan
 * bridge lewat `runAsync`, yang menyimpan promise di slot window lalu polling -
 * jalur yang sama dengan sisa suite ini.
 *
 * Signature bridge-nya POSISIONAL (`add(root, path, branch, buatCabang)`), dan
 * bridge itu sendiri yang membungkusnya jadi objek untuk `invoke`. Mengirim
 * objek dari sini membuat Tauri menolak dengan "invalid type: map, expected a
 * string" - bukti bahwa yang diuji adalah jalur nyata, bukan salinan logika.
 */
const wt = async (body) => {
  await tungguBridge(cdp, '__ZEPHYR_WORKTREE__');
  return JSON.parse(await cdp.runAsync(`return JSON.stringify(await (async () => { ${body} })());`));
};
const wtList = (root) => wt(`return await window.__ZEPHYR_WORKTREE__.list(${JSON.stringify(root)});`);
const wtAdd = (root, path, branch, buatCabang) =>
  wt(
    `return await window.__ZEPHYR_WORKTREE__.add(${JSON.stringify(root)}, ${JSON.stringify(path)}, ${JSON.stringify(branch)}, ${buatCabang});`,
  );
const wtRemove = (root, path, paksa) =>
  wt(
    `return await window.__ZEPHYR_WORKTREE__.remove(${JSON.stringify(root)}, ${JSON.stringify(path)}, ${paksa});`,
  );

/* ── repo mini di %TEMP% ──────────────────────────────────────────────── */
const akarUji = join(tmpdir(), `zephyr-uji-wt-ui-${process.pid}`);
const repo = join(akarUji, 'repo');
const kerja = join(akarUji, 'repo-cabang');
const kotor = join(akarUji, 'repo-kotor');
/* A previous run that died mid-test can leave a directory whose files are
   still held by the app (it had that folder open as a workspace). Failing here
   would report a filesystem error as if the product were broken, so a stuck
   leftover is retried once and then reported as SKIP, not as a test failure. */
try {
  rmSync(akarUji, { recursive: true, force: true });
} catch (e) {
  await sleep(700);
  try {
    rmSync(akarUji, { recursive: true, force: true });
  } catch {
    console.log(`TIDAK BERLAKU: sisa folder uji terkunci (${akarUji}) — tutup app lama lalu ulangi.`);
    process.exit(2);
  }
}
mkdirSync(repo, { recursive: true });

const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();

git(repo, ['init', '-q']);
writeFileSync(join(repo, 'a.txt'), 'satu\n', 'utf8');
git(repo, ['add', '-A']);
git(repo, [
  '-c',
  'user.name=Zephyr Uji',
  '-c',
  'user.email=uji@zephyr.local',
  '-c',
  'commit.gpgsign=false',
  'commit',
  '-q',
  '-m',
  'awal',
]);

const workspaceAsli = await z(`window.__ZEPHYR__.getState().workspace`);
await z(`window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(repo)}); 'ok'`);
await sleep(1800);
await tungguBridge(cdp, '__ZEPHYR_GIT__');
await cdp.eval(`window.__ZEPHYR_GIT__.refresh(); 'ok'`);
await sleep(1200);

try {
  /* ── W1: daftar awal ──────────────────────────────────────────────── */
  let h = await wtList(repo);
  cek('W1a worktree_list berhasil pada repo mini', h.berhasil === true && h.data?.jumlah === 1, JSON.stringify(h));
  cek(
    'W1b worktree utama ditandai isMain',
    h.data?.worktree?.[0]?.isMain === true,
    JSON.stringify(h.data?.worktree?.[0]),
  );
  cek('W1c akar yang dikembalikan = akar repo', h.data?.akar?.replace(/\\/g, '/').endsWith('/repo'), h.data?.akar);

  /* ── W2: tambah ───────────────────────────────────────────────────── */
  h = await wtAdd(repo, kerja, 'uji-ui', true);
  cek('W2a worktree_add berhasil', h.berhasil === true, JSON.stringify(h));
  cek('W2b folder checkout benar-benar ada', existsSync(join(kerja, 'a.txt')));

  /* ── W3: daftar setelah tambah ────────────────────────────────────── */
  h = await wtList(repo);
  const baru = (h.data?.worktree ?? []).find((w) => w.branch === 'uji-ui');
  cek('W3a worktree baru muncul di daftar', !!baru, JSON.stringify(h.data?.worktree));
  cek('W3b worktree baru bukan main', baru?.isMain === false, JSON.stringify(baru));

  /* ── W7: panel merender ───────────────────────────────────────────── */
  await z(`window.__ZEPHYR__.getState().setActivity('scm'); 'ok'`);
  await sleep(900);
  const adaToggle = await cdp.eval(`!!document.querySelector('[data-testid="scm-worktree-toggle"]')`);
  cek('W7a section Worktrees ada di Source Control', adaToggle === true);
  if (adaToggle) {
    const buka = await cdp.eval(
      `document.querySelector('[data-testid="scm-worktree-toggle"]')?.getAttribute('aria-expanded')`,
    );
    if (buka !== 'true') {
      await cdp.eval(`document.querySelector('[data-testid="scm-worktree-toggle"]').click(); 'ok'`);
      await sleep(500);
    }
    const ui = JSON.parse(await cdp.eval(`JSON.stringify({
      baris: [...document.querySelectorAll('[data-testid="scm-worktree-baris"]')].map((r) => r.getAttribute('data-path')),
      hapus: document.querySelectorAll('[data-testid="scm-worktree-hapus"]').length,
      open: document.querySelectorAll('[data-testid="scm-worktree-open"]').length,
      form: !!document.querySelector('[data-testid="scm-worktree-path"]'),
    })`));
    cek(
      'W7b panel menampilkan worktree baru',
      ui.baris.some((p) => (p ?? '').replace(/\\/g, '/').endsWith('/repo-cabang')),
      JSON.stringify(ui),
    );
    cek('W7c form tambah dirender', ui.form === true, JSON.stringify(ui));
    cek('W7d worktree utama tidak punya tombol Remove', ui.hapus === 1 && ui.open === 1, JSON.stringify(ui));
  }

  /* ── W8: lipat ────────────────────────────────────────────────────── */
  if (adaToggle) {
    await cdp.eval(`document.querySelector('[data-testid="scm-worktree-toggle"]').click(); 'ok'`);
    await sleep(300);
    const tertutup = await cdp.eval(
      `document.querySelector('[data-testid="scm-worktree-toggle"]')?.getAttribute('aria-expanded') === 'false'`,
    );
    await cdp.eval(`document.querySelector('[data-testid="scm-worktree-toggle"]').click(); 'ok'`);
    await sleep(300);
    const terbuka = await cdp.eval(
      `document.querySelector('[data-testid="scm-worktree-toggle"]')?.getAttribute('aria-expanded') === 'true'`,
    );
    cek('W8 tombol lipat menutup lalu membuka isi', tertutup === true && terbuka === true);
  }

  /* ── W4/W5: hapus kotor lalu paksa ────────────────────────────────── */
  h = await wtAdd(repo, kotor, 'uji-kotor', true);
  cek('W4a worktree kotor dibuat', h.berhasil === true, JSON.stringify(h));
  writeFileSync(join(kotor, 'baru.txt'), 'belum di-commit\n', 'utf8');
  h = await wtRemove(repo, kotor, false);
  cek('W4b hapus tanpa paksa DITOLAK (berhasil=false)', h.berhasil === false, JSON.stringify(h));
  cek(
    'W4c pesan penolakan menyebut perubahan belum di-commit',
    String(h.pesan).includes('belum di-commit'),
    h.pesan,
  );
  cek('W4d folder kotor masih ada setelah penolakan', existsSync(kotor));

  h = await wtRemove(repo, kotor, true);
  cek('W5a hapus dengan paksa berhasil', h.berhasil === true, JSON.stringify(h));
  cek('W5b folder kotor hilang setelah paksa', !existsSync(kotor));

  /* ── W6: root subfolder ditolak ───────────────────────────────────── */
  mkdirSync(join(repo, 'sub'), { recursive: true });
  h = await wtList(join(repo, 'sub'));
  cek('W6a subfolder bukan root ditolak', h.berhasil === false, JSON.stringify(h));
  cek('W6b pesan menyebut AKAR repo', String(h.pesan).includes('AKAR repo'), h.pesan);
} finally {
  await wtRemove(repo, kerja, true).catch(() => {});
  if (workspaceAsli) {
    await z(`window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(workspaceAsli)}); 'ok'`).catch(() => {});
    /* The app needs a beat to let go of the temp workspace before the folder
       can be deleted; without it the cleanup throws EPERM and buries whatever
       the tests actually reported. */
    await sleep(800);
  }
  try {
    rmSync(akarUji, { recursive: true, force: true });
  } catch {
    console.log(`  ..   catatan: folder uji belum bisa dihapus (${akarUji}); aman dihapus manual.`);
  }
}

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal === 0 ? 0 : 1);
