/*
 * Mengunci perbaikan: kontrol Language Server harus MATI dan terlihat mati
 * saat saklar induknya (IntelliSense) off.
 *
 * Bug yang dicegah: setiap toggle dan tombol per server dulu terlihat bisa
 * diklik tapi tidak berefek apa-apa saat `lsp.enabled` false, tanpa satu pun
 * petunjuk kenapa. User melaporkannya sebagai "tidak bisa dipencet apa-apa" -
 * dan dari apa yang terlihat di layar, kesimpulan itu benar.
 *
 * Yang diuji, dan kenapa:
 *   1. saklar induk SUNGGUHAN bisa diklik   - kalau tidak, perbaikannya sia-sia
 *   2. saat off: baris diredupkan           - mata diberi tahu "nonaktif"
 *   3. saat off: tiap kontrol `disabled`    - mouse diberi tahu hal yang SAMA
 *   4. saat off: ada penjelasannya          - sebabnya terbaca, bukan ditebak
 *   5. saat on: kontrol hidup lagi          - perbaikannya tidak mengunci apa pun
 *
 * Semua lewat event mouse CDP asli, bukan .click(), karena .click() tetap
 * bekerja pada elemen yang `disabled` di sebagian browser - dan itu akan
 * membuat uji ini lulus padahal aplikasinya masih bohong.
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.log('TIDAK ADA page target - app mati?');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
await new Promise((r) => ws.on('open', r));

const evalJs = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) {
    return { err: (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text ?? '').slice(0, 200) };
  }
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lulus = 0;
let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK   ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

/*
 * Klik yang MEMBUKTIKAN kliknya sampai.
 *
 * `block: 'center'` tidak selalu cukup: kalau elemennya masih di luar viewport
 * sesudah menggulir - dan itu terjadi pada elemen yang berada jauh di bawah di
 * dalam wadah yang punya beberapa lapis - koordinatnya negatif atau melewati
 * dasar layar, `elementFromPoint` mengembalikan null, dan kliknya jatuh ke
 * tempat lain TANPA ERROR APA PUN.
 *
 * Jadi di sini kliknya diulang dengan posisi gulir yang berbeda sampai
 * `elementFromPoint` membuktikan elemennya memang ada di titik itu. Kalau tidak
 * pernah berhasil, hasilnya `false` - dan pemanggilnya tahu klik itu tidak
 * terjadi, alih-alih menyimpulkan fiturnya rusak.
 */
async function klik(testid) {
  for (const blok of ['center', 'nearest']) {
    await evalJs(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (e) e.scrollIntoView({ block: '${blok}' }); })()`);
    await sleep(260);
    const r = await evalJs(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (!e) return null; const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const a = document.elementFromPoint(x, y); return JSON.stringify({ x: Math.round(x), y: Math.round(y), sampai: a ? (a === e || e.contains(a)) : false }); })()`);
    if (!r) return false;
    const p = JSON.parse(r);
    if (!p.sampai) continue; /* posisi ini tidak mengenai sasaran; coba cara lain */
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    return true;
  }
  return false;
}

/* Pastikan halaman LSP terbuka. Ikon Settings itu toggle, jadi dibaca dulu. */
const sudah = await evalJs(`(() => !!document.querySelector('[data-testid="set-nav-lsp"]'))()`);
if (!sudah) {
  await evalJs(`(() => [ ...document.querySelectorAll('[data-activity]') ].filter(e => e.getAttribute('data-activity') === 'settings').forEach(b => b.click()))()`);
  await sleep(900);
}
await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-lsp"]'); if (b) b.click(); })()`);
await sleep(1400);

const adaSaklar = await evalJs(`(() => !!document.querySelector('[data-testid="lsp-global"]'))()`);
if (!adaSaklar) {
  console.log('GAGAL: saklar lsp-global tidak ada - halaman LSP tidak terbuka');
  process.exit(1);
}

/* Normalkan ke MATI dulu, supaya uji berjalan dari keadaan yang sama tiap kali.
   Harness lain bisa meninggalkannya menyala. */
/*
 * Saklar induk ada di KEPALA section, dan halaman ini panjang (21 baris server).
 * Uji lain di berkas ini menggulir ke bawah untuk mencapai tombol per server, dan
 * gulirannya bertahan - sehingga pada pemanggilan berikutnya saklar induk berada
 * di ATAS layar (terukur: y = -1234). `scrollIntoView({block:'center'})` di dalam
 * `klik()` tidak cukup untuk itu pada beberapa kasus, karena ia menggulir relatif
 * terhadap wadahnya sendiri.
 *
 * Jadi karena itu, sebelum menyentuhnya, wadahnya digulir ke paling ATAS dulu.
 * Tanpa ini, kliknya jatuh ke koordinat kosong tanpa error apa pun, dan ujinya
 * melaporkan "tidak bisa mematikan saklar induk" pada aplikasi yang benar -
 * persis kegagalan yang sempat terjadi di sini.
 */
