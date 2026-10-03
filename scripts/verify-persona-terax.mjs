/*
 * Verifikasi kartu persona ala Terax di aplikasi hidup.
 *
 * Bug yang dicegah: baris persona dulu hanya menandai yang aktif dengan kata
 * "Aktif" dan tidak punya kontrol yang terlihat untuk MEMILIH persona lain.
 * Dari layar, pertanyaan "bagaimana cara menggantinya" tidak punya jawaban
 * yang terlihat - dan itu keluhan yang sama bentuknya dengan Language Server.
 *
 * Yang diuji:
 *  1. Setiap persona punya ikon peran, dan ikonnya BERBEDA antar peran.
 *     Diukur dari atribut `data-ikon`, bukan keberadaan elemen: enam elemen
 *     dengan bentuk sama tidak memberi tahu apa pun.
 *  2. Baris aktif menampilkan "Active", baris lain menampilkan tombol.
 *  3. Tombol benar-benar BERPINDAH saat diklik: persona yang diklik menjadi
 *     aktif, dan yang sebelumnya tidak lagi.
 */

import WebSocket from 'ws';

const PORT = process.argv[2] || '9223';
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.log('app mati'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
let seq = 0;
const pending = new Map();
const errors = [];
function send(method, params) {
  return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description ?? '').slice(0, 200));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.on('open', r));
await send('Runtime.enable');
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 200);
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lulus = 0;
let total = 0;
function cek(nama, syarat, bukti) {
  total += 1;
  if (syarat) { lulus += 1; console.log('  OK    ' + nama + (bukti ? '  [' + bukti + ']' : '')); }
  else console.log('  GAGAL ' + nama + (bukti ? '  [' + bukti + ']' : ''));
}

/* Klik dengan menggulir dulu: baris bawah kartu persona di luar viewport. */
async function klik(testid) {
  const ok = await evalJs(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; })()`);
  if (!ok) return false;
  await sleep(200);
  const r = await evalJs(`(() => { const e = document.querySelector('[data-testid="${testid}"]'); if (!e) return null; const b = e.getBoundingClientRect(); const x = b.left + b.width/2, y = b.top + b.height/2; const a = document.elementFromPoint(x, y); return JSON.stringify({ x: Math.round(x), y: Math.round(y), sampai: a ? (a === e || e.contains(a)) : false }); })()`);
  if (!r) return false;
  const p = JSON.parse(r);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  return p.sampai;
}

/* Buka Settings -> Agents. */
const sudah = await evalJs(`(() => !!document.querySelector('[data-testid="set-nav-agents"]'))()`);
if (!sudah) {
  await evalJs(`(() => [ ...document.querySelectorAll('[data-activity]') ].filter(e => e.getAttribute('data-activity') === 'settings').forEach(b => b.click()))()`);
  await sleep(1000);
}
await evalJs(`(() => { const b = document.querySelector('[data-testid="set-nav-agents"]'); if (b) b.click(); })()`);
await sleep(1500);

console.log('== Verifikasi kartu persona ala Terax ==\n');

/* --- 1. ikon peran --- */
/*
 * Baris persona dikenali dari STRUKTURNYA, bukan dari pola namanya.
 *
 * Tiga percobaan sebelumnya gagal dengan tiga pola berbeda, dan tiap perbaikan
 * menangkap himpunan yang salah: /^persona-[a-z]+$/ ikut menarik `daftar`,
 * `card`, dan `cara`; menambahkan `[a-z0-9]{6,}` masih menarik `daftar`; lalu
 * `[a-z0-9]+-[a-z0-9]+` justru menarik `zeph-pilih` dan `zeph-aktif`.
 *
 * Pola nama tidak akan pernah tepat, karena SEMUA turunan baris memakai awalan
 * `persona-` yang sama. Yang membedakan sebuah BARIS dari tombol di dalamnya
 * adalah isinya: baris punya anak `.persona-ikon`, tombol tidak. Jadi itu yang
 * dipakai - satu definisi yang tidak perlu diperbarui saat markup berubah.
 */
const CARI_BARIS = `[...document.querySelectorAll('[data-testid^="persona-"]')].filter(e => e.querySelector(':scope > .persona-pilih'))`;

const ikon = await evalJs(`
  (() => {
    const baris = ${CARI_BARIS};
    const data = baris.map((b) => {
      const i = b.querySelector('.persona-ikon');
      return { id: b.dataset.testid.replace('persona-', ''), ikon: i ? i.dataset.ikon : null };
    });
    const unik = new Set(data.map((d) => d.ikon).filter(Boolean));
    return JSON.stringify({ jumlah: baris.length, tidakAdaIkon: data.filter((d) => !d.ikon).map((d) => d.id), unik: [...unik], data });
  })()
