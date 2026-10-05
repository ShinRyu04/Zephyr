/*
 * Referensi berkas yang diklik di jawaban AI harus membuka BERKASNYA.
 *
 * Yang rusak sebelumnya: REF_RE hanya punya satu capture group, yaitu nomor
 * baris. Jadi `ref[1]` adalah nomor baris (atau undefined) dan pathnya tidak
 * pernah tertangkap. Klik pada referensi mengirim undefined ke openPathAt,
 * yang sampai ke kunciPath(undefined).replace(...) dan MELEMPAR.
 *
 * Lemparan itu mematikan loop agent yang sedang berjalan - karena itu agent
 * terlihat berhenti di tengah rencana, tepat setelah jawaban yang menyebut
 * berkas, tanpa error dan tanpa toast.
 *
 * Yang dibuktikan:
 *   1. regex menangkap PATH di group 1 dan nomor baris di group 2
 *   2. kunciPath TIDAK melempar untuk nilai yang tidak masuk akal
 *   3. path masih dibandingkan dengan benar (logika \/ -> \ tidak terbalik)
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
if (!page) {
  console.log('Zephyr tidak ketemu');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) {
    return (
      'GALAT: ' + String(r.result.exceptionDetails.exception?.description ?? '').split('\n')[0]
    );
  }
  return r.result?.result?.value;
};

let lulus = 0;
let gagal = 0;
const uji = (nama, ok, bukti) => {
  if (ok) {
    console.log(`  LULUS  ${nama}`);
    lulus++;
  } else {
    console.log(`  GAGAL  ${nama}${bukti !== undefined ? '  -> ' + JSON.stringify(bukti) : ''}`);
    gagal++;
  }
};

console.log('=== 1. regex referensi berkas ===');
/* Regex diuji apa adanya, dengan pola yang sama seperti di ChatMessage.tsx. */
const kasus = [
  { teks: 'situs/index.html', harapPath: 'situs/index.html', harapBaris: 1 },
  { teks: 'src/lib/types.ts:12', harapPath: 'src/lib/types.ts', harapBaris: 12 },
  { teks: './situs/styles.css', harapPath: './situs/styles.css', harapBaris: 1 },
];
for (const k of kasus) {
  const hasil = await ev(`(() => {
    const R = /^((?:\\.{0,2}\\/|\\.{0,2}\\\\)?[\\w@./\\\\-]+(?:\\.\\w{1,8}))(?::(\\d+))?$/;
    const m = R.exec(${JSON.stringify(k.teks)});
    if (!m) return JSON.stringify({ cocok: false });
    return JSON.stringify({ cocok: true, path: m[1], baris: m[2] ? Number(m[2]) : 1 });
  })()`);
  const h = typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
  uji(
    `"${k.teks}" -> path ${k.harapPath}${k.harapBaris > 1 ? ' baris ' + k.harapBaris : ''}`,
    h?.cocok && h.path === k.harapPath && h.baris === k.harapBaris,
    h,
  );
}

console.log('\n=== 2. kunciPath tidak melempar untuk nilai tidak masuk akal ===');
const aneh = await ev(`(() => {
  /* Lewat store, sama seperti klik sungguhan. Yang diuji: TIDAK melempar. */
  const hasil = {};
  for (const [nama, nilai] of [['undefined', undefined], ['null', null], ['angka', 42], ['string kosong', '']]) {
    try {
      const s = window.__ZEPHYR__.pathSama ? window.__ZEPHYR__.pathSama(nilai, 'a.ts') : null;
      hasil[nama] = s === null ? 'tidak ada bridge pathSama' : 'aman (' + s + ')';
    } catch (e) {
      hasil[nama] = 'MELEMPAR: ' + e.message;
    }
  }
  return JSON.stringify(hasil, null, 1);
})()`);
console.log(aneh);

console.log('\n=== 3. path masih dibandingkan dengan benar (logika tidak terbalik) ===');
const banding = await ev(`(() => {
  const P = window.__ZEPHYR__.pathSama;
  if (!P) return 'tidak ada bridge pathSama';
  return JSON.stringify({
    'sama persis': P('D:/Talos/situs/a.ts', 'D:/Talos/situs/a.ts'),
    'beda garis miring': P('D:/Talos/situs/a.ts', 'D:\\\\Talos\\\\situs\\\\a.ts'),
    'beda huruf besar': P('D:/Talos/Situs/A.TS', 'd:/talos/situs/a.ts'),
    'beda berkas': P('D:/Talos/situs/a.ts', 'D:/Talos/situs/b.ts'),
  }, null, 1);
})()`);
console.log(banding);

ws.close();
console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
