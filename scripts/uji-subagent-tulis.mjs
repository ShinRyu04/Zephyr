// uji-subagent-tulis.mjs — BUKTI subagent Zephyr BENAR-BENAR BEKERJA (menulis
// berkas), bukan cuma membaca.
//
// Latar: dulu tulis disk subagent ditahan sampai mode persetujuan `auto`
// walau sakelar "Let sub-agents write" (Chat Settings → Sub-agents) sudah
// menyala — user yang menyalakan sakelarnya tetap melihat subagentnya cuma
// membaca. 2026-10-13 gerbangnya dipindah: `allowWrite` KINI gerbang untuk
// SEMUA tulis berkas. Uji ini membuktikan keadaannya lewat jalur NYATA
// (store → gerbang → loop subagent → tool → disk), bukan lewat membaca kode:
//
//   1. setelan IZIN MATI  → gerbang menolak ('setelan-mati'), subagent tidak
//      pernah sampai menulis, berkas TIDAK dibuat, catatanTulis menyatakan
//      "WRITE PERMISSION: OFF"
//   2. setelan IZIN NYALA → gerbang mengizinkan WALAUPUN mode persetujuan
//      BUKAN auto, subagent punya langkah tool write_file yang berhasil, dan
//      berkas BENAR-BENAR ada di disk dengan isi yang dikirim tool
//   3. shell berbahaya (hapus/timpa) tetap butuh mode `auto` — gerbang kedua
//      yang sengaja TIDAK dibuka (bukan baca; itu batas keamanan)
//
// Dipakai: mock AI 8098 (tidak menghabiskan kuota API nyata). Seluruh jalur
// lain tetap nyata: store → adapter Rust → HTTP → stream balik → langkah
// tercatat → isi berkas di disk.
import { Cdp } from './lib-cdp.mjs';

const AKAR_TULIS = 'D:/Zephyr/scratch-subagent-tulis';
const BERKAS_UTAMA = `${AKAR_TULIS}/subagent-benar-menulis.txt`;
const BERKAS_KONTROL = `${AKAR_TULIS}/kontrol-tidak-boleh.txt`;
const ISI = 'ZEPHYR-SUBAGENT-TULIS-OK';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  if (ok) { lulus++; console.log(`  LULUS  ${n}${info ? '  ' + info : ''}`); }
  else { gagal++; console.log(`  GAGAL  ${n}${info ? '  ' + info : ''}`); }
};

console.log('=== Subagent: BENAR-BENAR MENULIS (bukan baca) ===\n');

// ── 0. Mock provider hidup? ──
try {
  const v = await fetch('http://127.0.0.1:8098/__version').then((r) => r.json());
  console.log(`  mock provider: versi ${v.version}`);
} catch {
  console.log('  mock provider MATI — jalankan: node scripts/mock-ai.mjs 8098');
  process.exit(1);
}

