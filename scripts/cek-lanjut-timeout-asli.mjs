/*
 * Tombol Lanjut pada timeout SUNGGUHAN.
 *
 * verify-lanjut2 (4/4) sudah menguji LOGIKA tombol itu - tetapi dengan
 * checkpoint buatan, bukan timeout yang benar-benar terjadi. Jadi yang belum
 * pernah dibuktikan: apakah app benar-benar SAMPAI ke keadaan itu dengan
 * sendirinya ketika provider menggantung.
 *
 * Itu dulu tidak mungkin diuji: Rust bisa diam 1300 detik, jadi menunggu
 * timeout asli berarti menunggu lebih dari 20 menit. Setelah
 * RETRY_LOOP_DEADLINE_SECS = 300 dipasang, Rust selalu melapor <= 320 detik -
 * jadi sekarang jalur ini bisa ditunggu, dan itu yang dilakukan di sini.
 *
 * Mock-ai port 8098 mode 'TIMEOUT' menerima request dan tidak pernah menjawab,
 * persis 502 yang menggantung.
 *
 * Jalankan mock lebih dulu:
 *   node scripts/mock-ai.mjs 8098
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MOCK = 'http://127.0.0.1:8098';
const CDP = 'http://127.0.0.1:9223';

/*
 * Cadangkan secrets.json SEBELUM apa pun.
 *
 * Kunci mock dipasang lewat setKey, dan jalur itu menulis ulang seluruh berkas
 * di Rust. Berkas ini berisi API key milik user. Harness fase 09 pernah
 * menghapus key user karena mengosongkan lewat jalur yang sama; di sini berkas
 * dicadangkan dan dikembalikan apa adanya, termasuk kalau harness gagal di
 * tengah jalan atau prosesnya dihentikan.
 */
const SECRETS = path.join(
  process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
  'zephyr',
  'secrets.json',
);
const CADANGAN = path.join(os.tmpdir(), `secrets-timeout-${process.pid}.json`);
const adaSecrets = fs.existsSync(SECRETS);
if (adaSecrets) fs.copyFileSync(SECRETS, CADANGAN);

function pulihkanSecrets() {
  try {
    if (adaSecrets) {
      fs.copyFileSync(CADANGAN, SECRETS);
      fs.rmSync(CADANGAN, { force: true });
    } else if (fs.existsSync(SECRETS)) {
      /* Tidak ada berkas sebelumnya: yang benar adalah tidak ada berkas lagi,
         bukan menyisakan key mock yang ditulis harness ini. */
      fs.rmSync(SECRETS, { force: true });
    }
  } catch (e) {
    console.log('peringatan: gagal memulihkan secrets.json -', String(e).slice(0, 120));
  }
}
process.on('exit', pulihkanSecrets);
process.on('SIGINT', () => {
  pulihkanSecrets();
  process.exit(130);
});

const ver = await (await fetch(`${MOCK}/__version`)).json().catch(() => null);
if (!ver || ver.version !== 6) {
  console.log(`GAGAL: mock versi salah (${JSON.stringify(ver)}). Butuh versi 6 (mode TIMEOUT).`);
  process.exit(1);
}

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
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

const ev = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
  const v = r.result?.result?.value;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
};

/* Arahkan provider ke mock TIMEOUT. Disimpan supaya bisa dipulihkan. */
const asli = await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store.getState();
  const s = window.__ZEPHYR__.getState().settings;
  return JSON.stringify({
    model: st.model, provider: st.provider,
    providers: s.models?.providers ?? {},
    activeProvider: s.models?.activeProvider,
  });
})()`);
console.log('sebelum:', JSON.stringify({ model: asli.model, provider: asli.provider, active: asli.activeProvider }));

/*
 * Urutannya penting dan ini pernah salah:
 *
 * setProvider(id) memanggil sinkronProvider, dan fungsi itu mengembalikan
 * lebih awal kalau PROVIDER_BY_ID[id] belum ada. Jadi menulis settings SESUDAH
 * setProvider berarti provider belum terbaca saat dipakai, hasKey() false, dan
 * send() berhenti dengan toast tanpa pernah mengirim satu permintaan pun -
 * gejalanya cuma "phase idle, err null, tidak ada apa-apa", yang terlihat
 * seperti app yang rusak padahal harness-nya salah urutan.
 *
 * Jadi: tulis settings DULU, tunggu, baru setProvider.
 */
await ev(`(() => {
  const s = window.__ZEPHYR__.getState().settings;
  window.__ZEPHYR_SET__.set({ models: { ...s.models, activeProvider: 'custom',
    providers: { ...(s.models?.providers ?? {}), custom: { baseUrl: '${MOCK}/v1', model: 'custom-model' } } } });
  return true;
})()`);
await new Promise((r) => setTimeout(r, 900));
await ev(`(() => { window.__ZEPHYR_AI__.store.getState().setProvider('custom'); return true; })()`);
await new Promise((r) => setTimeout(r, 900));

/* Kalau provider belum benar-benar aktif, hentikan SEKARANG dengan pesan yang
   jujur - bukan menunggu 10 menit lalu melaporkan "app tidak melapor". */
const siap = await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({ provider: st.provider, model: st.model, hasKey: st.hasKey?.() });
})()`);
console.log('sesudah set provider:', JSON.stringify(siap));

