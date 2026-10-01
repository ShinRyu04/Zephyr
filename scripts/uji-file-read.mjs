/**
 * Bukti file_read offset/limit bekerja - memanggil TOOL ASLINYA, bukan tiruan.
 *
 * Jembatan dev menyediakan `window.__ZEPHYR_TOOLS__` = array AGENT_TOOLS yang
 * sebenarnya dipakai model (devBridge.ts:1813). Jadi skrip ini mencari entri
 * bernama "file_read" di array itu dan memanggil `run()`-nya langsung - jalur
 * kode yang sama persis dengan yang dilalui AI, termasuk penjaga path Rust.
 *
 * Penjaga path Rust (`app_state.rs` ensure_readable) hanya mengizinkan berkas di
 * bawah ROOT WORKSPACE YANG TERDAFTAR. App yang baru dibuka belum punya root,
 * jadi uji 0 menambah root lewat `__ZEPHYR_WS__.tambahRoot` dulu.
 *
 * Pakai: node scripts/uji-file-read.mjs <port> <folder>
 */
const PORT = Number(process.argv[2] ?? 9223);
const FOLDER = process.argv[3] ?? 'D:/Zephyr';
const BESAR = `${FOLDER}/tmp-besar.txt`;
const KECIL = `${FOLDER}/package.json`;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.url.includes('5173') || t.url.includes('tauri.localhost'));
if (!page) {
  console.error('app tidak ketemu di port ' + PORT);
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const tunggu = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu.has(m.id)) {
    tunggu.get(m.id)(m);
    tunggu.delete(m.id);
  }
};
function kirim(method, params = {}) {
  const n = ++id;
  ws.send(JSON.stringify({ id: n, method, params }));
  return new Promise((r) => tunggu.set(n, r));
}

/** WebView2 menolak awaitPromise; simpan promise di window lalu polling. */
async function evAsync(expr, ms = 30000) {
  const k = '__uji_' + Math.random().toString(36).slice(2);
  await kirim('Runtime.evaluate', {
    expression: `window.${k}={ok:-1}; Promise.resolve(${expr}).then(v=>window.${k}={ok:1,v}).catch(e=>window.${k}={ok:0,e:String(e&&e.message||e)}); 0`,
    returnByValue: true,
  });
  for (let i = 0; i < Math.ceil(ms / 400); i++) {
    await new Promise((r) => setTimeout(r, 400));
    const r = await kirim('Runtime.evaluate', { expression: `JSON.stringify(window.${k})`, returnByValue: true });
    const t = r.result?.result?.value;
    if (t && t !== '{"ok":-1}') {
      const st = JSON.parse(t);
      await kirim('Runtime.evaluate', { expression: `delete window.${k}`, returnByValue: true });
      return st.ok === 1 ? st.v : { __err: st.e };
    }
  }
  return { __err: 'timeout' };
}