// ── 1. Siapkan provider -> mock + key; simpan keadaan asli ──
const siap = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const T = window.__TAURI_INTERNALS__;
  // Keadaan asli untuk dipulihkan di akhir (jangan merusak setelan user).
  const AI = window.__ZEPHYR_AI__.store.getState();
  const asli = {
    allowWrite: S.getState().settings.subagent?.allowWrite === true,
    approval: AI.approvalMode,
    modelnya: AI.model,
    workspace: S.getState().workspace ?? null,
  };
  window.__UJI_ASLI__ = asli;

  /*
   * Tool tulis Zephyr menolak jalur di LUAR workspace ("path outside the
   * workspace"), jadi uji tanpa workspace terbuka akan selalu berakhir
   * "tidak menulis" - dan pembaca laporan tidak bisa membedakan itu dari
   * gerbang izin yang masih mati. Sesi kerja nyata punya folder terbuka, jadi
   * harness membukanya sendiri (dan menutupnya lagi di akhir kalau tadinya
   * memang tidak ada).
   */
  if (!S.getState().workspace) {
    await S.getState().openWorkspace('D:/Zephyr');
    await new Promise((r) => setTimeout(r, 2500));
  }

  await T.invoke('set_model_key', { provider: 'gemini', key: 'MOCK-KEY-1234' });
  await new Promise((r) => setTimeout(r, 700));
  await S.getState().applySettings({
    models: { providers: { gemini: { baseUrl: 'http://127.0.0.1:8098' } } },
  });
  await new Promise((r) => setTimeout(r, 700));
  await AI.loadKeys();
  await new Promise((r) => setTimeout(r, 500));
  await AI.setModel('gemini-3.8-flash');
  return { ok: true };
})())`, 90000);
cek('provider diarahkan ke mock + key diset', siap.ok === true);

// ── 2. IZIN MATI: gerbang menolak + subagent tidak menulis ──
const mati = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const SUB = window.__ZEPHYR_PARALEL__;
  const AI = window.__ZEPHYR_AI__.store.getState();
  const BS = window.__ZEPHYR_SUBSET__;

  // Mode persetujuan sengaja BUKAN auto — bukti bahwa izin tulis tidak lagi
  // bergantung pada mode persetujuan.
  AI.setApprovalMode('work');
  await S.getState().applySettings({ subagent: { allowWrite: false } });
  await new Promise((r) => setTimeout(r, 500));

  const g1 = BS.putusanTulis('write_file');
  const g2 = BS.putusanTulis('bash_run', true);
  const efektif = BS.efektif();

  // Run kontrol: mock akan meminta write_file, tetapi subagent tidak boleh
  // sampai menulis (file tujuan berbeda dari run utama; keberadaan berkas
  // diperiksa dari sisi Node setelah ini).
  const st = SUB.store.getState();
  st.bersihkan();
  await new Promise((r) => setTimeout(r, 300));
  const n = await st.jalankan([
    'TOOLCALL:write_file WRITEPATH:${BERKAS_KONTROL} - tulis berkas itu lalu laporkan isinya.',
  ]);
  const akhir = SUB.store.getState();
  return {
    n,
    g1, g2,
    bisa: efektif.bisaTulisDisk,
    persetujuanAuto: efektif.persetujuanAuto,
    status: akhir.agents.map((a) => a.status),
    steps: akhir.agents.flatMap((a) =>
      a.langkah.filter((l) => l.kind === 'tool').map((l) => ({ nama: l.nama, ok: l.ok }))),
    ditolak: akhir.agents.reduce((t, a) => t + (a.tulisDitolak ?? 0), 0),
    catatan: BS.catatanTulis(akhir.agents),
  };
})())`, 240000);

cek('2a. gerbang menolak saat izin mati', mati.g1?.boleh === false,
  `alasan=${mati.g1?.alasan}`);
cek('2b. alasan = setelan-mati (bukan mode persetujuan)', mati.g1?.alasan === 'setelan-mati');
cek('2c. shell berbahaya tetap butuh persetujuan', mati.g2?.boleh === false,
  `alasan=${mati.g2?.alasan}`);
cek('2d. kemampuan tulis dilaporkan MATI', mati.bisa === false,
  `persetujuanAuto=${mati.persetujuanAuto}`);
cek('2e. mode persetujuan BUKAN auto saat ini', mati.persetujuanAuto === false);
cek('2f. percobaan tulis kontrol DITOLAK (bukan diam-diam jalan)',
  (mati.steps || []).some((s) => s.nama === 'write_file' && s.ok === false),
  JSON.stringify((mati.steps || []).filter((s) => s.nama === 'write_file')).slice(0, 140));
cek('2f2. percobaan tulis kontrol tidak pernah sukses',
  (mati.steps || []).some((s) => s.nama === 'write_file' && s.ok === true) === false);
cek('2g. catatanTulis menyatakan WRITE PERMISSION: OFF',
  (mati.catatan || '').includes('WRITE PERMISSION: OFF'));
console.log(`    (catatan: ${(mati.catatan || '').slice(0, 160).replace(/\n/g, ' | ')})`);

import { existsSync, readFileSync, rmSync } from 'node:fs';
cek('2h. berkas kontrol TIDAK dibuat', !existsSync(BERKAS_KONTROL));