/*
 * Kunci HARUS dipasang lewat setKey, bukan dengan menyuntik store.
 *
 * Ini pernah salah dan menyesatkan: menyuntik `keys` langsung lewat setState
 * terlihat berhasil (hasKey true), tetapi sendAgent memanggil loadKeys() yang
 * MEMBACA ULANG daftar dari Rust - jadi suntikan itu ditimpa, hasKey kembali
 * false, dan sendAgent keluar diam-diam. Gejalanya persis seperti app yang
 * rusak: send() mengembalikan true, tapi agentBusy tidak pernah naik dan tidak
 * ada error apa pun. Padahal app-nya benar; harnessnya yang salah jalur.
 *
 * setKey adalah jalur yang dipakai user dan dipakai verify09: ia menulis ke
 * secrets.json lewat Rust, sehingga loadKeys mengembalikannya.
 *
 * Berkas secrets.json DICADANGKAN dan dikembalikan apa adanya di akhir - jalur
 * ini menulis ulang seluruh berkas, dan ia pernah menghapus key milik user.
 */
await ev(`(async () => {
  await window.__ZEPHYR_SET__.setKey('custom', 'MOCK-KEY-TIMEOUT');
  return true;
})()`, true);
await new Promise((r) => setTimeout(r, 600));
/* loadKeys HARUS dipanggil sebelum memeriksa: itu yang membuktikan kuncinya
   bertahan, bukan cuma ada sesaat. */
const siap2 = await ev(`(async () => {
  await window.__ZEPHYR_AI__.store.getState().loadKeys();
  const st = window.__ZEPHYR_AI__.store.getState();
  return JSON.stringify({ provider: st.provider, hasKey: st.hasKey?.(),
    kunci: (st.keys ?? []).filter((k) => k.hasKey).map((k) => k.provider) });
})()`, true);
console.log('kunci mock  :', JSON.stringify(siap2));
if (siap2?.provider !== 'custom' || siap2?.hasKey !== true) {
  console.log('GAGAL: provider/kunci tidak siap - hasil di bawah tidak akan berarti.');
  ws.close();
  process.exit(1);
}

/*
 * Mulai sesi BARU, bukan mengirim ke sesi yang sudah penuh sampah.
 *
 * Ini cacat terakhir dan yang paling merusak, terbukti langsung dari log mock:
 * setiap kiriman menambahkan pasangan `user: TIMEOUT tolong jawab` +
 * `assistant: (no answer)` ke riwayat PERMANEN sesi itu. Run ke-N karena itu
 * mengirim riwayat berisi N-1 pasangan kosong, dan angka "jawaban kosong"
 * berikutnya bukan hasil run itu - ia sisa dari semua run sebelumnya.
 *
 * Itu sebabnya hasilnya selalu tampak seperti app yang gagal: 40 detik, nol
 * error, teks kosong. Padahal yang terjadi hanyalah sesi yang sudah tercampur
 * percobaan-percobaan lama, masing-masing menyumbang satu jawaban kosong.
 *
 * `newSession` (kalau ada) memulai percakapan bersih; kalau tidak ada, sesi
 * terakhir dikosongkan pesannya langsung, karena keduanya berarti hal yang
 * sama bagi uji ini: run ini harus mulai dari nol.
 */
