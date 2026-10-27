/*
 * Baca ulang berkas: panggilan ke-4 DITOLAK, tapi TIDAK mematikan run.
 *
 * Bug yang dijaga di sini bukan crash, melainkan dua kegagalan yang berlawanan
 * arah dan keduanya pernah terjadi di proyek ini:
 *
 *   1. run dimatikan pada baca identik ke-4. Model sudah mengumpulkan bahannya;
 *      mematikannya di situ membuang bahan yang sudah dibayar, dan pembaca
 *      melihat agennya berhenti di tengah pekerjaan yang sebenarnya bisa
 *      dilanjutkan.
 *   2. penolakan yang tidak membawa hasil aslinya. Model kehilangan isi berkas
 *      yang barusan ia baca, jadi ia membacanya LAGI - persis perilaku yang
 *      penolakan ini hendak hentikan.
 *
 * Yang diperiksa karena itu tiga hal sekaligus: hitungannya berhenti di angka
 * yang benar, keputusannya "tolak-baca" (bukan "hentikan") pada angka itu, dan
 * pesan yang dikembalikan MEMUAT hasil aslinya beserta kalimat larangannya.
 * Panggilan KELIMA tetap "hentikan": kalau model mengabaikan larangan yang
 * eksplisit, loop-nya nyata dan mengembalikan isi yang sama sekali lagi cuma
 * menambah salinan di riwayat.
 *
 * Yang TIDAK dibuktikan di sini: bahwa loop agen sungguhan mengambil cabang itu
 * pada langkahnya. Itu menuntut run model nyata; yang diuji adalah keputusan dan
 * pesannya sebagai fungsi murni, yang memang menentukan perilaku cabang itu.
 *
 * Usage: node scripts/uji-baca-berulang.mjs [port]
 */
