/**
 * uji-pemadatan.mjs — A(ii): apakah TUGAS ASLI bertahan melewati pemadatan konteks.
 *
 * Kenapa harness ini perlu ada. Semua uji lain mengukur berkas di disk, dan
 * untuk A(ii) itu tidak cukup: run yang kehilangan kalimat tugasnya tetap
 * menulis beberapa berkas sebelum tersesat, jadi "ada 6 berkas" bisa benar
 * meski pemadatan membuang syarat tugasnya. Yang harus dibuktikan adalah isi
 * riwayat yang dikirim SESUDAH pemadatan.
 *
 * Pohon keputusan yang dipakai di sini, dari yang paling tidak bisa dibantah:
 *   1. pemadatan benar-benar terjadi  -> jejakPemadatan bertambah
 *   2. riwayat hasil pemadatan MEMUAT kalimat tugas asli -> tugasDisuntik=true
 *      (jejak ini dihitung dengan mencari cuplikan kalimat itu di dalam array
 *      `history` yang akan dikirim, bukan dari bendera yang di-set terpisah)
 *   3. kerja tetap berjalan SESUDAH pemadatan -> ada langkah tulis berkas
 *      dengan nomor langkah > langkah pemadatan
 *   4. run berakhir sendiri -> bukan MATI di tengah
 *
 * Ambang pemadatan diturunkan lewat setting resmi app
 * (`zephyr.ai.autocompactTokens`) supaya pemadatan terjadi dalam run pendek,
 * lalu dikembalikan ke nilai semula - kalau tidak, uji ini akan meninggalkan
 * app pengguna dengan ambang 2.500 token.
 *
 *   node scripts/uji-pemadatan.mjs [port] [workspace]
 *   Env: MENIT=10, AMBANG=2500, N=6
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = (process.argv[3] ?? 'D:/Testing/pemadatan').replace(/\\/g, '/');
const MENIT = Number(process.env.MENIT ?? 10);
const AMBANG = Number(process.env.AMBANG ?? 2500);
const N = Number(process.env.N ?? 6);
/* N=6, bukan 4: dengan empat berkas, pemadatan kadang baru jatuh sesudah semua
   tulisan selesai, sehingga "kerja lanjut sesudah pemadatan" tidak punya bahan
   untuk diuji. Pekerjaannya dibuat cukup panjang supaya pemadatan jatuh DI
   TENGAH - itu satu-satunya cara menguji bahwa run tidak kehilangan arah. */
const R = reporter('A(ii): tugas asli bertahan melewati pemadatan konteks (run nyata)');

fs.mkdirSync(WS, { recursive: true });
const berkas = [];
for (let i = 1; i <= N; i++) berkas.push(`bab-${i}.md`);
for (const f of [...berkas, '.zephyr-context.md']) {
  try { fs.unlinkSync(path.join(WS, f)); } catch { /* belum ada: memang begitu */ }
}

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

const siap = await cdp.json(`return JSON.stringify({
  busy: window.__ZEPHYR_AI__.store.getState().agentBusy,
  adaJejak: typeof window.__ZEPHYR_AI__.jejakPemadatan === 'function',
  ambangLama: localStorage.getItem('zephyr.ai.autocompactTokens'),
})`);
if (siap.busy) {
  console.log('     BERHENTI: agen masih sibuk sebelum uji dimulai.');
  await cdp.close();
  process.exit(2);
}
if (!siap.adaJejak) {
  console.log('     BERHENTI: bridge jejakPemadatan belum ada (app perlu di-reload).');
  await cdp.close();
  process.exit(2);
}

/* Workspace harus benar-benar pindah sebelum tugas dikirim; kalau tidak, berkas
   hasilnya mendarat di folder lama dan uji ini melaporkan kegagalan palsu. */
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
if (!wsPasang.ok) {
  console.log(`     BERHENTI: workspace uji tidak bisa dipasang (sekarang ${wsPasang.ws}).`);
  await cdp.close();
  process.exit(3);
}

const tugas =
  `Tulis ${N} berkas bab di folder ini: ${berkas.join(', ')}. ` +
  'Tiap berkas minimal 14 baris, gaya catatan kuliah: judul, lalu 13 baris penjelasan bernomor. ' +
  'Bahas topik berbeda tiap berkas. Sebutkan kata kunci "PEMADATAN-UJI" satu kali di dalam berkas bab-1.md saja, ' +
  'dan tutup laporanmu dengan menyebut jumlah baris berkas terakhir.';

