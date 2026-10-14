/**
 * uji-tengah-run.mjs — mengukur empat hal pada SATU run nyata:
 *
 *   C  pesan yang diketik SEMENTARA agen bekerja (dulu: baru dibaca setelah
 *      run selesai = praktis tidak bisa mengoreksi run panjang)
 *   D  `.zephyr-context.md` dikelola APLIKASI (dulu: bergantung pada model
 *      ingat membuatnya di langkah pertama)
 *   A(i) daftar tool yang BENAR-BENAR dikirim ke provider menyusut per tugas
 *   A(iv) langkah pertama tugas berat = rencana dulu, bukan menulis
 *
 * Urutannya sengaja begitu: pesan tengah-run dikirim setelah langkah kedua
 * (yakni saat agen sudah mulai menulis berkas), dan isi pesannya meminta satu
 * berkas TAMBAHAN yang tidak ada di tugas asli. Jadi "pesan benar-benar sampai
 * ke model" dibuktikan oleh berkas yang muncul di disk - bukan oleh klaim agen.
 *
 *   node scripts/uji-tengah-run.mjs [port] [workspace]
 *   Env: MENIT=20 (batas run), N=6 (jumlah berkas awal)
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const WS = (process.argv[3] ?? 'D:/Testing/tengah-run').replace(/\\/g, '/');
const MENIT = Number(process.env.MENIT ?? 20);
const N = Number(process.env.N ?? 6);
const R = reporter('chat tengah run + konteks otomatis + subset alat (run nyata)');

fs.mkdirSync(WS, { recursive: true });
const berkasAwal = [];
for (let i = 1; i <= N; i++) berkasAwal.push(`catatan-${i}.md`);
const berkasTambahan = 'catatan-0.md';
/* Sisa dari run sebelumnya akan membuat "berkas ada" tidak membuktikan apa pun. */
for (const f of [...berkasAwal, berkasTambahan, '.zephyr-context.md']) {
  try { fs.unlinkSync(path.join(WS, f)); } catch { /* belum ada: memang begitu */ }
}

const { cdp } = await Cdp.attach(PORT, ['Zephyr', 'Zephyr — Code Editor', 'localhost']);

const awal = await cdp.json(`return JSON.stringify({ busy: window.__ZEPHYR_AI__.store.getState().agentBusy, alat: !!window.__ZEPHYR_AI__.alatTerakhir })`);
if (awal.busy) {
  console.log('     BERHENTI: agen masih sibuk sebelum uji dimulai.');
  await cdp.close();
  process.exit(2);
}
if (!awal.alat) {
  console.log('     BERHENTI: bridge alatTerakhir belum ada (app perlu di-reload).');
  await cdp.close();
  process.exit(2);
}

await cdp.json(`return JSON.stringify((() => { void window.__ZEPHYR__.getState().openWorkspace(${JSON.stringify(WS)}); return true; })())`);

const tugas =
  `Buat ${N} berkas catatan di folder ini: ${berkasAwal.join(', ')}. ` +
  'Tiap berkas minimal 12 baris: satu baris judul, satu baris tanggal, lalu 10 baris isi tentang satu topik wisata. ' +
  'Gunakan topik berbeda untuk tiap berkas (pantai, gunung, kuliner, budaya, transportasi, teknologi). ' +
  'Tulis semua berkas satu per satu sampai selesai, lalu tutup dengan ringkasan satu paragraf.';

const PESAN_TENGAH =
  `Tambahan dari gua: bikin juga berkas ${berkasTambahan} berisi satu baris teks "daftar isi". ` +
  'Sisa pekerjaan yang tadi tetap lanjut sampai kelar.';