const port = Number(process.argv[2] || 9223);
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && t.url.startsWith('http://localhost:5173'));
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
    const { catatAksiBerulang, keputusanAksiBerulang, pesanBacaDitolak } =
      await import('/src/lib/aiStore.ts');

    const BACA = { path: 'D:/Zephyr/src/lib/aiStore.ts' };
    const out = {};

    /* ── 1. Hitungan baca identik: 1..3 lanjut, 4 menolak, 5 menghentikan ── */
    const peta = new Map();
    out.jejak = [];
    for (let i = 1; i <= 5; i++) {
      const h = catatAksiBerulang(peta, 'read_file', BACA);
      out.jejak.push({
        i,
        jumlah: h.jumlah,
        ingatkan: h.ingatkan,
        hentikan: h.hentikan,
        putusan: keputusanAksiBerulang('read_file', h),
      });
    }

    /* ── 2. Penulis tetap berhenti lebih awal (batas lamanya tidak bergeser) ── */
    const petaTulis = new Map();
    out.tulis = [];
    for (let i = 1; i <= 4; i++) {
      const h = catatAksiBerulang(petaTulis, 'write_file', { path: 'a.ts' });
      out.tulis.push({ i, putusan: keputusanAksiBerulang('write_file', h) });
    }

    /* ── 3. Baca BERBEDA bukan loop: tiap berkas dihitung sendiri ── */
    const petaBeda = new Map();
    out.beda = [1, 2, 3, 4, 5].map((n) =>
      keputusanAksiBerulang(
        'read_file',
        catatAksiBerulang(petaBeda, 'read_file', { path: 'berkas-' + n + '.ts' }),
      ),
    );

    /* ── 4. Ejaan path berbeda = berkas yang sama (kunci path) ── */
    const petaEjaan = new Map();
    const ejaan = ['D:\\\\Zephyr\\\\a.ts', 'd:/zephyr/a.ts', 'D:/Zephyr/A.TS', 'd:/ZEPHYR/a.ts'];
    out.ejaan = ejaan.map((p) =>
      keputusanAksiBerulang('read_file', catatAksiBerulang(petaEjaan, 'read_file', { path: p })),
    );

    /* Batas yang diketahui: slash EKOR dihitung sebagai path lain. Dicatat di
       sini supaya perubahan perilakunya terlihat, bukan diandaikan tidak ada. */
    const petaEkor = new Map();
    out.ekor = ['D:/Zephyr/a.ts', 'D:/Zephyr/a.ts/'].map((p) =>
      catatAksiBerulang(petaEkor, 'read_file', { path: p }).jumlah,
    );

    /* ── 5. Pesan penolakan MEMBAWA hasil aslinya ── */
    const isiAsli = 'export const BATAS_BACA_SAMA = 4;';
    const pesan = pesanBacaDitolak(4, isiAsli);
    out.pesan = {
      memuatIsi: pesan.includes(isiAsli),
      memuatLarangan: /do not call this again/i.test(pesan),
      memuatJumlah: pesan.includes('4 times'),
      isiDiDepan: pesan.indexOf(isiAsli) === 0,
      tanpaUndefined: !/undefined|null/.test(pesan),
    };

    /* ── 6. Tanpa hasil asli, pesannya tetap utuh (bukan string kosong) ── */
    const pesanKosong = pesanBacaDitolak(4, '');
    out.pesanKosong = {
      ada: pesanKosong.length > 0,
      memuatLarangan: /do not call this again/i.test(pesanKosong),
      tanpaBarisKosongDiDepan: !pesanKosong.startsWith('\\n'),
      tanpaSpasiNyasar: pesanKosong.trim() === pesanKosong,
    };

    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ galat: String((e && e.stack) || e).slice(0, 500) });
  }
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
let total = 0;
const cek = (nama, ok, info) => {
  total += 1;
  if (ok) lulus += 1;
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${nama}  ${info}`);
};

const j = (i) => v.jejak[i - 1];
const p = (i) => v.jejak[i - 1]?.putusan;

cek('B1', [1, 2, 3, 4, 5].every((i) => j(i)?.jumlah === i), `hitungan naik 1..5 (${v.jejak.map((x) => x.jumlah).join(',')})`);
cek('B2', p(1) === 'jalan' && p(2) === 'jalan' && p(3) === 'jalan', `baca 1-3 tetap dijalankan (jalan, jalan, jalan)`);
/*
 * Pengingatnya harus DATANG TERUS, bukan sekali.
 *
 * Syaratnya `jumlah > BATAS_AKSI_INGAT`, jadi pengingat pertama menempel pada
 * panggilan identik yang KETIGA. Yang diuji di sini bukan angkanya melainkan
 * sifatnya: panggilan pertama belum berulang, jadi belum ada yang perlu
 * diingatkan - dan sesudah itu pengingatnya tidak boleh hanya sekali, karena
 * kegagalan yang pernah terjadi (sebelas panggilan identik, diingatkan sekali di
 * awal) tidak akan tertangkap oleh pemeriksaan "ada pengingat" saja.
 */
cek(
  'B3',
  j(1)?.ingatkan === false && [3, 4, 5].every((i) => j(i)?.ingatkan === true),
  `pengingat datang berulang mulai panggilan ke-3 (${v.jejak.map((x) => x.ingatkan).join(',')})`,
);
cek('B4', j(4)?.hentikan === true && p(4) === 'tolak-baca', `baca KEEMPAT ditolak, bukan mematikan run (putusan=${p(4)})`);
cek('B5', j(5)?.hentikan === true && p(5) === 'hentikan', `baca KELIMA tetap mengakhiri run (putusan=${p(5)})`);
cek(
  'B6',
  v.tulis[0].putusan === 'jalan' && v.tulis[1].putusan === 'jalan' && v.tulis[2].putusan === 'hentikan',
  `penulis berulang tetap berhenti di ke-3 (${v.tulis.map((x) => x.putusan).join(',')})`,
);
cek('B7', v.beda.every((x) => x === 'jalan'), `lima berkas BERBEDA semuanya jalan (${v.beda.join(',')})`);
cek(
  'B8',
  v.ejaan[0] === 'jalan' && v.ejaan[1] === 'jalan' && v.ejaan[2] === 'jalan' && v.ejaan[3] === 'tolak-baca',
  `ejaan path berbeda (garis miring, huruf besar) dihitung satu berkas (${v.ejaan.join(',')})`,
);
cek('B8b', v.ekor[0] === 1 && v.ekor[1] === 1, `slash EKOR dihitung sebagai path lain - batas yang diketahui (${v.ekor.join(',')})`);
cek(
  'B9',
  v.pesan.memuatIsi && v.pesan.isiDiDepan && v.pesan.memuatLarangan && v.pesan.memuatJumlah && v.pesan.tanpaUndefined,
  `pesan penolakan membawa hasil aslinya + larangan ${JSON.stringify(v.pesan)}`,
);
cek(
  'B10',
  v.pesanKosong.ada && v.pesanKosong.memuatLarangan && v.pesanKosong.tanpaBarisKosongDiDepan && v.pesanKosong.tanpaSpasiNyasar,
  `tanpa hasil asli, pesannya tetap utuh ${JSON.stringify(v.pesanKosong)}`,
);

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