const hasil = [];
function cek(nama, lulus, catatan) {
  hasil.push({ nama, lulus });
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${catatan ? '  -> ' + catatan : ''}`);
}

await kirim('Runtime.enable');

/* Tool diambil dari array aslinya, sekali, lalu semua uji memakainya. */
await evAsync(`(async () => {
  for (let i = 0; i < 40 && !window.__ZEPHYR_TOOLS__; i++) await new Promise(r => setTimeout(r, 250));
  window.__FR__ = window.__ZEPHYR_TOOLS__.find(t => t.spec && t.spec.name === 'file_read');
  return typeof window.__FR__.run;
})()`);

const skema = await evAsync(`JSON.stringify({ ada: !!window.__FR__, props: Object.keys(window.__FR__?.spec?.parameters?.properties ?? {}) })`);
const s = JSON.parse(skema);
cek('tool file_read punya parameter offset & limit', s.props?.includes('offset') && s.props?.includes('limit'), `props: ${s.props?.join(', ')}`);

const panggil = (path, args = {}) =>
  evAsync(`window.__FR__.run(${JSON.stringify({ path, ...args })})`, 60000);

console.log('\n== 0. penjaga path hidup? ==');
/*
 * Root didaftarkan lebih dulu lewat UI/CLI, bukan di sini: tambahRoot membuka
 * dialog trust yang menunggu jawaban user dan akan menggantung harness. Kalau
 * root belum ada, uji di bawah gagal dengan "path outside the workspace" -
 * pesan itu sendiri sudah membuktikan penjaganya bekerja.
 */
const state = await evAsync(`JSON.stringify({ roots: window.__ZEPHYR_WS__.state().roots?.map?.(r => r.path ?? r) ?? [] })`, 8000);
console.log('   root terdaftar:', String(state?.roots ?? state));

const luar = await panggil('C:/Windows/win.ini');
cek('berkas di luar workspace DITOLAK', luar && luar.__err && /workspace/i.test(String(luar.__err)), String(luar?.__err ?? luar).slice(0, 90));

console.log('\n== 1. baca awal berkas besar ==');
const awal = await panggil(BESAR);
const teksAwal = typeof awal === 'string' ? awal : String(awal?.__err ?? awal);
cek('berkas besar terbaca', typeof awal === 'string', teksAwal.slice(0, 90));
const terpotong = /TRUNCATED/.test(teksAwal);
cek('bacaan terpotong MEMBERI TAHU (bukan senyap)', terpotong, teksAwal.match(/\[TRUNCATED[^\]]*\]/)?.[0]?.slice(0, 120) ?? 'tidak ada penanda');
const offsetLanjut = Number(teksAwal.match(/offset=(\d+)/)?.[1] ?? -1);
cek('menyebut offset lanjutan', offsetLanjut > 0, `offset=${offsetLanjut}`);

console.log('\n== 2. lanjut dari offset itu -> harus BUKAN awalan yang sama ==');
/*
 * Penanda di berkas uji duduk di posisi 60001, sedangkan offset lanjutan adalah
 * 102400 - sudah LEWAT penanda. Menuntut menemukan penanda di sini salah:
 * yang benar diperiksa adalah offset itu benar-benar memindahkan jendela baca.
 */
if (offsetLanjut > 0) {
  const lanjut = await panggil(BESAR, { offset: offsetLanjut, limit: 3000 });
  const teks = String(lanjut);
  const berbedaDariAwal = !/^A{100}/.test(teks) && teks.length > 0;
  cek('offset memindahkan jendela baca', berbedaDariAwal, `awal: ${teks.slice(0, 40)}`);

  console.log('\n== 2b. offset tepat di penanda tengah ==');
  const diTengah = await panggil(BESAR, { offset: 60000, limit: 40 });
  const ketemu = /PENANDA_TENGAH/.test(String(diTengah));
  cek('bisa membaca tepat di posisi tengah', ketemu, String(diTengah).replace(/\n/g, ' ').slice(0, 60));
} else {
  cek('offset memindahkan jendela baca', false, 'offset lanjutan tidak disebut');
}

console.log('\n== 3. offset di luar akhir berkas ==');
const lewat = await panggil(BESAR, { offset: 999999 });
cek('offset lewat akhir ditolak dengan jelas', /past the end/i.test(String(lewat)), String(lewat).slice(0, 110));

console.log('\n== 4. berkas kecil utuh, tanpa penanda ==');
const kecil = await panggil(KECIL);
const bersih = !/TRUNCATED|END OF FILE/.test(String(kecil)) && String(kecil).length > 50;
cek('berkas kecil utuh & tanpa penanda truncate', bersih, `${String(kecil).length} karakter`);

console.log('\n== 5. limit dihormati ==');
const tengah = await panggil(KECIL, { offset: 20, limit: 40 });
cek('limit dipatuhi', String(tengah).length < 200 && String(tengah).length > 0, `${String(tengah).length} karakter`);

const lulus = hasil.filter((h) => h.lulus).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
ws.close();
process.exit(lulus === hasil.length ? 0 : 1);
