// uji-review.mjs — bukti hidup strip "N files to review / Undo All / Keep All"
// di atas kotak input chat.
//
// Kenapa uji ini ada: strip itu adalah SATU-SATUNYA keputusan keep/undo yang
// bisa diambil tanpa menggulir transkrip. Tombol yang hanya "kelihatan benar"
// tidak cukup: Undo harus benar-benar mengembalikan isi berkas di disk (dan
// menghapus berkas yang memang baru dibuat), Keep harus membiarkan disk apa
// adanya, dan keduanya harus mengosongkan strip.
//
// Yang diperiksa:
//   R1  strip muncul saat ada perubahan giliran ini
//   R2  judulnya menyebut jumlah berkas yang benar
//   R3  tombol Undo All + Keep All ada
//   R4  membuka daftar menampilkan baris berkas dengan path lengkap
//   R5  klik baris membuka DiffView di jendela utama
//   R6  Keep All mengosongkan strip dan TIDAK mengubah disk
//   R7  Undo All mengembalikan isi sebelum tulisan agen
//   R8  Undo All menghapus berkas yang baru DIBUAT agen (sebelum = null)
//   R9  Keep per berkas hanya membuang baris itu, disk tidak berubah
//   R10 Undo per berkas hanya mengembalikan berkas itu
//   R11 tombol Keep/Undo per berkas TIDAK membuka DiffView
//   R12 campuran: keep satu berkas, undo berkas lain
//
// Pemakaian (butuh app hidup dengan port debug):
//   npm run dev
//   cd src-tauri; $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"; .\target\debug\zephyr.exe
//   node scripts/uji-review.mjs
//
// Exit: 0 = semua lulus, 1 = ada yang gagal, 2 = app tidak hidup di 9223.

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { Cdp, sleep, tungguBridge } from './lib-cdp.mjs';

const PORT = process.env.ZEPHYR_CDP_PORT ?? '9223';
const AKAR = process.cwd();
const DUMMY = `${AKAR}\\scratch\\uji-review-dummy.ts`;
const BARU = `${AKAR}\\scratch\\uji-review-baru.ts`;

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

/* Store jendela utama & store diff dipasang ulang setiap reload (HMR). Setiap
   akses menunggu jembatannya benar-benar ada, bukan menebak dari `sleep`. */
const z = async (expr) => {
  await tungguBridge(cdp, '__ZEPHYR__');
  return cdp.eval(expr);
};

const ISI_A = 'baris satu\nbaris dua\n';
const ISI_B = 'baris satu\nbaris dua\nbaris tiga\n';

/* Buka chat AI sebagai tab editor, supaya ada AiPanel (dan kotak inputnya)
   yang pasti ter-mount, terlepas dari panel kanan sedang terbuka atau tidak. */
await z(`window.__ZEPHYR__.getState().bukaViewAi('ai-chat'); 'ok'`);
await sleep(700);

const catat = async (path, sebelum, sesudah, id) => {
  /* Jembatan dev dipasang ulang setiap halaman reload (HMR), jadi tunggu ia ada
     sebelum menyentuh store - kalau tidak, uji mati dengan "Cannot read
     properties of undefined" padahal app-nya sehat. */
  await tungguBridge(cdp, '__ZEPHYR_DIFF__');
  /* `mulai` mengosongkan daftar berkas (satu giliran = satu turnId). Memanggilnya
     per berkas menghapus baris berkas pertama, jadi hanya dipanggil kalau
     turnId-nya memang berbeda. */
  await cdp.eval(`
    (() => {
      const st = window.__ZEPHYR_DIFF__.store.getState();
      if (st.turnId !== ${JSON.stringify(id)}) st.mulaiTurn(${JSON.stringify(id)});
      return 'ok';
    })()
  `);
  await cdp.eval(`
    window.__ZEPHYR_DIFF__.store.getState()
      .catatSebelum(${JSON.stringify(path)}, ${JSON.stringify(sebelum)});
    'ok'
  `);
  await cdp.eval(`
    window.__ZEPHYR_DIFF__.store.getState()
      .catatSesudah(${JSON.stringify(path)}, ${JSON.stringify(sesudah)});
    'ok'
  `);
  await sleep(500);
};