// ── 3. IZIN NYALA: gerbang mengizinkan walau bukan auto + subagent MENULIS ──
const nyala = await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const SUB = window.__ZEPHYR_PARALEL__;
  const AI = window.__ZEPHYR_AI__.store.getState();
  const BS = window.__ZEPHYR_SUBSET__;

  // Masih BUKAN auto — bukti sakelar saja yang membuka tulis disk.
  if (AI.approvalMode === 'auto') AI.setApprovalMode('work');
  await S.getState().applySettings({ subagent: { allowWrite: true } });
  await new Promise((r) => setTimeout(r, 500));

  const g1 = BS.putusanTulis('write_file');
  const g2 = BS.putusanTulis('bash_run', true);
  const efektif = BS.efektif();

  const st = SUB.store.getState();
  st.bersihkan();
  await new Promise((r) => setTimeout(r, 300));
  const n = await st.jalankan([
    'TOOLCALL:write_file WRITEPATH:${BERKAS_UTAMA} - tulis berkas itu lalu laporkan isinya.',
  ]);
  const akhir = SUB.store.getState();
  return {
    n,
    g1, g2,
    bisa: efektif.bisaTulisDisk,
    persetujuanAuto: efektif.persetujuanAuto,
    status: akhir.agents.map((a) => a.status),
    steps: akhir.agents.flatMap((a) =>
      a.langkah.filter((l) => l.kind === 'tool').map((l) => ({ nama: l.nama, ok: l.ok, hasil: (l.hasil || '').slice(0, 60) }))),
    ditolak: akhir.agents.reduce((t, a) => t + (a.tulisDitolak ?? 0), 0),
    fileDitulis: akhir.agents.flatMap((a) => a.fileDitulis ?? []),
    catatan: BS.catatanTulis(akhir.agents),
  };
})())`, 240000);

cek('3a. gerbang mengizinkan saat izin nyala', nyala.g1?.boleh === true,
  `alasan=${nyala.g1?.alasan}`);
cek('3b. MASIH mode persetujuan non-auto', nyala.persetujuanAuto === false,
  'sakelar saja yang membuka tulis disk');
cek('3c. kemampuan tulis dilaporkan NYALA', nyala.bisa === true);
cek('3d. run utama selesai', (nyala.status || []).every((s) => s === 'selesai'),
  (nyala.status || []).join(','));
cek('3e. ada langkah tool write_file yang BERHASIL',
  (nyala.steps || []).some((s) => s.nama === 'write_file' && s.ok === true));
cek('3f. fileDitulis tercatat', (nyala.fileDitulis || []).length > 0, JSON.stringify(nyala.fileDitulis).slice(0, 120));
cek('3g. catatanTulis menyatakan WRITE PERMISSION: ON',
  (nyala.catatan || '').includes('WRITE PERMISSION: ON'));

cek('3h. BERKAS BENAR-BENAR ADA DI DISK', existsSync(BERKAS_UTAMA));
let isi = '';
if (existsSync(BERKAS_UTAMA)) isi = readFileSync(BERKAS_UTAMA, 'utf8');
cek('3i. isi berkas = yang dikirim tool', isi.includes('ZEPHYR-SUBAGENT-TULIS-OK'), `isi=${isi.slice(0, 40).replace(/\n/g, '\\n')}`);
console.log(`    (catatan: ${(nyala.catatan || '').slice(0, 160).replace(/\n/g, ' | ')})`);
console.log(`    (langkah tool: ${JSON.stringify(nyala.steps).slice(0, 220)})`);

// ── 4. Bersihkan + pulihkan keadaan asli ──
await cdp.json(`return JSON.stringify(await (async () => {
  const S = window.__ZEPHYR__;
  const SUB = window.__ZEPHYR_PARALEL__;
  const AI = window.__ZEPHYR_AI__.store.getState();
  const asli = window.__UJI_ASLI__;
  await S.getState().applySettings({ subagent: { allowWrite: asli.allowWrite } });
  if (AI.approvalMode !== asli.approval) AI.setApprovalMode(asli.approval);
  SUB.store.getState().bersihkan();
  // Workspace hanya ditutup kalau memang tadinya tidak ada: jangan menutup
  // folder yang sedang dibuka user.
  if (!asli.workspace && S.getState().workspace) {
    await S.getState().closeWorkspace();
    await new Promise((r) => setTimeout(r, 800));
  }
  return 1;
})())`, 60000);
try { rmSync(BERKAS_UTAMA, { force: true }); rmSync(BERKAS_KONTROL, { force: true }); } catch { /* abaikan */ }

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);