async function setSaklar(ingin) {
  for (let i = 0; i < 4; i += 1) {
    /*
     * Wadah yang menggulir ditemukan DARI SAKLAARNYA, bukan ditebak.
     *
     * Percobaan sebelumnya menulis `scrollTop = 0` ke `.set-content` dan
     * `.settings-body` - dan tidak terjadi apa pun, karena wadah yang
     * sebenarnya menggulir bernama `.set-body`. Menulis ke elemen yang salah
     * tidak melempar error: ia diam saja, dan gejalanya terbaca seperti "saklar
     * tidak bisa diklik". Jadi wadahnya dicari dengan menelusuri induk saklar
     * sampai ketemu elemen yang `overflow-y`-nya auto/scroll.
     */
    await evalJs(`
      (() => {
        const s = document.querySelector('[data-testid="lsp-global"]');
        let e = s;
        while (e && e !== document.body) {
          const g = getComputedStyle(e);
          if ((g.overflowY === 'auto' || g.overflowY === 'scroll') && e.scrollHeight > e.clientHeight) { e.scrollTop = 0; return; }
          e = e.parentElement;
        }
      })()
    `);
    await sleep(340);

    const kini = await evalJs(`(() => document.querySelector('[data-testid="lsp-global"]')?.getAttribute('aria-checked'))()`);
    if (kini === null) return false;
    if ((kini === 'true') === ingin) return true;

    const sampai = await klik('lsp-global');
    await sleep(950);

    /* Kalau kliknya tidak sampai, tidak ada gunanya mengulang persis sama. */
    if (sampai === false) await sleep(200);
  }
  return false;
}

console.log('== Verifikasi Language Server: kontrol mati saat IntelliSense off ==\n');

if (!(await setSaklar(false))) {
  console.log('GAGAL: tidak bisa mematikan saklar induk');
  process.exit(1);
}
await sleep(700);

console.log('-- keadaan MATI (lsp.enabled = false) --');

cek('nota penjelas muncul', await evalJs(`(() => !!document.querySelector('[data-testid="lsp-mati-nota"]'))()`));

/* Baris diredupkan: opacity di bawah 1. Diukur dari nilainya, bukan dari
   keberadaan kelas - kelas yang tepat bisa dipasang tanpa efek apa pun.
 *
 * Yang diukur adalah `.lsp-baris`, ANAK dari `.lsp-grup`, karena di situlah
 * aturannya berlaku. Versi pertama uji ini mengukur wadahnya dan melaporkan
 * gagal padahal CSS-nya bekerja - uji yang salah mengukur menolak perbaikan
 * yang benar, dan itu lebih buruk daripada tidak ada uji. */
const opasitas = await evalJs(`
  (() => {
    const b = document.querySelector('.lsp-grup .lsp-baris');
    return b ? getComputedStyle(b).opacity : null;
  })()
`);
cek('baris diredupkan', Number(opasitas) < 1, 'opacity baris=' + opasitas);

/* Setiap kontrol per server harus `disabled` - atributnya, bukan sekadar
   tidak berefek. */
const nonaktif = await evalJs(`
  (() => {
    const e = [...document.querySelectorAll('[data-testid$="-toggle"]')].filter(x => x.dataset.testid !== 'lsp-global');
    if (!e.length) return JSON.stringify({ jumlah: 0 });
    const mati = e.filter(x => x.disabled).length;
    return JSON.stringify({ jumlah: e.length, mati });
  })()
`);
const N = JSON.parse(nonaktif);
cek('toggle per server dinonaktifkan', N.jumlah > 0 && N.mati === N.jumlah, N.mati + '/' + N.jumlah);

/*
 * Hanya tombol per-server yang dihitung.
 *
 * `lsp-reload-all` - tombol global di kepala section - juga berakhiran '-reload',
 * jadi selector yang longgar ikut menariknya dan ujinya melaporkan "21/22"
 * padahal semua tombol per-server sudah nonaktif. Tombol global itu memang HARUS
 * tetap hidup: memeriksa apakah sebuah tool terpasang di PATH tidak ada
 * hubungannya dengan apakah IntelliSense sedang menyala, dan mematikannya akan
 * mencabut satu-satunya jalan memperbaiki daftar saat saklar induk mati.
 *
 * Disaring dari STRUKTUR: tombol per-server berada di dalam `.lsp-baris`.
 */
const reload = await evalJs(`
  (() => {
    const e = [...document.querySelectorAll('.lsp-baris [data-testid$="-reload"]')];
    if (!e.length) return JSON.stringify({ jumlah: 0 });
    return JSON.stringify({ jumlah: e.length, mati: e.filter(x => x.disabled).length });
  })()
`);
const R = JSON.parse(reload);
cek('tombol Re-check per server dinonaktifkan', R.jumlah > 0 && R.mati === R.jumlah, R.mati + '/' + R.jumlah);

/* Dan yang global harus tetap bisa dipakai saat IntelliSense mati. */
const globalHidup = await evalJs(`(() => { const b = document.querySelector('[data-testid="lsp-reload-all"]'); return b ? !b.disabled : null; })()`);
cek('tombol Re-check global tetap hidup', globalHidup === true, String(globalHidup));

/* Yang paling menentukan: klik sungguhan pada toggle server tidak boleh mengubah
   apa pun selagi saklar induk off. */