const strip = () =>
  cdp.eval(`JSON.stringify((() => {
    const s = [...document.querySelectorAll('[data-testid="ai-review"]')];
    const el = s[0];
    if (!el) return { ada: false, jumlah: s.length };
    return {
      ada: true,
      jumlah: s.length,
      judul: (el.querySelector('.ai-review-judul')?.textContent ?? '').trim(),
      undo: !!el.querySelector('[data-testid="ai-review-undo"]'),
      keep: !!el.querySelector('[data-testid="ai-review-keep"]'),
      terbuka: el.getAttribute('data-open') === '1',
      baris: [...el.querySelectorAll('[data-testid="ai-review-baris"]')].map((b) => b.getAttribute('title') ?? ''),
      /* Arah buka: daftar harus DI ATAS header, bukan menutupi composer. */
      kepalaBawah: Math.round(el.querySelector('.ai-review-kepala')?.getBoundingClientRect().bottom ?? 0),
      isiAtas: Math.round(el.querySelector('.ai-review-isi')?.getBoundingClientRect().top ?? 0),
      isiBawah: Math.round(el.querySelector('.ai-review-isi')?.getBoundingClientRect().bottom ?? 0),
      composerAtas: Math.round(document.querySelector('.ai-input-row')?.getBoundingClientRect().top ?? 0),
    };
  })())`).then((s) => JSON.parse(s));

/* ── R1..R5: strip muncul, isinya benar, baris membuka DiffView ─────────── */
writeFileSync(DUMMY, ISI_A, 'utf8');
await catat(DUMMY, ISI_A, ISI_B, 'uji-review-1');
writeFileSync(DUMMY, ISI_B, 'utf8');
await sleep(400);

let s = await strip();
cek('R1  strip review muncul saat ada perubahan', s.ada === true, JSON.stringify(s));
cek('R2  judul menyebut jumlah berkas', /1 file/i.test(s.judul ?? ''), `judul="${s.judul}"`);
cek('R3  tombol Undo All dan Keep All ada', s.undo === true && s.keep === true, JSON.stringify(s));

await cdp.eval(`document.querySelector('[data-testid="ai-review-toggle"]').click(); 'ok'`);
await sleep(400);
s = await strip();
cek(
  'R4  daftar berkas menampilkan path lengkap',
  (s.baris ?? []).some((p) => p.replace(/\\/g, '/').endsWith('scratch/uji-review-dummy.ts')),
  JSON.stringify(s.baris),
);

/* R4b — daftar terbuka KE ATAS: kalau ia tumbuh ke bawah, ia menutupi kotak
   input yang persis ada di bawah bar. Diukur, bukan diasumsikan dari CSS. */
cek(
  'R4b daftar berkas terbuka ke atas, tidak menutupi composer',
  (s.isiBawah ?? 0) <= (s.kepalaBawah ?? 0) + 1 && (s.isiBawah ?? 0) <= (s.composerAtas ?? 0),
  `isiBawah=${s.isiBawah} kepalaBawah=${s.kepalaBawah} composerAtas=${s.composerAtas}`,
);

await cdp.eval(`document.querySelector('[data-testid="ai-review-baris"]').click(); 'ok'`);
await sleep(600);
const view = await z(`JSON.stringify({
  view: (() => {
    const st = window.__ZEPHYR__.getState();
    const t = st.tabs.find((x) => x.id === st.activeTabId);
    return t ? t.view ?? null : null;
  })(),
  sorot: window.__ZEPHYR_DIFF__.sorot(),
})`).then((v) => JSON.parse(v));
cek('R5  klik baris membuka DiffView', view.view === 'diff-view', JSON.stringify(view));

/* Kembali ke chat untuk dua uji berikutnya. */
await z(`window.__ZEPHYR__.getState().bukaViewAi('ai-chat'); 'ok'`);
await sleep(900);
await tungguBridge(cdp, '__ZEPHYR_DIFF__');

/* ── R6: Keep All ───────────────────────────────────────────────────────── */
await catat(DUMMY, ISI_A, ISI_B, 'uji-review-2');
writeFileSync(DUMMY, ISI_B, 'utf8');
await sleep(300);
const adaSebelumKeep = (await strip()).ada;
await cdp.eval(`document.querySelector('[data-testid="ai-review-keep"]').click(); 'ok'`);
await sleep(600);
const sKeep = await strip();
cek('R6a Keep All mengosongkan strip', adaSebelumKeep === true && sKeep.ada === false, JSON.stringify(sKeep));
cek('R6b Keep All membiarkan disk apa adanya', readFileSync(DUMMY, 'utf8') === ISI_B);

