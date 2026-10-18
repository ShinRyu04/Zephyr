/*
 * FASE 5 — uji beban NYATA: Zeph AI mengerjakan tugas besar sendiri.
 *
 * Tugas: aplikasi Electron "panel AI streaming" di D:\ZephyrDesktop, setara
 * kelas Qoder Desktop / opencode Desktop (bukan tiruan, tapi aplikasi desktop
 * yang benar-benar jalan).
 *
 * Yang DIUKUR, bukan diasumsikan:
 *   - giliran terpakai (dari MAX_AGENT_STEPS=200)
 *   - tool tersering dan jumlahnya
 *   - token masuk/keluar
 *   - waktu total
 *   - titik gagal persisnya (langkah ke berapa, tool apa, galat apa)
 *   - hasil nyata di disk: berkas ada, sintaks valid, package.json benar
 *
 * Pakai: node scripts/uji-fase5-electron.mjs [port] [menit]
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PORT = process.argv[2] ?? '9223';
const MENIT = Number(process.argv[3] ?? 20);
const WS = 'D:\\ZephyrDesktop';

const { cdp } = await Cdp.attach(PORT, 'Zephyr');

/*
 * PROMPT LENGKAP.
 *
 * Ditulis sebagai spesifikasi, bukan permintaan: model perlu tahu apa yang
 * dianggap "selesai", berkas apa saja, dan batasan teknis yang membuat
 * aplikasinya benar-benar bisa dijalankan. Prompt pendek menghasilkan scaffold
 * setengah jadi, dan itu bukan kegagalan model - itu kegagalan instruksi.
 */
const PROMPT = `Buat aplikasi desktop Electron yang BENAR-BENAR BERJALAN di folder ini.
Aplikasi: "Zephyr Chat" - klien chat AI dengan panel streaming.

## Berkas yang WAJIB ada (8 berkas)

1. package.json
   - name: "zephyr-chat", version "1.0.0", main: "main.js"
   - scripts: { "start": "electron ." }
   - devDependencies: { "electron": "^33.0.0" }

2. main.js  (proses utama Electron)
   - BrowserWindow dengan width 1100, height 720
   - webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') }
   - ipcMain.handle('chat:stream') yang mengirim chunk bertahap lewat webContents.send('chat:chunk', ...)
   - ipcMain.handle('chat:stop') untuk membatalkan stream
   - menu aplikasi minimal (File > Quit)

3. preload.js
   - contextBridge.exposeInMainWorld('zephyr', { kirimPesan, onChunk, stop })
   - TIDAK boleh membocorkan ipcRenderer mentah

4. index.html
   - struktur: header, daftar pesan (#pesan), composer (#input + #kirim)
   - <link rel="stylesheet" href="styles.css"> dan <script src="renderer.js" defer>

5. styles.css
   - tema gelap, layout flex kolom penuh tinggi
   - gelembung pesan user vs asisten berbeda warna
   - indikator "mengetik" saat streaming

6. renderer.js
   - kirim pesan lewat window.zephyr.kirimPesan
   - terima chunk lewat window.zephyr.onChunk, tambahkan ke gelembung asisten
   - tombol Stop membatalkan
   - simpan riwayat ke localStorage

7. store.js
   - modul penyimpanan riwayat (baca/tulis JSON di userData lewat IPC)
   - dipakai main.js

8. README.md
   - cara menjalankan: npm install lalu npm start
   - apa yang dilakukan tiap berkas

## Aturan teknis (WAJIB)

- Setiap require() harus menunjuk berkas yang BENAR-BENAR ada di folder ini.
- Setiap path script/link di index.html harus benar.
- contextIsolation true, nodeIntegration false. Jangan matikan keduanya.
- TIDAK BOLEH ada TODO, FIXME, atau placeholder "isi di sini".
- TIDAK BOLEH ada kode yang melempar saat start.
- Semua berkas JS harus lolos \`node --check\`.

## Cara kerja

1. Tulis kedelapan berkas itu.
2. Jalankan \`node --check\` pada setiap berkas JS.
3. Perbaiki apa pun yang gagal.
4. Laporkan berkas apa saja yang dibuat dan hasil pemeriksaannya.

Jangan bertanya balik. Kerjakan sampai selesai.`;

console.log('=== Fase 5 — tugas Electron oleh Zeph AI ===');
console.log('workspace:', WS);
console.log('model    : deepseek');
console.log('batas    : ' + MENIT + ' menit\n');