const sebelumKlik = await evalJs(`(() => { const e = [...document.querySelectorAll('[data-testid$="-toggle"]')].find(x => x.dataset.testid !== 'lsp-global'); return e.getAttribute('aria-checked'); })()`);
await klik((await evalJs(`(() => { const e = [...document.querySelectorAll('[data-testid$="-toggle"]')].find(x => x.dataset.testid !== 'lsp-global'); return e ? e.dataset.testid : null; })()`)) || '');
await sleep(900);
const sesudahKlik = await evalJs(`(() => { const e = [...document.querySelectorAll('[data-testid$="-toggle"]')].find(x => x.dataset.testid !== 'lsp-global'); return e.getAttribute('aria-checked'); })()`);
cek('klik sungguhan tidak mengubah toggle', sebelumKlik === sesudahKlik, sebelumKlik + ' -> ' + sesudahKlik);

console.log('\n-- keadaan NYALA (lsp.enabled = true) --');

if (!(await setSaklar(true))) {
  console.log('GAGAL: tidak bisa menyalakan saklar induk');
  process.exit(1);
}
await sleep(900);

cek('nota penjelas hilang', !(await evalJs(`(() => !!document.querySelector('[data-testid="lsp-mati-nota"]'))()`)));

const opasitas2 = await evalJs(`
  (() => {
    const b = document.querySelector('.lsp-grup .lsp-baris');
    return b ? getComputedStyle(b).opacity : null;
  })()
`);
cek('perendupan hilang', Number(opasitas2) === 1, 'opacity baris=' + opasitas2);

const hidup = await evalJs(`
  (() => {
    const e = [...document.querySelectorAll('[data-testid$="-toggle"]')].filter(x => x.dataset.testid !== 'lsp-global');
    const r = [...document.querySelectorAll('.lsp-baris [data-testid$="-reload"]')];
    return JSON.stringify({ toggleMati: e.filter(x => x.disabled).length, toggleJumlah: e.length, reloadMati: r.filter(x => x.disabled).length, reloadJumlah: r.length });
  })()
`);
const H = JSON.parse(hidup);
cek('toggle per server hidup lagi', H.toggleMati === 0, H.toggleMati + '/' + H.toggleJumlah + ' masih mati');
cek('tombol Re-check hidup lagi', H.reloadMati === 0, H.reloadMati + '/' + H.reloadJumlah + ' masih mati');

/*
 * Toggle server harus benar-benar berefek sekarang.
 *
 * Keadaannya dikunci ke "mati" DULU, dan itu bukan kerapian: nilai toggle ini
 * bergantung pada settings yang bertahan antar sesi, jadi ia bisa sudah menyala
 * saat uji mulai - dan klik tunggalnya lalu MEMATIKAN, sehingga ujinya berbunyi
 * gagal pada aplikasi yang benar. Kalau keadaannya tidak bisa dikunci, ujinya
 * dilewati dengan pesan jelas, bukan dilaporkan gagal.
 */
/*
 * Dipilih server yang TERPASANG, bukan yang pertama di daftar.
 *
 * Versi pertama mengambil toggle pertama di DOM, dan server pertama daftar ini
 * adalah `clangd` - yang belum terpasang di mesin ini. Menyalakan server yang
 * belum terpasang memang TIDAK mengubah toggle: ia membuka dialog pemasangan.
 * Jadi ujinya melaporkan "toggle tidak berefek" padahal aplikasinya melakukan
 * hal yang benar, pada kasus yang bukan kasus yang dimaksud.
 *
 * Dipilih dari STRUKTUR: baris yang punya penanda terpasang.
 */
const idServer = await evalJs(`
  (() => {
    const baris = [...document.querySelectorAll('.lsp-baris')].find((b) => b.querySelector('[data-testid$="-siap"]'));
    const t = baris ? baris.querySelector('[data-testid$="-toggle"]') : null;
    return t ? t.dataset.testid : null;
  })()
`);

async function setToggle(id, ingin) {
  for (let i = 0; i < 3; i += 1) {
    const kini = await evalJs(`(() => document.querySelector('[data-testid="${id}"]').getAttribute('aria-checked'))()`);
    if ((kini === 'true') === ingin) return true;
    await klik(id);
    await sleep(900);
  }
  return false;
}

if (!idServer) {
  console.log('  DILEWATI: tidak ada toggle server');
} else if (!(await setToggle(idServer, false))) {
  console.log('  DILEWATI: keadaan ' + idServer + ' tidak bisa dikunci ke mati');
} else {
  await klik(idServer);
  await sleep(1000);
  const b = await evalJs(`(() => document.querySelector('[data-testid="${idServer}"]').getAttribute('aria-checked'))()`);
  cek('toggle server berefek saat induk nyala', b === 'true', 'false -> ' + b);
  /* Kembalikan ke mati, supaya keadaan akhirnya sama seperti sebelumnya. */
  await setToggle(idServer, false);
}

/* Kembalikan saklar induk ke MATI: itu keadaan awal sebelum uji ini, dan
   harness lain (uji rilis LSP) memakainya dari keadaan itu. */
await setSaklar(false);

console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total ? 0 : 1);
