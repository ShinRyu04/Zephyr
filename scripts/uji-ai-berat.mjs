/**
 * uji-ai-berat.mjs - uji tugas coding PANJANG, bukan satu langkah.
 *
 * Uji satu langkah hanya membuktikan koneksi. Yang belum terbukti: apakah agent
 * bertahan saat tugasnya multi-langkah - baca beberapa berkas, menyunting,
 * menjalankan perintah, memverifikasi - tanpa macet, tanpa 400, tanpa berhenti
 * di tengah.
 *
 * Tugasnya sengaja memaksa banyak jenis tool dalam satu run:
 *   list_directory -> read_file -> edit -> bash_run (verifikasi)
 *
 * Yang diperiksa: berapa langkah, tool apa saja, berakhir sendiri atau tidak,
 * ada error atau tidak, dan apakah hasil akhirnya menunjukkan pekerjaannya
 * benar-benar selesai.
 *
 *   node scripts/uji-ai-berat.mjs 9223
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const R = reporter('agent AI - tugas coding panjang');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

const { cdp } = await Cdp.attach(PORT, ['Zephyr']);
cdp.snapshot = null;

const BASELINE = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const st = window.__ZEPHYR__.getState();
  return { busy: A.agentBusy, ws: st.workspace, model: A.model, provider: A.provider };
})())`);

R.check('B1', BASELINE.busy === false, `agent idle (${BASELINE.provider}/${BASELINE.model})`);
R.check('B2', !!BASELINE.ws, `workspace terbuka (${BASELINE.ws})`);

if (!BASELINE.ws) {
  console.log('  -> buka workspace dulu; uji berat butuh berkas nyata');
  R.selesai();
  await cdp.close();
  process.exit(1);
}

await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store;
  if (A.getState().setApprovalMode) A.getState().setApprovalMode('auto');
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
  return true;
})())`);

/*
 * Tugas yang memaksa RANTAI, bukan satu panggilan.
 *
 * Setiap langkah bergantung pada hasil sebelumnya: nama berkasnya harus
 * ditemukan dulu, isinya dibaca dulu, baru disunting, lalu diverifikasi dengan
 * perintah. Kalau loop-nya rusak - hasil tool tidak kembali, atau riwayatnya
 * salah bentuk - rantai ini putus di langkah kedua atau ketiga, bukan di akhir.
 */
const TUGAS =
  process.argv[3] ??
  [
    'Kerjakan berurutan, satu langkah pada satu waktu:',
    '1. Lihat isi folder akar workspace.',
    '2. Pilih satu berkas teks kecil (bukan folder, bukan biner).',
    '3. Baca berkas itu.',
    '4. Tulis berkas BARU bernama ZEPHYR-UJI-COBA.txt di akar workspace, isinya: nama berkas yang kamu baca tadi.',
    '5. Jalankan perintah shell untuk membuktikan berkas baru itu ada.',
    '6. Laporkan dalam 2 baris: berkas apa yang dibaca, dan hasil perintah verifikasinya.',
    'Jangan membaca lebih dari satu berkas. Jangan menyunting berkas yang kamu baca.',
  ].join(' ');