/* ── R7: Undo All mengembalikan isi lama ────────────────────────────────── */
await catat(DUMMY, ISI_A, ISI_B, 'uji-review-3');
writeFileSync(DUMMY, ISI_B, 'utf8');
await sleep(300);
await cdp.eval(`document.querySelector('[data-testid="ai-review-undo"]').click(); 'ok'`);
await sleep(1200);
const sUndo = await strip();
cek('R7a Undo All mengosongkan strip', sUndo.ada === false, JSON.stringify(sUndo));
cek(
  'R7b Undo All mengembalikan isi berkas',
  readFileSync(DUMMY, 'utf8') === ISI_A,
  JSON.stringify(readFileSync(DUMMY, 'utf8')),
);

/* ── R8: berkas yang baru DIBUAT dihapus lagi ───────────────────────────── */
try {
  rmSync(BARU, { force: true });
} catch {
  /* sudah tidak ada */
}
await cdp.eval(`window.__ZEPHYR_DIFF__.mulai('uji-review-4'); 'ok'`);
await cdp.eval(`
  window.__ZEPHYR_DIFF__.store.getState().catatSebelum(${JSON.stringify(BARU)}, null);
  'ok'
`);
writeFileSync(BARU, 'berkas baru dari agen\n', 'utf8');
await cdp.eval(`
  window.__ZEPHYR_DIFF__.store.getState()
    .catatSesudah(${JSON.stringify(BARU)}, 'berkas baru dari agen\\n');
  'ok'
`);
await sleep(500);
await cdp.eval(`document.querySelector('[data-testid="ai-review-undo"]').click(); 'ok'`);
await sleep(1200);
cek('R8  Undo All menghapus berkas yang baru dibuat', existsSync(BARU) === false);

/* ── R9..R12: keep/undo PER BERKAS ──────────────────────────────────────── */
const KEDUA = `${AKAR}\\scratch\\uji-review-kedua.ts`;
const ISI_KEDUA_A = 'kedua sebelum\n';
const ISI_KEDUA_B = 'kedua sesudah\n';

const barisInfo = () =>
  /* Hanya strip PERTAMA: app boleh punya dua permukaan chat hidup (kolom kanan
     dan tab editor `ai-chat`), dan keduanya merender strip review dari store
     yang sama. Menghitung semua `wrap` akan melihat tiap baris dua kali. */
  cdp.eval(`JSON.stringify([...(document.querySelectorAll('[data-testid="ai-review"]')[0]
    ?.querySelectorAll('.ai-review-baris-wrap') ?? [])].map((w) => ({
    path: w.querySelector('[data-testid="ai-review-baris"]')?.getAttribute('title') ?? '',
    undo: !!w.querySelector('[data-testid="ai-review-undo-berkas"]'),
    keep: !!w.querySelector('[data-testid="ai-review-keep-berkas"]'),
  })))`).then((v) => JSON.parse(v));

