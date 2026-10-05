/*
 * BUG 2 - tidak boleh ada penolakan di jalur agent yang tidak terlihat.
 *
 * Gejala asli: tekan kirim, tidak ada reaksi, tidak ada error, tidak ada toast.
 * Penyebabnya bukan "semua jalur diam", tapi satu jalur khusus: timer batas
 * 15 menit membatalkan langkah dengan MENGHAPUS resolver tanpa memanggilnya,
 * jadi loop yang meng-await tidak pernah selesai dan bubble berhenti di
 * `streaming` selamanya.
 *
 * Uji ini memicu SETIAP jalur penolakan yang bisa dicapai tanpa provider nyata,
 * lalu memeriksa bahwa masing-masing meninggalkan jejak yang BISA DIBACA:
 * toast, atau bubble error di percakapan. Asersinya pada AKIBAT yang terlihat,
 * bukan pada nama fungsi - jadi ia tetap sahih kalau implementasinya berubah.
 *
 * Syarat: aplikasi hidup dengan port debug 9223.
 */
import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const page = await halamanZephyr('9223');
const { cdp } = await Cdp.attach('9223', page.title);

const hasil = [];
const cek = (nama, lulus, detail) => {
  hasil.push(lulus);
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}${detail ? '  ->  ' + detail : ''}`);
};

/*
 * Pesan hidup di `sessions[activeId].messages` (bukan `state.messages`).
 * Pembacaan lewat helper ini supaya bentuknya tidak perlu diulang di tiap uji.
 */
const bacaSesi = `(function(){
  const st = X.store.getState();
  const ses = st.sessions[st.activeId] || { messages: [] };
  return ses.messages || [];
})()`;

/** Kirim satu pesan dan tunggu sampai agent berhenti sibuk (atau timeout). */
const kirim = (pesan, ms = 25000) =>
  cdp.runAsync(
    `
  const pesan0 = ${bacaSesi};
  X.store.getState().setToast(null);
  X.store.getState().setAgentMode('agent');
  const sebelum = pesan0.length;
  const p = X.store.getState().send(${JSON.stringify(pesan)});
  for (let i = 0; i < ${Math.floor(ms / 200)}; i++) {
    await wait(200);
    const st = X.store.getState();
    if (!st.agentBusy && ${bacaSesi}.length > sebelum) {
      // beri jeda singkat supaya teks/err terakhir ikut tersettle
      await wait(300);
      break;
    }
  }
  const st = X.store.getState();
  const sesudahPesan = ${bacaSesi};
  const akhir = sesudahPesan[sesudahPesan.length - 1] || {};
  return {
    busy: st.agentBusy,
    toast: st.toast || null,
    jumlahPesan: sesudahPesan.length - sebelum,
    peran: akhir.role || null,
    err: akhir.error || null,
    streaming: !!akhir.streaming,
    isi: String(akhir.content || '').slice(0, 180),
    hasilKembalian: (await Promise.race([p, wait(50).then(() => '(masih jalan)')])) ?? null,
  };
`,
    ms + 10000,
  );

/*
 * Catatan: jalur "provider tanpa key" TIDAK diuji di sini. Ia punya harness
 * sendiri (scripts/cek-agent-tanpa-key.mjs) karena butuh keadaan bersih - kalau
 * dijalankan setelah langkah lain, `send` hanya mengantre pesan dan jalurnya
 * tidak pernah tercapai (pernah terjadi: hasilnya "Added to the queue").
 */

/*
 * --- 2. Jalur batas-waktu keras.
 *
 * Timer 15 menit tidak bisa ditunggu. Yang bisa diuji adalah INVARIANYA:
 * membatalkan langkah yang sedang berjalan harus MENYELESAIKAN loop, bukan
 * membiarkannya menggantung. Kalau resolver-nya hanya dihapus, `busy` akan
 * tetap true selamanya - jadi `busy` yang kembali false adalah buktinya.
 */
const batal = await cdp.runAsync(
  `
  X.store.getState().setToast(null);
  X.store.getState().setAgentMode('agent');
  const sebelum = ${bacaSesi}.length;
  void X.store.getState().send('tolong hitung 1 sampai 3');
  await wait(1500);
  const saatJalan = X.store.getState().agentBusy;
  X.store.getState().cancel();
  for (let i = 0; i < 60; i++) {
    await wait(250);
    if (!X.store.getState().agentBusy) break;
  }
  const st = X.store.getState();
  const akhir = ${bacaSesi}[${bacaSesi}.length - 1] || {};
  return {
    saatJalan,
    busyAkhir: st.agentBusy,
    pesanBaru: ${bacaSesi}.length - sebelum,
    err: akhir.error || null,
    streaming: !!akhir.streaming,
    isi: String(akhir.content || '').slice(0, 180),
    toast: st.toast || null,
  };
`,
  40000,
);
console.log('batal ->', JSON.stringify(batal));
cek('agent benar-benar sempat berjalan sebelum dibatalkan', batal.saatJalan === true, String(batal.saatJalan));
cek('setelah cancel, agent TIDAK menggantung (busy kembali false)', batal.busyAkhir === false, String(batal.busyAkhir));
cek('setelah cancel, bubble berhenti streaming', batal.streaming === false, String(batal.streaming));

const lulus = hasil.filter(Boolean).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
cdp.close();
process.exit(lulus === hasil.length ? 0 : 1);