const t0 = Date.now();
await cdp.json(`return JSON.stringify((() => {
  void window.__ZEPHYR_AI__.store.getState().send(${JSON.stringify(TUGAS)});
  return true;
})())`);

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  const t0 = Date.now();
  /*
   * Tunggu run BENAR-BENAR mulai sebelum menunggunya selesai.
   *
   * \`send()\` punya jeda kerja async (loadKeys, RAG, konteks proyek) SEBELUM
   * menyetel \`agentBusy:true\`. Kalau loop langsung cek \`!agentBusy\`, iterasi
   * pertama melihat flag idle dari keadaan sebelumnya dan keluar seketika —
   * membaca \`agentSteps\` BASI milik run sebelumnya. Diukur: agentBusy baru
   * naik ~250ms setelah send. Jadi: tunggu busy naik dulu (maks 15s), baru
   * tunggu ia turun. Kalau 15s tidak pernah naik, itu kegagalan sungguhan.
   */
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) {
    await new Promise((r) => setTimeout(r, 50));
  }
  let langkahTerakhir = -1;
  let macetSejak = Date.now();
  while (Date.now() - t0 < 420000) {
    const s = A.getState();
    if (!s.agentBusy) {
      const sesi = s.activeSession ? s.activeSession() : null;
      const msgs = (sesi && sesi.messages) ? sesi.messages : [];
      const last = msgs[msgs.length - 1] || null;
      const tools = (s.agentSteps || []).filter((x) => x.kind === 'tool');
      return {
        ok: true,
        ms: Date.now() - t0,
        langkah: tools.length,
        nama: tools.map((x) => x.name),
        gagal: tools.filter((x) => x.ok === false).map((x) => x.name),
        balasan: last ? String(last.content || '').slice(0, 900) : '',
        error: last ? (last.error || null) : null,
        streaming: last ? !!last.streaming : null,
      };
    }
    /*
     * Deteksi MACET: kalau jumlah langkah tidak bergerak selama 90 detik,
     * laporkan sebagai macet alih-alih menunggu sampai 7 menit. Ini gejala yang
     * dilaporkan ("kerja terus tapi tidak ada kemajuan"), dan menunggu penuh
     * membuat diagnosisnya lebih lambat tanpa menambah informasi.
     */
    const n = (s.agentSteps || []).filter((x) => x.kind === 'tool').length;
    if (n !== langkahTerakhir) {
      langkahTerakhir = n;
      macetSejak = Date.now();
    } else if (Date.now() - macetSejak > 90000) {
      return { ok: false, ms: Date.now() - t0, macet: true, langkah: n };
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return { ok: false, ms: Date.now() - t0, error: 'TIMEOUT 420s' };
})())`);

const detik = Math.round((Date.now() - t0) / 1000);

R.check('B3', hasil.ok === true, `run BERAKHIR sendiri dalam ${detik}s${hasil.macet ? ' (MACET - langkah tidak maju 90s)' : ''}`);
R.check('B4', (hasil.langkah ?? 0) >= 3, `rantai berjalan: ${hasil.langkah} langkah (${(hasil.nama ?? []).join(' -> ')})`);
R.check('B5', (hasil.nama ?? []).includes('write_file') || (hasil.nama ?? []).includes('edit'), 'agent benar-benar MENULIS berkas');
R.check('B6', (hasil.nama ?? []).includes('bash_run'), 'agent MENJALANKAN perintah untuk verifikasi');
R.check('B7', hasil.streaming === false, `bubble tidak menggantung (${hasil.streaming})`);
R.check('B8', !hasil.error, `tidak ada error provider (${hasil.error ?? 'bersih'})`);
R.check('B9', (hasil.gagal ?? []).length === 0, `tidak ada tool yang gagal (${(hasil.gagal ?? []).join(', ') || 'tidak ada'})`);
R.check('B10', String(hasil.balasan ?? '').trim().length > 0, `ada laporan akhir (${String(hasil.balasan ?? '').trim().length} char)`);

/* ── Bukti dari DISK, bukan dari kata agent ───────────────────────────── */

const ada = await cdp.json(`return JSON.stringify(await (async () => {
  const c = (await import('/src/lib/commands.ts'));
  const st = window.__ZEPHYR__.getState();
  const target = (st.workspace || '').replace(/\\\\\\\\/g, '/') + '/ZEPHYR-UJI-COBA.txt';
  try {
    const isi = await c.fsRead(target);
    return { ada: true, isi: String(isi.content || '').slice(0, 200) };
  } catch (e) {
    return { ada: false, err: String(e && e.message ? e.message : e).slice(0, 160), target };
  }
})())`);

R.check('B11', ada.ada === true, `berkas hasil BENAR-BENAR ada di disk (${ada.ada ? 'ya' : ada.err})`);
if (ada.ada) console.log(`     isinya: ${JSON.stringify(ada.isi)}`);

console.log('\n--- laporan agent ---');
console.log(String(hasil.balasan ?? '').trim() || '(kosong)');
console.log('--------------------\n');

R.selesai();
await cdp.close();
process.exit(gagal ? 1 : 0);