/* Pastikan workspace benar dan bersihkan sisa run sebelumnya. */
const awal = await cdp.json(
  `return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const S = window.__ZEPHYR__.getState();
  return { model: A.model, provider: A.provider, busy: A.agentBusy, ws: S.workspace, adaKey: A.hasKey ? A.hasKey() : null };
})())`,
  60000,
);
/*
 * `cdp.json()` ALREADY parses the result.
 *
 * Wrapping the expression in `JSON.stringify(...)` and then calling
 * `JSON.parse(awal)` parsed it twice - the second parse got an object and threw
 * "[object Object] is not valid JSON". The expression returns an object and
 * `cdp.json` serialises it; that is the whole contract.
 */
const info = typeof awal === 'string' ? JSON.parse(awal) : awal;
console.log('model:', info.model, '| provider:', info.provider, '| key:', info.adaKey, '| ws:', info.ws);

if (info.busy) {
  console.error('GAGAL: agen sedang sibuk. Tunggu sampai selesai lalu ulangi.');
  keluarBersih(1);
}
if (!info.adaKey) {
  console.error('GAGAL: tidak ada API key untuk provider ini.');
  keluarBersih(1);
}

const mulai = Date.now();

/* Jalankan tugas lewat jalur yang sama dengan tombol Send.
 *
 * `kirim()` mengembalikan hasil, dan `cdp.json` mencoba mem-parse-nya sebagai
 * JSON - kalau hasilnya objek, parse itu gagal dengan "[object Object]". Jadi
 * yang dikembalikan di sini adalah string JSON eksplisit.
 */
/*
 * Jalankan tugas TANPA menunggunya selesai.
 *
 * Versi lama melakukan `await A.store.getState().send(PROMPT)` di dalam
 * panggilan CDP. Itu berarti harness DUDUK MENUNGGU sampai agen selesai, dan
 * loop pemantauan di bawah baru mulai berjalan setelah semuanya berakhir -
 * mustahil melihat progres, dan setiap angka yang dilaporkan adalah angka
 * SETELAH reset (0 giliran, 2 langkah) meski tugasnya benar-benar berjalan.
 *
 * Sekarang `send()` dilepas: promise-nya disimpan di `window` supaya galatnya
 * tidak hilang sebagai unhandled rejection, lalu loop pemantauan yang
 * mengamati jalannya pekerjaan.
 */
