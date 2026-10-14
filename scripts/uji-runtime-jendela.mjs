#!/usr/bin/env node
/*
 * Uji kendali jendela pada APLIKASI YANG SEDANG HIDUP (lewat CDP).
 *
 * `scripts/uji-tool-jendela.mjs` memeriksa SUMBER: ia membaca berkas dan
 * mencocokkan id. Uji ini menjawab pertanyaan yang berbeda dan tidak bisa
 * dijawab analisis sumber: "apakah modulnya benar-benar bisa DIMUAT aplikasi
 * yang sedang jalan, dan apakah peta panel/setelannya menunjuk id yang ada di
 * registry NYATA saat ini?"
 *
 * Sengaja HANYA MEMANGGIL FUNGSI BACA:
 *   daftarPanel() / daftarSetelan()  -> inventaris
 *   ringkasJendela()                 -> cuplikan keadaan jendela
 *   laporanTangkapLayar()            -> status tangkap layar
 *   tangkapJendela()                 -> berhenti di penjaga bendera, tak invoke apa pun
 *   AKSI_PANE / KONTROL_*            -> dibandingkan dengan findCommand() registry nyata
 * Yang TIDAK dipanggil: bukaPanel()/bukaSetelan()/aksiPane() - ketiganya MENGUBAH
 * UI aplikasi milik user. Membuktikan perilaku itu lewat UI sengaja tidak
 * dilakukan oleh tugas ini; lihat catatan di akhir keluaran.
 *
 * Pakai: node scripts/uji-runtime-jendela.mjs      (exit 0 = semua cocok)
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9223';

async function targetHalaman() {
  const r = await fetch(`${CDP}/json/list`, { signal: AbortSignal.timeout(5000) });
  const daftar = await r.json();
  const hal = daftar.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  return hal.find((t) => /5173|tauri|localhost/.test(t.url || '')) ?? hal[0] ?? null;
}

function kirim(ws, id, method, params) {
  return new Promise((selesai, gagal) => {
    const batas = setTimeout(() => gagal(new Error(`tenggang habis: ${method}`)), 20000);
    const onMsg = (data) => {
      let m;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (m.id !== id) return;
      clearTimeout(batas);
      ws.off('message', onMsg);
      m.error ? gagal(new Error(`${method}: ${m.error.message}`)) : selesai(m.result);
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const EKSPRESI = `(async () => {
  const k = await import('/src/lib/zephyrTools/kendaliJendela.ts');
  const cr = await import('/src/lib/commandRegistry.ts');
  const idPeta = [...Object.values(k.KONTROL_PANEL), ...Object.values(k.KONTROL_SETELAN)]
    .filter((v) => typeof v === 'string' && v !== k.PEMBUKA_STORE);
  return {
    panel: k.daftarPanel(),
    setelan: k.daftarSetelan(),
    aksiPane: [...k.AKSI_PANE],
    idPeta: [...new Set(idPeta)],
    idTakDikenal: [...new Set(idPeta)].filter((id) => !cr.findCommand(id)),
    ringkas: k.ringkasJendela(),
    laporan: k.laporanTangkapLayar(),
    tangkap: await k.tangkapJendela(),
    benderaTangkap: k.TANGKAP_LAYAR_TERSEDIA,
  };
})()`;

const gagal = [];
const WAJIB = process.argv.includes('--wajib');
const target = await targetHalaman().catch(() => null);
if (!target) {
  /*
   * Aplikasi yang tidak hidup BUKAN kegagalan kode ini: kemampuan yang diuji
   * memang hanya ada saat aplikasi jalan. Karena itu absennya aplikasi
   * dilaporkan sebagai DILEWATI dan keluar 0 - supaya rantai otomatis tidak
   * menghukum orang yang cuma belum menyalakan aplikasi. Pakai `--wajib` kalau
   * aplikasi SEHARUSNYA hidup (mis. sesudah tauri dev) dan absennya berarti ada
   * yang salah.
   */
  console.log(`DILEWATI: tidak ada halaman aplikasi di ${CDP}.`);
  console.log('Uji ini memeriksa aplikasi yang sedang HIDUP; nyalakan Zephyr untuk menjalankannya sungguhan.');
  process.exit(WAJIB ? 1 : 0);
}
console.log(`halaman : ${target.url}`);
console.log(`target  : ${target.id}`);