const sesi = await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store;
  const g = st.getState();
  /*
   * newChat memulai percakapan baru, tetapi agentSteps ada di tingkat STORE,
   * bukan per sesi - jadi ia tetap membawa langkah run sebelumnya. Keduanya
   * harus dibersihkan, kalau tidak uji ini kembali membaca sisa run lama dan
   * melaporkannya sebagai hasil run ini.
   */
  const sebelum = { pesan: (g.sessions?.[g.sessions.length - 1]?.messages ?? []).length,
    langkah: (g.agentSteps ?? []).length };
  const id = typeof g.newChat === 'function' ? g.newChat() : null;
  st.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });
  return JSON.stringify({ cara: id ? 'newChat + kosongkan langkah' : 'kosongkan keduanya', id, sebelum });
})()`);
await new Promise((r) => setTimeout(r, 500));
console.log('sesi baru    :', JSON.stringify(sesi));

/* Pastikan benar-benar bersih - kalau tidak, kekacauan lama akan ikut terbaca
   lagi dan uji ini kembali melaporkan hal yang salah. */
const bersihCek = await ev(`(() => {
  const s = window.__ZEPHYR_AI__.store.getState();
  const ses = s.sessions?.[s.sessions.length - 1];
  return JSON.stringify({ pesan: (ses?.messages ?? []).length,
    langkah: (s.agentSteps ?? []).length, adaLanjut: Boolean(s.agentResume) });
})()`);
console.log('verifikasi   :', JSON.stringify(bersihCek));
if (bersihCek?.pesan > 0 || bersihCek?.langkah > 0) {
  console.log('GAGAL: sesi tidak bersih - hasil di bawah akan mencampur run lama.');
  ws.close();
  process.exit(1);
}

/*
 * Nol-kan sisa run lama SEBELUM kirim.
 *
 * Ini cacat yang membuat uji ini melaporkan hasil palsu berkali-kali: harness
 * menunggu, lalu membaca agentSteps dan `(no answer)` yang TERTINGGAL dari run
 * sebelumnya - bukan dari run ini. Buktinya: langkah yang terbaca bernama
 * todo_write, sedangkan teks yang dikirim sama sekali tidak menyentuh tool itu.
 *
 * Jadi yang dinol-kan: langkah agent dan pesan sesi aktif. Tanpa ini, uji ini
 * tidak bisa membedakan "run ini gagal tanpa alasan" dari "run ini belum
 * menulis apa-apa, dan yang terbaca adalah sisa run kemarin".
 */
await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store;
  st.setState({ agentSteps: [], agentFailure: null, agentStopReason: null });
  return true;
})()`);
await new Promise((r) => setTimeout(r, 300));

const mulai = Date.now();
const kirim = await ev(`(() => {
  const st = window.__ZEPHYR_AI__.store.getState();
  if (st.agentPhase !== 'idle') return JSON.stringify({ ok: false, sebab: st.agentPhase });
  void st.send('TIMEOUT tolong jawab', []);
  return JSON.stringify({ ok: true });
})()`);
console.log('kirim:', JSON.stringify(kirim));
if (!kirim?.ok) {
  ws.close();
  process.exit(1);
}

/*
 * Tunggu dengan mengikuti agentBusy, bukan dengan tenggat waktu.
 *
 * Sebelumnya loop ini menunggu sampai 10 menit lalu membaca hasil apa pun yang
 * ada. Itu salah dua kali: ia melaporkan "detik 40" yang sebenarnya hanyalah
 * kesabarannya sendiri, dan ia membaca sisa run lama sebagai hasil run ini.
 *
 * Yang benar: tunggu sampai run benar-benar DIMULAI (busy naik), baru tunggu
 * sampai selesai. Kalau belum mulai dalam 20 detik, hentikan dengan pesan jujur
 * - bukan menunggu 10 menit untuk melaporkan sesuatu yang tidak terjadi.
 */
let akhir = null;
let pernahMulai = false;
/*
 * Polling 150ms, bukan 2 detik.
 *
 * Terbukti dari app hidup: agentBusy hanya menyala ~330ms untuk provider yang
 * langsung gagal. Dengan polling 2 detik, seluruh run itu terlewat - harness
 * menyimpulkan "tidak pernah mulai" padahal ia baru saja selesai. Itu jenis
 * kesalahan yang sama dengan sebelumnya, hanya terbalik: bukan membaca sisa run
 * lama, tapi melewatkan run yang terlalu cepat.
 *
 * 150ms menangkap run sependek ~150ms, dan untuk timeout asli (300 detik) biaya
 * polling-nya tidak berarti.
 */
