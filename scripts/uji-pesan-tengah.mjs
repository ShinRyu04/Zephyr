/**
 * uji-pesan-tengah.mjs — C: pesan pengguna yang dikirim SAAT agen masih kerja.
 *
 * Sebelum ini, "send" saat agen sibuk cuma diam-diam ikut antre sampai run-nya
 * bubar: pengguna mengetik sesuatu yang bisa menyelamatkan run (mis. "berkasnya
 * jangan di luar folder"), lalu baru dibaca 20 menit kemudian - kalau run-nya
 * belum rusak duluan. Yang harus dibuktikan bukan "tidak error", tapi bahwa
 * pesannya benar-benar MENGUBAH pekerjaan yang sedang berjalan.
 *
 * Karena itu permintaannya dipilih yang tidak mungkin sudah dikerjakan sebelum
 * pesan datang: berkas tambahan yang isinya cuma ditentukan oleh pesan itu.
 * Kalau agen selesai tanpa berkas tersebut, berarti pesannya masih mengantre
 * mati - bukan lulus.
 *
 *   node scripts/uji-pesan-tengah.mjs [port] [workspace]
 *   Env: MENIT=8
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = (process.argv[3] ?? 'D:/Testing/pesan-tengah').replace(/\\/g, '/');
const MENIT = Number(process.env.MENIT ?? 8);
const R = reporter('C: pesan/sisipan pengguna di tengah run');

fs.mkdirSync(WS, { recursive: true });
for (const f of ['satu.md', 'dua.md', 'tiga.md', 'empat.md', 'kelima.md', '.zephyr-context.md']) {
  try { fs.unlinkSync(path.join(WS, f)); } catch { /* memang belum ada */ }
}

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

/* Gerbang sebelum menembak: run yang masih hidup akan menelan `send` kita jadi
   sisipan di dalam run ITU - tugasnya "berhasil" tapi workspace-nya masih yang
   lama, dan semua angka yang dilaporkan jadi milik run orang lain. Ini pernah
   terjadi (dua harness menumpuk: berkas hasil uji muncul di folder uji
   sebelumnya), jadi diperiksa, bukan diasumsikan. */
const pra = await cdp.json(`return JSON.stringify({
  busy: window.__ZEPHYR_AI__.store.getState().agentBusy,
  ws: (window.__ZEPHYR__ && window.__ZEPHYR__.getState) ? (window.__ZEPHYR__.getState().workspace ?? null) : null,
})`);
if (pra.busy) {
  console.log('     BERHENTI: agen masih sibuk (run lain belum selesai) - tidak menumpuk run.');
  await cdp.close();
  process.exit(2);
}

/* Workspace harus BENAR-BENAR pindah sebelum tugas dikirim: kalau `openWorkspace`
   tidak jalan (mis. app sedang sibuk), tool tulis akan menulis ke folder lama dan
   harness ini akan melaporkan "0/4 berkas" untuk tugas yang sebenarnya sukses. */
const wsPasang = await cdp.json(
  `return JSON.stringify(await (async () => {
  for (let i = 0; i < 20; i++) {
    void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS)});
    await new Promise((r) => setTimeout(r, 250));
    const ws = window.__ZEPHYR__.getState().workspace ?? null;
    if (String(ws).split(String.fromCharCode(92)).join('/') === ${JSON.stringify(WS)}) return { ws, ok: true };
  }
  return { ws: window.__ZEPHYR__.getState().workspace ?? null, ok: false };
})())`,
  30000,
);
console.log(`     workspace: ${wsPasang.ws} (${wsPasang.ok ? 'siap' : 'TIDAK BERPINDAH'})`);
if (!wsPasang.ok) {
  console.log('     BERHENTI: workspace uji tidak bisa dipasang - hasil akan menyesatkan.');
  await cdp.close();
  process.exit(3);
}