const hasil = await cdp.json(
  `return JSON.stringify(await (async () => {
  const A = window.__ZEPHYR_AI__.store;
  if (A.getState().newChat) A.getState().newChat();
  if (A.getState().setAgentSteps) A.getState().setAgentSteps([]);
      if (A.getState().setAgentMode) A.getState().setAgentMode('agent');
  const t0 = Date.now();
  void A.getState().send(${JSON.stringify(tugas)});
  while (Date.now() - t0 < 15000 && !A.getState().agentBusy) await new Promise((r) => setTimeout(r, 50));

  const jejak = [];
  const alat = {};
  let terkirimTengah = null;
  let tKirimTengah = null;
  let tMunculTengah = null;
  let antrianSaatKirim = null;
  let antrianSesudah = null;
  let langkahTerakhir = -1;
  let macetSejak = Date.now();
  let selesai = false;

  const sesi = () => {
    const s = A.getState();
    const sn = s.activeSession ? s.activeSession() : null;
    return (sn && sn.messages) ? sn.messages : [];
  };

  while (Date.now() - t0 < ${MENIT} * 60000) {
    const s = A.getState();
    const steps = (s.agentSteps || []).filter((x) => x.kind === 'tool' || x.name);
    const nama = steps.map((x) => x.name);
    const todos = s.agentTodos || [];
    const baris = 'n=' + steps.length + ' tulis=' + nama.filter((n) => n === 'write_file' || n === 'edit').length
      + ' baca=' + nama.filter((n) => ['read_file','list_directory','glob','grep','search_files'].includes(n)).length
      + ' todo=' + todos.filter((t) => t.status === 'done').length + '/' + todos.length;
    if (jejak.length === 0 || jejak[jejak.length - 1].slice(5) !== baris) {
      jejak.push(Math.round((Date.now() - t0) / 1000) + 's ' + baris);
    }

    /* A(i)/A(iv): rekam daftar tool yang BENAR-BENAR dikirim, per langkah. */
    const at = window.__ZEPHYR_AI__.alatTerakhir ? window.__ZEPHYR_AI__.alatTerakhir() : null;
    if (at && at.langkah >= 0 && !alat[at.langkah]) {
      alat[at.langkah] = {
        gerbang: at.gerbang, berat: at.berat, n: at.alatDikirim.length,
        kirim: at.alatDikirim, buang: at.alatDibuang,
        writable: at.alatDikirim.includes('write_file') || at.alatDikirim.includes('edit'),
      };
    }

    if (terkirimTengah === null && steps.length >= 2) {
      antrianSaatKirim = (s.antrian || []).length;
      terkirimTengah = A.getState().send(${JSON.stringify(PESAN_TENGAH)});
      tKirimTengah = Date.now();
    }
    if (terkirimTengah !== null && tMunculTengah === null) {
      const ms = sesi();
      if (ms.some((m) => m.role === 'user' && String(m.content || '').includes(${JSON.stringify(berkasTambahan)}))) {
        tMunculTengah = Date.now();
        antrianSesudah = (A.getState().antrian || []).length;
      }
    }

    if (nama.length !== langkahTerakhir) { langkahTerakhir = nama.length; macetSejak = Date.now(); }
    if (!s.agentBusy) {
      selesai = true;
      const ms = sesi();
      const last = ms[ms.length - 1] || null;
      return {
        ok: true, ms: Date.now() - t0, langkah: steps.length, nama, alat, jejak,
        gagal: steps.filter((x) => x.ok === false || x.error).map((x) => x.name),
        todoTotal: todos.length, todoDone: todos.filter((t) => t.status === 'done').length,
        balasan: last ? String(last.content || '').slice(0, 1200) : '',
        error: last ? (last.error || null) : null,
        tKirimTengah, tMunculTengah, antrianSaatKirim, antrianSesudah,
        stopReason: s.agentStopReason ?? null,
        adaPesanTengahDiSesi: ms.some((m) => m.role === 'user' && String(m.content || '').includes(${JSON.stringify(berkasTambahan)})),
      };
    }
    if (Date.now() - macetSejak > 240000) {
      return { ok: false, macet: true, ms: Date.now() - t0, langkah: steps.length, nama, alat, jejak,
               todoTotal: todos.length, antrianSaatKirim, antrianSesudah, tKirimTengah, tMunculTengah };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, timeout: true, ms: Date.now() - t0, alat, jejak, tKirimTengah, tMunculTengah, antrianSaatKirim, antrianSesudah };
})())`,
  MENIT * 60000 + 60000,
);

console.log('\n--- jejak ---');
for (const j of hasil.jejak ?? []) console.log('  ' + j);