const klikBerkas = async (testid, path) => {
  const ok = await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('[data-testid="${testid}"]')]
      .find((x) => x.getAttribute('data-path') === ${JSON.stringify(path)});
    if (!b) return false;
    b.click();
    return true;
  })()`);
  return ok === true;
};

const pastikanDaftarTerbuka = async () => {
  const terbuka = await cdp.eval(
    `document.querySelector('[data-testid="ai-review"]')?.getAttribute('data-open') === '1'`,
  );
  if (!terbuka) {
    await cdp.eval(`document.querySelector('[data-testid="ai-review-toggle"]').click(); 'ok'`);
    await sleep(300);
  }
};

/* R9 — Keep satu berkas: baris itu hilang, berkas lain tetap, disk utuh. */
/* Giliran baru: sisa entri dari uji sebelumnya (mis. baris yang tertinggal saat
   workspace belum kembali ke D:\Zephyr) akan menggandakan baris dan membuat
   hitungan R9a gagal padahal produknya benar. */
await cdp.eval(`window.__ZEPHYR_DIFF__.store.getState().mulaiTurn('uji-review-9'); 'ok'`);
await sleep(200);
writeFileSync(DUMMY, ISI_A, 'utf8');
writeFileSync(KEDUA, ISI_KEDUA_A, 'utf8');
await catat(DUMMY, ISI_A, ISI_B, 'uji-review-5');
writeFileSync(DUMMY, ISI_B, 'utf8');
await catat(KEDUA, ISI_KEDUA_A, ISI_KEDUA_B, 'uji-review-5');
writeFileSync(KEDUA, ISI_KEDUA_B, 'utf8');
await sleep(500);
await pastikanDaftarTerbuka();
let info = await barisInfo();
cek(
  'R9a dua berkas punya tombol Keep/Undo sendiri',
  info.length === 2 && info.every((r) => r.undo && r.keep),
  JSON.stringify(info),
);
const klikKeepDummy = await klikBerkas('ai-review-keep-berkas', DUMMY);
await sleep(500);
info = await barisInfo();
cek(
  'R9b Keep satu berkas membuang hanya baris itu',
  klikKeepDummy &&
    !info.some((r) => r.path.replace(/\\/g, '/').endsWith('scratch/uji-review-dummy.ts')) &&
    info.some((r) => r.path.replace(/\\/g, '/').endsWith('scratch/uji-review-kedua.ts')),
  JSON.stringify(info),
);
cek('R9c Keep satu berkas tidak mengubah disk', readFileSync(DUMMY, 'utf8') === ISI_B);

/* R10 — Undo satu berkas: hanya berkas itu kembali; berkas lain tetap. */
await pastikanDaftarTerbuka();
const klikUndoKedua = await klikBerkas('ai-review-undo-berkas', KEDUA);
await sleep(1200);
const sisa = await strip();
cek(
  'R10a Undo satu berkas mengembalikan hanya berkas itu',
  klikUndoKedua && readFileSync(KEDUA, 'utf8') === ISI_KEDUA_A,
  JSON.stringify(readFileSync(KEDUA, 'utf8')),
);
cek('R10b Undo satu berkas membiarkan berkas lain di disk', readFileSync(DUMMY, 'utf8') === ISI_B);
cek(
  'R10c Undo satu berkas membuang barisnya',
  !(sisa.baris ?? []).some((p) => p.replace(/\\/g, '/').endsWith('scratch/uji-review-kedua.ts')),
  JSON.stringify(sisa.baris),
);

/* R11 — tombol aksi baris tidak boleh ikut membuka DiffView. */
await catat(DUMMY, ISI_A, ISI_B, 'uji-review-6');
writeFileSync(DUMMY, ISI_B, 'utf8');
await sleep(400);
await pastikanDaftarTerbuka();
const viewSebelum = await z(`JSON.stringify((() => {
  const st = window.__ZEPHYR__.getState();
  return st.tabs.find((x) => x.id === st.activeTabId)?.view ?? null;
})())`);
await klikBerkas('ai-review-keep-berkas', DUMMY);
await sleep(400);
const viewSesudah = await z(`JSON.stringify((() => {
  const st = window.__ZEPHYR__.getState();
  return st.tabs.find((x) => x.id === st.activeTabId)?.view ?? null;
})())`);
cek('R11 Keep per berkas tidak membuka DiffView', viewSebelum === viewSesudah, `${viewSebelum} -> ${viewSesudah}`);

/* R12 — campuran: keep A, undo B. */
try {
  rmSync(BARU, { force: true });
} catch {
  /* sudah tidak ada */
}
writeFileSync(DUMMY, ISI_A, 'utf8');
writeFileSync(BARU, 'isi lama baru\n', 'utf8');
await catat(DUMMY, ISI_A, ISI_B, 'uji-review-7');
writeFileSync(DUMMY, ISI_B, 'utf8');
await cdp.eval(`window.__ZEPHYR_DIFF__.store.getState().catatSebelum(${JSON.stringify(BARU)}, 'isi lama baru\\n'); 'ok'`);
writeFileSync(BARU, 'isi baru dari agen\n', 'utf8');
await cdp.eval(`window.__ZEPHYR_DIFF__.store.getState().catatSesudah(${JSON.stringify(BARU)}, 'isi baru dari agen\\n'); 'ok'`);
await sleep(500);
await pastikanDaftarTerbuka();
await klikBerkas('ai-review-keep-berkas', DUMMY);
await sleep(300);
await klikBerkas('ai-review-undo-berkas', BARU);
await sleep(1200);
cek('R12a campuran: berkas yang di-keep tetap versi agen', readFileSync(DUMMY, 'utf8') === ISI_B);
cek('R12b campuran: berkas yang di-undo kembali ke isi lama', readFileSync(BARU, 'utf8') === 'isi lama baru\n');
cek('R12c campuran: strip kosong', (await strip()).ada === false);

/* Bersihkan: jangan tinggalkan berkas uji atau sisa strip di layar. */
for (const p of [DUMMY, BARU, KEDUA]) {
  try {
    rmSync(p, { force: true });
  } catch {
    /* tidak ada */
  }
}
await tungguBridge(cdp, '__ZEPHYR_DIFF__');
await cdp.eval(`window.__ZEPHYR_DIFF__.reset(); 'ok'`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal === 0 ? 0 : 1);