const { WebSocket } = await import('ws').catch(async () => {
  const w = require('ws');
  return { WebSocket: w };
});
const ws = new WebSocket(target.webSocketDebuggerUrl);
ws.on('error', (e) => {
  console.log(`TIDAK JALAN: WebSocket gagal: ${e.message}`);
  process.exit(1);
});
await new Promise((s) => ws.on('open', s));

let hasil = null;
try {
  const r = await kirim(ws, 1, 'Runtime.evaluate', {
    expression: EKSPRESI,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'exception di halaman');
  hasil = r.result?.value ?? null;
} finally {
  ws.close();
}

if (!hasil) {
  console.log('GAGAL: halaman tidak mengembalikan nilai.');
  process.exit(1);
}

console.log('');
console.log(`panel dibaca aplikasi     : ${hasil.panel.length} -> ${hasil.panel.join(', ')}`);
console.log(`setelan dibaca aplikasi   : ${hasil.setelan.length}`);
console.log(`aksi pane                 : ${hasil.aksiPane.length} -> ${hasil.aksiPane.join(', ')}`);
console.log(`id perintah di peta       : ${hasil.idPeta.length}`);
console.log(`id TIDAK ada di registry   : ${hasil.idTakDikenal.length}`);
console.log(`bendera tangkap layar     : ${hasil.benderaTangkap}`);
console.log('');
console.log('ringkasJendela()    -> ' + hasil.ringkas);
console.log('');
console.log('laporanTangkapLayar() -> ' + hasil.laporan);
console.log('');
console.log('tangkapJendela()    -> ' + hasil.tangkap);
console.log('');

if (hasil.idTakDikenal.length > 0) gagal.push(`id tidak ada di registry: ${hasil.idTakDikenal.join(', ')}`);
if (hasil.panel.length === 0) gagal.push('daftarPanel() kosong di aplikasi hidup');
if (hasil.setelan.length === 0) gagal.push('daftarSetelan() kosong di aplikasi hidup');
if (!/belum didukung|siap/i.test(hasil.laporan)) gagal.push('laporanTangkapLayar() tidak melaporkan keadaan');
if (!hasil.tangkap.includes('Tangkap layar')) gagal.push('tangkapJendela() tidak melaporkan keadaan');
/*
 * Bendera dan jawaban harus sejalan. Dibandingkan tanpa peduli besar-kecil
 * huruf: laporan aslinya menulis "BELUM didukung" (huruf besar semua), dan
 * perbandingan huruf-besar-kecil yang naif pernah membuat uji ini gagal pada
 * keadaan yang justru BENAR.
 */
const teksTangkap = `${hasil.laporan} ${hasil.tangkap}`.toLowerCase();
if (hasil.benderaTangkap === true && !teksTangkap.includes('siap (pintasan')) {
  gagal.push('bendera menyala tetapi laporan tidak menyatakan tangkap layar siap');
} else if (hasil.benderaTangkap === false && !teksTangkap.includes('belum didukung')) {
  gagal.push('bendera mati tetapi laporan tidak menyatakan belum didukung');
}

if (gagal.length > 0) {
  console.log(`GAGAL: ${gagal.length} masalah.`);
  gagal.forEach((g) => console.log('  - ' + g));
  process.exit(1);
}
console.log(`LULUS: modul kendaliJendela dimuat aplikasi hidup; ${hasil.idPeta.length} id peta cocok dengan registry nyata; laporan keadaan terjawab.`);
console.log('CATATAN: bukaPanel()/bukaSetelan()/aksiPane() TIDAK dipanggil di sini karena mengubah UI user.');
process.exit(0);