const jalan = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__;
  try {
    /* Metode store bernama send, bukan kirim. */
    window.__FASE5_SEND__ = A.store.getState().send(${JSON.stringify(PROMPT)});
    window.__FASE5_SEND__.then(
      (ok) => { window.__FASE5_SEND_HASIL__ = { ok: true, nilai: ok }; },
      (e) => { window.__FASE5_SEND_HASIL__ = { ok: false, galat: String(e) }; },
    );
    return { ok: true, dilepas: true };
  } catch (e) {
    return { ok: false, galat: String(e) };
  }
})())`,
  60000,
);
const hasilJalan = typeof jalan === 'string' ? JSON.parse(jalan) : jalan;
if (!hasilJalan.ok) {
  console.error('GAGAL menjalankan tugas:', hasilJalan.galat);
}

/*
 * PANTAU sampai selesai.
 *
 * Yang dibaca tiap 5 detik: fase, langkah ke berapa, tool yang sedang jalan,
 * jumlah pesan, dan galat. Tanpa ini, "AI berhenti di jalan" hanya terlihat
 * sebagai diam - dan penyebabnya tidak pernah ketahuan.
 */
const jejak = [];
let selesai = false;
let terakhirSibuk = false;
let pernahSibuk = false;
let jumlahIzin = 0;
let diamSejak = Date.now();
const batas = Date.now() + MENIT * 60000;

while (Date.now() < batas) {
  await new Promise((r) => setTimeout(r, 5000));

  const snap = await cdp
    .json(
      `return JSON.stringify((() => {
    const A = window.__ZEPHYR_AI__.store.getState();
    /*
     * "messages" lives on the ACTIVE SESSION, not on the store root.
     *
     * The first version of this monitor read A.messages.length. That field
     * does not exist, so every single poll threw a TypeError, the CDP call
     * rejected, the .catch(() => null) swallowed it, and "continue" skipped
     * the sample. The loop therefore sat for 22 minutes with an empty trail
     * and reported "0 giliran" - which looked like the agent hanging when in
     * fact the WATCHER was broken. A monitor that cannot read its subject must
     * say so, not stay silent.
     */
    const sesi = (A.sessions ?? []).find((x) => x.id === A.activeSessionId) ?? (A.sessions ?? [])[0] ?? null;
    return {
      busy: A.agentBusy,
      fase: A.agentPhase,
      langkah: A.agentStepIndex,
      batasLangkah: A.agentStepLimit,
      tool: A.agentCurrentTool,
      pesan: (sesi?.messages ?? []).length,
      galat: A.agentError ?? null,
      toast: A.toast ?? null,
      langkahTools: (A.agentSteps ?? []).length,
      terakhirProgress: A.agentLastProgressAt,
      adaSesi: !!sesi,
      adaKonfirmasi: !!A.agentConfirm,
    };
  })())`,
      60000,
    )
    .then((x) => (typeof x === 'string' ? JSON.parse(x) : x))
    .catch((e) => {
      /*
       * A failed poll is REPORTED, not swallowed. Silence here is what made a
       * broken watcher look exactly like a hung agent for 22 minutes.
       */
      console.log(`  [pantau] gagal membaca status: ${String(e).slice(0, 160)}`);
      return null;
    });

  if (!snap) continue;

  jejak.push({ t: Math.round((Date.now() - mulai) / 1000), ...snap });

  /*
   * Jawab permintaan izin secara otomatis.
   *
   * Tugas Fase 5 menulis 8 berkas, jadi agen berhenti di `waiting-confirmation`
   * berkali-kali. Tanpa penjawab, run ini selalu berakhir sebagai "diam" -
   * bukan karena agennya rusak, tapi karena tidak ada manusia di depan layar.
   *
   * `agentPutuskan` adalah jalur yang sama dengan tombol Allow, dipanggil lewat
   * store, jadi yang diuji tetap kode produksi.
   */
  if (snap.fase === 'waiting-confirmation' || snap.adaKonfirmasi) {
    const jawab = await cdp
      .json(
        `return JSON.stringify((() => {
      const A = window.__ZEPHYR_AI__.store.getState();
      if (!A.agentConfirm) return { dijawab: false };
      const tool = A.agentConfirm.tool;
      A.agentPutuskan(true);
      return { dijawab: true, tool };
    })())`,
        30000,
      )
      .then((x) => (typeof x === 'string' ? JSON.parse(x) : x))
      .catch(() => ({ dijawab: false }));
    if (jawab.dijawab) {
      jumlahIzin++;
      console.log(`  [izin] diizinkan: ${jawab.tool}`);
    }
  }

  /*
   * Tunggu agen MULAI dulu sebelum menunggu ia selesai.
   *
   * `send()` dilepas di atas, jadi beberapa ratus milidetik pertama
   * `agentBusy` masih false. Tanpa penjaga ini loop berhenti di sampel pertama
   * dan melaporkan "selesai" untuk tugas yang baru saja dimulai - persis
   * kegagalan mode yang sedang diperbaiki.
   */
  if (!pernahSibuk) {
    if (snap.busy) {
      pernahSibuk = true;
      terakhirSibuk = true;
      diamSejak = Date.now();
      console.log(
        `\n[${Math.round((Date.now() - mulai) / 1000)}s] MULAI busy=true fase=${snap.fase} langkah=${snap.langkah}`,
      );
    } else if (Date.now() - mulai > 30000) {
      console.log(`\n[${Math.round((Date.now() - mulai) / 1000)}s] agen TIDAK PERNAH mulai sibuk`);
      break;
    }
    continue;
  }

  if (snap.busy !== terakhirSibuk) {
    terakhirSibuk = snap.busy;
    diamSejak = Date.now();
    console.log(`\n[${Math.round((Date.now() - mulai) / 1000)}s] busy=${snap.busy} fase=${snap.fase} langkah=${snap.langkah} tool=${snap.tool ?? '-'}`);
  } else if (snap.busy && Date.now() - diamSejak > 90000) {
    console.log(`  ... diam ${Math.round((Date.now() - diamSejak) / 1000)}s (langkah ${snap.langkah}, tool ${snap.tool ?? '-'})`);
    diamSejak = Date.now();
  }

  if (!snap.busy) {
    selesai = true;
    break;
  }
}

const totalDetik = Math.round((Date.now() - mulai) / 1000);

/* Kumpulkan angka akhir. */
const akhirRaw = await cdp.json(
  `return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sesi = (A.sessions ?? []).find((x) => x.id === A.activeSessionId) ?? (A.sessions ?? [])[0] ?? null;
  const tools = {};
  for (const s of (A.agentSteps ?? [])) {
    for (const t of (s.tools ?? [])) tools[t.name] = (tools[t.name] ?? 0) + 1;
  }
  const pesanAsisten = (sesi?.messages ?? []).filter((m) => m.role === 'assistant');
  const terakhir = pesanAsisten[pesanAsisten.length - 1];
  return {
    langkah: A.agentStepIndex,
    langkahTotal: (A.agentSteps ?? []).length,
    tools,
    usage: A.usage ?? null,
    galat: A.agentError ?? null,
    isiAkhir: (terakhir?.content ?? '').slice(0, 600),
    pesan: (sesi?.messages ?? []).length,
  };
})())`,
  120000,
);
const akhir = typeof akhirRaw === 'string' ? JSON.parse(akhirRaw) : akhirRaw;

/* Periksa hasil di DISK - inilah bukti sesungguhnya. */
const berkas = fs.existsSync(WS) ? fs.readdirSync(WS).filter((f) => !f.startsWith('.')) : [];
const wajib = ['package.json', 'main.js', 'preload.js', 'index.html', 'styles.css', 'renderer.js', 'store.js', 'README.md'];
const hilang = wajib.filter((f) => !berkas.includes(f));

/* node --check tiap berkas JS. */
const jsFiles = berkas.filter((f) => f.endsWith('.js'));
const sintaks = [];
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', path.join(WS, f)], { encoding: 'utf8' });
  sintaks.push({ berkas: f, ok: r.status === 0, pesan: (r.stderr ?? '').slice(0, 160) });
}

/* package.json valid dan mendeklarasikan electron + main. */
let pkg = null;
let pkgOk = false;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(WS, 'package.json'), 'utf8'));
  pkgOk = !!pkg.main && !!pkg.devDependencies?.electron;
} catch {
  /* tidak ada / rusak */
}

/* Placeholder terlarang. */
let placeholder = [];
for (const f of berkas.filter((x) => /\.(js|json|html|css|md)$/.test(x))) {
  const isi = fs.readFileSync(path.join(WS, f), 'utf8');
  const m = isi.match(/TODO|FIXME|isi di sini|lorem ipsum/gi);
  if (m) placeholder.push(`${f}(${m.length})`);
}

/* ── LAPORAN ─────────────────────────────────────────────────────────────── */
console.log('\n=== HASIL ===\n');
console.log('waktu        :', totalDetik, 'detik');
console.log('giliran      :', akhir.langkah, '/ 200  (langkah tercatat:', akhir.langkahTotal + ')');
console.log('tool tersering:', JSON.stringify(akhir.tools));
console.log('token        :', JSON.stringify(akhir.usage));
console.log('selesai      :', selesai ? 'ya' : 'TIDAK (mentok batas waktu)');
console.log('izin dijawab :', jumlahIzin);
if (akhir.galat) console.log('galat agen   :', akhir.galat);

console.log('\nberkas di disk:', berkas.length);
for (const f of berkas) {
  const ukuran = fs.statSync(path.join(WS, f)).size;
  console.log(`  ${f.padEnd(18)} ${String(ukuran).padStart(7)} byte`);
}

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti Fase 5:');
cek('agen selesai (tidak mentok)', selesai === true, selesai ? '' : `${totalDetik}s`);
cek('semua 8 berkas wajib ada', hilang.length === 0, hilang.length ? 'hilang: ' + hilang.join(', ') : '');
cek('semua berkas JS lolos node --check', sintaks.length > 0 && sintaks.every((s) => s.ok), sintaks.filter((s) => !s.ok).map((s) => s.berkas).join(', ') || `${sintaks.length} berkas`);
cek('package.json mendeklarasikan electron + main', pkgOk, pkg ? `main=${pkg.main} electron=${pkg.devDependencies?.electron ?? '-'}` : 'tidak ada');
cek('tidak ada placeholder TODO/FIXME', placeholder.length === 0, placeholder.join(', '));

if (akhir.isiAkhir) {
  console.log('\n--- jawaban akhir agen (potongan) ---');
  console.log(akhir.isiAkhir);
}

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
console.log('\njejak langkah:', jejak.length, 'sampel');
keluarBersih(gagal ? 1 : 0);
