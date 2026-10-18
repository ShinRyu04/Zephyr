/*
 * Bukti: permintaan izin TIDAK menggantung DAN tidak merebut editor.
 *
 * Temuan Fase 5: agen diam 293 detik di `waiting-confirmation` karena `send()`
 * menunggu Promise yang hanya diselesaikan tombol di AiPanel. Kalau panel tidak
 * ter-mount, tidak ada tombol dan agen menunggu sampai watchdog 15 menit.
 *
 * Perbaikan pertama salah: ia memanggil `bukaViewAi('ai-chat')`, yang membuka
 * tab Chat di AREA EDITOR dan menutupi berkas yang sedang dibaca. Uji ini
 * menahan keduanya.
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = window.__ZEPHYR_AI__;
  const S = window.__ZEPHYR__;
  const out = {};

  /* Siapkan: buka satu berkas supaya editor BERISI, lalu catat keadaannya. */
  try { S.getState().openPath('D:/Zephyr/package.json'); } catch (e) {}
  await tunggu(1200);
  out.sebelum = {
    jumlahTab: S.getState().tabs.length,
    tabAktif: S.getState().activeTabId,
    namaTab: S.getState().tabs.map((t) => t.name),
    adaTabChat: S.getState().tabs.some((t) => t.view === 'ai-chat'),
  };

  /* Minta izin. */
  const janji = A.store.getState().agentMintaIzin('write_file', '{"path":"uji.txt"}', { tulis: true });
  await tunggu(1500);

  out.sesudah = {
    jumlahTab: S.getState().tabs.length,
    tabAktif: S.getState().activeTabId,
    namaTab: S.getState().tabs.map((t) => t.name),
    adaTabChat: S.getState().tabs.some((t) => t.view === 'ai-chat'),
    adaKonfirmasi: !!A.store.getState().agentConfirm,
  };

  /* Jawab, supaya run tidak menggantung. */
  A.store.getState().agentPutuskan(true);
  out.hasil = await janji;

  /* Batas waktu: diperpendek supaya uji cepat. */
  A.store.getState().agentPutuskan(false);
  await tunggu(300);
  const m = await import('/src/lib/aiStore.ts');
  const asli = m.izinTimeoutAktif();
  m.setIzinTimeout(2500);
  const t1 = performance.now();
  out.timeout = { hasil: await A.store.getState().agentMintaIzin('write_file', '{}', { tulis: true }) };
  out.timeout.ms = Math.round(performance.now() - t1);
  m.setIzinTimeout(asli);

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  240000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log('sebelum :', JSON.stringify(d.sebelum));
console.log('sesudah :', JSON.stringify(d.sesudah));
console.log('timeout :', JSON.stringify(d.timeout));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — izin tidak merebut editor dan tidak menggantung:');
cek('TIDAK menambah tab di editor', d.sesudah?.jumlahTab === d.sebelum?.jumlahTab, `${d.sebelum?.jumlahTab} -> ${d.sesudah?.jumlahTab}`);
cek('TIDAK membuka tab Chat', d.sesudah?.adaTabChat === false, String(d.sesudah?.adaTabChat));
cek('tab aktif TIDAK berubah', d.sesudah?.tabAktif === d.sebelum?.tabAktif, `${d.sebelum?.tabAktif} -> ${d.sesudah?.tabAktif}`);
cek('dialog konfirmasi tetap diset', d.sesudah?.adaKonfirmasi === true, '');
cek('jawaban store menyelesaikan', d.hasil === true, String(d.hasil));
cek('permintaan tanpa jawaban SELESAI sendiri', d.timeout?.hasil === false, `${d.timeout?.ms} ms`);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