/* Ambang diturunkan SEMENTARA. Nilai lamanya sudah diambil di atas. */
await cdp.json(`return JSON.stringify((() => { localStorage.setItem('zephyr.ai.autocompactTokens', ${JSON.stringify(String(AMBANG))}); return true; })())`);

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  if (window.__ZEPHYR_AI__.kosongkanJejakPemadatan) window.__ZEPHYR_AI__.kosongkanJejakPemadatan();
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentMode) A.getState().setAgentMode('agent');
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
  const t0 = Date.now();
  void A.getState().send(${JSON.stringify(tugas)});
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));
  const jejak = [];
  let nLangkah = -1;
  let macetSejak = Date.now();
  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const steps = (s.agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
    const nama = steps.map((x) => x.name);
    const padat = (window.__ZEPHYR_AI__.jejakPemadatan ? window.__ZEPHYR_AI__.jejakPemadatan() : []);
    const baris = 'n=' + steps.length + ' tulis=' + nama.filter((n) => n === 'write_file' || n === 'edit').length
      + ' padat=' + padat.length;
    if (jejak.length === 0 || jejak[jejak.length - 1].slice(5) !== baris) jejak.push(Math.round((Date.now() - t0) / 1000) + 's ' + baris);
    if (!s.agentBusy) {
      const sn = s.activeSession ? s.activeSession() : null;
      const ms = (sn && sn.messages) ? sn.messages : [];
      const last = ms[ms.length - 1] || null;
      return {
        ok: true, ms: Date.now() - t0, langkah: steps.length, nama, padat, jejak,
        notisPadatDiSesi: ms.filter((m) => String(m.content || '').includes('dipadatkan otomatis')).length,
        gagal: steps.filter((x) => x.ok === false || x.error).map((x) => x.name),
        balasan: last ? String(last.content || '').slice(0, 900) : '',
        error: last ? (last.error || null) : null,
        stopReason: s.agentStopReason ?? null,
      };
    }
    if (nama.length !== nLangkah) { nLangkah = nama.length; macetSejak = Date.now(); }
    else if (Date.now() - macetSejak > 240000) {
      return { ok: false, macet: true, ms: Date.now() - t0, langkah: nama.length, nama, jejak,
               padat: (window.__ZEPHYR_AI__.jejakPemadatan ? window.__ZEPHYR_AI__.jejakPemadatan() : []) };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false, timeout: true, ms: Date.now() - t0, jejak };
})())`,
  MENIT * 60000 + 60000,
);

/* ── ambang dikembalikan, jangan tinggalkan setting yang dirusak uji ──── */
await cdp.json(`return JSON.stringify((() => {
  const lama = ${JSON.stringify(siap.ambangLama)};
  if (lama === null || lama === undefined) localStorage.removeItem('zephyr.ai.autocompactTokens');
  else localStorage.setItem('zephyr.ai.autocompactTokens', lama);
  return { kembali: localStorage.getItem('zephyr.ai.autocompactTokens') };
})())`);

const padat = hasil.padat ?? [];
const pertama = padat[0] ?? null;
const tulis = (hasil.nama ?? []).map((n, i) => ({ n, i })).filter((x) => x.n === 'write_file' || x.n === 'edit');
const tulisSesudah = pertama ? tulis.filter((x) => x.i >= pertama.langkah).length : 0;
const adaDiDisk = berkas.filter((f) => fs.existsSync(path.join(WS, f)));
const adaKataKunci = adaDiDisk.includes('bab-1.md')
  && fs.readFileSync(path.join(WS, 'bab-1.md'), 'utf8').includes('PEMADATAN-UJI');

console.log('\n--- jejak ---');
for (const j of hasil.jejak ?? []) console.log('  ' + j);
console.log(`\n--- pemadatan (ambang ${AMBANG} token) ---`);
for (const p of padat) {
  console.log(`  langkah ${p.langkah}: ${p.sebelum} -> ${p.sesudah} pesan (${p.diringkas} diringkas), ` +
    `tugasDisuntik=${p.tugasDisuntik}, sisaTodo=${p.sisaTodo}`);
  console.log(`     cuplikan tugas di riwayat: "${String(p.tugasAsli).slice(0, 60)}"`);
}

R.check('P1', padat.length >= 1, `pemadatan konteks BENAR-BENAR terjadi (${padat.length}x pada run ini)`);
R.check('P2', padat.length >= 1 && padat.every((p) => p.tugasDisuntik === true),
  `tiap riwayat hasil pemadatan MEMUAT kalimat tugas asli (${padat.filter((p) => p.tugasDisuntik).length}/${padat.length})`);
R.check('P3', padat.length >= 1 && padat.every((p) => p.sesudah < p.sebelum),
  `pemadatan memang menyusutkan konteks (${padat.map((p) => p.sebelum + '->' + p.sesudah).join(', ') || 'tidak ada'})`);
R.check('P4', tulisSesudah >= 1,
  `kerja LANJUT sesudah pemadatan: ${tulisSesudah} langkah tulis ada di langkah >= ${pertama ? pertama.langkah : '-'}`);
R.check('P5', hasil.notisPadatDiSesi >= 1,
  `notis "konteks dipadatkan" muncul di sesi (${hasil.notisPadatDiSesi}) - tanda independen, bukan dari jejak`);
R.check('P6', hasil.ok === true && !hasil.error,
  `run berakhir sendiri tanpa error provider (${hasil.ok ? Math.round(hasil.ms / 1000) + 's, ' + hasil.langkah + ' langkah' : hasil.macet ? 'MACET' : 'TIMEOUT'}; error=${hasil.error ?? 'bersih'})`);
R.check('P7', adaDiDisk.length === N && adaKataKunci,
  `berkas hasil ada ${adaDiDisk.length}/${N} dan kata kunci tugas asli ("PEMADATAN-UJI") ada di bab-1.md`);
R.check('P8', ((await cdp.json(`return JSON.stringify(localStorage.getItem('zephyr.ai.autocompactTokens'))`)) ?? null) === siap.ambangLama,
  `ambang pemadatan app dikembalikan ke nilai semula (${siap.ambangLama})`);

console.log('\n--- langkah (urut) ---');
console.log('     ' + (hasil.nama ?? []).join(' -> ').slice(0, 700));
console.log('\n--- laporan agent ---');
console.log('     ' + String(hasil.balasan ?? '').trim().slice(0, 800).replace(/\n/g, '\n     '));

await cdp.close();
R.selesai();
