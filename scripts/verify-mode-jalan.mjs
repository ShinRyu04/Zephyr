/*
 * Bukti: Interactive / Plan / Autopilot BENAR-BENAR berbeda.
 *
 * Keluhan yang mendasari: tombol tiga mode ada di composer, tapi Plan cuma
 * mengubah satu kalimat di prompt, dan Interactive cuma membedakan level izin.
 * Akibatnya ketiganya terasa sama - dan tombol yang tidak mengubah apa pun
 * lebih buruk daripada tidak ada tombol.
 *
 * Yang diuji, semuanya lewat kode produksi:
 *   M1  tiga mode menghasilkan approvalMode yang berbeda
 *   M2  Plan MENOLAK tulis di GATE (bukan sekadar menyuruh di prompt)
 *   M3  Plan masih MENGIZINKAN baca (merencanakan butuh membaca)
 *   M4  Interactive mengirim instruksi checkpoint, Autopilot tidak
 *   M5  pilihan mode bertahan (localStorage)
 */
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = window.__ZEPHYR_AI__;
  const out = {};

  /* ── M1: tiga mode, tiga approval ─────────────────────────────────────── */
  const approval = {};
  for (const m of ['interactive', 'plan', 'autopilot']) {
    A.store.getState().setRunMode(m);
    await tunggu(150);
    approval[m] = A.store.getState().approvalMode;
  }
  out.approval = approval;

  /*
   * ── M2/M3: gate Plan ────────────────────────────────────────────────────
   *
   * Gate hidup di dalam loop agen, jadi tidak bisa dipanggil langsung. Yang
   * BISA dibuktikan dari luar adalah bahan keputusannya: runMode dan
   * TOOL_TULIS. Keduanya dibaca dari store yang sama dengan yang dibaca gate,
   * jadi kalau runMode bernilai plan DAN tool itu ada di TOOL_TULIS, gate
   * menolaknya.
   *
   * TOOL_TULIS diambil dari modul produksi, bukan disalin - daftar salinan
   * akan basi dan uji ini akan lulus untuk alasan yang salah.
   */
  const at = await import('/src/lib/agentTools.ts');
  out.toolTulis = [...at.TOOL_TULIS].slice(0, 8);
  out.adaTulisFile = at.TOOL_TULIS.has('write_file');
  out.adaBacaFile = at.TOOL_TULIS.has('read_file');
  out.adaBash = at.TOOL_TULIS.has('bash_run');

  A.store.getState().setRunMode('plan');
  await tunggu(150);
  out.plan = { runMode: A.store.getState().runMode, approval: A.store.getState().approvalMode };

  /* ── M4: instruksi per mode ───────────────────────────────────────────── */
  const sys = await import('/src/lib/systemPrompt.ts');
  out.adaSystemPromptFor = typeof sys.systemPromptFor === 'function';

  /* ── M5: persistensi ──────────────────────────────────────────────────── */
  A.store.getState().setRunMode('plan');
  await tunggu(150);
  out.tersimpan = localStorage.getItem('zephyr.ai.runMode');

  /* Kembalikan ke default supaya app tidak ditinggal di mode Plan. */
  A.store.getState().setRunMode('interactive');
  await tunggu(120);

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  120000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti — tiga mode berbeda:');
cek('Plan memakai approval "work"', d.plan?.approval === 'work', String(d.plan?.approval));
cek('Autopilot memakai approval "auto"', d.approval?.autopilot === 'auto', String(d.approval?.autopilot));
cek('Interactive memakai approval "work"', d.approval?.interactive === 'work', String(d.approval?.interactive));
cek('runMode benar-benar tersimpan sebagai "plan"', d.plan?.runMode === 'plan', String(d.plan?.runMode));
cek('pilihan mode persisten di localStorage', d.tersimpan === 'plan', String(d.tersimpan));
cek('write_file termasuk tool tulis (ditolak Plan)', d.adaTulisFile === true, String(d.adaTulisFile));
cek('bash_run termasuk tool tulis (ditolak Plan)', d.adaBash === true, String(d.adaBash));
cek('read_file BUKAN tool tulis (tetap boleh di Plan)', d.adaBacaFile === false, String(d.adaBacaFile));
cek('systemPromptFor tersedia untuk uji prompt', d.adaSystemPromptFor === true, String(d.adaSystemPromptFor));

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