for (let i = 0; i < 2600; i++) {
  await new Promise((r) => setTimeout(r, 150));
  const s = await ev(`(() => {
    const st = window.__ZEPHYR_AI__.store.getState();
    const ses = st.sessions[st.sessions.length - 1];
    const m = [...(ses?.messages ?? [])].reverse().find((x) => x.role === 'assistant');
    /*
     * Nama field yang benar diambil dari store, bukan ditebak:
     *
     *   agentResume  - checkpoint di tingkat store, sumber kebenaran "bisa
     *                  dilanjut". Versi pertama harness ini menebak
     *                  m.canResume, yang tidak ada di mana pun, sehingga
     *                  tombol Lanjut selalu terbaca 0 padahal ada.
     *   m.error      - hanya terisi kalau jalur teks TIDAK memuat alasan
     *                  (lihat aiStore: finalError hanya dijadikan field
     *                  terstruktur saat tampil kosong). Jadi "m.error null"
     *                  BUKAN berarti tidak ada error - teksnya ada di content.
     */
    return JSON.stringify({
      phase: st.agentPhase, busy: st.agentBusy,
      err: m?.error ?? null, resume: st.agentResume ? 'ada' : null,
      isi: String(m?.content ?? ''), toast: st.toast ?? null,
      detik: Math.round((Date.now() - ${mulai}) / 1000),
    });
  })()`);
  akhir = s;
  if (s?.busy) pernahMulai = true;
  if (!pernahMulai && s?.detik > 20) {
    console.log('GAGAL: run tidak pernah mulai dalam 20 detik - hasil di bawah tidak berarti.');
    break;
  }
  /* Selesai hanya berarti: sudah pernah mulai, dan kini tidak sibuk lagi. */
  if (pernahMulai && !s?.busy && s?.phase === 'idle') break;
  if (i % 100 === 0) console.log(`  ... ${s?.detik}s busy=${s?.busy} phase=${s?.phase} resume=${s?.resume}`);
}
if (!pernahMulai) {
  console.log('\nKesimpulan: TIDAK ADA yang bisa dinilai - run tidak pernah jalan.');
  await ev(`(() => { const s = window.__ZEPHYR__.getState().settings; window.__ZEPHYR_SET__.set({ models: { ...s.models, activeProvider: ${JSON.stringify(asli.activeProvider)} } }); return true; })()`);
  ws.close();
  process.exit(1);
}
console.log(`run selesai setelah ${akhir?.detik}s (pernah mulai: ${pernahMulai})`);

/* Cari tombol Lanjut seperti yang dilihat user. */
const tombol = await ev(`(() => {
  const b = [...document.querySelectorAll('button')].filter((x) =>
    /lanjut|resume|continue/i.test((x.innerText || '') + ' ' + (x.getAttribute('aria-label') || '')));
  return JSON.stringify({ jumlah: b.length, label: b.map((x) => (x.innerText || x.getAttribute('aria-label') || '').trim().slice(0, 30)) });
})()`);

/* Pulihkan provider. */
await ev(`(() => {
  const s = window.__ZEPHYR__.getState().settings;
  window.__ZEPHYR_SET__.set({ models: { ...s.models, activeProvider: ${JSON.stringify(asli.activeProvider)},
    providers: ${JSON.stringify(asli.providers)} } });
  window.__ZEPHYR_AI__.store.getState().setProvider(${JSON.stringify(asli.provider)});
  return true;
})()`);
ws.close();

let lulus = 0;
const total = 5;
const cek = (n, ok, info) => {
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  ${n}${info ? ' :: ' + info : ''}`);
  if (ok) lulus++;
};

const isi = String(akhir?.isi ?? '');
/* Alasan yang dilihat pembaca bisa ada di dua tempat, dan keduanya sah:
   ditempelkan ke teks balasan, atau disimpan di m.error saat tidak ada teks.
   Yang TIDAK sah adalah keduanya sekaligus - itu paragraf yang sama tercetak
   dua kali, dan itu yang terjadi sebelum diperbaiki. */
const adaDiTeks = /Agent stopped/i.test(isi);
const adaDiField = Boolean(akhir?.err);

console.log(`\nakhir: phase=${akhir?.phase} busy=${akhir?.busy} detik=${akhir?.detik}`);
console.log(`resume  : ${akhir?.resume ?? 'tidak ada'}`);
console.log(`error   : ${adaDiField ? String(akhir.err).slice(0, 90) : '(tidak ada di field)'}`);
console.log(`teks    : ${adaDiTeks ? '(alasan ada di teks balasan)' : '(tidak ada di teks)'}`);
console.log(`tombol Lanjut: ${tombol?.jumlah ?? 0} ${JSON.stringify(tombol?.label ?? [])}`);
console.log(`\nteks balasan:\n${isi.slice(0, 400)}\n`);

cek('run berhenti sendiri (tidak menggantung selamanya)', akhir?.phase === 'idle' && akhir?.busy !== true, `phase=${akhir?.phase}`);
cek('berhenti dalam batas yang dijanjikan (<= 420s)', (akhir?.detik ?? 1e9) <= 420, `${akhir?.detik}s`);
cek('alasan kegagalan benar-benar sampai ke pembaca', adaDiTeks || adaDiField, adaDiTeks ? 'lewat teks' : adaDiField ? 'lewat field' : 'TIDAK ADA');
cek('alasan TIDAK tercetak dua kali', !(adaDiTeks && adaDiField), adaDiTeks && adaDiField ? 'dobel' : 'sekali saja');
cek('checkpoint Lanjut tersimpan untuk user', Boolean(akhir?.resume), String(akhir?.resume ?? 'tidak ada'));

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
