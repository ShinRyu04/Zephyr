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

/* Tunggu sampai app SENDIRI menyatakan gagal. Batasnya diambil jauh di atas
   320 detik deadline Rust, supaya yang diukur memang perilaku app, bukan
   kesabaran harness. */
let akhir = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 10000));
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
  if (s?.phase === 'idle' && !s?.busy && s?.detik > 30) break;
  if (i % 3 === 0) console.log(`  ... ${s?.detik}s phase=${s?.phase} resume=${s?.resume}`);
}

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