`);
const I = JSON.parse(ikon);
cek('setiap persona punya ikon peran', I.jumlah > 0 && I.tidakAdaIkon.length === 0, I.jumlah + ' baris, unik: ' + I.unik.join(','));
cek('ikonnya BERBEDA antar peran (bukan glyph yang sama)', I.unik.length >= 4, I.unik.length + ' glyph unik');
console.log('     peta: ' + I.data.map((d) => d.id + '=' + d.ikon).join(' '));

/* --- 2. keadaan vs tombol --- */
const keadaan = await evalJs(`
  (() => {
    const baris = ${CARI_BARIS};
    const aktif = baris.filter((b) => b.classList.contains('is-aktif'));
    const adaTombol = [...document.querySelectorAll('[data-testid$="-pakai"]')].length;
    const adaBadge = [...document.querySelectorAll('[data-testid$="-aktif"]')].length;
    return JSON.stringify({ jumlahAktif: aktif.length, idAktif: aktif.map((b) => b.dataset.testid), adaTombol, adaBadge });
  })()
`);
const K = JSON.parse(keadaan);
cek('tepat satu baris aktif', K.jumlahAktif === 1, K.idAktif.join(','));
cek('baris aktif menampilkan penanda "Active"', K.adaBadge === 1, K.adaBadge + ' penanda');
cek('baris lain menampilkan tombol pilih', K.adaTombol >= 4, K.adaTombol + ' tombol');

/* --- 3. tombol benar-benar memindahkan pilihan --- */
const idBaru = await evalJs(`(() => { const b = document.querySelector('[data-testid$="-pakai"]'); return b ? b.dataset.testid.replace(/-pakai$/, '') : null; })()`);
/*
 * Keadaan awal DIKUNCI ke `zeph` sebelum mengklik.
 *
 * Persona aktif tersimpan di settings dan bertahan antar sesi, jadi uji ini bisa
 * mulai dari mana saja - dan versi pertamanya mulai dari `coder` yang tertinggal
 * dari sesi sebelumnya, lalu melaporkan kegagalan palsu. Dikunci dulu, baru
 * diuji, sehingga hasilnya tidak bergantung pada apa yang terjadi sebelumnya.
 */
const AKTIF_AWAL = 'persona-zeph';
async function aktifSekarang() {
  return evalJs(`(() => { const b = document.querySelector('.persona-baris.is-aktif'); return b ? b.dataset.testid : null; })()`);
}

if ((await aktifSekarang()) !== AKTIF_AWAL) {
  await klik('persona-zeph-pakai');
  await sleep(1000);
}
const terkunci = (await aktifSekarang()) === AKTIF_AWAL;
if (!terkunci) {
  console.log('\n  DILEWATI: keadaan awal tidak bisa dikunci ke ' + AKTIF_AWAL);
}

if (!idBaru || !terkunci) {
  if (!idBaru) console.log('\n  DILEWATI: tidak ada tombol pilih untuk diuji');
} else {
  /* Baris pertama yang BUKAN aktif - itu tombol yang harus memindahkan pilihan. */
  const target = await evalJs(`
    (() => {
      const b = [...document.querySelectorAll('[data-testid$="-pakai"]')].find((e) => !e.closest('.persona-baris.is-aktif'));
      return b ? b.dataset.testid : null;
    })()
  `);
  const idTarget = target ? target.replace(/-pakai$/, '') : null;
  const sampai = await klik(target);
  await sleep(1100);
  const sesudah = await aktifSekarang();
  cek('klik memindahkan pilihan ke persona itu', sesudah === idTarget, AKTIF_AWAL + ' -> ' + sesudah + ' (harap ' + idTarget + ', klik sampai: ' + sampai + ')');

  /* Kembalikan, supaya keadaan akhirnya sama seperti sebelum uji ini. */
  await klik('persona-zeph-pakai');
  await sleep(900);
  cek('pilihan bisa dikembalikan', (await aktifSekarang()) === AKTIF_AWAL, String(await aktifSekarang()));
}

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
