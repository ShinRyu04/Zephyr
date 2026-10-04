/*
 * Penjaga treadmill browser, diuji sebagai FUNGSI MURNI.
 *
 * Yang dikunci di sini adalah bug yang dilaporkan user: "buka youtube" padahal
 * YouTube sudah terbuka -> agent tetap thinking lalu bekerja terus, dan token
 * habis tanpa batas.
 *
 * Bentuk loop yang membawanya sampai sana:
 *
 *     browser_open(youtube) -> browser_read -> browser_close -> browser_open(youtube) -> ...
 *
 * Dua penghitung harus menggagalkan itu, dan keduanya tidak berhasil:
 *   - muter browser direset oleh setiap browser_open yang punya url;
 *   - penghitung "tanpa kemajuan" direset oleh browser_close DAN browser_open,
 *     karena keduanya tercatat sebagai tool penulis (TOOL_PENULIS).
 *
 * Jadi "baru" tidak boleh berarti "url tidak kosong". Itu harus berarti "url yang
 * belum pernah dibuka pada giliran ini". Membuka tab berbeda tetap lolos;
 * membuka ulang halaman yang sama tidak.
 *
 * Harness yang sudah ada (cek-loop-agent-e2e) TIDAK bisa menangkap ini: 4 dari 5
 * tesnya hanya memeriksa tool ADA di katalog dan muncul di daftar yang tepat.
 * Beckommen memeriksa perilakunya sama sekali.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
if (!page) {
  console.log('GAGAL: tidak ada page Zephyr di CDP. Jalankan app dev lebih dulu.');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
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
await new Promise((r) => (ws.onopen = r));

const expr = `(async () => {
  try {
    const { cekMuterBrowser, BATAS_BROWSER_MUTER } = await import('/src/lib/aiStore.ts');

    /* Satu giliran sungguhan: llvm semua langkah model dalam satu giliran dan
       lihat apakah penjaganya MEMBERHENTIKAN. Kita tidak memanggil store - hanya
       fungsi murni - jadi hasilnya tidak bergantung keadaan app. */
    function mainkan(langkah, terbukaAwal, urlAwal) {
      let muter = 0;
      const urlTerbuka = [...urlAwal];
      const jejak = [];
      for (const [nama, args] of langkah) {
        if (!terbukaAwal) { jejak.push({ nama, muter, berhenti: false }); continue; }
        const h = cekMuterBrowser(true, muter, urlTerbuka, nama, args);
        muter = h.muter;
        const url = String(args?.url ?? '').trim().toLowerCase().replace(/\\/+$/, '');
        if (nama === 'browser_open' && url && !urlTerbuka.includes(url)) urlTerbuka.push(url);
        jejak.push({ nama, muter, berhenti: h.berhenti });
        if (h.berhenti) return { jejak, berhentiDi: langkah.findIndex((l) => l[0] === nama), urlTerbuka };
      }
      return { jejak, berhentiDi: -1, urlTerbuka };
    }

    const bukaYT = ['browser_open', { url: 'https://youtube.com' }];
    const YT = ['https://youtube.com'];
    const hasil = {};

    /* 1. Bug yang dilaporkan: buka lagi halaman yang sama. */
    hasil.siklusTutupBuka = mainkan(
      [bukaYT, ['browser_read', {}], ['browser_close', {}], bukaYT, ['browser_read', {}], ['browser_close', {}], bukaYT],
      true, YT,
    );

    /* 2. Kemajuan sungguhan harus tetap jalan: tab BERBEDA bukan muter. */
    hasil.tabBerbeda = mainkan(
      [['browser_open', { url: 'https://youtube.com' }], ['browser_read', {}],
       ['browser_open', { url: 'https://news.example' }], ['browser_read', {}],
       ['browser_open', { url: 'https://docs.example' }], ['browser_read', {}]],
      true, YT,
    );

    /* 3. Normalisasi: http/https, huruf besar, slash ekor - url yang sama. */
    hasil.varianUrl = mainkan(
      [bukaYT, ['browser_read', {}], ['browser_close', {}],
       ['browser_open', { url: 'HTTPS://YouTube.com/' }], ['browser_read', {}], ['browser_close', {}], bukaYT],
      true, YT,
    );

    /* 4. Sebelum ada halaman, tidak ada yang boleh dihentikan. */
    hasil.sebelumHalaman = mainkan([['browser_read', {}], ['browser_close', {}], ['browser_read', {}]], false, []);

    /* 5. Membaca halaman yang sama berulang tanpa menutup pun harus berhenti. */
    hasil.bacaBerulang = mainkan(
      [['browser_read', {}], ['browser_read', {}], ['browser_read', {}], ['browser_read', {}], ['browser_read', {}]],
      true, YT,
    );

    return JSON.stringify({ batas: BATAS_BROWSER_MUTER, ...hasil });
  } catch (e) { return JSON.stringify({ galat: String(e && e.stack || e).slice(0, 400) }); }
})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
ws.close();

const mentah = r.result?.result?.value;
let v;
try {
  v = JSON.parse(mentah ?? '{}');
} catch {
  console.log('GAGAL: jawaban bukan JSON:', mentah);
  process.exit(1);
}
if (v.galat) {
  console.log('GAGAL:', v.galat);
  process.exit(1);
}

let lulus = 0;
const total = 5;
const cek = (nama, ok, info) => {
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  ${nama}${info ? ' :: ' + info : ''}`);
  if (ok) lulus++;
};
const langkah = (h) => h.jejak.map((s) => `${s.nama}(muter=${s.muter}${s.berhenti ? ' STOP' : ''})`).join(' -> ');

console.log(`ambang muter = ${v.batas}\n`);

cek(
  'siklus tutup-buka halaman yang sama BERHENTI',
  v.siklusTutupBuka.berhentiDi >= 0,
  langkah(v.siklusTutupBuka),
);
cek(
  'membuka tab BERBEDA tetap jalan (kemajuan nyata)',
  v.tabBerbeda.berhentiDi === -1,
  langkah(v.tabBerbeda),
);
cek(
  'url yang sama dalam huruf/slash berbeda dihitung sama',
  v.varianUrl.berhentiDi >= 0,
  langkah(v.varianUrl),
);
cek(
  'sebelum ada halaman, tidak ada yang dihentikan',
  v.sebelumHalaman.berhentiDi === -1,
  langkah(v.sebelumHalaman),
);
cek(
  'membaca halaman yang sama berulang BERHENTI',
  v.bacaBerulang.berhentiDi >= 0,
  langkah(v.bacaBerulang),
);

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