/* ── C ─────────────────────────────────────────────────────────────── */
const jedaMuncul = hasil.tMunculTengah && hasil.tKirimTengah ? Math.round((hasil.tMunculTengah - hasil.tKirimTengah) / 1000) : null;
R.check('T1', hasil.tMunculTengah !== null, `pesan tengah-run MUNCUL di transkrip (${jedaMuncul === null ? 'tidak pernah' : jedaMuncul + 's setelah dikirim'})`);
R.check('T2', hasil.antrianSaatKirim !== null && hasil.antrianSesudah === 0,
  `antrian dikosongkan setelah disisipkan (saat kirim=${hasil.antrianSaatKirim}, sesudah=${hasil.antrianSesudah})`);
const berkas0 = fs.existsSync(path.join(WS, berkasTambahan));
R.check('T3', berkas0, `${berkasTambahan} DITULIS -> pesan tengah-run benar-benar sampai ke model (bukan cuma muncul di layar)`);

/* ── run tetap sehat ───────────────────────────────────────────────── */
const ada = berkasAwal.filter((f) => fs.existsSync(path.join(WS, f)));
R.check('T4', hasil.ok === true && ada.length === N,
  `run lanjut sampai kelar (${hasil.ok ? 'selesai sendiri' : hasil.macet ? 'MACET' : 'TIMEOUT'} dalam ${Math.round(hasil.ms / 1000)}s); berkas awal ${ada.length}/${N} di disk`);
R.check('T5', !hasil.error, `tidak ada error provider (${hasil.error ?? 'bersih'})`);

/* ── D ─────────────────────────────────────────────────────────────── */
const jalurKonteks = path.join(WS, '.zephyr-context.md');
const isiKonteks = fs.existsSync(jalurKonteks) ? fs.readFileSync(jalurKonteks, 'utf8') : '';
R.check('T6', isiKonteks.length > 0, `.zephyr-context.md dibuat APLIKASI (${isiKonteks.length} char)`);
R.check('T7', isiKonteks.includes('## Berkas dibuat / diubah') && (isiKonteks.includes(berkasTambahan) || isiKonteks.includes(berkasAwal[0])),
  `daftar berkas tercatat di konteks (${(isiKonteks.match(/^- `[^`]+`$/gm) || []).length} baris berkas)`);
R.check('T8', /## Hasil run[\s\S]*Status: selesai/.test(isiKonteks),
  `hasil run ditulis di jalur keluar (${(isiKonteks.match(/Status: ([^\n]+)/) ?? ['-', '-'])[1] ?? '-'})`);

/* ── A(i) / A(iv) pada run nyata ───────────────────────────────────── */
const langkah = Object.keys(hasil.alat ?? {}).map(Number).sort((a, b) => a - b);
const l0 = hasil.alat?.[0] ?? null;
const buangWeb = langkah.map((k) => hasil.alat[k].buang.filter((n) => n.startsWith('browser_') || n === 'fetch').length);
R.check('T9', l0 && l0.gerbang === true && !l0.writable,
  `A(iv) langkah-1: gerbang menyala & TIDAK ada tool tulis (gerbang=${l0?.gerbang}, tool=${l0?.n}, writable=${l0?.writable})`);
const l1 = hasil.alat?.[1] ?? null;
R.check('T10', !l1 || (l1.writable && !l1.gerbang),
  `langkah-2 kembali normal (tool=${l1?.n}, writable=${l1?.writable}, gerbang=${l1?.gerbang})`);
R.check('T11', buangWeb.every((x) => x > 0),
  `A(i) tool web dibuang di SETIAP langkah (${buangWeb.length} langkah direkam, min-buang=${Math.min(...buangWeb)})`);
R.check('T12', (hasil.todoTotal ?? 0) >= 1 && hasil.todoDone === hasil.todoTotal,
  `rencana dipakai & tuntas: ${hasil.todoDone}/${hasil.todoTotal} todo dalam ${hasil.langkah} langkah`);

console.log('\n--- langkah yang dipakai (urut) ---');
console.log('     ' + (hasil.nama ?? []).join(' -> ').slice(0, 900));
console.log('\n--- laporan agent ---');
console.log('     ' + String(hasil.balasan ?? '').trim().slice(0, 900).replace(/\n/g, '\n     '));

await cdp.close();
R.selesai();