const tugas =
  'Tulis empat berkas catatan di folder ini: satu.md, dua.md, tiga.md, empat.md. ' +
  'Tiap berkas minimal 12 baris: judul, lalu 11 baris penjelasan bernomor. Topik berbeda tiap berkas. ' +
  'Sesudah keempatnya ada, periksa jumlah barisnya dari disk dan laporkan angkanya.';

const SISIPAN =
  'Tambahan penting dari pengguna (berlaku sekarang juga): sesudah keempat berkas selesai, ' +
  'buat satu berkas LAGI bernama kelima.md yang isinya tepat satu baris: SISIPAN-TENGAH. ' +
  'Berkas itu wajib ada sebelum pekerjaan ini ditutup.';

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS)});
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentMode) A.getState().setAgentMode('agent');
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);

  const t0 = Date.now();
  void A.getState().send(${JSON.stringify(tugas)});
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));

  const langkah = () => (A.getState().agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
  /* Kirim sisipan setelah kerja benar-benar mulai (>=1 langkah tool), bukan
     sebelum: yang diuji justru pesan yang datang di TENGAH, dan itu berarti
     harus ada pekerjaan yang sedang berjalan saat pesan itu masuk. */
  let tungguLangkah = 0;
  while (Date.now() - t0 < 60000 && langkah().length < 1) { await new Promise((r) => setTimeout(r, 200)); tungguLangkah++; }
  const sebelumSisipan = langkah().map((x) => x.name);
  const wsSaatKirim = window.__ZEPHYR__.getState().workspace ?? null;
  const langkahAwal = sebelumSisipan.length;
  const tSisipan = Date.now();
  let galatKirim = null;
  try {
    void A.getState().send(${JSON.stringify(SISIPAN)});
  } catch (e) {
    galatKirim = String(e && e.message ? e.message : e);
  }
  /* Pesan harus terlihat pengguna SELAGI run berjalan, bukan baru sesudah bubar.
     Dua permukaan diperiksa, karena keduanya sah: kiriman saat agen sibuk masuk
     ANTRIAN (dan barisnya tampil di panel), lalu baru jadi pesan sesi ketika
     diambil di kepala langkah berikutnya. Menguji salah satu saja membuat uji
     ini gagal hanya karena salah permukaan - bukan karena pesannya hilang. */
  const hitungTerlihat = () => {
    const st = A.getState();
    const sn = st.activeSession ? st.activeSession() : null;
    const diPesan = (sn && sn.messages ? sn.messages : [])
      .filter((m) => String(m.content || '').includes('SISIPAN-TENGAH')).length;
    const diAntrian = Object.values(st.antrians || {})
      .flat()
      .filter((q) => String((q && q.teks) || '').includes('SISIPAN-TENGAH')).length;
    return diPesan + diAntrian;
  };
  await new Promise((r) => setTimeout(r, 1200));
  const terlihatCepat = hitungTerlihat();

  const jejak = [];
  let nLangkah = -1;
  let macet = Date.now();
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const st = langkah();
    const nama = st.map((x) => x.name);
    const sesudah = Math.round((tSisipan - t0) / 1000);
    if (jejak.length === 0 || jejak[jejak.length - 1].slice(5) !== 'n=' + st.length) {
      jejak.push(Math.round((Date.now() - t0) / 1000) + 's n=' + st.length + ' ' + nama.slice(-3).join(','));
    }
    if (!s.agentBusy) {
      const sn = s.activeSession ? s.activeSession() : null;
      const ms = (sn && sn.messages) ? sn.messages : [];
      return {
        ok: true, ms: Date.now() - t0, langkah: st.length, nama, galatKirim, terlihatCepat,
        tSisipan, dSisipan: tSisipan - t0, langkahAwal, wsSaatKirim, sebelumSisipan, jejak,
        terlihatAkhir: hitungTerlihat(),
        gagal: st.filter((x) => x.ok === false || x.error).map((x) => x.name),
        balasan: ms.length ? String(ms[ms.length - 1].content || '').slice(0, 700) : '',
        error: ms.length ? (ms[ms.length - 1].error || null) : null,
      };
    }
    if (nama.length !== nLangkah) { nLangkah = nama.length; macet = Date.now(); }
    else if (Date.now() - macet > 180000) {
      return { ok: false, macet: true, ms: Date.now() - t0, langkah: nama.length, nama, jejak };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, timeout: true, ms: Date.now() - t0, jejak };
})())`,
  MENIT * 60000 + 60000,
);

const ada = (f) => fs.existsSync(path.join(WS, f));
const dasar = ['satu.md', 'dua.md', 'tiga.md', 'empat.md'].filter(ada).length;
const isiKelima = ada('kelima.md') ? fs.readFileSync(path.join(WS, 'kelima.md'), 'utf8') : '';
const tulisSesudah = (hasil.nama ?? []).filter((n, i) => i >= (hasil.sebelumSisipan?.length ?? 0)).length;

console.log('\n--- jejak ---');
for (const j of hasil.jejak ?? []) console.log('  ' + j);
const dtSisipan = Math.round((hasil.dSisipan ?? 0) / 100) / 10;
console.log(`\n     sisipan dikirim pada ${dtSisipan}s ` +
  `(langkah saat itu: ${(hasil.sebelumSisipan ?? []).join(',') || 'belum ada'})`);

R.check('C0', hasil.langkahAwal >= 1 && String(hasil.wsSaatKirim || '').replace(/\\/g, '/') === WS,
  `run baru benar-benar mulai (${hasil.langkahAwal} langkah sebelum sisipan) di workspace ${hasil.wsSaatKirim}`);
R.check('C1', hasil.galatKirim === null, `send() saat agen sibuk diterima, bukan ditolak (galat=${hasil.galatKirim ?? 'tidak ada'})`);
R.check('C2', (hasil.terlihatCepat ?? 0) >= 1,
  `sisipan terlihat pengguna selagi agen masih kerja - antrian atau pesan sesi (${hasil.terlihatCepat} tempat; ${terlihatRingkas(hasil)})`);
R.check('C3', hasil.ok === true, `run berakhir sendiri (${hasil.ok ? Math.round(hasil.ms / 1000) + 's, ' + hasil.langkah + ' langkah' : hasil.macet ? 'MACET' : 'TIMEOUT'}; error=${hasil.error ?? 'bersih'})`);
R.check('C4', tulisSesudah >= 1, `agen masih mengerjakan langkah SESUDAH sisipan (${tulisSesudah} dari ${hasil.langkah})`);
R.check('C5', dasar === 4, `empat berkas dasar ada (${dasar}/4)`);
R.check('C6', isiKelima.includes('SISIPAN-TENGAH'),
  `sisipan BENAR-BENAR dijalankan: kelima.md dibuat sesudah pesan masuk (${isaKelima(ada('kelima.md'), isiKelima)})`);
R.check('C7', (hasil.gagal ?? []).length === 0, `tidak ada langkah gagal (${(hasil.gagal ?? []).join(',') || 'bersih'})`);

console.log('\n--- langkah (urut) ---');
console.log('     ' + (hasil.nama ?? []).join(' -> ').slice(0, 700));
console.log('\n--- laporan agent ---');
console.log('     ' + String(hasil.balasan ?? '').trim().slice(0, 600).replace(/\n/g, '\n     '));

await cdp.close();
R.selesai();

function isaKelima(adaBerkas, isi) {
  if (!adaBerkas) return 'berkas kelima.md TIDAK dibuat';
  return isi.length < 40 ? `isinya "${isi.trim()}"` : `isinya ${isi.length} char, memuat kata kuncinya`;
}
function terlihatRingkas(h) {
  const awal = h.terlihatCepat ?? 0;
  const akhir = h.terlihatAkhir ?? 0;
  if (akhir >= awal && akhir >= 1) return 'tetap ada sampai run selesai';
  if (akhir === 0) return 'HILANG dari sesi dan antrian';
  return 'berkurang sesudah diambil agen';
}
