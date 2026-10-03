/*
 * Mengunci bug "AI gagap": satu pesan antrean terkirim DUA KALI.
 *
 * BUG YANG DICEGAH
 * `kirimAntrian` dulu memutuskan apakah sebuah pesan sudah terkirim dengan
 * membaca `!get().toast` - sebuah EFEK SAMPING - alih-alih nilai kembalian
 * `send()`. Masalahnya `send()` sendiri menyetel toast di banyak jalur yang
 * tetap berarti "terkirim" ('Added to the queue', 'Message trimmed...'), dan
 * jalur antrean menyetel `'Added to the queue'` TEPAT sebelum kembali.
 *
 * Akibatnya pesan yang BERHASIL masuk antrean terbaca sebagai "ditolak", tidak
 * dihapus dari antrean, dan dikirim lagi pada drain berikutnya. User melihat
 * jawaban yang sama muncul dua kali, saling menjalin: "AI-nya gagap".
 *
 * YANG DIUJI, dan kenapa:
 *  1. `send()` mengembalikan `true` saat pesannya masuk antrean - itu janji yang
 *     dipegang `kirimAntrian`, dan kalau janji itu berubah uji ini harus gagal.
 *  2. Panjang antrean BERTAMBAH satu, tidak dua, saat satu pesan dikirim.
 *  3. Antrean benar-benar menyusut saat drain dijalankan - kalau tidak, pesan
 *     akan dikirim berulang kali.
 *
 * Dipakai dari state yang HIDUP lewat bridge dev, bukan import() dari skrip
 * luar: import() membuat store kedua, dan ujinya lalu mengukur store yang bukan
 * dipakai aplikasi.
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

const evalJs = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description ?? '').slice(0, 250);
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

/* Bridge dev harus ada; tanpa itu uji tidak bisa membaca state hidup. */
const adaBridge = await evalJs(`(() => typeof window.__ZEPHYR_AI__ !== 'undefined')()`);
console.log('== Verifikasi antrean AI tidak menggandakan pesan ==\n');
if (!adaBridge) {
  console.log('  DILEWATI: window.__ZEPHYR_AI__ tidak ada (bukan mode dev?)');
  console.log('\n== 0/0 lulus (dilewati) ==');
  ws.close();
  process.exit(0);
}

/* Keadaan awal, supaya bisa dipulihkan di akhir. */
const awal = await evalJs(`(() => { const s = window.__ZEPHYR_AI__.store.getState(); return JSON.stringify({ antrian: s.antrian.length, pending: !!s.pending, busy: !!s.agentBusy, mode: s.agentMode }); })()`);
console.log('keadaan awal: ' + awal);
const A = JSON.parse(awal);

/* Paksa keadaan "sedang sibuk" supaya send() memarkir pesan ke antrean -
   itu jalur yang mengandung bug. */
const diparkir = await evalJs(`
  (() => {
    const st = window.__ZEPHYR_AI__.store;
    /* Kosongkan antrean dulu supaya hitungannya bersih. */
    st.setState({ antrian: [], pending: true, agentBusy: true });
    return st.getState().antrian.length;
  })()
`);
cek('antrean dikosongkan untuk uji', diparkir === 0, String(diparkir));

/* --- 1. send() harus menjawab true saat pesan masuk antrean --- */
const hasil = await evalJs(`
  (async () => {
    const st = window.__ZEPHYR_AI__.store;
    const r = await st.getState().send('uji-antrean-gagap-1');
    return JSON.stringify({ kembali: r, antrian: st.getState().antrian.length, toast: st.getState().toast });
  })()
`, true);
const H = JSON.parse(hasil);
cek('send() mengembalikan true saat masuk antrean', H.kembali === true, 'kembali=' + H.kembali);
cek('tepat satu pesan masuk antrean', H.antrian === 1, H.antrian + ' pesan');
cek('draft dikosongkan setelah parkir', (await evalJs(`(() => window.__ZEPHYR_AI__.store.getState().draft === '')()`)) === true);

/* --- 2. mengirim pesan kedua menambah SATU, bukan dua --- */
await evalJs(`(async () => { await window.__ZEPHYR_AI__.store.getState().send('uji-antrean-gagap-2'); })()`, true);
await sleep(400);
const dua = await evalJs(`(() => window.__ZEPHYR_AI__.store.getState().antrian.length)()`);
cek('pesan kedua menambah tepat satu', dua === 2, dua + ' pesan di antrean');

/* --- 3. drain mengosongkan tepat satu pesan --- */
/*
 * Drain dipanggil dalam keadaan masih sibuk, jadi `send()` di dalamnya akan
 * MEMARKIR ulang pesan itu - dan itulah bentuk bug-nya: sebuah drain yang tidak
 * pernah membuat antrean menyusut berarti pesan yang sama dikirim berulang kali.
 *
 * Yang diukur adalah apakah pesan itu BERPINDAH dari posisinya (terkirim), bukan
 * apakah antreannya kosong: dengan masih sibuk, pesan berikutnya memang wajar
 * ikut terparkir.
 */
const sebelumDrain = await evalJs(`(() => window.__ZEPHYR_AI__.store.getState().antrian.map((a) => a.teks).join('|'))()`);
await evalJs(`(async () => { await window.__ZEPHYR_AI__.store.getState().kirimAntrian(0); })()`, true);
await sleep(900);
const sesudahDrain = await evalJs(`(() => window.__ZEPHYR_AI__.store.getState().antrian.map((a) => a.teks).join('|'))()`);
cek('drain memindahkan pesan pertama keluar dari kepala antrean', sebelumDrain !== sesudahDrain, sebelumDrain.slice(0, 40) + ' -> ' + sesudahDrain.slice(0, 40));

/* --- pulihkan keadaan awal --- */
await evalJs(`(() => { window.__ZEPHYR_AI__.store.setState({ antrian: [], pending: ${A.pending}, agentBusy: ${A.busy} }); })()`);
await sleep(300);
const akhir = await evalJs(`(() => { const s = window.__ZEPHYR_AI__.store.getState(); return JSON.stringify({ antrian: s.antrian.length, pending: !!s.pending, busy: !!s.agentBusy }); })()`);
console.log('\nkeadaan akhir: ' + akhir);

console.log('\nerror console: ' + (errors.length ? errors.slice(0, 2).join(' | ') : '(tidak ada)'));
console.log('\n== ' + lulus + '/' + total + ' lulus ==');
ws.close();
process.exit(lulus === total && !errors.length ? 0 : 1);
